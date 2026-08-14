// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 共享 OAuth/SSO 辅助函数：6 个 provider（github/google/orcid/microsoft/apple/
// discourse）原本各自重复了 state 生成与校验、JWT 签发、session 创建、成功响应
// 等模板代码。集中在此文件，provider 文件只保留自身业务差异。

package user

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/upstream"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// oauthStateTTL OAuth state / nonce 在 Redis 中的生存期。
const oauthStateTTL = 5 * time.Minute

type oauthStateRecord struct {
	// InviteCode 只是候选码；是否有效由 invite 域在新用户创建后统一校验。
	InviteCode string `json:"invite_code,omitempty"`
}

func encodeOAuthStatePayload(ctx context.Context) string {
	code := strings.ToUpper(strings.TrimSpace(middleware.InviteCodeFromContext(ctx)))
	if code == "" {
		return "1"
	}
	raw, err := json.Marshal(oauthStateRecord{InviteCode: code})
	if err != nil {
		return "1"
	}
	return string(raw)
}

func restoreOAuthStatePayload(ctx context.Context, payload string) (context.Context, bool) {
	if payload == "1" { // 旧版已签发的 state，无邀请候选码。
		return ctx, true
	}
	var record oauthStateRecord
	if err := json.Unmarshal([]byte(payload), &record); err != nil {
		return ctx, false
	}
	if record.InviteCode != "" {
		ctx = middleware.ContextWithInviteCode(ctx, record.InviteCode)
	}
	return ctx, true
}

// newOAuthUpstream 给各 OAuth provider 构造统一的 upstream 客户端:
// 共用 httpclient.OAuthClient 连接池 + 每 provider 独立 breaker + 结构化观测。
//
// 关键: 不开 retry (零值 RetryConfig = 单次尝试)。OAuth authorization code 是
// 一次性的, 自动重试可能撞上"code 已被消费" → 反而更难排查; 保持与迁移前
// 单次请求的行为完全一致, 只额外获得 breaker / typed error / slog 观测。
func newOAuthUpstream(name string) *upstream.Client {
	return upstream.New(name).
		HTTPClient(httpclient.OAuthClient).
		Breaker(upstream.BreakerConfig{}).
		MustBuild()
}

// issueOAuthState 生成随机 state，写入 Redis（如可用）并返回。
// prefix 区分不同 provider，例如 "oauth_state:", "orcid_oauth_state:"。
// Redis 不可用时不写入但仍返回 state（调用方应决定是否强制校验）。
func issueOAuthState(c *gin.Context, prefix string) string {
	state := utils.GenerateRandomString(32)
	if rdb := cache.GetRedis(); rdb != nil {
		rdb.Set(c.Request.Context(), prefix+state, encodeOAuthStatePayload(c.Request.Context()), oauthStateTTL)
	}
	return state
}

// validateOAuthState 校验 state 合法性并从 Redis 删除（一次性使用）。
// state 为空时表示 provider 未下发 state（如某些 mobile app callback），跳过校验。
// Redis 不可用时也跳过校验，以避免把运维故障转嫁给用户。
// 返回 true 表示合法，false 表示非法（应拒绝请求）。
func validateOAuthState(c *gin.Context, prefix, state string) bool {
	if state == "" {
		return true
	}
	rdb := cache.GetRedis()
	if rdb == nil {
		return true
	}
	key := prefix + state
	// GETDEL 原子消费，阻止两个并发 callback 都通过同一 state。
	val, err := rdb.GetDel(c.Request.Context(), key).Result()
	if err != nil {
		return false
	}
	restored, ok := restoreOAuthStatePayload(c.Request.Context(), val)
	if !ok {
		return false
	}
	c.Request = c.Request.WithContext(restored)
	return true
}

// issueTokenAndSession 签发 JWT、刷新最后登录时间和 IP、创建 session。
// 任意一步失败均以 token 错误返回。成功时返回 JWT。
// session / last-login 更新失败仅记录，不阻断登录流程（保持与历史行为一致）。
func issueTokenAndSession(h *Handler, c *gin.Context, user *User, ip string) (string, error) {
	username := ""
	if user.Username != nil {
		username = *user.Username
	}
	role := "user"
	if user.Role != "" {
		role = user.Role
	}
	token, err := utils.GenerateTokenWithRole(user.ID, username, "user", role)
	if err != nil {
		return "", err
	}
	_ = h.service.UpdateLastLoginWithIP(user.ID, ip)
	return token, nil
}

