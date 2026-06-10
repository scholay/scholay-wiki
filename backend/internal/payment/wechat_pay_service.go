// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	crand "crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/upstream"
)

// 全局 upstream.Client — base 是 api.mch.weixin.qq.com, 复用 30s 超时的 httpclient。
// 不在 upstream 层重试 — 支付下单不能因为短暂网络抖动就重发 (微信会按 out_trade_no
// 幂等, 但 backend 这里如果重试拿到 200, 中间状态会变得难以追踪)。
var (
	wxPayOnce   sync.Once
	wxPayClient *upstream.Client
)

func wxPay() *upstream.Client {
	wxPayOnce.Do(func() {
		wxPayClient = upstream.New("wechat_pay").
			BaseURL("https://api.mch.weixin.qq.com").
			HTTPClient(httpclient.WithTimeout(30 * time.Second)).
			Breaker(upstream.BreakerConfig{
				MaxRequests:  3,
				MinRequests:  5,
				FailureRatio: 0.6,
				Timeout:      30 * time.Second,
			}).
			MustBuild()
	})
	return wxPayClient
}

// WeChatPayRepo defines the data-access contract consumed by WeChatPayService.
type WeChatPayRepo interface {
	GetAllConfigs() ([]*WeChatPayConfig, error)
	GetActiveConfig() (*WeChatPayConfig, error)
	GetConfigByID(id uint64) (*WeChatPayConfig, error)
	CreateConfig(config *WeChatPayConfig) error
	UpdateConfig(config *WeChatPayConfig) error
	DeleteConfig(id uint64) error
	DeactivateAllConfigs() error
	ActivateConfig(id uint64) error
}

// WeChatPayService 微信支付服务
type WeChatPayService struct {
	repo WeChatPayRepo
}

// NewWeChatPayService 创建微信支付服务
func NewWeChatPayService(repo WeChatPayRepo) *WeChatPayService {
	return &WeChatPayService{repo: repo}
}

// GetAllConfigs 获取所有配置
func (s *WeChatPayService) GetAllConfigs(showKeys bool) ([]*WeChatPayConfigDTO, error) {
	configs, err := s.repo.GetAllConfigs()
	if err != nil {
		return nil, err
	}

	dtos := make([]*WeChatPayConfigDTO, len(configs))
	for i, config := range configs {
		dtos[i] = config.ToDTO(showKeys)
	}
	return dtos, nil
}

// GetActiveConfig 获取激活的配置
func (s *WeChatPayService) GetActiveConfig() (*WeChatPayConfig, error) {
	return s.repo.GetActiveConfig()
}

// CreateConfig 创建配置
func (s *WeChatPayService) CreateConfig(dto *WeChatPayConfigDTO) error {
	// 验证必填字段
	if dto.MchID == "" || dto.AppID == "" || dto.APIv3Key == "" ||
		dto.SerialNo == "" || dto.PrivateKey == "" || dto.NotifyURL == "" {
		return errors.New("required fields cannot be empty")
	}

	// 验证私钥格式
	if err := s.validatePrivateKey(dto.PrivateKey); err != nil {
		return fmt.Errorf("invalid private key format: %w", err)
	}

	config := &WeChatPayConfig{
		MchID:      dto.MchID,
		AppID:      dto.AppID,
		APIv3Key:   dto.APIv3Key,
		SerialNo:   dto.SerialNo,
		PrivateKey: dto.PrivateKey,
		NotifyURL:  dto.NotifyURL,
		IsSandbox:  dto.IsSandbox,
		IsActive:   dto.IsActive,
	}

	return s.repo.CreateConfig(config)
}

// UpdateConfig 更新配置
func (s *WeChatPayService) UpdateConfig(id uint64, dto *WeChatPayConfigDTO) error {
	config, err := s.repo.GetConfigByID(id)
	if err != nil {
		return err
	}

	// 验证必填字段
	if dto.MchID == "" || dto.AppID == "" || dto.SerialNo == "" || dto.NotifyURL == "" {
		return errors.New("required fields cannot be empty")
	}

	// 更新字段
	config.MchID = dto.MchID
	config.AppID = dto.AppID
	config.SerialNo = dto.SerialNo
	config.NotifyURL = dto.NotifyURL
	config.IsSandbox = dto.IsSandbox
	config.IsActive = dto.IsActive

	// 如果提供了新的密钥和私钥，则更新
	if dto.APIv3Key != "" && !strings.Contains(dto.APIv3Key, "****") {
		config.APIv3Key = dto.APIv3Key
	}
	if dto.PrivateKey != "" && !strings.Contains(dto.PrivateKey, "****") {
		if err := s.validatePrivateKey(dto.PrivateKey); err != nil {
			return fmt.Errorf("invalid private key format: %w", err)
		}
		config.PrivateKey = dto.PrivateKey
	}

	return s.repo.UpdateConfig(config)
}

