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
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"
)

// wxOrderTTL 网关侧未支付自动关单时长。与后端 pending 清扫配合,避免
// 「逾期支付却拿到过期会员」。二维码的有效期实际上就是它。
const wxOrderTTL = 120 * time.Minute

// WeChatPayRepo 数据访问契约。
type WeChatPayRepo interface {
	GetAllConfigs() ([]*WeChatPayConfig, error)
	GetActiveConfig() (*WeChatPayConfig, error)
	GetConfigByID(id uint64) (*WeChatPayConfig, error)
	CreateConfig(config *WeChatPayConfig) error
	UpdateConfig(config *WeChatPayConfig) error
	DeleteConfig(id uint64) error
	DeactivateAllConfigs() error
	ActivateConfig(id uint64) error
	// UpdateValidation 只更新校验状态三件套,不碰其他列。
	UpdateValidation(id uint64, status, message string, at time.Time) error
}

// WeChatPayService 微信支付服务。
type WeChatPayService struct {
	repo WeChatPayRepo
}

// NewWeChatPayService 创建微信支付服务。
func NewWeChatPayService(repo WeChatPayRepo) *WeChatPayService {
	return &WeChatPayService{repo: repo}
}

// ─── 配置读写 ────────────────────────────────────────────────────────────────

// GetAllConfigs 列出全部配置。
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

// GetActiveConfig 取当前生效的配置。
//
// 只要求 is_active —— 是否 valid 由 IsAvailable / 下单路径另行把关,
// 这样管理端仍能读到一份「已激活但校验失败」的配置去排查。
func (s *WeChatPayService) GetActiveConfig() (*WeChatPayConfig, error) {
	return s.repo.GetActiveConfig()
}

// IsAvailable 微信支付当前是否真的可用(有激活配置 且 该配置通过了校验)。
//
// 前端「微信支付」按钮应当以此为准,而不是「存在一条 is_active 的行」——
// 后者会在配置还没调通时就给所有用户显示一个必然失败的按钮。
func (s *WeChatPayService) IsAvailable() bool {
	cfg, err := s.repo.GetActiveConfig()
	if err != nil || cfg == nil {
		return false
	}
	return cfg.ValidationStatus == WxValidationValid
}

