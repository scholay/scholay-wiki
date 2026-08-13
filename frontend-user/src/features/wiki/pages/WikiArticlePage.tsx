import { ArrowLeft, ArrowRight, BookOpen, Check, Copy } from "lucide-react";
import { isValidElement, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { MermaidDiagram } from "@/shared/components/chat/MermaidDiagram";
import { RouteSEO } from "@/shared/components/RouteSEO";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { TableOfContents } from "@/shared/components/TableOfContents";
import { copyToClipboard } from "@/shared/lib/clipboard";
import {
  WIKI_ARTICLE_BY_SLUG,
  WIKI_CATEGORIES,
  WIKI_KIND_LABEL,
  articleNavTrail,
  canViewWikiArticle,
  firstNavHref,
  relatedArticles,
  wikiInterestRecommendations,
} from "../content";
import { wikiArticleCopyText } from "../content/wiki-article-export";
import { linkWikiTermsInArticle } from "../content/wiki-term-links";
import type { WikiArticle, WikiNavTrail } from "../types";
import { WikiAdminOnlyBadge } from "../components/WikiAdminOnlyBadge";
import { WikiArticlePreviewLink } from "../components/WikiArticlePreviewLink";
import { WikiLeadVisual } from "../components/WikiLeadVisual";
import { WikiInterestRecommendations } from "../components/WikiInterestRecommendations";
import { WikiFigure, WikiTableFigure } from "../components/WikiMedia";
import { WikiMergedTable } from "../components/WikiMergedTable";
import { WikiSectionBlocks } from "../components/WikiSectionBlocks";
import { wikiSectionBlocks } from "../components/wiki-section-blocks";
import { WikiStatusBadge } from "../components/WikiStatusBadge";
import { WikiEmbedList } from "../embeds/WikiEmbedList";
import { WikiSpotSection } from "../embeds/WikiSpotSection";
import { useCanSeeWikiAdmin } from "../hooks/useWikiAccess";
import type {
  WikiEmbedRef,
  WikiSectionBlock,
  WikiSectionTable,
} from "../types";

const MERMAID_LANG_RE =
  /language-(mermaid|flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|mindmap)\b/i;
const MERMAID_HEAD_RE =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|mindmap)\b/;