// DeleteConfig 删除配置
func (s *WeChatPayService) DeleteConfig(id uint64) error {
	return s.repo.DeleteConfig(id)
}

// ActivateConfig 激活配置
func (s *WeChatPayService) ActivateConfig(id uint64) error {
	return s.repo.ActivateConfig(id)
}

// validatePrivateKey 验证私钥格式
func (s *WeChatPayService) validatePrivateKey(privateKeyStr string) error {
	block, _ := pem.Decode([]byte(privateKeyStr))
	if block == nil {
		return errors.New("failed to decode PEM block")
	}

	_, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		// 尝试解析为PKCS1格式
		_, err = x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return errors.New("failed to parse private key")
		}
	}

	return nil
}

// CreateNativeOrder 创建Native支付订单（扫码支付）
func (s *WeChatPayService) CreateNativeOrder(ctx context.Context, orderNo string, amount float64, description string) (string, error) {
	config, err := s.GetActiveConfig()
	if err != nil {
		return "", fmt.Errorf("failed to get active config: %w", err)
	}

	// 构建请求参数
	amountInCents := int(amount * 100) // 转换为分
	requestBody := map[string]any{
		"appid":        config.AppID,
		"mchid":        config.MchID,
		"description":  description,
		"out_trade_no": orderNo,
		"notify_url":   config.NotifyURL,
		// 网关侧 120 分钟未支付自动关单(RFC3339,容器 TZ=北京 → +08:00,不做 UTC 转换)。
		// 与后端 pending 清扫配合,避免「逾期支付得到过期会员」。
		"time_expire": time.Now().Add(120 * time.Minute).Format(time.RFC3339),
		"amount": map[string]any{
			"total":    amountInCents,
			"currency": "CNY",
		},
	}

	// 构建请求
	url := "https://api.mch.weixin.qq.com/v3/pay/transactions/native"
	if config.IsSandbox {
		url = "https://api.mch.weixin.qq.com/sandboxnew/pay/transactions/native"
	}

	// 发送请求
	codeURL, err := s.sendRequest(ctx, config, "POST", url, requestBody)
	if err != nil {
		return "", err
	}

	return codeURL, nil
}

// sendRequest 发送微信支付请求 — 走 common/upstream 拿 breaker / 观测 / typed error,
// 但签名 / Authorization header 的构造必须在本层做 (依赖 method/url/body)。
//
// url 参数可以是完整 URL (历史调用方式) 或相对路径; 完整 URL 时 baseURL 被忽略,
// upstream.Client.buildURL 自动处理。
func (s *WeChatPayService) sendRequest(ctx context.Context, config *WeChatPayConfig, method, fullURL string, body any) (string, error) {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request body: %w", err)
	}

	// 签名要的是完整 URL 路径部分; 跟原实现一致
	timestamp := time.Now().Unix()
	nonce := generateNonce(32)
	signature, err := s.generateSignature(config.PrivateKey, method, fullURL, timestamp, nonce, string(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("failed to generate signature: %w", err)
	}
	authorization := fmt.Sprintf(
		`WECHATPAY2-SHA256-RSA2048 mchid="%s",nonce_str="%s",signature="%s",timestamp="%d",serial_no="%s"`,
		config.MchID, nonce, signature, timestamp, config.SerialNo,
	)

	resp, err := wxPay().Do(ctx, upstream.Request{
		Method: method,
		Path:   fullURL, // 完整 URL → upstream 自动跳过 baseURL 拼接
		Headers: http.Header{
			"Content-Type":  {"application/json"},
			"Accept":        {"application/json"},
			"Authorization": {authorization},
		},
		Body: bytes.NewReader(bodyBytes),
	})
	if err != nil {
		slog.Error("wechat-pay: request failed", "url", fullURL, "err", err)
		return "", fmt.Errorf("wechat pay request: %w", err)
	}

	var result map[string]any
	if err := json.Unmarshal(resp.Body, &result); err != nil {
		slog.Error("wechat-pay: parse response", "err", err, "body", string(resp.Body))
		return "", fmt.Errorf("failed to parse response: %w", err)
	}
	codeURL, ok := result["code_url"].(string)
	if !ok {
		slog.Error("wechat-pay: code_url missing in response", "body", string(resp.Body))
		return "", fmt.Errorf("code_url not found in response")
	}
	return codeURL, nil
}

