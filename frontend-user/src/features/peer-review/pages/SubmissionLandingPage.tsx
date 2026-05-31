import { Link } from 'react-router-dom';
import { FileEdit, GraduationCap, ArrowRight } from 'lucide-react';

/**
 * 进入 /peer-review 默认页 —— 两个大卡片选 期刊 / 毕业。
 * 用户也可以直接在侧栏点子项跳过这一步,这里是首次进入的引导页。
 */
export function SubmissionLandingPage() {
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col justify-center px-10 py-16">
      <header className="mb-10">
        <h1 className="text-2xl font-bold text-foreground">开始一次智能审稿</h1>
        <p className="mt-2 text-base text-muted-foreground">
          投稿前用 AI 把审稿过程预演一遍 —— 三位 AI 审稿人 + 主审决议,提前看到反馈。
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link
          to="/peer-review/journal"
          className="group rounded-lg border border-border bg-background p-8 transition hover:border-brand-red hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
        >
          <FileEdit className="mb-5 size-9 text-brand-red" />
          <h2 className="text-lg font-bold text-foreground">期刊投稿</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            投稿到 SCI / SSCI 期刊前的 AI 预审。
            自动识别稿件信息 · AI 起草投稿信 · 三位审稿人 + 主审决议。
          </p>
          <span className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-brand-red transition group-hover:gap-2">
            开始期刊投稿 <ArrowRight className="size-4" />
          </span>
        </Link>

        <Link
          to="/peer-review/thesis"
          className="group rounded-lg border border-border bg-background p-8 transition hover:border-brand-red hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
        >
          <GraduationCap className="mb-5 size-9 text-brand-red" />
          <h2 className="text-lg font-bold text-foreground">毕业审稿</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            硕博毕业论文盲审预演。
            按学校、学位、学科匹配场景 · 致评阅老师投稿信 · 三位审稿人 + 主审决议。
          </p>
          <span className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-brand-red transition group-hover:gap-2">
            开始毕业审稿 <ArrowRight className="size-4" />
          </span>
        </Link>
      </div>
    </div>
  );
}
