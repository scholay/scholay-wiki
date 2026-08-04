// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 微信支付 v3 HTTP 客户端。
//
// 🔴 为什么不走 internal/common/upstream:
// upstream.Client.Do 在非 2xx 时直接返回 *upstream.Error 并丢弃 http.Header,同时把 body
// 截断到 4096 字节再转成 string。微信 v3 有两条硬性要求与之直接冲突:
//   1. **错误应答也是签名的**,而且必须「先验签、再看状态码」—— 拿不到非 2xx 的
//      Wechatpay-Signature/Serial/Timestamp/Nonce 就无法验签,只能盲信错误体。
//   2. 机器可读的错误码 (ORDERNOTEXIST / ORDER_CLOSED / SIGN_ERROR / NOAUTH …) 都在
//      非 2xx 的 JSON body 里,查单与关单要按它分支;经 Error.Body 只能做子串匹配。
// 另有一条运维原因:upstream 把每个非 2xx 都计入熔断失败,而轮询未支付订单会稳定地
// 收到 404 ORDERNOTEXIST —— 一旦接了查单,共享的 wechat_pay 熔断器会被例行 404 打开,
// 把正在工作的下单接口一起熔断掉。
//
// 所以这里直接用 net/http(复用 httpclient 的连接池),自己做超时与日志。

package payment

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/common/httpclient"
)

// wxAPIBase 微信支付 v3 的正式环境地址。
//
// ⚠️ 没有 v3 沙箱。老代码里的 https://api.mch.weixin.qq.com/sandboxnew/... 是 **v2** 的
// 仿真环境,不承载任何 v3 接口 —— 打开 is_sandbox 只会让所有请求 404。因此
// is_sandbox 字段已不再参与 URL 选择(保留列是为了不破坏既有数据)。
const wxAPIBase = "https://api.mch.weixin.qq.com"

// wxRequestTimeout 单次微信接口调用的超时。下单走用户交互路径,不能太长。
const wxRequestTimeout = 15 * time.Second

// ─── 错误类型 ────────────────────────────────────────────────────────────────

// WeChatAPIError 微信返回的业务错误(验签已通过,只是业务上失败)。
//
// 与「网络错/验签错」严格区分:拿到这个类型说明**确实是微信在说话**,Code 可信,
// 可以据此分支(例如关单时容忍 ORDER_CLOSED,查单时把 ORDERNOTEXIST 当作未支付)。
type WeChatAPIError struct {
	StatusCode int
	Code       string
	Message    string
	RequestID  string
}

func (e *WeChatAPIError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("微信支付接口错误 %s: %s (HTTP %d, Request-ID %s)",
			e.Code, e.Message, e.StatusCode, e.RequestID)
	}
	return fmt.Sprintf("微信支付接口返回 HTTP %d (Request-ID %s)", e.StatusCode, e.RequestID)
}

// wxErrorCode 从 err 里取微信业务错误码;不是业务错误则返回空串。
func wxErrorCode(err error) string {
	var apiErr *WeChatAPIError
	if errors.As(err, &apiErr) {
		return apiErr.Code
	}
	return ""
}

// isWxVerifyProbe 判断是否命中微信的签名探测应答(需要重试一次)。
func isWxVerifyProbe(err error) bool {
	var f *wxVerifyFailure
	return errors.As(err, &f) && f.Reason == wxReasonSignatureProbe
}

// isMissingSignatureHeaders 判断验签失败是否因为应答完全没带 Wechatpay-* 头。
func isMissingSignatureHeaders(err error) bool {
	var f *wxVerifyFailure
	return errors.As(err, &f) && f.Reason == wxReasonMissingHeaders
}

// ─── 验签公钥来源 ────────────────────────────────────────────────────────────

// wxVerifier 按 Wechatpay-Serial 提供验签公钥。
//
// 两种模式(分流规则是微信官方定的,见 wxPubKeyIDPrefix 注释):
//   - 公钥模式:序列号形如 PUB_KEY_ID_0000000001,用商户后台下载的「微信支付公钥」。
//     新开通的商户号默认是这个模式。
//   - 平台证书模式:序列号是证书序列号,需要调 GET /v3/certificates 下载平台证书
//     (用 APIv3 密钥解密),并按序列号缓存。老商户号仍在用,且证书会轮换,
//     所以缓存必须能在遇到未知序列号时自动刷新。
type wxVerifier interface {
	publicKey(ctx context.Context, serial string) (*rsa.PublicKey, error)
	describe() string
}

