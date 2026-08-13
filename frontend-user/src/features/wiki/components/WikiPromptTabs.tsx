import { Check, Copy } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import type { WikiPromptGroup } from "../types";

export function WikiPromptTabs({ group }: { group: WikiPromptGroup }) {
  const instanceId = useId();
  const initialId =
    group.options.find((option) => option.id === group.defaultOptionId)?.id ??
    group.options[0]?.id ??
    "";
  const [activeId, setActiveId] = useState(initialId);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);
  const active =
    group.options.find((option) => option.id === activeId) ?? group.options[0];

  useEffect(
    () => () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  if (!active) return null;

  const handleCopy = async () => {
    const ok = await copyToClipboard(active.prompt);
    if (!ok) {
      toast.error("复制失败，请手动选择提示词");
      return;
    }
    setCopied(true);
    toast.success(`已复制“${active.label}”提示词`);
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="mt-6" aria-labelledby={`${instanceId}-title`}>
      <h3
        id={`${instanceId}-title`}
        data-toc-ignore
        className="text-14 font-medium text-foreground"
      >
        {group.title}
      </h3>
      {group.description && (
        <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
          {group.description}
        </p>
      )}

      <Tabs
        value={active.id}
        onValueChange={(value) => {
          setActiveId(value);
          setCopied(false);
        }}
        className="mt-4"
      >
        <div className="max-w-full overflow-x-auto rounded-12 bg-surface-1 p-1">
          <TabsList
            aria-label={`${group.title}场景`}
            className="h-auto min-w-max border-0"
          >
            {group.options.map((option) => (
              <TabsTrigger
                key={option.id}
                value={option.id}
                className="h-10 rounded-8 border border-transparent px-4 data-[state=active]:border-border-strong data-[state=active]:bg-surface-card data-[state=active]:shadow-raised data-[state=active]:after:hidden focus-visible:border-border-strong"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {group.options.map((option) => (
          <TabsContent
            key={option.id}
            value={option.id}
            className="overflow-hidden rounded-12 border border-border bg-surface-1"
          >
            <div className="flex items-center justify-between gap-4 border-b border-border-hairline px-4 py-3">
              <span className="text-12 font-medium text-muted-foreground">
                {option.label} · 可直接复制后修改
              </span>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-8 border border-border bg-surface-card text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:border-border-strong focus-visible:text-foreground"
                aria-label={
                  copied
                    ? `已复制“${option.label}”提示词`
                    : `复制“${option.label}”提示词`
                }
              >
                {copied ? (
                  <Check className="size-4 text-brand-green" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
              </button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono text-12 leading-code text-foreground">
              <code>{option.prompt}</code>
            </pre>
          </TabsContent>
        ))}
      </Tabs>
      <span className="sr-only" aria-live="polite">
        {copied ? `已复制“${active.label}”提示词` : ""}
      </span>
    </section>
  );
}
