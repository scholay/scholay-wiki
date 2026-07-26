import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuthStatus } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';

/**
 * 「我的」子页公共壳:返回条 + 标题 + 未登录兜底(直链进入子页时弹登录入口)。
 */
export function MeSubpageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { authenticated } = useAuthStatus();
  const openAuth = useAuthDialog((s) => s.openDialog);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2">
        <Link
          to="/m/me"
          aria-label="返回我的"
          className="flex h-9 w-9 items-center justify-center rounded-pill active:bg-surface-2"
        >
          <ArrowLeft className="size-5 text-foreground" />
        </Link>
        <span className="text-14 font-medium text-foreground">{title}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-1">
        {authenticated ? (
          children
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
            <p className="text-12 text-muted-foreground">登录后才能查看{title}</p>
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="h-10 rounded-8 bg-foreground px-8 text-14 font-medium text-on-brand active:opacity-80"
            >
              登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