// wxStaticVerifier 公钥模式:只认一个序列号。
type wxStaticVerifier struct {
	keyID string
	key   *rsa.PublicKey
}

func (v *wxStaticVerifier) describe() string { return "公钥模式(" + v.keyID + ")" }

func (v *wxStaticVerifier) publicKey(_ context.Context, serial string) (*rsa.PublicKey, error) {
	if serial != v.keyID {
		return nil, &wxVerifyFailure{Reason: wxReasonSerialMismatch, Serial: serial}
	}
	return v.key, nil
}

// wxCertVerifier 平台证书模式:按序列号缓存平台证书公钥,未命中时下载。
type wxCertVerifier struct {
	mu      sync.RWMutex
	keys    map[string]*rsa.PublicKey
	fetched time.Time
	// fetch 由 client 注入(下载需要签名请求,而签名是 client 的能力)。
	fetch func(ctx context.Context) (map[string]*rsa.PublicKey, error)
}

func (v *wxCertVerifier) describe() string { return "平台证书模式" }

// wxCertRefreshInterval 平台证书最短重新下载间隔。遇到未知序列号才会触发下载,
// 这个间隔用来防止「一个伪造序列号的回调风暴」把下载接口打爆。
const wxCertRefreshInterval = 5 * time.Minute

func (v *wxCertVerifier) publicKey(ctx context.Context, serial string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	key, ok := v.keys[serial]
	last := v.fetched
	v.mu.RUnlock()
	if ok {
		return key, nil
	}

	// 未知序列号 —— 可能是平台证书轮换了。限速后重新下载一次。
	if time.Since(last) < wxCertRefreshInterval {
		return nil, &wxVerifyFailure{
			Reason: wxReasonNoKey, Serial: serial,
			Detail: "平台证书缓存中没有该序列号,且距上次下载不足 5 分钟",
		}
	}

	keys, err := v.fetch(ctx)
	if err != nil {
		return nil, &wxVerifyFailure{Reason: wxReasonNoKey, Serial: serial, Detail: err.Error()}
	}

	v.mu.Lock()
	v.keys = keys
	v.fetched = time.Now()
	key, ok = v.keys[serial]
	v.mu.Unlock()

	if !ok {
		return nil, &wxVerifyFailure{
			Reason: wxReasonNoKey, Serial: serial,
			Detail: "已刷新平台证书但仍无该序列号,请确认 APIv3 密钥与商户号是否匹配",
		}
	}
	return key, nil
}

// ─── 客户端 ──────────────────────────────────────────────────────────────────

// wxClient 一个商户配置对应一个客户端实例(持有解析好的私钥与验签器)。
type wxClient struct {
	mchID            string
	appID            string
	merchantSerialNo string
	apiV3Key         string
	priv             *rsa.PrivateKey
	verifier         wxVerifier
	// pubKeyID 非空时(公钥模式)作为出站请求的 Wechatpay-Serial 头,
	// 用来告诉微信「请用公钥模式给我签应答」。
	pubKeyID string
	baseURL  string
	hc       *http.Client
	now      func() time.Time
}

