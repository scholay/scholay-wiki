import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import { useBillingConfig } from '../api/billing-config';
import {
  useGrantVip,
  useRevokeVip,
  useAdjustWallet,
  useGrantResetPasses,
  type AdminUser,
  type GrantUnit,
  type UserVipStatus,
} from '../api/users';

const TIER_LABEL: Record<'pro' | 'max', string> = { pro: 'Pro', max: 'Max' };

// ─── 授予时长:数量 + 单位(0110)────────────────────────────────────────────
// 后端 POST /admin/users/:id/vip 的 `days` 字段自 0110 起是**数量**,真正的单位看 `unit`。
// 月/年走 carbon NoOverflow 的真自然月/年(1/31 发 1 个月 = 2/28),不是 30/365 天。

/** 单位中文名,与后端 vip.GrantUnitLabel 一字不差(拼在数量后面:「3 个月」)。 */
const UNIT_LABEL: Record<GrantUnit, string> = { day: '天', month: '个月', year: '年' };
/** 单位选择器上的按钮文字(不能用 UNIT_LABEL:按钮上写「个月」很怪)。 */
const UNIT_BUTTON_LABEL: Record<GrantUnit, string> = { day: '天', month: '月', year: '年' };
/** 预设必须随单位走 —— 「180 个月」「365 年」这种预设按钮点下去就是事故。 */
const UNIT_PRESETS: Record<GrantUnit, number[]> = {
  day: [30, 90, 180, 365],
  month: [1, 3, 6, 12],
  year: [1, 2, 3],
};
/** 换单位时数量必须跟着回到该单位的常用默认值(30 天换成月 = 30 个月,是量级事故)。 */
const UNIT_DEFAULT: Record<GrantUnit, number> = { day: 30, month: 1, year: 1 };
/** 后端 maxGrantAmount 的上界(超出会被后端静默夹取,这里先提示)。 */
const UNIT_MAX: Record<GrantUnit, number> = { day: 3650, month: 120, year: 10 };
/**
 * 超过这个数量要多确认一次(手滑把 1 打成 10 的量级不该静默通过)。
 *
 * 🔴 **阈值必须按单位分别定,不能沿用「>365」那个天数常量**:换单位后
 * 「12 个月」只有 12、「3 年」只有 3,一个天数阈值会让这道防手滑闸门**整族失效**。
 * 三档折算后都是「超过一年」= 一致口径。
 */
const UNIT_CONFIRM_OVER: Record<GrantUnit, number> = { day: 365, month: 12, year: 1 };
/** 折算成近似天数,只用于确认文案里的「≈ N 年」(镜像后端 GrantDurationDays 的 30/365 常量分母)。 */
const UNIT_APPROX_DAYS: Record<GrantUnit, number> = { day: 1, month: 30, year: 365 };
/** recharge_rate 兜底(0095 起为 100,即经费=分);真值从 /admin/billing/config 拿。 */
const FALLBACK_RECHARGE_RATE = 100;

