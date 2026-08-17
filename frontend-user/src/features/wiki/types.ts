export type WikiArticleKind =
  | "overview"
  | "page"
  | "feature"
  | "rule"
  | "entity"
  | "architecture"
  | "legacy";

export type WikiArticleStatus =
  "current" | "experimental" | "compatibility" | "historical" | "planned";

export type WikiCategory =
  | "getting-started"
  | "discovery"
  | "research-ai"
  | "knowledge"
  | "membership"
  | "mobile"
  | "administration"
  | "platform"
  | "policies"
  | "history";

export interface WikiMergedTableLink {
  label: string;
  href: string;
}

export interface WikiMergedTableColumn {
  key: string;
  header: string;
  /** 连续相同值纵向合并 */
  merge?: boolean;
}

export type WikiMergedTableCell =
  string | WikiMergedTableLink | WikiMergedTableLink[];

export type WikiMergedTableRow = Record<string, WikiMergedTableCell>;

export interface WikiSectionTable {
  columns: WikiMergedTableColumn[];
  rows: WikiMergedTableRow[];
  /** 表注；缺省用所在章节标题。 */
  caption?: string;
}

export interface WikiArticleTarget {
  articleSlug: string;
  /** 跳到目标词条中的具体章节。 */
  sectionId?: string;
}

export interface WikiPromptOption {
  /** 同一组选项中唯一，用于可访问的 tab / panel 关联。 */
  id: string;
  /** 学科或任务场景，例如“医学影像”“方法复核”。 */
  label: string;
  /** 可直接复制、再按研究实际修改的完整提示词。 */
  prompt: string;
}

export interface WikiPromptGroup {
  id: string;
  title: string;
  description?: string;
  /** 缺省使用首项；只用于需要固定展示某个代表场景时。 */
  defaultOptionId?: string;
  options: WikiPromptOption[];
}

export type WikiGuidanceIcon =
  "book-open" | "compass" | "search" | "review" | "resource" | "sparkles";

export interface WikiArticleLinkCard extends WikiArticleTarget {
  /** 缺省沿用目标词条标题与摘要，避免同一术语出现多个版本。 */
  title?: string;
  description?: string;
  icon?: WikiGuidanceIcon;
}

export interface WikiTip {
  text: string;
  link?: WikiArticleTarget & { label: string };
}

export interface WikiNextStep extends WikiArticleTarget {
  /** 缺省沿用目标词条标题。 */
  title?: string;
  description: string;
  icon?: WikiGuidanceIcon;
}

export interface WikiNextStepGroup {
  title?: string;
  description?: string;
  items: WikiNextStep[];
}

/** 首页栏目入口同款：标题 + 摘要 + 栏目图标。 */
export interface WikiPathCard extends WikiArticleTarget {
  title: string;
  description: string;
  icon: WikiNavCategory;
}

export type WikiEmbedLayout = "stack" | "row";

/**
 * 章节中可穿插的结构化内容。markdown / table / embeds 默认引用章节现有字段；
 * markdown 可带独立片段、embeds 可指定 id 子集与排版，用来把说明和图穿插排列。
 */
export type WikiSectionBlock =
  | { type: "markdown"; markdown?: string }
  | { type: "table" }
  | { type: "embeds"; ids?: WikiEmbedId[]; layout?: WikiEmbedLayout }
  | { type: "prompt-tabs"; group: WikiPromptGroup }
  | { type: "article-link"; card: WikiArticleLinkCard }
  | { type: "tip"; tip: WikiTip }
  | { type: "next-steps"; group: WikiNextStepGroup }
  | { type: "path-cards"; items: WikiPathCard[] };