// newWxClient 由一份配置构造客户端。任何密钥格式问题在这里一次性暴露,
// 不留到真正下单时才炸。
func newWxClient(cfg *WeChatPayConfig) (*wxClient, error) {
	if cfg == nil {
		return nil, errors.New("微信支付配置为空")
	}
	priv, err := parseWxPrivateKey(cfg.PrivateKey)
	if err != nil {
		return nil, err
	}
	if len(cfg.APIv3Key) != 32 {
		return nil, fmt.Errorf("APIv3 密钥长度必须是 32 个字符,当前 %d 个", len(cfg.APIv3Key))
	}

	c := &wxClient{
		mchID:            cfg.MchID,
		appID:            cfg.AppID,
		merchantSerialNo: wxNormalizeSerial(cfg.SerialNo),
		apiV3Key:         cfg.APIv3Key,
		priv:             priv,
		baseURL:          wxAPIBase,
		hc:               httpclient.WithTimeout(wxRequestTimeout),
		now:              time.Now,
	}

	// 公钥模式 vs 平台证书模式。公钥ID填了就走公钥模式。
	if strings.TrimSpace(cfg.WeChatPayPublicKeyID) != "" {
		keyID := strings.TrimSpace(cfg.WeChatPayPublicKeyID)
		if strings.TrimSpace(cfg.WeChatPayPublicKey) == "" {
			return nil, errors.New("填写了微信支付公钥ID,但没有填微信支付公钥 PEM(两者必须成对)")
		}
		pub, err := parseWxPublicKey(cfg.WeChatPayPublicKey)
		if err != nil {
			return nil, err
		}
		c.verifier = &wxStaticVerifier{keyID: keyID, key: pub}
		c.pubKeyID = keyID
	} else {
		cv := &wxCertVerifier{keys: map[string]*rsa.PublicKey{}}
		cv.fetch = c.downloadPlatformCerts
		c.verifier = cv
	}
	return c, nil
}

// wxResponse 一次微信调用的完整原始应答(验签所需的一切)。
type wxResponse struct {
	StatusCode int
	Header     http.Header
	Body       []byte
}

// do 发一次已签名的请求,并在**看状态码之前**验证应答签名。
//
// verifyResp=false 只用于一个地方:首次下载平台证书(此时手里还没有任何平台证书,
// 是先有鸡还是先有蛋)。微信官方 SDK 同样对这一次调用跳过验签。
func (c *wxClient) do(ctx context.Context, method, path string, body any, verifyResp bool) (*wxResponse, error) {
	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("序列化请求体失败: %w", err)
		}
	}

	fullURL := c.baseURL + path
	// 🔴 签名用的 URL 与实际请求行必须来自同一个字符串,否则一定验签失败。
	canonical, err := wxCanonicalURL(fullURL)
	if err != nil {
		return nil, err
	}

	timestamp := c.now().Unix()
	nonce := wxGenerateNonce(32)
	signature, err := wxSign(c.priv, wxBuildSignMessage(method, canonical, timestamp, nonce, bodyBytes))
	if err != nil {
		return nil, err
	}

	var reqBody io.Reader
	if bodyBytes != nil {
		// 签的是 bodyBytes,发的也必须是同一份 bodyBytes —— 不能再 marshal 一次。
		reqBody = bytes.NewReader(bodyBytes)
	}
	req, err := http.NewRequestWithContext(ctx, method, fullURL, reqBody)
	if err != nil {
		return nil, fmt.Errorf("构造请求失败: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "scholay-scholar/1.0 (wechatpay-v3)")
	req.Header.Set("Authorization",
		wxAuthorizationHeader(c.mchID, c.merchantSerialNo, nonce, signature, timestamp))
	if bodyBytes != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	// 公钥模式下必须带这个头,微信才会用公钥给应答签名。
	if c.pubKeyID != "" {
		req.Header.Set("Wechatpay-Serial", c.pubKeyID)
	}

	httpResp, err := c.hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("微信支付网络请求失败: %w", err)
	}
	defer httpResp.Body.Close()

	// 🔴 必须读原始字节:验签的输入是响应体的**逐字节原文**。
	raw, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取微信应答失败: %w", err)
	}
	resp := &wxResponse{StatusCode: httpResp.StatusCode, Header: httpResp.Header, Body: raw}

	if verifyResp {
		if err := c.verifyResponse(ctx, resp); err != nil {
			// 微信的**网关级**拒绝(商户号不存在、签名错、无权限)发生在签名之前,
			// 那种应答根本不带 Wechatpay-* 头。此时报「缺少验签头」是误导 ——
			// 真正的原因就在这个未签名的错误体里,而它恰恰是最可操作的信息。
			// 只在「非 2xx + 完全没有验签头」这一种组合下改用错误体:
			// 成功应答缺头仍按验签失败处理(那才是真的被反代吃了头,绝不能放行)。
			if isMissingSignatureHeaders(err) && (resp.StatusCode < 200 || resp.StatusCode >= 300) {
				apiErr := c.toAPIError(resp)
				slog.Error("wechat-pay: gateway rejected request (unsigned error response)",
					"path", path, "status", resp.StatusCode,
					"request_id", resp.Header.Get("Request-Id"), "err", apiErr)
				return nil, apiErr
			}
			slog.Error("wechat-pay: response signature verification failed",
				"path", path, "status", resp.StatusCode,
				"request_id", resp.Header.Get("Request-Id"), "err", err)
			return nil, err
		}
	}

	// 验签之后才允许相信状态码与错误体。
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, c.toAPIError(resp)
	}
	return resp, nil
}

