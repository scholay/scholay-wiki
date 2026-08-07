package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// 交付物下载的超时豁免回归测试(2026-08-07)。
//
// 为什么专门为这一个纯函数写测试:它是本仓库「四份镜像漂移」的一个具名案发点。
// isObjectServePath 最初只写了 claw 的两条子串;后来 boltslides / sci_draw / stat_lab
// 三个 feature 各自挂了同构的产物路由(routes_user.go:361-363,380-382,399-401),
// 没有任何机制提醒回来改这里 ⇒ 三个 feature 的大文件下载全部落进 15s 读超时,
// 在弱网下被 ctx 掐成「能打开但损坏」的 docx/pptx。
//
// 修法是把匹配从「逐 feature 枚举」换成「按形状匹配」,本测试钉的就是这条不变式:
// **任何 feature 的产物端点都必须命中,不需要有人回来登记。**
// 因此下面的 futureFeature 用例是刻意的 —— 它代表还不存在的第五个 feature,
// 如果哪天有人把匹配改回枚举式,这条会红。
func TestIsObjectServePath_AllFeatureArtifactRoutes(t *testing.T) {
	// 真实路由(带 /api/v1 前缀,与 c.Request.URL.Path 一致)。全部是 GET 下载。
	served := []string{
		// 按 id 取(MinIO 字节,预览/下载)—— 四个 feature
		"/api/v1/user/claw/artifact/123",
		"/api/v1/user/boltslides/artifact/123",
		"/api/v1/user/sci_draw/artifact/123",
		"/api/v1/user/stat_lab/artifact/123",
		// 实时回退下载 + 目录打包 zip
		"/api/v1/user/claw/session/artifact",
		"/api/v1/user/claw/session/artifact.zip",
		"/api/v1/user/boltslides/session/artifact",
		"/api/v1/user/sci_draw/session/artifact",
		"/api/v1/user/stat_lab/session/artifact",
		// 列表端点也会命中(子串包含关系)。这是可接受的:该 handler 自带 10s ctx,
		// 拿到长上界没有副作用 —— 在这里显式断言,免得后人以为是漏网。
		"/api/v1/user/claw/session/artifacts",
		// 还不存在的第五个 feature:形状匹配必须自动覆盖它。
		"/api/v1/user/future_feature/artifact/9",
		"/api/v1/user/future_feature/session/artifact",
		// 既有的其它对象直出端点(回归保护)
		"/api/v1/user/feedback/attachment/7",
		"/api/v1/user/library/papers/1/pdf",
		"/api/v1/user/agent-sessions/abc/file",
		// 0112 统一附件端点(GET 取字节)。写成 `/attachment/` 形状匹配,顺带覆盖上面 feedback 那条。
		"/api/v1/user/attachment/6f1a2b3c-0000-4000-8000-000000000001",
	}
	for _, p := range served {
		if !isObjectServePath(http.MethodGet, p) {
			t.Errorf("isObjectServePath(GET, %q) = false, want true —— 该端点会落 15s 读超时,大文件被掐成坏文件", p)
		}
	}

	// 不该命中的:普通读写 API。命中的代价是拿到 10min 上界(goroutine 存活更久),
	// 虽不致命但会放大慢客户端的堆积,所以下界也钉一下。
	notServed := []string{
		"/api/v1/user/claw/session",
		"/api/v1/user/claw/session/messages",
		"/api/v1/user/stat_lab/session/ws-ticket",
		"/api/v1/user/profile",
		"/health",
	}
	for _, p := range notServed {
		if isObjectServePath(http.MethodGet, p) {
			t.Errorf("isObjectServePath(GET, %q) = true, want false —— 普通 API 不该拿到 10min 上界", p)
		}
	}
}

