import { useEffect, useRef } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, FileText, Plus, User, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  paperTabKey,
  journalTabKey,
  authorTabKey,
  pdfTabKey,
  browserTabUrl,
  useBrowserTabs,
  type BrowserTab,
} from '@/stores/browser-tabs.store';
import { QuickOpenPaperDialog } from './QuickOpenPaperDialog';

/**
 * 浏览器顶部页签条 —— 对照 .pen `K3BxA`,支持 paper + journal + author 三种 tab。
 *
 *   ┌─ h-tab px-4 bg-background ──────────────────────────────────┐
 *   │ ← 返回 │  📄 paper-active × │ 📖 journal × │ ...               │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Active tab 由 URL 决定(useMatch 三个 pattern),store 只是数据载体。
 * 关闭 active tab → 自动跳右邻居 / 左邻居,任意 kind 通用。
 * MAX_TABS=30 上限由 store 的 evictIfFull 静默挤掉最早一项(队列语义),
 * 不在 UI 上展示计数 —— 用户感知"无限"。
 */
export function BrowserTabsBar() {
  const navigate = useNavigate();
  const tabs = useBrowserTabs((s) => s.tabs);
  const closeTab = useBrowserTabs((s) => s.closeTab);
  // 横向滚动容器 —— activeTab 变化时自动 scrollIntoView,确保选中 tab 始终可见
  const scrollRef = useRef<HTMLDivElement>(null);

  // 四路由匹配(canonical 无 /browser 前缀)
  const paperMatch = useMatch('/paper/:source/:paperId');
  // /journal/:id 和 /journal/:id/:slug 都映射到同一 journal tab (slug 仅 SEO)
  const journalMatch = useMatch('/journal/:id/*');
  const authorMatch = useMatch('/author/:source/:authorId');
  const pdfMatch = useMatch('/pdf/:libPaperId');

  const activeTabId = paperMatch
    ? paperTabKey(
        paperMatch.params.source!,
        decodeURIComponent(paperMatch.params.paperId!)
      )
    : journalMatch
      ? journalTabKey(Number(journalMatch.params.id))
      : authorMatch
        ? authorTabKey(
            authorMatch.params.source!,
            decodeURIComponent(authorMatch.params.authorId!)
          )
        : pdfMatch
          ? pdfTabKey(Number(pdfMatch.params.libPaperId))
          : null;

  const activeTab = activeTabId
    ? tabs.find((t) => t.id === activeTabId)
    : null;

  // 切换 active tab(或新开 tab)时,把它滚到可见位置。
  // - inline 'nearest':已在视窗内就不动,在外才滚最少距离对齐
  // - block 'nearest':防止外层 window 误滚
  // - useEffect 依赖 activeTabId + tabs.length:新开 tab(总数变)+ 路由变都触发
  useEffect(() => {
    if (!activeTabId) return;
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(activeTabId)}"]`
    );
    if (!el) return;
    el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTabId, tabs.length]);

  if (tabs.length === 0) return null;

  const goReturn = () => {
    const returnTo = activeTab?.returnTo ?? '/';
    const safe = returnTo.startsWith('/') ? returnTo : '/';
    navigate(safe);
  };

  const handleClose = (tab: BrowserTab, e: React.MouseEvent) => {
    e.stopPropagation();
    const wasActive = activeTabId === tab.id;
    closeTab(tab.id);

    if (wasActive) {
      const nextActive = useBrowserTabs.getState().activeTabId;
      if (nextActive) {
        const next = useBrowserTabs
          .getState()
          .tabs.find((t) => t.id === nextActive);
        if (next) {
          navigate(browserTabUrl(next));
          return;
        }
      }
      // 全部关完 → 回首页(浏览器入口本身只有 tabs 才能进,空就回家)
      navigate('/');
    }
  };

  return (
    <div
      // h-tab(42px,globals.css --spacing-tab):统一 tab 条高度
      className="flex items-center gap-3 h-tab px-4 bg-background border-b border-border-soft shrink-0"
      role="tablist"
      aria-label="浏览器页签"
    >
      <button
        type="button"
        onClick={goReturn}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-8 text-12 text-muted-foreground hover:bg-surface-1 hover:text-foreground transition-colors shrink-0"
        title={activeTab ? `返回 ${activeTab.returnTo}` : '返回'}
      >
        <ArrowLeft className="size-3" />
        返回
      </button>

      {/* 组间竖线 —— 与顶栏 TopNav / MenuCarousel 同一形制。globals.css 的 `--divider`
          条目原文就是「Nav/Toolbar 内组间竖线(h-5 w-px)」,这里按它落地:
          高度从无依据的 `h-[18px]` 归到 h-5,颜色从通用容器色 bg-border 收口到 bg-divider。 */}
      <span aria-hidden className="h-5 w-px bg-divider" />

      <div
        ref={scrollRef}
        className="flex items-center gap-0.5 flex-1 min-w-0 h-full overflow-x-auto overflow-y-hidden scrollbar-none"
      >
        {tabs.map((t) => (
          <TabPill
            key={t.id}
            tab={t}
            active={activeTabId === t.id}
            onClick={() => navigate(browserTabUrl(t))}
            onClose={(e) => handleClose(t, e)}
          />
        ))}
      </div>

      {/* "+" 新页签 —— **常驻在 tabs 条最右**,不随 tab 滚动而消失;
          QuickOpenPaperDialog 是 anchored popover,弹层从按钮下方弹出
          (align='end' 紧贴右侧),选论文 → 直接打开详情(不收藏) */}
      <QuickOpenPaperDialog align="end">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-8 text-muted-foreground hover:bg-surface-1 hover:text-foreground transition-colors shrink-0"
          title="新建详情页签"
          aria-label="新建详情页签"
        >
          <Plus className="size-3.5" strokeWidth={2.25} />
        </button>
      </QuickOpenPaperDialog>
    </div>
  );
}

