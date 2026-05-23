// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

const (
	oauthMergePrefix = "oauth-merge"
	// 10 分钟足够用户阅读「合并 / 新建」二选一界面并决策。再短会让用户错过过期。
	oauthMergeTTL = 10 * time.Minute
)

// PendingOAuthMerge 是 OAuth 回调发现 email 冲突 时挂在 Redis 上的"待决策"快照。
//
// 触发场景:用户用 GitHub/Google/Apple/Microsoft/Discourse 登录,回调拿到的 email
// 已经存在 users 表里 —— 这时不能直接合并(可能让 attacker 用同 email 公开账号
// 劫持别人本地账号),也不能拒绝(用户体验差),而是给前端发一个 merge_token,
// 由前端展示「将 GitHub 账号绑定到现有的 alice@example.com 账户?」二选一让用户决策。
//
// 字段说明:
//   - Provider / ProviderUserID:OAuth 那边唯一标识,确认合并时拿来建 user_auth_providers 行
//   - ProviderUnionID:为 WeChat 预留(目前 WeChat 不走 merge,因为不返回 email)
//   - ProviderData:OAuth 返回的原始 profile JSON,合并 / 新建账号都用得上
//   - TargetUserID:邮箱已存在的用户 id;合并就是绑到 ta 头上
//   - TargetEmail:展示给用户看的「合并到哪个账号」,UI 显示用
//   - ProviderEmail:OAuth 那边的 email(可能与 TargetEmail 大小写不同,但 normalize 后相等)
//   - ProviderDisplayName:OAuth 那边的昵称 / 头像 URL,展示用
//   - ProviderAvatarURL:同上
type PendingOAuthMerge struct {
	Provider            string  `json:"provider"`
	ProviderUserID      string  `json:"provider_user_id"`
	ProviderUnionID     *string `json:"provider_union_id,omitempty"`
	ProviderData        string  `json:"provider_data"`
	TargetUserID        uint    `json:"target_user_id"`
	TargetEmail         string  `json:"target_email"`
	ProviderEmail       string  `json:"provider_email"`
	ProviderDisplayName string  `json:"provider_display_name,omitempty"`
	ProviderAvatarURL   string  `json:"provider_avatar_url,omitempty"`
}

// SaveOAuthMerge 写入 Redis,生成 32 字节 hex token (256-bit) 作为 key。
// token 是访问凭据,谁拿到 token 谁能确认 / 取消合并 —— 所以必须用随机源 (crypto/rand)
// 且只走 https 传递。
func SaveOAuthMerge(ctx context.Context, m PendingOAuthMerge) (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", fmt.Errorf("generate merge token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)
	key := fmt.Sprintf("%s:%s", oauthMergePrefix, token)
	if err := Set(ctx, key, m, oauthMergeTTL); err != nil {
		return "", err
	}
	return token, nil
}

// GetOAuthMerge 读出 pending merge 快照(不删除,前端可能想多次查看摘要)。
func GetOAuthMerge(ctx context.Context, token string) (*PendingOAuthMerge, error) {
	key := fmt.Sprintf("%s:%s", oauthMergePrefix, token)
	var m PendingOAuthMerge
	if err := Get(ctx, key, &m); err != nil {
		return nil, nil // token 不存在 / 过期 → 返回 nil + nil 由 caller 转 404
	}
	return &m, nil
}

// DeleteOAuthMerge 在「确认」或「取消」后立即删除 token,避免重放。
func DeleteOAuthMerge(ctx context.Context, token string) error {
	key := fmt.Sprintf("%s:%s", oauthMergePrefix, token)
	return Delete(ctx, key)
}
