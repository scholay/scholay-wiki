import { Loader2, ArrowRight, AlertCircle, LogIn } from 'lucide-react';
import { Button } from '@/shared/ui';
import { useApiToast } from '@/shared/hooks';
import { useIsAuthenticated, useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
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

const sameEmail = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * OAuth 邮箱冲突的「二选一」确认页 ——
 * 当用户用第三方登录,而其邮箱已存在于本地账号:
 *   选 A: 绑定到现有账号 → 把这个第三方账号链接到现有本地账号(以后两种方式都能登入)
 *   选 B: 新建独立账号 → 用第三方信息建一个新号(无邮箱,后续仅该 provider 能登入)
 *
 * 【安全】选 A 必须先「以目标账号本人身份登录」才能确认 —— 只持有 merge_token 不足以合并。
 * 否则只控制了一个第三方身份(其 email 恰好撞上受害者邮箱)的攻击者,就能把自己的第三方
 * 账号绑进受害者账号并拿到受害者会话(账号接管)。后端 confirm-merge 是受保护路由,会校验
 * 当前登录用户 == 合并目标。所以这里:未登录 → 引导登录目标账号;已登录但不是目标账号 →
 * 引导切换账号;已登录且就是目标账号 → 才允许点「确认绑定」。
 *
 * 不放进 Dialog 弹窗:整页接管,避免用户误关弹窗导致 merge_token 漂移;同时全局 AuthDialog
 * 以浮层叠在本页之上,登录成功后本页仍挂载、merge_token 不丢,自动进入「确认绑定」态。
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
  const apiToast = useApiToast();

  const isAuthenticated = useIsAuthenticated();
  const currentUser = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clear);
  const openAuthDialog = useAuthDialog((s) => s.openDialog);

  const pending = confirm.isPending || cancel.isPending;

  if (isLoading) {
    return (
      <>
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
        <p className="text-12 text-muted-foreground">正在加载合并选项…</p>
      </>
    );
  }
  if (isError || !info) {
    return (
      <>
        <AlertCircle className="size-7 text-brand-red" />
        <p className="text-14 font-medium text-foreground">链接已过期</p>
        <p className="text-12 text-muted-foreground">
          请重新发起第三方登录(10 分钟内未确认会自动失效)
        </p>
      </>
    );
  }

  const providerLabel = PROVIDER_LABEL[info.provider] ?? info.provider;
  // 已登录且就是合并目标账号本人 —— 唯一允许直接确认绑定的状态。
  const isTargetAccount = isAuthenticated && sameEmail(currentUser?.email, info.target_email);

  const handleMerge = async () => {
    try {
      await confirm.mutateAsync(token);
      onDone();
    } catch (err) {
      apiToast.show(err, '账号合并失败,请重试');
    }
  };
  const handleNew = async () => {
    try {
      await cancel.mutateAsync(token);
      onDone();
    } catch (err) {
      apiToast.show(err, '操作失败,请稍后重试');
    }
  };
  // 登录目标账号:已登录别人 → 先清掉再开登录浮层;未登录 → 直接开登录浮层。
  // 登录成功后 AuthDialog 自关,本页重渲染进入 isTargetAccount 态。
  const handleLoginToTarget = () => {
    if (isAuthenticated && !isTargetAccount) clearSession();
    openAuthDialog('login', {
      accountType: 'email',
      suppressInviteFlow: true,
    });
  };

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <h1 className="font-display italic font-medium text-24 text-foreground">
        发现已存在的账号
      </h1>
      <p className="text-12 leading-paragraph text-subtle text-center max-w-md">
        你的 <span className="font-medium text-foreground">{providerLabel}</span>{' '}
        账号邮箱{' '}
        <span className="font-medium text-foreground">{info.provider_email}</span>{' '}
        已被 Scholay 上一个账号注册。请选择:
      </p>

      <div className="flex flex-col gap-3 w-full max-w-md">
        {/* 选项 A:绑定到现有账号 —— 必须先登录目标账号本人 */}
        {isTargetAccount ? (
          <button
            type="button"
            onClick={handleMerge}
            disabled={pending}
            className="flex flex-col items-start gap-2 p-4 rounded-16 border-2 border-foreground text-left bg-surface-card hover:bg-surface-1 transition-colors disabled:opacity-50"
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-14 font-medium text-foreground">
                确认绑定到当前账号 <span className="text-brand-amber">(推荐)</span>
              </span>
              <ArrowRight className="size-4 text-foreground" />
            </div>
            <p className="text-12 leading-paragraph text-muted-foreground">
              当前已登录{' '}
              <span className="text-foreground">{info.target_email}</span>,确认后即可用邮箱或{' '}
              {providerLabel} 任一方式登录。
            </p>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLoginToTarget}
            disabled={pending}
            className="flex flex-col items-start gap-2 p-4 rounded-16 border-2 border-foreground text-left bg-surface-card hover:bg-surface-1 transition-colors disabled:opacity-50"
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-14 font-medium text-foreground">
                登录该账号后绑定 <span className="text-brand-amber">(推荐)</span>
              </span>
              <LogIn className="size-4 text-foreground" />
            </div>
            <p className="text-12 leading-paragraph text-muted-foreground">
              {isAuthenticated && !isTargetAccount ? (
                <>
                  你当前登录的不是{' '}
                  <span className="text-foreground">{info.target_email}</span>。出于安全,需先登录该邮箱对应的账号,确认它确实属于你,才能把 {providerLabel} 绑上去。
                </>
              ) : (
                <>
                  出于安全,需先登录邮箱为{' '}
                  <span className="text-foreground">{info.target_email}</span>{' '}
                  的账号,确认它确实属于你,再绑定 {providerLabel}。
                </>
              )}
            </p>
          </button>
        )}

        {/* 选项 B:新建独立账号 */}
        <button
          type="button"
          onClick={handleNew}
          disabled={pending}
          className="flex flex-col items-start gap-2 p-4 rounded-16 border border-border text-left bg-surface-card hover:bg-surface-1 transition-colors disabled:opacity-50"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-14 font-medium text-foreground">
              新建一个独立账号
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
          <p className="text-12 leading-paragraph text-muted-foreground">
            创建一个新的 Scholay 账号,只能用 {providerLabel} 登录(没有邮箱)。
            两个账号互不相干,数据不共享。
          </p>
        </button>
      </div>

      {pending && (
        <div className="flex items-center gap-2 text-12 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>处理中…</span>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => (window.location.href = '/')}
        disabled={pending}
        className="text-12 text-muted-foreground"
      >
        取消并返回首页
      </Button>
    </div>
  );
}
