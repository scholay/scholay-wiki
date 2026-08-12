import { ArrowRight, FileEdit, GraduationCap, ShieldAlert } from "lucide-react";

/** 智能审稿场景入口 · 纯样式 fixture，对齐 SubmissionLandingPage。 */
export function WikiEmbedPeerReviewEntry() {
  return (
    <div
      className="w-[min(100%,44rem)] rounded-12 border border-border bg-surface-card p-4 sm:p-6"
      aria-hidden
      data-wiki-fixture="peer-review-entry"
    >
      <h2 className="font-serif text-20 font-medium text-foreground">
        开始一次智能审稿
      </h2>
      <p className="mt-2 text-12 leading-paragraph text-subtle">
        选择稿件场景，在 Scholay 内预演评议过程并提前发现风险。
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ReviewEntryCard
          icon={FileEdit}
          title="期刊投稿"
          description="核对目标期刊、稿件信息与 Cover Letter，再启动三位审稿人与主审评议。"
          action="开始期刊预审"
        />
        <ReviewEntryCard
          icon={GraduationCap}
          title="毕业审稿"
          description="按学校、学位与学科设置评阅背景，再生成面向学位论文的结构化意见。"
          action="开始毕业预审"
        />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-8 border border-brand-amber/30 bg-warning-soft px-3 py-2 text-12 leading-paragraph text-subtle">
        <ShieldAlert className="mt-1 size-3.5 shrink-0 text-brand-amber" />
        这是 AI 模拟评议，不会把稿件投递给期刊、学校、导师或出版社。
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
    <section className="rounded-12 border border-border bg-surface-card p-4">
      <Icon className="size-7 text-brand-red" />
      <h3 className="mt-4 text-16 font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-12 leading-paragraph text-subtle">
        {description}
      </p>
      <span className="mt-4 inline-flex items-center gap-1 text-12 font-medium text-brand-red">
        {action}
        <ArrowRight className="size-3.5" />
      </span>
    </section>
  );
}
