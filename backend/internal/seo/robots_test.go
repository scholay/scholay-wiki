package seo

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// TestRobotsDisallowsMetaExternalAgent —— 2026-08-12:该爬虫 24h 抓 33,796 次实体页、
// 零收录零引用,却是 SSR on-miss 现拉上游的最大单一来源。它必须是**自己一组的 Disallow: /**,
// 而不是躺在「训练类放行 + Crawl-delay」那一组里(robots 组不继承,躺错组等于全站放行)。
func TestRobotsDisallowsMetaExternalAgent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/robots.txt", nil)

	(&Handler{}).ServeRobotsTxt(ctx)

	body := recorder.Body.String()
	groups := strings.Split(body, "\n\n")

	// 大小写两种拼写各自成组:robots 规范里 UA 匹配不分大小写,但这个爬虫量级太大,不赌解析器实现。
	for _, agent := range []string{"User-agent: Meta-ExternalAgent", "User-agent: meta-externalagent"} {
		var group string
		for _, candidate := range groups {
			if strings.Contains(candidate, agent) {
				group = candidate
				break
			}
		}
		if group == "" {
			t.Fatalf("missing robots group %q:\n%s", agent, body)
		}
		if !strings.Contains(group, "Disallow: /\n") && !strings.HasSuffix(strings.TrimSpace(group), "Disallow: /") {
			t.Errorf("group %q must disallow the whole site:\n%s", agent, group)
		}
		if strings.Contains(group, "Allow: /") {
			t.Errorf("group %q must not carry any Allow directive:\n%s", agent, group)
		}
	}

	// 反向断言:不能再出现在放行组里。放行组的识别特征是它带 Crawl-delay + Allow。
	for _, candidate := range groups {
		if !strings.Contains(candidate, "Crawl-delay") || !strings.Contains(candidate, "Allow: /") {
			continue
		}
		if strings.Contains(strings.ToLower(candidate), "meta-externalagent") {
			t.Errorf("Meta-ExternalAgent is still in an allowed crawler group:\n%s", candidate)
		}
	}
}

func TestRobotsAllowsPublicRenderAPIsButKeepsPrivateAPIsBlocked(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/robots.txt", nil)

	(&Handler{}).ServeRobotsTxt(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	body := recorder.Body.String()
	groups := strings.Split(body, "\n\n")
	for _, agent := range []string{"User-agent: *", "User-agent: Baiduspider", "User-agent: OAI-SearchBot", "User-agent: GPTBot"} {
		var group string
		for _, candidate := range groups {
			if strings.Contains(candidate, agent) {
				group = candidate
				break
			}
		}
		if group == "" {
			t.Fatalf("missing robots group %q:\n%s", agent, body)
		}
		for _, directive := range []string{
			"Allow: /api/v1/public/",
			"Allow: /api/v1/news",
			"Allow: /api/v1/content/",
			"Disallow: /api/",
			"Disallow: /google/callback",
		} {
			if !strings.Contains(group, directive) {
				t.Errorf("group %q missing %q:\n%s", agent, directive, group)
			}
		}
	}
}
