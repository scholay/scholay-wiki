// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 微信支付 v3 密码学层的 known-answer 测试。
//
// 为什么这些测试必须存在:签名/验签错了的表现是「微信返回 401」——
// 一句话,没有栈,没有字段名,本地跑不出来。2026-08-03 之前的实现就错在
// `rsa.SignPKCS1v15(rand, key, 0, digest)` 的那个 0 上,肉眼与编译器都发现不了。
// 因此这一层的每个函数都必须有独立的、不依赖网络的断言。

package payment

import (
	"bytes"
	"context"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ─── 官方向量 ────────────────────────────────────────────────────────────────

// 来自微信官方应答的真实签名向量(经参考项目 aisearch2 的线上实现独立验证)。
// 它同时锁死三件事:待验串的拼法、SHA256withRSA、base64 解码。
const (
	katPublicKeyPEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwXNI6sdlknHBnK8Fu2U6
Cwor9qY747jP8KAfeBMeveEt1TqaHkLfaSD07trZLhGpfs8/AHqjhgSMO1O10YQW
OrrJ4hjIWPKqxbgrYMkBQc+mwdiWp4W3ByCqxBRagCveCXRWCmuJYovl9H/bsDI0
iGbpVtEOghJtfciisYSgxcLufUDTRkvwxjIBK1pCRjk33jJ5YTBWTHMRtMAOcFLN
F6hdEYdX8SPsgHHeLZ5Lv2T/686w1xtgCHef/sd4uSfWmyzsalQdHG/e4IyYmrhx
+O3VBoNDzE3nx23bFeV/RVNCG7cV6VhmYokJNHa/erIPkEmEFID6A5wQOXuxUkmJ
WwIDAQAB
-----END PUBLIC KEY-----`

	katBody      = `{"code_url":"weixin://wxpay/bizpayurl?pr=JyC91EIz1"}`
	katTimestamp = "1722850421"
	katNonce     = "d824f2e086d3c1df967785d13fcd22ef"
	katSerial    = "4DF076AC5A7D968D4A8B0B9C599A74CB4CF8EE8A"
	katSignature = "mfI1CPqvBrgcXfgXMFjdNIhBf27ACE2YyeWsWV9ZI7T7RU0vHvbQpu9Z32ogzc+k8ZC5n3kz7h70eWKjgqNdKQF0eRp8mVKlmfzMLBVHbssB9jEZEDXThOX1XFqX7s7ymia1hoHQxQagPGzkdWxtlZPZ4ZPvr1RiqkgAu6Is8MZgXXrRoBKqjmSdrP1N7uxzJ/cjfSiis9FiLjuADoqmQ1P7p2N876YPAol7Rn0+GswwAwxldbdLrmVSjfytfSBJFqTMHn4itojgxSWWN1byuckQt8hSTEv/Lg97QoeGniYP17T80pJeQyL3b+295FPHSO2AtvCgyIbKMZ0BALilAA=="
)

// TestVerifyOfficialSignatureVector 用微信真实应答验证整条验签链路。
func TestVerifyOfficialSignatureVector(t *testing.T) {
	pub, err := parseWxPublicKey(katPublicKeyPEM)
	if err != nil {
		t.Fatalf("parseWxPublicKey: %v", err)
	}
	msg := wxBuildVerifyMessage(katTimestamp, katNonce, []byte(katBody))

	if want := katTimestamp + "\n" + katNonce + "\n" + katBody + "\n"; string(msg) != want {
		t.Fatalf("待验串拼错了\n got: %q\nwant: %q", msg, want)
	}
	if err := wxVerify(pub, msg, katSignature); err != nil {
		t.Fatalf("官方向量验签失败(说明验签实现有问题): %v", err)
	}
}

// TestVerifyRejectsTamperedBody body 改一个字节就必须验不过。
func TestVerifyRejectsTamperedBody(t *testing.T) {
	pub, err := parseWxPublicKey(katPublicKeyPEM)
	if err != nil {
		t.Fatalf("parseWxPublicKey: %v", err)
	}
	tampered := strings.Replace(katBody, "JyC91EIz1", "JyC91EIz2", 1)
	if err := wxVerify(pub, wxBuildVerifyMessage(katTimestamp, katNonce, []byte(tampered)), katSignature); err == nil {
		t.Fatal("篡改后的 body 竟然验签通过了")
	}
}

// ─── 回归:crypto.Hash(0) 就是那个 bug ───────────────────────────────────────

// TestSignMustUseSHA256DigestInfo 锁死本次修复。
//
// 旧实现 `rsa.SignPKCS1v15(rand, key, 0, digest)` 里的 0 表示「digest 已是完整
// DigestInfo,直接裸签」,签出来的东西缺少 SHA-256 的 ASN.1 前缀。这个测试证明:
// 用 0 签出来的值,按 SHA256withRSA(也就是微信侧的算法)验一定不通过 ——
// 即微信必然回 SIGN_ERROR。只要有人把 crypto.SHA256 改回 0,这个测试就会红。
func TestSignMustUseSHA256DigestInfo(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	msg := []byte("POST\n/v3/pay/transactions/native\n1722850421\nabc\n{}\n")
	digest := sha256.Sum256(msg)

	// 正确实现:必须验得过。
	goodB64, err := wxSign(key, msg)
	if err != nil {
		t.Fatalf("wxSign: %v", err)
	}
	good, _ := base64.StdEncoding.DecodeString(goodB64)
	if err := rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, digest[:], good); err != nil {
		t.Fatalf("wxSign 的产物按 SHA256withRSA 验不过: %v", err)
	}

	// 旧的坏实现:必须验不过(否则这个 bug 根本不存在,测试也就没意义了)。
	bad, err := rsa.SignPKCS1v15(rand.Reader, key, 0, digest[:])
	if err != nil {
		t.Fatalf("对照组签名失败: %v", err)
	}
	if err := rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, digest[:], bad); err == nil {
		t.Fatal("hash=0 签出来的值竟然按 SHA256withRSA 验过了 —— 该回归测试已失效,请重新设计")
	}
	if bytes.Equal(good, bad) {
		t.Fatal("crypto.SHA256 与 hash=0 签出了相同的值 —— 不可能,测试写错了")
	}
}

// ─── 请求签名串 ──────────────────────────────────────────────────────────────

func TestBuildSignMessage(t *testing.T) {
	cases := []struct {
		name     string
		method   string
		url      string
		body     []byte
		expected string
	}{
		{
			name: "POST 带 body", method: "POST", url: "/v3/pay/transactions/native",
			body:     []byte(`{"a":1}`),
			expected: "POST\n/v3/pay/transactions/native\n1700000000\nNONCE\n{\"a\":1}\n",
		},
		{
			// GET 无 body:body 位置是空串,所以末尾是两个连续换行。
			name: "GET 无 body 带查询串", method: "GET",
			url: "/v3/pay/transactions/out-trade-no/X1?mchid=190000", body: nil,
			expected: "GET\n/v3/pay/transactions/out-trade-no/X1?mchid=190000\n1700000000\nNONCE\n\n",
		},
		{
			name: "method 自动大写", method: "post", url: "/v3/security/echo",
			body:     []byte(`{}`),
			expected: "POST\n/v3/security/echo\n1700000000\nNONCE\n{}\n",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := string(wxBuildSignMessage(tc.method, tc.url, 1700000000, "NONCE", tc.body))
			if got != tc.expected {
				t.Errorf("待签串不对\n got: %q\nwant: %q", got, tc.expected)
			}
		})
	}
}

// TestCanonicalURL 查询串必须进签名 —— 旧实现用 TrimPrefix 会把它丢掉。
func TestCanonicalURL(t *testing.T) {
	cases := []struct{ in, want string }{
		{"https://api.mch.weixin.qq.com/v3/pay/transactions/native", "/v3/pay/transactions/native"},
		{"https://api.mch.weixin.qq.com/v3/pay/transactions/out-trade-no/A1?mchid=190", "/v3/pay/transactions/out-trade-no/A1?mchid=190"},
		// 换个 host 也必须只取路径(旧实现会把整个绝对 URL 签进去)。
		{"https://example.test/v3/security/echo", "/v3/security/echo"},
	}
	for _, tc := range cases {
		got, err := wxCanonicalURL(tc.in)
		if err != nil {
			t.Fatalf("wxCanonicalURL(%q): %v", tc.in, err)
		}
		if got != tc.want {
			t.Errorf("wxCanonicalURL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// ─── AES-GCM 回调解密 ────────────────────────────────────────────────────────

func TestDecryptResource(t *testing.T) {
	const key = "0123456789abcdef0123456789abcdef" // 32 字节
	const nonce = "123456789012"                   // 12 字节
	const aad = "transaction"
	plaintext := `{"out_trade_no":"X1","trade_state":"SUCCESS"}`

	block, err := aes.NewCipher([]byte(key))
	if err != nil {
		t.Fatalf("NewCipher: %v", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatalf("NewGCM: %v", err)
	}
	// Seal 产出的就是 密文‖tag —— 与微信下发的格式一致。
	sealed := aead.Seal(nil, []byte(nonce), []byte(plaintext), []byte(aad))
	ct := base64.StdEncoding.EncodeToString(sealed)

	got, err := wxDecryptResource(key, "AEAD_AES_256_GCM", ct, nonce, aad)
	if err != nil {
		t.Fatalf("wxDecryptResource: %v", err)
	}
	if string(got) != plaintext {
		t.Errorf("解密结果不对\n got: %s\nwant: %s", got, plaintext)
	}

	t.Run("错误的 APIv3 密钥必须失败", func(t *testing.T) {
		if _, err := wxDecryptResource("ffffffffffffffffffffffffffffffff",
			"AEAD_AES_256_GCM", ct, nonce, aad); err == nil {
			t.Fatal("用错密钥竟然解密成功了")
		}
	})
	t.Run("篡改 AAD 必须失败", func(t *testing.T) {
		if _, err := wxDecryptResource(key, "AEAD_AES_256_GCM", ct, nonce, "refund"); err == nil {
			t.Fatal("AAD 不匹配竟然解密成功了")
		}
	})
	t.Run("密钥长度不对要给出明确报错", func(t *testing.T) {
		_, err := wxDecryptResource("short", "AEAD_AES_256_GCM", ct, nonce, aad)
		if err == nil || !strings.Contains(err.Error(), "32") {
			t.Fatalf("期望一条点明长度要求的错误, got %v", err)
		}
	})
	t.Run("不支持的算法要拒绝", func(t *testing.T) {
		if _, err := wxDecryptResource(key, "AES_CBC", ct, nonce, aad); err == nil {
			t.Fatal("未知算法竟然被接受了")
		}
	})
}

// ─── 验签头校验 ──────────────────────────────────────────────────────────────

func TestSignatureHeaderChecks(t *testing.T) {
	now := time.Unix(1722850421, 0)
	base := wxSignatureHeaders{
		Timestamp: "1722850421", Nonce: "n", Signature: "s", Serial: "S",
		SignType: wxSignatureType,
	}

	if f := base.checkPresence(now); f != nil {
		t.Fatalf("正常头不该失败: %v", f)
	}

	cases := []struct {
		name   string
		mutate func(*wxSignatureHeaders)
		now    time.Time
		reason wxVerifyReason
	}{
		{"缺签名头", func(h *wxSignatureHeaders) { h.Signature = "" }, now, wxReasonMissingHeaders},
		{"缺序列号", func(h *wxSignatureHeaders) { h.Serial = "" }, now, wxReasonMissingHeaders},
		{"签名类型不支持", func(h *wxSignatureHeaders) { h.SignType = "WECHATPAY2-SM2" }, now, wxReasonBadSignType},
		{"签名探测", func(h *wxSignatureHeaders) { h.Signature = wxSignTestPrefix + "x" }, now, wxReasonSignatureProbe},
		{"时钟超前 10 分钟", func(*wxSignatureHeaders) {}, now.Add(10 * time.Minute), wxReasonClockSkew},
		{"时钟落后 10 分钟", func(*wxSignatureHeaders) {}, now.Add(-10 * time.Minute), wxReasonClockSkew},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := base
			tc.mutate(&h)
			f := h.checkPresence(tc.now)
			if f == nil {
				t.Fatalf("期望失败原因 %s,实际通过了", tc.reason)
			}
			if f.Reason != tc.reason {
				t.Errorf("失败原因 = %s, want %s", f.Reason, tc.reason)
			}
			if f.Error() == "" {
				t.Error("错误信息为空 —— 排查时没有任何线索")
			}
		})
	}

	t.Run("签名类型缺失是允许的", func(t *testing.T) {
		h := base
		h.SignType = ""
		if f := h.checkPresence(now); f != nil {
			t.Fatalf("Signature-Type 缺失不该被拒: %v", f)
		}
	})
}

// ─── 序列号归一化 ────────────────────────────────────────────────────────────

func TestSerialNormalizeAndCompare(t *testing.T) {
	const openssl = "1d:de:55:ad:98:ed:71:d6:ed:d4:a4:a1:69:96:de:7b:47:77:3a:8c"
	const platform = "1DDE55AD98ED71D6EDD4A4A16996DE7B47773A8C"

	if got := wxNormalizeSerial(openssl); got != platform {
		t.Errorf("wxNormalizeSerial = %q, want %q", got, platform)
	}
	if !wxSerialEqual(openssl, platform) {
		t.Error("openssl 风格与商户平台风格应当判为同一序列号")
	}
	// 前导零:两种写法都在真实环境出现过,必须判等,否则会给出假报错。
	if !wxSerialEqual("0A2B3C", "A2B3C") {
		t.Error("前导零差异不该导致序列号不匹配")
	}
	if wxSerialEqual("1DDE55", "1DDE56") {
		t.Error("不同序列号被判等了")
	}
}

// ─── 回调地址校验 ────────────────────────────────────────────────────────────

func TestValidateNotifyURL(t *testing.T) {
	cases := []struct {
		in   string
		ok   bool
		name string
	}{
		{"https://a.example.com/api/v1/payment/wechat/notify", true, "正常 HTTPS"},
		{"http://a.example.com/notify", false, "HTTP 不允许"},
		{"https://a.example.com/notify?x=1", false, "带查询串不允许"},
		{"https://a.example.com/notify#f", false, "带锚点不允许"},
		{"", false, "空值不允许"},
		{"https:///notify", false, "缺域名不允许"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := wxValidateNotifyURL(tc.in, "支付回调地址")
			if tc.ok && err != nil {
				t.Errorf("期望通过, got %v", err)
			}
			if !tc.ok && err == nil {
				t.Error("期望被拒,实际通过了")
			}
		})
	}
}

// ─── 商户证书配套性 ──────────────────────────────────────────────────────────

// newTestCert 生成一张自签证书 + 私钥,用于证书配套性校验的测试。
func newTestCert(t *testing.T, mchID string, notBefore, notAfter time.Time) (certPEM, keyPEM, serialHex string, key *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: mchID},
		NotBefore:    notBefore,
		NotAfter:     notAfter,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("CreateCertificate: %v", err)
	}
	certPEM = string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	pkcs8, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("MarshalPKCS8PrivateKey: %v", err)
	}
	keyPEM = string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pkcs8}))
	s := strings.ToUpper(serial.Text(16))
	if len(s)%2 == 1 {
		s = "0" + s
	}
	return certPEM, keyPEM, s, key
}

func TestValidateCertBundle(t *testing.T) {
	now := time.Now()
	certPEM, keyPEM, serial, _ := newTestCert(t, "1900009191", now.Add(-time.Hour), now.Add(24*time.Hour))

	t.Run("四者自洽时通过", func(t *testing.T) {
		info, err := wxValidateCertBundle(certPEM, keyPEM, serial, "1900009191", now)
		if err != nil {
			t.Fatalf("期望通过: %v", err)
		}
		if info.SubjectCN != "1900009191" {
			t.Errorf("SubjectCN = %q", info.SubjectCN)
		}
	})

	t.Run("序列号写错要报错", func(t *testing.T) {
		_, err := wxValidateCertBundle(certPEM, keyPEM, "DEADBEEF", "1900009191", now)
		if err == nil || !strings.Contains(err.Error(), "序列号") {
			t.Fatalf("期望序列号不匹配的报错, got %v", err)
		}
	})

	t.Run("商户号写错要报错", func(t *testing.T) {
		_, err := wxValidateCertBundle(certPEM, keyPEM, serial, "1900000000", now)
		if err == nil || !strings.Contains(err.Error(), "商户号") {
			t.Fatalf("期望商户号不匹配的报错, got %v", err)
		}
	})

	t.Run("私钥与证书不配套要报错", func(t *testing.T) {
		// 这是最难自查的一种错误:两个文件都合法,只是不是同一次申请生成的。
		_, otherKeyPEM, _, _ := newTestCert(t, "1900009191", now.Add(-time.Hour), now.Add(24*time.Hour))
		_, err := wxValidateCertBundle(certPEM, otherKeyPEM, serial, "1900009191", now)
		if err == nil || !strings.Contains(err.Error(), "不配套") {
			t.Fatalf("期望「不配套」的报错, got %v", err)
		}
	})

	t.Run("证书过期要报错", func(t *testing.T) {
		expiredCert, expiredKey, expiredSerial, _ := newTestCert(t, "1900009191",
			now.Add(-48*time.Hour), now.Add(-24*time.Hour))
		_, err := wxValidateCertBundle(expiredCert, expiredKey, expiredSerial, "1900009191", now)
		if err == nil || !strings.Contains(err.Error(), "有效期") {
			t.Fatalf("期望有效期报错, got %v", err)
		}
	})
}

// ─── 端到端:对着一个假网关跑完整条链路 ──────────────────────────────────────

// fakeGateway 模拟微信网关:验证我们的请求签名,并用自己的私钥给应答签名。
//
// 这是唯一能同时证明「请求签名对」+「应答验签对」的测试 —— 任何一端错了都会红。
type fakeGateway struct {
	t             *testing.T
	merchantPub   *rsa.PublicKey
	gatewayKey    *rsa.PrivateKey
	serial        string
	lastAuthz     string
	lastSerialHdr string
	handler       func(path string, body []byte) (int, []byte)
}

func (g *fakeGateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := readAllTest(r)
	g.lastAuthz = r.Header.Get("Authorization")
	g.lastSerialHdr = r.Header.Get("Wechatpay-Serial")

	// —— 像微信一样验证商户签名 ——
	authz := g.lastAuthz
	if !strings.HasPrefix(authz, wxSignatureType+" ") {
		g.t.Errorf("Authorization 前缀不对: %q", authz)
	}
	fields := parseAuthzTest(authz)
	msg := wxBuildSignMessage(r.Method, r.URL.RequestURI(),
		mustAtoiTest(g.t, fields["timestamp"]), fields["nonce_str"], body)
	sig, err := base64.StdEncoding.DecodeString(fields["signature"])
	if err != nil {
		g.t.Fatalf("签名不是合法 base64: %v", err)
	}
	digest := sha256.Sum256(msg)
	if err := rsa.VerifyPKCS1v15(g.merchantPub, crypto.SHA256, digest[:], sig); err != nil {
		g.t.Errorf("网关侧验证商户签名失败(= 微信会回 SIGN_ERROR): %v", err)
	}

	status, respBody := g.handler(r.URL.Path, body)

	// —— 像微信一样给应答签名 ——
	ts := fmt.Sprintf("%d", time.Now().Unix())
	nonce := "gatewaynonce0001"
	respSig, err := wxSign(g.gatewayKey, wxBuildVerifyMessage(ts, nonce, respBody))
	if err != nil {
		g.t.Fatalf("网关签名失败: %v", err)
	}
	w.Header().Set("Wechatpay-Timestamp", ts)
	w.Header().Set("Wechatpay-Nonce", nonce)
	w.Header().Set("Wechatpay-Serial", g.serial)
	w.Header().Set("Wechatpay-Signature", respSig)
	w.Header().Set("Wechatpay-Signature-Type", wxSignatureType)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(respBody)
}

func readAllTest(r *http.Request) ([]byte, error) {
	if r.Body == nil {
		return nil, nil
	}
	buf := new(bytes.Buffer)
	_, err := buf.ReadFrom(r.Body)
	return buf.Bytes(), err
}

func parseAuthzTest(authz string) map[string]string {
	out := map[string]string{}
	rest := strings.TrimPrefix(authz, wxSignatureType+" ")
	for _, part := range strings.Split(rest, ",") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			out[strings.TrimSpace(kv[0])] = strings.Trim(kv[1], `"`)
		}
	}
	return out
}

