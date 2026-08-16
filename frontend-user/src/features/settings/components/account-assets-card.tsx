// 账户资产汇总卡 —— 严格对齐设计稿 scholay-money.pen「账户资产长条组件」:
// 当前额度一行(进度条 + 剩余% / 下方重置信息 | 竖分隔 | 经费数字),
// 横分隔后是 Pro/Max 升级诱导行(套餐徽标图标 + 灰轨 + 🔒升级解锁),底部说明轮播。
import { useState } from 'react';
import { Lock, Loader2, ChevronLeft, ChevronRight, Coins, Gem, Crown, Sparkles, Gauge, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/shared/ui/dialog';
import { subscribePayMethods, WechatPayDialog } from '@/shared/components';
import { MembershipActionDialog } from '@/shared/components/membership-action-dialog';
import {
  primaryAction,
  renewOptions,
  upgradeOptions,
} from '@/shared/lib/membership-options';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { useResetQuota, useSetCreditAutopay, usePlans, quoteSubscription, type Overview, type Tier } from '../api/membership';
import { monthDay, resetInfo } from '../lib/quota-display';
import { useSubscribeFlow } from './billing-panels';

const PLAN_LABEL: Record<Tier, string> = { free: 'Free', pro: 'Pro', max: 'Max' };
const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, max: 2 };
// 套餐徽标:Pro=宝石(进阶)/ Max=皇冠(顶级),配各自色调,读成清晰的等级阶梯。
const TIER_ICON: Record<Tier, LucideIcon> = { free: Sparkles, pro: Gem, max: Crown };
const TIER_BADGE: Record<Tier, string> = {
  free: 'bg-surface-2 text-faint',
  pro: 'bg-brand-amber/10 text-brand-amber',
  max: 'bg-brand-red/10 text-brand-red',
};
const TIER_TAG: Record<Tier, string> = {
  free: 'border-border bg-surface-2 text-faint',
  pro: 'border-brand-amber/25 bg-brand-amber/10 text-brand-amber',
  max: 'border-inverse bg-inverse text-on-inverse',
};
const ALL_TIERS: Tier[] = ['free', 'pro', 'max'];

/**
 * 各档相对 **Free** 的额度倍率 —— 与后端 WindowCeiling 同构
 * (backend/internal/vip/billing_model.go:141,147):
 *     Pro 上限 = free × pro_multiplier
 *     Max 上限 = free × pro_multiplier × max_multiplier   ← 注意是**连乘**
 * 所以 plans 里的 max.multiplier 是「Max 相对 Pro」,不是相对 Free;
 * 要展示「Max 是 Free 的几倍」必须乘上 pro 的那一档,漏乘会把 4× 说成 2×。
 */
function tierRatio(tier: Tier, proMult: number, maxMult: number): number {
  if (tier === 'pro') return proMult;
  if (tier === 'max') return proMult * maxMult;
  return 1;
}

/**
 * 该档是否**不限额** —— 后端 fail-open 语义:任一相关倍率 <=0 即该档不限
 * (billing_model.go:138,144 返回 -1;config.go:36 的校验刻意不拦 <=0)。
 * 不处理这一支会把「不限额」算成「0× 当前额度」。
 */
function tierUnlimited(tier: Tier, proMult: number, maxMult: number): boolean {
  if (tier === 'pro') return proMult <= 0;
  if (tier === 'max') return proMult <= 0 || maxMult <= 0;
  return false;
}

