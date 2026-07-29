import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { MENUS, type Menu, type MenuCategory } from '@/app/menus';
import { RhinoSplitPane } from '@/shared/components/RhinoSplitPane';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import {
  railDisplayLabel,
  selectRailMenus,
  useHomeFeatureRail,
} from '@/stores/home-feature-rail.store';

const FREQUENT_MAX = 4;

const ACCENT: Record<MenuCategory, string> = {
  search: 'bg-brand-green/12 text-brand-green',
  ai: 'bg-brand-amber/12 text-brand-amber',
  resource: 'bg-brand-red/12 text-brand-red',
};

type FeatureSection = 'frequent' | 'all';

/**
 * 犀牛「功能」面板 —— App 图标墙：
 * 左：常用 / 全部；右：对应图标区（全部可编辑）
 */
export function FeatureRailPanel({ embedded }: { embedded?: boolean } = {}) {
  const [section, setSection] = useState<FeatureSection>('frequent');
  const [managing, setManaging] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const pinnedIds = useHomeFeatureRail((s) => s.pinnedIds);
  const aliases = useHomeFeatureRail((s) => s.aliases);
  const clicks = useHomeFeatureRail((s) => s.clicks);
  const pin = useHomeFeatureRail((s) => s.pin);
  const unpin = useHomeFeatureRail((s) => s.unpin);
  const rename = useHomeFeatureRail((s) => s.rename);
  const recordClick = useHomeFeatureRail((s) => s.recordClick);
  const reset = useHomeFeatureRail((s) => s.reset);

  const frequent = useMemo(
    () => selectRailMenus({ pinnedIds, clicks }).slice(0, FREQUENT_MAX),
    [pinnedIds, clicks],
  );

  /** 可编辑区：保持钉选顺序（不按点击重排），便于整理 */
  const editable = useMemo(() => {
    const byId = new Map(MENUS.map((m) => [m.id, m]));
    return pinnedIds
      .map((id) => byId.get(id))
      .filter((m): m is Menu => !!m);
  }, [pinnedIds]);

  const unpinned = useMemo(
    () => MENUS.filter((m) => !pinnedIds.includes(m.id)),
    [pinnedIds],
  );

  const frequentBody = (
    <section className="px-2.5 py-2.5">
      {!embedded ? (
        <h3 className="mb-2 px-0.5 text-2xs font-semibold tracking-wide text-muted-foreground">
          常用
        </h3>
      ) : null}
      {frequent.length === 0 ? (
        <p className="px-0.5 text-2xs text-muted-foreground">
          用过的功能会出现在这里
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-x-1 gap-y-2.5 sm:grid-cols-4">
          {frequent.map((menu) => (
            <AppIcon
              key={`freq-${menu.id}`}
              menu={menu}
              label={railDisplayLabel(menu, aliases)}
              onNavigate={() => recordClick(menu.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );

  const allBody = (
    <section className="flex min-h-0 flex-1 flex-col px-2.5 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        {!embedded ? (
          <h3 className="text-2xs font-semibold tracking-wide text-muted-foreground">
            全部
          </h3>
        ) : (
          <span className="text-2xs font-semibold text-muted-foreground">
            全部入口
          </span>
        )}
        <button
          type="button"
          aria-label={managing ? '完成编辑' : '编辑功能'}
          aria-pressed={managing}
          onClick={() => {
            setManaging((v) => !v);
            setRenamingId(null);
          }}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-pill px-2',
            'text-2xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
            managing
              ? 'bg-brand-green/15 text-brand-green'
              : 'text-subtle hover:bg-muted hover:text-foreground',
          )}
        >
          <Settings2 className="size-3" strokeWidth={2} />
          {managing ? '完成' : '编辑'}
        </button>
      </div>

      <ul className="grid grid-cols-3 gap-x-1 gap-y-2.5 sm:grid-cols-4">
        {editable.map((menu) =>
          renamingId === menu.id ? (
            <li key={menu.id} className="col-span-full px-0.5">
              <RenameForm
                label={railDisplayLabel(menu, aliases)}
                onCancel={() => setRenamingId(null)}
                onCommit={(value) => {
                  rename(menu.id, value);
                  setRenamingId(null);
                }}
              />
            </li>
          ) : (
            <AppIcon
              key={menu.id}
              menu={menu}
              label={railDisplayLabel(menu, aliases)}
              managing={managing}
              canRemove={editable.length > 1}
              onNavigate={() => recordClick(menu.id)}
              onRemove={() => unpin(menu.id)}
              onRename={() => setRenamingId(menu.id)}
            />
          ),
        )}

        <li>
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={unpinned.length === 0}
                aria-label="添加功能"
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded-lg px-0.5 py-0.5',
                  'text-subtle transition-colors',
                  'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                  'disabled:pointer-events-none disabled:opacity-35',
                )}
              >
                <span
                  className={cn(
                    'flex size-11 items-center justify-center rounded-2xl',
                    'border border-dashed border-border bg-muted/40',
                  )}
                >
                  <Plus className="size-4" strokeWidth={2} />
                </span>
                <span className="w-full truncate text-center text-2xs font-medium">
                  添加
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-52 p-2">
              <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">
                添加功能
              </p>
              {unpinned.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  已全部添加
                </p>
              ) : (
                <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                  {unpinned.map((menu) => {
                    const Icon = menu.icon;
                    return (
                      <li key={menu.id}>
                        <button
                          type="button"
                          onClick={() => {
                            pin(menu.id);
                            if (unpinned.length <= 1) setAddOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                          )}
                        >
                          <Icon
                            className="size-3.5 shrink-0 text-subtle"
                            strokeWidth={1.8}
                          />
                          <span className="min-w-0 truncate font-medium">
                            {menu.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </PopoverContent>
          </Popover>
        </li>
      </ul>

      {managing && (
        <button
          type="button"
          onClick={() => {
            reset();
            setRenamingId(null);
            setManaging(false);
          }}
          className={cn(
            'mt-3 flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5',
            'text-2xs font-medium text-muted-foreground transition-colors',
            'hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          )}
        >
          <RotateCcw className="size-3" strokeWidth={2} />
          恢复默认
        </button>
      )}
    </section>
  );

  if (embedded) {
    return (
      <nav aria-label="功能入口" className="h-full min-h-0">
        <RhinoSplitPane
          menu={[
            { id: 'frequent', label: '常用', icon: Sparkles },
            { id: 'all', label: '全部', icon: LayoutGrid },
          ]}
          activeId={section}
          onSelect={(id) => {
            setSection(id as FeatureSection);
            if (id !== 'all') {
              setManaging(false);
              setRenamingId(null);
            }
          }}
        >
          <div className="h-full min-h-0 overflow-y-auto [scrollbar-width:thin]">
            {section === 'frequent' ? frequentBody : allBody}
          </div>
        </RhinoSplitPane>
      </nav>
    );
  }

  return (
    <nav
      aria-label="功能入口"
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-2.5 py-2.5 [scrollbar-width:thin]"
    >
      {frequentBody}
      <div className="border-t border-border/70" />
      {allBody}
    </nav>
  );
}

function AppIcon({
  menu,
  label,
  managing = false,
  canRemove = false,
  onNavigate,
  onRemove,
  onRename,
}: {
  menu: Menu;
  label: string;
  managing?: boolean;
  canRemove?: boolean;
  onNavigate: () => void;
  onRemove?: () => void;
  onRename?: () => void;
}) {
  const Icon = menu.icon;
  const accent = ACCENT[menu.category];

  return (
    <li className="relative">
      <NavLink
        to={menu.href}
        title={menu.description}
        onClick={(e) => {
          if (managing) {
            e.preventDefault();
            return;
          }
          onNavigate();
        }}
        className={({ isActive }) =>
          cn(
            'flex w-full flex-col items-center gap-1 rounded-lg px-0.5 py-0.5',
            'outline-none transition-transform',
            !managing && 'hover:-translate-y-px',
            'focus-visible:ring-2 focus-visible:ring-ring/30',
            isActive && !managing && 'opacity-100',
          )
        }
      >
        <span
          className={cn(
            'relative flex size-11 items-center justify-center rounded-2xl shadow-sm',
            accent,
          )}
        >
          <Icon className="size-5" strokeWidth={1.85} />
          {menu.comingSoon && (
            <span
              className="absolute -right-0.5 -top-0.5 size-1.5 rounded-pill bg-brand-amber ring-2 ring-background"
              aria-label="即将推出"
            />
          )}
        </span>
        <span className="w-full truncate text-center text-2xs font-semibold leading-tight text-foreground">
          {label}
        </span>
      </NavLink>

      {managing && (
        <div className="absolute -right-0.5 -top-0.5 flex gap-0.5">
          {onRename && (
            <button
              type="button"
              aria-label={`重命名 ${label}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRename();
              }}
              className={cn(
                'flex size-5 items-center justify-center rounded-pill',
                'border border-border bg-background text-subtle shadow-sm',
                'hover:text-foreground',
              )}
            >
              <Pencil className="size-2.5" strokeWidth={2.2} />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`移除 ${label}`}
              disabled={!canRemove}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove();
              }}
              className={cn(
                'flex size-5 items-center justify-center rounded-pill',
                'border border-border bg-background text-subtle shadow-sm',
                'hover:text-brand-red',
                'disabled:pointer-events-none disabled:opacity-30',
              )}
            >
              <X className="size-3" strokeWidth={2.25} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function RenameForm({
  label,
  onCancel,
  onCommit,
}: {
  label: string;
  onCancel: () => void;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(label);
  return (
    <form
      className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/30 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(draft);
      }}
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        maxLength={16}
        aria-label="重命名"
        className="h-8 text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex gap-1">
        <Button type="submit" size="sm" className="h-7 flex-1 text-xs">
          保存
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          取消
        </Button>
      </div>
    </form>
  );
}
