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

// registerAdminRoutes 注册管理员受保护路由。
//
// 授权模型（四角色:user / operations / admin / super_admin）:
// 全部 /api/v1/admin/* 曾统一挂 AdminAuthMiddleware(admin/super_admin 无差别放行、
// 无按接口维度),「运营(operations)只能访问部分后台」无处落地。现在按权限把路由拆成
// 若干子组、各挂 middleware.RequirePermission(<perm>) —— 这是**后端硬闸**,operations
// 的 token 直接打被禁端点一律 403,不依赖前端藏菜单。权限定义单一真源在
// admin.PermissionsForRole:
//   - analytics.view : 只读看板/统计/日志/会话监控/营收         → operations ✓ admin ✓ super ✓
//   - content.manage : 内容/互动运营(公告/反馈/审核/站内信/邮件/工具/推广) → operations ✓ admin ✓ super ✓
//   - users.view     : 用户列表/统计/详情(只读)               → operations ✓ admin ✓ super ✓
//   - users.manage   : 用户写操作(冻结/删号/发会员/调钱包/财务下钻)   → operations ✗ admin ✓ super ✓
//   - config.manage  : 系统/凭证/支付/模型/计费等配置            → operations ✗ admin ✓ super ✓
//   - users.role.assign: 角色分配                            → operations ✗ admin ✗ super ✓
//
// 注:多个子组共用 "/admin" 前缀只是分别挂不同中间件;最终注册到 gin 的具体路径集与
// 拆分前完全一致(每条路径仍只出现一次),不会冲突。
func registerAdminRoutes(api *gin.RouterGroup, h *allHandlers) {
	// ────────────────────────────────────────────────────────────────────
	// 只读观测组(analytics.view)—— 运营可见:看板/统计/日志/会话监控/营收,纯 GET。
	// ────────────────────────────────────────────────────────────────────
	opsRead := api.Group("/admin")
	opsRead.Use(middleware.RequirePermission(admin.PermAnalyticsView))
	{
		// 仪表板 —— active-users/payment-funnel 已下线,在线/活跃指标改用 umami
		opsRead.GET("/dashboard/statistics", h.dashboard.GetDashboardStatistics)

		// Umami analytics —— backend 查 umami HTTP API,前端 admin 自己渲染图表
		opsRead.GET("/analytics/overview", h.umami.GetOverview)
		opsRead.GET("/analytics/pageviews", h.umami.GetPageviews)
		opsRead.GET("/analytics/top", h.umami.GetTop)
		opsRead.GET("/analytics/active", h.umami.GetActive)

		// 订单与营收(orders 表 = vip 充值/订阅唯一收款真源;payment_transactions 是 stranded 勿用)
		opsRead.GET("/billing/orders", h.vip.AdminListOrders)
		opsRead.GET("/billing/orders/stats", h.vip.AdminOrderStats)

		// 用户会话监控(内测期定位用户问题)—— 列某 feature 下用户的 agent 会话 + 拉 transcript(只读)。
		// 覆盖 smart_search/claw/prism;审稿走 peer_review 报告另算。
		opsRead.GET("/agent-sessions", h.agentBridge.AdminListSessions)
		opsRead.GET("/agent-sessions/:sessionId/messages", h.agentBridge.AdminGetSessionMessages)
		// 会话内用户上传文件 / 引用文档:从 agent 会话 cwd 取原始字节,内联预览 / 下载(只读)。
		opsRead.GET("/agent-sessions/:sessionId/file", h.agentBridge.AdminGetSessionFile)
		// 审稿监控:投稿列表 + 一份投稿的完整数据(草稿过程 + 审稿报告 + 附件)。
		opsRead.GET("/peer-review/submissions", h.peerReview.AdminListSubmissions)
		opsRead.GET("/peer-review/submissions/:id", h.peerReview.AdminGetSubmission)
		// 投稿附件原文件:从 MinIO 流式取,内联预览(react-pdf 等) / 下载。
		opsRead.GET("/peer-review/submissions/:id/assets/:assetId", h.peerReview.AdminGetSubmissionAsset)

		// 功能使用统计 v2 (usage_events) —— 只读部分(cleanup 触发在 adminOnly 组)。
		opsRead.GET("/usage-stats/summary", h.usageStats.GetSummary)
		opsRead.GET("/usage-stats/peer-review-funnel", h.usageStats.GetFunnel)
		opsRead.GET("/usage-stats/events", h.usageStats.ListEvents)

		// LLM 算力用量看板 (llm_token_usage) —— 只读总览/明细/筛选项/CSV 导出(cleanup 在 adminOnly 组)。
		// 路径保持 /llm-token-usage/*:表名与 URL 是对外契约, 只有展示口径改成了算力点(cost_micro_yuan ÷ 1000)。
		opsRead.GET("/llm-token-usage/summary", h.llmUsageAdmin.GetSummary)
		opsRead.GET("/llm-token-usage/logs", h.llmUsageAdmin.ListLogs)
		opsRead.GET("/llm-token-usage/facets", h.llmUsageAdmin.GetFacets)
		opsRead.GET("/llm-token-usage/export", h.llmUsageAdmin.ExportCSV)

		// 邮件发送记录(全站邮件无差别记录:成功/失败/报错/收件人)
		opsRead.GET("/email-logs", h.emailLog.AdminList)

		// 热门内容 —— 只读排行/统计部分(清理策略配置 + 手动清理在 adminOnly 组)。
		opsRead.GET("/hot-content/keywords", h.hotContent.GetHotKeywords)
		opsRead.GET("/hot-content/papers", h.hotContent.GetHotPapers)
		opsRead.GET("/hot-content/stats", h.hotContent.GetStats)
	}

	// ────────────────────────────────────────────────────────────────────
	// 内容/互动运营组(content.manage)—— 运营可写:公告/反馈/审核/站内信/邮件/工具/推广。
	// ────────────────────────────────────────────────────────────────────
	opsContent := api.Group("/admin")
	opsContent.Use(middleware.RequirePermission(admin.PermContentManage))
	{
		// 公告管理
		opsContent.GET("/announcements", h.announcement.ListAdmin)
		opsContent.POST("/announcements", h.announcement.Create)
		opsContent.PUT("/announcements/:id", h.announcement.Update)
		opsContent.DELETE("/announcements/:id", h.announcement.Delete)

		// 反馈管理 (list / stats / 改 status / reply / 详情 / 删除)
		opsContent.GET("/feedbacks", h.feedback.ListFeedbacks)
		opsContent.GET("/feedbacks/stats", h.feedback.GetStats)
		opsContent.GET("/feedbacks/:id", h.feedback.GetFeedback)
		opsContent.PUT("/feedbacks/:id/status", h.feedback.UpdateStatus)
		opsContent.POST("/feedbacks/:id/reply", h.feedback.ReplyFeedback)
		opsContent.DELETE("/feedbacks/:id", h.feedback.DeleteFeedback)

		// Skills 市场审核(内容运营)—— 审核队列 / 通过·驳回·下架(kill-switch)/ 举报处理
		opsContent.GET("/skills", h.skillMarket.AdminList)
		opsContent.GET("/skills/reports", h.skillMarket.AdminListReports)
		opsContent.POST("/skills/reports/:id/resolve", h.skillMarket.AdminResolveReport)
		opsContent.POST("/skills/:id/approve", h.skillMarket.AdminApprove)
		opsContent.POST("/skills/:id/reject", h.skillMarket.AdminReject)
		opsContent.POST("/skills/:id/takedown", h.skillMarket.AdminTakedown)

		// 站内信管理 (单 GET、stats 历史下线;消息模板整套已下线 2026-05-28)
		opsContent.POST("/messages", h.message.AdminCreateMessage)
		opsContent.GET("/messages", h.message.AdminGetMessages)
		opsContent.POST("/messages/:id/send", h.message.AdminSendMessage)

		// 限时领取会员推广:开关 + 微信客服二维码 + 文案
		opsContent.GET("/promo/config", h.promo.GetConfig)
		opsContent.PUT("/promo/config", h.promo.UpdateConfig)

		// 客服邮件中心(收件箱 + 回信/写信 + 立即拉取)—— **仅用不改**凭证。
		// 收发信凭证(IMAP/SMTP/飞书)配置在 adminOnly 组的 /support-center/config。
		opsContent.POST("/support-center/imap/poll", h.supportCenter.PollNow)
		opsContent.GET("/support-center/inbox", h.supportCenter.ListInbox)
		opsContent.GET("/support-center/inbox/:id", h.supportCenter.GetInboxMail)
		opsContent.POST("/support-center/inbox/:id/reply", h.supportCenter.ReplyInbox)
		opsContent.POST("/support-center/compose", h.supportCenter.Compose)

		// 功能大全 (学术工具黄页) —— 导入/任务/CRUD/webhook。
		// 路径结构刻意避免 gin "static vs :param" 同层冲突:
		// 集合子资源 (categories/import/import-jobs/webhooks) 是 /admin/tools 的静态子节点,
		// 单条 CRUD 走 /admin/tools/items/:id (参数节点在 /items 下, 不与上面静态节点同层)。
		tools := opsContent.Group("/tools")
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
	}

	// ────────────────────────────────────────────────────────────────────
	// 用户列表只读组(users.view)—— 运营可见:列表/统计/详情(只读)。
	// 写操作(冻结/删号/发会员/调钱包/财务下钻)在下面的 userWrites 组(仅管理员)。
	// ────────────────────────────────────────────────────────────────────
	opsUsersRead := api.Group("/admin")
	opsUsersRead.Use(middleware.RequirePermission(admin.PermUsersView))
	{
		opsUsersRead.GET("/users/stats", h.user.GetUserStatistics)
		opsUsersRead.GET("/users/metrics", h.user.GetUserMetrics)
		opsUsersRead.GET("/users", h.user.GetUserList)
		// 用户详情抽屉:登录方式 + 该用户会员状态/今日额度(不含财务下钻,后者在 userWrites 组)
		opsUsersRead.GET("/users/:id/detail", h.user.GetUserDetail)

		// 邀请注册看板(只读):汇总四数 + 邀请人列表 + 某邀请人(:id=user_id)带来的注册明细。
		// 静态段 summary 与 :id param 同层共存(gin 1.9 静态优先,同 /skills 口径)。
		opsUsersRead.GET("/invites/summary", h.invite.AdminSummary)
		opsUsersRead.GET("/invites", h.invite.AdminList)
		opsUsersRead.GET("/invites/:id/registrations", h.invite.AdminRegistrations)
	}

	// ────────────────────────────────────────────────────────────────────
	// 用户写操作组(users.manage)—— 仅管理员:冻结/删号/发会员/调钱包 + 财务下钻。
	// 运营无此权限 → 打这些端点一律 403(前端也会把对应按钮/财务 tab 藏掉)。
	// ────────────────────────────────────────────────────────────────────
	userWrites := api.Group("/admin")
	userWrites.Use(middleware.RequirePermission(admin.PermUsersManage))
	{
		userWrites.DELETE("/users/:id", h.user.DeleteUser)
		userWrites.POST("/users/batch-delete", h.user.BatchDeleteUsers)
		userWrites.PUT("/users/:id/freeze", h.user.FreezeUser)
		userWrites.PUT("/users/:id/unfreeze", h.user.UnfreezeUser)
		userWrites.GET("/users/:id/vip", h.vip.AdminUserVIPStatus)
		// 管理员直接授予/取消会员(不走兑换码)
		userWrites.POST("/users/:id/vip", h.vip.AdminGrantVIP)
		userWrites.DELETE("/users/:id/vip", h.vip.AdminRevokeVIP)
		// 管理员给用户加/扣经费
		userWrites.POST("/users/:id/wallet/adjust", h.vip.AdminAdjustWallet)
		// 管理员发放重置次数(0090 起次数是重置额度唯一凭证,此前只有 0092 历史换算一个来源)
		userWrites.POST("/users/:id/reset-passes", h.vip.AdminGrantResetPasses)
		// 用户详情财务下钻:订单 / 交易流水(充值·消费) / 兑换记录
		userWrites.GET("/users/:id/orders", h.vip.AdminListUserOrders)
		userWrites.GET("/users/:id/transactions", h.vip.AdminListUserTransactions)
		userWrites.GET("/users/:id/redemptions", h.vip.AdminListUserRedemptions)
	}

	// ────────────────────────────────────────────────────────────────────
	// 退款组(finance.refund)—— 全后台唯一一个「点一下就把公司的钱转出去 + 回收用户权益」
	// 的动作,单独一个权限点,便于独立授予/收回。
	//
	// 🔴 绝不能挂进上面的 opsRead(analytics.view):那是全后台权限最低的一档,
	//    连 operations 运营角色都有 —— 订单的两个 GET 就在那儿。看得到订单 ≠ 退得了款。
	// ────────────────────────────────────────────────────────────────────
	financeRefund := api.Group("/admin")
	financeRefund.Use(middleware.RequirePermission(admin.PermFinanceRefund))
	{
		// 登记一笔退款(不调网关:钱由管理员先在商户后台退掉,这里做记账 + 权益回收 + 通知)
		financeRefund.POST("/billing/orders/:orderNo/refund", h.vip.AdminRefundOrder)
		// 某订单的退款明细(部分退款可能有多笔)
		financeRefund.GET("/billing/orders/:orderNo/refunds", h.vip.AdminListOrderRefunds)
	}

	// ────────────────────────────────────────────────────────────────────
	// 系统/凭证/财务/AI 配置组(config.manage)—— 仅管理员:凭证、支付、模型、计费、
	// 兑换码(发钱)、代码片段库(站点级脚本注入)、清理动作等。运营一律不可见/403。
	// ────────────────────────────────────────────────────────────────────
	adminOnly := api.Group("/admin")
	adminOnly.Use(middleware.RequirePermission(admin.PermConfigManage))
	{
		// 系统配置 —— 隐私政策 / 服务条款 已下线为代码常量(见 frontend-v2 legal-content.ts + 0046 迁移)
		adminOnly.GET("/email-config", h.config.GetEmailConfig)
		adminOnly.PUT("/email-config", h.config.UpdateEmailConfig)
		adminOnly.POST("/email-config/test", h.config.TestEmailConfig)
		adminOnly.GET("/sms-config", h.config.GetSMSConfig)
		adminOnly.PUT("/sms-config", h.config.UpdateSMSConfig)
		adminOnly.POST("/sms-config/test", h.config.TestSMSConfig)
		adminOnly.GET("/system-config", h.config.GetSystemConfigAdmin)
		adminOnly.PUT("/system-config", h.config.UpdateSystemConfig)
		adminOnly.GET("/github-config", h.config.GetGithubOAuthConfig)
		adminOnly.PUT("/github-config", h.config.UpdateGithubOAuthConfig)
		adminOnly.GET("/google-config", h.config.GetGoogleOAuthConfig)
		adminOnly.PUT("/google-config", h.config.UpdateGoogleOAuthConfig)
		adminOnly.GET("/apple-config", h.config.GetAppleOAuthConfig)
		adminOnly.PUT("/apple-config", h.config.UpdateAppleOAuthConfig)
		adminOnly.GET("/orcid-config", h.config.GetOrcidOAuthConfig)
		adminOnly.PUT("/orcid-config", h.config.UpdateOrcidOAuthConfig)
		adminOnly.GET("/microsoft-config", h.config.GetMicrosoftOAuthConfig)
		adminOnly.PUT("/microsoft-config", h.config.UpdateMicrosoftOAuthConfig)
		adminOnly.GET("/discourse-config", h.config.GetDiscourseSSOConfig)
		adminOnly.PUT("/discourse-config", h.config.UpdateDiscourseSSOConfig)

		// Matrix 多维分析 — 系统维度管理 (admin 编辑系统默认维度库 = 全站 AI 分析 prompt 骨架)
		adminOnly.GET("/analysis/dimensions", h.ai.AdminGetSystemDimensions)
		adminOnly.PUT("/analysis/dimensions/:id", h.ai.AdminUpdateSystemDimension)

		// 代码片段管理 —— 注入全站用户端的可执行脚本, 安全高危, 明确仅管理员。
		adminOnly.GET("/code-snippets", h.config.ListCodeSnippets)
		adminOnly.POST("/code-snippets", h.config.CreateCodeSnippet)
		adminOnly.PUT("/code-snippets/:id", h.config.UpdateCodeSnippet)
		adminOnly.DELETE("/code-snippets/:id", h.config.DeleteCodeSnippet)

		// 计费体系配置(基准额度/倍率/价格/赠送/汇率/重置花费…)
		adminOnly.GET("/billing/config", h.vip.AdminGetBillingConfig)
		adminOnly.PUT("/billing/config", h.vip.AdminUpdateBillingConfig)

		// 客服中心凭证配置:联系方式展示 / IMAP / SMTP / 飞书(含各测试按钮)。收发信本身在 opsContent 组。
		adminOnly.GET("/support-center/config", h.supportCenter.GetConfig)
		adminOnly.PUT("/support-center/config", h.supportCenter.UpdateConfig)
		adminOnly.POST("/support-center/feishu/test", h.supportCenter.TestFeishu)
		adminOnly.POST("/support-center/smtp/test", h.supportCenter.TestSMTP)
		adminOnly.POST("/support-center/imap/test", h.supportCenter.TestIMAP)

		// 情报(学术新闻)webhook 配置:前端展示开关 + 接收 URL(展示)+ HMAC 密钥(脱敏)
		adminOnly.GET("/news-webhook/config", h.news.GetConfig)
		adminOnly.PUT("/news-webhook/config", h.news.UpdateConfig)

		// 第三方账号管理(上游 AI/MiniCod API key 池)
		adminOnly.GET("/third-party-accounts", h.thirdParty.ListAccounts)
		adminOnly.POST("/third-party-accounts", h.thirdParty.CreateAccount)
		adminOnly.PUT("/third-party-accounts/:id", h.thirdParty.UpdateAccount)
		adminOnly.DELETE("/third-party-accounts/:id", h.thirdParty.DeleteAccount)
		adminOnly.POST("/third-party-accounts/:id/test", h.thirdParty.TestAccount)
		adminOnly.POST("/third-party-accounts/:id/reset-stats", h.thirdParty.ResetAccountStats)

		// 支付宝配置
		adminOnly.GET("/payment/alipay/config", h.alipay.GetActiveConfig)
		adminOnly.GET("/payment/alipay/configs", h.alipay.ListConfigs)
		adminOnly.POST("/payment/alipay/config", h.alipay.CreateConfig)
		adminOnly.PUT("/payment/alipay/config/:id", h.alipay.UpdateConfig)
		adminOnly.DELETE("/payment/alipay/config/:id", h.alipay.DeleteConfig)
		adminOnly.POST("/payment/alipay/config/:id/activate", h.alipay.SetActiveConfig)

		// 微信支付配置
		adminOnly.GET("/payment/wechat/config", h.wechatPay.GetActiveConfig)
		adminOnly.GET("/payment/wechat/configs", h.wechatPay.GetAllConfigs)
		adminOnly.POST("/payment/wechat/config", h.wechatPay.CreateConfig)
		adminOnly.PUT("/payment/wechat/config/:id", h.wechatPay.UpdateConfig)
		adminOnly.DELETE("/payment/wechat/config/:id", h.wechatPay.DeleteConfig)
		adminOnly.POST("/payment/wechat/config/:id/activate", h.wechatPay.ActivateConfig)
		// 「测试配置」:离线自洽校验 + 微信官方 /v3/security/echo 验签测试。
		// 启用前必须先通过它(ActivateConfig 会硬性检查 validation_status)。
		adminOnly.POST("/payment/wechat/config/:id/test", h.wechatPay.TestConfig)

		// 微信 OAuth 配置 (前端只用 active/configs/create/update/activate; DELETE 已下线)
		adminOnly.GET("/wechat/config", h.wechat.GetActiveConfig)
		adminOnly.GET("/wechat/configs", h.wechat.ListConfigs)
		adminOnly.POST("/wechat/config", h.wechat.CreateConfig)
		adminOnly.PUT("/wechat/config/:id", h.wechat.UpdateConfig)
		adminOnly.POST("/wechat/config/:id/activate", h.wechat.SetActiveConfig)

		// 微信公众号配置
		adminOnly.GET("/wechat-official/config", h.wechatOfficial.GetConfig)
		adminOnly.PUT("/wechat-official/config", h.wechatOfficial.UpdateConfig)

		// 微信小程序配置(单行;GET ?show_sensitive=true 返回明文 AppSecret,PUT 遮罩=保留旧值)
		adminOnly.GET("/wechat-miniprogram/config", h.wechat.GetMiniProgramConfig)
		adminOnly.PUT("/wechat-miniprogram/config", h.wechat.UpdateMiniProgramConfig)

		// 通用 Agent 服务 (scholar_agent 容器) 的连接配置(base_url/api_key/enabled/push_status)
		adminOnly.GET("/agent/config", h.agentConfig.GetConfig)
		adminOnly.PUT("/agent/config", h.agentConfig.UpdateConfig)

		// 模型目录 + 能力绑定(取代 agent_config 4 槽位;方案 docs/research/model-catalog-2026-07)
		adminOnly.GET("/models", h.modelCatalog.ListModels)
		adminOnly.POST("/models", h.modelCatalog.CreateModel)
		adminOnly.PUT("/models/:id", h.modelCatalog.UpdateModel)
		adminOnly.DELETE("/models/:id", h.modelCatalog.DeleteModel)
		adminOnly.GET("/model-bindings", h.modelCatalog.ListBindings)
		adminOnly.PUT("/model-bindings/:purpose", h.modelCatalog.SetBinding)
		// 上游 Provider(双协议 F0):额外 provider CRUD(默认 provider 仍在 /agent/config)
		adminOnly.GET("/model-providers", h.modelCatalog.ListProviders)
		adminOnly.POST("/model-providers", h.modelCatalog.CreateProvider)
		adminOnly.PUT("/model-providers/:id", h.modelCatalog.UpdateProvider)
		adminOnly.DELETE("/model-providers/:id", h.modelCatalog.DeleteProvider)

		// 功能使用统计 v2 —— 清理(破坏性,删超期埋点)。只读统计在 opsRead 组。
		adminOnly.POST("/usage-stats/cleanup", h.usageStats.TriggerCleanup)

		// LLM 算力用量 —— 手动清理(破坏性)。只读看板在 opsRead 组。
		adminOnly.POST("/llm-token-usage/cleanup", h.llmUsageAdmin.TriggerCleanup)

		// 会员兑换码: 批量生成(等于凭空发会员/经费)+ 列表 + 停用/恢复 + 续期 + 加次数 + 改会员天数
		adminOnly.POST("/vip-codes", h.vip.GenerateCodes)
		adminOnly.GET("/vip-codes", h.vip.ListCodes)
		adminOnly.GET("/vip-code-batches", h.vip.ListCodeBatches)
		adminOnly.GET("/vip-code-batches/:batchID/codes", h.vip.GetCodeBatch)
		adminOnly.PUT("/vip-codes/:id/status", h.vip.SetCodeStatus)
		adminOnly.PUT("/vip-codes/:id/extend", h.vip.ExtendCode)           // 续期(顺延有效期)
		adminOnly.PUT("/vip-codes/:id/max-uses", h.vip.IncreaseCodeUses)   // 加可兑换次数
		adminOnly.PUT("/vip-codes/:id/grant-days", h.vip.SetCodeGrantDays) // 改会员天数(只影响之后的兑换)

		// 热门内容 —— 清理策略配置 + 手动清理(破坏性)。只读排行在 opsRead 组。
		adminOnly.POST("/hot-content/cleanup", h.hotContent.ManualCleanup)
		adminOnly.GET("/hot-content/config", h.hotContent.GetConfig)
		adminOnly.PUT("/hot-content/config", h.hotContent.UpdateConfig)
	}

	// ────────────────────────────────────────────────────────────────────
	// 超级管理员专属(users.role.assign)—— 角色分配(user/operations/admin 互相迁移)。
	// 单独建组复用 /admin 前缀但用更严格的中间件,只放行 super_admin。
	// ────────────────────────────────────────────────────────────────────
	superAdminOnly := api.Group("/admin")
	superAdminOnly.Use(middleware.SuperAdminAuthMiddleware())
	{
		superAdminOnly.PUT("/users/:id/role", h.admin.UpdateUserRole)
	}
}