func mustAtoiTest(t *testing.T, s string) int64 {
	t.Helper()
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		t.Fatalf("时间戳不是数字: %q", s)
	}
	return n.Int64()
}

// newTestClient 造一个指向假网关的客户端(公钥模式)。
func newTestClient(t *testing.T, gw *fakeGateway, srvURL string) *wxClient {
	t.Helper()
	merchantKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	gw.merchantPub = &merchantKey.PublicKey
	return &wxClient{
		mchID: "1900009191", appID: "wxtestappid", merchantSerialNo: "MERCHANTSERIAL",
		apiV3Key: "0123456789abcdef0123456789abcdef",
		priv:     merchantKey,
		verifier: &wxStaticVerifier{keyID: gw.serial, key: &gw.gatewayKey.PublicKey},
		pubKeyID: gw.serial,
		baseURL:  srvURL,
		hc:       srvClient(),
		now:      time.Now,
	}
}

func srvClient() *http.Client { return &http.Client{Timeout: 10 * time.Second} }

func newFakeGateway(t *testing.T, handler func(path string, body []byte) (int, []byte)) (*fakeGateway, *httptest.Server) {
	t.Helper()
	gwKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	gw := &fakeGateway{t: t, gatewayKey: gwKey, serial: "PUB_KEY_ID_0000000001", handler: handler}
	srv := httptest.NewServer(gw)
	t.Cleanup(srv.Close)
	return gw, srv
}

