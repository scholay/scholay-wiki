import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { cn } from '@/shared/lib/utils';
import { CurrentFeatureLabel } from './CurrentFeatureLabel';
import { useNavHistory } from './useBackTarget';

/**
 * 顶部导航最左:Logo | 后退 / 前进 | 当前功能名(悬停全站菜单)。
 * 侧栏开合改由侧栏顶部 SidebarCollapseButton（面板图标）负责,顶栏不再挂 ☰。
 */
export function BrandSection() {
  const navigate = useNavigate();
  const { canBack, canForward, backTarget, forwardTarget } = useNavHistory();

  return (
    <div className="flex items-center gap-2">
      <Link to="/" className="inline-flex items-center">
        <BrandLogo size="sm" />
      </Link>
      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
      <div
        role="group"
        aria-label="页面导航"
        className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
      >
        <button
          type="button"
          disabled={!canBack}
          aria-label={backTarget ? `后退到${backTarget.label}` : '后退'}
          title={backTarget ? `后退到${backTarget.label}` : '后退'}
          onClick={() => navigate(-1)}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
            canBack
              ? 'cursor-pointer text-subtle hover:bg-background hover:text-foreground'
              : 'cursor-not-allowed text-faint opacity-40',
          )}
        >
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          disabled={!canForward}
          aria-label={
            forwardTarget ? `前进到${forwardTarget.label}` : '前进'
          }
          title={forwardTarget ? `前进到${forwardTarget.label}` : '前进'}
          onClick={() => navigate(1)}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
            canForward
              ? 'cursor-pointer text-subtle hover:bg-background hover:text-foreground'
              : 'cursor-not-allowed text-faint opacity-40',
          )}
        >
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
      </div>
      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
      <CurrentFeatureLabel />
    </div>
  );
}
