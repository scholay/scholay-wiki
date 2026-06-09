// ============================================================================
// 统一品牌邮件模板 —— 全站所有邮件(验证码 / 反馈回复 / 会员计费通知 / 兑换 等)
// 都走 RenderBrandedEmail,保证品牌名(Scholay)、配色、版式与前端项目一致。
//
// 配色取自前端 globals.css 的 brand token:
//   red #CC2222(CTA / Logo S·a)· green #2A7A2A(Logo ch·y)· amber #D4A017(Logo o)
// 字标用前端同款多色 "Scholay"(Playfair/serif)。邮件用 table + 内联样式(兼容 Outlook/QQ/Gmail)。
// ============================================================================

package utils

import (
	"fmt"
	"html"
	"strings"
)

// EmailBrandName 品牌名(主题前缀 / 页脚)。
const EmailBrandName = "Scholay"

const (
	emailRed     = "#CC2222"
	emailGreen   = "#2A7A2A"
	emailAmber   = "#D4A017"
	emailInk     = "#111111"
	emailSubtle  = "#444444"
	emailMuted   = "#666666"
	emailFaint   = "#999999"
	emailBorder  = "#E8E8E8"
	emailSurface = "#FAFAFA"
)

// EmailContent 邮件正文构件,由 RenderBrandedEmail 组装进品牌外壳。各字段可空。
// 多行文本字段(Intro/Quote/Outro/Note)中的换行会渲染成 <br>,内容自动转义防注入。
type EmailContent struct {
	Title   string      // 大标题
	Intro   string      // 引言段
	Code    string      // 大号强调值(验证码等),居中盒子展示
	Quote   string      // 引用块(左竖线,如原始反馈内容)
	Rows    [][2]string // 信息表:每行 [标签, 值]
	Outro   string      // 结尾段
	CTAText string      // 按钮文案(需同时给 CTAURL)
	CTAURL  string      // 按钮链接(绝对 URL)
	Note    string      // 末尾小字提示
}

// escBR 转义 + 换行转 <br>(多行用户文本安全渲染)。
func escBR(s string) string { return strings.ReplaceAll(html.EscapeString(s), "\n", "<br>") }

// RenderBrandedEmail 把内容包进 Scholay 品牌邮件外壳,返回完整 HTML。
func RenderBrandedEmail(c EmailContent) string {
	var b strings.Builder
	if c.Title != "" {
		fmt.Fprintf(&b, `<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:%s;line-height:1.4;">%s</h1>`, emailInk, html.EscapeString(c.Title))
	}
	if c.Intro != "" {
		fmt.Fprintf(&b, `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:%s;">%s</p>`, emailSubtle, escBR(c.Intro))
	}
	if c.Quote != "" {
		fmt.Fprintf(&b, `<div style="margin:0 0 16px;padding:12px 16px;background:%s;border-left:3px solid %s;border-radius:0 6px 6px 0;font-size:13px;line-height:1.7;color:%s;">%s</div>`,
			emailSurface, emailBorder, emailMuted, escBR(c.Quote))
	}
	if c.Code != "" {
		fmt.Fprintf(&b, `<div style="margin:0 0 16px;padding:18px;background:%s;border:1px solid %s;border-radius:8px;text-align:center;"><span style="font-size:30px;font-weight:700;letter-spacing:8px;color:%s;">%s</span></div>`,
			emailSurface, emailBorder, emailInk, html.EscapeString(c.Code))
	}
	if len(c.Rows) > 0 {
		fmt.Fprintf(&b, `<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid %s;border-radius:8px;background:%s;border-collapse:separate;">`, emailBorder, emailSurface)
		for i, r := range c.Rows {
			topBorder := ""
			if i > 0 {
				topBorder = "border-top:1px solid " + emailBorder + ";"
			}
			fmt.Fprintf(&b, `<tr><td style="padding:11px 16px;font-size:13px;color:%s;%s">%s</td><td style="padding:11px 16px;font-size:13px;font-weight:700;color:%s;text-align:right;%s">%s</td></tr>`,
				emailMuted, topBorder, html.EscapeString(r[0]), emailInk, topBorder, html.EscapeString(r[1]))
		}
		b.WriteString(`</table>`)
	}
	if c.Outro != "" {
		fmt.Fprintf(&b, `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:%s;">%s</p>`, emailSubtle, escBR(c.Outro))
	}
	if c.CTAText != "" && c.CTAURL != "" {
		fmt.Fprintf(&b, `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;"><tr><td style="border-radius:6px;background:%s;"><a href="%s" target="_blank" style="display:inline-block;padding:11px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">%s</a></td></tr></table>`,
			emailRed, html.EscapeString(c.CTAURL), html.EscapeString(c.CTAText))
	}
	if c.Note != "" {
		fmt.Fprintf(&b, `<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:%s;">%s</p>`, emailFaint, escBR(c.Note))
	}
	return wrapEmailShell(b.String())
}

// brandWordmark 前端同款多色 Scholay 字标(内联 span)。
func brandWordmark() string {
	letters := []struct{ ch, color string }{
		{"S", emailRed}, {"c", emailGreen}, {"h", emailGreen}, {"o", emailAmber},
		{"l", emailInk}, {"a", emailRed}, {"y", emailGreen},
	}
	var b strings.Builder
	for _, l := range letters {
		fmt.Fprintf(&b, `<span style="color:%s">%s</span>`, l.color, l.ch)
	}
	return b.String()
}

// wrapEmailShell 居中卡片外壳:顶部品牌色条 + 字标 + 正文 + 页脚。
func wrapEmailShell(inner string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"></head>
<body style="margin:0;padding:0;background:#F5F5F5;-webkit-text-size-adjust:100%%;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%%;background:#FFFFFF;border:1px solid %s;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
<tr><td style="height:4px;line-height:4px;font-size:0;background:%s;">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 6px;">
<div style="font-size:26px;font-weight:700;letter-spacing:-0.5px;font-family:Georgia,'Times New Roman',serif;">%s</div>
</td></tr>
<tr><td style="padding:10px 28px 26px;">%s</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid %s;background:%s;">
<p style="margin:0;font-size:12px;line-height:1.6;color:%s;">这是一封来自 %s 的自动邮件,请勿直接回复。如果这不是您本人的操作,请忽略本邮件或联系客服。</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
		emailBorder, emailRed, brandWordmark(), inner, emailBorder, emailSurface, emailFaint, EmailBrandName)
}
