// ============================================================================
// Scholay学术 V1.0
// 出站 SSRF 防护 —— 安全拨号器 + 受限客户端 + URL 早筛
// ============================================================================
//
// 任何请求「可被用户 / admin 间接影响的 URL」的出站(webhook 投递、飞书机器人、
// 未来任意 user-supplied URL fetch)都应走 Restricted(),而不是 Default()/WithTimeout()。
//
// 核心防线是 net.Dialer.Control:在 TCP 连接真正建立**前**(DNS 已解析、拿到目标 IP),
// 校验该 IP 是否落在环回 / 私网 / link-local / 云 metadata(169.254.169.254)/ CGNAT 等
// 不允许的范围。因为校验发生在「解析之后、连接之前」,对每一次重定向跳转的目标都会重新校验,
// 故能防御「host 是域名但解析到内网」以及 DNS rebinding。
//
// ValidateOutboundURL 是保存可配置 URL 时的**即时 UX 早筛**(给 admin 早反馈),
// 不能作为安全边界依赖 —— 真正的边界是 Restricted() 的拨号层拦截。
package httpclient

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"
)

// ErrBlockedAddress 出站目标被 SSRF 防护拦截。
var ErrBlockedAddress = errors.New("httpclient: 目标地址被出站安全策略拦截(内网/环回/保留地址)")

// isDisallowedIP 判断一个 IP 是否属于不允许出站的范围:
// 环回 / 私网(10/8·172.16/12·192.168/16·fc00::/7)/ link-local(含 169.254 云 metadata)/
// 组播 / 未指定(0.0.0.0 / ::)/ CGNAT(100.64/10)。
func isDisallowedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsInterfaceLocalMulticast() {
		return true
	}
	// 100.64.0.0/10 (运营商级 NAT) —— IsPrivate 不含,手动拦,避免内部 NAT 网段。
	if ip4 := ip.To4(); ip4 != nil && ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
		return true
	}
	return false
}

// safeDialControl 在拨号前(DNS 已解析)校验目标 IP。address 形如 "ip:port"。
func safeDialControl(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		// Control 阶段 host 必为 IP 字面量;非 IP 视为异常,拦截。
		return ErrBlockedAddress
	}
	if isDisallowedIP(ip) {
		return ErrBlockedAddress
	}
	return nil
}

// Restricted 返回一个带 SSRF 防护的 HTTP 客户端,用于请求可被用户/admin 间接影响的 URL。
// 拨号前按解析出的真实 IP 拦截内网/环回/metadata 段(对每次重定向跳转同样生效,防 DNS rebinding),
// 并限制最多 3 跳重定向、拒绝非 http(s) 协议跳转。
func Restricted(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout:   timeout,
		KeepAlive: 30 * time.Second,
		Control:   safeDialControl,
	}
	transport := &http.Transport{
		DialContext:           dialer.DialContext,
		MaxIdleConns:          10,
		MaxIdleConnsPerHost:   2,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("httpclient: 重定向次数过多")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return fmt.Errorf("httpclient: 不允许的重定向协议 %q", req.URL.Scheme)
			}
			return nil
		},
	}
}

// ValidateOutboundURL 在保存可配置 URL 时做即时早筛(给 admin 早反馈):
// 必须是 http/https 绝对 URL、host 非空,且 host 若是 IP 字面量不能落在内网/保留段,
// 也拒绝常见内网主机名。注意:这只是 UX 早筛,真正的 SSRF 防线是 Restricted() 的拨号层拦截。
func ValidateOutboundURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return errors.New("URL 不能为空")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("URL 格式错误: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("URL 必须以 http:// 或 https:// 开头")
	}
	host := u.Hostname()
	if host == "" {
		return errors.New("URL 缺少主机名")
	}
	if ip := net.ParseIP(host); ip != nil && isDisallowedIP(ip) {
		return errors.New("URL 不能指向内网 / 环回 / 保留地址")
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".local") || strings.HasSuffix(lower, ".internal") {
		return errors.New("URL 不能指向内网主机名")
	}
	return nil
}
