// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"strings"
	"time"
)

// ─── 支付方式 ────────────────────────────────────────────────────────────────

// 微信支付的交易场景。一份商户配置可以同时开多个。
const (
	WxPayModeNative = "native" // 扫码(PC 端二维码)
	WxPayModeH5     = "h5"     // 手机浏览器(非微信内)
	WxPayModeJSAPI  = "jsapi"  // 微信内(公众号/小程序),需要 openid
)

// wxAllPayModes 允许的取值,用于校验用户提交。
var wxAllPayModes = []string{WxPayModeNative, WxPayModeH5, WxPayModeJSAPI}

// ─── 配置 ────────────────────────────────────────────────────────────────────

// 校验状态。只有 valid 的配置才允许被激活并对外服务 —— 这条约束是刻意的:
// 一个没通过 /v3/security/echo 的配置被激活,前端就会立刻给所有用户显示微信支付按钮,
// 而每一次点击都是一次必然失败的下单。
const (
	WxValidationUntested = "untested"
	WxValidationValid    = "valid"
	WxValidationInvalid  = "invalid"
)

// WeChatPayConfig 微信支付商户配置。
//
// 两种验签模式(见 wechat_pay_client.go 的 wxVerifier):
//   - 公钥模式:填 WeChatPayPublicKeyID(PUB_KEY_ID_*)+ WeChatPayPublicKey(PEM)。
//     2024 年后新开通的商户号默认是这个模式。
//   - 平台证书模式:两者留空,系统用 APIv3 密钥自动下载并缓存平台证书。
type WeChatPayConfig struct {
	ID       uint64 `gorm:"primaryKey;autoIncrement" json:"id"`
	MchID    string `gorm:"type:varchar(32);not null" json:"mch_id"`              // 商户号
	AppID    string `gorm:"type:varchar(32);not null" json:"app_id"`              // 微信 AppID(公众号/小程序/开放平台)
	APIv3Key string `gorm:"column:api_v3_key;type:varchar(64);not null" json:"-"` // APIv3 密钥,必须 32 字符
	SerialNo string `gorm:"type:varchar(64);not null" json:"serial_no"`           // 商户 API 证书序列号
	// PrivateKey 商户 API 私钥 apiclient_key.pem 全文。
	PrivateKey string `gorm:"type:text;not null" json:"-"`
	// MerchantCertificate 商户 API 证书 apiclient_cert.pem 全文。
	// 只用于本地自洽校验(序列号/商户号/私钥配对),不参与任何网络调用 —— 但正是它
	// 让「测试配置」能在一次网络请求都不发的情况下报出绝大多数配置错误。
	MerchantCertificate string `gorm:"type:text" json:"-"`
	// WeChatPayPublicKeyID 微信支付公钥ID(PUB_KEY_ID_ 开头)。空 = 走平台证书模式。
	WeChatPayPublicKeyID string `gorm:"column:wechatpay_public_key_id;type:varchar(128);not null;default:''" json:"wechatpay_public_key_id"`
	// WeChatPayPublicKey 微信支付公钥 PEM。与 ID 成对出现。
	WeChatPayPublicKey string `gorm:"column:wechatpay_public_key;type:text" json:"-"`

	NotifyURL       string `gorm:"type:varchar(255);not null" json:"notify_url"`                   // 支付结果回调
	RefundNotifyURL string `gorm:"type:varchar(255);not null;default:''" json:"refund_notify_url"` // 退款结果回调
	PayModes        string `gorm:"type:varchar(64);not null;default:'native'" json:"-"`            // 逗号分隔:native,h5,jsapi
	IsSandbox       bool   `gorm:"type:boolean;not null" json:"is_sandbox"`                        // 历史列;v3 无沙箱,已不参与逻辑
	// IsActive 是否启用。
	//
	// 🔴 GORM tag 里**刻意不写 `default:true`**。GORM 的 `default:` 语义是「该列有 DB 默认值,
	// 字段为零值时从 INSERT 中省略」—— 而 false 正是 bool 的零值。带上 default:true 时,
	// CreateConfig 里显式设的 IsActive=false 会被整个丢掉,DB 默认值 1 生效,
	// 于是「新建的配置一律未启用、必须先测试」这条闸门被静默架空(2026-08-03 实测踩到)。
	// DB 列自己的 DEFAULT 1 仍在(见 0001_baseline),只影响不带该列的裸 INSERT。
	IsActive bool `gorm:"type:boolean;not null" json:"is_active"`

	ValidationStatus      string     `gorm:"type:varchar(12);not null;default:'untested'" json:"validation_status"`
	LastValidationMessage string     `gorm:"type:varchar(500);not null;default:''" json:"last_validation_message"`
	LastValidatedAt       *time.Time `gorm:"type:datetime" json:"last_validated_at"`

	CreatedAt time.Time `gorm:"not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt time.Time `gorm:"not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

func (WeChatPayConfig) TableName() string {
	return "wechat_pay_configs"
}

// PayModeList 把逗号分隔的 PayModes 解析成切片;空值回落到 native。
func (c *WeChatPayConfig) PayModeList() []string {
	out := wxParsePayModes(c.PayModes)
	if len(out) == 0 {
		return []string{WxPayModeNative}
	}
	return out
}

// SupportsMode 判断该配置是否开通了某种支付场景。
func (c *WeChatPayConfig) SupportsMode(mode string) bool {
	for _, m := range c.PayModeList() {
		if m == mode {
			return true
		}
	}
	return false
}

// UsesPublicKeyMode 是否走微信支付公钥模式(而非平台证书模式)。
func (c *WeChatPayConfig) UsesPublicKeyMode() bool {
	return strings.TrimSpace(c.WeChatPayPublicKeyID) != ""
}

// wxParsePayModes 解析并去重、过滤非法值,保持 native→h5→jsapi 的稳定顺序。
func wxParsePayModes(raw string) []string {
	seen := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		p := strings.TrimSpace(strings.ToLower(part))
		if p != "" {
			seen[p] = true
		}
	}
	var out []string
	for _, m := range wxAllPayModes {
		if seen[m] {
			out = append(out, m)
		}
	}
	return out
}