/** 词条内嵌的站点组件演示（须在 wiki/embeds/registry 登记） */
export type WikiEmbedId =
  | "academic-intel-detail"
  | "academic-intel-list"
  | "account-assets"
  | "account-connections"
  | "account-security"
  | "wechat-qr-login"
  | "wechat-qr-binding"
  | "oauth-callback-states"
  | "wechat-callback-state"
  | "oauth-account-merge"
  | "subscription-checkout"
  | "wallet-recharge"
  | "billing-orders"
  | "mobile-membership-purchase"
  | "promo-modal"
  | "help-center"
  | "help-content-detail"
  | "rhino-assistant-entry"
  | "rhino-assistant-dock"
  | "rhino-assistant-help-panel"
  | "rhino-assistant-support-panels"
  | "rhino-assistant-feedback-panel"
  | "resource-center"
  | "feedback-form"
  | "contact-support"
  | "search-autocomplete"
  | "search-workspace"
  | "claw-hero-smart-entry"
  | "claw-empty-state"
  | "claw-workspace"
  | "claw-context-composer"
  | "claw-run-states"
  | "claw-session-history"
  | "peer-review-wizard"
  | "peer-review-entry"
  | "peer-review-progress"
  | "peer-review-result-overview"
  | "peer-review-report"
  | "peer-review-editorial-check"
  | "membership-plans"
  | "auth-dialog"
  | "auth-password-recovery-email"
  | "author-profile"
  | "citation-dialog"
  | "citation-generator"
  | "citation-graph-preview"
  | "community-skill"
  | "feature-plaza"
  | "site-navigation-tree"
  | "my-resources-sections"
  | "manuscript-collection"
  | "scholay-plaza-hub"
  | "invite-nav-hub"
  | "funds-reminder"
  | "oauth-confirm"
  | "theme-and-rhino-loading"
  | "folder-icon-picker"
  | "invite-code-field"
  | "invite-code-prompt"
  | "invite-share"
  | "journal-detail"
  | "journal-directory"
  | "journal-search"
  | "journal-comments"
  | "library-share-receive"
  | "literature-library"
  | "matrix-workspace"
  | "mobile-academic-intel"
  | "mobile-auth-surfaces"
  | "mobile-auth-page"
  | "mobile-claw"
  | "mobile-feed"
  | "mobile-journal-feed"
  | "mobile-library-flow"
  | "mobile-library-folder"
  | "mobile-me"
  | "mobile-profile-settings"
  | "mobile-security-settings"
  | "mobile-connection-settings"
  | "mobile-search"
  | "mobile-tools"
  | "notification-inbox"
  | "paper-detail"
  | "paper-favorite-flow"
  | "pdf-chat-workspace"
  | "pdf-reader"
  | "pdf-resolve"
  | "prism-compile-states"
  | "prism-home"
  | "prism-workspace"
  | "prism-writing-start"
  | "profile-settings"
  | "quota-recovery"
  | "redeem-preview"
  | "share-sheet"
  | "staging-units"
  | "smart-paper-group"
  | "classic-search-dock"
  | "classic-search-filters"
  | "review-and-stage"
  | "smart-search-dock"
  | "smart-search-session"
  | "composer-attachments"
  | "admin-console"
  | "admin-access-control"
  | "admin-dashboard"
  | "admin-user-directory"
  | "admin-user-lifecycle"
  | "admin-entitlement-grants"
  | "admin-gift-codes"
  | "admin-orders"
  | "admin-announcements"
  | "admin-hot-content"
  | "admin-journal-sync"
  | "admin-tool-operations"
  | "admin-skill-moderation"
  | "admin-messaging"
  | "admin-campaigns-promo"
  | "admin-feedback"
  | "admin-mail-support"
  | "admin-session-monitoring"
  | "admin-invite-analytics"
  | "admin-delivery-logs"
  | "admin-support-config"
  | "admin-site-analytics"
  | "admin-feature-usage"
  | "admin-token-cost"
  | "admin-billing-configuration"
  | "admin-analytics-setup"
  | "admin-model-catalog"
  | "admin-third-party-accounts"
  | "admin-model-bindings"
  | "admin-analysis-dimensions"
  | "admin-wechat-official"
  | "admin-news-webhook"
  | "admin-system-config"
  | "admin-code-snippets"
  | "admin-oauth-config"
  | "admin-payment-merchants"
  | "admin-wechat-pay"
  | "home-research-entry"
  | "search-suggestions-dropdown"
  | "browser-tabs-quick-open"
  | "paper-references-citation"
  | "author-collaboration-trends"
  | "matrix-dimension-settings"
  | "library-import-workbench"
  | "library-bulk-actions"
  | "library-maintenance-workbench"
  | "library-relink-workbench"
  | "share-receive-variants"
  | "claw-artifact-output"
  | "peer-review-records-list"
  | "peer-review-submit-success"
  | "prism-writing-tools-dialogs"
  | "prism-document-insert-dialogs"
  | "prism-history-inline-edit"
  | "prism-live-preview"
  | "prism-writing-profile-dialog"
  | "prism-revision-dialog"
  | "prism-translate-dialog"
  | "prism-numbers-dialog"
  | "prism-math-editor-dialog"
  | "feature-tool-detail"
  | "community-skill-publish"
  | "community-skill-management"
  | "auth-register-recovery"
  | "billing-overview-usage"
  | "user-account-menu"
  | "common-navigation-tabs"
  | "common-reference-card"
  | "common-workspaces"
  | "common-agent-status"
  | "mobile-search-paper-results"
  | "mobile-search-filter-sheet"
  | "mobile-feed-states"
  | "mobile-claw-artifact-preview"
  | "mobile-claw-active-session"
  | "mobile-tools-catalog"
  | "mobile-tools-filter-sheet"
  | "mobile-tool-detail"
  | "mobile-pc-only-guide"
  | "mobile-me-logged-out"
  | "mobile-billing-ledger"
  | "mobile-subpage-auth-guard"
  | "mobile-detail-header"
  | "mp-diagram-viewer"
  | "quota-status-toasts"
  | "admin-sidebar-alerts"
  | "admin-dashboard-today-panel"
  | "admin-dashboard-trend-cards"
  | "admin-user-metrics"
  | "admin-user-detail-drawer"
  | "admin-user-token-usage"
  | "admin-user-billing-history"
  | "admin-user-grant-panel"
  | "admin-order-revenue-chart"
  | "admin-gift-code-generator"
  | "admin-gift-code-list"
  | "admin-gift-code-action-dialog"
  | "admin-promo-config-preview"
  | "admin-announcement-editor"
  | "admin-hot-cleanup-config"
  | "admin-tool-editor"
  | "admin-tool-import"
  | "admin-tool-import-job-detail"
  | "admin-tool-webhook-list"
  | "admin-tool-webhook-editor"
  | "admin-tool-webhook-deliveries"
  | "admin-skill-report-queue"
  | "admin-skill-review-error"
  | "admin-feedback-detail-dialog"
  | "admin-message-editor"
  | "admin-message-send-confirm"
  | "admin-mailbox-workspace"
  | "admin-mail-compose-dialog"
  | "admin-support-channel-config"
  | "admin-chat-session-detail"
  | "admin-peer-review-monitor"
  | "admin-peer-review-detail"
  | "admin-file-preview"
  | "admin-site-analytics-trend"
  | "admin-site-analytics-dimensions"
  | "admin-feature-usage-trend"
  | "admin-token-usage-filters-chart"
  | "admin-token-usage-dimensions"
  | "admin-token-usage-logs"
  | "admin-provider-sections"
  | "admin-model-editor"
  | "admin-provider-editor"
  | "admin-third-party-editor"
  | "admin-dimension-editor"
  | "admin-system-channel-forms"
  | "admin-code-snippet-editor"
  | "admin-oauth-miniprogram"
  | "admin-alipay-editor"
  | "admin-wechatpay-editor"
  | "admin-payment-activation-confirm";