// TestClientNativePrepayRoundTrip 完整跑通一次扫码下单。
func TestClientNativePrepayRoundTrip(t *testing.T) {
	gw, srv := newFakeGateway(t, func(path string, body []byte) (int, []byte) {
		if path != "/v3/pay/transactions/native" {
			return 404, []byte(`{"code":"NOT_FOUND"}`)
		}
		var req map[string]any
		if err := json.Unmarshal(body, &req); err != nil {
			return 400, []byte(`{"code":"PARAM_ERROR"}`)
		}
		if req["out_trade_no"] != "ORDER1" {
			return 400, []byte(`{"code":"PARAM_ERROR","message":"out_trade_no"}`)
		}
		return 200, []byte(`{"code_url":"weixin://wxpay/bizpayurl?pr=TEST"}`)
	})
	c := newTestClient(t, gw, srv.URL)

	codeURL, err := c.PrepayNative(context.Background(), &wxPrepayRequest{
		AppID: c.appID, MchID: c.mchID, Description: "测试", OutTradeNo: "ORDER1",
		NotifyURL: "https://x.example.com/notify",
		Amount:    wxPrepayAmt{Total: 1, Currency: "CNY"},
	})
	if err != nil {
		t.Fatalf("PrepayNative: %v", err)
	}
	if codeURL != "weixin://wxpay/bizpayurl?pr=TEST" {
		t.Errorf("code_url = %q", codeURL)
	}
	// 公钥模式必须带这个头,否则微信不会用公钥给应答签名。
	if gw.lastSerialHdr != gw.serial {
		t.Errorf("出站 Wechatpay-Serial = %q, want %q", gw.lastSerialHdr, gw.serial)
	}
	// Authorization 里的 serial_no 是**商户**证书序列号,不是公钥ID。
	if f := parseAuthzTest(gw.lastAuthz); f["serial_no"] != "MERCHANTSERIAL" {
		t.Errorf("Authorization serial_no = %q, want 商户证书序列号", f["serial_no"])
	}
}

