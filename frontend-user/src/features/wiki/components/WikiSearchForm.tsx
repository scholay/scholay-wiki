import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowRight, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { isModifiedClick } from "@/shared/hooks";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { searchWikiArticles } from "../content";
import { useCanSeeWikiAdmin } from "../hooks/useWikiAccess";
import type { WikiArticle } from "../types";

const SUGGESTION_LIMIT = 6;

export function WikiSearchForm({
  initialValue = "",
  prominent = false,
  compact = false,
  className,
}: {
  initialValue?: string;
  prominent?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const canSeeAdmin = useCanSeeWikiAdmin();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState("70dvh");

  useEffect(() => setQuery(initialValue), [initialValue]);

  const trimmed = query.trim();
  const matches = useMemo(
    () =>
      trimmed
        ? searchWikiArticles(trimmed, canSeeAdmin).slice(0, SUGGESTION_LIMIT)
        : [],
    [trimmed, canSeeAdmin],
  );
  const showSuggestions = focused && trimmed.length >= 1;
  const indexHref = `/wiki/all?q=${encodeURIComponent(trimmed)}`;

  const goToIndex = (value: string) => {
    setFocused(false);
    navigate(value ? `/wiki/all?q=${encodeURIComponent(value)}` : "/wiki/all");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    goToIndex(trimmed);
  };

  useEffect(() => {
    if (!showSuggestions) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setFocused(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [showSuggestions]);

  useEffect(() => {
    if (!showSuggestions) return;
    const recalc = () => {
      const el = rootRef.current;
      if (!el) return;
      const available =
        window.innerHeight - el.getBoundingClientRect().bottom - 24;
      setDropdownMaxHeight(`${Math.max(160, available)}px`);
    };
    recalc();
    window.addEventListener("resize", recalc);
    let observer: ResizeObserver | null = null;
    if (rootRef.current && "ResizeObserver" in window) {
      observer = new ResizeObserver(recalc);
      observer.observe(rootRef.current);
    }
    return () => {
      window.removeEventListener("resize", recalc);
      observer?.disconnect();
    };
  }, [showSuggestions]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <form
        role="search"
        aria-label="搜索 Scholay Wiki"
        aria-expanded={showSuggestions}
        onSubmit={submit}
        className={cn(
          "flex w-full items-center border bg-inherit transition-colors",
          compact
            ? "h-control-md gap-2 rounded-8 px-3"
            : "gap-2 rounded-12 p-2",
          prominent && !compact && "max-w-3xl",
          showSuggestions
            ? "border-foreground"
            : "border-border focus-within:border-foreground",
        )}
      >
        {compact ? (
          <button
            type="submit"
            className="inline-flex size-5 shrink-0 items-center justify-center text-faint transition-colors hover:text-foreground"
            aria-label="提交搜索"
          >
            <Search className="size-4" aria-hidden />
          </button>
        ) : (
          <Search
            className="ml-2 size-icon-inline shrink-0 text-faint"
            aria-hidden
          />
        )}
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setFocused(false);
          }}
          placeholder="搜索功能、页面、规则或概念"
          aria-label="搜索词条"
          autoComplete="off"
          className={cn(
            "flex-1 border-0 bg-transparent shadow-none",
            compact ? "h-control-md px-0 text-12" : "h-control-xl px-2",
          )}
        />
        {!compact && (
          <Button
            type="submit"
            className="h-control-xl shrink-0 rounded-8 px-4"
          >
            搜索
          </Button>
        )}
      </form>

      {showSuggestions && (
        <div
          className="absolute top-full right-0 left-0 z-popover mt-2 overflow-y-auto rounded-12 border border-border bg-surface-card shadow-overlay animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ maxHeight: dropdownMaxHeight }}
        >
          {matches.length > 0 && (
            <ul className="p-1">
              {matches.map((article) => (
                <li key={article.slug}>
                  <SuggestionRow
                    article={article}
                    query={trimmed}
                    onPick={() => setFocused(false)}
                  />
                </li>
              ))}
            </ul>
          )}

          <Link
            to={indexHref}
            onClick={(event) => {
              if (isModifiedClick(event)) return;
              setFocused(false);
            }}
            className="group flex items-center justify-between gap-3 border-t border-border-hairline px-4 py-3 text-12 font-medium text-brand-red"
          >
            <span className="min-w-0 truncate">
              {matches.length > 0
                ? `在索引中查看 “${trimmed}”`
                : `在索引中搜索 “${trimmed}”`}
            </span>
            <ArrowRight className="size-3 shrink-0 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  article,
  query,
  onPick,
}: {
  article: WikiArticle;
  query: string;
  onPick: () => void;
}) {
  return (
    <Link
      to={`/wiki/${article.slug}`}
      onClick={(event) => {
        if (isModifiedClick(event)) return;
        onPick();
      }}
      className="group flex items-center gap-3 rounded-8 px-3 py-2 transition-colors hover:bg-surface-1"
    >
      <span className="min-w-0 flex-1 truncate font-serif text-14 font-medium text-foreground">
        {highlightQuery(article.title, query)}
      </span>
      <ArrowRight className="size-3 shrink-0 text-brand-red opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
    </Link>
  );
}

function highlightQuery(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text
    .toLocaleLowerCase("zh-CN")
    .indexOf(query.toLocaleLowerCase("zh-CN"));
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-brand-red-soft text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
