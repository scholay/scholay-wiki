import { Bot, FileSearch, MessagesSquare, SearchCheck } from "lucide-react";
import {
  AdminDetailFrame,
  DetailBadge,
  DetailDialog,
  DetailDrawer,
  DetailFields,
  DetailMetricStrip,
  DetailNotice,
  DetailSection,
  DetailTable,
  DetailTabs,
} from "./WikiEmbedAdminDetailPrimitives";

/** ChatSessionMonitor + AdminTranscriptView：只读会话抽屉。 */
export function WikiEmbedAdminChatSessionDetail() {
  return (
    <AdminDetailFrame
      fixture="admin-chat-session-detail"
      icon={MessagesSquare}
      title="AI 会话详情"
      description="搜索会话后打开只读抽屉，核对用户、模型、轮次、附件与服务端原始消息。"
      eyebrow="会话监控"
    >
      <DetailDrawer
        title="图神经网络综述检索"
        meta="智能搜索会话 · ss_01J5M8K7PT3F · 林晓舟 · 用户 ID 28461"
        size="wide"
      >
        <DetailMetricStrip
          metrics={[
            { label: "最近实际模型", value: "glm-4.5", note: "服务端记录" },
            { label: "对话轮数", value: "6", note: "12 条消息" },
            { label: "创建时间", value: "09:42", note: "今天" },
            { label: "最近活跃", value: "10:26", note: "今天", tone: "green" },
          ]}
        />
        <DetailNotice>
          会话锁定模型：GLM-4.5。管理员只能刷新和查看，不可改写用户历史。
        </DetailNotice>
        <DetailSection
          title="逐轮记录"
          description="工具调用和附件紧邻产生它们的轮次。"
        >
          <div className="space-y-3">
            <div className="ml-auto max-w-xl rounded-8 bg-foreground px-3 py-2 text-12 leading-paragraph text-on-dark">
              帮我查找 2024 年以来图神经网络可解释性的综述。
            </div>
            <div className="max-w-xl rounded-8 border border-border bg-surface-1 px-3 py-2 text-12 leading-paragraph text-subtle">
              <span className="mb-2 inline-flex">
                <DetailBadge tone="blue">assistant · glm-4.5</DetailBadge>
              </span>
              <br />
              我会按“综述 / survey / explainability”构建检索式，并优先保留带 DOI
              的结果。
            </div>
            <div className="max-w-xl rounded-8 border border-border bg-surface-card px-3 py-2 text-12 text-faint">
              工具调用 · literature.search · 成功 · 返回 24 条
            </div>
          </div>
        </DetailSection>
      </DetailDrawer>
    </AdminDetailFrame>
  );
}

/** PeerReviewMonitor：投稿搜索、模式与状态总览。 */
export function WikiEmbedAdminPeerReviewMonitor() {
  return (
    <AdminDetailFrame
      fixture="admin-peer-review-monitor"
      icon={SearchCheck}
      title="智能审稿监控"
      description="按投稿 ID、用户、标题和状态检索，进入只读评审记录。"
      eyebrow="会话监控"
      action="刷新"
    >
      <div className="flex flex-wrap gap-2">
        <div className="min-w-56 flex-1 rounded-8 border border-border bg-surface-card px-3 py-2 text-12 text-faint">
          ID / 用户名 / 邮箱 / 手机号 / 标题
        </div>
        <DetailBadge tone="blue">全部状态</DetailBadge>
        <DetailBadge>全部模式</DetailBadge>
      </div>
      <DetailTable
        columns={["用户", "标题", "模式", "状态", "时间", ""]}
        columnsTemplate="1.2fr 1.8fr .7fr .7fr .8fr .5fr"
        rows={[
          {
            id: "pr-8042",
            cells: [
              "林晓舟 · ID 28461",
              "面向复杂系统的因果表征学习",
              "完整评审",
              <DetailBadge key="s" tone="green">
                已完成
              </DetailBadge>,
              "今天 09:42",
              <span key="a" className="text-foreground">
                查看
              </span>,
            ],
          },
          {
            id: "pr-8038",
            cells: [
              "周奕辰 · ID 28177",
              "社区健康干预的混合方法研究",
              "快速检查",
              <DetailBadge key="s" tone="amber">
                处理中
              </DetailBadge>,
              "今天 08:16",
              <span key="a" className="text-foreground">
                查看
              </span>,
            ],
          },
          {
            id: "pr-8021",
            cells: [
              "吴谨言 · ID 27602",
              "量子纠错中的拓扑结构",
              "完整评审",
              <DetailBadge key="s" tone="red">
                失败
              </DetailBadge>,
              "昨天 21:04",
              <span key="a" className="text-foreground">
                查看
              </span>,
            ],
          },
        ]}
      />
    </AdminDetailFrame>
  );
}

