package crawlerwatch

import "testing"

// TestClassifyUA 表驱动:真实爬虫 UA → 引擎 key。
// UA 样本来自各引擎官方文档 / 生产 access log。
func TestClassifyUA(t *testing.T) {
	cases := []struct {
		name   string
		ua     string
		want   string
		wantOK bool
	}{
		// ── Google 全家 ──
		{"googlebot desktop", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/126.0.0.0 Safari/537.36", "google", true},
		{"googlebot smartphone", "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "google", true},
		{"googlebot image", "Googlebot-Image/1.0", "google", true},
		{"google inspection tool", "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)", "google", true},
		{"googleother", "GoogleOther", "google", true},
		{"adsbot", "AdsBot-Google (+http://www.google.com/adsbot.html)", "google", true},

		// ── 其它传统引擎 ──
		{"bingbot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36", "bing", true},
		{"baiduspider", "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)", "baidu", true},
		{"baiduspider render", "Mozilla/5.0 (compatible; Baiduspider-render/2.0; +http://www.baidu.com/search/spider.html)", "baidu", true},
		{"yandexbot", "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", "yandex", true},
		{"sogou", "Sogou web spider/4.0(+http://www.sogou.com/docs/help/webmasters.htm#07)", "sogou", true},
		{"360spider", "Mozilla/5.0 (compatible; 360Spider/1.0; +http://www.so.com/help/help_3_2.html)", "so360", true},
		{"haosouspider", "Mozilla/5.0 (compatible; HaoSouSpider; http://www.haosou.com/help/help_3_2.html)", "so360", true},
		{"bytespider", "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)", "bytedance", true},
		{"duckduckbot", "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)", "duckduckgo", true},
		{"applebot", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)", "apple", true},
		{"naver yeti", "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)", "naver", true},
		{"seznambot", "Mozilla/5.0 (compatible; SeznamBot/4.0; +http://napoveda.seznam.cz/seznambot-intro/)", "seznam", true},

		// ── AI 爬虫(注意前缀包含关系的优先级)──
		{"gptbot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot", "ai-openai", true},
		{"oai-searchbot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot", "ai-openai-search", true},
		{"chatgpt-user", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "ai-openai-user", true},
		{"claudebot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "ai-anthropic", true},
		{"claude-searchbot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-SearchBot/1.0; +https://www.anthropic.com/claude-searchbot", "ai-anthropic-search", true},
		{"claude-user", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-User/1.0; +Claude-User@anthropic.com", "ai-anthropic-search", true},
		{"perplexitybot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "ai-perplexity", true},
		{"perplexity-user", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)", "ai-perplexity", true},
		{"meta lowercase", "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "ai-meta", true},
		{"meta camelcase", "Meta-ExternalAgent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "ai-meta", true},
		{"amazonbot", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 (Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)", "ai-amazon", true},
		{"ccbot", "CCBot/2.0 (https://commoncrawl.org/faq/)", "ai-ccbot", true},

		// ── 表外兜底 ──
		{"unknown bot", "SomeRandomBot/9.9 (+https://example.com/bot)", "other-bot", true},
		{"unknown spider", "wow-Spider/1.0", "other-bot", true},
		{"unknown crawler", "MyCrawler 2.0", "other-bot", true},

		// ── 非爬虫:不计数 ──
		{"chrome human", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "", false},
		{"safari human", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", "", false},
		{"cubot phone human", "Mozilla/5.0 (Linux; Android 11; CUBOT KINGKONG 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36", "", false},
		{"empty ua", "", "", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := ClassifyUA(tc.ua)
			if ok != tc.wantOK || got != tc.want {
				t.Fatalf("ClassifyUA(%q) = (%q, %v), want (%q, %v)", tc.ua, got, ok, tc.want, tc.wantOK)
			}
		})
	}
}

// TestTrackablePath 抓取监控面判定:SSR 页 / 爬虫基础设施进,API / 静态资源 / 后台 / 移动端出。
func TestTrackablePath(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		// 进
		{"/", true},
		{"/paper", true},
		{"/paper/10.1234-abcd", true},
		{"/author/john-doe", true},
		{"/journal/nature", true},
		{"/journals", true},
		{"/journals/browse", true},
		{"/tools", true},
		{"/tools/citation-generator", true},
		{"/news/123", true},
		{"/resources/x", true},
		{"/blog/hello", true},
		{"/qa/how-to", true},
		{"/help", true},
		{"/about", true},
		{"/features", true},
		{"/pricing", true},
		{"/search", true},
		{"/privacy", true},
		{"/terms", true},
		{"/disclaimer", true},
		{"/robots.txt", true},
		{"/sitemap.xml", true},
		{"/sitemap-papers-1.xml", true},
		{"/a1b2c3d4e5f6g7h8.txt", true}, // IndexNow key 文件

		// 出
		{"/api/v1/scholar/papers/search", false},
		{"/assets/index-abc123.js", false},
		{"/admin", false},
		{"/admin/users", false},
		{"/m", false},
		{"/m/search", false},
		{"/favicon.ico", false},
		{"/og-image.png", false},
		{"/fonts/google-sans.woff2", false},
		{"/manifest.webmanifest", false},
		{"/tools/logo.svg", false},  // SSR 前缀下的静态资源也不算
		{"/paperclip", false},       // 前缀按路径段匹配,不是裸 HasPrefix
		{"/searching", false},
		{"/foo.txt", false},         // 根级短 .txt:非 robots 非 key 格式
		{"/health", false},
		{"/unknown-page", false},
	}

	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			if got := TrackablePath(tc.path); got != tc.want {
				t.Fatalf("TrackablePath(%q) = %v, want %v", tc.path, got, tc.want)
			}
		})
	}
}
