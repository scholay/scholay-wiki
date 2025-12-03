// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/url"
	"scholar-backend/internal/common/model"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

// AlipayService handles Alipay payment operations
type AlipayService struct {
	repo *AlipayRepository
}

// NewAlipayService creates a new Alipay service
func NewAlipayService(db *gorm.DB) *AlipayService {
	return &AlipayService{
		repo: NewAlipayRepository(db),
	}
}

// PaymentRequest represents a payment request
type PaymentRequest struct {
	OrderNo     string  `json:"order_no" binding:"required"`
	Subject     string  `json:"subject" binding:"required"`
	Amount      float64 `json:"amount" binding:"required"`
	ReturnURL   string  `json:"return_url"`
	Description string  `json:"description"`
}

// PaymentResponse represents the Alipay payment response
type PaymentResponse struct {
	PaymentURL string `json:"payment_url"`
	OrderNo    string `json:"order_no"`
}

// CreatePayment creates a payment request and returns the payment URL
func (s *AlipayService) CreatePayment(req PaymentRequest) (*PaymentResponse, error) {
	// Get active Alipay configuration
	config, err := s.repo.GetActiveConfig()
	if err != nil {
		return nil, fmt.Errorf("no active Alipay configuration found: %w", err)
	}

	// Build payment parameters
	// Note: sign_type must be included in params for signing
	params := map[string]string{
		"app_id":      config.AppID,
		"method":      "alipay.trade.page.pay",
		"charset":     "utf-8",
		"sign_type":   "RSA2",
		"timestamp":   time.Now().Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"notify_url":  config.NotifyURL,
		"biz_content": s.buildBizContent(req),
	}

	// Add return URL if provided
	if req.ReturnURL != "" {
		params["return_url"] = req.ReturnURL
	} else if config.ReturnURL != "" {
		params["return_url"] = config.ReturnURL
	}

	// Sign the request
	sign, err := s.signParams(params, config.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign request: %w", err)
	}
	params["sign"] = sign

	// Build payment URL
	paymentURL := s.buildPaymentURL(config.GatewayURL, params)

	return &PaymentResponse{
		PaymentURL: paymentURL,
		OrderNo:    req.OrderNo,
	}, nil
}

// VerifyCallback verifies the Alipay callback signature
func (s *AlipayService) VerifyCallback(params map[string]string) (bool, error) {
	// Get active Alipay configuration
	config, err := s.repo.GetActiveConfig()
	if err != nil {
		return false, fmt.Errorf("no active Alipay configuration found: %w", err)
	}

	// Extract sign from params
	sign, exists := params["sign"]
	if !exists {
		return false, errors.New("sign parameter not found")
	}

	// IMPORTANT: Remove both "sign" and "sign_type" before building sign content
	// According to Alipay docs, these two params should NOT be included in verification
	delete(params, "sign")
	delete(params, "sign_type")

	// Build sign content
	signContent := s.buildSignContent(params)

	fmt.Printf("[ALIPAY_VERIFY] Sign content: %s\n", signContent)
	fmt.Printf("[ALIPAY_VERIFY] Sign to verify: %s...\n", sign[:50])

	// Verify signature
	return s.verifySign(signContent, sign, config.AlipayPublicKey)
}

// GetActiveConfig retrieves the active Alipay configuration
func (s *AlipayService) GetActiveConfig() (*model.AlipayConfig, error) {
	return s.repo.GetActiveConfig()
}

// ListConfigs retrieves all Alipay configurations
func (s *AlipayService) ListConfigs() ([]model.AlipayConfig, error) {
	return s.repo.ListConfigs()
}

// CreateConfig creates a new Alipay configuration
func (s *AlipayService) CreateConfig(config *model.AlipayConfig) error {
	// Validate keys
	if err := s.validatePrivateKey(config.PrivateKey); err != nil {
		return fmt.Errorf("invalid private key: %w", err)
	}
	if err := s.validatePublicKey(config.AlipayPublicKey); err != nil {
		return fmt.Errorf("invalid Alipay public key: %w", err)
	}

	// If this is set as active, deactivate others
	if config.IsActive {
		if err := s.repo.DeactivateAllConfigs(); err != nil {
			return fmt.Errorf("failed to deactivate existing configs: %w", err)
		}
	}

	return s.repo.CreateConfig(config)
}

// UpdateConfig updates an Alipay configuration
func (s *AlipayService) UpdateConfig(config *model.AlipayConfig) error {
	// Validate keys if they are being updated
	if config.PrivateKey != "" {
		if err := s.validatePrivateKey(config.PrivateKey); err != nil {
			return fmt.Errorf("invalid private key: %w", err)
		}
	}
	if config.AlipayPublicKey != "" {
		if err := s.validatePublicKey(config.AlipayPublicKey); err != nil {
			return fmt.Errorf("invalid Alipay public key: %w", err)
		}
	}

	// If this is set as active, deactivate others
	if config.IsActive {
		if err := s.repo.SetActiveConfig(config.ID); err != nil {
			return fmt.Errorf("failed to set active config: %w", err)
		}
	}

	return s.repo.UpdateConfig(config)
}

// DeleteConfig deletes an Alipay configuration
func (s *AlipayService) DeleteConfig(id uint) error {
	return s.repo.DeleteConfig(id)
}

// SetActiveConfig sets a specific configuration as active
func (s *AlipayService) SetActiveConfig(id uint) error {
	return s.repo.SetActiveConfig(id)
}

// buildBizContent builds the biz_content JSON string
func (s *AlipayService) buildBizContent(req PaymentRequest) string {
	return fmt.Sprintf(`{"out_trade_no":"%s","product_code":"FAST_INSTANT_TRADE_PAY","total_amount":"%.2f","subject":"%s","body":"%s"}`,
		req.OrderNo,
		req.Amount,
		req.Subject,
		req.Description,
	)
}

