// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 微信支付 v3 的纯密码学层 —— 无网络、无 DB、无 gin,只有字节进字节出。
//
// 单独成文件是因为这一层是整个接入唯一「错了就 100% 不通、且错得很安静」的地方:
// 2026-08-03 之前 wechat_pay_service.go 用 `rsa.SignPKCS1v15(rand, key, 0, digest)` 签名 ——
// hash 参数传 0 表示「digest 已经是完整的 DigestInfo,直接裸签」,于是签出来的东西缺少
// SHA-256 的 ASN.1 前缀,微信侧一律 401 SIGN_ERROR。同包的支付宝实现 (alipay_service.go:291)
// 一直是对的 `crypto.SHA256`,两者并排放着,肉眼极难发现。所以这一层的每个函数都配
// known-answer 测试 (wechat_pay_crypto_test.go),包括一条来自微信官方应答的真实签名向量。
//
// 微信 v3 的三条铁律 (docs: pay.weixin.qq.com/doc/global/v3/zh/4012354988 / 4012354989):
//  1. 请求签名 = SHA256withRSA over "METHOD\nURL\ntimestamp\nnonce\nbody\n" —— 五行,每行以
//     \n 结尾,body 后面还有一个 \n。URL 是**含查询串**的绝对路径 (GET 查单必须带 ?mchid=)。
//  2. 应答/回调验签 = SHA256withRSA over "timestamp\nnonce\n" + 原始响应字节 + "\n"。
//     必须是**原始字节**:任何 JSON 反序列化再序列化、去 BOM、改缩进都会让验签失败。
//  3. 回调资源解密 = AEAD_AES_256_GCM,key 是 APIv3 密钥的原始 UTF-8 字节 (必须 32 字节),
//     nonce/associated_data 也是原始 UTF-8 字节 (nonce 是 12 个 ASCII 字符,不是 hex/base64)。
package payment

import (
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	crand "crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"net/url"
	"strings"
	"time"
)

// wxSignatureType 微信 v3 目前唯一的签名类型。应答头 Wechatpay-Signature-Type 若存在必须等于它。
const wxSignatureType = "WECHATPAY2-SHA256-RSA2048"

// wxPubKeyIDPrefix 微信支付公钥模式的序列号前缀。Wechatpay-Serial 以它开头 → 用「微信支付公钥」
// 验签;否则是老的「平台证书」模式,按证书序列号查平台证书。这个分流规则是微信官方定义的
// (docs: pay.weixin.qq.com/doc/v3/merchant/4015164042),不是本项目的约定。
const wxPubKeyIDPrefix = "PUB_KEY_ID_"

// wxTimestampSkew 应答/回调时间戳允许的偏移。超出即拒 —— 这是 v3 唯一的重放窗口约束。
// 线上表现为「服务器时间不对」,所以错误信息必须点明这一点,否则没人查得出来。
const wxTimestampSkew = 5 * time.Minute

// ─── 密钥解析 ────────────────────────────────────────────────────────────────

// parseWxPrivateKey 解析商户 API 私钥 (apiclient_key.pem)。PKCS#8 优先, 回落 PKCS#1。
//
// 微信商户平台下发的 apiclient_key.pem 是 PKCS#8 ("BEGIN PRIVATE KEY");
// 有些工具链会转成 PKCS#1 ("BEGIN RSA PRIVATE KEY"),两种都收。
func parseWxPrivateKey(pemStr string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(strings.TrimSpace(pemStr)))
	if block == nil {
		return nil, errors.New("私钥不是有效的 PEM 格式(应以 -----BEGIN PRIVATE KEY----- 开头)")
	}

	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("私钥不是 RSA 密钥(实际类型 %T),微信支付要求 RSA2048", key)
		}
		return rsaKey, nil
	}

	rsaKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, errors.New("私钥解析失败:既不是 PKCS#8 也不是 PKCS#1 格式")
	}
	return rsaKey, nil
}

