import {
  ArrowRight,
  Info,
  MessageCircleQuestion,
  MessageSquare,
  Shield,
} from "lucide-react";

const QUESTIONS = [
  {
    title: "AI 辅助写作时如何避免引用幻觉？",
    excerpt: "将文献核验拆成来源、元数据、原文定位与引用关系四步。",
    meta: "6 分钟",
  },
  {
    title: "用 AI 阅读论文时，怎样核对回答对应的原文证据？",
    excerpt: "从页码、段落与上下文逐项回看，避免只引用对话中的二手概括。",
    meta: "8 分钟",
  },
  {
    title: "向 AI 上传研究材料前，需要做哪些隐私检查？",
    excerpt: "先识别个人信息、未公开数据与合作限制，再决定是否脱敏或移除。",
    meta: "7 分钟",
  },
  {
    title: "如何区分 AI 回答中的事实、推断与建议？",
    excerpt: "分别检查来源证据、推理链条与适用边界，不把建议写成既定结论。",
    meta: "9 分钟",
  },
] as const;

/**
 * 帮助中心 / 学术问答首页 · 纯样式 fixture。
 * 来源：product-mock help/pages/HelpCenterPage.tsx；卡片文字为内容服务示例。
 */
export function WikiEmbedHelpCenter() {
  return (
    <div
      className="w-[min(100%,48rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="help-center"
    >
      <div>
        <p className="text-12 font-medium text-brand-red">
          HELP CENTER · 学术问答
        </p>
        <p className="mt-2 font-serif text-24 font-medium text-foreground">
          帮助中心 · 学术问答
        </p>
        <p className="mt-2 max-w-3xl text-14 leading-paragraph text-muted-foreground">
          科研全流程真实问题的深度解答，从开题、研究方法到 AI
          辅助写作与文献核对。
        </p>
        <p className="mt-2 text-12 text-faint">
          内容示例 · 实际文章由内容服务提供
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          ["开题与选题", "6"],
          ["研究方法", "8"],
          ["AI 与科研", "4"],
          ["同行评审", "4"],
        ].map(([label, count]) => (
          <span
            key={label}
            className="inline-flex items-center gap-2 rounded-pill bg-surface-1 px-3 py-2 text-12 font-medium text-muted-foreground"
          >
            {label} <span className="text-faint">{count}</span>
          </span>
        ))}
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-16 font-medium text-foreground">
            <MessageCircleQuestion className="size-4 text-brand-red" /> AI
            与科研
          </p>
          <span className="text-12 text-faint">4 个问题</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {QUESTIONS.map((question) => (
            <article
              key={question.title}
              className="flex flex-col rounded-8 border border-border bg-surface-card p-4"
            >
              <p className="text-14 font-medium leading-paragraph text-foreground">
                {question.title}
              </p>
              <p className="mt-2 flex-1 text-12 leading-paragraph text-muted-foreground">
                {question.excerpt}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 text-12 text-faint">
                <span>{question.meta}</span>
                <ArrowRight className="size-3" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-2 border-t border-border pt-4 sm:grid-cols-3">
        <HelpLink icon={Info} label="关于 Scholay" />
        <HelpLink icon={MessageSquare} label="产品反馈" />
        <HelpLink icon={Shield} label="隐私与条款" />
      </div>
    </div>
  );
}

function HelpLink({ icon: Icon, label }: { icon: typeof Info; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-8 bg-surface-1 p-3">
      <span className="inline-flex size-8 items-center justify-center rounded-8 border border-border bg-surface-card">
        <Icon className="size-3 text-subtle" />
      </span>
      <span className="text-12 font-medium text-foreground">{label}</span>
    </div>
  );
}
