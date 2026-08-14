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
	"encoding/json"
	"fmt"
	"time"
)

const (
	oauthLoginCodePrefix = "oauth-login-code"
	// 90s:后端 302 到前端落地并 POST 换 token 是一次页面加载(通常亚秒级),90s 给慢网足够余量,
	// 又把「code 泄漏窗口」压到极短。对比它替换掉的东西 —— 48h 全权限 JWT 直接落进 nginx access log ——
	// 这是数量级的缩窄(标准 OAuth authorization code 模式)。
	oauthLoginCodeTTL = 90 * time.Second
)

// PendingOAuthLogin 是「Apple form_post 回调已签发 JWT,但不把 JWT 放进 URL」时,
// 挂在 Redis 上的一次性登录结果。前端拿短 code POST 换取,GetDel 保证只能换一次。
//
// UserJSON 是 *user.User 的 marshaled 快照(cache 包不能反向 import user 包,避免循环依赖)——
// exchange 端点拿到后原样透出,前端 handleAuthSuccess/normalizeUser 消费,字段与
// respondOAuthSuccess 的 {token,user,is_new_user} 完全一致。
type PendingOAuthLogin struct {
	Token     string `json:"token"`
	UserJSON  string `json:"user_json"`
	IsNewUser bool   `json:"is_new_user"`
}

// SaveOAuthLoginCode 生成 32 字节 hex code(256-bit)作为 key 写入 persist 池。
// 走 persist 池(noeviction):被主池 LRU 逐出 = 用户拿着 code 却换不到 token(登录失败),
// 是鉴权 correctness 破坏而非优雅降级 —— 与 ws-ticket / 验证码同档,不能被逐出。
func SaveOAuthLoginCode(ctx context.Context, p PendingOAuthLogin) (string, error) {
	code, err := generateLoginCodeHex()
	if err != nil {
		return "", err
	}
	key := fmt.Sprintf("%s:%s", oauthLoginCodePrefix, code)
	if err := SetPersist(ctx, key, p, oauthLoginCodeTTL); err != nil {
		return "", err
	}
	return code, nil
}

// generateLoginCodeHex 生成 32 字节(256-bit)crypto/rand hex —— 抽出便于离线属性测试。
func generateLoginCodeHex() (string, error) {
	codeBytes := make([]byte, 32)
	if _, err := rand.Read(codeBytes); err != nil {
		return "", fmt.Errorf("generate login code: %w", err)
	}
	return hex.EncodeToString(codeBytes), nil
}

// ConsumeOAuthLoginCode 原子取出并删除(GetDel),保证一次性:即便 code 在日志/历史里被看到,
// 第二次兑换必然失效。code 不存在/已用/过期 → 返回 (nil, nil),caller 转 4xx。
func ConsumeOAuthLoginCode(ctx context.Context, code string) (*PendingOAuthLogin, error) {
	rdb := GetRedisPersist()
	if rdb == nil {
		return nil, fmt.Errorf("redis unavailable")
	}
	key := fmt.Sprintf("%s:%s", oauthLoginCodePrefix, code)
	raw, err := rdb.GetDel(ctx, key).Result()
	if err != nil {
		return nil, nil // redis.Nil(不存在/过期)也走这里 → caller 当无效 code 处理
	}
	var p PendingOAuthLogin
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, fmt.Errorf("decode login code payload: %w", err)
	}
	return &p, nil
}