// TestClientQueryIncludesQueryStringInSignature 查单的 ?mchid= 必须进签名。
// 这条如果错了,查单永远 401,而下单却是好的 —— 极具迷惑性。
func TestClientQueryIncludesQueryStringInSignature(t *testing.T) {
	gw, srv := newFakeGateway(t, func(path string, _ []byte) (int, []byte) {
		return 200, []byte(`{"out_trade_no":"ORDER1","trade_state":"SUCCESS","transaction_id":"T1"}`)
	})
	c := newTestClient(t, gw, srv.URL)

	tx, err := c.QueryByOutTradeNo(context.Background(), "ORDER1")
	if err != nil {
		t.Fatalf("QueryByOutTradeNo: %v", err)
	}
	if tx.TradeState != WxTradeStateSuccess || tx.TransactionID != "T1" {
		t.Errorf("查单结果不对: %+v", tx)
	}
}

// TestClientVerifiesErrorResponses 非 2xx 也必须先验签,再转成带错误码的类型化错误。
func TestClientVerifiesErrorResponses(t *testing.T) {
	gw, srv := newFakeGateway(t, func(string, []byte) (int, []byte) {
		return 404, []byte(`{"code":"ORDERNOTEXIST","message":"订单不存在"}`)
	})
	c := newTestClient(t, gw, srv.URL)

	_, err := c.QueryByOutTradeNo(context.Background(), "NOPE")
	if err == nil {
		t.Fatal("期望错误")
	}
	var apiErr *WeChatAPIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("期望 *WeChatAPIError, got %T: %v", err, err)
	}
	if apiErr.Code != "ORDERNOTEXIST" {
		t.Errorf("Code = %q, want ORDERNOTEXIST", apiErr.Code)
	}
	// 关单必须把这种错误当作幂等成功。
	if err := c.CloseOrder(context.Background(), "NOPE"); err != nil {
		t.Errorf("CloseOrder 对 ORDERNOTEXIST 应当容忍, got %v", err)
	}
}

