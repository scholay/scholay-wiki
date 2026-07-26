import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  LayoutGrid, ChevronDown, X, Upload, FolderGit2,
  BarChart3, FlaskConical, Dna, Calculator, LineChart, DraftingCompass,
  Library, PenLine, GraduationCap, Pill, Wrench, Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarSection,
  SidebarItem,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';
import { cn } from '@/shared/lib/utils';
import { useToolCategories } from '../api/tools';

/** 12 分类 → lucide 矢量图标(与项目其他地方统一) */
const CAT_ICON: Record<string, LucideIcon> = {
  'stats-econometrics' : BarChart3,
  'chem-materials' : FlaskConical,
  'bio-life' : Dna,
  'math-numerical' : Calculator,
  'viz-plotting' : LineChart,
  'engineering-cad' : DraftingCompass,
  'lit-manage-pdf' : Library,
  'writing-latex' : PenLine,
  'journal-metrics' : GraduationCap,
  'medical-reference' : Pill,
  'general-utility' : Wrench,
  other: Package,
};

const PRICE_OPTS: [string, string][] = [['', '全部'], ['free', '免费'], ['trial', '试用'], ['paid', '付费'], ['edu', '教育']];
// 形式只暴露 全部/在线/下载;数据里的「两者」(both) 由后端同时计入 在线 与 下载,不单列。
const ACCESS_OPTS: [string, string][] = [['', '全部'], ['website', '在线'], ['download', '下载']];
const OS_OPTS: [string, string][] = [['', '全部'], ['open', '开源'], ['closed', '闭源']];
const labelOf = (opts: [string, string][], v: string) => opts.find(([val]) => val === v)?.[1] ?? v;

/**
 * 功能广场侧栏 —— URL 驱动(读 searchParams 高亮、点选 navigate 到 /tools?...),
 * 故目录页与详情页共用同一个挂载实例:在详情页点分类/筛选会跳回目录并带上条件。
 * 结构对照「文献搜索」侧栏:顶部横向菜单 → 快捷 → 分类 → 筛选器(可折叠组 + 活跃 chip + 清空)。
 */
