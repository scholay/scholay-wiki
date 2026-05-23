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
	oauthBindNoncePrefix = "oauth-bind-nonce"
	// 10 分钟:足够用户在 OAuth 网站完成授权 + 回跳。和 oauth_state TTL 同一量级。
	oauthBindNonceTTL = 10 * time.Minute
)

// SaveOAuthBindNonce 给「已登录用户去绑定 Apple/WeChat」颁发一个一次性 nonce,
// 把 nonce ↔ user_id 关系暂存到 Redis。
//
// 流程:
//   1. 前端 /settings/connections 「绑定 Apple」→ 调 GET /user/apple/bind-url(需登录)
//   2. 后端验证 JWT 拿到 user_id → 生成 nonce → SaveOAuthBindNonce
//      → 把 "bind:<nonce>" 编进 Apple OAuth state 字段返给前端
//   3. 前端 redirect 到 Apple,用户授权后 Apple 把 POST 发回我们的 callback
//   4. callback 解析 state,如果是 "bind:<nonce>" → ConsumeOAuthBindNonce 拿到
//      user_id → 走 bind 分支(把 Apple 绑到这个 user_id 上),不走 findOrCreate
//
// 与 oauth_state 的区别:state 只是 CSRF 防护(纯随机,验完丢),
// bind_nonce 还要携带「这次回调要绑到哪个 user」上下文,所以 value 是 user_id。
func SaveOAuthBindNonce(ctx context.Context, userID uint) (string, error) {
	buf := make([]byte, 16) // 128-bit 随机就够
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate bind nonce: %w", err)
	}
	nonce := hex.EncodeToString(buf)
	key := fmt.Sprintf("%s:%s", oauthBindNoncePrefix, nonce)
	if err := Set(ctx, key, userID, oauthBindNonceTTL); err != nil {
		return "", err
	}
	return nonce, nil
}

// LookupOAuthBindNonce 查询 nonce 对应的 user_id,**不删除**,允许多次查看。
// 推荐流程:callback 拿到 state 后先 Lookup → 用拿到的 user_id 跑 OAuth 验证 →
// 验证通过且 bind 完成才调 DeleteOAuthBindNonce 销毁。
// 这样 OAuth 中间任何一步失败(token 交换 / id_token 解析 / 已绑冲突)用户都
// 可以浏览器返回重试,nonce 还在;否则 nonce 一被吃就回不去了。
func LookupOAuthBindNonce(ctx context.Context, nonce string) (uint, error) {
	key := fmt.Sprintf("%s:%s", oauthBindNoncePrefix, nonce)
	var userID uint
	if err := Get(ctx, key, &userID); err != nil {
		return 0, nil
	}
	return userID, nil
}

// DeleteOAuthBindNonce 销毁 nonce。绑定确实完成(写 DB 成功)后调,防重放。
func DeleteOAuthBindNonce(ctx context.Context, nonce string) error {
	key := fmt.Sprintf("%s:%s", oauthBindNoncePrefix, nonce)
	return Delete(ctx, key)
}

// ConsumeOAuthBindNonce DEPRECATED —— 留作兼容,等价于 Lookup + Delete 原子组合。
// 新代码请用 Lookup + Delete 两步,以便在 OAuth 验证失败时不浪费 nonce。
func ConsumeOAuthBindNonce(ctx context.Context, nonce string) (uint, error) {
	userID, err := LookupOAuthBindNonce(ctx, nonce)
	if err != nil || userID == 0 {
		return 0, nil
	}
	_ = DeleteOAuthBindNonce(ctx, nonce)
	return userID, nil
}
