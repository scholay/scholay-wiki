import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

const TABS = [
  { key: 'papers', label: '论文', to: '/m/feed' },
  { key: 'journals', label: '期刊', to: '/m/feed/journals' },
  { key: 'intel', label: '情报', to: null },
] as const;

export type FeedTabKey = (typeof TABS)[number]['key'];

/**
 * Feed 顶栏(.pen `xk4KC` Feed Tabs):筛选 icon | 论文/期刊/情报 | 搜索 icon。
 * 论文/期刊已可切换(replace 导航,避免 tab 切换堆历史栈);
 * 情报与两侧 icon 是后续里程碑,点击给预告 toast。
 */
export function FeedTopTabs({ active }: { active: FeedTabKey }) {
  const navigate = useNavigate();
  const comingSoon = () => toast.info('移动端即将上线,敬请期待');

  return (
    <div className="flex h-12.5 shrink-0 items-center justify-between bg-background px-4">
      <button
        type="button"
        aria-label="筛选"
        onClick={comingSoon}
        className="text-muted-foreground"
      >
        <SlidersHorizontal className="size-5" />
      </button>

      <nav className="flex items-center gap-6">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={
                isActive
                  ? undefined
                  : tab.to
                    ? () => void navigate(tab.to, { replace: true })
                    : comingSoon
              }
              className="flex flex-col items-center gap-1"
            >
              <span
                className={cn(
                  isActive
                    ? 'text-lg font-semibold text-foreground'
                    : 'text-md text-faint'
                )}
              >
                {tab.label}
              </span>
              <span
                className={cn(
                  'h-0.5 rounded-pill',
                  isActive ? 'w-5 bg-brand-red' : 'w-1.5 bg-transparent'
                )}
              />
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        aria-label="搜索"
        onClick={comingSoon}
        className="text-muted-foreground"
      >
        <Search className="size-5" />
      </button>
    </div>
  );
}
