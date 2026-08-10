package seo

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

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