// respondOAuthSuccess 统一 OAuth 登录成功响应格式。
func respondOAuthSuccess(c *gin.Context, token string, user *User, isNewUser bool) {
	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"token":       token,
		"user":        user,
		"is_new_user": isNewUser,
	})
}

// respondOAuthPendingMerge OAuth 回调发现 email 冲突 时的响应格式 ——
// 不签发 token,而是把 merge_token + 待合并目标摘要返给前端,引导用户确认。
//
// 前端拿到 requires_merge=true 后:
//  1. 拉 /user/oauth/pending-merge?token=xxx 拿完整摘要(provider 头像/昵称)
//  2. 展示「将 GitHub 账号绑定到 alice@example.com 的现有账户?」对话框
//  3. 用户「确认」→ POST /user/oauth/confirm-merge {token} → 拿到 JWT 登入
//     用户「新建独立账号」→ POST /user/oauth/cancel-merge {token} → 拿到 JWT 登入新号
func respondOAuthPendingMerge(c *gin.Context, mergeToken, provider, targetEmail string) {
	utils.SuccessResponse(c, http.StatusOK, "merge_required", gin.H{
		"requires_merge": true,
		"merge_token":    mergeToken,
		"provider":       provider,
		"target_email":   targetEmail,
	})
}

// oauthOutcome 是 findOrCreate<Provider>User 的统一返回:
//   - User != nil: 直接登录已存在用户,或新建用户成功 —— callback 调 issueTokenAndSession
//   - MergeToken != "": email 冲突,需要前端二选一 —— callback 调 respondOAuthPendingMerge
//   - 不可能两者同时 != nil/""
type oauthOutcome struct {
	User       *User
	IsNewUser  bool
	MergeToken string
}

// oauthIdentity 描述一次 OAuth 回调里第三方平台给我们的「身份信息」。
// 各 provider 的字段映射不同(GitHub:Login/Name/AvatarURL/Bio;Google:Sub/Name/Picture
// /EmailVerified;Apple:Subject/FirstName/LastName/EmailVerified;Microsoft:ID/DisplayName/Mail
// /UserPrincipalName;Discourse:ExternalID/Username/Name/AvatarURL),但
// findOrCreateOAuthUser 之后的流程完全一致 —— 我们把差异收敛到 caller 端的
// 字段提取,统一流程下沉到 helper。
type oauthIdentity struct {
	Provider           string // 与 user_auth_providers.provider 列对应,如 "github"
	ProviderUserID     string // 第三方平台唯一标识(数字或字符串)
	Email              string // 可空(ORCID/WeChat 等不返邮箱的 provider 走自己的 find/create,不用本 helper)
	EmailVerified      bool   // 第三方是否标注「邮箱已验证」
	UsernameCandidate  string // 首选 username(不唯一时会自动加时间戳后缀)
	UsernameFallback   string // 首选拿不到时的兜底(如 "github_<id>" / "google_user")
	AvatarURL          string
	Bio                string
	DisplayName        string            // 给 merge 确认页面展示("您要绑定的 GitHub 账号:Alice")
	ProviderDataExtras map[string]string // 序列化进 auth_providers.provider_data 的附加信息(login/picture/etc.)
}