// wxApplyDTO 把 DTO 写进 config,做全部校验。isCreate 决定必填项的严格度。
//
// 脱敏字段的处理规则:提交上来的值若是脱敏占位(含 "****")或为空,视为「不修改」,
// 保留库里的原值。这条规则错了会直接把真密钥覆盖成一串星号,且要到下一次支付才发现。
func (s *WeChatPayService) wxApplyDTO(config *WeChatPayConfig, dto *WeChatPayConfigDTO, isCreate bool) error {
	config.MchID = strings.TrimSpace(dto.MchID)
	config.AppID = strings.TrimSpace(dto.AppID)
	config.SerialNo = wxNormalizeSerial(dto.SerialNo)
	config.NotifyURL = strings.TrimSpace(dto.NotifyURL)
	config.RefundNotifyURL = strings.TrimSpace(dto.RefundNotifyURL)
	config.WeChatPayPublicKeyID = strings.TrimSpace(dto.WeChatPayPublicKeyID)
	config.IsSandbox = dto.IsSandbox
	// 🔴 刻意**不**从 DTO 写 IsActive。启用只有 ActivateConfig 一条路径,那里会硬性检查
	// validation_status == 'valid'。如果这里跟着 DTO 走,管理员只要在编辑表单里勾上「启用」
	// 就能让一份从未通过测试的配置直接上线 —— 那条闸门就等于不存在了。

	if config.MchID == "" || config.AppID == "" || config.SerialNo == "" {
		return errors.New("商户号、AppID、商户证书序列号均为必填")
	}
	if err := wxValidateNotifyURL(config.NotifyURL, "支付回调地址"); err != nil {
		return err
	}
	// 退款回调可留空:默认由支付回调地址推导,规则与参考实现一致。
	if config.RefundNotifyURL == "" {
		config.RefundNotifyURL = strings.TrimSuffix(config.NotifyURL, "/notify") + "/refund-notify"
	}
	if err := wxValidateNotifyURL(config.RefundNotifyURL, "退款回调地址"); err != nil {
		return err
	}

	modes := dto.PayModes
	if len(modes) == 0 {
		modes = []string{WxPayModeNative}
	}
	normalized := wxParsePayModes(strings.Join(modes, ","))
	if len(normalized) == 0 {
		return fmt.Errorf("支付方式取值非法,只支持 %s", strings.Join(wxAllPayModes, "/"))
	}
	config.PayModes = strings.Join(normalized, ",")

	// —— 敏感字段:空或脱敏 = 保持原值 ——
	setSecret := func(incoming string, current *string, label string, requiredOnCreate bool) error {
		v := strings.TrimSpace(incoming)
		if v == "" || wxIsMaskedValue(v) {
			if isCreate && requiredOnCreate && strings.TrimSpace(*current) == "" {
				return fmt.Errorf("%s为必填", label)
			}
			return nil // 保持原值
		}
		*current = v
		return nil
	}
	if err := setSecret(dto.APIv3Key, &config.APIv3Key, "APIv3 密钥", true); err != nil {
		return err
	}
	if err := setSecret(dto.PrivateKey, &config.PrivateKey, "商户 API 私钥", true); err != nil {
		return err
	}
	if err := setSecret(dto.MerchantCertificate, &config.MerchantCertificate, "商户 API 证书", false); err != nil {
		return err
	}
	if err := setSecret(dto.WeChatPayPublicKey, &config.WeChatPayPublicKey, "微信支付公钥", false); err != nil {
		return err
	}

	// 🔴 公钥ID 是**模式开关**:清空它 = 声明退回平台证书模式,必须连带清掉公钥 PEM。
	//
	// 没有这一步就是一扇单向门:公钥 PEM 走 setSecret,「空 = 保持原值」,于是清空 ID
	// 生效、清空 PEM 不生效,紧接着下面的配对校验(有公钥必须有公钥ID)必然报错 ——
	// 一份存过微信支付公钥的配置**再也回不到平台证书模式**。而这恰恰是最需要走的路:
	// 商户号其实还在平台证书模式时,测试会报 SERIAL_MISMATCH,我们给出的指引正是
	// 「请把公钥ID留空」—— 照做却被自己的校验拒之门外。
	if config.WeChatPayPublicKeyID == "" {
		config.WeChatPayPublicKey = ""
	}

	// —— 密钥自身的格式校验(离线,便宜,先做) ——
	if len(config.APIv3Key) != 32 {
		return fmt.Errorf("APIv3 密钥必须是 32 个字符,当前 %d 个", len(config.APIv3Key))
	}
	if _, err := parseWxPrivateKey(config.PrivateKey); err != nil {
		return fmt.Errorf("商户 API 私钥无效: %w", err)
	}
	if config.WeChatPayPublicKeyID != "" {
		if !strings.HasPrefix(config.WeChatPayPublicKeyID, wxPubKeyIDPrefix) {
			return fmt.Errorf("微信支付公钥ID必须以 %s 开头(在商户平台「API安全」里下载公钥时可见)", wxPubKeyIDPrefix)
		}
		if strings.TrimSpace(config.WeChatPayPublicKey) == "" {
			return errors.New("填写了微信支付公钥ID,就必须同时填写微信支付公钥 PEM")
		}
		if _, err := parseWxPublicKey(config.WeChatPayPublicKey); err != nil {
			return err
		}
	} else if strings.TrimSpace(config.WeChatPayPublicKey) != "" {
		return errors.New("填写了微信支付公钥,就必须同时填写微信支付公钥ID(PUB_KEY_ID_ 开头)")
	}
	if config.MerchantCertificate != "" {
		if _, err := wxValidateCertBundle(config.MerchantCertificate, config.PrivateKey,
			config.SerialNo, config.MchID, time.Now()); err != nil {
			return err
		}
	}
	if config.SupportsMode(WxPayModeJSAPI) && config.AppID == "" {
		return errors.New("开启 JSAPI 支付必须填写 AppID")
	}
	return nil
}

// CreateConfig 新建配置。新建的配置一律 untested + 未激活 —— 必须先通过「测试配置」。
func (s *WeChatPayService) CreateConfig(dto *WeChatPayConfigDTO) error {
	config := &WeChatPayConfig{}
	if err := s.wxApplyDTO(config, dto, true); err != nil {
		return err
	}
	config.ValidationStatus = WxValidationUntested
	config.LastValidationMessage = ""
	// 未经校验的配置不允许直接上线:否则前端立刻给所有用户显示一个必然失败的支付入口。
	config.IsActive = false
	return s.repo.CreateConfig(config)
}