// parseWxPublicKey 解析微信支付公钥 (pub_key.pem)。
//
// 只接受 PKIX/SPKI 的 "BEGIN PUBLIC KEY"。若用户误贴了证书 (BEGIN CERTIFICATE),
// 单独给一条能自救的报错 —— 这是实际配置时最高频的一种贴错。
func parseWxPublicKey(pemStr string) (*rsa.PublicKey, error) {
	trimmed := strings.TrimSpace(pemStr)
	block, _ := pem.Decode([]byte(trimmed))
	if block == nil {
		return nil, errors.New("公钥不是有效的 PEM 格式(应以 -----BEGIN PUBLIC KEY----- 开头)")
	}

	if block.Type == "CERTIFICATE" {
		return nil, errors.New("这里需要的是「微信支付公钥」(-----BEGIN PUBLIC KEY-----),你贴的是证书;" +
			"若你的商户号仍在平台证书模式,请把公钥ID留空并只填 APIv3 密钥,系统会自动下载平台证书")
	}

	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("公钥解析失败: %w", err)
	}
	rsaKey, ok := key.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("公钥不是 RSA 密钥(实际类型 %T)", key)
	}
	return rsaKey, nil
}

// wxPublicKeyFromCertPEM 从 X.509 证书 PEM 里取出 RSA 公钥。
// 平台证书模式下,下载并解密出来的是证书,验签要用的是里面的公钥。
func wxPublicKeyFromCertPEM(certPEM string) (*rsa.PublicKey, error) {
	block, _ := pem.Decode([]byte(strings.TrimSpace(certPEM)))
	if block == nil {
		return nil, errors.New("证书不是有效的 PEM 格式")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("证书解析失败: %w", err)
	}
	pub, ok := cert.PublicKey.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("证书公钥不是 RSA(实际类型 %T)", cert.PublicKey)
	}
	return pub, nil
}

// ─── 请求签名 ────────────────────────────────────────────────────────────────

// wxCanonicalURL 从完整 URL 或路径里取出「签名用 URL」= 绝对路径 + ?查询串。
//
// 🔴 必须与实际发出去的请求行完全一致。旧实现用
// `strings.TrimPrefix(url, "https://api.mch.weixin.qq.com")` —— 一旦 base 变了 (换域名 /
// 走代理 / 测试用 httptest) 就会把整个绝对 URL 签进去,而且天然丢掉查询串,
// GET 查单 (`?mchid=...`) 必然验签失败。用 net/url 解析,让规则跟 base 无关。
func wxCanonicalURL(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("URL 解析失败: %w", err)
	}
	if u.Path == "" {
		return "", fmt.Errorf("URL 缺少路径: %s", rawURL)
	}
	// RequestURI() = EscapedPath + "?" + RawQuery, 正是请求行里的那一段。
	return u.RequestURI(), nil
}

// wxBuildSignMessage 拼请求签名的待签串:五行,每行以 \n 结尾(body 后面也有一个 \n)。
// GET 无 body 时 body 传空串,末尾仍是两个连续 \n。
func wxBuildSignMessage(method, canonicalURL string, timestamp int64, nonce string, body []byte) []byte {
	var b strings.Builder
	b.Grow(len(method) + len(canonicalURL) + len(nonce) + len(body) + 32)
	b.WriteString(strings.ToUpper(method))
	b.WriteByte('\n')
	b.WriteString(canonicalURL)
	b.WriteByte('\n')
	fmt.Fprintf(&b, "%d", timestamp)
	b.WriteByte('\n')
	b.WriteString(nonce)
	b.WriteByte('\n')
	b.Write(body)
	b.WriteByte('\n')
	return []byte(b.String())
}

