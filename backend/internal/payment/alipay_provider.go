// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"context"
	"fmt"
)

// Compile-time interface check.
var _ PaymentProvider = (*AlipayService)(nil)

// ProviderName returns the payment provider identifier.
func (s *AlipayService) ProviderName() string {
	return "alipay"
}

// CreateOrder creates a payment using the unified provider interface.
func (s *AlipayService) CreateOrder(ctx context.Context, req CreatePaymentRequest) (*CreatePaymentResponse, error) {
	resp, err := s.CreatePayment(PaymentRequest{
		OrderNo:     req.OrderNo,
		Amount:      req.Amount,
		Subject:     req.Subject,
		Description: req.Description,
		ReturnURL:   req.ReturnURL,
	})
	if err != nil {
		return nil, err
	}
	return &CreatePaymentResponse{
		ProviderName: s.ProviderName(),
		PaymentURL:   resp.PaymentURL,
	}, nil
}

// HandleNotify verifies an Alipay payment callback and returns the parsed result.
func (s *AlipayService) HandleNotify(_ context.Context, body []byte) (*NotificationResult, error) {
	params, err := parseFormBody(body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse callback body: %w", err)
	}

	verified, err := s.VerifyCallback(params)
	if err != nil {
		return nil, err
	}
	if !verified {
		return nil, fmt.Errorf("alipay signature verification failed")
	}

	status := "pending"
	if params["trade_status"] == "TRADE_SUCCESS" || params["trade_status"] == "TRADE_FINISHED" {
		status = "success"
	}

	return &NotificationResult{
		OrderNo:       params["out_trade_no"],
		TransactionID: params["trade_no"],
		Status:        status,
		RawData:       params,
	}, nil
}

// QueryOrder checks payment status with Alipay.
// Note: Full implementation requires Alipay trade query API.
func (s *AlipayService) QueryOrder(_ context.Context, _ string) (*PaymentStatus, error) {
	return nil, fmt.Errorf("alipay QueryOrder not yet implemented")
}

// parseFormBody parses URL-encoded form body into a map.
func parseFormBody(body []byte) (map[string]string, error) {
	params := make(map[string]string)
	for _, pair := range splitFormPairs(string(body)) {
		idx := indexOf(pair, '=')
		if idx < 0 {
			continue
		}
		params[pair[:idx]] = pair[idx+1:]
	}
	return params, nil
}

func splitFormPairs(s string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '&' {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

func indexOf(s string, c byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}
