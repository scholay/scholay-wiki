import { useState } from "react";
import { BookOpen, FlaskConical, X } from "lucide-react";
import { useHotkey } from "@/shared/hooks/useHotkey";
import { canAccessAdmin, useAuthStore } from "@/stores/auth.store";
import { firstNavHref, WIKI_NAV_CATEGORIES } from "../content";
import {
  useWikiDevStore,
  type WikiAudiencePreview,
} from "../stores/wiki-dev.store";

const PANEL_COLLAPSED_KEY = "scholay.wiki.panelCollapsed";
const PANEL_HIDDEN_KEY = "scholay.wiki.panelHidden";

const firstCategoryHref = (slug: string) =>
  firstNavHref(
    WIKI_NAV_CATEGORIES.find((category) => category.slug === slug)?.children ??
      [],
  ) ?? "/wiki";

const routes = [
  ["简介", "/wiki/scholay"],
  ["索引", "/wiki/all"],
  ["来源", "/wiki/sources"],
  ["覆盖", "/wiki/coverage"],
  ["其他", firstCategoryHref("other")],
  ["开发计划", firstCategoryHref("roadmap")],
] as const;

/** DEV 面板：深底 + 松青描边，与站内控件刻意区分，但仍走设计 token。 */
const shell = "font-mono text-12 leading-snug text-on-dark shadow-overlay";
const field =
  "h-8 w-full cursor-pointer rounded-4 border border-brand-green/30 bg-foreground/80 px-2 text-12 text-on-dark focus-visible:border-brand-green";
const label = "mb-1 block text-12 font-medium uppercase text-brand-green";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

export function WikiDevPanel() {
  const [collapsed, setCollapsed] = useState(() =>
    readFlag(PANEL_COLLAPSED_KEY),
  );
  const [hidden, setHidden] = useState(() => readFlag(PANEL_HIDDEN_KEY));
  const audiencePreview = useWikiDevStore((state) => state.audiencePreview);
  const setAudiencePreview = useWikiDevStore(
    (state) => state.setAudiencePreview,
  );
  const role = useAuthStore((state) => state.user?.role);
  const realAdmin = canAccessAdmin(role);

  const setPanelCollapsed = (value: boolean) => {
    setCollapsed(value);
    writeFlag(PANEL_COLLAPSED_KEY, value);
  };

  const togglePanelHidden = () => {
    setHidden((prev) => {
      const next = !prev;
      writeFlag(PANEL_HIDDEN_KEY, next);
      return next;
    });
  };

  useHotkey("mod+shift+m", togglePanelHidden);

  if (!import.meta.env.DEV) return null;
  if (hidden) return null;

  const previewLabel =
    audiencePreview === "auto"
      ? realAdmin
        ? "auto · admin"
        : "auto · public"
      : audiencePreview;

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="展开 Wiki 开发面板"
        onClick={() => setPanelCollapsed(false)}
        className={`${shell} fixed bottom-3 right-3 z-fx inline-flex h-8 cursor-pointer items-center gap-2 rounded-4 border border-dashed border-brand-green/60 bg-foreground px-3 uppercase hover:border-brand-green`}
      >
        <span className="inline-flex size-1.5 animate-pulse rounded-pill bg-brand-green" />
        <FlaskConical className="size-3.5 text-brand-green" strokeWidth={2} />
        <span className="text-brand-green">DEV</span>
        <span className="text-on-dark/40">|</span>
        <span>WIKI · {previewLabel}</span>
      </button>
    );
  }

  return (
    <aside
      className={`${shell} fixed bottom-3 right-3 z-fx w-80 rounded-4 border border-dashed border-brand-green/50 bg-foreground p-3`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-brand-green/20 pb-2">
        <div>
          <div className="flex items-center gap-2 font-medium uppercase text-brand-green">
            <span className="inline-flex size-1.5 animate-pulse rounded-pill bg-brand-green" />
            <BookOpen className="size-3.5 text-brand-green" strokeWidth={2} />
            DEV · WIKI BOARD
          </div>
          <p className="mt-2 normal-case text-on-dark/50">
            wiki authoring · mod+shift+M hide
          </p>
        </div>
        <button
          type="button"
          aria-label="收起 Wiki 开发面板"
          onClick={() => setPanelCollapsed(true)}
          className="cursor-pointer rounded-4 p-1 text-brand-green/70 hover:bg-brand-green/10 hover:text-on-dark"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mt-3">
        <label htmlFor="wiki-audience-preview" className={label}>
          Audience preview
        </label>
        <select
          id="wiki-audience-preview"
          value={audiencePreview}
          onChange={(event) =>
            setAudiencePreview(event.target.value as WikiAudiencePreview)
          }
          className={field}
        >
          <option value="auto">
            auto · 跟随登录态（当前 {realAdmin ? "管理员" : "公开"}）
          </option>
          <option value="public">public · 强制公开视图</option>
          <option value="admin">admin · 强制管理员视图</option>
        </select>
      </div>

      <p className="mt-2 normal-case text-on-dark/45">
        「其他」中的管理后台与技术实现仅管理员可见。预览覆盖不改真实 token。
      </p>

      <nav aria-label="Wiki 快速跳转" className="mt-3 flex flex-wrap gap-1">
        {routes.map(([labelText, href]) => (
          <a
            key={href}
            href={href}
            className="cursor-pointer rounded-4 border border-brand-green/25 bg-foreground px-2 py-1 uppercase text-on-dark/70 hover:border-brand-green/50 hover:bg-brand-green/10 hover:text-on-dark"
          >
            {labelText}
          </a>
        ))}
      </nav>
    </aside>
  );
}
