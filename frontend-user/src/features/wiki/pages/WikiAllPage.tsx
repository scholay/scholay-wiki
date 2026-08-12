import { SearchX } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { RouteSEO } from "@/shared/components/RouteSEO";
import { cn } from "@/shared/lib/utils";
import {
  WIKI_ARTICLES,
  WIKI_KIND_LABEL,
  WIKI_STATUS_LABEL,
  searchWikiArticles,
} from "../content";
import type { WikiArticleKind, WikiArticleStatus } from "../types";
import { WikiArticleCard } from "../components/WikiArticleCard";
import { WikiSearchForm } from "../components/WikiSearchForm";

const KINDS = Object.keys(WIKI_KIND_LABEL) as WikiArticleKind[];
const STATUSES = Object.keys(WIKI_STATUS_LABEL) as WikiArticleStatus[];

export function WikiAllPage() {
  const [params] = useSearchParams();
  const query = params.get("q") ?? "";
  const rawKind = params.get("kind");
  const kind = KINDS.includes(rawKind as WikiArticleKind)
    ? (rawKind as WikiArticleKind)
    : null;
  const rawStatus = params.get("status");
  const status = STATUSES.includes(rawStatus as WikiArticleStatus)
    ? (rawStatus as WikiArticleStatus)
    : null;
  const searched = searchWikiArticles(query);
  const results = searched.filter(
    (article) =>
      (!kind || article.kind === kind) &&
      (!status || article.status === status),
  );

  return (
    <>
      <RouteSEO
        title={
          query
            ? `${query}：Wiki 搜索结果 | Scholay`
            : "全部词条 | Scholay Wiki"
        }
        description="浏览并搜索 Scholay 的全部产品页面、功能、规则、实体与架构词条。"
        keywords="Scholay Wiki,Scholay 功能索引,Scholay 规则"
        noindex={Boolean(query)}
      />
      <section className="border-b border-border bg-surface-1">
        <div className="mx-auto max-w-page px-6 py-10 md:py-14">
          <p className="text-12 font-medium text-brand-red">COMPLETE INDEX</p>
          <h1 className="mt-2 font-display text-32 font-bold leading-display-tight text-foreground">
            全部词条
          </h1>
          <p className="mt-3 max-w-reading text-14 leading-paragraph text-muted-foreground">
            搜索产品名、页面、用户动作、业务对象或规则。结果会同时匹配标题、别名、摘要与正文。
          </p>
          <div className="mt-6">
            <WikiSearchForm initialValue={query} prominent />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-page px-6 py-10 md:py-14">
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="按词条类型筛选"
        >
          <Link
            to={indexHref(query, null, status)}
            aria-current={!kind ? "page" : undefined}
            className={filterClass(!kind)}
          >
            全部 {WIKI_ARTICLES.length}
          </Link>
          {KINDS.map((item) => {
            const count = WIKI_ARTICLES.filter(
              (article) => article.kind === item,
            ).length;
            if (count === 0) return null;
            return (
              <Link
                key={item}
                to={indexHref(query, item, status)}
                aria-current={kind === item ? "page" : undefined}
                className={filterClass(kind === item)}
              >
                {WIKI_KIND_LABEL[item]} {count}
              </Link>
            );
          })}
        </div>

        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          aria-label="按词条状态筛选"
        >
          <Link
            to={indexHref(query, kind, null)}
            aria-current={!status ? "page" : undefined}
            className={filterClass(!status)}
          >
            全部状态
          </Link>
          {STATUSES.map((item) => {
            const count = WIKI_ARTICLES.filter(
              (article) => article.status === item,
            ).length;
            if (count === 0) return null;
            return (
              <Link
                key={item}
                to={indexHref(query, kind, item)}
                aria-current={status === item ? "page" : undefined}
                className={filterClass(status === item)}
              >
                {WIKI_STATUS_LABEL[item]} {count}
              </Link>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-12 text-muted-foreground">
            {query
              ? `“${query}”找到 ${results.length} 篇`
              : `显示 ${results.length} 篇词条`}
          </p>
          {(query || kind || status) && (
            <Link
              to="/wiki/all"
              className="text-12 font-medium text-brand-red hover:underline"
            >
              清除筛选
            </Link>
          )}
        </div>

        {results.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {results.map((article) => (
              <WikiArticleCard key={article.slug} article={article} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-16 border border-border bg-surface-card p-8 text-center">
            <SearchX className="mx-auto size-icon text-faint" />
            <p className="mt-4 font-serif text-18 font-medium text-foreground">
              没有找到对应词条
            </p>
            <p className="mt-2 text-12 text-muted-foreground">
              试试功能名、页面名，或更短的关键词。
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function indexHref(
  query: string,
  kind: WikiArticleKind | null,
  status: WikiArticleStatus | null,
): string {
  const next = new URLSearchParams();
  if (query) next.set("q", query);
  if (kind) next.set("kind", kind);
  if (status) next.set("status", status);
  const suffix = next.toString();
  return suffix ? `/wiki/all?${suffix}` : "/wiki/all";
}

function filterClass(active: boolean): string {
  return cn(
    "inline-flex h-control-sm items-center rounded-pill border px-3 text-12 font-medium transition-colors",
    active
      ? "border-brand-red bg-brand-red-soft text-brand-red"
      : "border-border bg-surface-card text-muted-foreground hover:border-border-strong hover:text-foreground",
  );
}
