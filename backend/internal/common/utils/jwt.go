// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

import (
	"errors"
	"fmt"
	"scholar-backend/internal/common/config"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Token 过期时间配置
const (
	// TokenExpiration 单个 Token 的过期时间：48小时
	TokenExpiration = 48 * time.Hour
	// MaxSessionAge 会话最长有效期：30天（自动刷新的上限）
	MaxSessionAge = 30 * 24 * time.Hour
	// TokenRefreshThreshold Token 刷新阈值：过期前2小时可以刷新
	TokenRefreshThreshold = 2 * time.Hour
)

type Claims struct {
	UserID    uint   `json:"user_id"`
	Username  string `json:"username"`
	Type      string `json:"type"`       // "admin" or "user"
	SessionID string `json:"session_id"` // 关联的会话ID，用于验证会话有效性
	jwt.RegisteredClaims
}

// GenerateToken 生成带默认过期时间（48小时）的 JWT token
func GenerateToken(userID uint, username, userType string) (string, error) {
	return GenerateTokenWithSession(userID, username, userType, "")
}

// GenerateTokenWithSession generates a JWT token with session ID
func GenerateTokenWithSession(userID uint, username, userType, sessionID string) (string, error) {
	claims := Claims{
		UserID:    userID,
		Username:  username,
		Type:      userType,
		SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(TokenExpiration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.AppConfig.JWT.Secret))
}

// ParseToken parses and validates a JWT token.
// Explicitly restricts signing method to HMAC to prevent algorithm confusion attacks.
func ParseToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(config.AppConfig.JWT.Secret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// ParseTokenIgnoreExpiry parses a JWT token without checking expiry (for refresh).
// Explicitly restricts signing method to HMAC to prevent algorithm confusion attacks.
func ParseTokenIgnoreExpiry(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(config.AppConfig.JWT.Secret), nil
	}, jwt.WithoutClaimsValidation())

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// CanRefreshToken checks if a token can be refreshed based on token expiry
// Note: This only checks token-level validity. Session-level validity (30 days) 
// should be checked separately using session.CanRefresh()
func CanRefreshToken(claims *Claims) bool {
	if claims.ExpiresAt == nil {
		return false
	}
	
	// Token 的签名有效即可刷新，实际的刷新权限由会话的 30 天有效期决定
	// 这里不再限制 Token 过期时间，因为会话有效期才是关键
	return true
}

// GetTokenRemainingTime returns the remaining time before token expires
func GetTokenRemainingTime(claims *Claims) time.Duration {
	if claims.ExpiresAt == nil {
		return 0
	}
	return time.Until(claims.ExpiresAt.Time)
}

// ShouldRefreshToken checks if token should be refreshed (within threshold)
func ShouldRefreshToken(claims *Claims) bool {
	remaining := GetTokenRemainingTime(claims)
	return remaining > 0 && remaining <= TokenRefreshThreshold
}