export interface WikiEmbedRef {
  id: WikiEmbedId;
  /** 演示块标题；缺省用注册表默认文案 */
  caption?: string;
}

export interface WikiSection {
  id: string;
  title: string;
  markdown: string;
  /** 可选结构化表格；相同单元格值会按列配置纵向合并 */
  table?: WikiSectionTable;
  /** 可选真实组件演示（ErrorBoundary 沙箱，演示态不写生产数据） */
  embeds?: WikiEmbedRef[];
  /**
   * 可选的显式渲染顺序。未提供时保持 table → markdown → embeds 的旧顺序；
   * 提供后，每种旧内容必须以相应 block 引用，禁止页面根据正文关键词猜测。
   */
  blocks?: WikiSectionBlock[];
}

export interface WikiArticle {
  slug: string;
  title: string;
  summary: string;
  category: WikiCategory;
  kind: WikiArticleKind;
  status: WikiArticleStatus;
  audience: string[];
  aliases?: string[];
  /** 当前仓库中的事实来源；覆盖检查会验证这些路径存在。 */
  sourcePaths: string[];
  related?: string[];
  /** 词条页眉（标题/摘要下方）的演示组件 */
  headerEmbeds?: WikiEmbedRef[];
  sections: WikiSection[];
}

export interface WikiCategoryMeta {
  slug: WikiCategory;
  title: string;
  shortTitle: string;
  description: string;
  /**
   * 仅管理员 / 运营可见（与 canAccessAdmin 对齐）。
   * 前端门控只做产品可见性；词条仍在 bundle 内，不作安全边界。
   */
  adminOnly?: boolean;
}

/** 用户在 Wiki 中看到的一级目录；顺序来自 scholay-wiki.xmind。 */
export type WikiNavCategory =
  | "overview"
  | "scenarios"
  | "assistant"
  | "literature-search"
  | "journal-search"
  | "writing"
  | "review"
  | "intelligence"
  | "resources"
  | "limits"
  | "subscription"
  | "referrals"
  | "login"
  | "roadmap"
  | "terms"
  | "other";

export interface WikiNavTarget {
  articleSlug: string;
  /** 同一词条内的精确落点。 */
  sectionId?: string;
  /** 快捷入口不参与词条的唯一主归位统计。 */
  shortcut?: boolean;
}

export interface WikiNavNode {
  /** 在整棵目录树中唯一，用于展开状态与覆盖核验。 */
  id: string;
  title: string;
  description?: string;
  target?: WikiNavTarget;
  children?: WikiNavNode[];
  /** 整个节点及其后代仅向管理员 / 运营展示。 */
  adminOnly?: boolean;
}

export interface WikiNavCategoryMeta {
  slug: WikiNavCategory;
  title: string;
  shortTitle: string;
  description: string;
  children: WikiNavNode[];
}

export interface WikiNavTrail {
  category: WikiNavCategoryMeta;
  nodes: WikiNavNode[];
}