export function ToolsSidebar() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isSkills = pathname.startsWith('/tools/skills'); // 社区技能分段
  const toggleSidebar = useSidebar((s) => s.toggle);
  const { data: catData } = useToolCategories();

  const category = params.get('category') ?? '';
  const price = params.get('price') ?? '';
  const access = params.get('access') ?? '';
  const os = params.get('os') ?? '';
  // 「全部工具」= 无任何筛选维度时高亮。
  const isAll = !category && !price && !access && !os;

  // 合并到当前 URL 参数(详情页 params 为空 → 等价于只带本次选择),改筛选回第 1 页。
  const go = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete('page');
    const qs = sp.toString();
    navigate(qs ? `/tools?${qs}` : '/tools');
  };

  const cats = catData?.categories ?? [];
  const catLabel = cats.find((c) => c.slug === category)?.label;

  // 分类 / 价格 / 形式 / 开源 同属筛选维度,活跃项一并展示成 chip,可一键清空。
  const activeChips = [
    category && { key: 'category', label: catLabel ?? category },
    price && { key: 'price', label: labelOf(PRICE_OPTS, price) },
    access && { key: 'access', label: labelOf(ACCESS_OPTS, access) },
    os && { key: 'os', label: labelOf(OS_OPTS, os) },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <Sidebar>
      <SidebarContent>
        <div className="px-4 pt-3 pb-1.5">
          <p className="text-14 font-medium text-foreground">科研能力广场</p>
        </div>

        {/* 段切换在顶部 PlazaHeader 的 tab 上统一处理;侧栏只按当前段给对应的筛选/入口。 */}

        {/* 社区技能段:轻量入口(上传 / 我的技能),不复用工具筛选(分类/价格对技能无意义) */}
        {isSkills && (
          <SidebarSection id="filters" label="我的技能" prominent bordered>
            <SidebarItem
              label="上传技能"
              icon={<Upload className="size-4" />}
              onClick={() => navigate('/skills/new')}
            />
            <SidebarItem
              label="我上传的"
              icon={<FolderGit2 className="size-4" />}
              onClick={() => navigate('/skills/mine')}
            />
          </SidebarSection>
        )}

        {/* 全网工具段:全部工具 + 筛选器(分类 / 价格 / 形式 / 开源) */}
        {!isSkills && (
        <>
        <SidebarSection id="tools-all">
          <SidebarItem
            label="全部工具"
            icon={<LayoutGrid className="size-4" />}
            trailing={<Count n={catData?.total ?? 0} />}
            active={isAll ? 'primary' : false}
            onClick={() => go({ category: null, price: null, access: null, os: null })}
          />
        </SidebarSection>

        {/* 筛选器 —— 分类 / 价格 / 形式 / 开源 同属一组筛选维度(文献搜索风格) */}
        <SidebarSection
          id="filters"
          label="筛选器"
          prominent
          bordered
          action={
            activeChips.length > 0 && (
              <button
                type="button"
                onClick={() => go({ category: null, price: null, access: null, os: null })}
                className="text-12 font-medium text-brand-red hover:opacity-70"
              >
                清空
              </button>
            )
          }
        >
          {activeChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {activeChips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => go({ [c.key]: null })}
                  className="inline-flex items-center gap-1 rounded-pill border border-brand-red/30 bg-danger-soft px-2 py-0.5 text-12 font-medium text-brand-red"
                >
                  {c.label}
                  <X className="size-2.5" strokeWidth={3} />
                </button>
              ))}
            </div>
          )}

          <FilterGroup label="分类">
            {cats.map((c) => {
              const Icon = CAT_ICON[c.slug] ?? Package;
              const on = category === c.slug;
              return (
                <CategoryRow
                  key={c.slug}
                  icon={Icon}
                  label={c.label}
                  count={c.count}
                  active={on}
                  onSelect={() => go({ category: on ? null : c.slug })}
                />
              );
            })}
          </FilterGroup>
          <FilterGroup label="价格">
            {PRICE_OPTS.map(([v, l]) => (
              <RadioRow key={v || 'all'} name="tools-price" label={l} active={price === v} onSelect={() => go({ price: v || null })} />
            ))}
          </FilterGroup>
          <FilterGroup label="形式">
            {ACCESS_OPTS.map(([v, l]) => (
              <RadioRow key={v || 'all'} name="tools-access" label={l} active={access === v} onSelect={() => go({ access: v || null })} />
            ))}
          </FilterGroup>
          <FilterGroup label="开源">
            {OS_OPTS.map(([v, l]) => (
              <RadioRow key={v || 'all'} name="tools-os" label={l} active={os === v} onSelect={() => go({ os: v || null })} />
            ))}
          </FilterGroup>
        </SidebarSection>
        </>
        )}
      </SidebarContent>

      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-12 tabular-nums text-faint">{n}</span>;
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-6 items-center justify-between gap-2 px-4 pb-1 pt-1.5 text-left transition-colors hover:bg-surface-1"
      >
        <span className="text-12 font-medium uppercase text-faint">{label}</span>
        <ChevronDown className={cn('size-3 text-subtle transition-transform', collapsed && '-rotate-90')} />
      </button>
      {!collapsed && <div className="flex flex-col pb-1">{children}</div>}
    </div>
  );
}

/** 分类行 —— 带矢量图标 + 计数,单选(再点一次取消);视觉比 RadioRow 更突出,作为首个筛选维度。 */
function CategoryRow({
  icon: Icon,
  label,
  count,
  active,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-7 items-center gap-2.5 px-4 transition-colors hover:bg-surface-1',
        active && 'bg-surface-1',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-foreground' : 'text-faint')} />
      <span className={cn('min-w-0 flex-1 truncate text-left text-12', active ? 'font-medium text-foreground' : 'text-subtle')}>
        {label}
      </span>
      <Count n={count} />
    </button>
  );
}

function RadioRow({
  name,
  label,
  active,
  onSelect,
}: {
  name: string; // 同组共享 name 才能形成原生 radiogroup(方向键 + AT「N of M」语义)
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'flex h-7 cursor-pointer items-center gap-2.5 px-4 transition-colors hover:bg-surface-1',
        active && 'bg-surface-1',
      )}
    >
      <input type="radio" name={name} checked={active} onChange={onSelect} className="size-3.5 accent-brand-red" />
      <span className={cn('min-w-0 flex-1 truncate text-12', active ? 'font-medium text-foreground' : 'text-subtle')}>
        {label}
      </span>
    </label>
  );
}
