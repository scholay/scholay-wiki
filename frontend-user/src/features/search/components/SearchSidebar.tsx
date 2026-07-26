import { useCallback } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { X } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeaderNav,
  SidebarSection,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from '@/shared/components/sidebar';
import { Checkbox } from '@/shared/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { useSidebar } from '@/stores/sidebar.store';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';
import { AgentSessionList } from '@/shared/components/agent-session/AgentSessionList';
import { SOURCE_META } from '@/shared/lib/source';
import { cn } from '@/shared/lib/utils';
import { smartSearchSessions } from '../api/smart-search';
import {
  SOURCE_OPTIONS,
  isSubjectsSingleSelect,
  pruneFiltersForSource,
  sortOptionsForSource,
  sourceSupports,
  subjectsForSource,
  typesForSource,
  type SearchFilters,
  type SearchSource,
  type SortOrder,
} from '../types';
import { LibrarySection } from './search-sidebar/LibrarySection';
import {
  CheckboxRow,
  FilterGroup,
  TIME_OPTIONS,
} from './search-sidebar/primitives';
import { buildFilterChips } from './search-sidebar/chips-from-filters';
import type { SearchMode } from './SearcherColumn';

/**
 * 搜索结果页侧栏 —— shell + filter groups:
 *   1. 顶部 LibrarySection(已抽到 search-sidebar/LibrarySection.tsx)
 *   2. 筛选器 SidebarSection
 *      - 活跃 chip 条(由 buildFilterChips 派生)
 *      - 各 FilterGroup(数据源 / 排序 / 时间 / 学科 / 类型 / OA)按当前 source 动态显示
 *
 * 数据流:filter prop-driven,任意筛选变化 → onFiltersChange,**无"应用"按钮**。
 * subjects / types / openAccess / minCitations 按 source 动态显示(pmd 不支持 → 隐藏)。
 */

interface SearchSidebarProps {
  filters: SearchFilters;
  onFiltersChange: (next: SearchFilters) => void;
  /**
   * 当前搜索器模式 —— 智能模式下整块"筛选器" SidebarSection 不渲染,
   * 因为智能搜索由 agent 端理解自然语言意图,前端筛选器对它无效。
   * 传统模式 = 渲染全部筛选维度。
   */
  mode: SearchMode;
}

