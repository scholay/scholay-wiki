// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"time"
)

// ConfigService interface for email, SMS, and OAuth configuration
type ConfigService interface {
	GetActiveEmailConfig() (*model.EmailConfig, error)
	GetActiveSMSConfig() (*model.SMSConfig, error)
	GetSystemConfig() (*model.SystemConfig, error)
	GetGithubOAuthConfig() (*model.GithubOAuthConfig, error)
	GetGoogleOAuthConfig() (*model.GoogleOAuthConfig, error)
	GetOrcidOAuthConfig() (*model.OrcidOAuthConfig, error)
	GetMicrosoftOAuthConfig() (*model.MicrosoftOAuthConfig, error)
	GetAppleOAuthConfig() (*model.AppleOAuthConfig, error)
	GetDiscourseSSOConfig() (*model.DiscourseSSOConfig, error)
}

// MessageService interface for sending in-app messages
type MessageService interface {
	SendToUser(userID uint, title, content string, category string, linkURL, linkText string) error
}

// 哨兵错误,用于 handler 层的错误类型判断,避免字符串比较。
//
// 约定 (跟 backend/CONVENTIONS.md 一致):
//   - service 方法不应该直接返回 gorm.ErrRecordNotFound, 应该 wrap 成 ErrNotFound 之类的 sentinel
//   - handler 用 `errors.Is(err, user.ErrNotFound)` 做分支, 不用字符串比较
//   - 新增 sentinel 时加在这里, 不要每个 service 文件各自定义
//
// 注意 (历史遗留, 不强制立刻修):
//   - 部分 OAuth helpers 直接用 `errors.Is(err, gorm.ErrRecordNotFound)` 判断 not-found,
//     符合"service 内部 OK, 别让 gorm 泄漏到 handler" 原则; 改成 ErrNotFound 不属于必须。
var (
	ErrSessionExpired         = errors.New("登录已过期,请重新登录")
	ErrSessionNotFound        = errors.New("会话不存在,请重新登录")
	ErrCurrentPasswordInvalid = errors.New("当前密码不正确")
	// ErrNotFound 用户/会话/OAuth 关联等通用 "not found" 兜底.
	// 新代码 wrap gorm.ErrRecordNotFound 时用这个: `return user.ErrNotFound` 而不是裸传 gorm 错。
	ErrNotFound = errors.New("user: resource not found")
)

// Service handles business logic for user operations
type Service struct {
	repo           *Repository
	configService  ConfigService
	messageService MessageService
}

// NewService creates a new user service
func NewService(repo *Repository) *Service {
	return &Service{
		repo:          repo,
		configService: nil, // 通过 SetConfigService 注入
	}
}

// SetConfigService sets the config service (for dependency injection)
func (s *Service) SetConfigService(configService ConfigService) {
	s.configService = configService
}

// SetMessageService sets the message service (for dependency injection)
func (s *Service) SetMessageService(messageService MessageService) {
	s.messageService = messageService
}

// GetSystemConfig gets the system configuration
func (s *Service) GetSystemConfig() (*model.SystemConfig, error) {
	if s.configService == nil {
		return nil, fmt.Errorf("config service not initialized")
	}
	return s.configService.GetSystemConfig()
}

// FindAuthProviderByUserAndProvider finds an auth provider record for a user
func (s *Service) FindAuthProviderByUserAndProvider(userID uint, provider string) (*UserAuthProvider, error) {
	return s.repo.FindAuthProviderByUserAndProvider(userID, provider)
}

// CheckEmailExists checks if an email is already registered
func (s *Service) CheckEmailExists(email string) (bool, error) {
	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return false, err
	}
	return user != nil, nil
}

// generateRandomUsername generates a random username in format "user_XXXXXX"
func (s *Service) generateRandomUsername() (string, error) {
	maxAttempts := 10
	for i := 0; i < maxAttempts; i++ {
		// Generate random 6-digit number
		randomNum := utils.SecureRandomIntn(1000000)
		username := fmt.Sprintf("user_%06d", randomNum)

		// Check if username already exists
		existing, err := s.repo.FindByUsername(username)
		if err != nil {
			return "", err
		}

		if existing == nil {
			return username, nil
		}
	}

	// If all attempts failed, use timestamp + random
	timestamp := time.Now().Unix()
	randomSuffix := utils.SecureRandomIntn(10000)
	return fmt.Sprintf("user_%d_%04d", timestamp, randomSuffix), nil
}

func (s *Service) getUserRole(user *User) string {
	if user != nil && user.Role != "" {
		return user.Role
	}
	return "user"
}

