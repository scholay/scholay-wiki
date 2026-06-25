import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatHeat, isNewsSurging, type NewsCard } from '@/shared/api/news';

/** 前三名领奖台配色(红/橙/黄),第 4 名起浅灰圆角数字。 */
function rankClass(rank: number): string {
  if (rank === 1) return 'bg-brand-red text-white';
  if (rank === 2) return 'bg-brand-amber text-white';
  if (rank === 3) return 'bg-brand-green text-white';
  return 'bg-surface-2 text-faint';
}

/**
 * PC 情报热榜单项(纯展示,props-in)—— 首页右侧热榜 + 移动热榜可复用。
 * 整行 Link → /news/:slug。
 */
export function NewsHotItem({ item, rank }: { item: NewsCard; rank: number }) {
  const surging = isNewsSurging(item.heat_trend);
  return (
    <Link
      to={`/news/${item.slug}`}
      className="group flex items-center gap-2.5 py-2"
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-sm text-2xs font-bold',
          rankClass(rank),
        )}
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-subtle group-hover:text-brand-red">
        {item.title}
      </span>
      {item.heat_external > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-2xs text-faint">
          {formatHeat(item.heat_external)}
          {surging && <TrendingUp className="size-3 text-brand-red" />}
        </span>
      )}
    </Link>
  );
}