/** 倍率显示:整数不带小数点(2 而不是 2.0),非整数保留一位(2.5)。 */
function fmtMultiple(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// 倍率口径:Pro 相对 Free,Max 相对 Pro。倍率与充值汇率都从后端 plans 取(动态),兜底 5/5/100。
// 0090:恢复只扣恢复次数、经费买不到恢复、无临时经费 —— 轮播文案与此口径对齐,别把旧话术加回来。
// windowDays 动态取 billing_config.window_days(admin 旋钮),不写死「7 天」;
// 用词与全站额度文案同律:说「恢复」不说「重置」(见 shared/components/quota-toast.tsx 头部)。
function buildSlides(proMult: number, maxMult: number, rate: number, windowDays: number) {
  return [
    { title: '各档能用多少', body: `Pro 的 AI 额度是 Free 的 ${proMult} 倍,Max 是 Pro 的 ${maxMult} 倍。档位越高,可连续完成的工作量越多。` },
    // 🔴 这一条原本讲「更强模型 / 新功能优先 / 高峰期优先」,2026-08-13 实测三条在代码里
    // 都不存在(min_tier 全空、无优先级队列、无灰度),已换成真实差异:功能不分档,只差额度量级。
    { title: '会员多了什么', body: '三档可使用的功能完全相同,差别在于每周可用的 AI 额度。档位越高,同一周期内能完成的任务越多。' },
    { title: '用完了怎么办', body: `额度自第一次使用 AI 时开始计算,${windowDays} 天后自动恢复至满额。如需立即恢复,可使用 1 次恢复次数。` },
    { title: '经费怎么用', body: `按 1 元 = ${rate} 经费到账,充值多少即可使用多少。开启「用经费继续」后,额度用完可自动使用经费继续,仅扣除超出额度的部分。` },
  ];
}

// onGoRecharge 保留在签名里:充值入口本身仍在(用户拍板照旧),只是「额度耗尽 → 去充值」
// 这条引导被删了(经费买不到重置)。调用方无需改。
export function AccountAssetsCard({ data }: { data: Overview; onGoRecharge?: () => void }) {
  const locked = ALL_TIERS.filter((t) => TIER_RANK[t] > TIER_RANK[data.tier]);
  const { data: plans } = usePlans();
  const { subscribe, wechatOrder, closeWechat, onWechatPaid } = useSubscribeFlow();
  // 升级与续费是两条独立流程,各自一个弹窗(选项集/计价口径都不同)。
  const [flow, setFlow] = useState<'upgrade' | 'renew' | null>(null);

  const methods = subscribePayMethods(plans?.payment_methods, plans?.test_payment ?? false);
  const proMult = plans?.plans?.find((p) => p.tier === 'pro')?.multiplier ?? 5;
  const maxMult = plans?.plans?.find((p) => p.tier === 'max')?.multiplier ?? 5;
  const windowDays = plans?.window_days ?? 7; // admin 旋钮,不写死(理由见 buildSlides 上方)
  const rate = plans?.recharge_rate ?? 100; // 0095:经费=分,¥1 = 100 经费(汇率可调,以后端为准)
  // 倍率兜底值(5/5)与线上配置(实测 2/2)不一致 —— 一个醒目的「×25」写错比不写更糟,
  // 故倍率徽标只在 plans 真的到位后才渲染,未到位时轨道留空。
  const plansLoaded = !!plans?.plans?.length;
  // 本场景的合法选项 —— 单一真源在 shared/lib/membership-options(与后端 5 场景矩阵一一对应)。
  const pricing = plans?.plans ?? [];
  const upOpts = upgradeOptions(data.tier, data.cycle, pricing);
  const renewOpts = renewOptions(data.tier, data.cycle, pricing);
  const primary = primaryAction(data.tier, data.cycle, pricing);
  const openUpgrade = () => setFlow('upgrade');

  return (
    <section className="rounded-16 border border-border bg-surface-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-14 font-medium text-foreground">账户资产</h3>
        <div className="flex items-center gap-2">
          {/* 年费会员徽标(0079)—— 与月度会员显式区分 */}
          {data.cycle === 'yearly' && data.tier !== 'free' && (
            <span className="rounded-pill bg-brand-amber/10 px-2 py-0.5 text-12 font-medium text-brand-amber">年费会员</span>
          )}
          <span className="text-12 text-faint">
            {PLAN_LABEL[data.tier]}
            {data.tier !== 'free' && data.expires_at ? ` · 有效期至 ${data.expires_at.slice(0, 10)}` : ''}
          </span>
          {/* 次级动作:主 CTA 是升级时,续费以文字链形式跟在有效期后面 ——
              与主按钮不同层级(大厂惯例:一屏一个主 CTA),避免两个红按钮并排抢注意力。 */}
          {primary === 'upgrade' && renewOpts.length > 0 && (
            <button
              type="button"
              onClick={() => setFlow('renew')}
              className="text-12 text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              续费
            </button>
          )}
          {/* 🔴 主 CTA 只有一个,续费退到次级文字链(2026-08-12 产品拍板)。
              旧版是一个「续期 / 升级」的合并按钮 —— 两个动作的选项集、计价口径、
              甚至能不能做都不一样(顶档没有升级、年费不能按月续),合并进一个按钮
              等于把选择推给弹窗内部,正是价格对不上的来源。
              主次按业界惯例定:还有更高档可买 → 升级是主;已顶档 → 续费即主。 */}
          <Button
            size="sm"
            onClick={() => setFlow(primary === 'renew' ? 'renew' : 'upgrade')}
            className="h-7 gap-1 bg-brand-red px-2.5 text-on-brand hover:bg-brand-red/90"
          >
            <Sparkles className="size-3.5" />
            {primary === 'subscribe' ? '开通会员' : primary === 'upgrade' ? '升级套餐' : '续费'}
          </Button>
        </div>
      </div>

      <ActiveRow data={data} />

      <CreditAutopayRow data={data} />

      {locked.length > 0 && (
        <>
          <div className="my-3 h-px bg-border-soft" />
          <div className="flex flex-col gap-2.5">
            {locked.map((t) => (
              <LockedRow
                key={t}
                tier={t}
                // 倍率对比的分母是**当前档位**:free 用户看到的就是「相对 Free」,
                // 而 pro 用户看 Max 时要的是「比我现在多几倍」,不是与他无关的「相对 Free 4 倍」。
                unlimited={plansLoaded && tierUnlimited(t, proMult, maxMult)}
                multiple={
                  // 当前档已不限额时不给倍数(没有可比的分母,升级也换不来更多额度)。
                  plansLoaded && !tierUnlimited(data.tier, proMult, maxMult)
                    ? tierRatio(t, proMult, maxMult) / tierRatio(data.tier, proMult, maxMult)
                    : null
                }
                // 轨道填充按「相对最高档」铺,多行并排时形成可读的阶梯。
                fillPct={
                  !plansLoaded
                    ? 0
                    : tierUnlimited(t, proMult, maxMult)
                      ? 100
                      : (tierRatio(t, proMult, maxMult) / tierRatio('max', proMult, maxMult)) * 100
                }
                onUpgrade={openUpgrade}
              />
            ))}
          </div>
        </>
      )}

      <ExplainerCarousel proMult={proMult} maxMult={maxMult} rate={rate} windowDays={windowDays} />

      <MembershipActionDialog
        open={flow !== null}
        onOpenChange={(o) => !o && setFlow(null)}
        mode={flow === 'renew' ? 'renew' : data.tier === 'free' ? 'subscribe' : 'upgrade'}
        options={flow === 'renew' ? renewOpts : upOpts}
        plans={pricing}
        popularTier={plans?.popular_plan}
        quote={quoteSubscription}
        methods={methods}
        onPay={(tier, method, cycle) => subscribe(tier, method, cycle, PLAN_LABEL[tier])}
      />

      {/* 微信支付:上面的 onPay 选微信时会关掉套餐弹窗、把已建订单交到这里继续扫码。
          必须挂上,否则微信分支会留下 pending 孤儿订单(见 useSubscribeFlow 的红字)。 */}
      <WechatPayDialog
        orderNo={wechatOrder?.orderNo ?? null}
        subject={wechatOrder?.subject}
        onOpenChange={(o) => !o && closeWechat()}
        onPaid={onWechatPaid}
      />
    </section>
  );
}

/**
 * 经费按量续用开关属于账户资产状态，而不是“充值”动作。
 * 放在资产卡中让用户在看到余额与额度时即可感知、开关。
 */
function CreditAutopayRow({ data }: { data: Overview }) {
  const setAutopay = useSetCreditAutopay();

  return (
    <div className="mt-3 flex items-center gap-3 rounded-12 border border-border-soft bg-surface-1 px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-faint">
        <Coins className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-14 font-medium text-foreground">用经费继续</p>
        <p className="text-12 text-faint">额度用完后,仅对超出部分按量扣除经费</p>
      </div>
      <Switch
        checked={data.credit.credit_autopay}
        disabled={setAutopay.isPending}
        aria-label="用经费继续"
        onCheckedChange={(enabled) => {
          setAutopay.mutate(enabled, {
            onSuccess: () =>
              toast.success(
                enabled
                  ? '已开启,额度用完后将按实际超出用量扣除经费'
                  : '已关闭,额度用完后不会自动扣除经费',
              ),
            onError: (error) =>
              toast.error(toApiError(error).message || '保存失败'),
          });
        }}
      />
    </div>
  );
}

function ActiveRow({ data }: { data: Overview }) {
  const t = data.token;
  const remaining =
    t.unlimited || !t.window_started_at
      ? 100
      : Math.max(0, 100 - t.percent); // 剩余百分比(未开窗=满额)
  const exhausted = !t.unlimited && remaining <= 0;
  // 0090:临时经费批次(lots)已下线,经费只剩一种、不过期 —— 没有「最近到期批次」可提示。
  const ri = resetInfo(t);

  return (
    <div className="flex items-stretch gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              'inline-flex h-7 shrink-0 items-center rounded-6 border px-2.5 text-12 font-medium',
              TIER_TAG[data.tier],
            )}
          >
            {data.tier === 'free'
              ? 'FREE'
              : `${data.tier.toUpperCase()} 会员`}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
            <div
              className={cn(
                'h-full rounded-pill',
                exhausted
                  ? 'bg-brand-red'
                  : remaining <= 20
                    ? 'bg-brand-amber'
                    : 'bg-brand-green',
              )}
              style={{ width: `${remaining}%` }}
            />
          </div>
          <span
            className={cn(
              'w-20 shrink-0 text-right text-14 font-medium tabular-nums',
              exhausted ? 'text-brand-red' : 'text-muted-foreground',
            )}
          >
            {t.unlimited ? '额度不限' : `剩余 ${remaining}%`}
          </span>
        </div>

        <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
          <span
            className={cn(
              'min-w-0 truncate text-12',
              exhausted ? 'text-brand-red' : 'text-faint',
            )}
            title={ri.hint}
          >
            {t.unlimited
              ? '当前额度不限'
              : ri.notStarted
                ? `满额 · 首次使用后开始 ${t.window_days} 天周期`
                : ri.rel}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-12 text-faint">
              {data.reset_passes > 0
                ? `可用 ${data.reset_passes} 次${
                    data.reset_pass_next_expiry
                      ? ` · ${monthDay(data.reset_pass_next_expiry)}前有效`
                      : ''
                  }`
                : '暂无恢复次数'}
            </span>
            <ResetDialog data={data} exhausted={exhausted} />
          </div>
        </div>
      </div>

      <div className="h-10 w-px shrink-0 bg-border" />

      <div className="flex w-36 shrink-0 items-center justify-center gap-1.5">
        <Coins className="size-3.5 shrink-0 text-faint" />
        {/* 0094:经费是小数(单次调用常只花零点几),固定两位;整数时不显示无意义的 .00 */}
        <span className="text-20 font-medium leading-none tabular-nums text-foreground">
          {Number.isInteger(data.credit.total)
            ? data.credit.total
            : data.credit.total.toFixed(2)}
        </span>
        <span className="text-12 text-faint">经费</span>
        {/* 🔴 2026-07-31 拍板:「算力点」是内部计量单位,用户端一律不展示(推翻旧「必须同屏」口径)。
            经费=分(0095 起 ¥1=100 经费),数字本身即可读出价值,无需换算展示。 */}
      </div>
    </div>
  );
}

