// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

// Provider — 统一的支付渠道抽象, 给新增渠道 (Stripe / 银联 / Apple Pay 等) 一个落点。
//
// 设计取舍:
//   - 现有 AlipayService / WeChatPayService 已经各自实现了完整流程, 重构成本高且
//     payment 模块当前业务是"保留预留"(见 CLAUDE.md "支付 订单 等逻辑 需要保留 这是
//     预留的"), 强行抽出来反而提高已运行代码的破坏风险。
//   - 这个 interface 是 **forward-compatible 声明**: 新加 provider 时实现它, 老 provider
//     **可以慢慢适配**, 不强制立刻迁移。
//   - Registry 用 sync.Map (而不是 map + 锁) 因为读多写少 (注册一次, 高频读)。
//
// 用法 (新加 Stripe 渠道时):
//
//	type StripeService struct { ... }
//	func (s *StripeService) Kind() string { return "stripe" }
//	func (s *StripeService) CreatePayment(...) (*PaymentResult, error) { ... }
//	...
//
//	// bootstrap.go:
//	payment.Register("stripe", stripeSvc)
//
//	// handler 里通过 payment.Get(channel) 拿对应 provider, 然后多态调用
//
// 老 provider 接入:
//   现状是 alipay/wechat 各有 handler.go + service.go + repository.go 完整一套;
//   不强制把 service 改成实现这个 interface。但如果 admin 想做"渠道开关" / "统一列表",
//   可以在 alipay_service.go 加几个 adapter 方法满足 interface 即可, 内部 delegate 到现有实现。

import (
	"context"
	"errors"
	"sync"
)

// ProviderKind 是渠道枚举.
type ProviderKind string

const (
	ProviderAlipay   ProviderKind = "alipay"
	ProviderWeChat   ProviderKind = "wechat"
	ProviderStripe   ProviderKind = "stripe"     // 预留 — 海外渠道
	ProviderUnionPay ProviderKind = "union_pay"  // 预留 — 银联
)

// PaymentResult — Provider.CreatePayment 的统一返回。
//
// 不同渠道有不同的"启动支付"语义 (网页跳转 URL / 微信扫码 code_url / Stripe client_secret),
// 这里只承诺 1 个通用字段 (PayURL / Payload) 加渠道特定 raw 数据。前端按 channel 解。
type PaymentResult struct {
	// Channel 标识使用了哪个渠道 (前端按这个判断渲染哪种 UI: 跳转 / 二维码 / Stripe widget)
	Channel ProviderKind `json:"channel"`
	// OrderNo 商户订单号 (回调时找回订单用)
	OrderNo string `json:"order_no"`
	// PayURL 用户被引导到的支付页 URL. 不适用时为空 (e.g. Stripe 用 ClientSecret 走 JS SDK)
	PayURL string `json:"pay_url,omitempty"`
	// QRCodeData Native / 扫码场景的二维码数据 (e.g. 微信 native code_url)
	QRCodeData string `json:"qr_code_data,omitempty"`
	// Raw 渠道特定 payload (e.g. Stripe client_secret, Apple Pay token)
	Raw map[string]any `json:"raw,omitempty"`
}

// PaymentParams 是 CreatePayment 的统一入参. 不同渠道各取所需。
type PaymentParams struct {
	OrderNo     string
	AmountYuan  float64
	Description string
	UserID      uint
	// ReturnURL 用户支付完成后跳回的页面 (web 流程用)
	ReturnURL string
	// NotifyURL 渠道服务端通知 URL (大多数渠道在配置里, 这里允许 per-payment 覆盖)
	NotifyURL string
	// ClientIP 用户 IP (反欺诈 / 国家路由)
	ClientIP string
}

// CallbackResult — 渠道异步回调解析后的标准结果. handler 收到回调后调
// Provider.HandleCallback() 拿这个, 然后走统一的订单 finalize 流程。
type CallbackResult struct {
	OrderNo    string
	Success    bool
	AmountYuan float64
	// TransactionID 渠道侧交易号 (退款 / 对账用)
	TransactionID string
	// PaidAt 用户实际付款完成时间
	PaidAt int64 // unix seconds
	// Raw 渠道原始回调 payload (审计用)
	Raw map[string]any
}

// Provider — 统一支付渠道接口. 新加渠道时实现这个; 老渠道可逐步 adapter 化。
//
// 所有方法接受 ctx, 内部应当遵守 ctx 取消; 网络调用走 common/upstream + circuit breaker。
type Provider interface {
	// Kind 渠道枚举, 用于 registry 注册 + 日志。
	Kind() ProviderKind

	// CreatePayment 开 1 笔支付. 调用方 (handler) 自己负责事务包 / 订单落库 / 余额扣减 / 等。
	CreatePayment(ctx context.Context, p PaymentParams) (*PaymentResult, error)

	// HandleCallback 解析渠道异步回调 (签名校验, payload 反序列化).
	// 返回 (result, nil) 表示这是一笔合法回调; 调用方据 result.Success 决定订单 finalize。
	// 校验失败 / 重放 / 签名错 直接返回 error, 别让恶意请求蒙混过关。
	HandleCallback(ctx context.Context, rawBody []byte, headers map[string]string) (*CallbackResult, error)

	// QueryStatus 查询某订单当前在渠道侧的状态 (兜底: 回调丢了用主动查补).
	QueryStatus(ctx context.Context, orderNo string) (*CallbackResult, error)

	// Refund 发起退款. 部分退款由 AmountYuan 指定, 整单退款传订单原金额。
	Refund(ctx context.Context, orderNo string, amountYuan float64, reason string) error
}

// ─── Registry ─────────────────────────────────────────────────────────────

// ErrProviderNotFound 注册表里没找到对应 kind 的 provider.
var ErrProviderNotFound = errors.New("payment provider not found")

// 注册表 — bootstrap 启动期填好, handler 只读。sync.Map 适合读多写极少的场景。
var providers sync.Map // map[ProviderKind]Provider

// Register 在 registry 里登记一个 provider 实例. 重复注册同 kind 会被覆盖 (符合 hot-reload 语义)。
//
// 通常在 cmd/server/bootstrap.go 调用:
//
//	payment.Register(payment.ProviderAlipay, alipayProvider)
//	payment.Register(payment.ProviderWeChat, wechatProvider)
func Register(kind ProviderKind, p Provider) {
	providers.Store(kind, p)
}

// Get 取一个 provider. 没有返回 ErrProviderNotFound。
func Get(kind ProviderKind) (Provider, error) {
	v, ok := providers.Load(kind)
	if !ok {
		return nil, ErrProviderNotFound
	}
	return v.(Provider), nil
}

// ListKinds 返回所有已注册的 kind. 用于 /api/v1/payment/channels 这种"问平台支持哪些渠道"的接口。
func ListKinds() []ProviderKind {
	var out []ProviderKind
	providers.Range(func(k, _ any) bool {
		out = append(out, k.(ProviderKind))
		return true
	})
	return out
}
