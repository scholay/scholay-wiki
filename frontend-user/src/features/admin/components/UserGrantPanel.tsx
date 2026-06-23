import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useGrantVip,
  useRevokeVip,
  useAdjustWallet,
  type AdminUser,
  type UserVipStatus,
} from '../api/users';

const DAY_PRESETS = [30, 90, 180, 365];
const TIER_LABEL: Record<'pro' | 'max', string> = { pro: 'Pro', max: 'Max' };

/**
 * 管理员对单个用户「发放会员 / 调整经费」的操作面板(用户详情抽屉底部)。
 *   - 会员:选档(Pro / Max)+ 天数 → 授予 / 续期;已是会员可取消(回 Free)。
 *   - 经费:选类型(永久 / 临时)+ 金额(+ 临时有效天数)→ 发放 / 扣减。
 * 分别打到后端 POST /admin/users/:id/vip 与 POST /admin/users/:id/wallet/adjust。
 */
export function UserGrantPanel({
  user,
  vip,
  displayName,
}: {
  user: AdminUser;
  vip?: UserVipStatus;
  displayName: string;
}) {
  const grant = useGrantVip();
  const revoke = useRevokeVip();
  const adjust = useAdjustWallet();
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const [tier, setTier] = useState<'pro' | 'max'>('pro');
  const [days, setDays] = useState(30);
  const [creditKind, setCreditKind] = useState<'perm' | 'temp'>('perm');
  const [amount, setAmount] = useState(100);
  const [creditDays, setCreditDays] = useState(30);

  const isPro = vip?.tier === 'pro' || vip?.tier === 'max';

  const handleGrant = async () => {
    if (days < 1) return;
    await apiToast(grant.mutateAsync({ id: user.id, tier, days }), {
      success: `已为 ${displayName} 授予 / 续期 ${days} 天 ${TIER_LABEL[tier]}`,
      failure: '授予会员失败',
    });
  };

  const handleRevoke = async () => {
    const ok = await confirm({
      title: `取消 ${displayName} 的会员?`,
      description:
        '危险操作:会员立即过期回到 Free 档(额度按 Free 计),并清零其随会员发放的订阅经费(含已预发放的下一周期)。充值的永久经费、兑换码等其他来源的临时经费不受影响。',
      danger: true,
      confirmText: '取消会员',
    });
    if (!ok) return;
    await apiToast(revoke.mutateAsync(user.id), { success: '已取消会员', failure: '操作失败' });
  };

  const handleAdjust = async (sign: 1 | -1) => {
    if (amount < 1) return;
    const label = sign > 0 ? '发放' : '扣减';
    const kindLabel = creditKind === 'temp' ? '临时' : '永久';
    await apiToast(
      adjust.mutateAsync({
        id: user.id,
        amount: sign * amount,
        kind: creditKind,
        days: creditKind === 'temp' ? creditDays : 0,
      }),
      { success: `已${label} ${amount} ${kindLabel}经费`, failure: `${label}经费失败` }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 会员 */}
      <div className="flex flex-col gap-2">
        <Label className="text-2xs tracking-[0.12em] text-faint">发放 / 续期会员</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['pro', 'max'] as const).map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={tier === t ? 'default' : 'outline'}
              onClick={() => setTier(t)}
            >
              {TIER_LABEL[t]}
            </Button>
          ))}
          {DAY_PRESETS.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={days === d ? 'default' : 'outline'}
              onClick={() => setDays(d)}
            >
              {d}天
            </Button>
          ))}
          <Input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-8 w-16"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleGrant} disabled={grant.isPending || days < 1} className="flex-1">
            {grant.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPro ? '续期' : '授予'} {days} 天 {TIER_LABEL[tier]}
          </Button>
          {isPro && (
            <Button variant="outline" onClick={handleRevoke} disabled={revoke.isPending}>
              取消会员
            </Button>
          )}
        </div>
      </div>

      {/* 经费 */}
      <div className="flex flex-col gap-2 border-t border-border-soft pt-3">
        <Label className="text-2xs tracking-[0.12em] text-faint">调整科研经费</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['perm', 'temp'] as const).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={creditKind === k ? 'default' : 'outline'}
              onClick={() => setCreditKind(k)}
            >
              {k === 'perm' ? '永久' : '临时'}
            </Button>
          ))}
          <Input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="h-8 w-24"
            placeholder="金额"
          />
          {creditKind === 'temp' && (
            <span className="flex items-center gap-1 text-xs text-faint">
              有效
              <Input
                type="number"
                min={1}
                value={creditDays}
                onChange={(e) => setCreditDays(Number(e.target.value))}
                className="h-8 w-16"
              />
              天
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => handleAdjust(1)} disabled={adjust.isPending || amount < 1} className="flex-1">
            {adjust.isPending && <Loader2 className="size-3.5 animate-spin" />}
            发放 {amount}
          </Button>
          <Button variant="outline" onClick={() => handleAdjust(-1)} disabled={adjust.isPending || amount < 1}>
            扣减
          </Button>
        </div>
        <p className="text-2xs text-faint">
          永久经费:充值 / 管理员发放,长期有效。临时经费:有有效期、消耗时优先扣减。
        </p>
      </div>
    </div>
  );
}
