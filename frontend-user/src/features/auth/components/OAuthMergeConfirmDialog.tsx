import { toast } from 'sonner';
import { Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/shared/ui';
import {
  usePendingMerge,
  useConfirmOAuthMerge,
  useCancelOAuthMerge,
} from '../api/oauth-merge';

const PROVIDER_LABEL: Record<string, string> = {
  github: 'GitHub',
  google: 'Google',
  apple: 'Apple',
  microsoft: 'Microsoft',
  orcid: 'ORCID',
  discourse: '恩特学术社区',
  wechat: '微信',
};

/**
 * OAuth 邮箱冲突的「二选一」确认页 ——
 * 当用户用第三方登录,而其邮箱已存在于本地账号:
 *   选 A: 合并 → 把这个第三方账号链接到现有本地账号(以后两种方式都能登入)
 *   选 B: 新建独立账号 → 用第三方信息建一个新号(无邮箱,后续仅该 provider 能登入)
 *
 * 不放进 Dialog 弹窗:整页接管,避免用户误关弹窗导致 merge_token 漂移。
 */
export function OAuthMergeConfirmDialog({
  token,
  onDone,
}: {
  token: string;
  onDone: () => void;
}) {
  const { data: info, isLoading, isError } = usePendingMerge(token);
  const confirm = useConfirmOAuthMerge();
  const cancel = useCancelOAuthMerge();

  const pending = confirm.isPending || cancel.isPending;

  if (isLoading) {
    return (
      <>
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">正在加载合并选项…</p>
      </>
    );
  }
  if (isError || !info) {
    return (
      <>
        <AlertCircle className="size-7 text-brand-red" />
        <p className="text-base font-semibold text-foreground">链接已过期</p>
        <p className="text-sm text-muted-foreground">
          请重新发起第三方登录(10 分钟内未确认会自动失效)
        </p>
      </>
    );
  }

  const providerLabel = PROVIDER_LABEL[info.provider] ?? info.provider;

  const handleMerge = async () => {
    try {
      await confirm.mutateAsync(token);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '账号合并失败,请重试');
    }
  };
  const handleNew = async () => {
    try {
      await cancel.mutateAsync(token);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败,请稍后重试');
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <h1 className="font-display italic font-semibold text-2xl text-foreground">
        发现已存在的账号
      </h1>
      <p className="text-sm leading-[1.7] text-subtle text-center max-w-md">
        你的 <span className="font-semibold text-foreground">{providerLabel}</span>{' '}
        账号邮箱{' '}
        <span className="font-semibold text-foreground">{info.provider_email}</span>{' '}
        已被 Scholay 上一个账号注册。请选择:
      </p>

      <div className="flex flex-col gap-3 w-full max-w-md">
        {/* 选项 A:合并 —— 推荐 */}
        <button
          type="button"
          onClick={handleMerge}
          disabled={pending}
          className="flex flex-col items-start gap-2 p-4 rounded-md border-2 border-foreground text-left bg-background hover:bg-surface-1 transition-colors disabled:opacity-50"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-sm font-semibold text-foreground">
              绑定到现有账号 <span className="text-brand-amber">(推荐)</span>
            </span>
            <ArrowRight className="size-4 text-foreground" />
          </div>
          <p className="text-xs leading-[1.6] text-muted-foreground">
            登入邮箱为 <span className="text-foreground">{info.target_email}</span> 的
            Scholay 账号,以后可用邮箱或 {providerLabel} 任一方式登录。
          </p>
        </button>

        {/* 选项 B:新建独立账号 */}
        <button
          type="button"
          onClick={handleNew}
          disabled={pending}
          className="flex flex-col items-start gap-2 p-4 rounded-md border border-border text-left bg-background hover:bg-surface-1 transition-colors disabled:opacity-50"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-sm font-semibold text-foreground">
              新建一个独立账号
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
          <p className="text-xs leading-[1.6] text-muted-foreground">
            创建一个新的 Scholay 账号,只能用 {providerLabel} 登录(没有邮箱)。
            两个账号互不相干,数据不共享。
          </p>
        </button>
      </div>

      {pending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>处理中…</span>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => (window.location.href = '/')}
        disabled={pending}
        className="text-xs text-muted-foreground"
      >
        取消并返回首页
      </Button>
    </div>
  );
}