// method 维度的收窄(2026-08-07)。判据是「哪一侧有大 body」,不是「是不是 GET」。
//
// 起因:0112 把 `/feedback/attachment/` 泛化成 `/attachment/` 之后,
// `DELETE /user/attachment/:uuid` 与既有的 `DELETE /peer-review/submissions/:id/assets/:aid`
// 也一起拿到了 10min —— 它们是控制面调用(删一行 + 删一个对象),正常几十毫秒,
// 长预算的唯一效果是故障时让 goroutine 和 DB 事务多挂 9 分半。
//
// 🔴 反方向同样要钉死:**不能简单收窄成「只对 GET 生效」**。
// `POST /user/library/papers/:id/pdf`(文献集 PDF 上传,上限 50MB)今天正是靠
// `HasSuffix "/pdf"` 命中本函数拿到 10min;GET-only 会让它静默掉回 30s 写档,
// 表现为弱网上传大 PDF 偶发失败且查不出原因。上传与下载都是「有大 body 在传」,同档。
func TestIsObjectServePath_MethodNarrowing(t *testing.T) {
	cases := []struct {
		method string
		path   string
		want   bool
		why    string
	}{
		// 下载(响应体是文件)
		{http.MethodGet, "/api/v1/user/attachment/uuid-1", true, "取回附件字节"},
		{http.MethodHead, "/api/v1/user/attachment/uuid-1", true, "HEAD 探大小,与 GET 同档"},
		{http.MethodGet, "/api/v1/user/library/papers/1/pdf", true, "下载文献 PDF"},
		{http.MethodGet, "/api/v1/user/peer-review/submissions/1/assets/2", true, "下载投稿附件"},

		// 上传(请求体是文件)—— 这两条是既有依赖,收窄时最容易误伤的地方
		{http.MethodPost, "/api/v1/user/library/papers/1/pdf", true, "上传 50MB PDF,弱网需要长预算"},
		{http.MethodPut, "/api/v1/user/library/papers/1/pdf", true, "同上,PUT 形态也放行"},

		// 控制面(两侧都是小 body)—— 本次收窄的目标
		{http.MethodDelete, "/api/v1/user/attachment/uuid-1", false, "删附件是控制面,不该拿下载档"},
		{http.MethodDelete, "/api/v1/user/peer-review/submissions/1/assets/2", false, "删投稿附件同理"},
		{http.MethodDelete, "/api/v1/user/library/papers/1/pdf", false, "删 PDF 同理"},
		{http.MethodPatch, "/api/v1/user/attachment/uuid-1", false, "PATCH 同理"},
	}
	for _, c := range cases {
		if got := isObjectServePath(c.method, c.path); got != c.want {
			t.Errorf("isObjectServePath(%s, %q) = %v, want %v —— %s", c.method, c.path, got, c.want, c.why)
		}
	}
}

// 端到端断言中间件真正装进 ctx 的预算(而不是只测那个纯函数)——
// 分档逻辑散在 APITimeoutMiddleware 的 if/else 链里,纯函数测不到「接线接对了没」。
// 本仓库的具名失败模式就是「引擎造好没接线」,所以这里从 http 请求一路测到 handler 拿到的 deadline。
func TestAPITimeoutMiddleware_Buckets(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cases := []struct {
		name   string
		method string
		path   string
		want   time.Duration
	}{
		{"下载附件 → 对象直出档", http.MethodGet, "/api/v1/user/attachment/uuid-1", 10 * time.Minute},
		{"上传文献 PDF → 对象直出档", http.MethodPost, "/api/v1/user/library/papers/1/pdf", 10 * time.Minute},
		{"删附件 → 回落写档", http.MethodDelete, "/api/v1/user/attachment/uuid-1", 30 * time.Second},
		{"删投稿附件 → 回落写档", http.MethodDelete, "/api/v1/user/peer-review/submissions/1/assets/2", 30 * time.Second},
		{"普通读 → 读档", http.MethodGet, "/api/v1/user/profile", 15 * time.Second},
		{"普通写 → 写档", http.MethodPost, "/api/v1/user/claw/session", 30 * time.Second},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var got time.Duration
			r := gin.New()
			r.Use(APITimeoutMiddleware())
			r.Handle(c.method, c.path, func(ctx *gin.Context) {
				dl, ok := ctx.Request.Context().Deadline()
				if !ok {
					t.Fatal("请求 ctx 没有 deadline —— 中间件没接上")
				}
				got = time.Until(dl)
				ctx.Status(http.StatusOK)
			})

			req := httptest.NewRequest(c.method, c.path, nil)
			r.ServeHTTP(httptest.NewRecorder(), req)

			// 允许 1s 抖动(deadline 是相对"进中间件那一刻"算的)。
			if got < c.want-time.Second || got > c.want {
				t.Errorf("deadline ≈ %v, want ≈ %v", got, c.want)
			}
		})
	}
}