// UpdateConfig 更新配置。任何实质性改动都会把校验状态打回 untested。
func (s *WeChatPayService) UpdateConfig(id uint64, dto *WeChatPayConfigDTO) error {
	config, err := s.repo.GetConfigByID(id)
	if err != nil {
		return err
	}
	before := wxConfigFingerprint(config)
	if err := s.wxApplyDTO(config, dto, false); err != nil {
		return err
	}
	if wxConfigFingerprint(config) != before {
		// 凭证变了,上一次的「校验通过」不再代表什么。同时下线,逼一次重新测试。
		config.ValidationStatus = WxValidationUntested
		config.LastValidationMessage = "配置已修改,请重新测试"
		config.LastValidatedAt = nil
		config.IsActive = false
	}
	return s.repo.UpdateConfig(config)
}

// wxConfigFingerprint 参与「改动是否需要重新校验」判断的字段集合。
func wxConfigFingerprint(c *WeChatPayConfig) string {
	return strings.Join([]string{
		c.MchID, c.AppID, c.SerialNo, c.APIv3Key, c.PrivateKey,
		c.MerchantCertificate, c.WeChatPayPublicKeyID, c.WeChatPayPublicKey, c.NotifyURL,
	}, "\x00")
}

// DeleteConfig 删除配置。
func (s *WeChatPayService) DeleteConfig(id uint64) error {
	return s.repo.DeleteConfig(id)
}

// ActivateConfig 激活配置。
//
// 🔴 硬性要求先通过「测试配置」。这条闸门是本次接入的核心防线:上线前
// 「配置写完就激活」是本项目上一轮微信支付没调通的直接原因 —— 没人知道哪一步错了。
func (s *WeChatPayService) ActivateConfig(id uint64) error {
	config, err := s.repo.GetConfigByID(id)
	if err != nil {
		return err
	}
	if config.ValidationStatus != WxValidationValid {
		return errors.New("该配置尚未通过测试,请先点「测试配置」验证通过后再启用")
	}
	return s.repo.ActivateConfig(id)
}

// ─── 测试配置(后台按钮) ────────────────────────────────────────────────────
//
// 分两段:先跑一遍**离线**检查(不发任何网络请求),再打一次微信官方的
// /v3/security/echo 验签测试接口。离线段能拦掉绝大多数错误且能精确定位到字段;
// 在线段是唯一能证明「微信那边真的认我们」的手段。
// 无论结果如何都返回结构化的逐项诊断,并把结论写回 validation_status。