// verifyResponse 校验应答签名。
func (c *wxClient) verifyResponse(ctx context.Context, resp *wxResponse) error {
	h := wxSignatureHeaders{
		Timestamp: resp.Header.Get("Wechatpay-Timestamp"),
		Nonce:     resp.Header.Get("Wechatpay-Nonce"),
		Signature: resp.Header.Get("Wechatpay-Signature"),
		Serial:    resp.Header.Get("Wechatpay-Serial"),
		SignType:  resp.Header.Get("Wechatpay-Signature-Type"),
	}
	if f := h.checkPresence(c.now()); f != nil {
		return f
	}
	pub, err := c.verifier.publicKey(ctx, h.Serial)
	if err != nil {
		return err
	}
	if err := wxVerify(pub, wxBuildVerifyMessage(h.Timestamp, h.Nonce, resp.Body), h.Signature); err != nil {
		return &wxVerifyFailure{Reason: wxReasonSignatureInvald, Serial: h.Serial, Detail: err.Error()}
	}
	return nil
}

// toAPIError 把非 2xx 应答转成 *WeChatAPIError。
func (c *wxClient) toAPIError(resp *wxResponse) error {
	var payload struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(resp.Body, &payload) // 解不出来也无所谓,状态码本身已是信息
	return &WeChatAPIError{
		StatusCode: resp.StatusCode,
		Code:       payload.Code,
		Message:    payload.Message,
		RequestID:  resp.Header.Get("Request-Id"),
	}
}

