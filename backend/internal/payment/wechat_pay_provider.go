// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"context"
	"encoding/json"
	"fmt"
)

// Compile-time interface check.
var _ PaymentProvider = (*WeChatPayService)(nil)

// ProviderName returns the payment provider identifier.
func (s *WeChatPayService) ProviderName() string {
	return "wechat_pay"
}

// CreateOrder creates a payment using the unified provider interface.
func (s *WeChatPayService) CreateOrder(ctx context.Context, req CreatePaymentRequest) (*CreatePaymentResponse, error) {
	codeURL, err := s.CreateNativeOrder(req.OrderNo, req.Amount, req.Subject)
	if err != nil {
		return nil, err
	}
	return &CreatePaymentResponse{
		ProviderName: s.ProviderName(),
		PaymentURL:   codeURL,
	}, nil
}

// HandleNotify verifies a WeChat Pay callback and returns the parsed result.
func (s *WeChatPayService) HandleNotify(_ context.Context, body []byte) (*NotificationResult, error) {
	var notifyReq WeChatPayNotifyRequest
	if err := json.Unmarshal(body, &notifyReq); err != nil {
		return nil, fmt.Errorf("failed to parse notify body: %w", err)
	}

	decrypted, err := s.VerifyNotify(&notifyReq)
	if err != nil {
		return nil, err
	}

	status := "pending"
	if decrypted.TradeState == "SUCCESS" {
		status = "success"
	} else if decrypted.TradeState == "CLOSED" || decrypted.TradeState == "REVOKED" || decrypted.TradeState == "PAYERROR" {
		status = "failed"
	}

	amount := float64(decrypted.Amount.Total) / 100.0

	return &NotificationResult{
		OrderNo:       decrypted.OutTradeNo,
		TransactionID: decrypted.TransactionID,
		Amount:        amount,
		Status:        status,
		RawData:       decrypted,
	}, nil
}

// QueryOrder checks payment status with WeChat Pay.
// Note: Full implementation requires WeChat Pay query API.
func (s *WeChatPayService) QueryOrder(_ context.Context, _ string) (*PaymentStatus, error) {
	return nil, fmt.Errorf("wechat_pay QueryOrder not yet implemented")
}