// ─── DTO ─────────────────────────────────────────────────────────────────────

// WeChatPayConfigDTO 管理端读写用。密钥字段默认脱敏。
//
// ⚠️ 与 frontend-user/src/features/admin/api/payment.ts 的 WeChatPayConfig 一一对应,
// 改这里必须同步改那里(没有契约测试兜底)。
type WeChatPayConfigDTO struct {
	ID       uint64 `json:"id"`
	MchID    string `json:"mch_id"`
	AppID    string `json:"app_id"`
	APIv3Key string `json:"api_v3_key,omitempty"`
	SerialNo string `json:"serial_no"`

	PrivateKey          string `json:"private_key,omitempty"`
	MerchantCertificate string `json:"merchant_certificate,omitempty"`

	WeChatPayPublicKeyID string `json:"wechatpay_public_key_id"`
	WeChatPayPublicKey   string `json:"wechatpay_public_key,omitempty"`

	NotifyURL       string   `json:"notify_url"`
	RefundNotifyURL string   `json:"refund_notify_url"`
	PayModes        []string `json:"pay_modes"`
	IsSandbox       bool     `json:"is_sandbox"`
	IsActive        bool     `json:"is_active"`

	// 只读回显字段(创建/更新时忽略)。
	KeyMode               string `json:"key_mode"` // public_key | platform_cert
	ValidationStatus      string `json:"validation_status"`
	LastValidationMessage string `json:"last_validation_message"`
	LastValidatedAt       string `json:"last_validated_at"`
	CreatedAt             string `json:"created_at"`
	UpdatedAt             string `json:"updated_at"`

	// 敏感字段「是否已配置」—— 脱敏后前端无法从值本身判断,单独给布尔位,
	// 这样表单能显示「已配置,留空则不修改」而不是让人误以为没填过。
	PrivateKeyConfigured  bool `json:"private_key_configured"`
	CertificateConfigured bool `json:"merchant_certificate_configured"`
	APIv3KeyConfigured    bool `json:"api_v3_key_configured"`
	PublicKeyConfigured   bool `json:"wechatpay_public_key_configured"`
}