// TestClientSurfacesUnsignedGatewayError 网关级拒绝(商户号不存在/签名错)不带 Wechatpay-* 头,
// 此时必须报出错误体里的业务码,而不是一句「缺少验签头」—— 后者会把管理员引向反向代理排查。
func TestClientSurfacesUnsignedGatewayError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// 刻意不写任何 Wechatpay-* 响应头,模拟微信网关级拒绝。
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":"MCH_NOT_EXISTS","message":"商户号不存在"}`))
	}))
	t.Cleanup(srv.Close)

	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	c := &wxClient{
		mchID: "1900009191", merchantSerialNo: "S", apiV3Key: "0123456789abcdef0123456789abcdef",
		priv:     key,
		verifier: &wxStaticVerifier{keyID: "PUB_KEY_ID_1", key: &other.PublicKey},
		pubKeyID: "PUB_KEY_ID_1", baseURL: srv.URL, hc: srvClient(), now: time.Now,
	}

	_, err := c.SecurityEcho(context.Background(), "x")
	var apiErr *WeChatAPIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("期望 *WeChatAPIError(应报出 MCH_NOT_EXISTS), got %T: %v", err, err)
	}
	if apiErr.Code != "MCH_NOT_EXISTS" {
		t.Errorf("Code = %q, want MCH_NOT_EXISTS", apiErr.Code)
	}
	// 并且这条错误要能被翻译成可操作的中文指引。
	if msg := wxExplainTestError(err); !strings.Contains(msg, "商户号") {
		t.Errorf("wxExplainTestError 没有给出可操作的指引: %q", msg)
	}
}