/** 更高档位的诱导行:填充到该档比例的轨道 + 「×N 当前额度」徽标 + 升级解锁。
 *  空灰轨传达不出任何信息 —— 填充长度让「更高档 = 更长的条」一眼可读,
 *  徽标给出确切倍数(分母是当前档位,见调用点注释)。
 *  ⚠️ 徽标必须写「×N **当前额度**」而不是「×N 用量」:本行上方是当前档的**用量**条
 *  (满格 = 剩余 100%),两种条同屏时,一条填到 50% 的对比条很容易被读成
 *  「Pro 只有 Free 的一半」。把分母写进徽标,数字自己消歧,不必再加一行说明。 */
function LockedRow({
  tier,
  multiple,
  unlimited,
  fillPct,
  onUpgrade,
}: {
  tier: Tier;
  /** 相对当前档位的倍率;null = plans 未到位 / 当前档已不限额,不显示徽标(不猜数字)。 */
  multiple: number | null;
  /** 该档不限额(后端倍率 <=0):不写倍数,直接说不限额度。 */
  unlimited: boolean;
  fillPct: number;
  onUpgrade: () => void;
}) {
  const VIcon = TIER_ICON[tier];
  return (
    <div className="flex items-center gap-2">
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-4', TIER_BADGE[tier])}>
        <VIcon className="size-3" />
      </span>
      <span className="shrink-0 text-12 font-medium text-faint">{PLAN_LABEL[tier]} 额度</span>
      <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
        <div
          className={cn(
            'h-full rounded-pill transition-[width] duration-slow',
            tier === 'max' ? 'bg-brand-red/70' : 'bg-brand-amber/70',
          )}
          style={{ width: `${Math.min(100, Math.max(0, fillPct))}%` }}
        />
      </div>
      {(unlimited || (multiple !== null && multiple > 1)) && (
        <span
          className={cn(
            'shrink-0 text-12 font-medium tabular-nums',
            tier === 'max' ? 'text-brand-red' : 'text-brand-amber',
          )}
        >
          {unlimited ? '不限额度' : `${fmtMultiple(multiple!)}× 当前额度`}
        </span>
      )}
      <button
        onClick={() => tier !== 'free' && onUpgrade()}
        title="升级解锁更高额度"
        className="flex shrink-0 items-center gap-1 rounded-pill border border-brand-red/40 px-2 py-0.5 text-12 font-medium text-brand-red transition-colors hover:bg-brand-red hover:text-on-brand"
      >
        <Lock className="size-3" /> 升级解锁
      </button>
    </div>
  );
}

