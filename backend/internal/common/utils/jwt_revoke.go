// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

// JWT blacklist — 让"改密 / 单端登出 / 封号"能立刻生效, 而不是等 token 自然过期。
//
// 两层 revoke:
//   - **token-level (jti)**: 单个 token 被吊销, key=auth:revoke:tok:<jti>, TTL=token 剩余有效期。
//     Logout 单端 / 管理员吊销某个会话用这个。旧 token (无 jti) 走不到这一层, 由 user-level 兜底。
//   - **user-level (uid + ts)**: 用户全部 token 都被吊销, key=auth:revoke:usr:<uid>, value=吊销时 unix 时间戳。
//     Middleware 校验时如果 claims.IssuedAt < ts 就拒。改密 / 封号 / 强制下线全部用这个。
//
// Redis 故障时**不阻塞登录**(fail-open): 读 Redis 出错只记日志, 当作"没吊销"放行。
// 这是 security vs availability 的取舍 — 我们选 availability, 因为登录被卡住会触发用户支持工单,
// 但 token 被偷的概率远低于 Redis 偶发故障。
//
// 等 Redis 长时间挂掉, 攻击者刚好窃 token 这个组合事件发生时, 我们会通过 ChangePassword
// 的 audit log 发现, 并通过 JWT secret rotation (config 切 key) 全量失效。

import (
	"context"
	"errors"
	"log/slog"
	"strconv"
	"time"

	"scholar-backend/internal/common/cache"
)

const (
	// revokeTokenKeyPrefix — auth:revoke:tok:<jti>, value="1", TTL=token 剩余有效期。
	revokeTokenKeyPrefix = "auth:revoke:tok:"
	// revokeUserKeyPrefix — auth:revoke:usr:<user_id>, value=unix_ts (秒), TTL=MaxSessionAge.
	revokeUserKeyPrefix = "auth:revoke:usr:"

	// revokeReadTimeout — Redis 读超时, 卡这个就当 "没吊销" 放行 (fail-open).
	revokeReadTimeout = 200 * time.Millisecond
)

// RevokeToken — 把单 token 加入黑名单。Logout 单端用这个。
// claims.JTI 为空(旧 token)时无操作 — 这种情况调 RevokeUserAllTokens 走 user-level。
func RevokeToken(ctx context.Context, claims *Claims) error {
	if claims == nil || claims.JTI == "" {
		return nil
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return errors.New("redis not initialized")
	}
	ttl := GetTokenRemainingTime(claims)
	if ttl <= 0 {
		// token 已过期, 没必要写黑名单
		return nil
	}
	return rdb.Set(ctx, revokeTokenKeyPrefix+claims.JTI, "1", ttl).Err()
}

// RevokeUserAllTokens — 把某用户当前**所有**已签发 token 都吊销。
// 改密 / 封号 / 强制下线 (管理员踢人) 用这个。
//
// 实现: 写一个时间戳, middleware 校验 token 时如果 token.IssuedAt < ts 就拒。
// TTL 用 MaxSessionAge (30d), 比任何活 token 都长, 保证全部失效。
func RevokeUserAllTokens(ctx context.Context, userID uint) error {
	if userID == 0 {
		return errors.New("userID required")
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return errors.New("redis not initialized")
	}
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	return rdb.Set(ctx, revokeUserKeyPrefix+strconv.FormatUint(uint64(userID), 10), ts, MaxSessionAge).Err()
}

// IsTokenRevoked — middleware 校验入口, true = 拒绝。
// fail-open: Redis 故障返回 false 放行, 只记日志。
func IsTokenRevoked(ctx context.Context, claims *Claims) bool {
	if claims == nil {
		return false
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return false
	}

	rctx, cancel := context.WithTimeout(ctx, revokeReadTimeout)
	defer cancel()

	// token-level (只对有 jti 的 token 有效，旧 token 跳过) 与 user-level 两个 key
	// 用单次 MGET 合并，省掉每个鉴权请求的第二次串行 Redis 往返。
	hasToken := claims.JTI != ""
	hasUser := claims.UserID != 0 && claims.IssuedAt != nil
	if !hasToken && !hasUser {
		return false
	}

	keys := make([]string, 0, 2)
	if hasToken {
		keys = append(keys, revokeTokenKeyPrefix+claims.JTI)
	}
	if hasUser {
		keys = append(keys, revokeUserKeyPrefix+strconv.FormatUint(uint64(claims.UserID), 10))
	}

	vals, err := rdb.MGet(rctx, keys...).Result()
	if err != nil {
		// fail-open: Redis 故障放行, 只记日志
		slog.Warn("jwt revoke: MGET lookup failed (fail-open)", "err", err, "user_id", claims.UserID)
		return false
	}

	idx := 0
	// 1. token-level: 命中任意值即吊销
	if hasToken {
		if vals[idx] != nil {
			return true
		}
		idx++
	}

	// 2. user-level: 比对 IssuedAt 与 revoke 时间戳
	if hasUser {
		raw, ok := vals[idx].(string)
		if !ok {
			return false // 未命中 (nil) 或非字符串
		}
		revokedAt, parseErr := strconv.ParseInt(raw, 10, 64)
		if parseErr != nil {
			slog.Warn("jwt revoke: bad timestamp in user-level revoke key", "err", parseErr, "raw", raw)
			return false
		}
		// token IssuedAt 严格早于 revoke 时间戳 → 拒。
		// 相等情况放行 (1 秒内重新登录的同秒签发新 token, 不应被自己刚刚的吊销影响)。
		return claims.IssuedAt.Time.Unix() < revokedAt
	}

	return false
}