// wxMaskedPEM 脱敏后的 PEM 占位串。前端据此判断「有值但不给看」。
const wxMaskedPEM = "-----BEGIN ******-----\n********\n-----END ******-----"

// wxIsMaskedValue 判断提交上来的值是不是脱敏占位(= 用户没改这一项)。
//
// 同时认 "****"(本模块历史脱敏格式)与 utils.MaskedSecretValue("********",
// 其余模块的统一格式)—— 两种都含 "****",一个判断覆盖两代格式。
func wxIsMaskedValue(v string) bool {
	return strings.Contains(v, "****")
}

// ToDTO 转 DTO。showKeys=false 时密钥脱敏。
func (c *WeChatPayConfig) ToDTO(showKeys bool) *WeChatPayConfigDTO {
	keyMode := "platform_cert"
	if c.UsesPublicKeyMode() {
		keyMode = "public_key"
	}
	dto := &WeChatPayConfigDTO{
		ID:                    c.ID,
		MchID:                 c.MchID,
		AppID:                 c.AppID,
		SerialNo:              c.SerialNo,
		WeChatPayPublicKeyID:  c.WeChatPayPublicKeyID,
		NotifyURL:             c.NotifyURL,
		RefundNotifyURL:       c.RefundNotifyURL,
		PayModes:              c.PayModeList(),
		IsSandbox:             c.IsSandbox,
		IsActive:              c.IsActive,
		KeyMode:               keyMode,
		ValidationStatus:      c.ValidationStatus,
		LastValidationMessage: c.LastValidationMessage,
		CreatedAt:             wxFormatTime(&c.CreatedAt),
		UpdatedAt:             wxFormatTime(&c.UpdatedAt),
		LastValidatedAt:       wxFormatTime(c.LastValidatedAt),
		PrivateKeyConfigured:  strings.TrimSpace(c.PrivateKey) != "",
		CertificateConfigured: strings.TrimSpace(c.MerchantCertificate) != "",
		APIv3KeyConfigured:    strings.TrimSpace(c.APIv3Key) != "",
		PublicKeyConfigured:   strings.TrimSpace(c.WeChatPayPublicKey) != "",
	}

	if showKeys {
		dto.APIv3Key = c.APIv3Key
		dto.PrivateKey = c.PrivateKey
		dto.MerchantCertificate = c.MerchantCertificate
		dto.WeChatPayPublicKey = c.WeChatPayPublicKey
		return dto
	}

	if c.APIv3Key != "" {
		dto.APIv3Key = wxMaskTail(c.APIv3Key)
	}
	if c.PrivateKey != "" {
		dto.PrivateKey = wxMaskedPEM
	}
	if c.MerchantCertificate != "" {
		dto.MerchantCertificate = wxMaskedPEM
	}
	if c.WeChatPayPublicKey != "" {
		dto.WeChatPayPublicKey = wxMaskedPEM
	}
	return dto
}

// wxMaskTail 保留首尾各 4 位,中间打码。
func wxMaskTail(s string) string {
	if len(s) <= 8 {
		return "********"
	}
	return s[:4] + "********" + s[len(s)-4:]
}

// wxFormatTime 统一时间序列化。跟随容器本地时区(项目铁律:不做 UTC 转换)。
func wxFormatTime(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.Format("2006-01-02 15:04:05")
}

// ─── 回调 ────────────────────────────────────────────────────────────────────

// 回调事件类型。必须显式判断:支付成功与退款成功走的是同一套信封结构,
// 只靠 trade_state 分不出来,把 REFUND.SUCCESS 当成付款处理会凭空发货。
const (
	WxEventTransactionSuccess = "TRANSACTION.SUCCESS"
	WxEventRefundSuccess      = "REFUND.SUCCESS"
	WxEventRefundAbnormal     = "REFUND.ABNORMAL"
	WxEventRefundClosed       = "REFUND.CLOSED"
)

