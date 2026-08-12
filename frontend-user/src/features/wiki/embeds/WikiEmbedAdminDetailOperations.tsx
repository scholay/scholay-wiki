import {
  Bell,
  FileJson,
  Flame,
  Gift,
  Import,
  Inbox,
  ListChecks,
  Mail,
  MailPlus,
  Megaphone,
  MessageSquareReply,
  PlugZap,
  QrCode,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  AdminDetailFrame,
  DetailBadge,
  DetailDialog,
  DetailFields,
  DetailMetricStrip,
  DetailNotice,
  DetailSection,
  DetailTable,
} from "./WikiEmbedAdminDetailPrimitives";

/** PromoConfigPage：推广配置与用户端弹窗预览。 */
export function WikiEmbedAdminPromoConfigPreview() {
  return (
    <AdminDetailFrame
      fixture="admin-promo-config-preview"
      icon={Gift}
      title="推广配置与预览"
      description="开关、客服二维码和文案在同一页面编辑，右侧同步呈现用户端弹窗结构。"
      eyebrow="推广活动"
      action="保存配置"
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-4">
          <DetailSection title="推广开关">
            <DetailFields
              fields={[
                { label: "活动状态", value: "已启用", kind: "toggle" },
                {
                  label: "用户端展示",
                  value: "首次访问时弹出",
                  kind: "select",
                },
              ]}
            />
          </DetailSection>
          <DetailSection title="弹窗文案（留空走默认）">
            <DetailFields
              fields={[
                { label: "标题", value: "新学期科研福利" },
                { label: "副标题", value: "添加客服，领取专属体验权益" },
                {
                  label: "福利点（一行一条）",
                  value: "AI 功能体验\n论文精读额度\n专属科研支持",
                  kind: "textarea",
                },
                { label: "按钮 / 引导文案", value: "扫码添加客服" },
              ]}
            />
          </DetailSection>
        </div>
        <DetailSection
          title="用户端弹窗预览"
          description="预览只反映当前表单，不代表已发布。"
        >
          <div className="rounded-12 border border-border bg-surface-1 p-6 text-center">
            <span className="mx-auto inline-flex size-10 items-center justify-center rounded-pill bg-danger-soft text-brand-red">
              <Sparkles className="size-4" />
            </span>
            <p className="mt-3 text-18 font-medium text-foreground">
              新学期科研福利
            </p>
            <p className="mt-1 text-12 text-subtle">
              添加客服，领取专属体验权益
            </p>
            <div className="mx-auto mt-4 flex size-28 items-center justify-center rounded-8 border border-dashed border-border bg-surface-card">
              <QrCode className="size-12 text-faint" />
            </div>
            <div className="mt-4 space-y-1 text-12 text-subtle">
              <p>AI 功能体验 · 论文精读额度 · 专属科研支持</p>
            </div>
            <span className="mt-4 inline-flex h-8 items-center rounded-8 bg-foreground px-4 text-12 font-medium text-on-dark">
              扫码添加客服
            </span>
          </div>
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** AnnouncementsPage：完整公告编辑弹窗。 */
export function WikiEmbedAdminAnnouncementEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-announcement-editor"
      icon={Megaphone}
      title="公告编辑器"
      description="形式、严重程度、目标人群和生效时段共同决定用户端可见状态。"
      eyebrow="公告管理"
    >
      <DetailDialog
        title="新建公告"
        description="留空开始时间表示立即，留空结束时间表示长期。"
        primary="创建公告"
        size="lg"
      >
        <DetailFields
          columns={3}
          fields={[
            { label: "标题", value: "系统维护通知" },
            { label: "严重程度", value: "警告", kind: "select" },
            { label: "形式", value: "顶部横幅", kind: "select" },
            { label: "目标人群", value: "全部访客", kind: "select" },
            { label: "开始", value: "2026-08-14 22:00" },
            { label: "结束", value: "2026-08-15 01:00" },
            {
              label: "内容",
              value: "维护期间部分写入功能暂停，现有资料仍可浏览。",
              kind: "textarea",
            },
            {
              label: "链接 URL（可选）",
              value: "/announcements/maintenance-0814",
            },
            { label: "链接文案", value: "查看详情" },
            { label: "立即发布", value: "已启用", kind: "toggle" },
            { label: "允许关闭", value: "已启用", kind: "toggle" },
            { label: "优先级", value: "80" },
          ]}
        />
        <DetailNotice>
          发布状态还会结合开始与结束时间计算为草稿、未开始、生效中或已过期。
        </DetailNotice>
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** HotContentPage CleanupConfigCard：关键词和热门论文保留策略。 */
export function WikiEmbedAdminHotCleanupConfig() {
  return (
    <AdminDetailFrame
      fixture="admin-hot-cleanup-config"
      icon={Flame}
      title="热门内容清理策略"
      description="定时清理长期未搜索的记录，并分别限制热搜词和热门论文的保留数量。"
      eyebrow="热门内容"
      action="保存策略"
    >
      <DetailSection
        title="清理策略"
        description="清理只作用于热度聚合记录，不删除用户资料或论文原文。"
      >
        <DetailFields
          fields={[
            { label: "未搜索超过", value: "90 天" },
            { label: "最多保留热搜词", value: "5,000 条" },
            { label: "最多保留热门论文", value: "10,000 条" },
            { label: "自动清理", value: "已启用", kind: "toggle" },
          ]}
        />
      </DetailSection>
    </AdminDetailFrame>
  );
}

/** FeatureToolsPage：功能广场工具完整编辑器。 */
export function WikiEmbedAdminToolEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-tool-editor"
      icon={Wrench}
      title="编辑功能工具"
      description="基础信息、访问方式、公开来源、使用场景和发布状态在同一弹窗维护。"
      eyebrow="功能广场"
    >
      <DetailDialog title="编辑工具 · 文献相似度检测" primary="保存" size="lg">
        <DetailFields
          fields={[
            { label: "名称", value: "文献相似度检测" },
            { label: "英文名", value: "Literature Similarity Checker" },
            {
              label: "Logo URL",
              value: "https://cdn.scholay.com/tools/checkrate.png",
            },
            { label: "一句话简介", value: "快速比对稿件中的文本相似片段" },
            { label: "分类", value: "研究工具", kind: "select" },
            { label: "价格", value: "免费", kind: "select" },
            { label: "形式", value: "站内工具", kind: "select" },
            { label: "官网 URL", value: "https://scholay.com/tools/checkrate" },
            { label: "标签（逗号分隔）", value: "查重, 相似度, 写作" },
            {
              label: "详细描述",
              value: "上传稿件后进行结构化相似度分析，并给出可核对的片段位置。",
              kind: "textarea",
            },
            {
              label: "SEO 公开来源（每行一个 URL）",
              value:
                "https://scholay.com/docs/checkrate\nhttps://scholay.com/about",
              kind: "textarea",
            },
            {
              label: "SEO 使用场景（标题 | 描述）",
              value: "投稿前检查 | 在投稿前快速定位需要改写的相似片段",
              kind: "textarea",
            },
            { label: "状态", value: "已上线", kind: "select" },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** FeatureToolImportPage：JSON 工具批量导入和校验结果。 */
export function WikiEmbedAdminToolImport() {
  return (
    <AdminDetailFrame
      fixture="admin-tool-import"
      icon={Import}
      title="批量导入工具"
      description="粘贴 JSON 数组，先校验结构，再建立可追踪的异步导入任务。"
      eyebrow="功能广场"
      action="提交导入"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-8 items-center rounded-8 border border-border bg-background px-3 text-12 text-subtle">
            选择 .json / .zip 文件
          </span>
          <span className="text-12 text-faint">tools-2026-08-12.json</span>
        </div>
        <DetailSection
          title="或粘贴 JSON（工具对象数组）"
          description="每个对象至少包含 name、slug、category、access 和 spec。"
          variant="plain"
        >
          <pre className="overflow-hidden whitespace-pre-wrap rounded-8 border border-border bg-surface-1 p-3 font-mono text-12 leading-paragraph text-subtle">{`[
  {
    "name": "科研海报生成器",
    "slug": "poster-maker",
    "category": "writing",
    "access": { "type": "internal" },
    "spec": { "version": 1 }
  }
]`}</pre>
        </DetailSection>
        <p className="text-14 text-brand-green">✓ 已识别 1 条工具</p>
        <div className="flex flex-col gap-3 rounded-8 border border-border bg-surface-1 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-14 text-subtle">
            ☑ 导入时通知下游 webhook 同步
            <span className="ml-2 text-12 text-faint">
              冷数据首次导入建议关闭
            </span>
          </span>
          <span className="inline-flex h-8 items-center rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
            导入 1 条 →
          </span>
        </div>
      </div>
    </AdminDetailFrame>
  );
}

/** FeatureToolJobsPage：导入任务统计和逐条错误。 */
export function WikiEmbedAdminToolImportJobDetail() {
  return (
    <AdminDetailFrame
      fixture="admin-tool-import-job-detail"
      icon={FileJson}
      title="导入任务详情"
      description="任务进度、创建/更新/跳过/失败计数与逐条错误保持在同一可复核界面。"
      eyebrow="功能广场"
    >
      <DetailDialog
        title="导入任务 No. 184 · 已完成"
        description="创建于 2026-08-12 10:18 · 用时 18 秒"
        primary="关闭"
        secondary="下载结果"
        size="lg"
      >
        <DetailMetricStrip
          metrics={[
            { label: "总数", value: "120" },
            { label: "新增", value: "86", tone: "green" },
            { label: "更新", value: "28", tone: "amber" },
            { label: "失败", value: "2", tone: "red" },
          ]}
        />
        <DetailTable
          columns={["序号", "slug", "处理结果", "说明"]}
          rows={[
            {
              id: "job-7",
              cells: [
                "序号 7",
                "poster-maker",
                <DetailBadge key="s" tone="green">
                  新增
                </DetailBadge>,
                "记录已创建",
              ],
            },
            {
              id: "job-34",
              cells: [
                "序号 34",
                "citation-map",
                <DetailBadge key="s" tone="amber">
                  更新
                </DetailBadge>,
                "沿用原 ID",
              ],
            },
            {
              id: "job-82",
              cells: [
                "序号 82",
                "bad-entry",
                <DetailBadge key="s" tone="red">
                  失败
                </DetailBadge>,
                "category 不存在",
              ],
            },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** FeatureToolWebhooksPage：Webhook 列表和最近投递状态。 */
export function WikiEmbedAdminToolWebhookList() {
  return (
    <AdminDetailFrame
      fixture="admin-tool-webhook-list"
      icon={PlugZap}
      title="工具 Webhook"
      description="功能工具新增、修改或删除后，将签名事件投递到启用的订阅地址。"
      eyebrow="功能广场"
      action="新建 webhook"
    >
      <DetailTable
        columns={["名称 / URL", "订阅事件", "最近投递", "状态"]}
        columnsTemplate="1.8fr 1fr 1.1fr .6fr"
        rows={[
          {
            id: "hook-search",
            cells: [
              <span key="n">
                <strong className="font-medium text-foreground">
                  搜索索引同步
                </strong>
                <br />
                https://search.example.edu/hooks/tools
              </span>,
              "新增 · 修改 · 删除",
              "今天 10:22 · HTTP 200",
              <DetailBadge key="s" tone="green">
                启用
              </DetailBadge>,
            ],
          },
          {
            id: "hook-cms",
            cells: [
              <span key="n">
                <strong className="font-medium text-foreground">
                  官网 CMS
                </strong>
                <br />
                https://cms.example.edu/api/tool-events
              </span>,
              "新增 · 修改",
              "昨天 18:42 · HTTP 503",
              <DetailBadge key="s" tone="red">
                投递失败
              </DetailBadge>,
            ],
          },
          {
            id: "hook-archive",
            cells: [
              <span key="n">
                <strong className="font-medium text-foreground">
                  归档镜像
                </strong>
                <br />
                https://archive.example.edu/webhook
              </span>,
              "全部事件",
              "8 月 8 日 · HTTP 204",
              <DetailBadge key="s">停用</DetailBadge>,
            ],
          },
        ]}
      />
      <DetailNotice>
        列表的“测试”与正式投递共用 URL 和签名配置，但测试不会写入工具变更事件。
      </DetailNotice>
    </AdminDetailFrame>
  );
}

/** FeatureToolWebhooksPage WebhookDialog：Webhook 配置。 */
export function WikiEmbedAdminToolWebhookEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-tool-webhook-editor"
      icon={PlugZap}
      title="Webhook 编辑器"
      description="密钥可选；订阅事件全不选时表示接收全部工具事件。"
      eyebrow="功能广场"
    >
      <DetailDialog title="编辑 webhook" primary="保存" size="compact">
        <DetailFields
          fields={[
            { label: "名称", value: "搜索索引同步" },
            { label: "URL", value: "https://search.example.edu/hooks/tools" },
            {
              label: "签名密钥（HMAC-SHA256）",
              value: "secret",
              kind: "secret",
            },
            { label: "状态", value: "已启用", kind: "toggle" },
          ]}
        />
        <DetailSection title="订阅事件" description="当前选择 3 个事件。">
          <div className="flex flex-wrap gap-2">
            <DetailBadge tone="green">✓ 新增</DetailBadge>
            <DetailBadge tone="green">✓ 修改</DetailBadge>
            <DetailBadge tone="green">✓ 删除</DetailBadge>
          </div>
        </DetailSection>
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** FeatureToolWebhooksPage DeliveriesDialog：加载/失败/空与数据态中的稳定数据态。 */
export function WikiEmbedAdminToolWebhookDeliveries() {
  return (
    <AdminDetailFrame
      fixture="admin-tool-webhook-deliveries"
      icon={ListChecks}
      title="Webhook 投递记录"
      description="成功响应、失败原因和重试时间逐次记录；请求失败不会误显示成空列表。"
      eyebrow="功能广场"
    >
      <DetailDialog
        title="投递记录 · 搜索索引同步"
        primary="关闭"
        secondary="刷新"
        size="lg"
      >
        <DetailTable
          columns={["事件", "响应", "尝试", "时间"]}
          rows={[
            {
              id: "delivery-1",
              cells: [
                "tool.updated · ID 842",
                <DetailBadge key="s" tone="green">
                  HTTP 200
                </DetailBadge>,
                "1 / 4",
                "今天 10:22",
              ],
            },
            {
              id: "delivery-2",
              cells: [
                "tool.created · ID 839",
                <DetailBadge key="s" tone="red">
                  HTTP 503
                </DetailBadge>,
                "3 / 4",
                "今天 09:48",
              ],
            },
            {
              id: "delivery-3",
              cells: [
                "tool.deleted · ID 812",
                <DetailBadge key="s" tone="green">
                  HTTP 204
                </DetailBadge>,
                "2 / 4",
                "昨天 16:11",
              ],
            },
          ]}
        />
        <DetailNotice tone="red">
          最近失败：上游返回 Service Unavailable；下一次重试 10:48。
        </DetailNotice>
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** SkillReviewPage ReportsSection：举报待办队列。 */
export function WikiEmbedAdminSkillReportQueue() {
  return (
    <AdminDetailFrame
      fixture="admin-skill-report-queue"
      icon={ShieldCheck}
      title="待处理技能举报"
      description="举报与技能上架审核是两条队列；处理记录保留原因、说明和处置结果。"
      eyebrow="Skill 审核"
      action="刷新队列"
    >
      <DetailMetricStrip
        metrics={[
          { label: "待处理", value: "7", tone: "red" },
          { label: "高风险", value: "2", tone: "amber" },
          { label: "今日已处理", value: "14", tone: "green" },
          { label: "最长等待", value: "19h", note: "目标 < 24h" },
        ]}
      />
      <DetailTable
        columns={["技能 / 举报人", "原因", "详情", "时间"]}
        columnsTemplate="1.3fr .8fr 1.5fr .7fr"
        rows={[
          {
            id: "report-301",
            cells: [
              <span key="n">
                <strong className="font-medium text-foreground">
                  文献批量下载
                </strong>
                <br />
                用户 ID 28177
              </span>,
              <DetailBadge key="s" tone="red">
                版权风险
              </DetailBadge>,
              "疑似绕过来源站限制",
              "今天 09:21",
            ],
          },
          {
            id: "report-298",
            cells: [
              <span key="n">
                <strong className="font-medium text-foreground">
                  英文润色助手
                </strong>
                <br />
                用户 ID 28461
              </span>,
              <DetailBadge key="s" tone="amber">
                描述不实
              </DetailBadge>,
              "声称可保证期刊录用",
              "昨天 20:04",
            ],
          },
          {
            id: "report-294",
            cells: [
              <span key="n">
                <strong className="font-medium text-foreground">
                  DOI 导出器
                </strong>
                <br />
                用户 ID 27602
              </span>,
              <DetailBadge key="s">功能失效</DetailBadge>,
              "目标接口持续 404",
              "昨天 16:42",
            ],
          },
        ]}
      />
    </AdminDetailFrame>
  );
}

/** SkillReviewPage：列表请求失败且可重试的错误态。 */
export function WikiEmbedAdminSkillReviewError() {
  return (
    <AdminDetailFrame
      fixture="admin-skill-review-error"
      icon={ShieldCheck}
      title="审核队列加载失败"
      description="失败态与真实空队列分开呈现，并保留可以重新请求的明确入口。"
      eyebrow="Skill 审核"
    >
      <div className="rounded-8 border border-brand-red/30 bg-danger-soft p-6 text-center">
        <p className="text-14 font-medium text-brand-red">无法加载待审核技能</p>
        <p className="mx-auto mt-2 max-w-lg text-12 leading-paragraph text-subtle">
          请求未完成，当前页面没有足够信息判断队列是否为空。请检查网络或服务状态后重试。
        </p>
        <span className="mt-4 inline-flex h-8 items-center rounded-8 bg-foreground px-4 text-12 font-medium text-on-dark">
          重试
        </span>
      </div>
    </AdminDetailFrame>
  );
}

/** FeedbackPage：反馈详情、附件与回复区。 */
export function WikiEmbedAdminFeedbackDetailDialog() {
  return (
    <AdminDetailFrame
      fixture="admin-feedback-detail-dialog"
      icon={MessageSquareReply}
      title="反馈详情与回复"
      description="详情弹窗集中显示用户、内容、附件、状态和后台回复。"
      eyebrow="用户反馈"
    >
      <DetailDialog
        title="反馈详情 · 林晓舟"
        description="林晓舟 · lin.xz@example.edu · 今天 09:18"
        primary="保存回复"
        size="lg"
      >
        <div className="flex flex-wrap gap-2">
          <DetailBadge tone="red">高优先级</DetailBadge>
          <DetailBadge tone="amber">处理中</DetailBadge>
          <DetailBadge>产品建议</DetailBadge>
        </div>
        <DetailSection title="反馈内容">
          <p className="text-12 leading-paragraph text-subtle">
            在论文对话里切换到引用列表后，希望可以保留上一次选择的排序方式；目前返回时会恢复默认。
          </p>
        </DetailSection>
        <DetailTable
          columns={["附件", "类型", "大小"]}
          rows={[
            {
              id: "feedback-shot",
              cells: ["citation-sort.png", "image/png", "428 KB"],
            },
            {
              id: "feedback-log",
              cells: ["reproduce.txt", "text/plain", "2 KB"],
            },
          ]}
        />
        <DetailFields
          fields={[
            { label: "处理状态", value: "已解决", kind: "select" },
            {
              label: "后台回复",
              value: "已记录该问题，排序偏好将在下一版本持久化。",
              kind: "textarea",
            },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** MessagesPage：新建站内消息草稿。 */
export function WikiEmbedAdminMessageEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-message-editor"
      icon={Bell}
      title="新建站内消息"
      description="消息先保存为草稿，再按全体、会员等级或指定用户发送。"
      eyebrow="站内消息"
    >
      <DetailDialog title="新建消息" primary="保存草稿" size="lg">
        <DetailFields
          fields={[
            { label: "标题", value: "同行评审功能更新" },
            { label: "分类", value: "系统通知", kind: "select" },
            { label: "过期时间（可选）", value: "2026-09-01 00:00" },
            { label: "发送类型", value: "指定用户", kind: "select" },
            { label: "目标", value: "28461, 28177, 27602" },
            {
              label: "内容",
              value: "新的评审进度页已上线，可以查看各评审维度的完成状态。",
              kind: "textarea",
            },
            {
              label: "链接 URL（可选）",
              value: "https://scholay.com/peer-review",
            },
            { label: "链接文案", value: "立即体验" },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** MessagesPage：不可撤回发送前的输入确认。 */
export function WikiEmbedAdminMessageSendConfirm() {
  return (
    <AdminDetailFrame
      fixture="admin-message-send-confirm"
      icon={Send}
      title="消息发送确认"
      description="批量发送不可撤回；确认弹窗重述目标、规模和内容摘要。"
      eyebrow="站内消息"
    >
      <DetailDialog
        title="确认发送消息"
        description="发送后不可撤回，也不能修改已到达用户的内容。"
        primary="确认发送"
        destructive
        size="sm"
      >
        <DetailMetricStrip
          metrics={[
            { label: "消息", value: "ID 482", note: "同行评审功能更新" },
            { label: "目标", value: "3", note: "指定用户" },
            { label: "分类", value: "系统", note: "系统通知" },
            { label: "过期时间", value: "09-01", note: "2026 年" },
          ]}
        />
        <DetailNotice tone="red">
          请输入 SEND 完成确认。此动作会立即创建用户消息记录。
        </DetailNotice>
        <DetailFields
          fields={[
            { label: "确认文本", value: "SEND" },
            {
              label: "目标摘要",
              value: "用户 ID 28461、28177、27602",
              kind: "readonly",
            },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** MailCenterPage：收件箱 master-detail 工作台。 */
export function WikiEmbedAdminMailboxWorkspace() {
  return (
    <AdminDetailFrame
      fixture="admin-mailbox-workspace"
      icon={Inbox}
      title="客服邮箱工作台"
      description="左侧筛选和选信，右侧阅读原始正文并直接回复；无选择与空收件箱是不同状态。"
      eyebrow="邮件中心"
      action="写邮件"
    >
      <div className="grid min-h-112 overflow-hidden rounded-8 border border-border bg-background lg:grid-cols-[22rem_1fr]">
        <aside className="border-b border-border lg:border-r lg:border-b-0">
          <div className="space-y-2 border-b border-border p-3">
            <div className="rounded-8 border border-border bg-surface-1 px-3 py-2 text-12 text-faint">
              发件人 / 主题
            </div>
            <div className="flex gap-1">
              <DetailBadge tone="blue">全部</DetailBadge>
              <DetailBadge>未读 4</DetailBadge>
              <DetailBadge>已回复</DetailBadge>
            </div>
          </div>
          {[
            ["Re: 会员到期时间", "林晓舟 · 今天 10:04", "unread"],
            ["发票抬头修改", "周奕辰 · 今天 09:18", "read"],
            ["Webhook 对接咨询", "吴谨言 · 昨天 17:42", "replied"],
          ].map(([subject, meta, state], index) => (
            <div
              key={subject}
              className={`border-b border-border-soft p-3 ${index === 0 ? "bg-cat-blue-soft" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-12 font-medium text-foreground">
                  {subject}
                </p>
                <DetailBadge
                  tone={
                    state === "unread"
                      ? "blue"
                      : state === "replied"
                        ? "green"
                        : "neutral"
                  }
                >
                  {state === "unread"
                    ? "未读"
                    : state === "replied"
                      ? "已回复"
                      : "已读"}
                </DetailBadge>
              </div>
              <p className="mt-1 text-12 text-faint">{meta}</p>
            </div>
          ))}
        </aside>
        <article className="min-w-0 p-4">
          <div className="border-b border-border pb-3">
            <h3 className="text-16 font-medium text-foreground">
              Re: 会员到期时间
            </h3>
            <p className="mt-1 text-12 text-faint">
              林晓舟 &lt;lin.xz@example.edu&gt; · 今天 10:04
            </p>
          </div>
          <DetailSection title="邮件正文" className="mt-4">
            <p className="text-12 leading-paragraph text-subtle">
              你好，我通过兑换码补充了 30 天
              Pro，但账户页显示的到期日与预期不同。可以帮我核对一下批次吗？
            </p>
            <p className="mt-3 text-12 text-faint">
              关联批次：7f3a8e4c-2b91-4d6f-9a20-c8e1f547b632
            </p>
          </DetailSection>
          <div className="mt-4 rounded-8 border border-border bg-surface-1 p-3">
            <p className="text-12 text-faint">输入回复内容…</p>
            <p className="mt-2 text-12 leading-paragraph text-subtle">
              你好，我们已核对该批次。会员权益按兑换时刻顺延 30
              天，账户页现已同步。
            </p>
            <div className="mt-3 flex justify-end">
              <DetailBadge tone="green">发送回复</DetailBadge>
            </div>
          </div>
        </article>
      </div>
    </AdminDetailFrame>
  );
}

/** MailCenterPage ComposeDialog：管理员主动发信。 */
export function WikiEmbedAdminMailComposeDialog() {
  return (
    <AdminDetailFrame
      fixture="admin-mail-compose-dialog"
      icon={MailPlus}
      title="主动发送客服邮件"
      description="从客服发信配置指定的账号发送，不进入站内消息系统。"
      eyebrow="邮件中心"
    >
      <DetailDialog
        title="写邮件"
        description="收件邮箱可从用户管理的固定信息中核对。"
        primary="发送邮件"
      >
        <DetailFields
          columns={1}
          fields={[
            { label: "收件邮箱", value: "lin.xz@example.edu" },
            { label: "主题", value: "Scholay 会员到期时间核对结果" },
            {
              label: "正文",
              value:
                "你好，我们已完成会员权益核对。当前到期日为 2026-11-12，详情见账户会员页。",
              kind: "textarea",
            },
          ]}
        />
        <DetailNotice tone="green">
          SMTP 配置最近一次测试成功，发件人显示为“Scholay 客服”。
        </DetailNotice>
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** SupportCenterConfigPage：公开联系方式、收发信和飞书通知。 */
export function WikiEmbedAdminSupportChannelConfig() {
  return (
    <AdminDetailFrame
      fixture="admin-support-channel-config"
      icon={Mail}
      title="客服渠道配置"
      description="用户端联系方式、客服邮箱收发信和飞书通知分别配置并单独测试。"
      eyebrow="客服配置"
      action="保存全部"
    >
      <div className="max-w-3xl space-y-6">
        <DetailSection
          title="联系方式展示（用户端 /contact）"
          description="显示在用户端 /contact 页面。"
        >
          <DetailFields
            fields={[
              { label: "产品支持邮箱", value: "support@scholay.com" },
              { label: "商务合作邮箱", value: "hello@scholay.com" },
              {
                label: "联系说明",
                value: "工作日 9:00–18:00 在线",
                kind: "textarea",
              },
            ]}
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            {["企业微信二维码", "飞书二维码"].map((label) => (
              <div
                key={label}
                className="flex min-h-28 flex-col items-center justify-center rounded-8 border border-dashed border-border bg-surface-1 text-12 text-faint"
              >
                <QrCode className="mb-2 size-8" />
                {label}
              </div>
            ))}
          </div>
        </DetailSection>
        <DetailSection
          title="客服邮箱收件（IMAP）"
          description="启用后定时拉取新邮件到邮件中心；测试按钮使用已保存配置。"
          action="测试连接"
        >
          <DetailFields
            fields={[
              { label: "启用拉取", value: "已启用", kind: "toggle" },
              { label: "IMAP 服务器", value: "imap.exmail.qq.com" },
              { label: "端口", value: "993" },
              { label: "邮箱账号", value: "support@scholay.com" },
              { label: "密码 / 授权码", value: "secret", kind: "secret" },
              { label: "轮询间隔（分钟）", value: "5" },
              { label: "TLS（993 端口必开）", value: "已启用", kind: "toggle" },
            ]}
          />
        </DetailSection>
        <DetailSection
          title="客服邮箱发信（SMTP）"
          description="邮件中心的回信和写信从该客服邮箱发出；留空则回落全站发信配置。"
          action="发送测试邮件"
        >
          <DetailFields
            fields={[
              { label: "SMTP 服务器", value: "smtp.exmail.qq.com" },
              { label: "端口（465=SSL / 587=TLS）", value: "465" },
              { label: "发信账号", value: "support@scholay.com" },
              { label: "密码 / 授权码", value: "secret", kind: "secret" },
              { label: "发信人显示名（可空）", value: "Scholay 客服" },
              { label: "TLS", value: "已启用", kind: "toggle" },
            ]}
          />
        </DetailSection>
        <DetailSection
          title="飞书通知（群自定义机器人）"
          description="用户提交反馈或客服邮箱收到新邮件时推送到群。"
          action="发送测试通知"
        >
          <DetailFields
            fields={[
              { label: "Webhook 地址", value: "secret", kind: "secret" },
              { label: "签名 Secret", value: "secret", kind: "secret" },
              { label: "在线反馈通知", value: "已启用", kind: "toggle" },
              { label: "新邮件通知", value: "已启用", kind: "toggle" },
            ]}
          />
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}