/**
 * 管理员对单个用户「发放会员 / 调整经费 / 发放重置次数」的操作面板(独立用户操作抽屉)。
 *   - 会员:选档(Pro / Max)+ 天数 → 授予 / 续期;已是会员可取消(回 Free)。
 *   - 经费:金额(单位=分,0090 起不再分临时/永久)→ 发放 / 扣减。
 * 分别打到后端 POST /admin/users/:id/vip 与 POST /admin/users/:id/wallet/adjust。
 *
 * 🔴 **写钱的三个动作全部走二次确认**(发放经费 / 扣减经费 / 发放重置次数)。
 * 理由不是"防手抖"这么轻:写的是 credit_transactions 这种**只增不删**的账本,
 * 扣错只能再发一笔反向流水对冲,账面上永远留着两笔。两个放大因素让误操作概率并不低:
 *   ① 抽屉是复用的,`UserActionsDrawer` 已给本组件挂 `key={user.id}` 强制重挂,
 *      切用户时金额会回到默认 100 —— 但同一用户内连续两次操作仍会沿用上次数值;
 *   ② 单位是**分**(100 经费 = ¥1),把 10000 当成 ¥100 发出去就是 100 倍。
 * 所以确认文案里必须同时出现「原始数值」和「折合人民币」,让量级错误在读的时候就暴露。
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
  // 充值汇率是可调旋钮(BillingConfigPage 能改),不写死 —— 确认文案里的「折合 ¥」必须跟着它走,
  // 否则汇率一改,这里就会在一个不可撤销操作前显示错误的金额。取不到时回落 0095 的 100。
  const billing = useBillingConfig();
  const rate = billing.data?.recharge_rate || FALLBACK_RECHARGE_RATE;
  const toYuan = (credits: number) => (credits / rate).toFixed(2);

  // 编辑已有会员时默认保持当前档位。Max 用户若默认回到 Pro，
  // 管理员只是想续期却会意外降档。本组件在 VIP 真值到达后才挂载。
  const [tier, setTier] = useState<'pro' | 'max'>(vip?.tier === 'max' ? 'max' : 'pro');
  // 授予时长 = 数量 + 单位(0110)。默认「1 个月」——运营最常发的就是一个月,
  // 让默认值等于最常用值可以少一次修改、少一次手滑。
  const [grantUnit, setGrantUnit] = useState<GrantUnit>('month');
  const [grantAmount, setGrantAmount] = useState(UNIT_DEFAULT.month);
  // 计费周期标识(0079):keep=不改动现值(默认,防随手补天数冲掉年费徽标)。
  const [cycle, setCycle] = useState<'keep' | 'monthly' | 'yearly'>('keep');
  const [creditKind] = useState<'perm' | 'temp'>('perm'); // 0090:固定永久,选择器已删
  const [amount, setAmount] = useState(100);
  const [creditDays] = useState(30); // 0090:经费不过期,天数不再可编辑(仍随请求发出,后端忽略)
  const [note, setNote] = useState(''); // 调账备注 → credit_transactions.note(流水里可见,便于对账归因)
  const [passCount, setPassCount] = useState(1); // 发放重置次数(0090 起次数是重置额度唯一凭证)
  const [passDays, setPassDays] = useState(365); // 次数有效期(天)

  const isPro = vip?.tier === 'pro' || vip?.tier === 'max';

  const unitLabel = UNIT_LABEL[grantUnit];
  const unitMax = UNIT_MAX[grantUnit];
  // 后端超上界会静默夹取 —— 按钮/确认框/toast 一律显示**实际会发出去的那个数**,
  // 不显示输入框里那个会被丢弃的数,否则 toast 说「发了 999 年」而实际只发了 10 年。
  const grantEff = Math.min(Math.max(grantAmount, 1), unitMax);
  const overMax = grantAmount > unitMax;

  /** 换单位 = 换量纲,数量必须回到新单位的默认值(否则 30 天一键变 30 个月)。 */
  const pickUnit = (u: GrantUnit) => {
    if (u === grantUnit) return;
    setGrantUnit(u);
    setGrantAmount(UNIT_DEFAULT[u]);
  };

  const handleGrant = async () => {
    if (grantAmount < 1) return;
    // 超长授予多确认一次:把 1 打成 10 在这个输入框里只差一个键,而会员时长直接是钱。
    // 阈值按单位取(见 UNIT_CONFIRM_OVER 的红字:写死天数会让这道闸门在月/年单位下整族失效)。
    if (grantEff > UNIT_CONFIRM_OVER[grantUnit]) {
      const approxYears = (grantEff * UNIT_APPROX_DAYS[grantUnit]) / 365;
      const ok = await confirm({
        title: `给 ${displayName} 授予 / 续期 ${grantEff} ${unitLabel} ${TIER_LABEL[tier]}?`,
        description: `${grantEff} ${unitLabel} ≈ ${approxYears.toFixed(1)} 年,超过常规最长档(${UNIT_CONFIRM_OVER[grantUnit]} ${unitLabel})。请确认不是多打了一位。`,
        confirmText: `确认 ${grantEff} ${unitLabel}`,
      });
      if (!ok) return;
    }
    await apiToast(
      grant.mutateAsync({
        id: user.id,
        tier,
        days: grantEff, // 后端 days 字段 = 数量,单位由 unit 决定
        unit: grantUnit,
        ...(cycle !== 'keep' ? { cycle } : {}),
      }),
      {
        success: `已为 ${displayName} 授予 / 续期 ${grantEff} ${unitLabel} ${TIER_LABEL[tier]}${
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
    const confirmed = await confirm({
      title: `${label} ${amount.toLocaleString()} 经费 给 ${displayName}?`,
      description: (
        <span className="flex flex-col gap-1">
          <span>
            折合 <strong className="text-foreground">¥{toYuan(amount)}</strong>({rate} 经费 = ¥1)。
            写入经费流水后不可撤销 —— 经费流水只增不删,发/扣错了只能再发一笔反向流水对冲。
          </span>
          <span className={note.trim() ? 'text-muted-foreground' : 'text-brand-amber'}>
            {note.trim() ? `备注:${note.trim()}` : '未填备注 —— 这笔调账在对账时将无从归因。'}
          </span>
        </span>
      ),
      danger: sign < 0,
      confirmText: `确认${label} ${amount.toLocaleString()}`,
    });
    if (!confirmed) return;
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-8 border border-border bg-surface-1 px-3 py-2 text-12">
        <span className="text-faint">当前会员</span>
        <span className="font-medium text-foreground">
          {vip?.tier === 'max' ? 'Max' : vip?.tier === 'pro' ? 'Pro' : 'Free'}
          {vip?.expires_at ? ` · 至 ${vip.expires_at.slice(0, 10)}` : ''}
        </span>
      </div>
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
        </div>
        {/* 发放时长 = 数量 + 单位(0110)。
            🔴 与下面的「周期标识」是**两件事**,两行说明文字刻意写成对照口径:
            这里改的是到期日,下面改的只是徽标。并排放又都带「月/年」字样,极易被当成一个。 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-12 text-faint">发放时长</span>
          <Input
            type="number"
            min={1}
            max={unitMax}
            value={grantAmount}
            onChange={(e) => setGrantAmount(Number(e.target.value))}
            className="h-8 w-16"
          />
          {(['day', 'month', 'year'] as const).map((u) => (
            <Button
              key={u}
              type="button"
              size="sm"
              variant={grantUnit === u ? 'default' : 'outline'}
              onClick={() => pickUnit(u)}
            >
              {UNIT_BUTTON_LABEL[u]}
            </Button>
          ))}
          {UNIT_PRESETS[grantUnit].map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              variant={grantAmount === n ? 'default' : 'outline'}
              onClick={() => setGrantAmount(n)}
            >
              {n}
              {unitLabel}
            </Button>
          ))}
        </div>
        <span className="text-12 text-faint">
          <strong className="font-medium text-subtle">这次发多久</strong> —— 直接决定到期日。
          「月 / 年」按<strong className="font-medium text-subtle">自然月 / 自然年</strong>
          推算(1/31 发 1 个月到 2/28),不是 30 / 365 天。
        </span>
        {overMax && (
          <span className="text-12 text-brand-amber">
            超过上限 {unitMax} {unitLabel},本次实际只会发放 {grantEff} {unitLabel}。
          </span>
        )}
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
        </div>
        <span className="text-12 text-faint">
          <strong className="font-medium text-subtle">只是徽标</strong> —— 决定用户端显示「年费会员 /
          月度会员」,<strong className="font-medium text-subtle">不影响时长</strong>,与上面的发放时长无关。
        </span>
        <div className="flex items-center gap-2">
          <Button onClick={handleGrant} disabled={grant.isPending || grantAmount < 1} className="flex-1">
            {grant.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPro ? '续期' : '授予'} {grantEff} {unitLabel} {TIER_LABEL[tier]}
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
          {/* 0095 起 recharge_rate=100 → 经费=分,防止把「100」当 ¥100 发出去(实际是 ¥1)。
              汇率取自 /admin/billing/config(可调),不写死。 */}
          <span className="text-12 text-faint">
            {rate} 经费 = ¥1 · 当前输入折合 ¥{toYuan(amount > 0 ? amount : 0)}
          </span>
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
          经费:充值 / 兑换码 / 管理员发放,长期有效不过期(0090 起不再分临时/永久)。经费=分({rate} 经费 = ¥1)。
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
              // 0090 起「重置次数」是重置周期额度的**唯一凭证**(经费买不到),等同于直接发额度 —— 同样二次确认。
              const ok = await confirm({
                title: `给 ${displayName} 发放 ${passCount} 次重置次数?`,
                description: `每次可将该用户本周期 AI 额度立即重置回 100%,有效期 ${passDays} 天。发放后不可撤销(只能等其到期作废)。`,
                confirmText: `确认发放 ${passCount} 次`,
              });
              if (!ok) return;
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
