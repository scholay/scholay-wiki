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
	"time"
)

const (
	verificationCodePrefix = "verification_code"
	verificationCodeTTL    = 10 * time.Minute // 验证码10分钟过期
)

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
	key := fmt.Sprintf("%s:%s:%s", verificationCodePrefix, email, purpose)

	var vc VerificationCode
	err := Get(ctx, key, &vc)
	if err != nil {
		// Code not found or expired
		return false, nil
	}

	// Check if code matches
	if vc.Code != code {
		return false, nil
	}

	// Delete the code after verification (one-time use)
	if err := Delete(ctx, key); err != nil {
		fmt.Printf("Warning: failed to delete verification code %s: %v\n", key, err)
	}

	return true, nil
}

// GetVerificationCode retrieves a verification code (for debugging only)
func GetVerificationCode(ctx context.Context, email, purpose string) (*VerificationCode, error) {
	key := fmt.Sprintf("%s:%s:%s", verificationCodePrefix, email, purpose)

	var vc VerificationCode
	err := Get(ctx, key, &vc)
	if err != nil {
		return nil, err
	}

	return &vc, nil
}

// DeleteVerificationCode deletes a verification code
func DeleteVerificationCode(ctx context.Context, email, purpose string) error {
	key := fmt.Sprintf("%s:%s:%s", verificationCodePrefix, email, purpose)
	return Delete(ctx, key)
}

// GetVerificationCodeTTL returns the remaining TTL of a verification code
func GetVerificationCodeTTL(ctx context.Context, email, purpose string) (time.Duration, error) {
	key := fmt.Sprintf("%s:%s:%s", verificationCodePrefix, email, purpose)
	return TTL(ctx, key)
}
