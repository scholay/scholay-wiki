// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	"scholar-backend/internal/common/middleware"

	"github.com/gin-gonic/gin"
)

// registerAdminRoutes 注册管理员受保护路由
func registerAdminRoutes(api *gin.RouterGroup, h *allHandlers) {
	adminProtected := api.Group("/admin")
	adminProtected.Use(middleware.AdminAuthMiddleware())
	{
		// 仪表板 —— active-users/payment-funnel 已下线,在线/活跃指标改用 umami
		adminProtected.GET("/dashboard/statistics", h.dashboard.GetDashboardStatistics)

		// Umami analytics —— backend 查 umami HTTP API,前端 admin 自己渲染图表
		adminProtected.GET("/analytics/overview", h.umami.GetOverview)
		adminProtected.GET("/analytics/pageviews", h.umami.GetPageviews)
		adminProtected.GET("/analytics/top", h.umami.GetTop)
		adminProtected.GET("/analytics/active", h.umami.GetActive)

		// 系统配置 —— 隐私政策 / 服务条款 已下线为代码常量(见 frontend-v2 legal-content.ts + 0046 迁移)
		adminProtected.GET("/email-config", h.config.GetEmailConfig)
		adminProtected.PUT("/email-config", h.config.UpdateEmailConfig)
		adminProtected.POST("/email-config/test", h.config.TestEmailConfig)
		adminProtected.GET("/sms-config", h.config.GetSMSConfig)
		adminProtected.PUT("/sms-config", h.config.UpdateSMSConfig)
		adminProtected.POST("/sms-config/test", h.config.TestSMSConfig)
		adminProtected.GET("/system-config", h.config.GetSystemConfigAdmin)
		adminProtected.PUT("/system-config", h.config.UpdateSystemConfig)
		adminProtected.GET("/github-config", h.config.GetGithubOAuthConfig)
		adminProtected.PUT("/github-config", h.config.UpdateGithubOAuthConfig)
		adminProtected.GET("/google-config", h.config.GetGoogleOAuthConfig)
		adminProtected.PUT("/google-config", h.config.UpdateGoogleOAuthConfig)
		adminProtected.GET("/apple-config", h.config.GetAppleOAuthConfig)
		adminProtected.PUT("/apple-config", h.config.UpdateAppleOAuthConfig)
		adminProtected.GET("/orcid-config", h.config.GetOrcidOAuthConfig)
		adminProtected.PUT("/orcid-config", h.config.UpdateOrcidOAuthConfig)
		adminProtected.GET("/microsoft-config", h.config.GetMicrosoftOAuthConfig)
		adminProtected.PUT("/microsoft-config", h.config.UpdateMicrosoftOAuthConfig)
		adminProtected.GET("/discourse-config", h.config.GetDiscourseSSOConfig)
		adminProtected.PUT("/discourse-config", h.config.UpdateDiscourseSSOConfig)

		// Matrix 多维分析 — 系统维度管理 (admin 编辑系统默认维度库)
		adminProtected.GET("/analysis/dimensions", h.ai.AdminGetSystemDimensions)
		adminProtected.PUT("/analysis/dimensions/:id", h.ai.AdminUpdateSystemDimension)

		// 代码片段管理 (前端只用 list + create + update + delete; 单 GET 已下线)
		adminProtected.GET("/code-snippets", h.config.ListCodeSnippets)
		adminProtected.POST("/code-snippets", h.config.CreateCodeSnippet)
		adminProtected.PUT("/code-snippets/:id", h.config.UpdateCodeSnippet)
		adminProtected.DELETE("/code-snippets/:id", h.config.DeleteCodeSnippet)

		// 用户管理 (前端只用 list/stats/metrics + freeze/unfreeze + delete + batch-delete;
		// 单 GET、aggregate、notes 已下线)
		adminProtected.GET("/users/stats", h.user.GetUserStatistics)
		adminProtected.GET("/users/metrics", h.user.GetUserMetrics)
		adminProtected.GET("/users", h.user.GetUserList)
		adminProtected.DELETE("/users/:id", h.user.DeleteUser)
		adminProtected.POST("/users/batch-delete", h.user.BatchDeleteUsers)
		adminProtected.PUT("/users/:id/freeze", h.user.FreezeUser)
		adminProtected.PUT("/users/:id/unfreeze", h.user.UnfreezeUser)
		// 用户详情抽屉:登录方式 + 该用户会员状态/今日额度
		adminProtected.GET("/users/:id/detail", h.user.GetUserDetail)
		adminProtected.GET("/users/:id/vip", h.vip.AdminUserVIPStatus)
		// 管理员直接授予/取消会员(不走兑换码)
		adminProtected.POST("/users/:id/vip", h.vip.AdminGrantVIP)
		adminProtected.DELETE("/users/:id/vip", h.vip.AdminRevokeVIP)
		// 管理员给用户加/扣经费
		adminProtected.POST("/users/:id/wallet/adjust", h.vip.AdminAdjustWallet)

		// 计费体系配置(基准额度/倍率/价格/赠送/汇率/重置花费…)
		adminProtected.GET("/billing/config", h.vip.AdminGetBillingConfig)
		adminProtected.PUT("/billing/config", h.vip.AdminUpdateBillingConfig)

		// 订单与营收(orders 表 = vip 充值/订阅唯一收款真源;payment_transactions 是 stranded 勿用)
		adminProtected.GET("/billing/orders", h.vip.AdminListOrders)
		adminProtected.GET("/billing/orders/stats", h.vip.AdminOrderStats)

		// 客服与联系中心:配置(联系方式展示/IMAP/飞书)+ 收件箱 + 回信/写信
		adminProtected.GET("/support-center/config", h.supportCenter.GetConfig)
		adminProtected.PUT("/support-center/config", h.supportCenter.UpdateConfig)
		adminProtected.POST("/support-center/feishu/test", h.supportCenter.TestFeishu)
		adminProtected.POST("/support-center/smtp/test", h.supportCenter.TestSMTP)
		adminProtected.POST("/support-center/imap/test", h.supportCenter.TestIMAP)
		adminProtected.POST("/support-center/imap/poll", h.supportCenter.PollNow)
		adminProtected.GET("/support-center/inbox", h.supportCenter.ListInbox)
		adminProtected.GET("/support-center/inbox/:id", h.supportCenter.GetInboxMail)
		adminProtected.POST("/support-center/inbox/:id/reply", h.supportCenter.ReplyInbox)
		adminProtected.POST("/support-center/compose", h.supportCenter.Compose)

		// 限时领取会员推广:开关 + 微信客服二维码 + 文案
		adminProtected.GET("/promo/config", h.promo.GetConfig)
		adminProtected.PUT("/promo/config", h.promo.UpdateConfig)

		// 情报(学术新闻)webhook 配置:前端展示开关 + 接收 URL(展示)+ HMAC 密钥(脱敏)
		adminProtected.GET("/news-webhook/config", h.news.GetConfig)
		adminProtected.PUT("/news-webhook/config", h.news.UpdateConfig)

		// 公告管理
		adminProtected.GET("/announcements", h.announcement.ListAdmin)
		adminProtected.POST("/announcements", h.announcement.Create)
		adminProtected.PUT("/announcements/:id", h.announcement.Update)
		adminProtected.DELETE("/announcements/:id", h.announcement.Delete)

		// 第三方账号管理 (前端只用 list + create + update + delete + test + reset-stats;
		// 单 GET、stats、refresh-cache 已下线)
		adminProtected.GET("/third-party-accounts", h.thirdParty.ListAccounts)
		adminProtected.POST("/third-party-accounts", h.thirdParty.CreateAccount)
		adminProtected.PUT("/third-party-accounts/:id", h.thirdParty.UpdateAccount)
		adminProtected.DELETE("/third-party-accounts/:id", h.thirdParty.DeleteAccount)
		adminProtected.POST("/third-party-accounts/:id/test", h.thirdParty.TestAccount)
		adminProtected.POST("/third-party-accounts/:id/reset-stats", h.thirdParty.ResetAccountStats)

		// 支付宝配置
		adminProtected.GET("/payment/alipay/config", h.alipay.GetActiveConfig)
		adminProtected.GET("/payment/alipay/configs", h.alipay.ListConfigs)
		adminProtected.POST("/payment/alipay/config", h.alipay.CreateConfig)
		adminProtected.PUT("/payment/alipay/config/:id", h.alipay.UpdateConfig)
		adminProtected.DELETE("/payment/alipay/config/:id", h.alipay.DeleteConfig)
		adminProtected.POST("/payment/alipay/config/:id/activate", h.alipay.SetActiveConfig)

		// 微信支付配置
		adminProtected.GET("/payment/wechat/config", h.wechatPay.GetActiveConfig)
		adminProtected.GET("/payment/wechat/configs", h.wechatPay.GetAllConfigs)
		adminProtected.POST("/payment/wechat/config", h.wechatPay.CreateConfig)
		adminProtected.PUT("/payment/wechat/config/:id", h.wechatPay.UpdateConfig)
		adminProtected.DELETE("/payment/wechat/config/:id", h.wechatPay.DeleteConfig)
		adminProtected.POST("/payment/wechat/config/:id/activate", h.wechatPay.ActivateConfig)

		// 微信 OAuth 配置 (前端只用 active/configs/create/update/activate; DELETE 已下线)
		adminProtected.GET("/wechat/config", h.wechat.GetActiveConfig)
		adminProtected.GET("/wechat/configs", h.wechat.ListConfigs)
		adminProtected.POST("/wechat/config", h.wechat.CreateConfig)
		adminProtected.PUT("/wechat/config/:id", h.wechat.UpdateConfig)
		adminProtected.POST("/wechat/config/:id/activate", h.wechat.SetActiveConfig)

		// 微信公众号配置
		adminProtected.GET("/wechat-official/config", h.wechatOfficial.GetConfig)
		adminProtected.PUT("/wechat-official/config", h.wechatOfficial.UpdateConfig)

		// 通用 Agent 服务 (scholar_agent 容器) 的模型 / 端点配置
		// 单行 (id=1), GET ?show_sensitive=true 返回明文 token, 默认返回打码
		adminProtected.GET("/agent/config", h.agentConfig.GetConfig)
		adminProtected.PUT("/agent/config", h.agentConfig.UpdateConfig)

		// 反馈管理 (list / stats / 改 status / reply / 详情 / 删除; category/assignee/
		// internal-notes 仍未接前端)
		adminProtected.GET("/feedbacks", h.feedback.ListFeedbacks)
		adminProtected.GET("/feedbacks/stats", h.feedback.GetStats)
		adminProtected.GET("/feedbacks/:id", h.feedback.GetFeedback)
		adminProtected.PUT("/feedbacks/:id/status", h.feedback.UpdateStatus)
		adminProtected.POST("/feedbacks/:id/reply", h.feedback.ReplyFeedback)
		adminProtected.DELETE("/feedbacks/:id", h.feedback.DeleteFeedback)

		// 用户会话监控(内测期定位用户问题)—— 列某 feature 下用户的 agent 会话 + 拉 transcript(只读)。
		// 覆盖 smart_search/claw/prism;审稿走 peer_review 报告另算。
		adminProtected.GET("/agent-sessions", h.agentBridge.AdminListSessions)
		adminProtected.GET("/agent-sessions/:sessionId/messages", h.agentBridge.AdminGetSessionMessages)
		// 审稿监控:投稿列表 + 一份投稿的完整数据(草稿过程 + 审稿报告 + 附件)。
		adminProtected.GET("/peer-review/submissions", h.peerReview.AdminListSubmissions)
		adminProtected.GET("/peer-review/submissions/:id", h.peerReview.AdminGetSubmission)

		// 使用日志管理 (前端用 list/summary/config GET+PUT/cleanup/export;
		// features/filter-options/all 已下线)
		adminProtected.GET("/usage-logs", h.usageLogAdmin.List)
		adminProtected.GET("/usage-logs/summary", h.usageLogAdmin.GetStatsSummary)
		adminProtected.GET("/usage-logs/config", h.usageLogAdmin.GetConfig)
		adminProtected.PUT("/usage-logs/config", h.usageLogAdmin.UpdateConfig)
		adminProtected.POST("/usage-logs/cleanup", h.usageLogAdmin.TriggerCleanup)
		adminProtected.GET("/usage-logs/export", h.usageLogAdmin.ExportCSV)

		// 功能使用统计 v2 (usage_events) —— 取代旧 usage-logs 统计, 新菜单"使用统计"用。
		adminProtected.GET("/usage-stats/summary", h.usageStats.GetSummary)
		adminProtected.GET("/usage-stats/peer-review-funnel", h.usageStats.GetFunnel)
		adminProtected.GET("/usage-stats/events", h.usageStats.ListEvents)
		adminProtected.POST("/usage-stats/cleanup", h.usageStats.TriggerCleanup)

		// LLM Token 用量看板 (llm_token_usage) —— 总览/明细/筛选项/CSV 导出/手动清理。
		adminProtected.GET("/llm-token-usage/summary", h.llmUsageAdmin.GetSummary)
		adminProtected.GET("/llm-token-usage/logs", h.llmUsageAdmin.ListLogs)
		adminProtected.GET("/llm-token-usage/facets", h.llmUsageAdmin.GetFacets)
		adminProtected.GET("/llm-token-usage/export", h.llmUsageAdmin.ExportCSV)
		adminProtected.POST("/llm-token-usage/cleanup", h.llmUsageAdmin.TriggerCleanup)

		// 会员兑换码: 批量生成 + 列表 + 停用/恢复
		adminProtected.POST("/vip-codes", h.vip.GenerateCodes)
		adminProtected.GET("/vip-codes", h.vip.ListCodes)
		adminProtected.PUT("/vip-codes/:id/status", h.vip.SetCodeStatus)

		// 功能大全 (学术工具黄页) —— 导入/任务/CRUD/webhook。
		// 路径结构刻意避免 gin "static vs :param" 同层冲突:
		// 集合子资源 (categories/import/import-jobs/webhooks) 是 /admin/tools 的静态子节点,
		// 单条 CRUD 走 /admin/tools/items/:id (参数节点在 /items 下, 不与上面静态节点同层)。
		tools := adminProtected.Group("/tools")
		{
			tools.GET("", h.featureTool.AdminList)
			tools.POST("", h.featureTool.AdminCreate)
			tools.GET("/categories", h.featureTool.AdminCategories)

			// 批量导入 (JSON body) + zip 上传导入 + 任务管理
			tools.POST("/import", h.featureTool.AdminImport)
			tools.POST("/import-zip", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.featureTool.AdminImportZip)
			tools.GET("/import-jobs", h.featureTool.AdminListJobs)
			tools.GET("/import-jobs/:id", h.featureTool.AdminGetJob)

			// Webhook 订阅 + 投递记录
			tools.GET("/webhooks", h.featureTool.AdminListWebhooks)
			tools.POST("/webhooks", h.featureTool.AdminCreateWebhook)
			tools.PUT("/webhooks/:id", h.featureTool.AdminUpdateWebhook)
			tools.DELETE("/webhooks/:id", h.featureTool.AdminDeleteWebhook)
			tools.POST("/webhooks/:id/test", h.featureTool.AdminTestWebhook)
			tools.GET("/webhooks/:id/deliveries", h.featureTool.AdminWebhookDeliveries)

			// 单条 CRUD
			tools.GET("/items/:id", h.featureTool.AdminGet)
			tools.PUT("/items/:id", h.featureTool.AdminUpdate)
			tools.DELETE("/items/:id", h.featureTool.AdminDelete)
		}

		// 热门内容管理
		adminProtected.GET("/hot-content/keywords", h.hotContent.GetHotKeywords)
		adminProtected.GET("/hot-content/papers", h.hotContent.GetHotPapers)
		adminProtected.GET("/hot-content/stats", h.hotContent.GetStats)
		adminProtected.POST("/hot-content/cleanup", h.hotContent.ManualCleanup)
		// 清理策略配置 (保留天数 / 最大记录数), 改了下一轮 cleanup 立即生效
		adminProtected.GET("/hot-content/config", h.hotContent.GetConfig)
		adminProtected.PUT("/hot-content/config", h.hotContent.UpdateConfig)

		// 站内信管理 (单 GET、stats 历史下线;消息模板整套已下线 2026-05-28)
		adminProtected.POST("/messages", h.message.AdminCreateMessage)
		adminProtected.GET("/messages", h.message.AdminGetMessages)
		adminProtected.POST("/messages/:id/send", h.message.AdminSendMessage)

		// 邮件发送记录(全站邮件无差别记录:成功/失败/报错/收件人)
		adminProtected.GET("/email-logs", h.emailLog.AdminList)

		// ─── AI feature prompt 注册表 (已下线) ─────────────────────────────
		// smart_search/claw 提示词已迁回代码 const (internal/prompts), peerreview 审稿人
		// 改用 skill (agent/data/claude/skills/rv-*), feature_prompts 表不再驱动任何 feature。
		// 这套 admin CRUD 只会编辑"死行"(改了不生效), 故整组路由下线。
		// promptregistry.Service 仍保留 (peerreview handler GetPromptByID 渲染老报告用)。
	}

	// 超级管理员专属：角色分配（提升/降级 admin）
	// 单独建组复用 /admin 前缀但用更严格的中间件，避免和上面的 admin 中间件嵌套执行。
	superAdminOnly := api.Group("/admin")
	superAdminOnly.Use(middleware.SuperAdminAuthMiddleware())
	{
		superAdminOnly.PUT("/users/:id/role", h.admin.UpdateUserRole)
	}
}