// ============================================================================

interface TabPillProps {
  tab: BrowserTab;
  active: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function TabPill({ tab, active, onClick, onClose }: TabPillProps) {
  // 用 discriminated union 安全取出 label / icon
  const label =
    tab.kind === 'paper'
      ? tab.paper.title || '无标题'
      : tab.kind === 'journal'
        ? tab.journal.canonical_name || '无名期刊'
        : tab.kind === 'author'
          ? tab.author.name || '未知作者'
          : `PDF · ${tab.title || '无标题'}`;
  const Icon =
    tab.kind === 'paper'
      ? FileText
      : tab.kind === 'journal'
        ? BookOpen
        : tab.kind === 'author'
          ? User
          : FileText;
  // active 时各 kind 不同的 accent 色:论文黑、期刊蓝、学者绿、pdf 红
  const activeIconColor =
    tab.kind === 'paper'
      ? 'text-foreground'
      : tab.kind === 'journal'
        ? 'text-brand-amber'
        : tab.kind === 'author'
          ? 'text-brand-green'
          : 'text-brand-red';

  return (
    <div
      role="tab"
      aria-selected={active}
      // 给 scrollRef 父级 querySelector 用 —— useEffect 里 activeTabId 变化时
      // 通过这个属性精确定位 DOM 节点,调 scrollIntoView 让选中 tab 居可见区
      data-tab-id={tab.id}
      onClick={onClick}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose(e);
        }
      }}
      className={cn(
        'group inline-flex items-center gap-2 py-1.5 pl-3 pr-2 rounded-pill shrink-0 cursor-pointer max-w-[220px] transition-colors',
        active
          ? 'bg-surface-2 text-foreground'
          : 'text-muted-foreground hover:bg-surface-1 hover:text-subtle'
      )}
    >
      <Icon
        className={cn(
          'size-3 shrink-0',
          active ? activeIconColor : 'text-faint'
        )}
      />
      <span
        className={cn(
          'truncate text-12',
          active ? 'font-medium' : 'font-normal'
        )}
        title={label}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-4 w-4 items-center justify-center rounded-4 shrink-0 text-faint opacity-70 hover:opacity-100 hover:bg-surface-2 hover:text-foreground transition-opacity"
        aria-label="关闭页签"
        title="关闭(中键也可)"
      >
        <X className="size-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}
