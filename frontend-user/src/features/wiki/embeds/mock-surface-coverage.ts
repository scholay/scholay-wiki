/**
 * product-mock → Wiki 静态表面覆盖账本。
 *
 * 这里按“可被独立验收的视觉表面”计数，而不是按 React 文件或路由计数。同一组
 * mock 源文件只有在同一个实际界面状态中同时可见时才能合并为一个 fixture；互斥状态
 * 必须拆开登记，不能拼成源产品里不存在的说明图。fixture 只冻结数据和写操作，视觉
 * 结构、尺寸、色板、圆角、阴影、图表类型与页面 chrome 以 mock 同状态为准。
 * `covered` 表示本轮盘点前已有 fixture；`fixture` 表示本轮盘点补齐或修正；
 * `excluded` 只允许用于没有稳定独立视觉状态的内部宿主、重定向或动态协调器。
 */

export type MockSurfaceDomain = "user" | "mobile" | "admin";
export type MockSurfaceDisposition = "fixture" | "covered" | "excluded";

/** 最后一次逐项对照静态 fixture 与产品源界面的日期。 */
export const MOCK_SURFACE_DEFAULT_VERIFIED_AT = "2026-08-13";

type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

interface MockSurfaceCoverageBase {
  readonly key: string;
  readonly domain: MockSurfaceDomain;
  readonly mockSourcePaths: NonEmptyReadonlyArray<string>;
  readonly reason: string;
}

export type MockSurfaceCoverageEntry =
  | (MockSurfaceCoverageBase & {
      readonly disposition: "fixture" | "covered";
      readonly fixtureIds: NonEmptyReadonlyArray<string>;
      readonly verifiedAt: string;
    })
  | (MockSurfaceCoverageBase & {
      readonly disposition: "excluded";
      readonly fixtureIds: readonly [];
    });

function covered<const Key extends string>(
  domain: MockSurfaceDomain,
  key: Key,
  mockSourcePaths: NonEmptyReadonlyArray<string>,
  reason: string,
  verifiedAt = MOCK_SURFACE_DEFAULT_VERIFIED_AT,
) {
  return {
    key,
    domain,
    mockSourcePaths,
    disposition: "covered",
    fixtureIds: [key],
    verifiedAt,
    reason,
  } as const satisfies MockSurfaceCoverageEntry;
}

function fixture<const Key extends string>(
  domain: MockSurfaceDomain,
  key: Key,
  mockSourcePaths: NonEmptyReadonlyArray<string>,
  reason: string,
  verifiedAt = MOCK_SURFACE_DEFAULT_VERIFIED_AT,
) {
  return {
    key,
    domain,
    mockSourcePaths,
    disposition: "fixture",
    fixtureIds: [key],
    verifiedAt,
    reason,
  } as const satisfies MockSurfaceCoverageEntry;
}

function visibleGroup(
  domain: MockSurfaceDomain,
  key: string,
  mockSourcePaths: NonEmptyReadonlyArray<string>,
  disposition: "fixture" | "covered",
  fixtureIds: NonEmptyReadonlyArray<string>,
  reason: string,
  verifiedAt = MOCK_SURFACE_DEFAULT_VERIFIED_AT,
) {
  return {
    key,
    domain,
    mockSourcePaths,
    disposition,
    fixtureIds,
    verifiedAt,
    reason,
  } as const satisfies MockSurfaceCoverageEntry;
}

function excluded(
  domain: MockSurfaceDomain,
  key: string,
  mockSourcePaths: NonEmptyReadonlyArray<string>,
  reason: string,
) {
  return {
    key,
    domain,
    mockSourcePaths,
    disposition: "excluded",
    fixtureIds: [],
    reason,
  } as const satisfies MockSurfaceCoverageEntry;
}

