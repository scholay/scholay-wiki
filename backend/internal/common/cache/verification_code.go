// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

const (
	verificationCodePrefix     = "verification_code"
	verificationCodeFailPrefix = "verification_code_fail"
	verificationCodeTTL        = 10 * time.Minute // 验证码10分钟过期
	// maxVerifyAttempts 单个验证码允许的最大错误尝试次数。超过后立即作废该码,
	// 防止 6 位码(10^6 空间)在 10 分钟窗口内被暴力穷举。
	maxVerifyAttempts = 5
)

// normEmail 与 utils.NormalizeEmail 同义,但本包不能 import utils(会形成循环依赖)。
// 验证码 key 是 verification_code:{email}:{purpose},若不规范化 Save/Verify 大小写不一致会查不到。
func normEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// VerificationCode represents a verification code in Redis
type VerificationCode struct {
	Email   string `json:"email"`
	Code    string `json:"code"`
	Purpose string `json:"purpose"` // register, login, reset_password
}

// SaveVerificationCode saves a verification code to Redis
// Key format: verification_code:{email}:{purpose}
// TTL: 10 minutes (auto-cleanup)
func SaveVerificationCode(ctx context.Context, email, code, purpose string) error {
	email = normEmail(email)
	key := fmt.Sprintf("%s:%s:%s", verificationCodePrefix, email, purpose)

	vc := VerificationCode{
		Email:   email,
		Code:    code,
		Purpose: purpose,
	}

	return Set(ctx, key, vc, verificationCodeTTL)
}

// VerifyCode verifies a verification code and deletes it if valid
// Returns true if code is valid, false otherwise
func VerifyCode(ctx context.Context, email, code, purpose string) (bool, error) {
	email = normEmail(email)
	key := fmt.Sprintf("%s:%s:%s", verificationCodePrefix, email, purpose)

	var vc VerificationCode
	err := Get(ctx, key, &vc)
	if err != nil {
		// Code not found or expired
		return false, nil
	}

	// Check if code matches
	if vc.Code != code {
		// 猜错:累计失败次数,超过阈值就把这个码烧掉(连同计数器),
		// 否则码会在整个 10 分钟窗口里一直可被继续穷举。
		if bumpVerifyFailures(ctx, key) {
			_ = Delete(ctx, key)
			delVerifyFailures(ctx, key)
		}
		return false, nil
	}

	// Delete the code after verification (one-time use)
	if err := Delete(ctx, key); err != nil {
		slog.Warn("Failed to delete verification code", "key", key, "err", err)
	}
	// 成功核验后清掉失败计数器,避免下一张同 key 的码继承上一轮的失败数。
	delVerifyFailures(ctx, key)

	return true, nil
}

// bumpVerifyFailures 给某个验证码 key 累加一次失败计数,返回是否已达到上限
// (调用方应据此烧掉验证码)。Redis 不可用时返回 false(不锁定,但此时 Get 也会
// 失败、码本就取不到,不影响安全)。计数器与码同窗口过期,自动清理。
func bumpVerifyFailures(ctx context.Context, codeKey string) bool {
	rdb := GetRedis()
	if rdb == nil {
		return false
	}
	failKey := verificationCodeFailPrefix + ":" + codeKey
	n, err := rdb.Incr(ctx, failKey).Result()
	if err != nil {
		return false
	}
	if n == 1 {
		rdb.Expire(ctx, failKey, verificationCodeTTL)
	}
	return n >= maxVerifyAttempts
}

// delVerifyFailures 清除某个验证码 key 的失败计数器。
func delVerifyFailures(ctx context.Context, codeKey string) {
	rdb := GetRedis()
	if rdb == nil {
		return
	}
	rdb.Del(ctx, verificationCodeFailPrefix+":"+codeKey)
}

// GetVerificationCode retrieves a verification code (for debugging only)
func GetVerificationCode(ctx context.Context, email, purpose string) (*VerificationCode, error) {
	key := fmt.Sprintf("%s:%s:%s", verificationCodePrefix, normEmail(email), purpose)

	var vc VerificationCode
	err := Get(ctx, key, &vc)
	if err != nil {
		return nil, err
	}

	return &vc, nil
}

// DeleteVerificationCode deletes a verification code
func DeleteVerificationCode(ctx context.Context, email, purpose string) error {
	key := fmt.Sprintf("%s:%s:%s", verificationCodePrefix, normEmail(email), purpose)
	return Delete(ctx, key)
}

// GetVerificationCodeTTL returns the remaining TTL of a verification code
func GetVerificationCodeTTL(ctx context.Context, email, purpose string) (time.Duration, error) {
	key := fmt.Sprintf("%s:%s:%s", verificationCodePrefix, normEmail(email), purpose)
	return TTL(ctx, key)
}