// wxSign 用商户私钥对待签串做 SHA256withRSA,返回 base64。
//
// 🔴 crypto.SHA256 这个参数是本次修复的核心。传 0 会让 SignPKCS1v15 跳过 DigestInfo 封装,
// 签出的值微信一律判 SIGN_ERROR(401)。
func wxSign(priv *rsa.PrivateKey, message []byte) (string, error) {
	digest := sha256.Sum256(message)
	sig, err := rsa.SignPKCS1v15(crand.Reader, priv, crypto.SHA256, digest[:])
	if err != nil {
		return "", fmt.Errorf("RSA 签名失败: %w", err)
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

// wxAuthorizationHeader 拼 Authorization 头。五个字段顺序无要求(微信文档明说),
// serial_no 是**商户证书序列号**,不是微信支付公钥ID —— 这两个值经常被搞混。
func wxAuthorizationHeader(mchID, merchantSerialNo, nonce, signature string, timestamp int64) string {
	return fmt.Sprintf(
		`%s mchid="%s",nonce_str="%s",timestamp="%d",serial_no="%s",signature="%s"`,
		wxSignatureType, mchID, nonce, timestamp, merchantSerialNo, signature,
	)
}

// ─── 应答 / 回调验签 ─────────────────────────────────────────────────────────

// wxBuildVerifyMessage 拼应答/回调的待验串:"timestamp\nnonce\n" + 原始 body 字节 + "\n"。
//
// 用 []byte 拼接而不是 fmt.Sprintf("%s", body) —— body 可能含非 UTF-8 字节序列,
// 走 string 转换会被替换成 U+FFFD,验签直接失败且毫无提示。
func wxBuildVerifyMessage(timestamp, nonce string, body []byte) []byte {
	msg := make([]byte, 0, len(timestamp)+len(nonce)+len(body)+3)
	msg = append(msg, timestamp...)
	msg = append(msg, '\n')
	msg = append(msg, nonce...)
	msg = append(msg, '\n')
	msg = append(msg, body...)
	msg = append(msg, '\n')
	return msg
}

// wxVerify 验证应答/回调签名。
func wxVerify(pub *rsa.PublicKey, message []byte, signatureB64 string) error {
	sig, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil {
		return fmt.Errorf("签名不是合法 base64: %w", err)
	}
	digest := sha256.Sum256(message)
	if err := rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig); err != nil {
		return fmt.Errorf("RSA 验签失败: %w", err)
	}
	return nil
}

// ─── 验签失败原因分类 ────────────────────────────────────────────────────────

// wxVerifyReason 验签失败的具体原因。
//
// 刻意不做成一个笼统的「验签失败」:线上这几种原因的处置动作完全不同 ——
// 序列号不匹配要去后台换公钥ID,时间戳超窗要去校服务器时钟,缺头通常是被反代吃了头,
// 签名探测要重试一次。混成一条错误信息等于把排查成本全推给运维。
type wxVerifyReason string

const (
	wxReasonOK              wxVerifyReason = ""
	wxReasonMissingHeaders  wxVerifyReason = "MISSING_SIGNATURE_HEADERS"
	wxReasonBadSignType     wxVerifyReason = "UNSUPPORTED_SIGNATURE_TYPE"
	wxReasonSerialMismatch  wxVerifyReason = "SERIAL_MISMATCH"
	wxReasonClockSkew       wxVerifyReason = "TIMESTAMP_OUT_OF_RANGE"
	wxReasonSignatureProbe  wxVerifyReason = "SIGNATURE_PROBE"
	wxReasonSignatureInvald wxVerifyReason = "SIGNATURE_INVALID"
	wxReasonNoKey           wxVerifyReason = "VERIFY_KEY_UNAVAILABLE"
)

// wxSignTestPrefix 微信的「签名探测」应答前缀。微信会偶发地回一个故意签错的应答来探测
// 商户是否真的在验签;命中时应当重试一次而不是判定配置错误。
const wxSignTestPrefix = "WECHATPAY/SIGNTEST/"

// wxVerifyFailure 一次验签失败的完整描述。
type wxVerifyFailure struct {
	Reason  wxVerifyReason
	Serial  string   // 应答/回调头里的 Wechatpay-Serial
	Missing []string // Reason == MissingHeaders 时,缺了哪几个头
	Detail  string   // 面向人的补充说明
}

func (f *wxVerifyFailure) Error() string {
	switch f.Reason {
	case wxReasonMissingHeaders:
		return fmt.Sprintf("微信应答缺少验签头 %s(常见原因:反向代理过滤了 Wechatpay-* 响应头)",
			strings.Join(f.Missing, "、"))
	case wxReasonBadSignType:
		return fmt.Sprintf("微信返回了不支持的签名类型 %s", f.Detail)
	case wxReasonSerialMismatch:
		return fmt.Sprintf("微信应答的验签序列号 %s 与当前配置的微信支付公钥ID不一致"+
			"(请确认公钥ID与公钥PEM来自同一次下载)", f.Serial)
	case wxReasonClockSkew:
		return fmt.Sprintf("微信应答时间戳与本机相差超过 5 分钟(应答 %s),请校准服务器时间", f.Detail)
	case wxReasonSignatureProbe:
		return "收到微信签名探测应答(WECHATPAY/SIGNTEST/),请重试"
	case wxReasonNoKey:
		return fmt.Sprintf("找不到序列号 %s 对应的验签公钥:%s", f.Serial, f.Detail)
	default:
		return fmt.Sprintf("微信应答验签失败:%s", f.Detail)
	}
}

// wxSignatureHeaders 从应答/回调头里取出的验签四要素。
type wxSignatureHeaders struct {
	Timestamp string
	Nonce     string
	Signature string
	Serial    string
	SignType  string
}

// checkPresence 校验四个必需头齐全、签名类型受支持、时间戳在窗口内、不是签名探测。
// 通过后调用方才去取公钥做真正的 RSA 验签。now 由调用方注入以便测试。
func (h wxSignatureHeaders) checkPresence(now time.Time) *wxVerifyFailure {
	var missing []string
	for _, kv := range []struct {
		name  string
		value string
	}{
		{"Wechatpay-Timestamp", h.Timestamp},
		{"Wechatpay-Nonce", h.Nonce},
		{"Wechatpay-Signature", h.Signature},
		{"Wechatpay-Serial", h.Serial},
	} {
		if kv.value == "" {
			missing = append(missing, kv.name)
		}
	}
	if len(missing) > 0 {
		return &wxVerifyFailure{Reason: wxReasonMissingHeaders, Missing: missing, Serial: h.Serial}
	}

	// Signature-Type 缺失是允许的(部分接口不回),但给了就必须是这个值。
	if h.SignType != "" && h.SignType != wxSignatureType {
		return &wxVerifyFailure{Reason: wxReasonBadSignType, Detail: h.SignType, Serial: h.Serial}
	}

	if strings.HasPrefix(h.Signature, wxSignTestPrefix) {
		return &wxVerifyFailure{Reason: wxReasonSignatureProbe, Serial: h.Serial}
	}

	ts, ok := new(big.Int).SetString(h.Timestamp, 10)
	if !ok {
		return &wxVerifyFailure{Reason: wxReasonClockSkew, Detail: h.Timestamp, Serial: h.Serial}
	}
	delta := now.Unix() - ts.Int64()
	if delta < 0 {
		delta = -delta
	}
	if delta > int64(wxTimestampSkew.Seconds()) {
		return &wxVerifyFailure{
			Reason: wxReasonClockSkew,
			Detail: fmt.Sprintf("%s,本机 %d,相差 %d 秒", h.Timestamp, now.Unix(), delta),
			Serial: h.Serial,
		}
	}
	return nil
}

// ─── 回调资源解密 (AEAD_AES_256_GCM) ─────────────────────────────────────────

// wxDecryptResource 解密回调/应答里的 resource 密文。
//
// apiV3Key 必须恰好 32 字节(微信要求 32 个字符的 APIv3 密钥);nonce 与 associated_data
// 都按**原始 UTF-8 字节**用,不做任何解码。密文 base64 解出来后,末尾 16 字节是 GCM tag,
// Go 的 aead.Open 直接接受这种 密文‖tag 的拼接形式,不需要手工切分。
func wxDecryptResource(apiV3Key, algorithm, ciphertextB64, nonce, associatedData string) ([]byte, error) {
	if algorithm != "" && algorithm != "AEAD_AES_256_GCM" {
		return nil, fmt.Errorf("不支持的回调加密算法 %s(仅支持 AEAD_AES_256_GCM)", algorithm)
	}
	if len(apiV3Key) != 32 {
		return nil, fmt.Errorf("APIv3 密钥长度必须是 32 字节,当前 %d 字节", len(apiV3Key))
	}

	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return nil, fmt.Errorf("密文不是合法 base64: %w", err)
	}

	block, err := aes.NewCipher([]byte(apiV3Key))
	if err != nil {
		return nil, fmt.Errorf("创建 AES cipher 失败: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("创建 GCM 失败: %w", err)
	}
	if len(nonce) != aead.NonceSize() {
		return nil, fmt.Errorf("回调 nonce 长度应为 %d,实际 %d", aead.NonceSize(), len(nonce))
	}
	if len(ciphertext) <= aead.Overhead() {
		return nil, errors.New("回调密文长度无效")
	}

	plaintext, err := aead.Open(nil, []byte(nonce), ciphertext, []byte(associatedData))
	if err != nil {
		// AES-GCM 是认证加密:解密失败几乎总是 APIv3 密钥不对(而不是数据损坏)。
		return nil, fmt.Errorf("回调解密失败(通常是 APIv3 密钥不正确): %w", err)
	}
	return plaintext, nil
}

// ─── 商户证书校验 ────────────────────────────────────────────────────────────

// wxNormalizeSerial 归一化证书序列号:去空白、去冒号、转大写。
// openssl 打印出来的序列号形如 1d:de:55:...,商户平台展示的是 1DDE55...,同一个东西。
func wxNormalizeSerial(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == ':' || r == ' ' || r == '\t' || r == '\n' || r == '\r':
			// 丢弃
		case r >= 'a' && r <= 'z':
			b.WriteRune(r - 32)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// wxCertSerialHex 取证书序列号的大写十六进制表示。
//
// 证书序列号在 DER 里是 INTEGER(最小编码),big.Int.Text(16) 会丢掉前导零 ——
// 例如序列号 0x0A2B… 会渲染成 39 位的 "A2B…" 而不是商户平台展示的 40 位 "0A2B…"。
// 这里补齐到偶数位,让它跟商户平台/openssl 的展示对齐。真正的比较用 wxSerialEqual,
// 那里按数值比,前导零多少都不影响。
func wxCertSerialHex(cert *x509.Certificate) string {
	s := strings.ToUpper(cert.SerialNumber.Text(16))
	if len(s)%2 == 1 {
		s = "0" + s
	}
	return s
}

// wxSerialEqual 比较两个证书序列号是否同一个。
//
// 归一化(去冒号空白、转大写)之后**按数值比**而不是按字符串比:前导零的有无
// (0A2B… vs A2B…)在两边的展示习惯里都出现过,按字符串比会给出一条
// 「序列号不匹配」的假报错,而用户手里的两个值肉眼看着是一样的 —— 极难自查。
func wxSerialEqual(a, b string) bool {
	na, nb := wxNormalizeSerial(a), wxNormalizeSerial(b)
	if na == nb {
		return true
	}
	ia, oka := new(big.Int).SetString(na, 16)
	ib, okb := new(big.Int).SetString(nb, 16)
	return oka && okb && ia.Cmp(ib) == 0
}

// wxCertBundleInfo 商户证书校验通过后回给管理端展示的信息。
type wxCertBundleInfo struct {
	SerialNo  string
	SubjectCN string
	NotAfter  time.Time
}

// wxValidateCertBundle 纯本地校验「商户证书 + 商户私钥 + 序列号 + 商户号」四者自洽。
//
// 不需要任何网络调用就能拦掉绝大多数配置错误(贴错文件、贴了别的商户的证书、
// 私钥和证书不是同一次申请生成的、序列号手抄错、证书过期)。五项断言:
//  1. 证书能解析且公钥是 RSA
//  2. 证书序列号 == 填写的商户证书序列号(归一化后)
//  3. 证书 Subject CN == 商户号
//  4. 私钥导出的公钥 SPKI DER == 证书公钥 SPKI DER(即私钥与证书配套)
//  5. 当前时间在证书有效期内
func wxValidateCertBundle(certPEM, privateKeyPEM, merchantSerialNo, mchID string, now time.Time) (*wxCertBundleInfo, error) {
	block, _ := pem.Decode([]byte(strings.TrimSpace(certPEM)))
	if block == nil {
		return nil, errors.New("商户API证书不是有效的 PEM(应以 -----BEGIN CERTIFICATE----- 开头)")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("商户API证书解析失败: %w", err)
	}
	certPub, ok := cert.PublicKey.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("商户API证书公钥不是 RSA(实际类型 %T)", cert.PublicKey)
	}

	actualSerial := wxCertSerialHex(cert)
	if !wxSerialEqual(actualSerial, merchantSerialNo) {
		return nil, fmt.Errorf("商户证书序列号不匹配:apiclient_cert.pem 实际序列号为 %s,你填的是 %s",
			actualSerial, wxNormalizeSerial(merchantSerialNo))
	}

	if cn := cert.Subject.CommonName; cn != "" && cn != mchID {
		return nil, fmt.Errorf("商户号不匹配:apiclient_cert.pem 所属商户号为 %s,你填的是 %s", cn, mchID)
	}

	priv, err := parseWxPrivateKey(privateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("商户API私钥无效: %w", err)
	}
	privSPKI, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("导出私钥公钥失败: %w", err)
	}
	certSPKI, err := x509.MarshalPKIXPublicKey(certPub)
	if err != nil {
		return nil, fmt.Errorf("导出证书公钥失败: %w", err)
	}
	if subtle.ConstantTimeCompare(privSPKI, certSPKI) != 1 {
		return nil, errors.New("商户API私钥与商户API证书不配套;" +
			"请使用同一次申请生成的 apiclient_key.pem 与 apiclient_cert.pem")
	}

	if now.Before(cert.NotBefore) || !now.Before(cert.NotAfter) {
		return nil, fmt.Errorf("商户API证书不在有效期内(有效期至 %s)", cert.NotAfter.Format("2006-01-02"))
	}

	return &wxCertBundleInfo{
		SerialNo:  actualSerial,
		SubjectCN: cert.Subject.CommonName,
		NotAfter:  cert.NotAfter,
	}, nil
}

