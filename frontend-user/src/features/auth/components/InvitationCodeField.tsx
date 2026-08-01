import { useEffect } from 'react';
import { CheckCircle2, Ticket, X } from 'lucide-react';
import { Input } from '@/shared/ui';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { persistInvitationCode } from '@/shared/lib/auth-invitation';
import { cn } from '@/shared/lib/utils';

/**
 * 注册表单密码下方的可选邀请码。仅挂在 RegisterForm。
 *
 * 两种态:
 *   - 手填:普通 Input +「邀请码（选填）」标签
 *   - 邀请链接预填并通过校验:无标签,锁定条展示「已验证」,需点「取消」才能重填
 */
export function InvitationCodeField({ className }: { className?: string }) {
  const invitationCode = useAuthDialog((s) => s.invitationCode);
  const invitationLocked = useAuthDialog((s) => s.invitationLocked);
  const setInvitationCode = useAuthDialog((s) => s.setInvitationCode);
  const unlockInvitation = useAuthDialog((s) => s.unlockInvitation);
  const hydrateInvitation = useAuthDialog((s) => s.hydrateInvitation);

  useEffect(() => {
    if (invitationCode.trim()) return;
    hydrateInvitation();
  }, [invitationCode, hydrateInvitation]);

  if (invitationLocked && invitationCode.trim()) {
    return (
      <div
        className={cn(
          'flex h-10 items-center gap-2 rounded-md border border-brand-green/30',
          'bg-brand-green/5 px-3',
          className,
        )}
      >
        <CheckCircle2
          className="size-4 shrink-0 text-brand-green"
          strokeWidth={2}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-wide text-foreground">
          {invitationCode}
        </span>
        <span className="shrink-0 text-2xs font-medium text-brand-green">已验证</span>
        <button
          type="button"
          onClick={unlockInvitation}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-0.5 rounded-sm px-1.5',
            'text-xs text-muted-foreground transition-colors',
            'hover:bg-surface-2 hover:text-foreground',
          )}
          aria-label="取消邀请码，重新填写"
        >
          <X className="size-3.5" strokeWidth={2} />
          取消
        </button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor="auth-invitation-code"
        className="flex items-center gap-1.5 text-xs font-medium text-foreground"
      >
        <Ticket className="size-3.5 text-subtle" strokeWidth={2} />
        邀请码
        <span className="font-normal text-muted-foreground">（选填）</span>
      </label>
      <Input
        id="auth-invitation-code"
        value={invitationCode}
        onChange={(e) => {
          const next = e.target.value;
          setInvitationCode(next);
          persistInvitationCode(next);
        }}
        autoComplete="off"
        spellCheck={false}
        placeholder="如有邀请码请填写"
        className="h-10 text-sm tracking-wide"
        maxLength={32}
      />
    </div>
  );
}
