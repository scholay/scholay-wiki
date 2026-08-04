import { forwardRef, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, AlertTriangle, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { toApiError } from '@/shared/lib/http';
import { cn } from '@/shared/lib/utils';
import { EmptyState } from './EmptyState';

interface ResourceErrorProps {
  /**
   * 抓到的错误对象(react-query 的 `error` / catch 的 `err`)。
   * 文案据此分流:404/403 → 不存在 / 无权访问;其余(网络 / 5xx)→ 加载失败。
   */
  error?: unknown;
  /** 资源中文名,拼进默认文案,如「审稿」「项目」「投稿」「草稿」。默认「内容」。 */
  resourceName?: string;
  /** 覆盖标题(不传则按 error 自动生成)。 */
  title?: ReactNode;
  /** 覆盖描述。 */
  description?: ReactNode;
  /** 返回目标路由(与 onBack 二选一)。如 `/peer-review/records`。 */
  backTo?: string;
  /** 返回回调(与 backTo 二选一;Prism 这类非路由内部跳转用,如 `() => setPid(0)`)。 */
  onBack?: () => void;
  /** 返回按钮文案,默认「返回」。 */
  backLabel?: string;
  /** 可重试(仅网络 / 5xx 错误时显示「重试」按钮)。 */
  onRetry?: () => void;
  /**
   * 自动重定向:`true` = 不存在 / 无权访问时 2.5s 后自动走 backTo/onBack(并弹一次 toast);
   * `number` = 自定义毫秒;`false` = 只给手动按钮不自动跳。默认 `true`。
   *
   * 仅对「不存在 / 无权访问(404/403)」生效;网络 / 5xx 错误不自动跳(留给用户重试)。
   */
  autoRedirect?: boolean | number;
  className?: string;
}

const DEFAULT_REDIRECT_MS = 2500;

/**
 * 详情类资源加载失败时的统一友好态 —— 替代「一直转圈」/「裸报错」。
 *
 * 典型用法:按 id 取单个资源的详情页 / 工作区,当 id 不存在、非本人、或上游失败时,
 * 渲染本组件代替正文:给「该 XX 不存在或无权访问」之类的友好提示 + 一个返回按钮,
 * 并默认在 2.5s 后自动把用户送回列表 / 菜单首页(`backTo` 或 `onBack`)。
 *
 * 后端对「不存在」与「非本人」统一返回 404(防枚举),所以这里把 404/403 都归为
 * 「不存在或无权访问」。配合 query 上的 `retry: retryDetailQuery` 让 404 友好态秒出。
 */
export const ResourceError = forwardRef<HTMLDivElement, ResourceErrorProps>(function ResourceError(
  {
    error,
    resourceName = '内容',
    title,
    description,
    backTo,
    onBack,
    backLabel = '返回',
    onRetry,
    autoRedirect = true,
    className,
  },
  ref,
) {
  const navigate = useNavigate();
  const api = toApiError(error);
  const notFound = api.status === 404 || api.status === 403;
  const isNetworkOrServer = api.isNetworkError || api.status >= 500;

  const resolvedTitle = title ?? (notFound ? `${resourceName}不存在或无权访问` : `${resourceName}加载失败`);
  const resolvedDesc =
    description ??
    (notFound
      ? '该链接可能已失效、已被删除,或不属于你的账号。'
      : api.message || '加载时出了点问题,请稍后重试。');
  const Icon: LucideIcon = notFound ? FileQuestion : AlertTriangle;

  const canBack = !!onBack || !!backTo;

  /**
   * 何时给「重试」按钮。
   *
   * 曾经只在 `isNetworkOrServer`(断网 / 5xx)时给,理由是"4xx 重试也没用"。
   * 但这个组件现在也被 DataTable / ConfigPageGuard 用作**内嵌**错误态,那里既没有
   * backTo 也没有 onBack —— 于是一个 400(比如手改 URL 把 page 改成非法值)或 403
   * 会渲染出一张既没有「重试」也没有「返回」的卡片,管理员只能自己按 F5,成了死胡同。
   *
   * 现在的判据:调用方给了 onRetry 就给按钮,只排除 404「不存在」(那个确实重试无意义,
   * 且它已有自动返回)。重试一次 4xx 的代价只是再失败一次,比没有出路好。
   */
  const showRetry = !!onRetry && (isNetworkOrServer || api.status !== 404);

  // 用 ref 持有最新的返回动作,避免 effect 因闭包过期 / 依赖抖动而误触发。
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (onBack) onBack();
    else if (backTo) navigate(backTo, { replace: true });
  };

  const delay =
    autoRedirect === true ? DEFAULT_REDIRECT_MS : typeof autoRedirect === 'number' ? autoRedirect : 0;
  // 只在「不存在 / 无权访问」且有返回去处时自动跳;网络 / 5xx 不自动跳(留重试)。
  const shouldAuto = notFound && canBack && delay > 0;

  useEffect(() => {
    if (!shouldAuto) return;
    toast.error(`${resolvedTitle},正在返回…`);
    const t = setTimeout(() => backRef.current(), delay);
    return () => clearTimeout(t);
    // resolvedTitle 仅作 toast 文案,变化不应重置计时器;backRef 走 ref 不入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAuto, delay]);

  return (
    <div ref={ref} className={cn('flex h-full w-full items-center justify-center bg-surface-3', className)}>
      <EmptyState
        icon={Icon}
        title={resolvedTitle}
        description={resolvedDesc}
        action={
          (canBack || showRetry) && (
            <div className="flex items-center gap-2">
              {showRetry && (
                <Button variant="outline" onClick={onRetry}>
                  重试
                </Button>
              )}
              {canBack && <Button onClick={() => backRef.current()}>{backLabel}</Button>}
            </div>
          )
        }
      />
    </div>
  );
});
ResourceError.displayName = 'ResourceError';