// TestClientStillRejectsUnsignedSuccess 2xx 但缺验签头**必须**继续判失败 ——
// 那才是真的被反向代理吃了头,放行等于完全不验签。
func TestClientStillRejectsUnsignedSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"code_url":"weixin://evil"}`))
	}))
	t.Cleanup(srv.Close)

	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	c := &wxClient{
		mchID: "1900009191", merchantSerialNo: "S", apiV3Key: "0123456789abcdef0123456789abcdef",
		priv:     key,
		verifier: &wxStaticVerifier{keyID: "PUB_KEY_ID_1", key: &other.PublicKey},
		pubKeyID: "PUB_KEY_ID_1", baseURL: srv.URL, hc: srvClient(), now: time.Now,
	}

	_, err := c.PrepayNative(context.Background(), &wxPrepayRequest{OutTradeNo: "O1"})
	if err == nil {
		t.Fatal("未签名的 200 应答竟然被接受了")
	}
	if !isMissingSignatureHeaders(err) {
		t.Errorf("期望 MISSING_SIGNATURE_HEADERS, got %v", err)
	}
}

// TestClientRejectsBadResponseSignature 网关签名不对时必须拒绝,且不能把 body 当真。
func TestClientRejectsBadResponseSignature(t *testing.T) {
	gw, srv := newFakeGateway(t, func(string, []byte) (int, []byte) {
		return 200, []byte(`{"code_url":"weixin://evil"}`)
	})
	c := newTestClient(t, gw, srv.URL)
	// 换掉验签公钥 —— 相当于「应答不是微信签的」。
	otherKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	c.verifier = &wxStaticVerifier{keyID: gw.serial, key: &otherKey.PublicKey}

	if _, err := c.PrepayNative(context.Background(), &wxPrepayRequest{
		OutTradeNo: "ORDER1", Amount: wxPrepayAmt{Total: 1, Currency: "CNY"},
	}); err == nil {
		t.Fatal("应答验签失败时竟然返回了 code_url")
	}
}

// TestClientSecurityEcho 后台「测试配置」按钮依赖的接口。
func TestClientSecurityEcho(t *testing.T) {
	gw, srv := newFakeGateway(t, func(path string, body []byte) (int, []byte) {
		if path != "/v3/security/echo" {
			return 404, []byte(`{"code":"NOT_FOUND"}`)
		}
		var req struct {
			EchoMessage string `json:"echo_message"`
		}
		_ = json.Unmarshal(body, &req)
		out, _ := json.Marshal(map[string]string{"echo_message": req.EchoMessage})
		return 200, out
	})
	c := newTestClient(t, gw, srv.URL)

	got, err := c.SecurityEcho(context.Background(), "HELLO_SCHOLAY")
	if err != nil {
		t.Fatalf("SecurityEcho: %v", err)
	}
	if got != "HELLO_SCHOLAY" {
		t.Errorf("echo = %q, want HELLO_SCHOLAY", got)
	}
}

// TestJSAPIInvokeParams 调起参数用的是另一套待签串,别和请求签名搞混。
func TestJSAPIInvokeParams(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	c := &wxClient{appID: "wxapp123", priv: key, now: func() time.Time { return time.Unix(1700000000, 0) }}

	params, err := c.BuildJSAPIInvokeParams("prepay_abc")
	if err != nil {
		t.Fatalf("BuildJSAPIInvokeParams: %v", err)
	}
	if params["package"] != "prepay_id=prepay_abc" {
		t.Errorf("package = %q", params["package"])
	}
	if params["signType"] != "RSA" {
		t.Errorf("signType = %q, want RSA", params["signType"])
	}
	want := fmt.Sprintf("%s\n%s\n%s\n%s\n", "wxapp123", params["timeStamp"], params["nonceStr"], params["package"])
	sig, err := base64.StdEncoding.DecodeString(params["paySign"])
	if err != nil {
		t.Fatalf("paySign 不是合法 base64: %v", err)
	}
	digest := sha256.Sum256([]byte(want))
	if err := rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, digest[:], sig); err != nil {
		t.Fatalf("调起参数签名验不过: %v", err)
	}
}

// ─── 支付方式解析 ────────────────────────────────────────────────────────────

func TestParsePayModes(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"native", []string{"native"}},
		{"jsapi,native", []string{"native", "jsapi"}}, // 顺序被归一化
		{"native,native", []string{"native"}},         // 去重
		{"native,bogus", []string{"native"}},          // 过滤非法值
		{" NATIVE , H5 ", []string{"native", "h5"}},   // 大小写与空白
		{"", nil},
	}
	for _, tc := range cases {
		got := wxParsePayModes(tc.in)
		if strings.Join(got, ",") != strings.Join(tc.want, ",") {
			t.Errorf("wxParsePayModes(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

// ─── 配置写入语义 ────────────────────────────────────────────────────────────

// fakeRepo 只实现 wxApplyDTO 相关路径需要的部分。
type fakeRepo struct{ cfg *WeChatPayConfig }

func (r *fakeRepo) GetAllConfigs() ([]*WeChatPayConfig, error)     { return []*WeChatPayConfig{r.cfg}, nil }
func (r *fakeRepo) GetActiveConfig() (*WeChatPayConfig, error)     { return r.cfg, nil }
func (r *fakeRepo) GetConfigByID(uint64) (*WeChatPayConfig, error) { return r.cfg, nil }
func (r *fakeRepo) CreateConfig(c *WeChatPayConfig) error          { r.cfg = c; return nil }
func (r *fakeRepo) UpdateConfig(c *WeChatPayConfig) error          { r.cfg = c; return nil }
func (r *fakeRepo) DeleteConfig(uint64) error                      { return nil }
func (r *fakeRepo) DeactivateAllConfigs() error                    { return nil }
func (r *fakeRepo) ActivateConfig(uint64) error                    { return nil }
func (r *fakeRepo) UpdateValidation(uint64, string, string, time.Time) error {
	return nil
}

// testKeyPEM 生成一个可用的 PKCS#8 私钥 PEM。
func testKeyPEM(t *testing.T) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("MarshalPKCS8PrivateKey: %v", err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
}

// TestClearingPublicKeyIDLeavesPlatformCertMode 清空公钥ID 必须能退回平台证书模式。
//
// 回归:公钥 PEM 走「空=保持原值」的密文语义,而公钥ID 是直写字段。若不联动清空,
// 清 ID 之后配对校验会报「填写了微信支付公钥,就必须同时填写公钥ID」——
// 一份存过公钥的配置永远回不到平台证书模式,而那正是排查 SERIAL_MISMATCH 时被建议走的路。
func TestClearingPublicKeyIDLeavesPlatformCertMode(t *testing.T) {
	keyPEM := testKeyPEM(t)
	pubKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	spki, _ := x509.MarshalPKIXPublicKey(&pubKey.PublicKey)
	pubPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: spki}))

	existing := &WeChatPayConfig{
		MchID: "1900009191", AppID: "wxapp", SerialNo: "ABCD",
		APIv3Key: "0123456789abcdef0123456789abcdef", PrivateKey: keyPEM,
		WeChatPayPublicKeyID: "PUB_KEY_ID_0000000001", WeChatPayPublicKey: pubPEM,
		NotifyURL: "https://x.example.com/notify", PayModes: "native",
	}
	svc := NewWeChatPayService(&fakeRepo{cfg: existing})

	// 管理端把公钥ID清空、公钥字段留空(前端表单清空后就是这样提交的)。
	dto := &WeChatPayConfigDTO{
		MchID: "1900009191", AppID: "wxapp", SerialNo: "ABCD",
		APIv3Key: wxMaskTail(existing.APIv3Key), PrivateKey: wxMaskedPEM,
		WeChatPayPublicKeyID: "", WeChatPayPublicKey: "",
		NotifyURL: "https://x.example.com/notify", PayModes: []string{"native"},
	}
	if err := svc.UpdateConfig(1, dto); err != nil {
		t.Fatalf("清空公钥ID 退回平台证书模式被拒绝了: %v", err)
	}
	if existing.WeChatPayPublicKeyID != "" || existing.WeChatPayPublicKey != "" {
		t.Errorf("公钥ID/公钥没有被一起清掉: id=%q keyLen=%d",
			existing.WeChatPayPublicKeyID, len(existing.WeChatPayPublicKey))
	}
	if existing.UsesPublicKeyMode() {
		t.Error("清空后仍被判定为公钥模式")
	}
	// 脱敏回填的私钥/APIv3 必须原样保留,不能被星号覆盖。
	if existing.PrivateKey != keyPEM {
		t.Error("脱敏回填把私钥覆盖了")
	}
	if existing.APIv3Key != "0123456789abcdef0123456789abcdef" {
		t.Errorf("脱敏回填把 APIv3 密钥覆盖成了 %q", existing.APIv3Key)
	}
}

// TestUpdateConfigCannotActivate 编辑接口不得成为启用的旁路。
func TestUpdateConfigCannotActivate(t *testing.T) {
	keyPEM := testKeyPEM(t)
	existing := &WeChatPayConfig{
		MchID: "1900009191", AppID: "wxapp", SerialNo: "ABCD",
		APIv3Key: "0123456789abcdef0123456789abcdef", PrivateKey: keyPEM,
		NotifyURL: "https://x.example.com/notify", PayModes: "native",
		ValidationStatus: WxValidationUntested, IsActive: false,
	}
	svc := NewWeChatPayService(&fakeRepo{cfg: existing})

	// 恶意/误操作:提交 is_active=true 试图绕过「必须先测试」的闸门。
	dto := &WeChatPayConfigDTO{
		MchID: "1900009191", AppID: "wxapp", SerialNo: "ABCD",
		APIv3Key: wxMaskTail(existing.APIv3Key), PrivateKey: wxMaskedPEM,
		NotifyURL: "https://x.example.com/notify", PayModes: []string{"native"},
		IsActive: true,
	}
	if err := svc.UpdateConfig(1, dto); err != nil {
		t.Fatalf("UpdateConfig: %v", err)
	}
	if existing.IsActive {
		t.Error("未通过测试的配置被编辑接口直接启用了 —— 闸门被旁路")
	}
}

// TestMaskedValueDetection 脱敏值回填时必须被识别成「未修改」。
// 认错了就会把真密钥覆盖成一串星号,而且要到下一笔支付才发现。
func TestMaskedValueDetection(t *testing.T) {
	cfg := &WeChatPayConfig{
		APIv3Key:   "0123456789abcdef0123456789abcdef",
		PrivateKey: "-----BEGIN PRIVATE KEY-----\nXXX\n-----END PRIVATE KEY-----",
	}
	dto := cfg.ToDTO(false)
	if !wxIsMaskedValue(dto.APIv3Key) {
		t.Errorf("脱敏后的 APIv3 密钥没被识别为掩码: %q", dto.APIv3Key)
	}
	if !wxIsMaskedValue(dto.PrivateKey) {
		t.Errorf("脱敏后的私钥没被识别为掩码: %q", dto.PrivateKey)
	}
	if strings.Contains(dto.APIv3Key, "abcdef0123456789abcdef") {
		t.Error("脱敏后仍能看出密钥主体")
	}
	if !dto.APIv3KeyConfigured || !dto.PrivateKeyConfigured {
		t.Error("已配置标志位不对")
	}
	// 真实值不能被误判成掩码。
	if wxIsMaskedValue("0123456789abcdef0123456789abcdef") {
		t.Error("真实密钥被误判为掩码")
	}
}
