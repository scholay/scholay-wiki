// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package turnstile

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/upstream"
)

// VerifyRequest represents the Turnstile verification request
type VerifyRequest struct {
	Secret   string `json:"secret"`
	Response string `json:"response"` // The token from frontend
	RemoteIP string `json:"remoteip,omitempty"`
}

// VerifyResponse represents the Turnstile verification response
type VerifyResponse struct {
	Success     bool     `json:"success"`
	ChallengeTS string   `json:"challenge_ts,omitempty"`
	Hostname    string   `json:"hostname,omitempty"`
	ErrorCodes  []string `json:"error-codes,omitempty"`
	Action      string   `json:"action,omitempty"`
	CData       string   `json:"cdata,omitempty"`
}

const (
	verifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
)

// turnstile token 是一次性的, 不开 retry (同 OAuth 理由); 仅加 breaker + 观测。
var tsUpstream = upstream.New("turnstile").
	HTTPClient(httpclient.WithTimeout(10 * time.Second)).
	Breaker(upstream.BreakerConfig{}).
	MustBuild()

// VerifyToken verifies a Turnstile token with Cloudflare
func VerifyToken(ctx context.Context, token string, remoteIP string) (*VerifyResponse, error) {
	secretKey := ""
	if config.AppConfig != nil {
		secretKey = config.AppConfig.App.TurnstileSecretKey
	}
	if secretKey == "" {
		secretKey = "1x0000000000000000000000000000000AA"
	}

	reqBody := VerifyRequest{
		Secret:   secretKey,
		Response: token,
		RemoteIP: remoteIP,
	}

	var verifyResp VerifyResponse
	if err := tsUpstream.PostJSON(ctx, verifyURL, reqBody, &verifyResp); err != nil {
		return nil, fmt.Errorf("turnstile siteverify failed: %w", err)
	}

	return &verifyResp, nil
}

// Verify is a convenience function that returns true if token is valid
func Verify(ctx context.Context, token string, remoteIP string) (bool, error) {
	if token == "" {
		return false, fmt.Errorf("turnstile token is required")
	}

	resp, err := VerifyToken(ctx, token, remoteIP)
	if err != nil {
		return false, err
	}

	if !resp.Success {
		if len(resp.ErrorCodes) > 0 {
			return false, fmt.Errorf("turnstile verification failed: %v", resp.ErrorCodes)
		}
		return false, fmt.Errorf("turnstile verification failed")
	}

	return true, nil
}

// VerifyWithConfig verifies a Turnstile token using system configuration
// If systemConfig is nil or EnableTurnstile is false, verification is skipped and returns true
func VerifyWithConfig(ctx context.Context, token string, remoteIP string, systemConfig *model.SystemConfig) (bool, error) {
	// If system config is nil or Turnstile is disabled, skip verification
	if systemConfig == nil || !systemConfig.EnableTurnstile {
		return true, nil
	}

	// If Turnstile is enabled but no token provided, return error
	if token == "" {
		return false, fmt.Errorf("人机验证码不能为空")
	}

	// Use configured secret key
	secretKey := systemConfig.TurnstileSecretKey
	if secretKey == "" {
		// Fallback to test key for development
		secretKey = "1x0000000000000000000000000000000AA"
	}

	// Verify token using configured secret key
	reqBody := VerifyRequest{
		Secret:   secretKey,
		Response: token,
		RemoteIP: remoteIP,
	}

	var verifyResp VerifyResponse
	if err := tsUpstream.PostJSON(ctx, verifyURL, reqBody, &verifyResp); err != nil {
		slog.Error("turnstile: cf siteverify request failed", "err", err)
		return false, fmt.Errorf("turnstile siteverify failed: %w", err)
	}

	if !verifyResp.Success {
		// 人机验证失败本身是用户行为(机器人 / token 过期),只 Warn 不 Error
		slog.Warn("turnstile: verify rejected", "error_codes", verifyResp.ErrorCodes)
		if len(verifyResp.ErrorCodes) > 0 {
			return false, fmt.Errorf("人机验证失败: %v", verifyResp.ErrorCodes)
		}
		return false, fmt.Errorf("人机验证失败")
	}

	return true, nil
}
