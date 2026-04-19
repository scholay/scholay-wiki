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
	"net/http"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// oauthStateTTL OAuth state / nonce 在 Redis 中的生存期。
const oauthStateTTL = 5 * time.Minute

// issueOAuthState 生成随机 state，写入 Redis（如可用）并返回。
// prefix 区分不同 provider，例如 "oauth_state:", "orcid_oauth_state:"。
// Redis 不可用时不写入但仍返回 state（调用方应决定是否强制校验）。
func issueOAuthState(c *gin.Context, prefix string) string {
	state := utils.GenerateRandomString(32)
	if rdb := cache.GetRedis(); rdb != nil {
		rdb.Set(c.Request.Context(), prefix+state, "1", oauthStateTTL)
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
	val, err := rdb.Get(c.Request.Context(), key).Result()
	if err != nil || val != "1" {
		return false
	}
	rdb.Del(c.Request.Context(), key)
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
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour)
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
