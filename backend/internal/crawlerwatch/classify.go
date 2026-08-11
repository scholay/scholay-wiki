// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// classify.go —— 爬虫 UA 归类 + 抓取路径判定(纯函数,无状态无 IO)。
//
// UA 归类是**子串表**而不是正则:已知爬虫的 UA 都带稳定的产品名 token
// (Googlebot / GPTBot / Bytespider ...),子串匹配足够且零分配。
// 表按「最具体优先」排序 —— 例如 OAI-SearchBot 必须先于 GPTBot 判,
// Claude-SearchBot / Claude-User 必须先于 ClaudeBot 判(前缀包含关系)。

package crawlerwatch

import (
	"path"
	"regexp"
	"strings"
)

// uaRule 单条 UA 归类规则:小写子串 → 引擎 key。
type uaRule struct {
	needle string // 必须全小写;匹配时 UA 会先 ToLower
	engine string
}

// uaRules 已知爬虫归类表,按最具体优先排序。
// 引擎 key 会直接成为 umami 事件名(name/title),在仪表盘里按它分组。
var uaRules = []uaRule{
	// ── AI 爬虫(放最前:与传统引擎无前缀冲突,但内部有包含关系)──
	{"oai-searchbot", "ai-openai-search"},   // OpenAI 搜索索引
	{"chatgpt-user", "ai-openai-user"},      // ChatGPT 替用户实时抓取
	{"gptbot", "ai-openai"},                 // OpenAI 训练语料
	{"claude-searchbot", "ai-anthropic-search"},
	{"claude-user", "ai-anthropic-search"},  // Claude 替用户实时抓取,与 SearchBot 合并观察
	{"claudebot", "ai-anthropic"},           // Anthropic 训练语料
	{"perplexitybot", "ai-perplexity"},
	{"perplexity-user", "ai-perplexity"},
	{"meta-externalagent", "ai-meta"},       // 大小写两种拼写线上都出现过,ToLower 后同一条
	{"amazonbot", "ai-amazon"},
	{"ccbot", "ai-ccbot"},                   // Common Crawl

	// ── 传统搜索引擎 ──
	{"googlebot", "google"}, // Googlebot / -Image / -News / -Video / Smartphone 全部含此 token
	{"google-inspectiontool", "google"},
	{"googleother", "google"},
	{"adsbot-google", "google"},
	{"mediapartners-google", "google"},
	{"storebot-google", "google"},
	{"apis-google", "google"},
	{"bingbot", "bing"},
	{"bingpreview", "bing"},
	{"baiduspider", "baidu"},
	{"yandex", "yandex"}, // YandexBot / YandexImages / YandexMobileBot 等全族
	{"sogou", "sogou"},   // "Sogou web spider" / "Sogou News Spider"
	{"360spider", "so360"},
	{"haosouspider", "so360"},
	{"bytespider", "bytedance"}, // 字节跳动(头条搜索/豆包语料),生产里量极大
	{"duckduckbot", "duckduckgo"},
	{"applebot", "apple"},
	{"yeti", "naver"}, // Naver 爬虫 UA 是 "Yeti/1.1 (Naver Corp.; ...)"
	{"naver", "naver"},
	{"seznambot", "seznam"},
}

// ClassifyUA 把 User-Agent 归类到引擎 key。
// 已知爬虫按表归类;表外但含 bot/spider/crawler 字样的归 "other-bot";
// 其余(真人浏览器 / 空 UA)返回 ok=false —— 调用方不计数。
func ClassifyUA(ua string) (engine string, ok bool) {
	if ua == "" {
		return "", false
	}
	l := strings.ToLower(ua)
	for _, r := range uaRules {
		if strings.Contains(l, r.needle) {
			return r.engine, true
		}
	}
	// CUBOT 是安卓手机品牌,机型名会进真人浏览器 UA
	// ("Linux; Android 11; CUBOT KINGKONG 5")—— 不排掉的话下面的
	// "bot" 兜底会把这部分真人流量误计成爬虫。
	if strings.Contains(l, "cubot") {
		return "", false
	}
	if strings.Contains(l, "bot") || strings.Contains(l, "spider") || strings.Contains(l, "crawler") {
		return "other-bot", true
	}
	return "", false
}

// ssrPrefixes 后端 SSR 注入的公开页面前缀(与 nginx user.conf 的 @ssr_backend
// 正则同口径)。按**路径段**匹配:"/paper" 与 "/paper/..." 算,"/paperclip" 不算。
var ssrPrefixes = []string{
	"/paper", "/author", "/journal", "/journals", "/tools", "/news",
	"/resources", "/blog", "/qa", "/help", "/about", "/features",
	"/pricing", "/search", "/privacy", "/terms", "/disclaimer",
}

// indexNowKeyRe IndexNow key 文件(与 main.go isCrawlerInfraPath 及
// seosubmit.RegisterKeyFileRoute 同构:根级 8-128 位字母数字连字符 .txt)。
var indexNowKeyRe = regexp.MustCompile(`^/[A-Za-z0-9-]{8,128}\.txt$`)

// skippedExts 静态资源扩展名 —— 爬虫抓 JS/CSS/图片/字体不算「抓页面」,滤掉。
// robots.txt / sitemap*.xml / key 文件在扩展名过滤**之前**已放行。
var skippedExts = map[string]bool{
	".js": true, ".mjs": true, ".css": true, ".map": true,
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".webp": true, ".avif": true, ".svg": true, ".ico": true,
	".woff": true, ".woff2": true, ".ttf": true, ".otf": true, ".eot": true,
	".json": true, ".webmanifest": true,
}

// TrackablePath 判定该路径是否属于「爬虫抓取监控面」:
//   - SSR 公开页(见 ssrPrefixes)与首页 "/"
//   - 爬虫基础设施:robots.txt / sitemap*.xml / IndexNow key 文件
//
// 排除 API、静态资源、后台、移动端 SPA 路径 —— 那些要么爬虫不该来,
// 要么不构成「页面被抓」的信号。
func TrackablePath(p string) bool {
	if p == "/" {
		return true
	}
	// 爬虫基础设施 —— 先于扩展名过滤判定(它们本身就是 .txt/.xml)
	if p == "/robots.txt" {
		return true
	}
	if strings.HasPrefix(p, "/sitemap") && strings.HasSuffix(p, ".xml") {
		return true
	}
	if indexNowKeyRe.MatchString(p) {
		return true
	}
	// 硬排除面
	if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/assets/") {
		return false
	}
	if p == "/admin" || strings.HasPrefix(p, "/admin/") {
		return false
	}
	if p == "/m" || strings.HasPrefix(p, "/m/") {
		return false
	}
	if ext := strings.ToLower(path.Ext(p)); ext != "" && skippedExts[ext] {
		return false
	}
	for _, prefix := range ssrPrefixes {
		if p == prefix || strings.HasPrefix(p, prefix+"/") {
			return true
		}
	}
	return false
}
