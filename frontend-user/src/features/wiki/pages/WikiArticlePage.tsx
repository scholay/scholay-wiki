import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router-dom";
import { RouteSEO } from "@/shared/components/RouteSEO";
import { TableOfContents } from "@/shared/components/TableOfContents";
import {
  WIKI_ARTICLE_BY_SLUG,
  WIKI_CATEGORIES,
  WIKI_KIND_LABEL,
  relatedArticles,
} from "../content";
import { WikiStatusBadge } from "../components/WikiStatusBadge";

export function WikiArticlePage() {
  const { articleSlug = "" } = useParams();
  const article = WIKI_ARTICLE_BY_SLUG.get(articleSlug);
  const contentRef = useRef<HTMLElement>(null);

  if (!article) {
    return (
      <div className="mx-auto max-w-reading px-6 py-16 text-center">
        <BookOpen className="mx-auto size-icon text-faint" />
        <h1 className="mt-4 font-display text-28 font-bold text-foreground">
          词条不存在
        </h1>
        <p className="mt-3 text-12 text-muted-foreground">
          它可能尚未收录，或地址已经发生变化。
        </p>
        <Link
          to="/wiki/all"
          className="mt-6 inline-flex items-center gap-1 text-12 font-medium text-brand-red"
        >
          <ArrowLeft className="size-3" /> 返回全部词条
        </Link>
      </div>
    );
  }

  const category = WIKI_CATEGORIES.find(
    (item) => item.slug === article.category,
  );
  const related = relatedArticles(article);

  return (
    <>
      <RouteSEO
        title={`${article.title} | Scholay Wiki`}
        description={article.summary}
        keywords={[
          article.title,
          ...(article.aliases ?? []),
          "Scholay Wiki",
        ].join(",")}
      />

      <div className="mx-auto grid w-full max-w-page grid-cols-1 gap-12 px-6 py-8 md:px-8 md:py-10 xl:grid-cols-[minmax(0,1fr)_var(--rail-w-sm)] xl:px-10">
        <article ref={contentRef} className="min-w-0">
          <header className="border-b border-border-hairline pb-8">
            <nav
              className="flex flex-wrap items-center gap-2 text-12 text-muted-foreground"
              aria-label="面包屑"
            >
              <Link to="/wiki" className="hover:text-foreground">
                Wiki
              </Link>
              <span aria-hidden>/</span>
              {category && (
                <Link
                  to={`/wiki/category/${category.slug}`}
                  className="hover:text-foreground"
                >
                  {category.title}
                </Link>
              )}
              <span aria-hidden>/</span>
              <span className="font-medium text-foreground">
                {article.title}
              </span>
            </nav>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-12 text-muted-foreground">
              <WikiStatusBadge status={article.status} />
              <span>{WIKI_KIND_LABEL[article.kind]}</span>
              <span>适用：{article.audience.join("、")}</span>
              <span>版本：0.0.80</span>
              <span className="font-mono text-faint">f23d0003</span>
            </div>

            <h1 className="mt-6 font-brand text-32 font-normal leading-display-tight text-foreground">
              {article.title}
            </h1>
            <p className="mt-4 text-16 leading-paragraph text-subtle">
              {article.summary}
            </p>
          </header>

          {article.sections.map((section) => (
            <section
              key={section.id}
              className="border-b border-border-hairline py-8"
            >
              <h2
                id={section.id}
                className="scroll-mt-20 font-serif text-24 font-medium text-foreground"
              >
                {section.title}
              </h2>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => (
                    <p className="mt-4 text-14 leading-paragraph text-subtle">
                      {children}
                    </p>
                  ),
                  h3: ({ children }) => (
                    <h3 className="mt-8 scroll-mt-20 font-serif text-18 font-medium text-foreground">
                      {children}
                    </h3>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-medium text-foreground">
                      {children}
                    </strong>
                  ),
                  ul: ({ children }) => (
                    <ul className="mt-4 list-disc space-y-2 pl-6 text-14 leading-paragraph text-subtle">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="mt-4 list-decimal space-y-2 pl-6 text-14 leading-paragraph text-subtle">
                      {children}
                    </ol>
                  ),
                  code: ({ children }) => (
                    <code className="rounded-4 bg-surface-2 px-1 py-1 font-mono text-12 text-foreground">
                      {children}
                    </code>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="mt-6 border-l-2 border-brand-red bg-surface-1 px-4 py-3 text-14 leading-paragraph text-muted-foreground">
                      {children}
                    </blockquote>
                  ),
                  table: ({ children }) => (
                    <div className="mt-6 overflow-x-auto rounded-8 border border-border">
                      <table className="w-full border-collapse text-left text-12">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border-b border-border bg-surface-1 px-3 py-2 font-medium text-foreground">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border-b border-border-hairline px-3 py-2 align-top leading-paragraph text-subtle">
                      {children}
                    </td>
                  ),
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      className="text-brand-red underline underline-offset-4"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {section.markdown}
              </ReactMarkdown>
            </section>
          ))}

          <section className="py-8">
            <h2
              id="sources"
              className="scroll-mt-20 font-serif text-24 font-medium text-foreground"
            >
              来源
            </h2>
            <p className="mt-3 text-12 leading-paragraph text-muted-foreground">
              下列路径是本词条在代码基线中的主要事实来源。研究文档只补充背景，不覆盖运行时代码。
            </p>
            <ul className="mt-4 divide-y divide-border-hairline border-y border-border-hairline">
              {article.sourcePaths.map((path) => (
                <li
                  key={path}
                  className="break-words py-3 font-mono text-12 leading-paragraph text-brand-red"
                >
                  {path}
                </li>
              ))}
            </ul>
          </section>
        </article>

        <aside className="hidden border-l border-border-hairline pl-8 xl:block">
          <div className="sticky top-20">
            <TableOfContents
              contentRef={contentRef}
              title="本页目录"
              tone="brand"
            />

            <section className="mt-8 border-t border-border-hairline pt-8">
              <h2 className="text-12 font-medium text-foreground">相关词条</h2>
              {related.length > 0 ? (
                <div className="mt-3 flex flex-col">
                  {related.map((item) => (
                    <Link
                      key={item.slug}
                      to={`/wiki/${item.slug}`}
                      className="group flex items-center justify-between gap-2 py-2 text-12 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span>{item.title}</span>
                      <ArrowRight className="size-3 shrink-0 transition-transform group-hover:translate-x-1" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-12 text-faint">暂无关联词条。</p>
              )}
            </section>
          </div>
        </aside>
      </div>
    </>
  );
}