// doJSON 发请求并把成功应答解进 out。
func (c *wxClient) doJSON(ctx context.Context, method, path string, body, out any) error {
	resp, err := c.do(ctx, method, path, body, true)
	// 命中签名探测应答时重试一次(微信会偶发地故意签错来探测商户是否真在验签)。
	if isWxVerifyProbe(err) {
		slog.Warn("wechat-pay: signature probe response, retrying once", "path", path)
		resp, err = c.do(ctx, method, path, body, true)
	}
	if err != nil {
		return err
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(resp.Body, out); err != nil {
		return fmt.Errorf("解析微信应答失败: %w", err)
	}
	return nil
}

// ─── 平台证书下载 ────────────────────────────────────────────────────────────

// downloadPlatformCerts GET /v3/certificates,用 APIv3 密钥解密出平台证书。
//
// 这一次调用**不验签**(手里还没有任何平台证书)。安全性由「必须用商户私钥正确签名
// 才能拿到应答」+「证书内容用 APIv3 密钥 AEAD 解密」共同保证 —— 攻击者既没有私钥
// 也没有 APIv3 密钥,伪造不出能解密成功的应答。
func (c *wxClient) downloadPlatformCerts(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	resp, err := c.do(ctx, http.MethodGet, "/v3/certificates", nil, false)
	if err != nil {
		return nil, err
	}

	var payload struct {
		Data []struct {
			SerialNo           string `json:"serial_no"`
			EncryptCertificate struct {
				Algorithm      string `json:"algorithm"`
				Nonce          string `json:"nonce"`
				AssociatedData string `json:"associated_data"`
				Ciphertext     string `json:"ciphertext"`
			} `json:"encrypt_certificate"`
		} `json:"data"`
	}
	if err := json.Unmarshal(resp.Body, &payload); err != nil {
		return nil, fmt.Errorf("解析平台证书应答失败: %w", err)
	}
	if len(payload.Data) == 0 {
		return nil, errors.New("微信返回的平台证书列表为空")
	}

	keys := make(map[string]*rsa.PublicKey, len(payload.Data))
	for _, item := range payload.Data {
		certPEM, err := wxDecryptResource(c.apiV3Key,
			item.EncryptCertificate.Algorithm,
			item.EncryptCertificate.Ciphertext,
			item.EncryptCertificate.Nonce,
			item.EncryptCertificate.AssociatedData)
		if err != nil {
			return nil, fmt.Errorf("解密平台证书 %s 失败: %w", item.SerialNo, err)
		}
		pub, err := wxPublicKeyFromCertPEM(string(certPEM))
		if err != nil {
			return nil, fmt.Errorf("解析平台证书 %s 失败: %w", item.SerialNo, err)
		}
		keys[wxNormalizeSerial(item.SerialNo)] = pub
		keys[item.SerialNo] = pub // 原样也存一份,避免归一化口径差异导致查不到
	}
	slog.Info("wechat-pay: platform certificates downloaded", "count", len(payload.Data))
	return keys, nil
}

// ─── 业务接口 ────────────────────────────────────────────────────────────────

// wxPrepayRequest 统一下单请求体。Native / H5 / JSAPI 共用大部分字段。
type wxPrepayRequest struct {
	AppID       string       `json:"appid"`
	MchID       string       `json:"mchid"`
	Description string       `json:"description"`
	OutTradeNo  string       `json:"out_trade_no"`
	TimeExpire  string       `json:"time_expire,omitempty"`
	Attach      string       `json:"attach,omitempty"`
	NotifyURL   string       `json:"notify_url"`
	Amount      wxPrepayAmt  `json:"amount"`
	Payer       *wxPrepayPyr `json:"payer,omitempty"`      // JSAPI 必填
	SceneInfo   *wxSceneInfo `json:"scene_info,omitempty"` // H5 必填
}

type wxPrepayAmt struct {
	Total    int    `json:"total"` // 分
	Currency string `json:"currency"`
}

type wxPrepayPyr struct {
	OpenID string `json:"openid"`
}

type wxSceneInfo struct {
	PayerClientIP string    `json:"payer_client_ip"`
	H5Info        *wxH5Info `json:"h5_info,omitempty"`
}

type wxH5Info struct {
	Type string `json:"type"` // Wap / iOS / Android
}

// PrepayNative 扫码支付下单,返回 code_url(二维码内容)。
func (c *wxClient) PrepayNative(ctx context.Context, req *wxPrepayRequest) (string, error) {
	var out struct {
		CodeURL string `json:"code_url"`
	}
	if err := c.doJSON(ctx, http.MethodPost, "/v3/pay/transactions/native", req, &out); err != nil {
		return "", err
	}
	if out.CodeURL == "" {
		return "", errors.New("微信应答里没有 code_url")
	}
	return out.CodeURL, nil
}

// PrepayH5 手机浏览器支付下单,返回 h5_url(跳转地址)。
func (c *wxClient) PrepayH5(ctx context.Context, req *wxPrepayRequest) (string, error) {
	var out struct {
		H5URL string `json:"h5_url"`
	}
	if err := c.doJSON(ctx, http.MethodPost, "/v3/pay/transactions/h5", req, &out); err != nil {
		return "", err
	}
	if out.H5URL == "" {
		return "", errors.New("微信应答里没有 h5_url")
	}
	return out.H5URL, nil
}

// PrepayJSAPI 微信内支付下单,返回 prepay_id。
func (c *wxClient) PrepayJSAPI(ctx context.Context, req *wxPrepayRequest) (string, error) {
	var out struct {
		PrepayID string `json:"prepay_id"`
	}
	if err := c.doJSON(ctx, http.MethodPost, "/v3/pay/transactions/jsapi", req, &out); err != nil {
		return "", err
	}
	if out.PrepayID == "" {
		return "", errors.New("微信应答里没有 prepay_id")
	}
	return out.PrepayID, nil
}

// QueryByOutTradeNo 按商户订单号查单。
//
// 🔴 查询串必须进签名 —— canonical URL 是 path+"?mchid=…"。这里只构造一次 path 字符串,
// do() 里再从同一个字符串推导 canonical,结构上杜绝「签的和发的不一致」。
func (c *wxClient) QueryByOutTradeNo(ctx context.Context, outTradeNo string) (*WeChatPayTransaction, error) {
	path := fmt.Sprintf("/v3/pay/transactions/out-trade-no/%s?mchid=%s",
		url.PathEscape(outTradeNo), url.QueryEscape(c.mchID))
	var out WeChatPayTransaction
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CloseOrder 关闭订单。已关闭 / 不存在都视作成功(幂等)。
func (c *wxClient) CloseOrder(ctx context.Context, outTradeNo string) error {
	path := fmt.Sprintf("/v3/pay/transactions/out-trade-no/%s/close", url.PathEscape(outTradeNo))
	err := c.doJSON(ctx, http.MethodPost, path, map[string]string{"mchid": c.mchID}, nil)
	switch wxErrorCode(err) {
	case "ORDER_CLOSED", "ORDERNOTEXIST", "ORDER_NOT_EXIST":
		return nil
	}
	return err
}

// SecurityEcho POST /v3/security/echo —— 微信官方的「验签测试接口」。
//
// 这是后台「测试配置」按钮的核心:它同时验证了四件事 ——
// 商户号/证书序列号正确、商户私钥签名正确(否则 401)、
// 微信支付公钥ID与公钥PEM配套(否则应答验签失败)、服务器时钟没跑偏。
// 且它**不产生任何真实交易**,可以随便点。
func (c *wxClient) SecurityEcho(ctx context.Context, message string) (string, error) {
	var out struct {
		EchoMessage string `json:"echo_message"`
	}
	err := c.doJSON(ctx, http.MethodPost, "/v3/security/echo",
		map[string]string{"echo_message": message}, &out)
	if err != nil {
		return "", err
	}
	return out.EchoMessage, nil
}

// BuildJSAPIInvokeParams 生成前端 WeixinJSBridge / wx.chooseWXPay 需要的调起参数。
//
// 注意待签串与请求签名**不是一个格式**:这里是 "appId\ntimeStamp\nnonceStr\npackage\n"。
// 每次读取订单都要重新生成(带当前时间戳),不能持久化。
func (c *wxClient) BuildJSAPIInvokeParams(prepayID string) (map[string]string, error) {
	timestamp := fmt.Sprintf("%d", c.now().Unix())
	nonce := wxGenerateNonce(32)
	pkg := "prepay_id=" + prepayID
	msg := fmt.Sprintf("%s\n%s\n%s\n%s\n", c.appID, timestamp, nonce, pkg)
	sig, err := wxSign(c.priv, []byte(msg))
	if err != nil {
		return nil, err
	}
	return map[string]string{
		"appId":     c.appID,
		"timeStamp": timestamp,
		"nonceStr":  nonce,
		"package":   pkg,
		"signType":  "RSA",
		"paySign":   sig,
	}, nil
}

// ─── 客户端缓存 ──────────────────────────────────────────────────────────────

// 每次下单都重新解析 PEM 私钥 + 重新下载平台证书是不可接受的开销,
// 按 (配置ID, 更新时间) 缓存客户端实例;配置一改,key 就变,自然失效。
var (
	wxClientCacheMu sync.Mutex
	wxClientCache   = map[string]*wxClient{}
)

func wxClientFor(cfg *WeChatPayConfig) (*wxClient, error) {
	key := fmt.Sprintf("%d:%d", cfg.ID, cfg.UpdatedAt.UnixNano())

	wxClientCacheMu.Lock()
	defer wxClientCacheMu.Unlock()

	if c, ok := wxClientCache[key]; ok {
		return c, nil
	}
	c, err := newWxClient(cfg)
	if err != nil {
		return nil, err
	}
	// 配置数量极少(通常 1~2 条),但改配置会不断产生新 key,做个上限防泄漏。
	if len(wxClientCache) > 16 {
		wxClientCache = map[string]*wxClient{}
	}
	wxClientCache[key] = c
	return c, nil
}
