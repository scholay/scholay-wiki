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
  useGrantResetPasses,
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
  const grantPasses = useGrantResetPasses();
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const [tier, setTier] = useState<'pro' | 'max'>('pro');
  const [days, setDays] = useState(30);
  // 计费周期标识(0079):keep=不改动现值(默认,防随手补天数冲掉年费徽标)。
  const [cycle, setCycle] = useState<'keep' | 'monthly' | 'yearly'>('keep');
  const [creditKind] = useState<'perm' | 'temp'>('perm'); // 0090:固定永久,选择器已删
  const [amount, setAmount] = useState(100);
  const [creditDays] = useState(30); // 0090:经费不过期,天数不再可编辑(仍随请求发出,后端忽略)
  const [note, setNote] = useState(''); // 调账备注 → credit_transactions.note(流水里可见,便于对账归因)
  const [passCount, setPassCount] = useState(1); // 发放重置次数(0090 起次数是重置额度唯一凭证)
  const [passDays, setPassDays] = useState(365); // 次数有效期(天)

  const isPro = vip?.tier === 'pro' || vip?.tier === 'max';

  const handleGrant = async () => {
    if (days < 1) return;
    await apiToast(
      grant.mutateAsync({ id: user.id, tier, days, ...(cycle !== 'keep' ? { cycle } : {}) }),
      {
        success: `已为 ${displayName} 授予 / 续期 ${days} 天 ${TIER_LABEL[tier]}${
          cycle === 'yearly' ? '(年费标识)' : cycle === 'monthly' ? '(月度标识)' : ''
        }`,
        failure: '授予会员失败',
      }
    );
  };

  const handleRevoke = async () => {
    const ok = await confirm({
      title: `取消 ${displayName} 的会员?`,
      description:
        // 0090:订阅不再赠送经费 → 取消会员没有赠送物可回收,经费与重置次数一律不动。
        '危险操作:会员立即过期回到 Free 档(额度按 Free 计)。经费余额与重置次数不受影响。',
      danger: true,
      confirmText: '取消会员',
    });
    if (!ok) return;
    await apiToast(revoke.mutateAsync(user.id), { success: '已取消会员', failure: '操作失败' });
  };

  const handleAdjust = async (sign: 1 | -1) => {
    if (amount < 1) return;
    const label = sign > 0 ? '发放' : '扣减';
    const kindLabel = ''; // 0090:经费不再分类型,toast 不再报「临时/永久」
    const ok = await apiToast(
      adjust.mutateAsync({
        id: user.id,
        amount: sign * amount,
        kind: creditKind,
        days: creditKind === 'temp' ? creditDays : 0,
        note: note.trim(),
      }),
      { success: `已${label} ${amount} ${kindLabel}经费`, failure: `${label}经费失败` }
    );
    if (ok !== null) setNote(''); // 成功后清空备注,防下一笔误沿用上一笔的归因
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 会员 */}
      <div className="flex flex-col gap-2">
        <Label className="text-12 text-faint">发放 / 续期会员</Label>
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
        {/* 周期标识(0079):年费/月度徽标口径,默认不动现值 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-12 text-faint">周期标识</span>
          {(
            [
              { id: 'keep', label: '不变' },
              { id: 'monthly', label: '月度' },
              { id: 'yearly', label: '年费' },
            ] as const
          ).map((c) => (
            <Button
              key={c.id}
              type="button"
              size="sm"
              variant={cycle === c.id ? 'default' : 'outline'}
              onClick={() => setCycle(c.id)}
            >
              {c.label}
            </Button>
          ))}
          <span className="text-12 text-faint">决定用户端「年费会员」徽标,不影响时长</span>
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
        <Label className="text-12 text-faint">调整科研经费</Label>
        {/* 0090:「临时/永久」选择器已删 —— 只剩一种经费。后端也已忽略 kind,
            留着按钮会让运营以为发的是 30 天临时经费,实际发的是永久,是无声的调账错账。 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="h-8 w-24"
            placeholder="金额"
          />
          {/* 0095 起 recharge_rate=100 → 经费=分,防止把「100」当 ¥100 发出去(实际是 ¥1)。 */}
          <span className="text-12 text-faint">经费=分(100 经费 = ¥1)</span>
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-8"
          placeholder="备注(计入经费流水,便于对账;可空)"
        />
        <div className="flex items-center gap-2">
          <Button onClick={() => handleAdjust(1)} disabled={adjust.isPending || amount < 1} className="flex-1">
            {adjust.isPending && <Loader2 className="size-3.5 animate-spin" />}
            发放 {amount}
          </Button>
          <Button variant="outline" onClick={() => handleAdjust(-1)} disabled={adjust.isPending || amount < 1}>
            扣减
          </Button>
        </div>
        <p className="text-12 text-faint">
          经费:充值 / 兑换码 / 管理员发放,长期有效不过期(0090 起不再分临时/永久)。经费=分(100 经费 = ¥1)。
        </p>
      </div>

      {/* 重置次数(0090:重置额度的唯一凭证;经费买不到重置,用户次数用尽后只能在这里补发) */}
      <div className="flex flex-col gap-2 border-t border-border-soft pt-3">
        <Label className="text-12 text-faint">发放重置次数</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={1000}
            value={passCount}
            onChange={(e) => setPassCount(Number(e.target.value))}
            className="h-8 w-20"
            placeholder="次数"
          />
          <span className="text-12 text-faint">次,有效期</span>
          <Input
            type="number"
            min={1}
            value={passDays}
            onChange={(e) => setPassDays(Number(e.target.value))}
            className="h-8 w-20"
            placeholder="天数"
          />
          <span className="text-12 text-faint">天</span>
          <Button
            size="sm"
            onClick={async () => {
              if (passCount < 1) return;
              await apiToast(
                grantPasses.mutateAsync({ id: user.id, count: passCount, days: passDays, note: note.trim() }),
                { success: `已发放 ${passCount} 次重置次数`, failure: '发放重置次数失败' }
              );
            }}
            disabled={grantPasses.isPending || passCount < 1}
          >
            {grantPasses.isPending && <Loader2 className="size-3.5 animate-spin" />}
            发放
          </Button>
        </div>
        <p className="text-12 text-faint">
          每次可将本周期额度立即重置回 100%;到期未用自动作废(备注共用上方输入框,记入审计日志)。
        </p>
      </div>
    </div>
  );
}
