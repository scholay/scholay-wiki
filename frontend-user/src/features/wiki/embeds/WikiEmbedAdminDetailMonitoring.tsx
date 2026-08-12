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
        meta="智能搜索会话 · ss_01J5M8K7PT3F · 林晓舟 #28461"
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
        columns={["投稿 / 用户", "模式", "进度", "状态"]}
        rows={[
          {
            id: "pr-8042",
            cells: [
              <span key="n">
                <strong className="font-medium text-foreground">
                  面向复杂系统的因果表征学习
                </strong>
                <br />
                PR-8042 · 林晓舟
              </span>,
              "完整评审",
              "8 / 8 维度",
              <DetailBadge key="s" tone="green">
                已完成
              </DetailBadge>,
            ],
          },
          {
            id: "pr-8038",
            cells: [
              <span key="n">
                <strong className="font-medium text-foreground">
                  社区健康干预的混合方法研究
                </strong>
                <br />
                PR-8038 · 周奕辰
              </span>,
              "快速检查",
              "4 / 8 维度",
              <DetailBadge key="s" tone="amber">
                处理中
              </DetailBadge>,
            ],
          },
          {
            id: "pr-8021",
            cells: [
              <span key="n">
                <strong className="font-medium text-foreground">
                  量子纠错中的拓扑结构
                </strong>
                <br />
                PR-8021 · 吴谨言
              </span>,
              "完整评审",
              "2 / 8 维度",
              <DetailBadge key="s" tone="red">
                失败
              </DetailBadge>,
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
        title="面向复杂系统的因果表征学习"
        description="投稿 ID PR-8042 · 完整评审 · 已完成"
        primary="关闭"
        secondary="刷新记录"
      >
        <div className="flex flex-wrap gap-2">
          <DetailBadge tone="green">已完成</DetailBadge>
          <DetailBadge tone="blue">完整评审</DetailBadge>
          <DetailBadge>计算机科学 / 机器学习</DetailBadge>
        </div>
        <DetailTabs
          tabs={["投稿信息", "评审进度", "评审结果", "原始记录"]}
          active="投稿信息"
        />
        <DetailSection title="投稿时捕获的信息">
          <DetailFields
            fields={[
              {
                label: "标题",
                value: "面向复杂系统的因果表征学习",
                kind: "readonly",
              },
              { label: "目标", value: "期刊投稿前内部评审", kind: "readonly" },
              {
                label: "摘要",
                value: "本文提出一种结合结构因果模型与图表征学习的方法……",
                kind: "textarea",
              },
              {
                label: "关键词",
                value: "因果推断、图神经网络、表征学习",
                kind: "readonly",
              },
              {
                label: "投稿信草稿",
                value: "Dear Editors, we submit our manuscript…",
                kind: "textarea",
              },
            ]}
          />
        </DetailSection>
        <DetailTable
          columns={["阶段", "模型", "耗时", "状态"]}
          rows={[
            {
              id: "pr-scope",
              cells: [
                "范围检查",
                "glm-4.5",
                "18s",
                <DetailBadge key="s" tone="green">
                  完成
                </DetailBadge>,
              ],
            },
            {
              id: "pr-review",
              cells: [
                "8 维评审",
                "claude-sonnet-4",
                "4m 12s",
                <DetailBadge key="s" tone="green">
                  完成
                </DetailBadge>,
              ],
            },
          ]}
        />
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
      >
        <div className="grid min-h-72 place-items-center rounded-8 border border-border bg-surface-2 p-6">
          <div className="w-full max-w-md rounded-8 border border-border bg-surface-card p-6">
            <p className="text-12 text-faint">第 1 / 12 页</p>
            <h3 className="mt-4 font-serif text-18 font-bold text-foreground">
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