// TestConfig 测试一份配置的正确性。
func (s *WeChatPayService) TestConfig(ctx context.Context, id uint64) (*WeChatPayTestResult, error) {
	config, err := s.repo.GetConfigByID(id)
	if err != nil {
		return nil, err
	}

	result := &WeChatPayTestResult{OK: true, KeyMode: "platform_cert"}
	if config.UsesPublicKeyMode() {
		result.KeyMode = "public_key"
	}

	// ① 基础字段
	if config.MchID != "" && config.AppID != "" && config.SerialNo != "" {
		result.add("basic", "商户号 / AppID / 证书序列号", WxCheckPass,
			fmt.Sprintf("商户号 %s,AppID %s", config.MchID, config.AppID))
	} else {
		result.add("basic", "商户号 / AppID / 证书序列号", WxCheckFail, "存在未填写的必填项")
	}

	// ② APIv3 密钥长度 —— 错了要到第一次回调解密才炸,提前拦
	if len(config.APIv3Key) == 32 {
		result.add("apiv3", "APIv3 密钥", WxCheckPass, "长度 32 字符,符合要求")
	} else {
		result.add("apiv3", "APIv3 密钥", WxCheckFail,
			fmt.Sprintf("必须是 32 个字符,当前 %d 个;它决定回调能否解密", len(config.APIv3Key)))
	}

	// ③ 商户私钥
	if _, err := parseWxPrivateKey(config.PrivateKey); err != nil {
		result.add("private_key", "商户 API 私钥", WxCheckFail, err.Error())
	} else {
		result.add("private_key", "商户 API 私钥", WxCheckPass, "PEM 解析成功,RSA 密钥")
	}

	// ④ 商户证书 ↔ 私钥 ↔ 序列号 ↔ 商户号 四者自洽
	if strings.TrimSpace(config.MerchantCertificate) == "" {
		result.add("cert_bundle", "商户 API 证书配套性", WxCheckSkip,
			"未上传 apiclient_cert.pem;上传后可离线校验序列号/商户号/私钥是否配套")
	} else if info, err := wxValidateCertBundle(config.MerchantCertificate, config.PrivateKey,
		config.SerialNo, config.MchID, time.Now()); err != nil {
		result.add("cert_bundle", "商户 API 证书配套性", WxCheckFail, err.Error())
	} else {
		result.add("cert_bundle", "商户 API 证书配套性", WxCheckPass,
			fmt.Sprintf("序列号 %s,商户号 %s,有效期至 %s",
				info.SerialNo, info.SubjectCN, info.NotAfter.Format("2006-01-02")))
	}

	// ⑤ 验签模式
	if config.UsesPublicKeyMode() {
		if _, err := parseWxPublicKey(config.WeChatPayPublicKey); err != nil {
			result.add("key_mode", "微信支付公钥", WxCheckFail, err.Error())
		} else {
			result.add("key_mode", "微信支付公钥", WxCheckPass,
				fmt.Sprintf("公钥模式,公钥ID %s", config.WeChatPayPublicKeyID))
		}
	} else {
		result.add("key_mode", "验签模式", WxCheckPass,
			"平台证书模式:未填写微信支付公钥ID,系统将用 APIv3 密钥自动下载并缓存平台证书")
	}

	// ⑥ 回调地址
	notifyErr := wxValidateNotifyURL(config.NotifyURL, "支付回调地址")
	if notifyErr != nil {
		result.add("notify_url", "回调地址", WxCheckFail, notifyErr.Error())
	} else {
		result.add("notify_url", "回调地址", WxCheckPass,
			fmt.Sprintf("%s(需公网可达,微信将向该地址推送支付结果)", config.NotifyURL))
	}

	// —— 离线段失败就不必打网络了:带着坏私钥去调接口只会得到一句 401,反而更难定位。
	if !result.OK {
		result.Summary = "本地校验未通过,已跳过微信接口验证"
		s.persistValidation(config.ID, result)
		return result, nil
	}

	// ⑦ 微信官方验签测试接口 —— 唯一能证明「微信认我们」的一步
	client, err := wxClientFor(config)
	if err != nil {
		result.add("echo", "微信接口验签测试", WxCheckFail, err.Error())
		result.Summary = "客户端初始化失败"
		s.persistValidation(config.ID, result)
		return result, nil
	}

	echo := fmt.Sprintf("SCHOLAY_WXPAY_%d", time.Now().UnixNano())
	got, err := client.SecurityEcho(ctx, echo)
	switch {
	case err != nil:
		result.add("echo", "微信接口验签测试", WxCheckFail, wxExplainTestError(err))
		result.Summary = "微信接口验证失败"
	case got != echo:
		result.add("echo", "微信接口验签测试", WxCheckFail,
			fmt.Sprintf("回显内容不一致(发出 %s,收到 %s)", echo, got))
		result.Summary = "微信接口回显异常"
	default:
		result.add("echo", "微信接口验签测试", WxCheckPass,
			"POST /v3/security/echo 往返成功:商户签名被微信接受,应答验签也通过")
		result.Summary = "配置校验通过,可以启用"
	}

	s.persistValidation(config.ID, result)
	return result, nil
}