const USER_EXISTING_SURFACES = [
  covered(
    "user",
    "academic-intel-detail",
    ["frontend-user/src/features/news/pages/NewsDetailPage.tsx"],
    "学术情报正文、来源和可信度说明已有详情 fixture。",
  ),
  covered(
    "user",
    "academic-intel-list",
    ["frontend-user/src/features/news/pages/NewsListPage.tsx"],
    "scholay 情报列表、分类和排序已按现行单列表面复核。",
    "2026-08-17",
  ),
  covered(
    "user",
    "account-assets",
    ["frontend-user/src/features/settings/components/account-assets-card.tsx"],
    "账户余额、会员和额度摘要已有 fixture。",
  ),
  covered(
    "user",
    "account-connections",
    ["frontend-user/src/features/settings/pages/ConnectionsPage.tsx"],
    "第三方连接列表及绑定边界已有 fixture。",
  ),
  covered(
    "user",
    "account-security",
    ["frontend-user/src/features/settings/pages/SecurityPage.tsx"],
    "密码和换绑验证表面已有 fixture。",
  ),
  covered(
    "user",
    "wechat-qr-login",
    ["frontend-user/src/features/auth/components/WeChatQRPanel.tsx"],
    "微信扫码登录的等待扫码单一状态已有 fixture。",
  ),
  covered(
    "user",
    "oauth-callback-states",
    ["frontend-user/src/features/auth/pages/OAuthCallbackPage.tsx"],
    "OAuth 回调正在完成登录的单一状态已有 fixture。",
  ),
  fixture(
    "user",
    "wechat-callback-state",
    ["frontend-user/src/features/auth/pages/WeChatCallbackPage.tsx"],
    "微信扫码回调独立中转页的处理中状态由本轮补齐为独立 fixture。",
  ),
  covered(
    "user",
    "oauth-account-merge",
    ["frontend-user/src/features/auth/components/OAuthMergeConfirmDialog.tsx"],
    "账号冲突后的安全合并选择已有 fixture。",
  ),
  covered(
    "user",
    "subscription-checkout",
    ["frontend-user/src/shared/components/subscribe-dialog.tsx"],
    "订阅报价和升级补差确认已有 fixture。",
  ),
  covered(
    "user",
    "wallet-recharge",
    ["frontend-user/src/features/settings/components/billing-panels.tsx"],
    "余额充值和订单确认已有 fixture。",
  ),
  covered(
    "user",
    "billing-orders",
    ["frontend-user/src/features/settings/components/billing-panels.tsx"],
    "订阅与充值订单明细已有 fixture。",
  ),
  covered(
    "user",
    "promo-modal",
    ["frontend-user/src/shared/components/PromoModal.tsx"],
    "限时会员活动弹窗已有 fixture。",
  ),
  covered(
    "user",
    "help-center",
    ["frontend-user/src/features/help/pages/HelpCenterPage.tsx"],
    "帮助中心与学术问答首页已有 fixture。",
  ),
  covered(
    "user",
    "help-content-detail",
    [
      "frontend-user/src/features/help/pages/QADetailPage.tsx",
      "frontend-user/src/features/help/pages/ResourceDetailPage.tsx",
    ],
    "帮助内容正文、目录和继续阅读已有 fixture。",
  ),
  covered(
    "user",
    "rhino-assistant-entry",
    ["frontend-user/src/shared/components/FloatingRhinoAssistant.tsx"],
    "牛犀犀悬浮角色的指针停留入口已有 fixture。",
  ),
  covered(
    "user",
    "rhino-assistant-dock",
    ["frontend-user/src/shared/components/RhinoDockChip.tsx"],
    "牛犀犀隐藏后出现的顶栏恢复入口已有独立 fixture。",
  ),
  covered(
    "user",
    "rhino-assistant-help-panel",
    [
      "frontend-user/src/shared/components/RhinoPanelStage.tsx",
      "frontend-user/src/shared/components/RhinoHelpBody.tsx",
    ],
    "牛犀犀帮助面板的默认「拖点」标签已有 fixture。",
  ),
  covered(
    "user",
    "rhino-assistant-support-panels",
    ["frontend-user/src/shared/components/RhinoNotificationsBody.tsx"],
    "牛犀犀通知列表已有独立 fixture。",
  ),
  covered(
    "user",
    "rhino-assistant-feedback-panel",
    ["frontend-user/src/shared/components/RhinoFeedbackBody.tsx"],
    "牛犀犀精简反馈表单已有独立 fixture。",
  ),
  covered(
    "user",
    "resource-center",
    ["frontend-user/src/features/help/pages/ResourceCenterPage.tsx"],
    "学术资源与产品博客中心已有 fixture。",
  ),
  covered(
    "user",
    "feedback-form",
    ["frontend-user/src/features/help/pages/FeedbackPage.tsx"],
    "产品反馈类型、正文和附件入口已有 fixture。",
  ),
  covered(
    "user",
    "contact-support",
    [
      "frontend-user/src/features/help/pages/ContactPage.tsx",
      "frontend-user/src/features/help/components/ContactChannels.tsx",
    ],
    "联系渠道和响应时效已有 fixture。",
  ),
  covered(
    "user",
    "auth-dialog",
    [
      "frontend-user/src/features/auth/components/AuthDialog.tsx",
      "frontend-user/src/features/auth/components/LoginForm.tsx",
      "frontend-user/src/features/auth/components/OAuthRow.tsx",
      "frontend-user/src/features/auth/components/GoogleSignInButton.tsx",
    ],
    "桌面登录表单与同屏的动态第三方入口已有 fixture。",
  ),
  covered(
    "user",
    "author-profile",
    ["frontend-user/src/features/browser/components/AuthorDetailPane.tsx"],
    "作者身份、主题与代表论文已有 fixture。",
  ),
  covered(
    "user",
    "citation-dialog",
    ["frontend-user/src/shared/components/CitationDialog.tsx"],
    "多格式引用复制弹窗已有 fixture。",
  ),
  covered(
    "user",
    "citation-generator",
    ["frontend-user/src/features/citation/pages/CitationGeneratorPage.tsx"],
    "DOI 解析、手动录入与引用结果已有 fixture。",
  ),
  covered(
    "user",
    "citation-graph-preview",
    [
      "frontend-user/src/features/search/components/workspace/CitationGraphMock.tsx",
    ],
    "引用网络预览已有 fixture。",
  ),
  covered(
    "user",
    "classic-search-dock",
    ["frontend-user/src/features/search/components/SearchClassicLanding.tsx"],
    "经典检索入口和查询编排已有 fixture。",
  ),
  covered(
    "user",
    "classic-search-filters",
    [
      "frontend-user/src/features/search/components/SearchFiltersPanel.tsx",
      "frontend-user/src/features/search/components/SearchSidebar.tsx",
    ],
    "搜索筛选器与结果控制已有 fixture。",
  ),
  covered(
    "user",
    "claw-context-composer",
    [
      "frontend-user/src/features/claw/components/chat/ChatComposer.tsx",
      "frontend-user/src/shared/components/chat/ComposerAttachmentRow.tsx",
    ],
    "Claw 上下文、附件与技能输入已有 fixture。",
  ),
  covered(
    "user",
    "claw-empty-state",
    [
      "frontend-user/src/features/claw/components/chat/ClawEmptyState.tsx",
      "frontend-user/src/features/claw/components/chat/ClawHero.tsx",
    ],
    "Claw 会话空态与同屏入口已有 fixture；模板卡另记修正项。",
  ),
  covered(
    "user",
    "claw-hero-smart-entry",
    [
      "frontend-user/src/features/search/components/smart-search/SmartSearchHero.tsx",
      "frontend-user/src/features/search/components/smart-search/SmartComposer.tsx",
    ],
    "智能搜索空态与输入入口已有 fixture。",
  ),
  covered(
    "user",
    "claw-run-states",
    [
      "frontend-user/src/features/claw/components/chat/ConversationWorkspace.tsx",
      "frontend-user/src/shared/components/chat/StallNotice.tsx",
      "frontend-user/src/shared/components/chat/StreamingIndicator.tsx",
    ],
    "长任务仍在运行但暂时没有新进展的单一停滞状态已有 fixture。",
  ),
  covered(
    "user",
    "claw-session-history",
    [
      "frontend-user/src/features/claw/components/sidebar/ClawSessionList.tsx",
      "frontend-user/src/features/claw/components/sidebar/ClawSessionDialogs.tsx",
    ],
    "会话历史、重命名和删除入口已有 fixture。",
  ),
  covered(
    "user",
    "claw-workspace",
    [
      "frontend-user/src/features/claw/components/chat/ConversationWorkspace.tsx",
      "frontend-user/src/features/claw/components/chat/MessageTurn.tsx",
    ],
    "Claw 对话工作区与同屏消息轮次已有 fixture。",
  ),
  covered(
    "user",
    "community-skill",
    [
      "frontend-user/src/features/skills/pages/SkillDetailPage.tsx",
      "frontend-user/src/features/skills/components/SkillInstallPanel.tsx",
    ],
    "社区技能详情与安装表面已有 fixture。",
  ),
  covered(
    "user",
    "composer-attachments",
    [
      "frontend-user/src/shared/components/chat/Composer.tsx",
      "frontend-user/src/shared/components/chat/ComposerAttachmentRow.tsx",
    ],
    "通用输入器附件列表和限制已有 fixture。",
  ),
  covered(
    "user",
    "feature-plaza",
    ["frontend-user/src/features/tools/pages/ToolsCatalogPage.tsx"],
    "scholay广场的学术工具目录与分类已按现行页面复核。",
    "2026-08-17",
  ),
  covered(
    "user",
    "folder-icon-picker",
    [
      "frontend-user/src/shared/components/folder-appearance/FolderIconPicker.tsx",
    ],
    "文件夹图标与颜色选择已有 fixture。",
  ),
  covered(
    "user",
    "invite-code-field",
    ["frontend-user/src/features/auth/components/InvitationCodeField.tsx"],
    "注册流程邀请码字段已有 fixture。",
  ),
  covered(
    "user",
    "invite-code-prompt",
    ["frontend-user/src/features/auth/components/InviteCodePromptDialog.tsx"],
    "登录后的邀请码补绑提示已有 fixture。",
  ),
  covered(
    "user",
    "invite-share",
    [
      "frontend-user/src/features/settings/components/InvitePromoPanel.tsx",
      "frontend-user/src/features/settings/pages/MembershipPage.tsx",
    ],
    "邀请奖励、分享方式与记录已有 fixture。",
  ),
  covered(
    "user",
    "journal-detail",
    [
      "frontend-user/src/features/browser/components/JournalDetailPane.tsx",
      "frontend-user/src/features/browser/components/journal-detail/JournalDetailContent.tsx",
    ],
    "期刊指标、投稿决策与资源已有 fixture。",
  ),
  covered(
    "user",
    "journal-directory",
    [
      "frontend-user/src/features/journals/components/JournalExploreOverview.tsx",
      "frontend-user/src/features/journals/pages/JournalCollectionPage.tsx",
    ],
    "期刊目录与集合浏览已有 fixture。",
  ),
  covered(
    "user",
    "journal-search",
    ["frontend-user/src/features/journals/pages/JournalSearchPage.tsx"],
    "期刊库搜索的单列结果、过滤与状态已按现行页面复核。",
    "2026-08-17",
  ),
  covered(
    "user",
    "library-share-receive",
    ["frontend-user/src/features/library/pages/SharedReceivePage.tsx"],
    "公开文献集接收页已有 fixture。",
  ),
  covered(
    "user",
    "literature-library",
    ["frontend-user/src/features/library/pages/LibraryPage.tsx"],
    "我的资源中的文献集、文件夹与论文列表已按现行页面复核。",
    "2026-08-17",
  ),
  covered(
    "user",
    "matrix-workspace",
    ["frontend-user/src/features/search/components/MatrixColumn.tsx"],
    "矩阵分析工作区已有 fixture。",
  ),
  covered(
    "user",
    "membership-plans",
    ["frontend-user/src/features/settings/pages/MembershipPage.tsx"],
    "会员档位与周期选择已有 fixture。",
  ),
  covered(
    "user",
    "notification-inbox",
    [
      "frontend-user/src/shared/components/NotificationBell.tsx",
      "frontend-user/src/shared/components/NotificationInbox.tsx",
    ],
    "站内通知未读、列表和动作已有 fixture。",
  ),
  covered(
    "user",
    "paper-detail",
    [
      "frontend-user/src/features/browser/components/PaperDetailPane.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperDetailContent.tsx",
    ],
    "论文元数据、摘要和主要操作已有 fixture。",
  ),
  covered(
    "user",
    "paper-favorite-flow",
    [
      "frontend-user/src/shared/components/FavoritePaperButton.tsx",
      "frontend-user/src/features/library/components/CollectFolderPicker.tsx",
    ],
    "收藏触发与文件夹选择已有 fixture。",
  ),
  covered(
    "user",
    "pdf-chat-workspace",
    ["frontend-user/src/features/search/components/workspace/PdfChatPanel.tsx"],
    "PDF 对话工作区已有 fixture。",
  ),
  covered(
    "user",
    "pdf-reader",
    [
      "frontend-user/src/shared/components/PdfViewer.tsx",
      "frontend-user/src/shared/components/pdf-viewer/PdfViewerToolbar.tsx",
      "frontend-user/src/shared/components/pdf-viewer/PdfViewerContent.tsx",
    ],
    "PDF 阅读工具栏与页码沿用现行界面，页面画布使用无真实作者、邮箱或 DOI 的脱敏演示稿。",
  ),
  covered(
    "user",
    "pdf-resolve",
    [
      "frontend-user/src/features/library/components/library-import-dialog/PdfUploadInspecting.tsx",
      "frontend-user/src/features/library/components/library-import-dialog/PdfUploadDecide.tsx",
    ],
    "PDF 解析、匹配和处理选择已有 fixture。",
  ),
  covered(
    "user",
    "peer-review-entry",
    ["frontend-user/src/features/peer-review/pages/SubmissionLandingPage.tsx"],
    "智能审稿四入口及会议论文占位状态已按现行 Hub 复核。",
    "2026-08-17",
  ),
  covered(
    "user",
    "peer-review-editorial-check",
    [
      "frontend-user/src/features/peer-review/components/record/EditorialCheckPanel.tsx",
    ],
    "编辑规范检查面板已有 fixture。",
  ),
  covered(
    "user",
    "peer-review-progress",
    [
      "frontend-user/src/features/peer-review/pages/RecordDetailPage.tsx",
      "frontend-user/src/features/peer-review/components/record/StatusGrid.tsx",
    ],
    "评审进度与流式状态已有 fixture。",
  ),
  covered(
    "user",
    "peer-review-report",
    ["frontend-user/src/features/peer-review/pages/RecordDetailPage.tsx"],
    "完整评审报告已有 fixture。",
  ),
  covered(
    "user",
    "peer-review-result-overview",
    [
      "frontend-user/src/features/peer-review/components/record/ChiefVerdictPanel.tsx",
    ],
    "总评、分项状态和建议已有 fixture。",
  ),
  covered(
    "user",
    "peer-review-wizard",
    [
      "frontend-user/src/features/peer-review/pages/JournalWizardPage.tsx",
      "frontend-user/src/features/peer-review/pages/ThesisWizardPage.tsx",
    ],
    "论文与学位稿提交向导已有 fixture。",
  ),
  covered(
    "user",
    "prism-compile-states",
    ["frontend-user/src/features/prism/components/PrismWorkspaceV2.tsx"],
    "Prism 编译失败后的可恢复单一状态已有 fixture。",
  ),
  covered(
    "user",
    "prism-home",
    ["frontend-user/src/features/prism/components/PrismHome.tsx"],
    "Prism 快速写作占位与高级写作入口已按现行 Hub 复核。",
    "2026-08-17",
  ),
  covered(
    "user",
    "prism-workspace",
    ["frontend-user/src/features/prism/components/PrismWorkspaceV2.tsx"],
    "Prism 编辑工作区层级已有 fixture。",
  ),
  covered(
    "user",
    "prism-writing-start",
    ["frontend-user/src/features/prism/components/PrismWritingMenu.tsx"],
    "Prism 写作工具入口已有 fixture。",
  ),
  covered(
    "user",
    "profile-settings",
    ["frontend-user/src/features/settings/pages/ProfilePage.tsx"],
    "桌面个人资料字段已有 fixture；移动页另行登记。",
  ),
  covered(
    "user",
    "quota-recovery",
    ["frontend-user/src/shared/components/chat/QuotaComposerStrip.tsx"],
    "Pro 额度耗尽且有恢复券、有经费的单一合法 Composer 状态已复核。",
    "2026-08-17",
  ),
  covered(
    "user",
    "redeem-preview",
    [
      "frontend-user/src/features/settings/components/redeem-confirm-dialog.tsx",
    ],
    "兑换码预览和核销确认已有 fixture。",
  ),
  covered(
    "user",
    "review-and-stage",
    [
      "frontend-user/src/features/search/components/SearchRightPanel.tsx",
      "frontend-user/src/features/search/components/StageFlyLayer.tsx",
    ],
    "检索结果复核和暂存动作已有 fixture。",
  ),
  covered(
    "user",
    "search-autocomplete",
    ["frontend-user/src/shared/components/SearchAutocomplete.tsx"],
    "搜索自动完成基础输入态已有 fixture。",
  ),
  covered(
    "user",
    "share-sheet",
    ["frontend-user/src/shared/components/share/ShareSheet.tsx"],
    "链接、海报、二维码和口令分享已有 fixture。",
  ),
  covered(
    "user",
    "smart-paper-group",
    [
      "frontend-user/src/features/search/components/smart-search/PaperListScroller.tsx",
    ],
    "智能检索论文分组已有 fixture。",
  ),
  covered(
    "user",
    "smart-search-dock",
    [
      "frontend-user/src/features/search/components/smart-search/SmartSearchHero.tsx",
      "frontend-user/src/features/search/components/smart-search/SmartComposer.tsx",
    ],
    "智能搜论文首页和输入 Dock 已按现行界面复核。",
    "2026-08-17",
  ),
  covered(
    "user",
    "smart-search-session",
    [
      "frontend-user/src/features/search/components/smart-search/SmartSearchPanel.tsx",
    ],
    "智能搜论文回答、论文组与多会话 Dock 已按现行界面复核。",
    "2026-08-17",
  ),
  covered(
    "user",
    "staging-units",
    [
      "frontend-user/src/features/search/components/StagingTabs.tsx",
      "frontend-user/src/shared/components/PaperResultCard/StagedRow.tsx",
    ],
    "暂存区单位、标签和论文行已有 fixture。",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

const USER_GAP_SURFACES = [
  fixture(
    "user",
    "wechat-qr-binding",
    ["frontend-user/src/features/auth/components/WeChatQRDialog.tsx"],
    "账户连接页中的微信绑定等待扫码态是独立弹窗，本轮补齐。",
  ),
  fixture(
    "user",
    "auth-password-recovery-email",
    ["frontend-user/src/features/auth/components/ForgotPasswordForm.tsx"],
    "邮箱找回密码的初始表单是稳定认证表面，本轮补齐单一状态。",
  ),
  fixture(
    "user",
    "prism-live-preview",
    ["frontend-user/src/features/prism/components/PrismLivePreview.tsx"],
    "AI 写入后的整篇只读预览是稳定写作表面，本轮补齐。",
  ),
  fixture(
    "user",
    "prism-writing-profile-dialog",
    [
      "frontend-user/src/features/prism/components/PrismWritingProfileDialog.tsx",
    ],
    "写作画像是独立稳定弹窗，本轮冻结一个学科写作状态。",
  ),
  fixture(
    "user",
    "prism-revision-dialog",
    ["frontend-user/src/features/prism/components/PrismRevisionDialog.tsx"],
    "逐条回应修改意见是独立稳定弹窗，本轮补齐。",
  ),
  fixture(
    "user",
    "prism-translate-dialog",
    ["frontend-user/src/features/prism/components/PrismTranslateDialog.tsx"],
    "整篇翻译与翻译纪律是独立稳定弹窗，本轮补齐。",
  ),
  fixture(
    "user",
    "prism-numbers-dialog",
    ["frontend-user/src/features/prism/components/PrismNumbersDialog.tsx"],
    "正文数字校验结果是独立稳定弹窗，本轮补齐。",
  ),
  fixture(
    "user",
    "prism-math-editor-dialog",
    ["frontend-user/src/features/prism/components/MathEditorDialog.tsx"],
    "公式插入编辑器是独立稳定弹窗，本轮补齐。",
  ),
  fixture(
    "user",
    "home-research-entry",
    ["frontend-user/src/features/home/components/HomeAgentHero.tsx"],
    "首页研究入口是稳定可见表面，本轮补齐。",
  ),
  fixture(
    "user",
    "search-suggestions-dropdown",
    [
      "frontend-user/src/shared/components/SearchAutocomplete.tsx",
      "frontend-user/src/shared/components/search-autocomplete/AutocompleteSections.tsx",
    ],
    "建议下拉的分组、到达顺序与键盘提示是独立稳定表面，本轮补齐。",
  ),
  fixture(
    "user",
    "browser-tabs-quick-open",
    [
      "frontend-user/src/features/browser/components/BrowserTabsBar.tsx",
      "frontend-user/src/features/browser/components/QuickOpenPaperDialog.tsx",
    ],
    "浏览标签与快速打开弹窗构成同一导航表面，本轮补齐。",
  ),
  fixture(
    "user",
    "paper-references-citation",
    [
      "frontend-user/src/features/browser/components/paper-detail/PaperReferences.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperFooter.tsx",
    ],
    "论文参考文献与页尾引用动作是稳定详情表面，本轮补齐。",
  ),
  fixture(
    "user",
    "author-collaboration-trends",
    ["frontend-user/src/features/browser/components/AuthorDetailPane.tsx"],
    "作者合作关系与年度趋势是稳定派生表面，本轮补齐。",
  ),
  fixture(
    "user",
    "matrix-dimension-settings",
    [
      "frontend-user/src/features/search/components/dimension-settings/DimensionSettingsDialog.tsx",
    ],
    "矩阵维度增删改设置是稳定弹窗，本轮补齐。",
  ),
  fixture(
    "user",
    "library-import-workbench",
    [
      "frontend-user/src/features/library/components/PaperWorkbenchDialog.tsx",
      "frontend-user/src/features/library/components/library-import-dialog/OnlineSearchTab.tsx",
    ],
    "文献导入工作台与在线检索结果是稳定流程表面，本轮补齐。",
  ),
  fixture(
    "user",
    "library-bulk-actions",
    ["frontend-user/src/features/library/components/LibraryBulkToolbar.tsx"],
    "文献库批量选择与操作条是稳定表面，本轮补齐。",
  ),
  fixture(
    "user",
    "library-maintenance-workbench",
    [
      "frontend-user/src/features/library/components/manage/MetadataPanel.tsx",
      "frontend-user/src/features/library/components/manage/PdfPanel.tsx",
    ],
    "元数据与 PDF 维护工作台是稳定管理表面，本轮补齐。",
  ),
  fixture(
    "user",
    "library-relink-workbench",
    ["frontend-user/src/features/library/components/manage/RelinkPanel.tsx"],
    "论文重新关联的候选和确认状态是稳定表面，本轮补齐。",
  ),
  fixture(
    "user",
    "share-receive-variants",
    ["frontend-user/src/features/library/pages/SharedReceivePage.tsx"],
    "分享接收的正常、无效和权限变体是稳定公开表面，本轮补齐。",
  ),
  fixture(
    "user",
    "claw-artifact-output",
    [
      "frontend-user/src/features/claw/components/chat/TurnArtifacts.tsx",
      "frontend-user/src/features/claw/components/chat/TurnFigures.tsx",
      "frontend-user/src/features/claw/components/preview/ClawArtifactPanel.tsx",
      "frontend-user/src/features/claw/components/preview/ClawArtifactPreview.tsx",
    ],
    "Claw 文件、图表和制品预览是稳定输出表面，本轮补齐。",
  ),
  fixture(
    "user",
    "peer-review-records-list",
    ["frontend-user/src/features/peer-review/pages/RecordsPage.tsx"],
    "同行评审记录列表是稳定页面，本轮补齐。",
  ),
  fixture(
    "user",
    "peer-review-submit-success",
    ["frontend-user/src/features/peer-review/pages/SubmitSuccessPage.tsx"],
    "同行评审提交成功回执是稳定终态，本轮补齐。",
  ),
  fixture(
    "user",
    "prism-writing-tools-dialogs",
    ["frontend-user/src/features/prism/components/PrismQualityDialog.tsx"],
    "质量检查是稳定写作工具，本轮冻结单一弹窗。",
  ),
  fixture(
    "user",
    "prism-document-insert-dialogs",
    ["frontend-user/src/features/prism/components/PrismCitationDialog.tsx"],
    "从个人文献集插入引用是稳定弹窗，本轮冻结单一状态。",
  ),
  fixture(
    "user",
    "prism-history-inline-edit",
    ["frontend-user/src/features/prism/components/PrismVersionsDialog.tsx"],
    "版本历史是稳定编辑表面，本轮冻结单一弹窗。",
  ),
  fixture(
    "user",
    "feature-tool-detail",
    ["frontend-user/src/features/tools/pages/ToolDetailPage.tsx"],
    "功能工具详情、权限和启动方式是稳定页面，本轮补齐。",
  ),
  fixture(
    "user",
    "community-skill-publish",
    ["frontend-user/src/features/skills/pages/SkillCreatePage.tsx"],
    "社区技能发布表单是稳定页面，本轮补齐。",
  ),
  fixture(
    "user",
    "community-skill-management",
    [
      "frontend-user/src/features/skills/pages/MySkillsPage.tsx",
      "frontend-user/src/features/skills/components/SkillEditDialog.tsx",
    ],
    "我的技能与编辑弹窗是稳定管理表面，本轮补齐。",
  ),
  fixture(
    "user",
    "auth-register-recovery",
    ["frontend-user/src/features/auth/components/RegisterForm.tsx"],
    "注册表单是稳定认证表面，本轮冻结邮箱注册单态。",
  ),
  fixture(
    "user",
    "billing-overview-usage",
    [
      "frontend-user/src/features/settings/pages/MembershipPage.tsx",
      "frontend-user/src/features/settings/components/billing-panels.tsx",
    ],
    "会员概览、用量和账单状态是稳定账户表面，本轮补齐。",
  ),
  fixture(
    "user",
    "user-account-menu",
    ["frontend-user/src/shared/components/UserMenuContent.tsx"],
    "用户头像菜单与账户快捷入口是稳定全局表面，本轮补齐。",
  ),
  fixture(
    "user",
    "common-navigation-tabs",
    [
      "frontend-user/src/app/layouts/TopNav.tsx",
      "frontend-user/src/features/browser/components/BrowserTabsBar.tsx",
    ],
    "窄屏六功能导航出口与详情浏览页签已按现行界面复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "common-reference-card",
    [
      "frontend-user/src/shared/components/PaperResultCard/DefaultCard.tsx",
      "frontend-user/src/shared/components/PaperResultCard/MetaLine.tsx",
    ],
    "论文基础信息卡片的字段、评价标签与点击结果跨检索场景复用，本轮补齐说明 fixture。",
  ),
  fixture(
    "user",
    "common-workspaces",
    [
      "frontend-user/src/features/claw/components/preview/ClawArtifactPanel.tsx",
      "frontend-user/src/features/claw/components/preview/SpreadsheetPreview.tsx",
      "frontend-user/src/features/prism/components/sidebar/PrismFileSidebar.tsx",
    ],
    "扩展区、文件内部标签与 Prism 文件树是稳定工作面，本轮按 current production 补齐对照 fixture。",
  ),
  fixture(
    "user",
    "search-workspace",
    [
      "frontend-user/src/features/search/pages/SearchPage.tsx",
      "frontend-user/src/features/search/components/SearchRightPanel.tsx",
      "frontend-user/src/features/search/components/workspace/FunctionTabGroup.tsx",
      "frontend-user/src/stores/search-right-panel.store.ts",
    ],
    "学术搜索整页与右栏 PDF Chat、文献图谱、矩阵分析互斥工作区已按 mock2 复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "common-agent-status",
    [
      "frontend-user/src/shared/components/chat/ToolCallBlock.tsx",
      "frontend-user/src/shared/components/chat/ThinkingFold.tsx",
      "frontend-user/src/features/settings/components/account-assets-card.tsx",
      "frontend-user/src/shared/components/peer-review-record/StatusGrid.tsx",
    ],
    "工具调用、思考、剩余额度与任务进度需要按不同分母解释，本轮补齐通用状态 fixture。",
  ),
  visibleGroup(
    "user",
    "claw-empty-state-correction",
    ["frontend-user/src/features/claw/components/chat/TemplateCards.tsx"],
    "fixture",
    ["claw-empty-state"],
    "修正已有 fixture：以当前源码的五张真实模板卡为准，不再沿用旧 mock 数量。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "site-navigation-tree",
    [
      "frontend-user/src/app/menus.ts",
      "frontend-user/src/app/layouts/AppSidebar.tsx",
    ],
    "顶栏六功能、侧栏二级功能树与历史区已按 mock2 现行导航复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "my-resources-sections",
    [
      "frontend-user/src/features/library/resource-model.ts",
      "frontend-user/src/features/library/pages/LibraryPage.tsx",
    ],
    "我的资源四分入口与 section 路由语义已按 mock2 现行资源页复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "manuscript-collection",
    [
      "frontend-user/src/features/library/resource-model.ts",
      "frontend-user/src/features/library/components/ManuscriptCollectionView.tsx",
      "frontend-user/src/features/library/components/ManuscriptContentPane.tsx",
    ],
    "稿件集阶段、来源、详情和内容区已按 mock2 现行稿件表面复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "scholay-plaza-hub",
    [
      "frontend-user/src/features/tools/pages/ToolsHubPage.tsx",
      "frontend-user/src/features/tools/pages/ToolsCatalogPage.tsx",
      "frontend-user/src/features/tools/pages/ToolsDatasetsPage.tsx",
      "frontend-user/src/features/tools/pages/ToolsPromptsPage.tsx",
    ],
    "scholay广场 Hub、工具、数据集和学术 prompts 入口已按 mock2 复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "invite-nav-hub",
    [
      "frontend-user/src/app/layouts/topnav/ClaimInviteNavButton.tsx",
      "frontend-user/src/features/auth/components/ClaimInviteDialog.tsx",
    ],
    "顶栏邀请码填写、推广和获取三态及轮播已按 mock2 现行交互复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "funds-reminder",
    [
      "frontend-user/src/shared/components/funds-reminder/FundsReminder.tsx",
      "frontend-user/src/stores/funds-reminder.store.ts",
    ],
    "经费不足 Dock、Dialog 与恢复出口已按 mock2 现行交互复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "oauth-confirm",
    [
      "frontend-user/src/features/auth/components/OAuthConfirmPanel.tsx",
      "frontend-user/src/features/auth/components/OAuthRow.tsx",
    ],
    "第三方登录前往授权确认层和邀请码合填入口已按 mock2 复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "theme-and-rhino-loading",
    [
      "frontend-user/src/app/layouts/topnav/ThemeToggle.tsx",
      "frontend-user/src/shared/components/GlobalLoadingOverlay.tsx",
      "frontend-user/src/shared/components/RhinoRunLoader.tsx",
      "frontend-user/src/stores/theme.store.ts",
      "frontend-user/src/stores/page-loading.store.ts",
    ],
    "站级主题切换、彩色犀牛与全局唯一加载蒙层已按 mock2 复核。",
    "2026-08-17",
  ),
  fixture(
    "user",
    "journal-comments",
    ["frontend-user/src/features/journals/components/JournalCommentsPanel.tsx"],
    "期刊评论面板按纯前端产品演示表面复核，不据此宣称后端已交付。",
    "2026-08-17",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

const USER_EXCLUDED_SURFACES = [
  excluded(
    "user",
    "claw-unused-connection-badge",
    ["frontend-user/src/features/claw/components/chat/ConnectionBadge.tsx"],
    "该连接徽章在 mock 中没有调用点，不构成可到达的独立产品表面。",
  ),
  excluded(
    "user",
    "prism-unused-authors-dialog",
    ["frontend-user/src/features/prism/components/PrismAuthorsDialog.tsx"],
    "作者弹窗在 mock 中没有渲染入口，不把未接线代码登记为可见界面。",
  ),
  excluded(
    "user",
    "prism-retired-legacy-editing-controls",
    [
      "frontend-user/src/features/prism/components/LatexDiffEditor.tsx",
      "frontend-user/src/features/prism/components/PrismSelectionToolbar.tsx",
      "frontend-user/src/features/prism/components/PrismInlineEditPrompt.tsx",
    ],
    "这些控件只属于 legacy 工作台编辑链；现行 legacy 项目恒为只读，因此用户不可到达。",
  ),
  excluded(
    "user",
    "user-shared-display-primitives",
    [
      "frontend-user/src/shared/components/IconButton.tsx",
      "frontend-user/src/shared/components/EmptyState.tsx",
      "frontend-user/src/shared/components/LoadingState.tsx",
      "frontend-user/src/shared/components/PaginationPrevNext.tsx",
    ],
    "按钮、空态、加载态和分页是内部原子；只在所属页面 fixture 内验收，不单独迁移。",
  ),
  excluded(
    "user",
    "global-confirm-dialog-host",
    [
      "frontend-user/src/app/providers.tsx",
      "frontend-user/src/shared/components/ConfirmDialog.tsx",
    ],
    "命令式确认宿主由调用方动态提供文案与动作；具体稳定确认态已并入对应业务 fixture。",
  ),
  excluded(
    "user",
    "global-toast-host",
    ["frontend-user/src/app/providers.tsx"],
    "通用 toast 宿主只是动态消息传输层，没有独立产品状态；额度状态 toast 另有专门 fixture。",
  ),
  excluded(
    "user",
    "global-collect-folder-picker-gate",
    [
      "frontend-user/src/app/providers.tsx",
      "frontend-user/src/features/library/components/CollectFolderPicker.tsx",
    ],
    "懒加载 Gate 是内部挂载协调器；可见文件夹选择器已由 paper-favorite-flow 覆盖。",
  ),
  excluded(
    "user",
    "global-body-pointer-lock-guard",
    [
      "frontend-user/src/app/providers.tsx",
      "frontend-user/src/shared/components/BodyPointerLockGuard.tsx",
    ],
    "该组件只修复 body 指针锁残留且不渲染可见界面，不应创建 Wiki fixture。",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

/** 普通用户域：75 个既有覆盖 + 47 个本轮补齐或修正的 fixture，另有 8 个明确排除组。 */
export const USER_MOCK_SURFACE_COVERAGE = [
  ...USER_EXISTING_SURFACES,
  ...USER_GAP_SURFACES,
  ...USER_EXCLUDED_SURFACES,
] as const satisfies readonly MockSurfaceCoverageEntry[];

const MOBILE_EXISTING_SURFACES = [
  visibleGroup(
    "mobile",
    "mobile-shell-bottom-navigation",
    [
      "frontend-user/src/features/mobile/layouts/MobileShell.tsx",
      "frontend-user/src/features/mobile/components/MobileBottomNav.tsx",
    ],
    "covered",
    ["mobile-feed", "mobile-me", "mobile-tools", "mobile-claw"],
    "移动壳和四个一级 Tab 的层级已由现有移动 fixture 合并覆盖。",
  ),
  visibleGroup(
    "mobile",
    "mobile-paper-feed",
    [
      "frontend-user/src/features/mobile/pages/FeedPage.tsx",
      "frontend-user/src/features/mobile/components/PaperFeedCard.tsx",
    ],
    "covered",
    ["mobile-feed"],
    "论文纵向流、顶栏和卡片操作已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-journal-stream",
    [
      "frontend-user/src/features/mobile/pages/JournalFeedPage.tsx",
      "frontend-user/src/features/mobile/components/JournalFeedCard.tsx",
    ],
    "covered",
    ["mobile-journal-feed"],
    "期刊纵向流和指标卡片已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-news-stream",
    [
      "frontend-user/src/features/mobile/pages/NewsPage.tsx",
      "frontend-user/src/features/mobile/components/NewsCard.tsx",
    ],
    "covered",
    ["mobile-academic-intel"],
    "移动学术情报流和卡片操作已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-search-overlay-shell",
    ["frontend-user/src/features/mobile/components/MobileSearchOverlay.tsx"],
    "covered",
    ["mobile-search"],
    "悬浮搜索的输入、最近记录和空态已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-auth-page",
    ["frontend-user/src/features/auth/pages/mobile/MobileAuthPage.tsx"],
    "fixture",
    ["mobile-auth-page"],
    "独立移动认证页使用专属全页 fixture，不再由底部 Sheet 代替。",
  ),
  visibleGroup(
    "mobile",
    "mobile-auth-bottom-sheet",
    ["frontend-user/src/features/auth/components/MobileAuthSheet.tsx"],
    "covered",
    ["mobile-auth-surfaces"],
    "从未登录「我的」页就地打开的登录底部 Sheet 已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-claw-new-session",
    ["frontend-user/src/features/claw/pages/mobile/MobileClawPage.tsx"],
    "covered",
    ["mobile-claw"],
    "移动 Claw 新会话与模板入口已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-tools-home",
    ["frontend-user/src/features/tools/pages/mobile/MobileToolsHomePage.tsx"],
    "covered",
    ["mobile-tools"],
    "移动工具首页和一级入口已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-library-list",
    ["frontend-user/src/features/library/pages/mobile/MobileLibraryPage.tsx"],
    "covered",
    ["mobile-library-flow"],
    "移动文献库根列表已由文献库流程 fixture 覆盖。",
  ),
  visibleGroup(
    "mobile",
    "mobile-library-folder",
    ["frontend-user/src/features/library/pages/mobile/MobileFolderPage.tsx"],
    "fixture",
    ["mobile-library-folder"],
    "移动文件夹详情的论文列表和整本分享已有独立 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-me-authenticated",
    [
      "frontend-user/src/features/settings/pages/mobile/MobileMePage.tsx",
      "frontend-user/src/features/settings/components/mobile/MobileAssetsCard.tsx",
    ],
    "covered",
    ["mobile-me"],
    "已登录的个人中心和资产卡已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-membership-dialog",
    [
      "frontend-user/src/features/settings/components/mobile/MobileMembershipDialog.tsx",
    ],
    "covered",
    ["mobile-membership-purchase"],
    "移动会员购买、周期筛选和动态报价已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-profile-settings",
    ["frontend-user/src/features/settings/pages/mobile/MobileProfilePage.tsx"],
    "fixture",
    ["mobile-profile-settings"],
    "移动个人资料编辑与只读账户信息已有独立 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-security-settings",
    ["frontend-user/src/features/settings/pages/mobile/MobileSecurityPage.tsx"],
    "fixture",
    ["mobile-security-settings"],
    "移动绑定状态与修改密码表面已有独立 fixture。",
  ),
  visibleGroup(
    "mobile",
    "mobile-connection-settings",
    [
      "frontend-user/src/features/settings/pages/mobile/MobileConnectionsPage.tsx",
    ],
    "fixture",
    ["mobile-connection-settings"],
    "移动第三方连接只读列表已有独立 fixture。",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

const MOBILE_GAP_SURFACES = [
  fixture(
    "mobile",
    "mobile-search-paper-results",
    [
      "frontend-user/src/features/mobile/components/MobileSearchOverlay.tsx",
      "frontend-user/src/shared/components/MobilePaperRow.tsx",
    ],
    "移动搜索的论文结果和到达顺序是稳定表面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-search-filter-sheet",
    [
      "frontend-user/src/features/mobile/components/MobileSearchFilterSheet.tsx",
    ],
    "移动搜索筛选底部弹层是稳定表面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-feed-states",
    ["frontend-user/src/features/mobile/components/VerticalSwipeFeed.tsx"],
    "纵向流的加载、错误、结束和刷新反馈是稳定状态组，本轮补齐。",
  ),
  excluded(
    "mobile",
    "mobile-claw-session-drawer",
    ["frontend-user/src/features/claw/components/chat/MobileClawDrawer.tsx"],
    "词条只保留桌面会话历史；移动抽屉不再单独出图。",
  ),
  fixture(
    "mobile",
    "mobile-claw-artifact-preview",
    [
      "frontend-user/src/features/claw/components/preview/ClawArtifactPanel.tsx",
      "frontend-user/src/features/claw/components/preview/ClawArtifactPreview.tsx",
    ],
    "移动 Claw 制品预览和文件切换是稳定表面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-tools-catalog",
    ["frontend-user/src/features/tools/pages/mobile/MobileToolsPage.tsx"],
    "移动工具目录、搜索和分区列表是稳定页面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-tools-filter-sheet",
    [
      "frontend-user/src/features/tools/components/mobile/MobileToolsFilterSheet.tsx",
    ],
    "移动工具筛选底部弹层是稳定表面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-tool-detail",
    ["frontend-user/src/features/tools/pages/mobile/MobileToolDetailPage.tsx"],
    "移动工具详情与启动入口是稳定页面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-pc-only-guide",
    ["frontend-user/src/features/tools/pages/mobile/MobilePcOnlyPage.tsx"],
    "仅桌面可用工具的移动说明页是稳定替代表面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-me-logged-out",
    ["frontend-user/src/features/settings/pages/mobile/MobileMePage.tsx"],
    "未登录个人中心与认证入口是稳定状态，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-billing-ledger",
    ["frontend-user/src/features/settings/pages/mobile/MobileBillingPage.tsx"],
    "移动账单、订单和余额流水是稳定页面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-subpage-auth-guard",
    [
      "frontend-user/src/features/settings/components/mobile/MeSubpageShell.tsx",
    ],
    "个人中心子页的未登录闸门是稳定替代状态，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-detail-header",
    [
      "frontend-user/src/features/browser/components/mobile/MobileDetailHeader.tsx",
    ],
    "论文、作者和期刊详情共用的移动顶栏是稳定跨端表面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mobile-claw-active-session",
    ["frontend-user/src/features/claw/pages/mobile/MobileClawPage.tsx"],
    "移动 Claw 活跃会话与运行中工具状态是稳定表面，本轮补齐。",
  ),
  fixture(
    "mobile",
    "mp-diagram-viewer",
    ["frontend-user/src/features/claw/pages/mobile/MpDiagramPage.tsx"],
    "独立 /mp 小程序图表查看器是稳定公开页面，本轮补齐。",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

const GLOBAL_CROSS_SURFACES = [
  visibleGroup(
    "mobile",
    "global-rhino-assistant-entry",
    ["frontend-user/src/shared/components/FloatingRhinoAssistant.tsx"],
    "covered",
    ["rhino-assistant-entry"],
    "全局牛犀犀悬浮入口已由普通用户 fixture 覆盖。",
  ),
  visibleGroup(
    "mobile",
    "global-rhino-assistant-dock",
    ["frontend-user/src/shared/components/RhinoDockChip.tsx"],
    "covered",
    ["rhino-assistant-dock"],
    "全局牛犀犀顶栏恢复入口已由普通用户 fixture 覆盖。",
  ),
  visibleGroup(
    "mobile",
    "global-rhino-assistant-help",
    [
      "frontend-user/src/shared/components/RhinoPanelStage.tsx",
      "frontend-user/src/shared/components/RhinoHelpBody.tsx",
    ],
    "covered",
    ["rhino-assistant-help-panel"],
    "全局牛犀犀帮助面板已由普通用户 fixture 覆盖。",
  ),
  visibleGroup(
    "mobile",
    "global-rhino-assistant-support",
    ["frontend-user/src/shared/components/RhinoNotificationsBody.tsx"],
    "covered",
    ["rhino-assistant-support-panels"],
    "全局牛犀犀通知列表已由普通用户 fixture 覆盖。",
  ),
  visibleGroup(
    "mobile",
    "global-rhino-assistant-feedback",
    ["frontend-user/src/shared/components/RhinoFeedbackBody.tsx"],
    "covered",
    ["rhino-assistant-feedback-panel"],
    "全局牛犀犀精简反馈表单已由普通用户 fixture 覆盖。",
  ),
  visibleGroup(
    "mobile",
    "global-auth-dialog",
    [
      "frontend-user/src/app/layouts/AppShell.tsx",
      "frontend-user/src/features/auth/components/AuthDialog.tsx",
    ],
    "covered",
    ["auth-dialog"],
    "桌面壳的全局认证弹窗已由认证 fixture 覆盖。",
  ),
  visibleGroup(
    "mobile",
    "global-invite-code-prompt",
    [
      "frontend-user/src/app/App.tsx",
      "frontend-user/src/features/auth/components/InviteCodePromptDialog.tsx",
    ],
    "covered",
    ["invite-code-prompt"],
    "登录后的全局邀请码补绑提示已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "global-invite-share",
    [
      "frontend-user/src/features/settings/components/InvitePromoPanel.tsx",
      "frontend-user/src/features/settings/pages/MembershipPage.tsx",
    ],
    "covered",
    ["invite-share"],
    "邀请分享在桌面与移动两端的稳定状态已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "global-share-sheet",
    [
      "frontend-user/src/features/mobile/layouts/MobileShell.tsx",
      "frontend-user/src/shared/components/share/ShareSheet.tsx",
    ],
    "covered",
    ["share-sheet"],
    "论文、期刊和文献集共用的全局分享面板已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "global-notification-inbox",
    [
      "frontend-user/src/shared/components/NotificationBell.tsx",
      "frontend-user/src/shared/components/NotificationInbox.tsx",
    ],
    "covered",
    ["notification-inbox"],
    "全局通知入口、未读和收件箱已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "global-promo-modal",
    [
      "frontend-user/src/app/providers.tsx",
      "frontend-user/src/shared/components/PromoModal.tsx",
    ],
    "covered",
    ["promo-modal"],
    "全局活动触发与推广弹窗已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "global-quota-recovery",
    ["frontend-user/src/shared/components/QuotaNotifier.tsx"],
    "covered",
    ["quota-recovery"],
    "额度耗尽后的全局阻断和恢复动作已有 fixture。",
  ),
  visibleGroup(
    "mobile",
    "global-quota-status-toasts",
    [
      "frontend-user/src/shared/components/QuotaNotifier.tsx",
      "frontend-user/src/shared/components/quota-toast.tsx",
    ],
    "fixture",
    ["quota-status-toasts"],
    "用量过半、将尽和恢复的稳定全局 toast 组在本轮补齐。",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

const MOBILE_EXCLUDED_SURFACES = [
  excluded(
    "mobile",
    "mobile-feed-prefetcher",
    ["frontend-user/src/features/mobile/components/FeedPrefetcher.tsx"],
    "仅负责全局预取和缓存水合，不产生可见 DOM，属于动态数据协调器。",
  ),
  excluded(
    "mobile",
    "mobile-search-legacy-redirect",
    ["frontend-user/src/features/mobile/routes.tsx"],
    "旧 /m/search 只重定向到 /m/feed，不存在可迁移页面。",
  ),
  excluded(
    "mobile",
    "mobile-feed-internal-atoms",
    [
      "frontend-user/src/features/mobile/components/FeedTopTabs.tsx",
      "frontend-user/src/features/mobile/components/MobileJournalResultCard.tsx",
      "frontend-user/src/shared/components/MobilePaperRowSkeleton.tsx",
    ],
    "标签、结果行和骨架是内部原子，已随移动 feed/search 父级 fixture 验收，不单独迁移。",
  ),
  excluded(
    "mobile",
    "mobile-shell-transition-coordinator",
    ["frontend-user/src/features/mobile/layouts/MobileShell.tsx"],
    "路由淡入与手势编排没有独立静态状态；壳和底栏的可见层级已由父级 fixture 覆盖。",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

/** 移动/跨端域：23 个既有覆盖 + 21 个本轮补齐或修正的 fixture，另有 4 个明确排除组。 */
export const MOBILE_MOCK_SURFACE_COVERAGE = [
  ...MOBILE_EXISTING_SURFACES,
  ...MOBILE_GAP_SURFACES,
  ...GLOBAL_CROSS_SURFACES,
  ...MOBILE_EXCLUDED_SURFACES,
] as const satisfies readonly MockSurfaceCoverageEntry[];

const ADMIN_EXISTING_SURFACES = [
  covered(
    "admin",
    "admin-console",
    ["frontend-user/src/features/admin/layouts/AdminShell.tsx"],
    "后台整体导航壳和页面层级已有 fixture。",
  ),
  covered(
    "admin",
    "admin-access-control",
    [
      "frontend-user/src/features/admin/permissions.ts",
      "frontend-user/src/features/admin/nav.ts",
    ],
    "后台角色、权限点和菜单可见性已有 fixture。",
  ),
  covered(
    "admin",
    "admin-dashboard",
    ["frontend-user/src/features/admin/pages/DashboardPage.tsx"],
    "后台总览指标和检查项已有 fixture。",
  ),
  covered(
    "admin",
    "admin-user-directory",
    ["frontend-user/src/features/admin/pages/UsersPage.tsx"],
    "用户目录、搜索和过滤已有 fixture。",
  ),
  covered(
    "admin",
    "admin-user-lifecycle",
    ["frontend-user/src/features/admin/pages/UsersPage.tsx"],
    "冻结、删除和角色变更已有 fixture。",
  ),
  covered(
    "admin",
    "admin-entitlement-grants",
    ["frontend-user/src/features/admin/components/UserGrantPanel.tsx"],
    "会员、积分与重置次数发放已有 fixture。",
  ),
  covered(
    "admin",
    "admin-gift-codes",
    ["frontend-user/src/features/admin/pages/VipCodesPage.tsx"],
    "兑换码管理页面已有 fixture。",
  ),
  covered(
    "admin",
    "admin-orders",
    ["frontend-user/src/features/admin/pages/OrdersPage.tsx"],
    "订单目录与营收摘要已有 fixture。",
  ),
  covered(
    "admin",
    "admin-announcements",
    ["frontend-user/src/features/admin/pages/AnnouncementsPage.tsx"],
    "公告列表和发布状态已有 fixture。",
  ),
  covered(
    "admin",
    "admin-hot-content",
    ["frontend-user/src/features/admin/pages/HotContentPage.tsx"],
    "热门内容信号和榜单已有 fixture。",
  ),
  covered(
    "admin",
    "admin-journal-sync",
    ["frontend-user/src/features/admin/routes.tsx"],
    "product-mock 仅保留后台路由边界；当前源码的期刊摄取和发布状态已有 fixture。",
  ),
  covered(
    "admin",
    "admin-tool-operations",
    [
      "frontend-user/src/features/admin/pages/FeatureToolsPage.tsx",
      "frontend-user/src/features/admin/pages/FeatureToolJobsPage.tsx",
    ],
    "功能工具目录与任务运营总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-skill-moderation",
    ["frontend-user/src/features/admin/pages/SkillReviewPage.tsx"],
    "社区技能审核队列已有 fixture。",
  ),
  covered(
    "admin",
    "admin-messaging",
    ["frontend-user/src/features/admin/pages/MessagesPage.tsx"],
    "站内消息列表和发送概览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-campaigns-promo",
    ["frontend-user/src/features/admin/pages/PromoConfigPage.tsx"],
    "邀请活动与限时推广配置总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-feedback",
    ["frontend-user/src/features/admin/pages/FeedbackPage.tsx"],
    "反馈队列和处理状态已有 fixture。",
  ),
  covered(
    "admin",
    "admin-mail-support",
    ["frontend-user/src/features/admin/pages/MailCenterPage.tsx"],
    "邮件中心主从列表已有 fixture。",
  ),
  covered(
    "admin",
    "admin-session-monitoring",
    [
      "frontend-user/src/features/admin/pages/SessionMonitorPage.tsx",
      "frontend-user/src/features/admin/components/ChatSessionMonitor.tsx",
    ],
    "用户会话监控总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-invite-analytics",
    ["frontend-user/src/features/admin/routes.tsx"],
    "product-mock 未拆出邀请监控页；当前源码的邀请指标和快照已有 fixture。",
  ),
  covered(
    "admin",
    "admin-delivery-logs",
    ["frontend-user/src/features/admin/pages/EmailLogsPage.tsx"],
    "邮件发送记录已有 fixture。",
  ),
  covered(
    "admin",
    "admin-support-config",
    ["frontend-user/src/features/admin/pages/SupportCenterConfigPage.tsx"],
    "客服渠道配置总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-site-analytics",
    ["frontend-user/src/features/admin/pages/AnalyticsPage.tsx"],
    "站点分析 KPI 与基础图表已有 fixture。",
  ),
  covered(
    "admin",
    "admin-feature-usage",
    ["frontend-user/src/features/admin/pages/UsageStatsPage.tsx"],
    "功能使用统计总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-token-cost",
    ["frontend-user/src/features/admin/pages/TokenUsageStatsPage.tsx"],
    "算力用量和成本总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-billing-configuration",
    ["frontend-user/src/features/admin/pages/BillingConfigPage.tsx"],
    "计费开关和价格配置已有 fixture。",
  ),
  covered(
    "admin",
    "admin-analytics-setup",
    ["frontend-user/src/features/admin/pages/AnalyticsPage.tsx"],
    "分析服务未配置空态已有 fixture。",
  ),
  covered(
    "admin",
    "admin-model-catalog",
    ["frontend-user/src/features/admin/pages/AiUpstreamPage.tsx"],
    "模型目录与 Provider 总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-third-party-accounts",
    [
      "frontend-user/src/features/admin/pages/AiUpstreamPage.tsx",
      "frontend-user/src/features/admin/pages/ThirdPartyPage.tsx",
    ],
    "第三方账号池总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-model-bindings",
    ["frontend-user/src/features/admin/pages/ModelCatalogPage.tsx"],
    "模型用途绑定和别名已有 fixture。",
  ),
  covered(
    "admin",
    "admin-analysis-dimensions",
    ["frontend-user/src/features/admin/pages/DimensionsPage.tsx"],
    "分析维度目录已有 fixture。",
  ),
  covered(
    "admin",
    "admin-wechat-official",
    ["frontend-user/src/features/admin/pages/WechatOfficialPage.tsx"],
    "微信公众号连接和回复配置已有 fixture。",
  ),
  covered(
    "admin",
    "admin-news-webhook",
    ["frontend-user/src/features/admin/pages/NewsWebhookConfigPage.tsx"],
    "情报 Webhook 摄取和重试配置已有 fixture。",
  ),
  covered(
    "admin",
    "admin-system-config",
    ["frontend-user/src/features/admin/pages/SystemConfigPage.tsx"],
    "系统基础配置已有 fixture。",
  ),
  covered(
    "admin",
    "admin-code-snippets",
    [
      "frontend-user/src/features/admin/pages/SystemConfigPage.tsx",
      "frontend-user/src/features/admin/pages/CodeSnippetsPage.tsx",
    ],
    "系统代码片段目录已有 fixture。",
  ),
  covered(
    "admin",
    "admin-oauth-config",
    ["frontend-user/src/features/admin/pages/OAuthConfigPage.tsx"],
    "OAuth 与 SSO Provider 总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-payment-merchants",
    ["frontend-user/src/features/admin/pages/PaymentConfigPage.tsx"],
    "支付商户配置总览已有 fixture。",
  ),
  covered(
    "admin",
    "admin-wechat-pay",
    ["frontend-user/src/features/admin/pages/PaymentConfigPage.tsx"],
    "微信支付商户配置已有 fixture。",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

const ADMIN_GAP_SURFACES = [
  fixture(
    "admin",
    "admin-sidebar-alerts",
    [
      "frontend-user/src/features/admin/components/AdminSidebar.tsx",
      "frontend-user/src/features/admin/components/SidebarBadges.tsx",
    ],
    "导航告警徽标与状态点是稳定可见表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-dashboard-today-panel",
    ["frontend-user/src/features/admin/components/TodayPanel.tsx"],
    "今日待处理告警面板是稳定可见表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-dashboard-trend-cards",
    ["frontend-user/src/features/admin/pages/DashboardPage.tsx"],
    "后台趋势卡片是稳定可见表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-user-metrics",
    ["frontend-user/src/features/admin/components/UserMetricsPanel.tsx"],
    "用户指标、图表与时间预设是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-user-detail-drawer",
    ["frontend-user/src/features/admin/components/UserDetailDrawer.tsx"],
    "用户详情聚合抽屉是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-user-token-usage",
    ["frontend-user/src/features/admin/components/UserTokenUsagePanel.tsx"],
    "单用户算力用量面板是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-user-billing-history",
    ["frontend-user/src/features/admin/components/UserBillingPanels.tsx"],
    "用户订单、流水和兑换记录是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-user-grant-panel",
    ["frontend-user/src/features/admin/components/UserGrantPanel.tsx"],
    "会员、积分和重置次数发放面板是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-order-revenue-chart",
    ["frontend-user/src/features/admin/components/orders/RevenueChart.tsx"],
    "订单营收图是稳定可见表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-gift-code-generator",
    ["frontend-user/src/features/admin/pages/VipCodesPage.tsx"],
    "兑换码批量生成表单是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-gift-code-list",
    ["frontend-user/src/features/admin/pages/VipCodesPage.tsx"],
    "兑换码批次和明细列表是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-gift-code-action-dialog",
    ["frontend-user/src/features/admin/pages/VipCodesPage.tsx"],
    "兑换码延长、次数和天数动作弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-promo-config-preview",
    ["frontend-user/src/features/admin/pages/PromoConfigPage.tsx"],
    "活动配置与用户端预览是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-announcement-editor",
    ["frontend-user/src/features/admin/pages/AnnouncementsPage.tsx"],
    "公告新建与编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-hot-cleanup-config",
    ["frontend-user/src/features/admin/pages/HotContentPage.tsx"],
    "热门内容保留和清理配置是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-tool-editor",
    ["frontend-user/src/features/admin/pages/FeatureToolsPage.tsx"],
    "功能工具编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-tool-import",
    ["frontend-user/src/features/admin/pages/FeatureToolImportPage.tsx"],
    "功能工具 JSON 导入页是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-tool-import-job-detail",
    ["frontend-user/src/features/admin/pages/FeatureToolJobsPage.tsx"],
    "导入任务进度与结果弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-tool-webhook-list",
    ["frontend-user/src/features/admin/pages/FeatureToolWebhooksPage.tsx"],
    "工具 Webhook 列表是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-tool-webhook-editor",
    ["frontend-user/src/features/admin/pages/FeatureToolWebhooksPage.tsx"],
    "工具 Webhook 编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-tool-webhook-deliveries",
    ["frontend-user/src/features/admin/pages/FeatureToolWebhooksPage.tsx"],
    "Webhook 投递记录弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-skill-report-queue",
    ["frontend-user/src/features/admin/pages/SkillReviewPage.tsx"],
    "技能举报队列是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-skill-review-error",
    ["frontend-user/src/features/admin/pages/SkillReviewPage.tsx"],
    "技能审核错误与重试状态是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-feedback-detail-dialog",
    ["frontend-user/src/features/admin/pages/FeedbackPage.tsx"],
    "反馈详情和回复弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-message-editor",
    ["frontend-user/src/features/admin/pages/MessagesPage.tsx"],
    "站内消息新建弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-message-send-confirm",
    ["frontend-user/src/features/admin/pages/MessagesPage.tsx"],
    "消息发送确认闸门是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-mailbox-workspace",
    ["frontend-user/src/features/admin/pages/MailCenterPage.tsx"],
    "邮件中心主从工作区是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-mail-compose-dialog",
    ["frontend-user/src/features/admin/pages/MailCenterPage.tsx"],
    "邮件撰写弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-support-channel-config",
    ["frontend-user/src/features/admin/pages/SupportCenterConfigPage.tsx"],
    "二维码、IMAP、SMTP 与飞书客服配置是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-chat-session-detail",
    [
      "frontend-user/src/features/admin/components/ChatSessionMonitor.tsx",
      "frontend-user/src/features/admin/components/AdminTranscriptView.tsx",
    ],
    "会话详情抽屉与逐字记录是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-peer-review-monitor",
    ["frontend-user/src/features/admin/components/PeerReviewMonitor.tsx"],
    "同行评审监控表格是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-peer-review-detail",
    [
      "frontend-user/src/features/admin/components/PeerReviewMonitor.tsx",
      "frontend-user/src/features/admin/components/PeerReviewRecordView.tsx",
    ],
    "同行评审记录详情弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-file-preview",
    [
      "frontend-user/src/features/admin/components/AdminFilePreviewDialog.tsx",
      "frontend-user/src/features/admin/components/AdminFileViewer.tsx",
    ],
    "后台文件查看器弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-site-analytics-trend",
    ["frontend-user/src/features/admin/pages/AnalyticsPage.tsx"],
    "站点 KPI 和趋势图是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-site-analytics-dimensions",
    ["frontend-user/src/features/admin/pages/AnalyticsPage.tsx"],
    "页面、来源、国家和设备等六个排行面板是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-feature-usage-trend",
    ["frontend-user/src/features/admin/pages/UsageStatsPage.tsx"],
    "每日功能使用趋势是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-token-usage-filters-chart",
    [
      "frontend-user/src/features/admin/components/token-usage/TokenUsageFilterBar.tsx",
      "frontend-user/src/features/admin/components/token-usage/TokenDailyChart.tsx",
    ],
    "算力用量筛选与日趋势图是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-token-usage-dimensions",
    [
      "frontend-user/src/features/admin/components/token-usage/TokenDimensionPanel.tsx",
    ],
    "算力用量多维排行是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-token-usage-logs",
    [
      "frontend-user/src/features/admin/components/token-usage/TokenUsageLogTable.tsx",
    ],
    "算力调用日志表是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-provider-sections",
    ["frontend-user/src/features/admin/components/ProviderSection.tsx"],
    "Provider 与模型分区是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-model-editor",
    ["frontend-user/src/features/admin/components/ModelFormDialog.tsx"],
    "模型编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-provider-editor",
    ["frontend-user/src/features/admin/components/ProviderDialogs.tsx"],
    "Provider 编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-third-party-editor",
    ["frontend-user/src/features/admin/pages/ThirdPartyPage.tsx"],
    "第三方账号编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-dimension-editor",
    ["frontend-user/src/features/admin/pages/DimensionsPage.tsx"],
    "分析维度编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-system-channel-forms",
    ["frontend-user/src/features/admin/pages/SystemConfigPage.tsx"],
    "基础、邮件和短信配置表单是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-code-snippet-editor",
    [
      "frontend-user/src/features/admin/pages/CodeSnippetsPage.tsx",
      "frontend-user/src/features/admin/components/SimpleCrudPage.tsx",
    ],
    "代码片段编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-oauth-miniprogram",
    ["frontend-user/src/features/admin/components/WechatMiniProgramPanel.tsx"],
    "微信小程序 OAuth 配置面板是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-alipay-editor",
    ["frontend-user/src/features/admin/pages/PaymentConfigPage.tsx"],
    "支付宝商户编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-wechatpay-editor",
    ["frontend-user/src/features/admin/pages/PaymentConfigPage.tsx"],
    "微信支付商户编辑弹窗是稳定表面，本轮补齐。",
  ),
  fixture(
    "admin",
    "admin-payment-activation-confirm",
    ["frontend-user/src/features/admin/pages/PaymentConfigPage.tsx"],
    "支付渠道启用确认闸门是稳定表面，本轮补齐。",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

const ADMIN_EXCLUDED_SURFACES = [
  excluded(
    "admin",
    "admin-legacy-route-redirects",
    ["frontend-user/src/features/admin/routes.tsx"],
    "code-snippets、usage-logs、promo-config、third-party、agent-config 与 wechat-miniprogram 均为旧书签重定向，没有独立页面。",
  ),
  excluded(
    "admin",
    "admin-browser-prompt-and-toast-feedback",
    [
      "frontend-user/src/features/admin/pages/SkillReviewPage.tsx",
      "frontend-user/src/features/admin/hooks/useApiToast.ts",
    ],
    "浏览器 prompt 与即时 toast 由运行结果动态生成；稳定审核、错误与确认态已在业务 fixture 中覆盖。",
  ),
  excluded(
    "admin",
    "admin-command-palette-dead-code",
    ["frontend-user/src/features/admin/components/AdminCommandPalette.tsx"],
    "当前后台壳未引用该命令面板，属于未接线死代码，不以 mock 形态迁移。",
  ),
  excluded(
    "admin",
    "admin-shared-display-primitives",
    [
      "frontend-user/src/features/admin/components/AdminPageLayout.tsx",
      "frontend-user/src/features/admin/components/DataTable.tsx",
      "frontend-user/src/features/admin/components/Pagination.tsx",
      "frontend-user/src/features/admin/components/StatCard.tsx",
      "frontend-user/src/features/admin/components/UserCell.tsx",
    ],
    "布局、表格、分页、指标卡和单元格是后台共享原子；只随页面 fixture 验收，不单独迁移。",
  ),
  excluded(
    "admin",
    "admin-confirm-and-config-guards",
    ["frontend-user/src/features/admin/components/ConfirmDialog.tsx"],
    "确认宿主与权限配置闸门是内部控制层；稳定的发送、支付等确认态已有专门 fixture。",
  ),
] as const satisfies readonly MockSurfaceCoverageEntry[];

/** 后台域：37 个既有页面级覆盖 + 50 个本轮补齐的二级稳定表面。 */
export const ADMIN_MOCK_SURFACE_COVERAGE = [
  ...ADMIN_EXISTING_SURFACES,
  ...ADMIN_GAP_SURFACES,
  ...ADMIN_EXCLUDED_SURFACES,
] as const satisfies readonly MockSurfaceCoverageEntry[];

export const MOCK_SURFACE_COVERAGE = [
  ...USER_MOCK_SURFACE_COVERAGE,
  ...MOBILE_MOCK_SURFACE_COVERAGE,
  ...ADMIN_MOCK_SURFACE_COVERAGE,
] as const satisfies readonly MockSurfaceCoverageEntry[];

const VISIBLE_MOCK_SURFACE_COVERAGE = MOCK_SURFACE_COVERAGE.filter(
  (entry) => entry.disposition !== "excluded",
);

function countDisposition(
  entries: readonly MockSurfaceCoverageEntry[],
  disposition: MockSurfaceDisposition,
) {
  return entries.filter((entry) => entry.disposition === disposition).length;
}

function coverageStats(entries: readonly MockSurfaceCoverageEntry[]) {
  return {
    total: entries.length,
    fixture: countDisposition(entries, "fixture"),
    covered: countDisposition(entries, "covered"),
    excluded: countDisposition(entries, "excluded"),
  } as const;
}

/** 由清单数组机械计算；用于测试和审阅时防止口径漂移。 */
export const MOCK_SURFACE_COVERAGE_STATS = {
  user: coverageStats(USER_MOCK_SURFACE_COVERAGE),
  mobile: coverageStats(MOBILE_MOCK_SURFACE_COVERAGE),
  admin: coverageStats(ADMIN_MOCK_SURFACE_COVERAGE),
  all: coverageStats(MOCK_SURFACE_COVERAGE),
  visibleTotal: VISIBLE_MOCK_SURFACE_COVERAGE.length,
} as const;

/** 本轮审计冻结值：252 个稳定可见表面，另加 18 个明确排除组。 */
export const MOCK_SURFACE_COVERAGE_EXPECTED_TOTALS = {
  user: 130,
  mobile: 48,
  admin: 92,
  all: 270,
  visibleTotal: 252,
} as const;
