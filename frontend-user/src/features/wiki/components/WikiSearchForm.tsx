import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

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
  const [query, setQuery] = useState(initialValue);

  useEffect(() => setQuery(initialValue), [initialValue]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/wiki/all?q=${encodeURIComponent(value)}` : "/wiki/all");
  };

  return (
    <form
      role="search"
      aria-label="搜索 Scholay Wiki"
      onSubmit={submit}
      className={cn(
        "flex items-center border border-border bg-surface-card focus-within:border-foreground",
        compact
          ? "h-control-md w-full gap-2 rounded-8 px-3"
          : "gap-2 rounded-12 p-2",
        prominent && !compact && "max-w-3xl",
        className,
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
        placeholder="搜索功能、页面、规则或概念"
        aria-label="搜索词条"
        className={cn(
          "flex-1 border-0 bg-transparent shadow-none",
          compact ? "h-control-md px-0 text-12" : "h-control-xl px-2",
        )}
      />
      {!compact && (
        <Button type="submit" className="h-control-xl shrink-0 rounded-8 px-4">
          搜索
        </Button>
      )}
    </form>
  );
}