// wxExplainTestError 把底层错误翻成「下一步该做什么」。
//
// 微信的错误码本身不解释成因,而这些成因在后台配置场景下高度可枚举 ——
// 直接给出处置动作,比原样回显 SIGN_ERROR 有用得多。
func wxExplainTestError(err error) string {
	var apiErr *WeChatAPIError
	if errors.As(err, &apiErr) {
		switch apiErr.Code {
		case "SIGN_ERROR":
			return "微信判定签名错误(SIGN_ERROR):请检查①商户证书序列号是否与 apiclient_cert.pem 一致" +
				"②商户 API 私钥是否为该商户号同一次申请生成的 apiclient_key.pem。原始信息:" + apiErr.Message
		case "NOAUTH":
			return "商户号无权调用该接口(NOAUTH):请确认商户号已开通 APIv3 并已设置 APIv3 密钥。原始信息:" + apiErr.Message
		case "MCH_NOT_EXISTS":
			return "商户号不存在(MCH_NOT_EXISTS):请核对商户号填写是否正确"
		case "APPID_MCHID_NOT_MATCH":
			return "AppID 与商户号未绑定(APPID_MCHID_NOT_MATCH):请在商户平台完成 AppID 与商户号的绑定"
		}
		return apiErr.Error()
	}

	var vf *wxVerifyFailure
	if errors.As(err, &vf) {
		switch vf.Reason {
		case wxReasonSerialMismatch:
			return "微信应答的验签序列号与配置的公钥ID不一致:请确认「微信支付公钥ID」与「微信支付公钥」" +
				"来自商户平台同一次下载。若你的商户号仍在平台证书模式,请把公钥ID留空。当前应答序列号:" + vf.Serial
		case wxReasonClockSkew:
			return "服务器时间与微信相差超过 5 分钟,请校准宿主机时钟(NTP)。" + vf.Detail
		}
		return vf.Error()
	}
	return err.Error()
}

// persistValidation 把测试结论写回配置行。失败只记日志 —— 测试结果本身已经返回给用户了。
func (s *WeChatPayService) persistValidation(id uint64, result *WeChatPayTestResult) {
	status := WxValidationInvalid
	if result.OK {
		status = WxValidationValid
	}
	msg := result.Summary
	for _, c := range result.Checks {
		if c.Status == WxCheckFail {
			msg = c.Label + ":" + c.Detail
			break
		}
	}
	if len(msg) > 500 {
		msg = msg[:500]
	}
	if err := s.repo.UpdateValidation(id, status, msg, time.Now()); err != nil {
		slog.Error("wechat-pay: persist validation result failed", "config_id", id, "err", err)
	}
}

// ─── 下单 ────────────────────────────────────────────────────────────────────

// WxPrepayParams 统一下单入参。金额来自服务端订单,绝不接受客户端传值。
type WxPrepayParams struct {
	OrderNo     string
	AmountYuan  float64
	Description string
	Mode        string // native / h5 / jsapi
	OpenID      string // jsapi 必填
	ClientIP    string // h5 必填
}

// WxPrepayResult 下单结果。按 Mode 只有对应的一个字段有值。
type WxPrepayResult struct {
	Mode         string            `json:"mode"`
	CodeURL      string            `json:"code_url,omitempty"`      // native:二维码内容
	H5URL        string            `json:"h5_url,omitempty"`        // h5:跳转地址
	PrepayID     string            `json:"prepay_id,omitempty"`     // jsapi
	InvokeParams map[string]string `json:"invoke_params,omitempty"` // jsapi:前端调起参数
	ExpiresAt    int64             `json:"expires_at"`              // unix 秒,二维码/链接失效时间
}