// wxValidateNotifyURL 校验回调地址:必须 HTTPS、必须有主机名、不带查询串与锚点。
//
// 微信要求回调地址是公网可达的 HTTPS,且不接受带参数的 URL。这里提前拦下来,
// 否则症状是「下单成功但永远收不到回调」—— 最难查的一类问题。
func wxValidateNotifyURL(raw, fieldLabel string) error {
	if strings.TrimSpace(raw) == "" {
		return fmt.Errorf("%s不能为空", fieldLabel)
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("%s不是有效 URL: %w", fieldLabel, err)
	}
	if u.Scheme != "https" {
		return fmt.Errorf("%s必须使用 HTTPS(当前 %s)", fieldLabel, u.Scheme)
	}
	if u.Host == "" {
		return fmt.Errorf("%s缺少域名", fieldLabel)
	}
	if u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("%s不能携带查询参数或锚点", fieldLabel)
	}
	return nil
}

// wxGenerateNonce 生成 length 长的随机串(crypto/rand)。微信只要求 ≤32 位随机串。
func wxGenerateNonce(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	max := big.NewInt(int64(len(charset)))
	for i := range b {
		idx, err := crand.Int(crand.Reader, max)
		if err != nil {
			// crypto/rand 失败在 Linux 上等同于系统级故障;退化到再读一次而不是用弱随机。
			raw := make([]byte, 1)
			_, _ = crand.Read(raw)
			b[i] = charset[int(raw[0])%len(charset)]
			continue
		}
		b[i] = charset[idx.Int64()]
	}
	return string(b)
}
