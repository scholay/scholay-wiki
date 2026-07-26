import { useRef, useState } from 'react';
import { ChevronDown, Folder, LogIn } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeaderNav,
  SidebarSection,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from '@/shared/components/sidebar';
import { FavoriteBurst } from '@/shared/components/FavoriteBurst';
import { LeaveToLibraryLink } from '@/shared/components/LeaveToLibraryLink';
import { Button } from '@/shared/ui/button';
import { useIsAuthenticated } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useSidebar } from '@/stores/sidebar.store';
import { cn } from '@/shared/lib/utils';
import { useLibraryFoldersForJournals } from '../api/library';
import {
  CCF_OPTIONS,
  FQB_QUARTILE_OPTIONS,
  IF_THRESHOLD_OPTIONS,
  JCR_QUARTILE_OPTIONS,
  PUBLISHER_OPTIONS,
  type JournalFilters,
} from '../types';

/**
 * 期刊搜索侧栏 —— 对照 .pen `[02-期刊] 期刊搜索结果` 左侧 `UlINJ`:
 *   1. 文献集快捷段(与 SearchSidebar 同款,登录后展示文件夹列表)
 *   2. 期刊筛选器:中科院分区 / JCR 分区 / 影响因子 / CCF 推荐 / 出版商
 *
 * 任意筛选变化 → onFiltersChange → 父 JournalSearchPage 持有的 filters 更新
 * → useJournalSearch queryKey 变 → 自动重查。无"应用"按钮。
 *
 * **单选语义**:每组用真正的 radio(圆形),每组首项自动是"不限"=取消该维度筛选。
 */
interface JournalSidebarProps {
  filters: JournalFilters;
  onFiltersChange: (next: JournalFilters) => void;
}

