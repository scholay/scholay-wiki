import { NavLink, useSearchParams } from 'react-router-dom';
import { Compass, Blocks } from 'lucide-react';

/**
 * 科研能力广场分段:全网工具(/tools)| 社区技能(/tools/skills)。
 * 两段共用功能广场外壳与顶部头部(搜索/排序);切段保留搜索词 q,重置分类/价格/排序/分页。
 */
const SEGMENTS = [
  { to: '/tools', label: '全网工具', icon: Compass, end: true },
  { to: '/tools/skills', label: '社区技能', icon: Blocks, end: false },
] as const;

export function PlazaSegmentTabs() {
  const [params] = useSearchParams();
  const q = params.get('q');
  const suffix = q ? `?q=${encodeURIComponent(q)}` : '';

  return (
    <div className="inline-flex rounded-12 border border-border bg-surface-1 p-1">
      {SEGMENTS.map((s) => (
        <NavLink
          key={s.to}
          to={s.to + suffix}
          end={s.end}
          className={({ isActive }) =>
            'flex items-center gap-1.5 rounded-8 px-3.5 py-1.5 text-12 transition-colors ' +
            (isActive
              ? 'bg-surface-card font-medium text-foreground shadow-raised'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          <s.icon className="h-4 w-4" strokeWidth={2} />
          {s.label}
        </NavLink>
      ))}
    </div>
  );
}
