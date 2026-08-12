import { ArrowRight, FileEdit, GraduationCap } from "lucide-react";
import type { CSSProperties } from "react";

const PEER_ENTRY_MOCK_THEME = {
  "--wiki-mock-space-5": "1.25rem",
} as CSSProperties;

/**
 * 智能审稿场景入口 · 纯样式 fixture。
 * 对齐 current SubmissionLandingPage 的完整桌面首屏，不在产品卡片下面另造警告区。
 */
export function WikiEmbedPeerReviewEntry() {
  return (
    <div
      className="w-[min(100%,56rem)] bg-surface-card px-6 py-10"
      style={PEER_ENTRY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="peer-review-entry"
    >
      <header className="mb-10">
        <h2 className="font-serif text-24 font-medium text-foreground">
          开始一次智能审稿
        </h2>
        <p className="mt-2 text-14 leading-paragraph text-muted-foreground">
          投稿前用 AI 把审稿过程预演一遍 —— 三位 AI 审稿人 +
          主审决议，提前看到反馈。
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <ReviewEntryCard
          icon={FileEdit}
          title="期刊投稿"
          description="投稿到 SCI / SSCI 期刊前的 AI 预审。自动识别稿件信息 · AI 起草投稿信 · 三位审稿人 + 主审决议。"
          action="开始期刊投稿"
        />
        <ReviewEntryCard
          icon={GraduationCap}
          title="毕业审稿"
          description="硕博毕业论文盲审预演。按学校、学位、学科匹配场景 · 致评阅老师投稿信 · 三位审稿人 + 主审决议。"
          action="开始毕业审稿"
        />
      </div>
    </div>
  );
}

function ReviewEntryCard({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof FileEdit;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <section className="group rounded-16 border border-border bg-surface-card p-8">
      <Icon className="mb-[var(--wiki-mock-space-5)] size-9 text-brand-red" />
      <h3 className="text-16 font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
        {description}
      </p>
      <span className="mt-6 inline-flex items-center gap-1 text-12 font-medium text-brand-red">
        {action}
        <ArrowRight className="size-4" />
      </span>
    </section>
  );
}
