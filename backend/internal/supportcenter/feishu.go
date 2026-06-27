// ============================================================================
// 飞书通知 —— 群自定义机器人 webhook(任何渠道来反馈/来信都第一时间推送到飞书群)。
//
// 接入方式:飞书群 → 设置 → 群机器人 → 添加「自定义机器人」→ 拿 webhook 地址;
// 若机器人开了「签名校验」,把 secret 一并填进后台配置。
// 签名算法(飞书官方):string_to_sign = timestamp + "\n" + secret,
// sign = base64(HMAC-SHA256(key=string_to_sign, data=空)) 。
// 全部 best-effort:失败仅 slog,不影响主流程。
// ============================================================================

package supportcenter

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/common/httpclient"
)

// feishuHTTPClient 走 Restricted:URL 由 admin 配置,拨号层拦截内网/环回/metadata 段(防 SSRF)。
var feishuHTTPClient = httpclient.Restricted(5 * time.Second)

// feishuSign 计算飞书机器人签名。
func feishuSign(secret string, timestamp int64) (string, error) {
	stringToSign := fmt.Sprintf("%d\n%s", timestamp, secret)
	h := hmac.New(sha256.New, []byte(stringToSign))
	if _, err := h.Write([]byte{}); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(h.Sum(nil)), nil
}

// sendFeishuText 向 webhook 推送一条文本消息。url 为空 = 未配置(静默跳过)。
func sendFeishuText(url, secret, text string) error {
	if url == "" {
		return nil
	}
	body := map[string]any{
		"msg_type": "text",
		"content":  map[string]string{"text": text},
	}
	if secret != "" {
		ts := time.Now().Unix()
		sign, err := feishuSign(secret, ts)
		if err != nil {
			return fmt.Errorf("feishu sign: %w", err)
		}
		body["timestamp"] = fmt.Sprintf("%d", ts)
		body["sign"] = sign
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	resp, err := feishuHTTPClient.Post(url, "application/json", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	// 飞书 webhook 永远回 200,错误在 body 的 code 字段里。
	var out struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return fmt.Errorf("feishu resp decode: %w", err)
	}
	if out.Code != 0 {
		return fmt.Errorf("feishu webhook code=%d msg=%s", out.Code, out.Msg)
	}
	return nil
}

// notifyFeishu 读当前配置并推送(带事件开关过滤)。同步调用方应包在 safego 里。
func (s *Service) notifyFeishu(event string, lines []string) {
	cfg, err := s.repo.GetConfig()
	if err != nil || cfg.FeishuWebhookURL == "" {
		return
	}
	if event == "feedback" && !cfg.FeishuNotifyFeedback {
		return
	}
	if event == "email" && !cfg.FeishuNotifyEmail {
		return
	}
	if event == "payment" && !cfg.FeishuNotifyPayment {
		return
	}
	text := strings.Join(lines, "\n")
	if err := sendFeishuText(cfg.FeishuWebhookURL, cfg.FeishuSecret, text); err != nil {
		slog.Warn("supportcenter: feishu notify failed", "event", event, "err", err)
	}
}

// NotifyFeedback 在线反馈提交 → 飞书。给 feedback 模块经 bootstrap 注入的钩子用。
// 异步语义由调用方保证(feedback 侧用 safego 包)。
func (s *Service) NotifyFeedback(category, content, email, username string) {
	if len([]rune(content)) > 200 {
		content = string([]rune(content)[:200]) + "…"
	}
	who := username
	if who == "" {
		who = "匿名用户"
	}
	s.notifyFeishu("feedback", []string{
		"📩 收到新的用户反馈",
		"来源:在线提交 · 分类:" + category,
		"用户:" + who + "(" + email + ")",
		"内容:" + content,
		"→ 后台「用户反馈」处理",
	})
}

// notifyInboundMail 收件箱新邮件 → 飞书。
func (s *Service) notifyInboundMail(fromName, fromAddr, subject, snippet string) {
	from := fromAddr
	if fromName != "" {
		from = fromName + " <" + fromAddr + ">"
	}
	s.notifyFeishu("email", []string{
		"📧 客服邮箱收到新邮件",
		"发件人:" + from,
		"主题:" + subject,
		"预览:" + snippet,
		"→ 后台「邮件中心」查看与回复",
	})
}

// PaymentNotice 一笔「付费成功」推送所需的字段(由 vip 经 bootstrap 闭包翻译填入,
// supportcenter 不反向依赖 vip)。仅在支付回调真正到账后构造,创建订单不构造。
type PaymentNotice struct {
	OrderType string  // recharge=经费充值 / subscription=会员订阅
	SubAction string  // 仅订阅:""=开通 / renew=续期 / upgrade=升级
	OrderNo   string  // 订单号
	PlanCode  string  // 仅订阅:pro / max
	Amount    float64 // 实付金额(元)
	Credits   int     // 到账/赠送经费
	Method    string  // alipay / wechat
	Username  string  // 用户名(可空)
	Email     string  // 邮箱(可空)
}

// NotifyPayment 用户付费成功 → 飞书。给 vip 模块经 bootstrap 注入的钩子用。
// 异步语义由调用方(vip notifyOrderFulfilled 内 safego)保证。
func (s *Service) NotifyPayment(p PaymentNotice) {
	method := map[string]string{"alipay": "支付宝", "wechat": "微信"}[p.Method]
	if method == "" {
		method = p.Method
	}
	who := p.Username
	if who == "" {
		who = "用户 #" + p.OrderNo // 退化:无用户名时用订单号占位,避免空括号
	}
	if p.Email != "" {
		who += "(" + p.Email + ")"
	}

	lines := []string{"💰 用户付费成功"}
	if p.OrderType == "recharge" {
		lines = append(lines,
			"类型:经费充值",
			fmt.Sprintf("到账经费:%d 永久经费", p.Credits),
		)
	} else {
		plan := "Pro"
		if p.PlanCode == "max" {
			plan = "Max"
		}
		action := map[string]string{"renew": "续期", "upgrade": "升级"}[p.SubAction]
		if action == "" {
			action = "开通"
		}
		lines = append(lines, "类型:会员"+action+" · "+plan)
		if p.Credits > 0 {
			lines = append(lines, fmt.Sprintf("赠送经费:%d 经费", p.Credits))
		}
	}
	lines = append(lines,
		"用户:"+who,
		fmt.Sprintf("金额:¥%.2f · %s", p.Amount, method),
		"订单号:"+p.OrderNo,
	)
	s.notifyFeishu("payment", lines)
}

// TestFeishu 用**当前已保存**的配置发一条测试消息(配置页「发送测试」按钮)。
func (s *Service) TestFeishu() error {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return err
	}
	if cfg.FeishuWebhookURL == "" {
		return fmt.Errorf("尚未配置飞书 webhook 地址")
	}
	return sendFeishuText(cfg.FeishuWebhookURL, cfg.FeishuSecret,
		"✅ Scholay 客服中心:飞书通知测试成功("+time.Now().Format("01-02 15:04:05")+")")
}
