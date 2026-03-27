// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

import (
	"crypto/rand"
	"encoding/base64"
	"math/big"
)

// GenerateRandomString 生成指定长度的随机字符串（base64 编码）
func GenerateRandomString(length int) string {
	b := make([]byte, length)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:length]
}

// SecureRandomDigits 使用 crypto/rand 生成指定位数的数字字符串（如验证码）
func SecureRandomDigits(n int) string {
	max := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(n)), nil)
	num, err := rand.Int(rand.Reader, max)
	if err != nil {
		b := make([]byte, n)
		rand.Read(b)
		for i := range b {
			b[i] = '0' + b[i]%10
		}
		return string(b)
	}
	result := num.String()
	for len(result) < n {
		result = "0" + result
	}
	return result
}

// SecureRandomString 使用 crypto/rand 从指定字符集生成随机字符串
func SecureRandomString(n int, charset string) string {
	b := make([]byte, n)
	max := big.NewInt(int64(len(charset)))
	for i := range b {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			raw := make([]byte, 1)
			rand.Read(raw)
			b[i] = charset[int(raw[0])%len(charset)]
			continue
		}
		b[i] = charset[idx.Int64()]
	}
	return string(b)
}

// SecureRandomIntn 使用 crypto/rand 生成 [0, n) 范围内的安全随机整数
func SecureRandomIntn(n int) int {
	max := big.NewInt(int64(n))
	val, err := rand.Int(rand.Reader, max)
	if err != nil {
		raw := make([]byte, 8)
		rand.Read(raw)
		result := 0
		for _, b := range raw {
			result = result*256 + int(b)
		}
		if result < 0 {
			result = -result
		}
		return result % n
	}
	return int(val.Int64())
}
