package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// 最后活跃必须只由显式 /user/activity 事件写入。锁定鉴权层不再提供
// 全局 hook,避免后续重构时把轮询、WS ticket 等任意鉴权请求重新计为活跃。
func TestAuthMiddlewareDoesNotContainActivitySideEffect(t *testing.T) {
	raw, err := os.ReadFile("auth.go")
	if err != nil {
		t.Fatalf("read auth.go: %v", err)
	}
	source := string(raw)
	for _, forbidden := range []string{"activityHook", "SetActivityHook", "RecordActivity"} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("auth middleware must remain side-effect free; found %q", forbidden)
		}
	}
}

func init() {
	gin.SetMode(gin.TestMode)
	config.AppConfig = &config.Config{
		JWT: config.JWTConfig{Secret: "test-secret-key-for-middleware-tests"},
	}
}

func makeValidToken(t *testing.T, userType, role string) string {
	t.Helper()
	token, err := utils.GenerateTokenWithRole(1, "testuser", userType, role)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}
	return token
}

func makeExpiredToken(t *testing.T) string {
	t.Helper()
	claims := utils.Claims{
		UserID:   1,
		Username: "expired",
		Type:     "user",
		Role:     "user",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-49 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(config.AppConfig.JWT.Secret))
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func setupRouter(requiredType string) *gin.Engine {
	router := gin.New()
	router.Use(AuthMiddleware(requiredType))
	router.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"user_id":   c.GetUint("user_id"),
			"user_type": c.GetString("user_type"),
			"user_role": c.GetString("user_role"),
		})
	})
	return router
}

func TestAuthMiddleware_NoToken(t *testing.T) {
	t.Parallel()
	router := setupRouter("user")
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	t.Parallel()
	router := setupRouter("user")
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_ExpiredToken(t *testing.T) {
	t.Parallel()
	router := setupRouter("user")
	token := makeExpiredToken(t)
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_ValidUserToken(t *testing.T) {
	t.Parallel()
	router := setupRouter("user")
	token := makeValidToken(t, "user", "user")
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var body map[string]any
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["user_role"] != "user" {
		t.Errorf("user_role = %v, want user", body["user_role"])
	}
}

// TestAuthMiddleware_AdminRequired_UserToken 普通用户 token 访问 admin 端点 → **403,不是 401**。
//
// ⚠️ 这里断言的是刻意为之的行为,不是回归 —— 别把 403 "修"回 401。
// 语义上:401 = 未认证;403 = 已认证但无权限。本例 token 签名有效、未过期、未吊销,
// 只是角色不够,所以是 403。
//
// 更硬的理由在前端:frontend-user/src/shared/lib/http.ts 的 isAuthError() 判定为
//
//	err.status === 401 && getAuthToken() != null
//
// 为真时会调 notifyAuthLost() 清登录态并弹登录框。也就是说,这条路径若回 401,
// 会把一个**有效登录的普通用户**在点到任意 admin 接口时直接登出。
// auth.go 里三处角色不匹配分支(user / admin / super_admin)因此统一用 ForbiddenWithCode。
func TestAuthMiddleware_AdminRequired_UserToken(t *testing.T) {
	t.Parallel()
	router := setupRouter("admin")
	token := makeValidToken(t, "user", "user")
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d (已认证但无权限 = 403;回 401 会让前端把有效登录用户登出)", w.Code, http.StatusForbidden)
	}

	// 业务码同样是契约的一半:前端先按 code 判 TokenRevoked/TokenExpired,再按 status 判 401。
	// 只断言 HTTP status 会漏掉「status 403 但 code 误填 2030/2031」这种同样会触发登出的写法。
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode body: %v", err)
	}
	if code, _ := body["code"].(float64); int(code) != errcode.Forbidden {
		t.Errorf("code = %v, want %d (errcode.Forbidden)", body["code"], errcode.Forbidden)
	}
}

func TestAuthMiddleware_AdminRequired_AdminRole(t *testing.T) {
	t.Parallel()
	router := setupRouter("admin")
	token := makeValidToken(t, "user", "admin")
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
}

// TestAuthMiddleware_RejectsTokenFromQueryParam 锁定「`?token=<jwt>` 裸 JWT 回落已下线」。
//
// ⚠️ 这里断言的是刻意为之的行为,不是回归 —— 别把 401 "修"回 200,更别为它把 query 分支
// 加回 extractToken。注意本例的 token **签名有效、未过期**:正因为如此它才有意义 ——
// 要守住的不变量是「有效 token 放在 URL query 里也必须被拒」,而不是「坏 token 被拒」。
//
// 来由:该回落当年是给 SSE/EventSource 留的(EventSource 无法自定义 header)。现已全部改掉:
//   - SSE 走 fetch+ReadableStream 带 Authorization header(frontend-user/src/shared/lib/sse-post.ts)
//   - WS 走一次性 ws_token ticket(agentbridge/ws.go authenticateWSRequest,缺/错一律 401)
//
// 项目根 CLAUDE.md「Agent Service Integration · 关键约定」原文:
//
//	「只认 ws_token —— 旧的 `?token=<jwt>` 裸 JWT 回落已下线(缺/错 ws_token 一律 401);
//	  裸 JWT 落 URL 会被 nginx access log 长期暴露、且能绕过 HTTP 中间件用已吊销 token 升级 WS,故移除」
//
// 现在 extractToken 只认两处:Authorization: Bearer header > scholay_token cookie。
func TestAuthMiddleware_RejectsTokenFromQueryParam(t *testing.T) {
	t.Parallel()
	router := setupRouter("user")
	token := makeValidToken(t, "user", "user")
	req := httptest.NewRequest("GET", "/test?token="+token, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d (裸 JWT in query 已下线,即使 token 有效也必须拒)", w.Code, http.StatusUnauthorized)
	}
}
