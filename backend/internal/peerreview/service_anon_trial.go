// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================================
// 设备识别与免登录试用（1 次/设备）
//
// 识别策略:
//   device_id  —— HttpOnly cookie UUID，主 key（用户 JS 不可读）
//   ip_ua_hash —— SHA256(IP + User-Agent)[:32]，辅助识别（防清 cookie）
//   查询条件:   WHERE device_id = ? OR ip_ua_hash = ?
//
// 消费时机: 一次成功 submit 才写入 peer_review_anon_trials 记录。
// 上传失败 / 草稿 / 中途放弃均不消耗。
// ============================================================================

const (
	// DeviceIDCookieName HttpOnly cookie 名（前端不可读）
	DeviceIDCookieName = "prv_device_id"
	// DeviceIDCookieMaxAge 1 年
	DeviceIDCookieMaxAge = 365 * 24 * 60 * 60
	// DeviceIDContextKey Gin 上下文中的 key
	DeviceIDContextKey = "peer_review_device_id"
	// IPUAHashContextKey Gin 上下文中的 key
	IPUAHashContextKey = "peer_review_ip_ua_hash"
)

// DeviceIDMiddleware 确保请求带有 prv_device_id cookie；不存在则下发一个新 UUID
// 同时把 device_id、ip_ua_hash 写入 gin.Context，供后续 handler 使用
func DeviceIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		deviceID, err := c.Cookie(DeviceIDCookieName)
		if err != nil || deviceID == "" || len(deviceID) != 64 {
			// 未带 cookie 或格式异常 —— 下发新 ID
			deviceID = generateDeviceID()
			// 生产环境推荐 Secure，但 Nginx 已是 HTTP 转发 WS，此处根据 req 判断
			secure := c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
			c.SetSameSite(http.SameSiteLaxMode)
			c.SetCookie(
				DeviceIDCookieName,
				deviceID,
				DeviceIDCookieMaxAge,
				"/",
				"", // 默认当前域
				secure,
				true, // HttpOnly
			)
		}

		c.Set(DeviceIDContextKey, deviceID)
		c.Set(IPUAHashContextKey, hashIPUA(c.ClientIP(), c.GetHeader("User-Agent")))
		c.Next()
	}
}

// generateDeviceID 生成 64 字符的设备 ID（hex 编码的 32 字节随机串）
func generateDeviceID() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// hashIPUA 将 IP + User-Agent 哈希为 64 字符的识别串
// 使用 SHA256 全长（64 hex），避免碰撞
func hashIPUA(ip, ua string) string {
	h := sha256.Sum256([]byte(ip + "|" + ua))
	return hex.EncodeToString(h[:])
}

// GetDeviceIDFromContext 从 gin.Context 取出 device_id
func GetDeviceIDFromContext(c *gin.Context) string {
	if v, ok := c.Get(DeviceIDContextKey); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// GetIPUAHashFromContext 从 gin.Context 取出 ip_ua_hash
func GetIPUAHashFromContext(c *gin.Context) string {
	if v, ok := c.Get(IPUAHashContextKey); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// ============================================================================
// Service 层：试用额度管理
// ============================================================================

// CheckAnonTrialQuota 检查匿名用户是否还有试用额度
// 返回 (canTrial, existingTrial)：
//   canTrial = true  —— 该设备/IP+UA 还没用过，允许试用
//   canTrial = false —— 已消费，existingTrial 非 nil 给出详情
func (s *Service) CheckAnonTrialQuota(deviceID, ipUAHash string) (bool, *PeerReviewAnonTrial, error) {
	if deviceID == "" && ipUAHash == "" {
		return false, nil, fmt.Errorf("缺少设备识别信息")
	}

	var trial PeerReviewAnonTrial
	query := s.db
	switch {
	case deviceID != "" && ipUAHash != "":
		query = query.Where("device_id = ? OR ip_ua_hash = ?", deviceID, ipUAHash)
	case deviceID != "":
		query = query.Where("device_id = ?", deviceID)
	case ipUAHash != "":
		query = query.Where("ip_ua_hash = ?", ipUAHash)
	}

	if err := query.Order("id DESC").First(&trial).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return true, nil, nil
		}
		return false, nil, fmt.Errorf("查询试用状态失败: %w", err)
	}

	return false, &trial, nil
}

