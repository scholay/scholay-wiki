import { ChevronDown, ChevronRight, CornerDownRight, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import {
  articleNavTrail,
  navHref,
  visibleArticles,
  visibleNavCategories,
} from "../content";
import { useCanSeeWikiAdmin } from "../hooks/useWikiAccess";
import type { WikiArticle, WikiNavCategory, WikiNavNode } from "../types";

interface WikiDocsNavProps {
  activeArticle?: WikiArticle;
  activeCategory?: WikiNavCategory;
  mobile?: boolean;
  onNavigate?: () => void;
}

export function WikiDocsNav({
  activeArticle,
  activeCategory,
  mobile = false,
  onNavigate,
}: WikiDocsNavProps) {
  const { pathname } = useLocation();
  const canSeeAdmin = useCanSeeWikiAdmin();
  const categories = visibleNavCategories(canSeeAdmin);
  const articles = visibleArticles(canSeeAdmin);
  const activeArticleSlug = activeArticle?.slug;
  const trail = useMemo(
    () => (activeArticleSlug ? articleNavTrail(activeArticleSlug) : undefined),
    [activeArticleSlug],
  );
  const currentCategory = activeCategory ?? trail?.category.slug;
  const activeNodeIds = useMemo(
    () => new Set(trail?.nodes.map((node) => node.id) ?? []),
    [trail],
  );
  const [expandedCategories, setExpandedCategories] = useState<
    Set<WikiNavCategory>
  >(() => new Set(currentCategory ? [currentCategory] : ["overview"]));
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    () => new Set(activeNodeIds),
  );
  const idPrefix = mobile ? "wiki-mobile" : "wiki-desktop";

  useEffect(() => {
    if (!currentCategory) return;
    setExpandedCategories((current) => new Set(current).add(currentCategory));
  }, [currentCategory]);

  useEffect(() => {
    if (activeNodeIds.size === 0) return;
    setExpandedNodes((current) => {
      const next = new Set(current);
      for (const id of activeNodeIds) next.add(id);
      return next;
    });
  }, [activeNodeIds]);

  const linkSpacing = mobile ? "min-h-11 py-3" : "py-2";

  return (
    <nav
      aria-label={mobile ? "Wiki 移动导航" : "Wiki 文档导航"}
      className="text-12"
    >
      {activeArticle && mobile && (
        <section className="mb-6 border-b border-border-hairline pb-6">
          <p className="px-3 font-medium text-foreground">本页目录</p>
          <div className="mt-2 flex flex-col">
            {activeArticle.sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={onNavigate}
                className="flex min-h-11 items-center border-l-2 border-transparent px-3 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                <span className="mr-2 shrink-0 font-mono font-medium tabular-nums text-brand-red">
                  {index + 1}.
                </span>
                {section.title}
              </a>
            ))}
            <a
              href="#sources"
              onClick={onNavigate}
              className="flex min-h-11 items-center border-l-2 border-transparent px-3 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              <span className="mr-2 shrink-0 font-mono font-medium tabular-nums text-brand-red">
                {activeArticle.sections.length + 1}.
              </span>
              来源
            </a>
          </div>
        </section>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between px-3">
          <p className="font-medium text-foreground">Scholay Wiki</p>
          <span className="text-faint">{articles.length}</span>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <Link
            to="/wiki"
            onClick={onNavigate}
            aria-current={pathname === "/wiki" ? "page" : undefined}
            className={indexLinkClass(pathname === "/wiki", linkSpacing)}
          >
            Wiki 总览
          </Link>
          <Link
            to="/wiki/all"
            onClick={onNavigate}
            aria-current={pathname === "/wiki/all" ? "page" : undefined}
            className={indexLinkClass(pathname === "/wiki/all", linkSpacing)}
          >
            全部词条
          </Link>
          <Link
            to="/wiki/sources"
            onClick={onNavigate}
            aria-current={pathname === "/wiki/sources" ? "page" : undefined}
            className={indexLinkClass(
              pathname === "/wiki/sources",
              linkSpacing,
            )}
          >
            来源索引
          </Link>
          <Link
            to="/wiki/coverage"
            onClick={onNavigate}
            aria-current={pathname === "/wiki/coverage" ? "page" : undefined}
            className={indexLinkClass(
              pathname === "/wiki/coverage",
              linkSpacing,
            )}
          >
            覆盖核验
          </Link>
        </div>
      </div>

      <div className="space-y-1">
        {categories.map((category) => {
          const expanded = expandedCategories.has(category.slug);
          const current = currentCategory === category.slug;
          const regionId = `${idPrefix}-category-${category.slug}`;

          return (
            <section key={category.slug}>
              <div className="flex items-center gap-1">
                <Link
                  to={`/wiki/category/${category.slug}`}
                  onClick={onNavigate}
                  className={cn(
                    "min-w-0 flex-1 px-3 font-medium transition-colors hover:text-foreground",
                    linkSpacing,
                    current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate">{category.title}</span>
                    <span className="shrink-0 font-normal text-faint">
                      {countTargets(category.children)}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={regionId}
                  aria-label={`${expanded ? "收起" : "展开"}${category.title}`}
                  onClick={() =>
                    setExpandedCategories((previous) => {
                      const next = new Set(previous);
                      if (next.has(category.slug)) next.delete(category.slug);
                      else next.add(category.slug);
                      return next;
                    })
                  }
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center rounded-8 text-faint transition-colors hover:bg-foreground/5 hover:text-foreground",
                    mobile ? "size-11" : "size-8",
                  )}
                >
                  {expanded ? (
                    <ChevronDown className="size-3.5" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3.5" aria-hidden />
                  )}
                </button>
              </div>

              {expanded && (
                <ul
                  id={regionId}
                  className="ml-3 border-l border-border-hairline py-1"
                >
                  {category.children.map((node) => (
                    <WikiNavBranch
                      key={node.id}
                      node={node}
                      depth={0}
                      activeArticleSlug={activeArticle?.slug}
                      activeNodeIds={activeNodeIds}
                      expandedNodes={expandedNodes}
                      setExpandedNodes={setExpandedNodes}
                      linkSpacing={linkSpacing}
                      mobile={mobile}
                      onNavigate={onNavigate}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-6 border-t border-border-hairline pt-4">
        <Link
          to="/"
          onClick={onNavigate}
          className={cn(
            "block px-3 text-muted-foreground transition-colors hover:text-foreground",
            linkSpacing,
          )}
        >
          返回 Scholay
        </Link>
      </div>
    </nav>
  );
}

interface WikiNavBranchProps {
  node: WikiNavNode;
  depth: number;
  activeArticleSlug?: string;
  activeNodeIds: Set<string>;
  expandedNodes: Set<string>;
  setExpandedNodes: (update: (previous: Set<string>) => Set<string>) => void;
  linkSpacing: string;
  mobile: boolean;
  onNavigate?: () => void;
}

function WikiNavBranch({
  node,
  depth,
  activeArticleSlug,
  activeNodeIds,
  expandedNodes,
  setExpandedNodes,
  linkSpacing,
  mobile,
  onNavigate,
}: WikiNavBranchProps) {
  const href = navHref(node);
  const hasChildren = Boolean(node.children?.length);
  const expanded = expandedNodes.has(node.id);
  const isPrimaryActive = activeNodeIds.has(node.id);
  const isTargetActive = node.target?.articleSlug === activeArticleSlug;
  const paddingLeft = 12 + depth * 14;
  const regionId = `wiki-nav-${node.id}`;

  return (
    <li>
      <div className="flex items-stretch">
        {href ? (
          <Link
            to={href}
            onClick={onNavigate}
            aria-current={isTargetActive ? "page" : undefined}
            className={cn(
              "-ml-px flex min-w-0 flex-1 items-center gap-2 border-l-2 pr-2 transition-colors",
              linkSpacing,
              isTargetActive
                ? "border-brand-red bg-surface-card font-medium text-brand-red"
                : isPrimaryActive
                  ? "border-border-strong text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
            style={{ paddingLeft }}
          >
            {node.target?.shortcut && (
              <CornerDownRight className="size-3 shrink-0 text-faint" />
            )}
            <span className="min-w-0 flex-1 leading-snug">{node.title}</span>
            {node.adminOnly && (
              <Lock className="size-3 shrink-0 text-brand-amber" aria-hidden />
            )}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() =>
              hasChildren &&
              setExpandedNodes((previous) => toggleSet(previous, node.id))
            }
            className={cn(
              "-ml-px flex min-w-0 flex-1 items-center border-l-2 pr-2 text-left transition-colors",
              linkSpacing,
              isPrimaryActive
                ? "border-border-strong font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
            style={{ paddingLeft }}
          >
            <span className="min-w-0 flex-1 leading-snug">{node.title}</span>
            {node.adminOnly && (
              <Lock className="size-3 shrink-0 text-brand-amber" aria-hidden />
            )}
          </button>
        )}

        {hasChildren && href && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={regionId}
            aria-label={`${expanded ? "收起" : "展开"}${node.title}`}
            onClick={() =>
              setExpandedNodes((previous) => toggleSet(previous, node.id))
            }
            className={cn(
              "inline-flex shrink-0 items-center justify-center text-faint hover:bg-foreground/5 hover:text-foreground",
              mobile ? "w-11" : "w-8",
            )}
          >
            {expanded ? (
              <ChevronDown className="size-3" aria-hidden />
            ) : (
              <ChevronRight className="size-3" aria-hidden />
            )}
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <ul id={regionId}>
          {node.children?.map((child) => (
            <WikiNavBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              activeArticleSlug={activeArticleSlug}
              activeNodeIds={activeNodeIds}
              expandedNodes={expandedNodes}
              setExpandedNodes={setExpandedNodes}
              linkSpacing={linkSpacing}
              mobile={mobile}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function toggleSet(previous: Set<string>, value: string): Set<string> {
  const next = new Set(previous);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function countTargets(nodes: WikiNavNode[]): number {
  const targets = new Set<string>();
  const visit = (items: WikiNavNode[]) => {
    for (const item of items) {
      if (item.target && item.target.shortcut !== true) {
        targets.add(item.target.articleSlug);
      }
      if (item.children) visit(item.children);
    }
  };
  visit(nodes);
  return targets.size;
}

function indexLinkClass(active: boolean, spacing: string): string {
  return cn(
    "border-l-2 px-3 transition-colors",
    spacing,
    active
      ? "border-brand-red bg-surface-card font-medium text-brand-red"
      : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
  );
}
