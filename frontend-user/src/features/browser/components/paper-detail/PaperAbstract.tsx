import type { Paper } from '@/shared/api/types';

/**
 * Abstract 段 —— italic 标题 + justified 正文 + Keywords 行;
 * 没有 abstract 时显示占位卡(避免空段消失看着像 bug)。
 */
export function PaperAbstract({ paper }: { paper: Paper }) {
  if (!paper.abstract) {
    return (
      <section className="mt-12">
        <h2 className="font-display italic text-lg text-muted-foreground mb-4">
          Abstract
        </h2>
        <div className="px-4 py-6 rounded-16 bg-surface-1 text-center text-xs text-muted-foreground">
          该论文未提供摘要
        </div>
      </section>
    );
  }

  return (
    <section className="mt-12 space-y-4">
      <h2 className="font-display italic text-lg text-muted-foreground">
        Abstract
      </h2>
      <p className="text-md leading-paragraph text-subtle text-justify whitespace-pre-wrap">
        {paper.abstract}
      </p>
      {(paper.fieldsOfStudy?.length ?? 0) > 0 && (
        <p className="italic text-sm text-faint">
          Keywords — {paper.fieldsOfStudy!.slice(0, 8).join(', ')}
        </p>
      )}
    </section>
  );
}