function ExplainerCarousel({
  proMult,
  maxMult,
  rate,
  windowDays,
}: {
  proMult: number;
  maxMult: number;
  rate: number;
  windowDays: number;
}) {
  const [i, setI] = useState(0);
  const slides = buildSlides(proMult, maxMult, rate, windowDays);
  const s = slides[i % slides.length];
  return (
    <div className="mt-4 flex items-center gap-3 rounded-12 border border-border-soft bg-surface-1 p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-faint">
        <Gauge className="size-4" />
      </span>
      <div className="flex-1">
        <p className="text-14 font-medium text-foreground">{s.title}</p>
        <p className="mt-0.5 text-12 leading-paragraph text-muted-foreground">{s.body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-12 tabular-nums text-faint">{(i % slides.length) + 1}/{slides.length}</span>
        <button onClick={() => setI((i - 1 + slides.length) % slides.length)} className="flex size-6 items-center justify-center rounded-8 border border-border text-faint transition-colors hover:bg-surface-2">
          <ChevronLeft className="size-3.5" />
        </button>
        <button onClick={() => setI((i + 1) % slides.length)} className="flex size-6 items-center justify-center rounded-8 border border-border text-faint transition-colors hover:bg-surface-2">
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function ResetDialog({ data, exhausted }: { data: Overview; exhausted: boolean }) {
  const reset = useResetQuota();
  const [open, setOpen] = useState(false);
  // 0090:恢复扣的是**恢复次数**不是经费 —— 按经费余额判会两头都错
  // (有次数没经费的点不到按钮;有经费没次数的点了吃 400)。
  const enough = data.reset_passes > 0;

  const onReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success('额度已恢复至满额');
      setOpen(false);
    } catch (err) {
      toast.error(toApiError(err).message || '恢复失败,请稍后重试');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="使用恢复次数立即恢复额度"
        className={cn(
          'flex h-7 shrink-0 items-center justify-center rounded-8 border px-3 text-12 font-medium transition-colors',
          exhausted
            ? 'border-brand-red text-brand-red hover:bg-danger-soft'
            : 'border-border text-faint hover:bg-surface-2',
        )}
      >
        立即恢复
      </button>
      <DialogContent>
        {enough ? (
          <>
            <DialogHeader>
              <DialogTitle>{exhausted ? '额度已用完' : '立即恢复额度'}</DialogTitle>
              <DialogDescription>
                使用 1 次恢复次数,额度将立即回到满额,本次使用后剩余 <b className="text-foreground">{Math.max(0, data.reset_passes - 1)}</b> 次。也可以不做任何操作,等待自动恢复。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">暂不使用</Button>
              </DialogClose>
              <Button size="sm" onClick={onReset} disabled={reset.isPending}>
                {reset.isPending && <Loader2 className="size-3.5 animate-spin" />}
                确认恢复
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>恢复次数已用完</DialogTitle>
              <DialogDescription>
                {/* 刻意不引导充值:0090 起经费买不到恢复次数,给一条走不通的路比不给更糟。 */}
                恢复次数已用完。额度到期会自动恢复至满额;如需更多额度,可升级会员。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">知道了</Button>
              </DialogClose>
              <Link to="/pricing">
                <Button size="sm">升级会员</Button>
              </Link>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
