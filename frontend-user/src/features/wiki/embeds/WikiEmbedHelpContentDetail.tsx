import { ArrowRight, BookOpen, Clock3 } from "lucide-react";

/** 对齐 QADetailPage 的 HelpLayout 两列阅读状态。 */
export function WikiEmbedHelpContentDetail() {
  return (
    <div
      className="w-[min(100%,64rem)] bg-background"
      aria-hidden
      data-wiki-fixture="help-content-detail"
    >
      <div className="flex h-10 items-center gap-3 border-b border-border-soft px-6 text-12 text-muted-foreground">
        <span>返回</span>
        <span className="text-faint">/</span>
        <span>帮助中心</span>
        <span className="text-faint">/</span>
        <span className="text-foreground">AI 与科研</span>
      </div>

      <header className="border-b border-border-soft bg-surface-1 px-6 py-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-brand-red" />
          <p className="text-12 font-medium uppercase text-brand-red">
            AI 与科研
          </p>
        </div>
        <h1 className="mt-3 max-w-3xl text-32 font-medium leading-display-tight text-foreground">
          AI 辅助写作时，如何避免引用幻觉？
        </h1>
        <p className="mt-4 max-w-3xl text-14 leading-paragraph text-muted-foreground">
          一份面向实际工作流的核验清单：先确认来源存在，再核对元数据、原文位置与论证关系。
        </p>
        <div className="mt-4 flex gap-2 text-12 text-muted-foreground">
          <span className="rounded-pill border border-border bg-background px-3 py-1">
            Scholay 内容团队 · 研究编辑
          </span>
          <span className="inline-flex items-center gap-1 rounded-pill border border-border bg-background px-3 py-1">
            <Clock3 className="size-3" /> 6 分钟
          </span>
        </div>
      </header>

      <div className="grid gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="space-y-8">
          <section>
            <h2 className="text-18 font-medium text-foreground">
              先确认来源是否真实存在
            </h2>
            <p className="mt-3 text-14 leading-paragraph text-subtle">
              不要从模型生成的引文字符串直接开始写作。先通过题名、作者、年份与
              DOI 交叉检索，确认记录可以在可信来源中被定位。
            </p>
          </section>
          <section>
            <h2 className="text-18 font-medium text-foreground">
              再回到原文验证论点
            </h2>
            <p className="mt-3 text-14 leading-paragraph text-subtle">
              找到文献不等于引用成立。核对原文段落、研究对象与结论边界，并记录页码或章节位置。
            </p>
          </section>
          <div className="rounded-8 border-l-4 border-brand-amber bg-brand-amber-soft p-4 text-14 leading-paragraph text-subtle">
            列表摘要用于快速判断主题，正式引用仍应回到原文核对。
          </div>
        </article>

        <aside className="border-l border-border-soft pl-4">
          <p className="text-12 font-medium text-foreground">本文目录</p>
          <ol className="mt-3 space-y-3 text-12 text-muted-foreground">
            <li className="text-brand-red">确认来源</li>
            <li>核对元数据</li>
            <li>验证原文论点</li>
            <li>记录引用位置</li>
          </ol>
        </aside>
      </div>

      <div className="mx-6 flex items-center justify-between border-t border-border-soft py-6">
        <span className="inline-flex items-center gap-2 text-14 font-medium text-foreground">
          <BookOpen className="size-4 text-brand-red" /> 相关问答
        </span>
        <span className="inline-flex items-center gap-1 text-12 text-brand-red">
          查看下一篇 <ArrowRight className="size-3" />
        </span>
      </div>
    </div>
  );
}