// WeChatPayNotifyRequest 回调信封(未解密)。
type WeChatPayNotifyRequest struct {
	ID           string                  `json:"id"`
	CreateTime   string                  `json:"create_time"`
	ResourceType string                  `json:"resource_type"`
	EventType    string                  `json:"event_type"`
	Summary      string                  `json:"summary"`
	Resource     WeChatPayNotifyResource `json:"resource"`
}

// WeChatPayNotifyResource 回调密文。
type WeChatPayNotifyResource struct {
	Algorithm      string `json:"algorithm"`
	Ciphertext     string `json:"ciphertext"`
	AssociatedData string `json:"associated_data"`
	OriginalType   string `json:"original_type"`
	Nonce          string `json:"nonce"`
}

// WeChatPayTransaction 解密后的支付单 —— 同时也是查单接口的应答结构。
// 回调与主动查单返回同一套字段,共用一个类型可以让两条确认通道汇入同一个校验函数。
type WeChatPayTransaction struct {
	MchID          string                `json:"mchid"`
	AppID          string                `json:"appid"`
	OutTradeNo     string                `json:"out_trade_no"`
	TransactionID  string                `json:"transaction_id"`
	TradeType      string                `json:"trade_type"`
	TradeState     string                `json:"trade_state"`
	TradeStateDesc string                `json:"trade_state_desc"`
	BankType       string                `json:"bank_type"`
	Attach         string                `json:"attach"`
	SuccessTime    string                `json:"success_time"`
	Payer          WeChatPayNotifyPayer  `json:"payer"`
	Amount         WeChatPayNotifyAmount `json:"amount"`
}

// 交易状态。
const (
	WxTradeStateSuccess    = "SUCCESS"
	WxTradeStateRefund     = "REFUND"
	WxTradeStateNotPay     = "NOTPAY"
	WxTradeStateClosed     = "CLOSED"
	WxTradeStateRevoked    = "REVOKED"
	WxTradeStateUserPaying = "USERPAYING"
	WxTradeStatePayError   = "PAYERROR"
)

// WeChatPayNotifyPayer 支付者。
type WeChatPayNotifyPayer struct {
	OpenID string `json:"openid"`
}

// WeChatPayNotifyAmount 金额(单位:分)。
type WeChatPayNotifyAmount struct {
	Total         int    `json:"total"`
	PayerTotal    int    `json:"payer_total"`
	Currency      string `json:"currency"`
	PayerCurrency string `json:"payer_currency"`
}

// WeChatPayNotifyDecrypted 兼容别名 —— 老代码用的是这个名字。
type WeChatPayNotifyDecrypted = WeChatPayTransaction

// ─── 配置测试结果 ────────────────────────────────────────────────────────────

// 单项检查的结果。
const (
	WxCheckPass = "pass"
	WxCheckFail = "fail"
	WxCheckSkip = "skip"
)

// WeChatPayCheck 「测试配置」里的一项检查。
type WeChatPayCheck struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Status string `json:"status"`
	Detail string `json:"detail"`
}

// WeChatPayTestResult 「测试配置」的完整结果。
//
// 🔴 无论通过与否都以 HTTP 200 返回 —— 前端的 apiToast 在失败分支会丢掉响应体,
// 用 4xx 表达「配置有问题」会让用户只看到一句笼统的失败提示,拿不到逐项诊断。
type WeChatPayTestResult struct {
	OK      bool             `json:"ok"`
	KeyMode string           `json:"key_mode"`
	Summary string           `json:"summary"`
	Checks  []WeChatPayCheck `json:"checks"`
}

// add 追加一项检查结果,并在失败时把整体判负。
func (r *WeChatPayTestResult) add(key, label, status, detail string) {
	r.Checks = append(r.Checks, WeChatPayCheck{Key: key, Label: label, Status: status, Detail: detail})
	if status == WxCheckFail {
		r.OK = false
	}
}
