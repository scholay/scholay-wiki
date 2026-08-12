import { ArrowRight, BookOpen, Clock3, ListTree } from "lucide-react";

/**
 * 帮助 / 资源内容详情页 · 纯样式 fixture。
 * 来源：product-mock help/pages/QADetailPage.tsx + ResourceDetailPage.tsx。
 */
export function WikiEmbedHelpContentDetail() {
  return (
    <div
      className="w-[min(100%,48rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="help-content-detail"
    >
      <div className="text-12 text-faint">帮助中心 / AI 与科研</div>
      <p className="mt-4 text-12 font-medium text-brand-red">AI 与科研</p>
      <h3 className="mt-2 max-w-3xl font-serif text-24 font-medium leading-display-tight text-foreground">
        AI 辅助写作时，如何避免引用幻觉？
      </h3>
      <p className="mt-3 max-w-3xl text-14 leading-paragraph text-muted-foreground">
        一份面向实际工作流的核验清单：先确认来源存在，再核对元数据、原文位置与论证关系。
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-12 text-faint">
        <span className="rounded-pill bg-surface-1 px-2 py-1">
          Scholay 内容团队
        </span>
        <span className="inline-flex items-center gap-1 rounded-pill bg-surface-1 px-2 py-1">
          <Clock3 className="size-3" /> 6 分钟
        </span>
        <span className="rounded-pill bg-surface-1 px-2 py-1">内容示例</span>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_12rem]">
        <article className="space-y-6">
          <section>
            <p className="text-16 font-medium text-foreground">
              先确认来源是否真实存在
            </p>
            <p className="mt-2 text-14 leading-paragraph text-subtle">
              不要从模型生成的引文字符串直接开始写作。先通过题名、作者、年份与
              DOI 交叉检索，确认记录可以在至少一个可信来源中被定位。
            </p>
          </section>
          <section>
            <p className="text-16 font-medium text-foreground">
              再回到原文验证论点
            </p>
            <p className="mt-2 text-14 leading-paragraph text-subtle">
              找到文献不等于引用成立。核对原文段落、研究对象与结论边界，记录页码或章节位置。
            </p>
          </section>
          <div className="rounded-8 border-l-4 border-brand-amber bg-brand-amber-soft p-4 text-14 leading-paragraph text-subtle">
            内容服务是正文的单一真源；列表摘要、详情正文与相关文章均来自同一文章记录。
          </div>
        </article>

        <aside className="h-fit rounded-8 border border-border bg-surface-1 p-4">
          <p className="flex items-center gap-2 text-12 font-medium text-foreground">
            <ListTree className="size-3" /> 本文目录
          </p>
          <ol className="mt-3 space-y-2 text-12 text-muted-foreground">
            <li className="text-brand-red">1. 确认来源</li>
            <li>2. 核对元数据</li>
            <li>3. 验证原文论点</li>
            <li>4. 记录引用位置</li>
          </ol>
        </aside>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="flex items-center gap-2 text-12 font-medium text-foreground">
          <BookOpen className="size-4 text-brand-red" /> 相关问答
        </span>
        <span className="inline-flex items-center gap-1 text-12 text-brand-red">
          查看下一篇 <ArrowRight className="size-3" />
        </span>
      </div>
    </div>
  );
}