// CreatePrepay 统一下单。
func (s *WeChatPayService) CreatePrepay(ctx context.Context, p WxPrepayParams) (*WxPrepayResult, error) {
	config, err := s.repo.GetActiveConfig()
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("尚未配置微信支付")
		}
		return nil, fmt.Errorf("读取微信支付配置失败: %w", err)
	}
	if config.ValidationStatus != WxValidationValid {
		return nil, errors.New("微信支付配置尚未通过测试,暂不可用")
	}

	mode := strings.ToLower(strings.TrimSpace(p.Mode))
	if mode == "" {
		mode = WxPayModeNative
	}
	if !config.SupportsMode(mode) {
		return nil, fmt.Errorf("当前微信支付配置未开通 %s 支付方式", mode)
	}

	// 🔴 元 → 分用 math.Round 而非 int() 截断:float64 存不下大多数两位小数,
	// 269.00 在二进制里可能是 268.99999999999997,int(x*100) 会截成 26899 —— 少收 1 分,
	// 而履约侧的浮点容差恰好是「严格大于 0.01」,这 1 分差正好被静默放行。
	amountInCents := int(math.Round(p.AmountYuan * 100))
	if amountInCents <= 0 {
		return nil, fmt.Errorf("支付金额非法: %.2f 元", p.AmountYuan)
	}

	description := p.Description
	if description == "" {
		description = "Scholay 学术服务"
	}
	// 微信要求 description ≤127 字符,超长直接报错而不是被网关拒。
	if len([]rune(description)) > 120 {
		description = string([]rune(description)[:120])
	}

	expiresAt := time.Now().Add(wxOrderTTL)
	req := &wxPrepayRequest{
		AppID:       config.AppID,
		MchID:       config.MchID,
		Description: description,
		OutTradeNo:  p.OrderNo,
		// 容器 TZ=Asia/Shanghai → RFC3339 输出 +08:00,不做 UTC 转换(项目铁律)。
		TimeExpire: expiresAt.Format(time.RFC3339),
		Attach:     p.OrderNo,
		NotifyURL:  config.NotifyURL,
		Amount:     wxPrepayAmt{Total: amountInCents, Currency: "CNY"},
	}

	client, err := wxClientFor(config)
	if err != nil {
		return nil, err
	}
	result := &WxPrepayResult{Mode: mode, ExpiresAt: expiresAt.Unix()}

	switch mode {
	case WxPayModeNative:
		codeURL, err := client.PrepayNative(ctx, req)
		if err != nil {
			return nil, err
		}
		result.CodeURL = codeURL

	case WxPayModeH5:
		if p.ClientIP == "" {
			return nil, errors.New("H5 支付需要用户 IP")
		}
		req.SceneInfo = &wxSceneInfo{PayerClientIP: p.ClientIP, H5Info: &wxH5Info{Type: "Wap"}}
		h5URL, err := client.PrepayH5(ctx, req)
		if err != nil {
			return nil, err
		}
		result.H5URL = h5URL

	case WxPayModeJSAPI:
		if p.OpenID == "" {
			return nil, errors.New("微信内支付需要先获取用户 openid")
		}
		req.Payer = &wxPrepayPyr{OpenID: p.OpenID}
		prepayID, err := client.PrepayJSAPI(ctx, req)
		if err != nil {
			return nil, err
		}
		invoke, err := client.BuildJSAPIInvokeParams(prepayID)
		if err != nil {
			return nil, err
		}
		result.PrepayID = prepayID
		result.InvokeParams = invoke

	default:
		return nil, fmt.Errorf("不支持的支付方式 %s", mode)
	}

	slog.Info("wechat-pay: prepay created",
		"order_no", p.OrderNo, "mode", mode, "amount_cents", amountInCents)
	return result, nil
}

// CreateNativeOrder 兼容旧签名的扫码下单(仅返回 code_url)。
func (s *WeChatPayService) CreateNativeOrder(ctx context.Context, orderNo string, amount float64, description string) (string, error) {
	res, err := s.CreatePrepay(ctx, WxPrepayParams{
		OrderNo: orderNo, AmountYuan: amount, Description: description, Mode: WxPayModeNative,
	})
	if err != nil {
		return "", err
	}
	return res.CodeURL, nil
}

// ─── 查单 / 关单 ─────────────────────────────────────────────────────────────

// QueryTransaction 主动查单。这是回调之外的第二条确认通道 ——
// 回调丢了(网络/反代/重启)时,靠它把订单救回来。
//
// 订单在微信侧不存在时返回 (nil, nil):对轮询方而言这只是「还没下单/已过期」,
// 不是错误,不该污染错误日志。
func (s *WeChatPayService) QueryTransaction(ctx context.Context, outTradeNo string) (*WeChatPayTransaction, error) {
	config, err := s.repo.GetActiveConfig()
	if err != nil {
		return nil, fmt.Errorf("读取微信支付配置失败: %w", err)
	}
	client, err := wxClientFor(config)
	if err != nil {
		return nil, err
	}
	tx, err := client.QueryByOutTradeNo(ctx, outTradeNo)
	if err != nil {
		switch wxErrorCode(err) {
		case "ORDERNOTEXIST", "ORDER_NOT_EXIST":
			return nil, nil
		}
		return nil, err
	}
	return tx, nil
}

// CloseTransaction 关闭订单(用户放弃支付/订单超时)。已关闭或不存在都算成功。
func (s *WeChatPayService) CloseTransaction(ctx context.Context, outTradeNo string) error {
	config, err := s.repo.GetActiveConfig()
	if err != nil {
		return fmt.Errorf("读取微信支付配置失败: %w", err)
	}
	client, err := wxClientFor(config)
	if err != nil {
		return err
	}
	return client.CloseOrder(ctx, outTradeNo)
}