export function SearchSidebar({
  filters,
  onFiltersChange,
  mode,
}: SearchSidebarProps) {
  const toggleSidebar = useSidebar((s) => s.toggle);
  // 智能模式:会话历史列表(与聊天在 SearcherColumn 是兄弟子树,activeSessionId 收在 store 协调)。
  const activeSessionId = useSmartSearchSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSmartSearchSessionStore((s) => s.setActiveSessionId);
  const [chipsRef] = useAutoAnimate<HTMLDivElement>({
    duration: 160,
    easing: 'ease-out',
  });

  // 这三个 callback 用 useCallback 稳定引用 —— FilterGroup 内的 <label>
  // / <input> 都是 prop-driven,父级重渲时 patch / toggleInList 引用不变,
  // child 重渲只在自己 prop 真变时才发生。
  const patch = useCallback(
    <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) =>
      onFiltersChange({ ...filters, [k]: v }),
    [filters, onFiltersChange]
  );

  const toggleInList = useCallback(
    (k: 'venues' | 'subjects' | 'publicationTypes', id: string) => {
      const list = filters[k];
      if (list.includes(id))
        onFiltersChange({
          ...filters,
          [k]: list.filter((x) => x !== id) as SearchFilters[typeof k],
        });
      else
        onFiltersChange({
          ...filters,
          [k]: [...list, id] as SearchFilters[typeof k],
        });
    },
    [filters, onFiltersChange]
  );

  /** 切换源 —— 同时 prune 掉新源不支持的已选值,避免幽灵筛选 */
  const handleSourceChange = useCallback(
    (next: SearchSource) => {
      onFiltersChange(pruneFiltersForSource(filters, next));
    },
    [filters, onFiltersChange]
  );

  // 按当前源动态计算可见筛选维度
  const subjectOptions = subjectsForSource(filters.source);
  const typeOptions = typesForSource(filters.source);
  const subjectsSingle = isSubjectsSingleSelect(filters.source);
  const showSubjects = subjectOptions.length > 0;
  const showTypes = typeOptions.length > 0;
  const showOpenAccess = sourceSupports(filters.source, 'openAccess');

  const chips = buildFilterChips({ filters, patch, toggleInList });

  const clearAll = () => {
    onFiltersChange({
      ...filters,
      timeRange: 'all',
      venues: [],
      subjects: [],
      publicationTypes: [],
      openAccess: false,
      minCitations: undefined,
    });
  };

  return (
    <Sidebar>
      <SidebarHeaderNav />

      <SidebarContent>
        {/* 智能模式:会话历史(ChatGPT 风格,置顶)—— 点选切换、hover ⋮ 重命名/删除;
            新对话按钮在搜索器 header(不在这里)。
            ⚠️ 不用 `{mode==='smart' && <.../>}` 条件挂载:AgentSessionList 内含**常开态** Radix 重命名/删除
            弹窗,若在弹窗 open 时 mode 翻出 smart(浏览器后退等)会连同 open 的 Dialog 一起卸载 → Radix 的
            body pointer-lock 清理不跑 → 全站点击失灵(见 frontend-user/CLAUDE.md §十一)。改用 display 隐藏
            (同 SearcherColumn 对 SmartSearchPanel 的 contents/hidden 手法),常驻挂载不卸载。传统模式下
            useSessions(enabled:!!token, staleTime 30s)有一次廉价预取,可接受。 */}
        <div className={mode === 'smart' ? 'contents' : 'hidden'}>
          <AgentSessionList
            api={smartSearchSessions}
            activeSessionId={activeSessionId}
            onActivate={(id) => setActiveSessionId(id)}
            onNewConversation={() => setActiveSessionId(null)}
            sectionId="smart-search-sessions"
            emptyHint="还没有会话, 在右侧输入第一句话即可开始"
          />
        </div>

        {/* 1. 文献集 — 真实数据 / 登录引导 */}
        <LibrarySection />

        {/* 2. 筛选器(prominent:11px/700 #111,与 "清空" 操作配套强调)——
            只在 classic 模式渲染;智能模式由 agent 理解意图,前端筛选无效。 */}
        {mode === 'classic' && (
        <SidebarSection
          id="filters"
          label="筛选器"
          prominent
          bordered
          action={
            chips.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-2xs font-bold text-brand-red hover:opacity-70"
              >
                清空
              </button>
            )
          }
        >
          {/* 活跃 chips */}
          {chips.length > 0 && (
            <div className="px-4 pb-2">
              <div ref={chipsRef} className="flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={c.remove}
                    className="inline-flex items-center gap-1 h-[22px] px-2 rounded-pill bg-danger-soft text-brand-red text-2xs font-medium border border-brand-red/30"
                  >
                    {c.label}
                    <X className="size-2.5" strokeWidth={3} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2.1 数据源 — 单选,3 项,hover 出 Tooltip 给出描述与提供方 */}
          <FilterGroup label="数据源">
            <div className="flex flex-col">
              {SOURCE_OPTIONS.map((opt) => {
                // 'auto'(综合)不在三源 SOURCE_META 里,给一份内联展示元数据
                const meta =
                  opt.value === 'auto'
                    ? {
                        name: '综合',
                        description: '自动选源:某个源暂时不可用时自动切换到下一个,搜索不中断',
                      }
                    : SOURCE_META[opt.value];
                return (
                  <Tooltip key={opt.value}>
                    <TooltipTrigger asChild>
                      <label
                        className={cn(
                          'flex items-center gap-2.5 px-4 py-1.5 cursor-pointer hover:bg-surface-1 transition-colors',
                          filters.source === opt.value && 'bg-surface-1'
                        )}
                      >
                        <input
                          type="radio"
                          name="search-source"
                          checked={filters.source === opt.value}
                          onChange={() => handleSourceChange(opt.value)}
                          className="size-3.5 accent-brand-red"
                        />
                        <div
                          className={cn(
                            'flex-1 min-w-0 text-sm truncate',
                            filters.source === opt.value
                              ? 'text-foreground font-semibold'
                              : 'text-subtle'
                          )}
                        >
                          {opt.label}
                        </div>
                      </label>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={4}
                      className="text-xs bg-background text-foreground border-border shadow-overlay max-w-[220px]"
                    >
                      <div className="font-semibold">{meta.name}</div>
                      <div className="text-muted-foreground mt-0.5">
                        {meta.description}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </FilterGroup>

          {/* 2.1.5 排序 — 按 source 动态候选;候选 < 2 时不显示整组(STC /papers/search
              普通端点忽略 sort,只剩"相关度"一项 = 无意义) */}
          {sortOptionsForSource(filters.source).length > 1 && (
            <FilterGroup label="排序">
              {sortOptionsForSource(filters.source).map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors"
                >
                  <input
                    type="radio"
                    name="search-sort"
                    checked={filters.sort === opt.value}
                    onChange={() => patch('sort', opt.value as SortOrder)}
                    className="size-3.5 accent-brand-red"
                  />
                  <span
                    className={cn(
                      'flex-1 min-w-0 truncate text-sm',
                      filters.sort === opt.value
                        ? 'text-foreground font-semibold'
                        : 'text-subtle'
                    )}
                  >
                    {opt.label}
                  </span>
                </label>
              ))}
            </FilterGroup>
          )}

          {/* 2.2 时间范围 — 单选(所有源) */}
          <FilterGroup label="发表时间">
            {TIME_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors"
              >
                <input
                  type="radio"
                  name="search-timeRange"
                  checked={filters.timeRange === opt.value}
                  onChange={() => patch('timeRange', opt.value)}
                  className="size-3.5 accent-brand-red"
                />
                <span
                  className={cn(
                    'flex-1 min-w-0 truncate text-sm',
                    filters.timeRange === opt.value
                      ? 'text-foreground font-semibold'
                      : 'text-subtle'
                  )}
                >
                  {opt.label}
                </span>
              </label>
            ))}
          </FilterGroup>

          {/* 2.3 学科 / 类型 / 开放获取 —— 按 source 动态过滤:
              - subjectOptions / typeOptions 已按当前源剪过(pmd 为空,自动隐藏整组)
              - olx subjects 强制单选(subjectsSingle),UI 渲 radio 而非 checkbox
              - showOpenAccess / showMinCitations 各自按源决定显隐 */}
          {showSubjects && (
            <FilterGroup label="学科领域" defaultCollapsed>
              {subjectOptions.map((opt) => {
                const checked = filters.subjects.includes(opt.value);
                return subjectsSingle ? (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors"
                  >
                    <input
                      type="radio"
                      name="search-subjects-single"
                      checked={checked}
                      onChange={() => patch('subjects', [opt.value])}
                      onClick={() => {
                        // 已选时再点 = 取消(radio 默认不支持,手动模拟)
                        if (checked) patch('subjects', []);
                      }}
                      className="size-3.5 accent-brand-red"
                    />
                    <span
                      className={cn(
                        'flex-1 min-w-0 truncate text-sm',
                        checked
                          ? 'text-foreground font-semibold'
                          : 'text-subtle'
                      )}
                    >
                      {opt.label}
                    </span>
                  </label>
                ) : (
                  <CheckboxRow
                    key={opt.value}
                    label={opt.label}
                    checked={checked}
                    onChange={() => toggleInList('subjects', opt.value)}
                  />
                );
              })}
            </FilterGroup>
          )}

          {showTypes && (
            <FilterGroup label="文献类型" defaultCollapsed>
              {typeOptions.map((opt) => (
                <CheckboxRow
                  key={opt.value}
                  label={opt.label}
                  checked={filters.publicationTypes.includes(opt.value)}
                  onChange={() => toggleInList('publicationTypes', opt.value)}
                />
              ))}
            </FilterGroup>
          )}

          {showOpenAccess && (
            <FilterGroup label="开放获取">
              <label className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors">
                <Checkbox
                  checked={filters.openAccess}
                  onCheckedChange={(v) => patch('openAccess', !!v)}
                />
                <span
                  className={cn(
                    'flex-1 min-w-0 truncate text-sm',
                    filters.openAccess
                      ? 'text-foreground font-semibold'
                      : 'text-subtle'
                  )}
                >
                  仅显示开放获取论文
                </span>
              </label>
            </FilterGroup>
          )}
        </SidebarSection>
        )}
      </SidebarContent>

      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}