/** PeerReviewRecordView：单个投稿的捕获信息、进度和结果。 */
export function WikiEmbedAdminPeerReviewDetail() {
  return (
    <AdminDetailFrame
      fixture="admin-peer-review-detail"
      icon={Bot}
      title="评审记录详情"
      description="对投稿时捕获的信息、评审模式、模型执行和最终建议做只读核对。"
      eyebrow="会话监控"
    >
      <DetailDialog
        title="审稿记录 · 投稿 ID 8042"
        description="面向复杂系统的因果表征学习 · 完整评审 · 已完成"
        primary="关闭"
        secondary="刷新记录"
        size="max"
      >
        <div className="rounded-8 border border-border bg-surface-1 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DetailBadge tone="green">已完成</DetailBadge>
            <DetailBadge tone="blue">主审：建议小修</DetailBadge>
          </div>
          <p className="mt-3 text-18 font-medium text-foreground">
            面向复杂系统的因果表征学习
          </p>
          <p className="mt-1 text-12 text-faint">
            目标：期刊投稿前内部评审 · 计算机科学 / 机器学习 · 林晓舟
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["审稿人 A", "已完成", "green"],
            ["审稿人 B", "已完成", "green"],
            ["审稿人 C", "已完成", "green"],
            ["主审决议", "建议小修", "blue"],
          ].map(([label, value, tone]) => (
            <div
              key={label}
              className="rounded-8 border border-border bg-background p-3"
            >
              <p className="text-12 text-faint">{label}</p>
              <div className="mt-2">
                <DetailBadge tone={tone as "green" | "blue"}>
                  {value}
                </DetailBadge>
              </div>
            </div>
          ))}
        </div>
        <DetailTabs
          tabs={["审稿人 A", "审稿人 B", "审稿人 C", "主审决议"]}
          active="主审决议"
        />
        <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
          <DetailSection title="主审决议" variant="plain">
            <div className="space-y-3 rounded-8 border border-border bg-background p-4 text-14 leading-paragraph text-subtle">
              <p className="text-16 font-medium text-foreground">
                建议小修后再投
              </p>
              <p>
                研究问题明确，因果结构与图表征的结合具有潜在贡献；实验对照仍需补充。
              </p>
              <p>
                建议增加消融实验、明确数据泄漏防护，并统一图 3
                与附录中的指标口径。
              </p>
            </div>
          </DetailSection>
          <DetailSection title="记录信息" variant="plain">
            <DetailFields
              columns={1}
              fields={[
                {
                  label: "Agent 会话",
                  value: "pr_01J5M8K7PT",
                  kind: "readonly",
                },
                { label: "计算状态", value: "completed", kind: "readonly" },
                { label: "模型", value: "claude-sonnet-4", kind: "readonly" },
                { label: "总耗时", value: "4m 12s", kind: "readonly" },
              ]}
            />
          </DetailSection>
        </div>
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** AdminFilePreviewDialog + AdminFileViewer：不同文件类型的预览壳。 */
export function WikiEmbedAdminFilePreview() {
  return (
    <AdminDetailFrame
      fixture="admin-file-preview"
      icon={FileSearch}
      title="会话附件预览"
      description="图片、PDF 与文本使用内嵌查看器；不支持的格式提供下载信息而不是伪预览。"
      eyebrow="会话监控"
    >
      <DetailDialog
        title="methodology-notes.pdf"
        description="application/pdf · 2.4 MB · 会话 ss_01J5M8K7PT3F"
        primary="关闭"
        secondary="下载原文件"
        size="xl"
      >
        <div className="grid min-h-72 place-items-center rounded-8 border border-border bg-surface-2 p-6">
          <div className="w-full max-w-md rounded-8 border border-border bg-surface-card p-6">
            <p className="text-12 text-faint">第 1 / 12 页</p>
            <h3 className="mt-4 font-serif text-18 font-medium text-foreground">
              Methodology Notes
            </h3>
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full rounded-pill bg-border" />
              <div className="h-2 w-5/6 rounded-pill bg-border" />
              <div className="h-2 w-3/4 rounded-pill bg-border" />
            </div>
            <div className="mt-6 rounded-8 bg-cat-blue-soft p-3 text-12 leading-paragraph text-subtle">
              本文档由用户上传，仅供管理员排障核对。预览不会修改原文件。
            </div>
          </div>
        </div>
        <DetailNotice>
          文件 URL 按管理员权限签发；预览关闭后不再在界面中保留。
        </DetailNotice>
      </DetailDialog>
    </AdminDetailFrame>
  );
}