// generateSignature 生成签名
func (s *WeChatPayService) generateSignature(privateKeyStr, method, url string, timestamp int64, nonce, body string) (string, error) {
	// 解析私钥
	block, _ := pem.Decode([]byte(privateKeyStr))
	if block == nil {
		return "", errors.New("failed to decode PEM block")
	}

	privateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		// 尝试PKCS1格式
		rsaKey, err2 := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err2 != nil {
			return "", fmt.Errorf("failed to parse private key: %w", err)
		}
		privateKey = rsaKey
	}

	rsaPrivateKey, ok := privateKey.(*rsa.PrivateKey)
	if !ok {
		return "", errors.New("not an RSA private key")
	}

	// 构建待签名字符串
	// method\nurl\ntimestamp\nnonce\nbody\n
	urlPath := strings.TrimPrefix(url, "https://api.mch.weixin.qq.com")
	message := fmt.Sprintf("%s\n%s\n%d\n%s\n%s\n", method, urlPath, timestamp, nonce, body)

	// 计算SHA256摘要
	hash := sha256.New()
	hash.Write([]byte(message))
	digest := hash.Sum(nil)

	// RSA签名
	signature, err := rsa.SignPKCS1v15(crand.Reader, rsaPrivateKey, 0, digest)
	if err != nil {
		return "", fmt.Errorf("failed to sign: %w", err)
	}

	return base64.StdEncoding.EncodeToString(signature), nil
}

// VerifyNotify 验证并解密回调通知
func (s *WeChatPayService) VerifyNotify(req *WeChatPayNotifyRequest) (*WeChatPayNotifyDecrypted, error) {
	config, err := s.GetActiveConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get active config: %w", err)
	}

	// 解密数据
	decrypted, err := s.decryptNotify(config.APIv3Key, &req.Resource)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt notify: %w", err)
	}

	// 解析解密后的数据
	var result WeChatPayNotifyDecrypted
	if err := json.Unmarshal([]byte(decrypted), &result); err != nil {
		return nil, fmt.Errorf("failed to parse decrypted data: %w", err)
	}

	// 断言 mchid/appid 与本商户配置一致(微信 v3 规范要求)—— 防止「为其他商户/应用的回调」
	// 被错误地当作本商户的成功通知履约。AES-GCM 已是认证加密,这是纵深的一层。
	if result.MchID != config.MchID || result.AppID != config.AppID {
		return nil, fmt.Errorf("wechat notify mchid/appid mismatch")
	}

	return &result, nil
}

// decryptNotify 解密回调数据
func (s *WeChatPayService) decryptNotify(apiV3Key string, resource *WeChatPayNotifyResource) (string, error) {
	// Base64解码
	ciphertext, err := base64.StdEncoding.DecodeString(resource.Ciphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(resource.Nonce)
	if err != nil {
		return "", fmt.Errorf("failed to decode nonce: %w", err)
	}

	associatedData := []byte(resource.AssociatedData)

	// 创建AES-GCM解密器
	block, err := aes.NewCipher([]byte(apiV3Key))
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// 解密
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, associatedData)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintext), nil
}

// generateNonce 使用 crypto/rand 生成安全随机字符串
func generateNonce(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	max := big.NewInt(int64(len(charset)))
	for i := range b {
		idx, err := crand.Int(crand.Reader, max)
		if err != nil {
			raw := make([]byte, 1)
			crand.Read(raw)
			b[i] = charset[int(raw[0])%len(charset)]
			continue
		}
		b[i] = charset[idx.Int64()]
	}
	return string(b)
}

// 注:旧的 VerifySignature 已删除 —— 它是错误实现(用 HMAC-SHA256 而微信 v3 回调要求 RSA
// 平台证书验签),且零调用方。接上反而会拒绝全部真实回调,是维护陷阱。回调真伪当前靠
// VerifyNotify 的 AES-GCM 认证解密 + mchid/appid 断言把关;真正的平台证书验签(含证书轮换,
// 建议直接用 wechatpay-go validator)留作后续加固。
