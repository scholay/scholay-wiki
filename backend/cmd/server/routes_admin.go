// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	"scholar-backend/internal/admin"
	"scholar-backend/internal/common/middleware"

	"github.com/gin-gonic/gin"
)

// registerAdminRoutes 注册管理员受保护路由
func registerAdminRoutes(api *gin.RouterGroup, h *allHandlers) {
	adminProtected := api.Group("/admin")
	adminProtected.Use(middleware.AdminAuthMiddleware())
	{
		adminProtected.GET("/profile", h.admin.GetProfile)
		adminProtected.PUT("/password", h.admin.UpdatePassword)
		adminProtected.POST("/verify-password", h.admin.VerifyPassword)

		// 仪表板
		adminProtected.GET("/dashboard/statistics", h.dashboard.GetDashboardStatistics)
		adminProtected.GET("/dashboard/active-users", admin.GetActiveUserInsights)
		adminProtected.GET("/dashboard/payment-funnel", admin.GetPaymentFunnel)

		// 系统配置
		adminProtected.PUT("/privacy-policy", h.config.UpdatePrivacyPolicy)
		adminProtected.PUT("/terms-of-service", h.config.UpdateTermsOfService)
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

		// 代码片段管理
		adminProtected.GET("/code-snippets", h.config.ListCodeSnippets)
		adminProtected.GET("/code-snippets/:id", h.config.GetCodeSnippet)
		adminProtected.POST("/code-snippets", h.config.CreateCodeSnippet)
		adminProtected.PUT("/code-snippets/:id", h.config.UpdateCodeSnippet)
		adminProtected.DELETE("/code-snippets/:id", h.config.DeleteCodeSnippet)

		// 用户管理
		adminProtected.GET("/users/stats", h.user.GetUserStatistics)
		adminProtected.GET("/users", h.user.GetUserList)
		adminProtected.GET("/users/online", h.user.GetOnlineUsers)
		adminProtected.GET("/users/:id", h.user.GetUserDetail)
		adminProtected.GET("/users/:id/aggregate", h.user.GetUserAggregate)
		adminProtected.DELETE("/users/:id", h.user.DeleteUser)
		adminProtected.POST("/users/batch-delete", h.user.BatchDeleteUsers)
		adminProtected.PUT("/users/:id/freeze", h.user.FreezeUser)
		adminProtected.PUT("/users/:id/unfreeze", h.user.UnfreezeUser)
		adminProtected.PUT("/users/:id/notes", h.user.UpdateAdminNotes)

		// 审计日志(只读)
		adminProtected.GET("/audit-logs", admin.ListAuditLogsHandler)

		// 公告管理
		adminProtected.GET("/announcements", h.announcement.ListAdmin)
		adminProtected.POST("/announcements", h.announcement.Create)
		adminProtected.PUT("/announcements/:id", h.announcement.Update)
		adminProtected.DELETE("/announcements/:id", h.announcement.Delete)

		// 统计图表
		adminProtected.GET("/statistics/users", h.user.GetUserStatisticsChart)
		adminProtected.GET("/statistics/online", h.user.GetOnlineUserChart)

		// 第三方账号管理
		adminProtected.GET("/third-party-accounts", h.thirdParty.ListAccounts)
		adminProtected.POST("/third-party-accounts", h.thirdParty.CreateAccount)
		adminProtected.GET("/third-party-accounts/stats", h.thirdParty.GetStats)
		adminProtected.POST("/third-party-accounts/refresh-cache", h.thirdParty.RefreshCache)
		adminProtected.GET("/third-party-accounts/:id", h.thirdParty.GetAccount)
		adminProtected.PUT("/third-party-accounts/:id", h.thirdParty.UpdateAccount)
		adminProtected.DELETE("/third-party-accounts/:id", h.thirdParty.DeleteAccount)
		adminProtected.POST("/third-party-accounts/:id/test", h.thirdParty.TestAccount)
		adminProtected.POST("/third-party-accounts/:id/reset-stats", h.thirdParty.ResetAccountStats)

		// Prompt 模板管理
		adminProtected.GET("/prompt-templates", h.ai.ListPromptTemplates)
		adminProtected.POST("/prompt-templates", h.ai.CreatePromptTemplate)
		adminProtected.GET("/prompt-templates/:id", h.ai.GetPromptTemplate)
		adminProtected.PUT("/prompt-templates/:id", h.ai.UpdatePromptTemplate)
		adminProtected.DELETE("/prompt-templates/:id", h.ai.DeletePromptTemplate)
		adminProtected.GET("/prompt-templates/:id/versions", h.ai.ListPromptTemplateVersionsHandler)

		// 分析维度管理
		adminProtected.GET("/analysis/dimensions", h.ai.AdminGetSystemDimensions)
		adminProtected.PUT("/analysis/dimensions/:id", h.ai.AdminUpdateSystemDimension)

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

		// 微信 OAuth 配置
		adminProtected.GET("/wechat/config", h.wechat.GetActiveConfig)
		adminProtected.GET("/wechat/configs", h.wechat.ListConfigs)
		adminProtected.POST("/wechat/config", h.wechat.CreateConfig)
		adminProtected.PUT("/wechat/config/:id", h.wechat.UpdateConfig)
		adminProtected.DELETE("/wechat/config/:id", h.wechat.DeleteConfig)
		adminProtected.POST("/wechat/config/:id/activate", h.wechat.SetActiveConfig)

		// 微信公众号配置
		adminProtected.GET("/wechat-official/config", h.wechatOfficial.GetConfig)
		adminProtected.PUT("/wechat-official/config", h.wechatOfficial.UpdateConfig)

		// LaTeX Agent 配置
		adminProtected.GET("/latex-agent/config", h.latexAgentAdmin.GetAgentConfig)
		adminProtected.PUT("/latex-agent/config", h.latexAgentAdmin.UpdateAgentConfig)
		adminProtected.GET("/latex-agent/model-presets", h.latexAgentAdmin.GetModelPresets)
		adminProtected.GET("/latex-agent/config-options", h.latexAgentAdmin.GetConfigOptions)
		adminProtected.GET("/latex-agent/api-formats", h.latexAgentAdmin.GetAPIFormats)
		adminProtected.POST("/latex-agent/apply-preset", h.latexAgentAdmin.ApplyModelPreset)
		adminProtected.POST("/latex-agent/test-connection", h.latexAgentAdmin.TestConnection)
		adminProtected.GET("/latex-agent/models", h.latexAgentAdmin.ListModels)
		adminProtected.POST("/latex-agent/models", h.latexAgentAdmin.CreateModel)
		adminProtected.PUT("/latex-agent/models/:id", h.latexAgentAdmin.UpdateModel)
		adminProtected.DELETE("/latex-agent/models/:id", h.latexAgentAdmin.DeleteModel)
		adminProtected.POST("/latex-agent/models/:id/set-default", h.latexAgentAdmin.SetDefaultModel)

		// 反馈管理
		adminProtected.GET("/feedbacks", h.feedback.ListFeedbacks)
		adminProtected.GET("/feedbacks/stats", h.feedback.GetStats)
		adminProtected.GET("/feedbacks/:id", h.feedback.GetFeedback)
		adminProtected.PUT("/feedbacks/:id/status", h.feedback.UpdateStatus)
		adminProtected.PUT("/feedbacks/:id/category", h.feedback.UpdateCategory)
		adminProtected.PUT("/feedbacks/:id/assignee", h.feedback.AssignFeedback)
		adminProtected.PUT("/feedbacks/:id/internal-notes", h.feedback.UpdateInternalNotes)
		adminProtected.POST("/feedbacks/:id/reply", h.feedback.ReplyFeedback)
		adminProtected.DELETE("/feedbacks/:id", h.feedback.DeleteFeedback)

		// 用户标签管理
		adminProtected.GET("/user-tags", h.userTag.ListTags)
		adminProtected.POST("/user-tags", h.userTag.CreateTag)
		adminProtected.PUT("/user-tags/:id", h.userTag.UpdateTag)
		adminProtected.DELETE("/user-tags/:id", h.userTag.DeleteTag)
		adminProtected.POST("/user-tags/assign", h.userTag.AssignTags)
		adminProtected.GET("/users/:id/tags", h.userTag.GetUserTags)

		// 使用日志管理
		adminProtected.GET("/usage-logs", h.usageLogAdmin.List)
		adminProtected.GET("/usage-logs/summary", h.usageLogAdmin.GetStatsSummary)
		adminProtected.GET("/usage-logs/filter-options", h.usageLogAdmin.GetFilterOptions)
		adminProtected.GET("/usage-logs/features", h.usageLogAdmin.GetFeatureConfigs)
		adminProtected.GET("/usage-logs/config", h.usageLogAdmin.GetConfig)
		adminProtected.PUT("/usage-logs/config", h.usageLogAdmin.UpdateConfig)
		adminProtected.POST("/usage-logs/cleanup", h.usageLogAdmin.TriggerCleanup)
		adminProtected.DELETE("/usage-logs/all", h.usageLogAdmin.ClearAllLogs)
		adminProtected.GET("/usage-logs/export", h.usageLogAdmin.ExportCSV)

		// 热门内容管理
		adminProtected.GET("/hot-content/keywords", h.hotContent.GetHotKeywords)
		adminProtected.GET("/hot-content/papers", h.hotContent.GetHotPapers)
		adminProtected.GET("/hot-content/stats", h.hotContent.GetStats)
		adminProtected.POST("/hot-content/cleanup", h.hotContent.ManualCleanup)

		// 站内信管理
		adminProtected.POST("/messages", h.message.AdminCreateMessage)
		adminProtected.GET("/messages", h.message.AdminGetMessages)
		adminProtected.GET("/messages/stats", h.message.AdminGetMessageStats)
		adminProtected.GET("/messages/:id", h.message.AdminGetMessage)
		adminProtected.POST("/messages/:id/send", h.message.AdminSendMessage)
		adminProtected.POST("/message-templates", h.message.AdminCreateTemplate)
		adminProtected.GET("/message-templates", h.message.AdminGetTemplates)
		adminProtected.GET("/message-templates/:id", h.message.AdminGetTemplate)
		adminProtected.PUT("/message-templates/:id", h.message.AdminUpdateTemplate)
		adminProtected.DELETE("/message-templates/:id", h.message.AdminDeleteTemplate)

		// PDF 缓存管理
		adminProtected.GET("/pdf/cache/stats", h.pdf.GetCacheStats)
	}

	// 超级管理员专属：角色分配（提升/降级 admin）
	// 单独建组复用 /admin 前缀但用更严格的中间件，避免和上面的 admin 中间件嵌套执行。
	superAdminOnly := api.Group("/admin")
	superAdminOnly.Use(middleware.SuperAdminAuthMiddleware())
	{
		superAdminOnly.PUT("/users/:id/role", h.admin.UpdateUserRole)
	}
}
