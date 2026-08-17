import { NavLink, useSearchParams } from 'react-router-dom';
import { Compass, Blocks, MessageSquareText } from 'lucide-react';

/**
 * scholay广场分段:学术工具 / 学术skills / 学术prompts。
 */
const SEGMENTS = [
  { to: '/tools/catalog', label: '学术工具', icon: Compass, end: true, keepQ: true },
  { to: '/tools/skills', label: '学术skills', icon: Blocks, keepQ: true },
  { to: '/tools/prompts', label: '学术prompts', icon: MessageSquareText, keepQ: true },
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
          to={s.to + (s.keepQ ? suffix : '')}
          end={'end' in s ? s.end : false}
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