func (s *Service) generateTokenForUser(user *User, username string) (string, error) {
	return utils.GenerateTokenWithRole(user.ID, username, "user", s.getUserRole(user))
}

// ==================== Repository delegation methods (for Handler use) ====================

func (s *Service) FindByID(id uint) (*User, error) {
	return s.repo.FindByID(id)
}

func (s *Service) FindByEmail(email string) (*User, error) {
	return s.repo.FindByEmail(email)
}

func (s *Service) FindByUsername(username string) (*User, error) {
	return s.repo.FindByUsername(username)
}

func (s *Service) FindAuthProvider(provider, providerUserID string) (*UserAuthProvider, error) {
	return s.repo.FindAuthProvider(provider, providerUserID)
}

func (s *Service) CreateUser(user *User) error {
	return s.repo.Create(user)
}

func (s *Service) UpdateUser(user *User) error {
	return s.repo.Update(user)
}

func (s *Service) CreateAuthProvider(provider *UserAuthProvider) error {
	return s.repo.CreateAuthProvider(provider)
}

func (s *Service) UpdateAuthProvider(provider *UserAuthProvider) error {
	return s.repo.UpdateAuthProvider(provider)
}

func (s *Service) UpdateLastLoginWithIP(id uint, ip string) error {
	return s.repo.UpdateLastLoginWithIP(id, ip)
}

// RecordActivity 记一次由前端「可信真人交互」触发的用户活跃。
// 它只由 POST /user/activity 显式调用,不再挂到通用鉴权中间件;轮询、WS ticket、
// 缓存刷新等页面自动流量因此不会伪造「最后活跃」。整条写入同步完成,失败返回
// 给 handler,让客户端后续真实交互可重试。
//
// 两个数据源使用同一个服务端 eventAt:
//  1. users.last_active_at 在 SQL 中原子限制为约每分钟最多一写,不使用 Redis
//     SETNX,所以不会把 5 分钟窗口内后续真人事件全部吞掉;
//  2. user_daily_active 每人每本地日一行。Redis 只缓存「DB 已成功」的确认结果;
//     Redis 故障时直接降级到 DB 幂等写。不在 DB 前抢 key,避免并发请求看到
//     pre-claim 后提前返回、而真正写 DB 的请求随后失败所造成的整日漏记。
func (s *Service) RecordActivity(ctx context.Context, userID uint) error {
	if userID == 0 {
		return errors.New("user: record activity requires an authenticated user")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	eventAt := time.Now()
	var recordErr error
	if err := s.repo.UpdateLastActive(ctx, userID, eventAt); err != nil {
		recordErr = fmt.Errorf("update last_active_at: %w", err)
	}

	today := eventAt.Format("2006-01-02")
	// v2 是「DB 成功后才写」的 confirmed key;不复用旧 user:dau:* pre-claim key,
	// 否则发布当天的旧键会让新逻辑误以为 DB 已落行。
	dauKey := fmt.Sprintf("user:dau:v2:confirmed:%d:%s", userID, today)
	writeDaily := true
	rdb := cache.GetRedis()
	if rdb != nil {
		confirmed, err := rdb.Exists(ctx, dauKey).Result()
		if err != nil {
			// Redis 只是避免重复空写的优化;故障时必须 fail-open 到 DB。
			slog.Debug("user: activity daily cache unavailable, falling back to database", "user_id", userID, "err", err)
		} else if confirmed > 0 {
			writeDaily = false
		}
	}

	if writeDaily {
		if err := s.repo.RecordDailyActive(ctx, userID, today); err != nil {
			recordErr = errors.Join(recordErr, fmt.Errorf("record daily activity: %w", err))
		} else if rdb != nil {
			// 只有 DB 成功后才发布 confirmed key。并发首批可能多做几次 INSERT IGNORE,
			// 但不会因某个抢锁者失败而让其他请求错误跳过 DB。写缓存失败不影响真值。
			if err := rdb.Set(ctx, dauKey, "1", 26*time.Hour).Err(); err != nil {
				slog.Debug("user: failed to cache confirmed daily activity", "user_id", userID, "err", err)
			}
		}
	}

	return recordErr
}

func (s *Service) GetGithubOAuthConfig() (*model.GithubOAuthConfig, error) {
	if s.configService == nil {
		return nil, fmt.Errorf("config service not initialized")
	}
	return s.configService.GetGithubOAuthConfig()
}

func (s *Service) GetDiscourseSSOConfig() (*model.DiscourseSSOConfig, error) {
	if s.configService == nil {
		return nil, fmt.Errorf("config service not initialized")
	}
	return s.configService.GetDiscourseSSOConfig()
}
