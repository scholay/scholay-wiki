import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { useProfile } from '@/shared/api/profile';
import { MeSubpageShell } from '../../components/mobile/MeSubpageShell';

/**
 * 移动端安全设置 —— 绑定状态展示 + 修改密码(POST /user/change-password,与 PC 同端点)。
 * 换绑邮箱/手机依赖双重验证码流程,移动端后续里程碑(提示去电脑端)。
 */
export function MobileSecurityPage() {
  return (
    <MeSubpageShell title="安全设置">
      <SecurityBody />
    </MeSubpageShell>
  );
}

function SecurityBody() {
  const profileQ = useProfile();
  const profile = profileQ.data;

  return (
    <div className="space-y-3 p-3">
      <section className="space-y-3 rounded-lg border border-border bg-background p-4">
        <h2 className="text-xs font-medium text-muted-foreground">绑定状态</h2>
        <BindRow
          label="邮箱"
          value={profile?.email || null}
          verified={!!profile?.email_verified}
        />
        <BindRow
          label="手机号"
          value={profile?.phone || null}
          verified={!!profile?.phone_verified}
        />
        <p className="text-xs leading-relaxed text-faint">
          换绑邮箱 / 手机号需要双重验证码确认,请先在电脑端「设置 → 安全设置」操作
        </p>
      </section>

      <ChangePasswordCard />
    </div>
  );
}

function BindRow({
  label,
  value,
  verified,
}: {
  label: string;
  value: string | null;
  verified: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-sm">
        <span className={value ? 'text-foreground' : 'text-faint'}>
          {value ?? '未绑定'}
        </span>
        {value &&
          (verified ? (
            <CheckCircle2 className="size-3.5 text-brand-green" />
          ) : (
            <XCircle className="size-3.5 text-faint" />
          ))}
      </span>
    </div>
  );
}

function ChangePasswordCard() {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const change = useMutation({
    mutationFn: async () => {
      if (newPwd !== confirmPwd) throw new Error('两次输入的新密码不一样,请重新输入');
      if (newPwd.length < 8) throw new Error('新密码至少要 8 位');
      try {
        await http.post('/user/change-password', {
          old_password: oldPwd,
          new_password: newPwd,
        });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      toast.success('密码已修改');
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    },
    onError: (e) => toast.error((e as Error).message || '修改失败'),
  });

  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-background p-4"
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate();
      }}
    >
      <h2 className="text-xs font-medium text-muted-foreground">修改密码</h2>
      <PwdInput placeholder="当前密码" value={oldPwd} onChange={setOldPwd} />
      <PwdInput placeholder="新密码(至少 8 位)" value={newPwd} onChange={setNewPwd} />
      <PwdInput placeholder="再输一遍新密码" value={confirmPwd} onChange={setConfirmPwd} />
      <button
        type="submit"
        disabled={change.isPending || !oldPwd || !newPwd || !confirmPwd}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground text-md font-medium text-white active:opacity-80 disabled:opacity-50"
      >
        {change.isPending && <Loader2 className="size-4 animate-spin" />}
        确认修改
      </button>
    </form>
  );
}

function PwdInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="password"
      autoComplete="new-password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-md text-foreground outline-none placeholder:text-faint focus:border-border-strong"
    />
  );
}
