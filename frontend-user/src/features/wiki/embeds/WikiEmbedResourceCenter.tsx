import { ArrowRight, Clock3, FolderOpen } from "lucide-react";

const RESOURCE_SECTIONS = [
  {
    category: "文献检索",
    articles: [
      {
        title: "从关键词到引用网络：系统查找核心文献",
        excerpt: "组合主题词、作者线索与引文关系，逐步建立可复核的检索范围。",
        time: "9 分钟",
      },
      {
        title: "检索结果太多时，如何逐步缩小范围",
        excerpt: "通过时间、学科、文献类型与开放获取条件形成可复现的筛选过程。",
        time: "8 分钟",
      },
    ],
  },
  {
    category: "论文写作",
    articles: [
      {
        title: "文献综述不是摘要堆叠：如何组织论证主线",
        excerpt: "用问题、分歧与证据缺口组织材料，而不是按作者逐篇复述。",
        time: "12 分钟",
      },
      {
        title: "从研究问题到章节结构：先搭论证骨架",
        excerpt: "明确每一节要回答的问题、使用的证据与它在全文中的作用。",
        time: "10 分钟",
      },
    ],
  },
] as const;

/** 对齐 ResourceCenterPage 的资源 tab 已加载状态。 */
export function WikiEmbedResourceCenter() {
  return (
    <div
      className="w-[min(100%,64rem)] bg-background"
      aria-hidden
      data-wiki-fixture="resource-center"
    >
      <header className="border-b border-border-soft bg-surface-1 px-6 py-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-brand-red" />
          <p className="text-12 font-medium uppercase text-brand-red">
            ACADEMIC RESOURCES
          </p>
        </div>
        <h1 className="mt-3 text-32 font-medium leading-display-tight text-foreground">
          学术资源中心
        </h1>
        <p className="mt-4 max-w-3xl text-14 leading-paragraph text-muted-foreground">
          Scholay 的博客与学术指南合集——产品观察、AI
          与科研思考，以及文献检索、论文写作和研究方法长文。
        </p>
      </header>

      <main className="px-6 py-10">
        <div className="mb-8 flex border-b border-border">
          <span className="border-b-2 border-brand-red px-4 py-3 text-14 font-medium text-foreground">
            学术资源
          </span>
          <span className="px-4 py-3 text-14 font-medium text-muted-foreground">
            产品博客
          </span>
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-2">
          {RESOURCE_SECTIONS.map((section) => (
            <span
              key={section.category}
              className="inline-flex h-7 items-center rounded-pill bg-surface-1 px-3 text-12 font-medium text-muted-foreground"
            >
              {section.category}
              <span className="ml-2 text-faint">{section.articles.length}</span>
            </span>
          ))}
        </div>

        <div className="space-y-12">
          {RESOURCE_SECTIONS.map((section) => (
            <section key={section.category}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="inline-flex items-center gap-2 text-18 font-medium text-foreground">
                  <FolderOpen className="size-4 text-brand-red" />
                  {section.category}
                </h2>
                <span className="text-12 text-faint">
                  {section.articles.length} 篇
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {section.articles.map((article) => (
                  <article
                    key={article.title}
                    className="flex min-h-36 flex-col rounded-8 border border-border-soft bg-background p-6"
                  >
                    <h3 className="text-16 font-medium leading-sans text-foreground">
                      {article.title}
                    </h3>
                    <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
                      {article.excerpt}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-3 text-12 text-faint">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3" /> {article.time}
                      </span>
                      <ArrowRight className="size-3" />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
