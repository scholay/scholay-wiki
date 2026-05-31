package peerreview

import "github.com/gin-gonic/gin"

// RegisterRoutes 把智能审稿的所有路由挂到一个已带 UserAuthMiddleware 的 group 下。
// 调用方:
//
//	rg := userAuth.Group("/peer-review")
//	peerreview.RegisterRoutes(rg, handler)
func RegisterRoutes(rg *gin.RouterGroup, h *Handler) {
	subs := rg.Group("/submissions")
	{
		subs.GET("", h.ListSubmissions)
		subs.POST("", h.CreateSubmission)
		// "继续未完成的草稿,否则新建" — 旧路径, 保留兼容; wizard 入口已改用下面的 latest-draft + lazy create。
		subs.POST("/resume-or-create", h.ResumeOrCreate)
		// 只读:返"已上传过文件"的最新草稿; wizard 入口用,没就让前端 lazy create。
		subs.GET("/latest-draft", h.LatestDraft)
		subs.GET("/:id", h.GetSubmission)
		subs.PATCH("/:id", h.PatchSubmission)
		subs.DELETE("/:id", h.DeleteSubmission)
		subs.POST("/:id/submit", h.Submit)

		subs.GET("/:id/assets", h.ListAssets)
		subs.POST("/:id/assets", h.UploadAsset)
		subs.DELETE("/:id/assets/:aid", h.DeleteAsset)
		// 打包下载该投稿的原始稿件 + 附件 (zip)
		subs.GET("/:id/download", h.DownloadAssets)

		// 统一的 wizard "下一步" 入口 (0058) — 取代独立的
		// /journal-recommend, /letter-draft, /extract-meta。
		subs.POST("/:id/advance", h.Advance)

		subs.GET("/:id/reports", h.ListReports)
		subs.GET("/:id/reports/:role", h.GetReport)

		// 流式输出 (SSE) — 前端用 fetch + ReadableStream 订阅, 见 [[StreamPartial]]
		subs.GET("/:id/stream", h.StreamPartial)
	}
}