// ─── 回调验证 ────────────────────────────────────────────────────────────────

// VerifyNotify 验证并解密回调。
//
// 顺序不可调换:验签 → 解密 → 断言身份。任何一步失败都必须让调用方知道
// 「这不是一条可信的回调」,绝不能因为解密成功就认为可信(解密用的 APIv3 密钥
// 是对称的,而验签用的是微信私钥签、我们用公钥验 —— 只有后者能证明来源)。
//
// 多份配置时按 Wechatpay-Serial 逐个尝试:配置轮换期间新旧回调会并存。
func (s *WeChatPayService) VerifyNotify(ctx context.Context, raw []byte, header http.Header) (*WeChatPayNotifyRequest, *WeChatPayTransaction, error) {
	var envelope WeChatPayNotifyRequest
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, nil, fmt.Errorf("回调报文不是合法 JSON: %w", err)
	}

	configs, err := s.candidateConfigs()
	if err != nil {
		return nil, nil, err
	}
	if len(configs) == 0 {
		return nil, nil, errors.New("尚未配置微信支付,无法验证回调")
	}

	sigHeaders := wxSignatureHeaders{
		Timestamp: header.Get("Wechatpay-Timestamp"),
		Nonce:     header.Get("Wechatpay-Nonce"),
		Signature: header.Get("Wechatpay-Signature"),
		Serial:    header.Get("Wechatpay-Serial"),
		SignType:  header.Get("Wechatpay-Signature-Type"),
	}
	if f := sigHeaders.checkPresence(time.Now()); f != nil {
		return nil, nil, f
	}

	var lastErr error
	for _, config := range configs {
		client, cerr := wxClientFor(config)
		if cerr != nil {
			lastErr = cerr
			continue
		}
		pub, kerr := client.verifier.publicKey(ctx, sigHeaders.Serial)
		if kerr != nil {
			lastErr = kerr
			continue
		}
		msg := wxBuildVerifyMessage(sigHeaders.Timestamp, sigHeaders.Nonce, raw)
		if verr := wxVerify(pub, msg, sigHeaders.Signature); verr != nil {
			lastErr = &wxVerifyFailure{
				Reason: wxReasonSignatureInvald, Serial: sigHeaders.Serial, Detail: verr.Error(),
			}
			continue
		}

		plain, derr := wxDecryptResource(config.APIv3Key, envelope.Resource.Algorithm,
			envelope.Resource.Ciphertext, envelope.Resource.Nonce, envelope.Resource.AssociatedData)
		if derr != nil {
			lastErr = derr
			continue
		}

		var tx WeChatPayTransaction
		if uerr := json.Unmarshal(plain, &tx); uerr != nil {
			return nil, nil, fmt.Errorf("解密后的回调内容不是合法 JSON: %w", uerr)
		}
		// 纵深防御:AES-GCM 已是认证加密,但仍断言商户号/AppID,
		// 挡住「把别的商户的回调转发过来」这类攻击。
		if tx.MchID != "" && tx.MchID != config.MchID {
			return nil, nil, fmt.Errorf("回调商户号不匹配:%s ≠ %s", tx.MchID, config.MchID)
		}
		if tx.AppID != "" && tx.AppID != config.AppID {
			return nil, nil, fmt.Errorf("回调 AppID 不匹配:%s ≠ %s", tx.AppID, config.AppID)
		}
		return &envelope, &tx, nil
	}

	if lastErr == nil {
		lastErr = errors.New("没有任何一份微信支付配置能验证这条回调")
	}
	return nil, nil, lastErr
}

// candidateConfigs 回调验签的候选配置:激活的排前面,其余按序跟上。
func (s *WeChatPayService) candidateConfigs() ([]*WeChatPayConfig, error) {
	all, err := s.repo.GetAllConfigs()
	if err != nil {
		return nil, err
	}
	out := make([]*WeChatPayConfig, 0, len(all))
	for _, c := range all {
		if c.IsActive {
			out = append(out, c)
		}
	}
	for _, c := range all {
		if !c.IsActive {
			out = append(out, c)
		}
	}
	return out, nil
}