// buildSignContent builds the content to be signed
// Note: According to Alipay docs, only "sign" is excluded from signing, "sign_type" must be included
func (s *AlipayService) buildSignContent(params map[string]string) string {
	var keys []string
	for k := range params {
		// Only exclude "sign" parameter, include "sign_type"
		if k != "sign" && params[k] != "" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)

	var signParts []string
	for _, k := range keys {
		signParts = append(signParts, fmt.Sprintf("%s=%s", k, params[k]))
	}
	return strings.Join(signParts, "&")
}

// signParams signs the parameters using RSA2 (SHA256)
func (s *AlipayService) signParams(params map[string]string, privateKeyStr string) (string, error) {
	// Build sign content
	signContent := s.buildSignContent(params)

	// Debug: Print sign content and its length
	fmt.Printf("🔐 Sign content (%d bytes): %s\n", len(signContent), signContent)
	fmt.Printf("🔐 Sign content (first 100 chars): %s\n", signContent[:min(100, len(signContent))])

	// Parse private key
	privateKey, err := s.parsePrivateKey(privateKeyStr)
	if err != nil {
		return "", err
	}

	// Hash the content
	hash := sha256.New()
	hash.Write([]byte(signContent))
	hashed := hash.Sum(nil)
	fmt.Printf("🔐 SHA256 hash: %x\n", hashed)

	// Sign with RSA
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hashed)
	if err != nil {
		return "", fmt.Errorf("failed to sign: %w", err)
	}

	// Encode to base64
	signStr := base64.StdEncoding.EncodeToString(signature)
	fmt.Printf("🔐 Generated signature (%d chars): %s...\n", len(signStr), signStr[:min(50, len(signStr))])
	return signStr, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// verifySign verifies the signature using Alipay's public key
func (s *AlipayService) verifySign(content, sign, publicKeyStr string) (bool, error) {
	// Parse public key
	publicKey, err := s.parsePublicKey(publicKeyStr)
	if err != nil {
		return false, err
	}

	// Decode signature
	signBytes, err := base64.StdEncoding.DecodeString(sign)
	if err != nil {
		return false, fmt.Errorf("failed to decode signature: %w", err)
	}

	// Hash the content
	hash := sha256.New()
	hash.Write([]byte(content))
	hashed := hash.Sum(nil)

	// Verify signature
	err = rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, hashed, signBytes)
	return err == nil, nil
}

// buildPaymentURL builds the complete payment URL
func (s *AlipayService) buildPaymentURL(gateway string, params map[string]string) string {
	// Sort keys to maintain consistent order
	var keys []string
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var urlParams []string
	for _, k := range keys {
		// URL encode both key and value
		encodedValue := url.QueryEscape(params[k])
		urlParams = append(urlParams, fmt.Sprintf("%s=%s", k, encodedValue))

		// Debug: Show encoding
		if params[k] != encodedValue {
			fmt.Printf("🔗 URL encoding: %s = %s -> %s\n", k, params[k], encodedValue)
		}
	}

	fullURL := gateway + "?" + strings.Join(urlParams, "&")
	fmt.Printf("🔗 Payment URL length: %d\n", len(fullURL))
	return fullURL
}

// parsePrivateKey parses a PEM-encoded private key
func (s *AlipayService) parsePrivateKey(privateKeyStr string) (*rsa.PrivateKey, error) {
	// Remove header/footer if present
	privateKeyStr = strings.TrimSpace(privateKeyStr)
	if !strings.HasPrefix(privateKeyStr, "-----BEGIN") {
		privateKeyStr = "-----BEGIN RSA PRIVATE KEY-----\n" + privateKeyStr + "\n-----END RSA PRIVATE KEY-----"
	}

	block, _ := pem.Decode([]byte(privateKeyStr))
	if block == nil {
		return nil, errors.New("failed to decode PEM block")
	}

	// Try PKCS1 format first
	privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err == nil {
		return privateKey, nil
	}

	// Try PKCS8 format
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

// parsePublicKey parses a PEM-encoded public key
func (s *AlipayService) parsePublicKey(publicKeyStr string) (*rsa.PublicKey, error) {
	// Remove header/footer if present
	publicKeyStr = strings.TrimSpace(publicKeyStr)
	if !strings.HasPrefix(publicKeyStr, "-----BEGIN") {
		publicKeyStr = "-----BEGIN PUBLIC KEY-----\n" + publicKeyStr + "\n-----END PUBLIC KEY-----"
	}

	block, _ := pem.Decode([]byte(publicKeyStr))
	if block == nil {
		return nil, errors.New("failed to decode PEM block")
	}

	// Try PKIX format
	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse public key: %w", err)
	}

	rsaKey, ok := key.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("not an RSA public key")
	}

	return rsaKey, nil
}

// validatePrivateKey validates if the private key is valid
func (s *AlipayService) validatePrivateKey(privateKeyStr string) error {
	_, err := s.parsePrivateKey(privateKeyStr)
	return err
}

// validatePublicKey validates if the public key is valid
func (s *AlipayService) validatePublicKey(publicKeyStr string) error {
	_, err := s.parsePublicKey(publicKeyStr)
	return err
}

// ParseCallbackParams parses callback parameters from io.Reader
func ParseCallbackParams(body io.Reader) (map[string]string, error) {
	data, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}

	values, err := url.ParseQuery(string(data))
	if err != nil {
		return nil, err
	}

	params := make(map[string]string)
	for k, v := range values {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}
	return params, nil
}