// findOrCreateOAuthUser 是 GitHub/Google/Apple/Microsoft/Discourse 共享的「登录 / 新建 / 合并」分发逻辑。
// 步骤:
//  1. 已有 user_auth_providers 行(同 provider + provider_user_id)→ 直接登录
//  2. 否则查 email 是否被其他 user 占用 → 占用则发 merge_token,等用户决策
//  3. 否则新建 user + 加 user_auth_providers 链接 → 走「新用户登录」分支
//
// ORCID(无邮箱)/ WeChat(无邮箱 + 有 unionID)结构不同,各自保留自己的 finder。
//
// 之前每个 provider 文件都有~80 行 boilerplate 实现这套逻辑,差异只在「字段映射」。
// 抽这个 helper 后:
//   - 每个 provider 文件只负责 OAuth → oauthIdentity 的转换(~15 行)
//   - 三态分发逻辑(包含 username 唯一性、welcome msg、provider_data JSON)统一一处维护
//   - 后续加新 provider(比如 Twitter)只需写 identity 提取
func (h *Handler) findOrCreateOAuthUser(ctx context.Context, identity oauthIdentity) (oauthOutcome, error) {
	if identity.Provider == "" || identity.ProviderUserID == "" {
		return oauthOutcome{}, fmt.Errorf("oauth identity: provider and provider_user_id required")
	}

	// 1. 已绑过这个 OAuth 账号 → 直接登入
	authProvider, err := h.service.FindAuthProvider(identity.Provider, identity.ProviderUserID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return oauthOutcome{}, fmt.Errorf("find auth provider: %w", err)
	}
	if authProvider != nil {
		user, err := h.service.FindByID(authProvider.UserID)
		if err != nil {
			return oauthOutcome{}, fmt.Errorf("find user by id: %w", err)
		}
		return oauthOutcome{User: user, IsNewUser: false}, nil
	}

	// 2. 序列化 provider_data —— 合并 / 新建都用
	providerDataBytes, _ := json.Marshal(identity.ProviderDataExtras)
	providerDataJSON := string(providerDataBytes)

	// 3. email 已被其他 user 占用 → 发 merge_token,等用户登录目标账号后确认
	if identity.Email != "" {
		found, err := h.service.FindByEmail(identity.Email)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return oauthOutcome{}, fmt.Errorf("find user by email: %w", err)
		}
		if found != nil && !identity.EmailVerified {
			// 第三方给的邮箱「未经验证」却撞上了已有账号:既不能信任它去合并(可能是
			// 冒用他人邮箱),也不能拿它建新号(邮箱已被占用)。降级为「建一个不带邮箱的
			// 独立账号」—— 等同用户主动选「新建独立账号」,绝不静默并入受害者账号。
			// 清空 email 后落到下面的新建分支即可(新号无 email,不触发唯一键冲突)。
			identity.Email = ""
			found = nil
		}
		if found != nil {
			displayName := identity.DisplayName
			if displayName == "" {
				displayName = identity.UsernameCandidate
			}
			token, err := h.service.StartPendingMerge(ctx, cache.PendingOAuthMerge{
				Provider:            identity.Provider,
				ProviderUserID:      identity.ProviderUserID,
				ProviderData:        providerDataJSON,
				TargetUserID:        found.ID,
				TargetEmail:         derefStr(found.Email),
				ProviderEmail:       identity.Email,
				ProviderDisplayName: displayName,
				ProviderAvatarURL:   identity.AvatarURL,
			})
			if err != nil {
				return oauthOutcome{}, fmt.Errorf("start pending merge: %w", err)
			}
			return oauthOutcome{User: found, MergeToken: token}, nil
		}
	}

	// 4. 新建 user —— 处理 username 唯一性
	username := identity.UsernameCandidate
	if username == "" {
		username = identity.UsernameFallback
	}
	if username == "" {
		username = identity.Provider + "_" + identity.ProviderUserID
	}
	existingUser, err := h.service.FindByUsername(username)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return oauthOutcome{}, fmt.Errorf("check username uniqueness: %w", err)
	}
	if existingUser != nil {
		username = fmt.Sprintf("%s_%d", username, time.Now().Unix())
	}

	user := &User{
		Username:      &username,
		Role:          "user",
		Status:        1,
		EmailVerified: identity.EmailVerified && identity.Email != "",
	}
	if identity.Email != "" {
		email := identity.Email
		user.Email = &email
	}
	if identity.AvatarURL != "" {
		avatar := identity.AvatarURL
		user.AvatarURL = &avatar
	}
	if identity.Bio != "" {
		bio := identity.Bio
		user.Bio = &bio
	}
	if err := h.service.CreateUser(user); err != nil {
		return oauthOutcome{}, err
	}
	h.service.SendWelcomeMessage(user.ID)

	if err := h.service.CreateAuthProvider(&UserAuthProvider{
		UserID:         user.ID,
		Provider:       identity.Provider,
		ProviderUserID: identity.ProviderUserID,
		ProviderData:   &providerDataJSON,
	}); err != nil {
		return oauthOutcome{}, err
	}

	// 邀请归因(best-effort):仅走到「新建 user」分支才归因,已绑定登录 / merge 分支都不算。
	// method 直接用 provider 名(github/google/apple/microsoft/discourse)。
	notifyInviteRegistered(ctx, user.ID, identity.Provider)

	return oauthOutcome{User: user, IsNewUser: true}, nil
}