function extractCodeText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractCodeText).join("");
  if (isValidElement(node)) {
    return extractCodeText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

export function WikiArticlePage() {
  const { articleSlug = "" } = useParams();
  const canSeeAdmin = useCanSeeWikiAdmin();
  const article = WIKI_ARTICLE_BY_SLUG.get(articleSlug);
  const contentRef = useRef<HTMLElement>(null);

  if (!canViewWikiArticle(article, canSeeAdmin)) {
    return (
      <div className="mx-auto max-w-reading px-6 py-16 text-center">
        <BookOpen className="mx-auto size-icon text-faint" />
        <h1 className="mt-4 font-display text-28 font-bold text-foreground">
          {article ? "词条仅管理员可见" : "词条不存在"}
        </h1>
        <p className="mt-3 text-12 text-muted-foreground">
          {article
            ? "该分类属于内部文档，需要管理员或运营身份才能查看。"
            : "它可能尚未收录，或地址已经发生变化。"}
        </p>
        <Link
          to="/wiki/all"
          className="mt-6 inline-flex items-center gap-1 text-12 font-medium text-brand-red"
        >
          <ArrowLeft className="size-3" /> 返回词条索引
        </Link>
      </div>
    );
  }

  const category = WIKI_CATEGORIES.find(
    (item) => item.slug === article.category,
  );
  const navTrail = articleNavTrail(article.slug);
  const related = relatedArticles(article, canSeeAdmin);
  const recommendations = wikiInterestRecommendations(article, canSeeAdmin);
  const navPath = buildWikiNavPath(article, navTrail, category?.title);
  const pageCopyText = wikiArticleCopyText(article, {
    navPath,
    resolveArticleTitle: (slug) => WIKI_ARTICLE_BY_SLUG.get(slug)?.title,
  });
  const linkedMarkdown = linkWikiTermsInArticle(article);

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
        noindex={category?.adminOnly}
      />

      <div className="mx-auto grid w-full max-w-page grid-cols-1 gap-12 px-6 py-8 md:px-8 md:py-10 xl:grid-cols-[minmax(0,1fr)_var(--rail-w-sm)] xl:px-10">
        <article ref={contentRef} className="wiki-article min-w-0">
          <header className="border-b border-border-hairline pb-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <nav
                className="flex min-w-0 flex-wrap items-center gap-2 text-12 text-muted-foreground"
                aria-label="面包屑"
              >
                <Link to="/wiki" className="hover:text-foreground">
                  Wiki
                </Link>
                <span aria-hidden>/</span>
                {navTrail && (
                  <Link
                    to={firstNavHref(navTrail.category.children) ?? "/wiki"}
                    className="hover:text-foreground"
                  >
                    {navTrail.category.title}
                  </Link>
                )}
                {navTrail?.nodes.slice(0, -1).map((node) => (
                  <span key={node.id} className="contents">
                    <span aria-hidden>/</span>
                    <span>{node.title}</span>
                  </span>
                ))}
                <span aria-hidden>/</span>
                <span className="font-medium text-foreground">
                  {article.title}
                </span>
              </nav>
              <WikiArticleCopyButton text={pageCopyText} />
            </div>

            <div className="mt-6 flex items-start gap-3">
              <BrandLogo
                size="lg"
                variant="mark"
                height={24}
                className="shrink-0"
              />
              <h1 className="min-w-0 font-brand text-32 font-normal leading-display-tight text-foreground">
                {article.title}
              </h1>
            </div>
            <p className="mt-4 text-16 leading-paragraph text-subtle">
              {article.summary}
            </p>
            <WikiLeadVisual articleSlug={article.slug} className="mt-8" />
            {article.headerEmbeds && article.headerEmbeds.length > 0 && (
              <WikiEmbedList embeds={article.headerEmbeds} />
            )}
          </header>

          {article.sections.map((section, sectionIndex) => {
            const chapter = sectionIndex + 1;
            return (
              <section
                key={section.id}
                className="border-b border-border-hairline py-8"
              >
                <h2
                  id={section.id}
                  className="scroll-mt-20 flex items-baseline gap-3 font-serif text-24 font-medium text-foreground"
                >
                  <ChapterNumber value={`${chapter}.`} />
                  <span>{section.title}</span>
                </h2>
                <WikiSectionBody
                  chapter={chapter}
                  title={section.title}
                  markdown={linkedMarkdown[sectionIndex] ?? section.markdown}
                  table={section.table}
                  embeds={section.embeds}
                  blocks={section.blocks}
                />
              </section>
            );
          })}

          {canSeeAdmin && (
            <section className="py-8">
              <h2
                id="sources"
                className="scroll-mt-20 flex items-center gap-3 font-serif text-24 font-medium text-foreground"
              >
                <ChapterNumber value={`${article.sections.length + 1}.`} />
                <span>来源</span>
                <WikiAdminOnlyBadge />
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
          )}

          <WikiInterestRecommendations recommendations={recommendations} />

          <footer className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-border-hairline py-8 text-12 text-muted-foreground">
            <WikiStatusBadge status={article.status} />
            {category?.adminOnly && <WikiAdminOnlyBadge />}
            <span>{WIKI_KIND_LABEL[article.kind]}</span>
            <span>适用：{article.audience.join("、")}</span>
            <span>版本：0.0.80</span>
            <span className="font-mono text-faint">f23d0003</span>
          </footer>
        </article>

        <aside className="hidden border-l border-border-hairline pl-8 xl:block">
          <div className="sticky top-20">
            <TableOfContents
              contentRef={contentRef}
              title="本页目录"
              tone="brand"
            />

            <section className="mt-8 border-t border-border-hairline pt-8">
              <h2
                data-toc-ignore
                className="text-12 font-medium text-foreground"
              >
                相关词条
              </h2>
              {related.length > 0 ? (
                <div className="mt-3 flex flex-col">
                  {related.map((item) => (
                    <Link
                      key={item.slug}
                      to={`/wiki/${item.slug}`}
                      className="group flex items-center justify-between gap-2 py-2 text-12 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span>{item.title}</span>
                      <ArrowRight
                        className="size-3 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
                        aria-hidden
                      />
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

function ChapterNumber({ value }: { value: string }) {
  return (
    <span className="inline-flex shrink-0 select-none font-mono text-20 font-medium tabular-nums text-brand-red">
      {value}
    </span>
  );
}

function buildWikiNavPath(
  article: WikiArticle,
  navTrail: WikiNavTrail | undefined,
  fallbackCategoryTitle?: string,
): string[] {
  const parts = ["Scholay Wiki"];
  if (navTrail) {
    parts.push(navTrail.category.title);
    for (const node of navTrail.nodes.slice(0, -1)) {
      parts.push(node.title);
    }
  } else if (fallbackCategoryTitle) {
    parts.push(fallbackCategoryTitle);
  }
  parts.push(article.title);
  return parts;
}

function WikiArticleCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (!ok) {
      toast.error("复制失败，请手动选择本页正文");
      return;
    }
    setCopied(true);
    toast.success("已复制本页完整内容");
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-flex h-8 shrink-0 items-center gap-2 rounded-8 border border-border bg-surface-card px-3 text-12 font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
      aria-label="复制本页完整内容"
      title="复制本页标题、正文、提示词、Tips 与下一步"
    >
      {copied ? (
        <Check className="size-3.5 text-brand-green" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {copied ? "已复制" : "复制本页"}
    </button>
  );
}

function WikiSectionBody({
  chapter,
  title,
  markdown,
  table,
  embeds,
  blocks,
}: {
  chapter: number;
  title: string;
  markdown: string;
  table?: WikiSectionTable;
  embeds?: WikiEmbedRef[];
  blocks?: WikiSectionBlock[];
}) {
  const hasEmbeds = Boolean(embeds?.length);
  const orderedBlocks = wikiSectionBlocks({ blocks, markdown, table, embeds });

  const body = (
    <WikiSectionBlocks
      blocks={orderedBlocks}
      markdown={markdown}
      table={table}
      embeds={embeds}
      renderers={{
        markdown: (text) => (
          <div data-wiki-prose>
            <WikiSectionMarkdown
              markdown={text}
              chapter={chapter}
              mediaCaption={title}
            />
          </div>
        ),
        table: (value) => (
          <WikiMergedTable
            columns={value.columns}
            rows={value.rows}
            caption={value.caption ?? title}
          />
        ),
        embeds: (value, layout) => (
          <WikiEmbedList embeds={value} layout={layout} />
        ),
      }}
    />
  );

  if (!hasEmbeds) return body;
  return <WikiSpotSection>{body}</WikiSpotSection>;
}

function WikiSectionMarkdown({
  markdown,
  chapter,
  mediaCaption,
}: {
  markdown: string;
  chapter: number;
  mediaCaption: string;
}) {
  if (!markdown.trim()) return null;
  // 单次 Markdown 渲染内按出现顺序编号；h3→1.1，h4→1.1.1
  const counters = { h3: 0, h4: 0 };
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mt-4 text-14 leading-paragraph text-subtle">
            {children}
          </p>
        ),
        h3: ({ children }) => {
          counters.h3 += 1;
          counters.h4 = 0;
          return (
            <h3 className="mt-8 flex scroll-mt-20 items-baseline gap-2 font-serif text-18 font-medium text-foreground">
              <ChapterNumber value={`${chapter}.${counters.h3}`} />
              <span>{children}</span>
            </h3>
          );
        },
        h4: ({ children }) => {
          if (counters.h3 === 0) counters.h3 = 1;
          counters.h4 += 1;
          return (
            <h4 className="mt-6 flex scroll-mt-20 items-baseline gap-2 font-serif text-16 font-medium text-foreground">
              <ChapterNumber
                value={`${chapter}.${counters.h3}.${counters.h4}`}
              />
              <span>{children}</span>
            </h4>
          );
        },
        strong: ({ children }) => (
          <strong className="font-medium text-foreground">{children}</strong>
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
          <code className="rounded-4 border border-border bg-surface-2 px-1 py-1 font-mono text-12 text-foreground">
            {children}
          </code>
        ),
        pre: ({ children }) => {
          if (isValidElement(children)) {
            const cls =
              (children.props as { className?: string }).className ?? "";
            const raw = extractCodeText(
              (children.props as { children?: ReactNode }).children,
            );
            if (MERMAID_LANG_RE.test(cls) || MERMAID_HEAD_RE.test(raw)) {
              return (
                <WikiFigure caption={mediaCaption}>
                  <div className="wiki-light-content w-fit max-w-full overflow-x-auto rounded-8 border border-border-hairline p-4 [&_svg]:max-h-[36rem]">
                    <MermaidDiagram code={raw} />
                  </div>
                </WikiFigure>
              );
            }
          }
          return (
            <pre className="mt-4 overflow-x-auto rounded-8 border border-border bg-surface-1 p-3 font-mono text-12 leading-code text-foreground">
              {children}
            </pre>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="mt-6 border-l-2 border-brand-red px-4 py-3 text-14 leading-paragraph text-muted-foreground">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <WikiTableFigure caption={mediaCaption}>
            <table className="wiki-three-line text-12">{children}</table>
          </WikiTableFigure>
        ),
        th: ({ children }) => (
          <th className="font-medium text-foreground">{children}</th>
        ),
        td: ({ children }) => (
          <td className="align-top leading-paragraph text-subtle">
            {children}
          </td>
        ),
        a: ({ children, href }) =>
          href?.startsWith("/wiki/") ? (
            <WikiArticlePreviewLink href={href}>
              {children}
            </WikiArticlePreviewLink>
          ) : (
            <a
              href={href}
              className="text-brand-red underline underline-offset-4"
            >
              {children}
            </a>
          ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
