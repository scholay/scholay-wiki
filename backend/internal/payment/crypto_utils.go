// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"
)

// ParseRSAPrivateKey parses a PEM-encoded RSA private key (PKCS1 or PKCS8).
// If the input lacks PEM headers, they are added automatically.
func ParseRSAPrivateKey(privateKeyStr string) (*rsa.PrivateKey, error) {
	privateKeyStr = strings.TrimSpace(privateKeyStr)
	if !strings.HasPrefix(privateKeyStr, "-----BEGIN") {
		privateKeyStr = "-----BEGIN RSA PRIVATE KEY-----\n" + privateKeyStr + "\n-----END RSA PRIVATE KEY-----"
	}

	block, _ := pem.Decode([]byte(privateKeyStr))
	if block == nil {
		return nil, errors.New("failed to decode PEM block")
	}

	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("not an RSA private key")
	}
	return rsaKey, nil
}