// ConsumeAnonTrial 消费试用额度（在事务内调用）
// 必须在 SubmitDraft 成功后立即调用。重复消费会因 device_id 唯一索引被拒绝。
func (s *Service) ConsumeAnonTrial(tx *gorm.DB, deviceID, ipUAHash, anonToken string, taskID uint) error {
	if deviceID == "" {
		return fmt.Errorf("缺少 device_id，无法记录试用")
	}

	trial := PeerReviewAnonTrial{
		DeviceID:   deviceID,
		IPUAHash:   ipUAHash,
		AnonToken:  anonToken,
		TaskID:     taskID,
		ConsumedAt: time.Now(),
	}
	if err := tx.Create(&trial).Error; err != nil {
		return fmt.Errorf("记录试用失败: %w", err)
	}
	return nil
}

// ClaimAllByAnonToken 登录后批量认领同一 anon_token 下的所有任务
// 事务内:
//   1. peer_review_tasks.user_id / anon_token 翻转
//   2. peer_review_files.user_id 翻转
//   3. peer_review_anon_trials.claimed_by_user_id / claimed_at 标记
// peer_review_results 无 user_id 字段，由 task_id 级联，无需处理。
func (s *Service) ClaimAllByAnonToken(userID uint, anonToken string) ([]uint, error) {
	if userID == 0 {
		return nil, fmt.Errorf("必须登录后认领")
	}
	if anonToken == "" {
		return nil, fmt.Errorf("缺少匿名令牌")
	}

	var claimedIDs []uint
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// 1. 查出所有归属匿名且 token 匹配的任务
		var tasks []PeerReviewTask
		if err := tx.Where("anon_token = ? AND user_id = 0", anonToken).
			Find(&tasks).Error; err != nil {
			return fmt.Errorf("查询任务失败: %w", err)
		}
		if len(tasks) == 0 {
			return nil // 没有可认领任务，返回空列表
		}

		taskIDs := make([]uint, 0, len(tasks))
		for _, t := range tasks {
			taskIDs = append(taskIDs, t.ID)
		}

		// 2. 清理用户自己账号下已存在的 *空* draft —— 否则 claim 后用户同时持有
		//    老的空 draft + 刚认领的新 draft，GET /draft 按默认 ID 顺序会拿到老的，
		//    表现为"登录后刚上传的文件消失"。
		//    条件：user_id=claimer, status=draft, 无 ManuscriptFileID, manuscript_text 为空
		if err := tx.Where(
			"user_id = ? AND status = ? AND manuscript_file_id IS NULL AND (manuscript_text IS NULL OR manuscript_text = '')",
			userID, TaskStatusDraft,
		).Delete(&PeerReviewTask{}).Error; err != nil {
			return fmt.Errorf("清理空草稿失败: %w", err)
		}

		// 3. 批量更新任务归属
		if err := tx.Model(&PeerReviewTask{}).
			Where("id IN ? AND user_id = 0", taskIDs).
			Updates(map[string]any{
				"user_id":    userID,
				"anon_token": "",
			}).Error; err != nil {
			return fmt.Errorf("更新任务归属失败: %w", err)
		}

		// 4. 同步文件归属
		if err := tx.Model(&PeerReviewFile{}).
			Where("task_id IN ?", taskIDs).
			Update("user_id", userID).Error; err != nil {
			return fmt.Errorf("更新文件归属失败: %w", err)
		}

		// 5. 标记试用已被认领
		now := time.Now()
		if err := tx.Model(&PeerReviewAnonTrial{}).
			Where("anon_token = ? AND claimed_by_user_id = 0", anonToken).
			Updates(map[string]any{
				"claimed_by_user_id": userID,
				"claimed_at":         &now,
			}).Error; err != nil {
			return fmt.Errorf("更新试用记录失败: %w", err)
		}

		claimedIDs = taskIDs
		return nil
	})

	if err != nil {
		return nil, err
	}
	return claimedIDs, nil
}
