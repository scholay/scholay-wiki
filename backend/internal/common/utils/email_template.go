// ============================================================================
// 统一品牌邮件模板 —— 全站所有邮件(验证码 / 反馈回复 / 会员计费通知 / 兑换 等)
// 都走 RenderBrandedEmail,保证字标、配色、版式与前端页面一致。
//
// UI 配色是 frontend-user/src/styles/globals.css 的**人工镜像**。邮件走内联样式、
// 拿不到 CSS 变量,只能把 token 解析后的字面值抄过来。
// 上次同步:2026-08-13(见下方字标一节;此前停留在两代前的 #CC2222/#2A7A2A/#D4A017,
// 而用户收到的每一封验证码/通知邮件都是站外的品牌露出 —— 前端护栏扫不到 backend/)。
//
// 邮件用 table + 内联样式(兼容 Outlook/QQ/Gmail)。
// ============================================================================

package utils

import (
	"fmt"
	"html"
	"strings"
)

// EmailBrandName 品牌名(主题前缀 / 页脚 / 正文行文)。
//
// 与前端 shared/components/BrandName.tsx 渲染的字样一致 —— 全站正文里的品牌名就是它。
// ⚠️ 不要写成「Scholay学术」:那是 SEO 侧的 og:site_name / <title>(index.html),
// 用来在搜索结果里补语义,不是 UI 与邮件行文用的品牌名。
const EmailBrandName = "Scholay"

// EmailSubject 邮件主题统一格式:「Scholay · <标题>」。
//
// 收口三种历史写法(`Scholay 注册验证码` / `您的反馈已收到回复 - Scholay` / `Scholay · 经费充值成功`)——
// 品牌前置能让用户在收件箱列表里一眼扫到是谁发的,分隔符统一成 `·` 与站内标题风格一致。
func EmailSubject(title string) string { return EmailBrandName + " · " + title }

// 括号里是 globals.css 的 token 名。对比度均按邮件里的**实际承载底色**验算过,
// 不是照抄前端的标称值 —— 同一个前景色换个底就可能掉出 AA(页脚那条就是这么定的)。
const (
	// 松青 --brand-green 此前只被旧字标消费,字标改跟 --logo-* 后已无调用点,故删除
	// (留着就是一个没人用的色 token,正是本仓库反复清理的那类死代码)。
	emailRed    = "#882828" // --brand-red 朱砂  · CTA 底 / 顶部色条
	emailInk    = "#1F1F23" // --foreground      · 标题 / 验证码   16.43:1 on 白卡
	emailSubtle = "#505059" // --subtle          · 正文段落        7.98:1 on 白卡
	emailMuted  = "#686873" // --muted-foreground· 引用块          4.69:1 on surface-1
	emailFaint  = "#6E6E78" // --faint-foreground· 页脚 / Note     4.58:1 on 米白

	// --border(31 31 35 / 12%)在邮件里必须给实色:Outlook 对 rgba() 支持不一致。
	// 取「12% 玄墨压白卡」的解析值 —— 模板里 9 处描边有 8 处画在白卡上。
	emailBorder = "#E4E4E5"

	// 内嵌面板(引用块 / 验证码盒 / 信息表)—— 压在白卡里,用 --surface-1。
	emailSurface = "#EFEDE5"

	// 页面底 + 页脚 —— --background 米白。
	// 页脚特地用米白而不是 surface-1:emailFaint 落 surface-1 只有 4.30:1(12px 正文不达 AA),
	// 落米白正好 4.58:1。语义上页脚也本就是「页面 chrome」而非内嵌面板,两边对齐。
	emailPageBg = "#F6F4EE"
)

// ─── 字标(与页面 Logo 同一套)────────────────────────────────────────────────
//
// 🔴 2026-08-13 收口:此前邮件自造了一个**页面上不存在**的字标 —— 混合大小写
// "Scholay"、三色(#882828/#2F4D29/#E5A800)、按 S·ch·o·l·a·y 分配。而页面的
// 文字标(frontend-user/src/shared/components/brand/ScholayWordmark.tsx,顶栏 /
// 分享海报 / 登录弹窗都用它)是**全大写 SCHOLAY + 四色循环**。大小写、色值、
// 配色规则三样全不一样,收件箱里那封邮件等于另一个牌子。
//
// 邮件里没法用 SVG(Gmail 直接剥离)、也不宜用图片(默认屏蔽图片是常态,
// 一屏蔽品牌就整块消失),所以用**真文本**复刻:大小写与配色跟着页面走,
// 字形交给衬线栈近似(页面字形是 Playfair Display 400 的矢量描边)。
//
// 色值真源 = globals.css 的 --logo-*(与语义 --brand-* 是两套,刻意不联动:
// 标志要比 UI 更跳)。改这四个值 = 改品牌,必须先改设计稿。
const (
	logoRed   = "#882828" // --logo-red   · S · L
	logoAmber = "#F1BF45" // --logo-amber · C · A
	logoGreen = "#427935" // --logo-green · H · Y
	logoInk   = "#000000" // --logo-ink   · O(纯黑,刻意不用 --foreground 的偏蓝墨黑)
)

// emailBrandFont 与 globals.css --font-brand 同栈(去掉不自托管的 Playfair,
// 邮件客户端只会命中系统字体;顺序保持一致,装了 Playfair 的机器仍原样命中)。
const emailBrandFont = `'Playfair Display', Didot, 'Bodoni MT', Georgia, 'Times New Roman', serif`

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

// brandWordmark 页面同款文字标:全大写 SCHOLAY,四色循环(红/黄/绿/黑),逐字母上色。
// 与 ScholayWordmark.tsx 的 7 条 path 逐字母对齐,见上方 logo* 常量注释。
func brandWordmark() string {
	// 四色循环 —— 与页面 SVG 的取色顺序一致:S红 C黄 H绿 O黑 L红 A黄 Y绿。
	cycle := []string{logoRed, logoAmber, logoGreen, logoInk}
	var b strings.Builder
	for i, ch := range "SCHOLAY" {
		fmt.Fprintf(&b, `<span style="color:%s">%c</span>`, cycle[i%len(cycle)], ch)
	}
	return b.String()
}

// wrapEmailShell 居中卡片外壳:顶部品牌色条 + 字标 + 正文 + 页脚。
func wrapEmailShell(inner string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"></head>
<body style="margin:0;padding:0;background:%s;-webkit-text-size-adjust:100%%;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:%s;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%%;background:#FFFFFF;border:1px solid %s;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
<tr><td style="height:4px;line-height:4px;font-size:0;background:%s;">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 6px;">
<div role="img" aria-label="%s" style="font-size:24px;font-weight:400;letter-spacing:1px;font-family:%s;">%s</div>
</td></tr>
<tr><td style="padding:10px 28px 26px;">%s</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid %s;background:%s;">
<p style="margin:0;font-size:12px;line-height:1.6;color:%s;">这是 %s 自动发送的邮件,请勿直接回复。如非本人操作,请忽略本邮件。</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
		emailPageBg, emailPageBg, emailBorder, emailRed,
		EmailBrandName, emailBrandFont, brandWordmark(),
		inner, emailBorder, emailPageBg, emailFaint, EmailBrandName)
}