export function JournalSidebar({
  filters,
  onFiltersChange,
}: JournalSidebarProps) {
  const toggleSidebar = useSidebar((s) => s.toggle);

  const patch = <K extends keyof JournalFilters>(
    k: K,
    v: JournalFilters[K]
  ) => onFiltersChange({ ...filters, [k]: v });

  const clearAll = () =>
    onFiltersChange({
      fqbQuartile: undefined,
      jcrQuartile: undefined,
      minImpactFactor: undefined,
      ccfRank: undefined,
      publisher: undefined,
    });

  const hasActive =
    !!filters.fqbQuartile ||
    !!filters.jcrQuartile ||
    !!filters.minImpactFactor ||
    !!filters.ccfRank ||
    !!filters.publisher;

  return (
    <Sidebar>
      <SidebarHeaderNav />

      <SidebarContent>
        {/* 1. 文献集快捷段 */}
        <LibrarySection />

        {/* 2. 期刊筛选器 —— 5 个 FilterRadioGroup,每组首项默认"不限" */}
        <SidebarSection
          id="filters"
          label="筛选器"
          prominent
          bordered
          action={
            hasActive && (
              <button
                type="button"
                onClick={clearAll}
                className="text-12 font-medium text-brand-red hover:opacity-70"
              >
                清空
              </button>
            )
          }
        >
          <FilterRadioGroup
            label="中科院分区"
            name="fqbQuartile"
            value={filters.fqbQuartile}
            options={FQB_QUARTILE_OPTIONS}
            onChange={(v) => patch('fqbQuartile', v)}
          />

          <FilterRadioGroup
            label="JCR 分区"
            name="jcrQuartile"
            value={filters.jcrQuartile}
            options={JCR_QUARTILE_OPTIONS}
            onChange={(v) => patch('jcrQuartile', v)}
          />

          <FilterRadioGroup
            label="影响因子"
            name="minImpactFactor"
            value={filters.minImpactFactor}
            options={IF_THRESHOLD_OPTIONS}
            onChange={(v) => patch('minImpactFactor', v)}
          />

          <FilterRadioGroup
            label="CCF 推荐"
            name="ccfRank"
            value={filters.ccfRank}
            options={CCF_OPTIONS}
            onChange={(v) => patch('ccfRank', v)}
          />

          <FilterRadioGroup
            label="出版商"
            name="publisher"
            value={filters.publisher}
            options={PUBLISHER_OPTIONS}
            onChange={(v) => patch('publisher', v)}
          />
        </SidebarSection>
      </SidebarContent>

      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}

// ============================================================================
// 文献集快捷段(沿用 SearchSidebar 同款样式)
// ============================================================================

function LibrarySection() {
  const authenticated = useIsAuthenticated();
  const openDialog = useAuthDialog((s) => s.openDialog);
  const foldersQ = useLibraryFoldersForJournals();
  // FavoriteBurst 锚点 —— burst 浮在 section 屏幕坐标上方(走 portal 不被裁)
  const sectionRef = useRef<HTMLDivElement>(null);

  if (!authenticated) {
    return (
      <SidebarSection id="library" label="我的文献集">
        <div className="mx-4 my-2 px-3 py-3 rounded-12 bg-surface-1 border border-border-soft">
          <div className="text-12 text-subtle leading-paragraph">
            登录后管理你的期刊收藏与对比清单
          </div>
          <Button
            size="sm"
            variant="primary"
            className="mt-2 w-full h-8 text-12"
            onClick={() => openDialog('login')}
          >
            <LogIn className="size-3" />
            登录 / 注册
          </Button>
        </div>
      </SidebarSection>
    );
  }

  const folders = foldersQ.data?.folders ?? [];

  return (
    <>
      <div ref={sectionRef}>
        <SidebarSection
          id="library"
          label="我的文件夹"
          action={
            <LeaveToLibraryLink
              to="/library"
              className="text-12 font-medium text-foreground hover:opacity-70"
            >
              管理
            </LeaveToLibraryLink>
          }
        >
          <div className="max-h-[260px] overflow-y-auto">
            {foldersQ.isLoading && folders.length === 0 && (
              <div className="px-4 py-2 text-12 text-faint">加载中…</div>
            )}
            {!foldersQ.isLoading && folders.length === 0 && (
              <div className="px-4 py-2 text-12 text-faint">
                还没有文件夹 ·
                <LeaveToLibraryLink to="/library" className="ml-1 underline">
                  去创建
                </LeaveToLibraryLink>
              </div>
            )}
            {folders.map((f) => (
              <LeaveToLibraryLink
                key={f.id}
                to={`/library?folder=${f.id}`}
                className="group flex items-center gap-1.5 px-4 h-8 hover:bg-surface-1 transition-colors"
                title={f.name}
              >
                <Folder className="size-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate text-12 text-subtle group-hover:text-foreground">
                  {f.name}
                </span>
                <span className="text-12 text-faint tabular-nums shrink-0">
                  {f.paper_count.toLocaleString()}
                </span>
              </LeaveToLibraryLink>
            ))}
          </div>
        </SidebarSection>
      </div>
      {/* FavoriteBurst:任意位置收藏成功后,"+1" 浮在 section 屏幕坐标。
          与 SearchSidebar 的 LibrarySection 同款挂法(portal 不被 ScrollArea 裁剪) */}
      <FavoriteBurst anchorRef={sectionRef} />
    </>
  );
}

// ============================================================================
// 可折叠筛选段(与 SearchSidebar 风格一致)
// ============================================================================

function FilterGroup({
  label,
  children,
  defaultCollapsed = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between gap-2 h-6 px-4 pt-1.5 pb-1 text-left hover:bg-surface-1 transition-colors"
      >
        <span className="text-12 font-medium uppercase text-faint">
          {label}
        </span>
        <ChevronDown
          className={cn(
            'size-3 text-subtle transition-transform',
            collapsed && '-rotate-90'
          )}
        />
      </button>
      {!collapsed && <div className="flex flex-col pb-1">{children}</div>}
    </div>
  );
}

/**
 * 单选筛选组 —— 每组首项自动 "不限"(选中 = filter 字段 undefined),
 * 与影响因子组的交互一致,UI 是真正的圆形 radio(单选语义对的更直观)。
 *
 * 泛型 T 让 value / onChange 严格对齐 options 的 value 类型(字符串 / 数字皆可)。
 */
function FilterRadioGroup<T extends string | number>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  /** radio name —— 同组共享 name 才能形成单选行为(每组需唯一) */
  name: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  /** 选"不限"时传 undefined */
  onChange: (v: T | undefined) => void;
}) {
  return (
    <FilterGroup label={label}>
      <RadioRow
        name={name}
        checked={value == null}
        label="不限"
        onSelect={() => onChange(undefined)}
      />
      {options.map((opt) => (
        <RadioRow
          key={String(opt.value)}
          name={name}
          checked={value === opt.value}
          label={opt.label}
          onSelect={() => onChange(opt.value)}
        />
      ))}
    </FilterGroup>
  );
}

/** 圆形 radio + 标签;选中态用 brand-red accent,与 SearchSidebar 视觉一致 */
function RadioRow({
  name,
  checked,
  label,
  onSelect,
}: {
  name: string;
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label className="flex items-center gap-2.5 h-6 px-4 cursor-pointer hover:bg-surface-1 transition-colors">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="size-3.5 accent-brand-red"
      />
      <span
        className={cn(
          'flex-1 min-w-0 truncate text-12',
          checked ? 'text-foreground font-medium' : 'text-subtle'
        )}
      >
        {label}
      </span>
    </label>
  );
}
