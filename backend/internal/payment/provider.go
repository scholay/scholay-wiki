// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import "context"

// PaymentProvider defines a unified interface for payment providers.
//
// Both AlipayService and WeChatPayService should evolve to implement this
// interface so that order processing logic can be shared.
//
// Usage example:
//
//	func processPayment(ctx context.Context, provider PaymentProvider, req CreatePaymentRequest) error {
//	    resp, err := provider.CreatePayment(ctx, req)
//	    ...
//	}
type PaymentProvider interface {
	// ProviderName returns the payment provider identifier (e.g. "alipay", "wechat_pay").
	ProviderName() string

	// CreateOrder initiates a payment and returns provider-specific payment data
	// (e.g., a redirect URL for Alipay, a QR code URL for WeChat).
	CreateOrder(ctx context.Context, req CreatePaymentRequest) (*CreatePaymentResponse, error)

	// HandleNotify verifies a payment callback/notification from the provider
	// and returns the parsed result. Each provider has different signature schemes.
	HandleNotify(ctx context.Context, body []byte) (*NotificationResult, error)

	// QueryOrder checks the payment status with the provider.
	QueryOrder(ctx context.Context, orderNo string) (*PaymentStatus, error)
}

// CreatePaymentRequest is a provider-agnostic payment creation request.
type CreatePaymentRequest struct {
	OrderNo     string  `json:"order_no"`
	Amount      float64 `json:"amount"`
	Subject     string  `json:"subject"`
	Description string  `json:"description,omitempty"`
	ReturnURL   string  `json:"return_url,omitempty"` // Alipay redirect
	NotifyURL   string  `json:"notify_url,omitempty"` // Async callback URL
}

// CreatePaymentResponse is a provider-agnostic payment creation response.
type CreatePaymentResponse struct {
	ProviderName  string `json:"provider_name"`
	PaymentURL    string `json:"payment_url,omitempty"`    // Redirect or QR code URL
	TransactionID string `json:"transaction_id,omitempty"` // Provider-side ID
	RawResponse   any    `json:"raw_response,omitempty"`   // Provider-specific data
}

// NotificationResult is a provider-agnostic parsed payment notification.
type NotificationResult struct {
	OrderNo       string  `json:"order_no"`
	TransactionID string  `json:"transaction_id"`
	Amount        float64 `json:"amount"`
	Status        string  `json:"status"` // "success", "failed", "pending"
	RawData       any     `json:"raw_data,omitempty"`
}

// PaymentStatus represents the current state of a payment.
type PaymentStatus struct {
	OrderNo       string  `json:"order_no"`
	TransactionID string  `json:"transaction_id"`
	Amount        float64 `json:"amount"`
	Status        string  `json:"status"` // "success", "failed", "pending", "refunded"
}
