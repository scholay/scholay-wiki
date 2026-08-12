import {
  ArrowRight,
  Info,
  Mail,
  MessageCircleQuestion,
  MessageSquare,
  Shield,
} from "lucide-react";

const QUESTIONS = [
  {
    title: "AI 辅助写作时如何避免引用幻觉？",
    excerpt: "将文献核验拆成来源、元数据、原文定位与引用关系四步。",
    time: "6 分钟",
  },
  {
    title: "用 AI 阅读论文时，怎样核对回答对应的原文证据？",
    excerpt: "从页码、段落与上下文逐项回看，避免只引用对话中的二手概括。",
    time: "8 分钟",
  },
  {
    title: "向 AI 上传研究材料前，需要做哪些隐私检查？",
    excerpt: "先识别个人信息、未公开数据与合作限制，再决定是否脱敏或移除。",
    time: "7 分钟",
  },
  {
    title: "如何区分 AI 回答中的事实、推断与建议？",
    excerpt: "分别检查来源证据、推理链条与适用边界，不把建议写成既定结论。",
    time: "9 分钟",
  },
] as const;

/** 对齐 HelpCenterPage：HelpLayout 标题区 + 分类锚点 + 单一分类列表。 */
export function WikiEmbedHelpCenter() {
  return (
    <div
      className="w-[min(100%,64rem)] bg-background"
      aria-hidden
      data-wiki-fixture="help-center"
    >
      <header className="border-b border-border-soft bg-surface-1 px-6 py-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-brand-red" />
          <p className="text-12 font-medium uppercase text-brand-red">
            HELP CENTER · 学术问答
          </p>
        </div>
        <h1 className="mt-3 text-32 font-medium leading-display-tight text-foreground">
          帮助中心 · 学术问答
        </h1>
        <p className="mt-4 max-w-3xl text-14 leading-paragraph text-muted-foreground">
          科研全流程真实问题的深度解答——从开题、研究方法、数据集，到 AI
          辅助写作、模拟审稿与文献核对。
        </p>
      </header>

      <main className="px-6 py-10">
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {[
            ["开题与选题", "6"],
            ["研究方法", "8"],
            ["AI 与科研", "4"],
            ["同行评审", "4"],
          ].map(([label, count]) => (
            <span
              key={label}
              className="inline-flex h-7 items-center rounded-pill bg-surface-1 px-3 text-12 font-medium text-muted-foreground"
            >
              {label} <span className="ml-2 text-faint">{count}</span>
            </span>
          ))}
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-18 font-medium text-foreground">
              <MessageCircleQuestion className="size-4 text-brand-red" /> AI
              与科研
            </h2>
            <span className="text-12 text-faint">4 个问题</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {QUESTIONS.map((question) => (
              <article
                key={question.title}
                className="flex min-h-36 flex-col gap-2 rounded-8 border border-border-soft bg-background p-6"
              >
                <p className="text-16 font-medium leading-sans text-foreground">
                  {question.title}
                </p>
                <p className="text-12 leading-paragraph text-muted-foreground">
                  {question.excerpt}
                </p>
                <div className="mt-auto flex items-center justify-between pt-2 text-12 text-faint">
                  <span>{question.time}</span>
                  <ArrowRight className="size-3" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 border-t border-border-soft pt-8">
          <p className="mb-4 text-12 font-medium uppercase text-faint">
            其他帮助
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <HelpLink
              icon={Info}
              label="关于 Scholay"
              detail="产品使命与团队"
            />
            <HelpLink
              icon={MessageSquare}
              label="产品反馈"
              detail="提 bug / 提需求"
            />
            <HelpLink icon={Mail} label="联系我们" detail="其他联系方式" />
            <HelpLink
              icon={Shield}
              label="隐私与条款"
              detail="隐私政策 / 服务条款"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function HelpLink({
  icon: Icon,
  label,
  detail,
}: {
  icon: typeof Info;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-8 border border-border-soft bg-surface-1 p-3">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-8 border border-border-soft bg-background">
        <Icon className="size-3 text-subtle" />
      </span>
      <div className="min-w-0">
        <p className="text-12 font-medium text-foreground">{label}</p>
        <p className="truncate text-12 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
