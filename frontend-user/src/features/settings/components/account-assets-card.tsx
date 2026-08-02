// 账户资产汇总卡 —— 严格对齐设计稿 scholay-money.pen「账户资产长条组件」:
// 当前档一行(铭牌 + ? + 剩余额度条 + 剩余% + 方形重置 | 竖分隔 | 经费内联含失效日),
// 横分隔后是 Pro/Max 升级诱导行(套餐徽标图标 + 灰轨 + 🔒升级解锁),底部说明轮播。
import { useState } from 'react';
import { RefreshCw, Lock, Loader2, ChevronLeft, ChevronRight, Coins, Gem, Crown, Sparkles, Gauge, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/shared/ui/dialog';
import { SubscribeDialog, subscribePayMethods } from '@/shared/components';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { useResetQuota, usePlans, quoteSubscription, type Overview, type Tier } from '../api/membership';
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
const NAMEPLATE: Record<Tier, string> = {
  free: 'bg-surface-2 text-subtle border border-border',
  pro: 'bg-surface-card text-foreground border border-foreground',
  max: 'bg-foreground text-on-dark',
};
const ALL_TIERS: Tier[] = ['free', 'pro', 'max'];

// 倍率口径:Pro 相对 Free,Max 相对 Pro。倍率与充值汇率都从后端 plans 取(动态),兜底 5/5/100。
// 0090:重置只扣重置次数、经费买不到重置、无临时经费 —— 轮播文案与此口径对齐,别把旧话术加回来。
function buildSlides(proMult: number, maxMult: number, rate: number) {
  return [
    { title: '各档能用多少', body: `Pro 的 AI 用量是 Free 的 ${proMult} 倍,Max 又是 Pro 的 ${maxMult} 倍。档位越高,一周能连着干的活越多。` },
    { title: '会员多了什么', body: 'Pro 和 Max 能优先用上更强的 AI 模型,新功能也先给你用;Max 还能在高峰期优先处理。' },
    { title: '用完了怎么办', body: '额度从你第一次用 AI 那天起算,7 天后自动回满。不想等,可以用 1 次重置次数当场回满。' },
    { title: '经费怎么用', body: `按 1 元 = ${rate} 经费到账,充多少用多少。开启「用经费继续」后,额度用完还能接着干活 —— 只扣超出额度的那部分。` },
  ];
}

// onGoRecharge 保留在签名里:充值入口本身仍在(用户拍板照旧),只是「额度耗尽 → 去充值」
// 这条引导被删了(经费买不到重置)。调用方无需改。
export function AccountAssetsCard({ data }: { data: Overview; onGoRecharge?: () => void }) {
  const locked = ALL_TIERS.filter((t) => TIER_RANK[t] > TIER_RANK[data.tier]);
  const { data: plans } = usePlans();
  const { subscribe } = useSubscribeFlow();
  const [upgrade, setUpgrade] = useState<{ open: boolean; tier?: 'pro' | 'max' }>({ open: false });

  const methods = subscribePayMethods(plans?.payment_methods, plans?.test_payment ?? false);
  const proMult = plans?.plans?.find((p) => p.tier === 'pro')?.multiplier ?? 5;
  const maxMult = plans?.plans?.find((p) => p.tier === 'max')?.multiplier ?? 5;
  const rate = plans?.recharge_rate ?? 100; // 0095:经费=分,¥1 = 100 经费(汇率可调,以后端为准)
  const openUpgrade = (tier?: 'pro' | 'max') => setUpgrade({ open: true, tier });

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
          <Button
            size="sm"
            onClick={() => openUpgrade()}
            className="h-7 gap-1 bg-brand-red px-2.5 text-on-brand hover:bg-brand-red/90"
          >
            <Sparkles className="size-3.5" />
            {data.tier === 'free' ? '升级会员' : data.tier === 'max' ? '续期会员' : '续期 / 升级'}
          </Button>
        </div>
      </div>

      <ActiveRow data={data} />

      {locked.length > 0 && (
        <>
          <div className="my-3 h-px bg-border-soft" />
          <div className="flex flex-col gap-2.5">
            {locked.map((t) => (
              <LockedRow key={t} tier={t} onUpgrade={() => openUpgrade(t as 'pro' | 'max')} />
            ))}
          </div>
        </>
      )}

      <ExplainerCarousel proMult={proMult} maxMult={maxMult} rate={rate} />

      <SubscribeDialog
        open={upgrade.open}
        onOpenChange={(o) => setUpgrade((u) => ({ ...u, open: o }))}
        plans={plans?.plans ?? []}
        popularTier={plans?.popular_plan}
        currentTier={data.tier}
        currentCycle={data.cycle}
        quote={quoteSubscription}
        methods={methods}
        initialTier={upgrade.tier}
        onPay={(tier, method, cycle) => subscribe(tier, method, cycle, PLAN_LABEL[tier])}
      />
    </section>
  );
}

function ActiveRow({ data }: { data: Overview }) {
  // 邀请奖励活动信号(与卡顶 usePlans 同 queryKey,命中缓存零额外请求)
  const { data: plans } = usePlans();
  const t = data.token;
  const remaining = t.unlimited || !t.window_started_at ? 100 : Math.max(0, 100 - t.percent); // 剩余百分比(未开窗=满额)
  const exhausted = !t.unlimited && remaining <= 0;
  // 0090:临时经费批次(lots)已下线,经费只剩一种、不过期 —— 没有「最近到期批次」可提示。
  const ri = resetInfo(t);
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center gap-2">
        <span className={cn('inline-flex h-6 shrink-0 items-center rounded-4 px-2 text-12 font-medium', NAMEPLATE[data.tier])}>
          {data.tier.toUpperCase()}
        </span>
        <span className="flex size-4 shrink-0 items-center justify-center rounded-pill border border-border text-12 text-faint" title={`这条杠是你这一轮还剩多少 AI 额度。从第一次用 AI 起算 ${t.window_days} 天,到点自动回满;不想等可以用 1 次重置次数当场回满。`}>?</span>
        <span className="shrink-0 text-12 font-medium text-subtle">{PLAN_LABEL[data.tier]} 剩余额度</span>
        <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
          {!t.unlimited && (
            <div
              className={cn('h-full rounded-pill', exhausted ? 'bg-brand-red' : remaining <= 20 ? 'bg-brand-amber' : 'bg-brand-green')}
              style={{ width: `${remaining}%` }}
            />
          )}
        </div>
        <span className={cn('w-9 shrink-0 text-right text-12 tabular-nums', exhausted ? 'text-brand-red' : 'text-faint')}>
          {t.unlimited ? '不限' : `${remaining}%`}
        </span>
        {/* 重置时间(业界做法:相对为主、绝对做 tooltip)—— 未开窗=「满额·用后计时」,窗口内=「N 天后重置」 */}
        {!t.unlimited && (
          <span
            className={cn('flex shrink-0 items-center gap-1 whitespace-nowrap text-12', exhausted ? 'text-brand-red' : 'text-faint')}
            title={ri.hint}
          >
            <RefreshCw className="size-3 shrink-0" />
            {ri.notStarted ? '满额 · 用后计时' : ri.rel}
          </span>
        )}
        <ResetDialog data={data} exhausted={exhausted} />
      </div>

      <div className="h-10 w-px shrink-0 bg-border" />

      <div className="flex w-36 shrink-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <Coins className="size-3.5 shrink-0 text-faint" />
          {/* 0094:经费是小数(单次调用常只花零点几),固定两位;整数时不显示无意义的 .00 */}
          <span className="text-20 font-medium leading-none tabular-nums text-foreground">
            {Number.isInteger(data.credit.total) ? data.credit.total : data.credit.total.toFixed(2)}
          </span>
          <span className="text-12 text-faint">经费</span>
        </div>
        {/* 🔴 2026-07-31 拍板:「算力点」是内部计量单位,用户端一律不展示(推翻旧「必须同屏」口径)。
            经费=分(0095 起 ¥1=100 经费),数字本身即可读出价值,无需换算展示。 */}
        {data.reset_passes > 0 && (
          <span className="text-12 text-faint">可重置 {data.reset_passes} 次</span>
        )}
        {/* 最近一批重置次数的到期时刻(null = 无可用次数);批内计数后端不下发,N 用总次数。 */}
        {data.reset_passes > 0 && data.reset_pass_next_expiry && (
          <span className="text-12 text-faint">
            {data.reset_passes} 次将于 {monthDay(data.reset_pass_next_expiry)} 前有效
          </span>
        )}
        {/* 邀请奖励活动(0100):余额位内嵌入口 —— Gamma「点余额见邀请」范式,活动开启才显示。 */}
        {(plans?.invite_reward_credits ?? 0) > 0 && (
          <Link to="/settings/invite" className="text-12 text-brand-red hover:underline">
            邀请有奖 · 每邀 1 人 +{plans?.invite_reward_credits} 经费 →
          </Link>
        )}
      </div>
    </div>
  );
}

function LockedRow({ tier, onUpgrade }: { tier: Tier; onUpgrade: () => void }) {
  const VIcon = TIER_ICON[tier];
  return (
    <div className="flex items-center gap-2">
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-4', TIER_BADGE[tier])}>
        <VIcon className="size-3" />
      </span>
      <span className="shrink-0 text-12 font-medium text-faint">{PLAN_LABEL[tier]} 额度</span>
      <div className="h-2 flex-1 rounded-pill bg-surface-2" />
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

function ExplainerCarousel({ proMult, maxMult, rate }: { proMult: number; maxMult: number; rate: number }) {
  const [i, setI] = useState(0);
  const slides = buildSlides(proMult, maxMult, rate);
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
  // 0090:重置扣的是**重置次数**不是经费 —— 按经费余额判会两头都错
  // (有次数没经费的点不到按钮;有经费没次数的点了吃 400)。
  const enough = data.reset_passes > 0;

  const onReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success('额度已回满,可以接着用了');
      setOpen(false);
    } catch (err) {
      toast.error(toApiError(err).message || '没能重置,请再试一次');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        title="使用重置次数重置额度"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-8 border transition-colors',
          exhausted ? 'border-brand-red text-brand-red hover:bg-danger-soft' : 'border-border text-faint hover:bg-surface-2'
        )}
      >
        <RefreshCw className="size-3.5" />
      </button>
      <DialogContent>
        {enough ? (
          <>
            <DialogHeader>
              <DialogTitle>{exhausted ? 'AI 额度用完了' : '把额度恢复满额'}</DialogTitle>
              <DialogDescription>
                用掉 1 次重置次数,额度马上回满 —— 用完你还剩 <b className="text-foreground">{Math.max(0, data.reset_passes - 1)}</b> 次。也可以什么都不做,等它到期自动回满。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">先不用</Button>
              </DialogClose>
              <Button size="sm" onClick={onReset} disabled={reset.isPending}>
                {reset.isPending && <Loader2 className="size-3.5 animate-spin" />}
                马上回满
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>重置次数用完了</DialogTitle>
              <DialogDescription>
                {/* 刻意不引导充值:0090 起经费买不到重置,给一条走不通的路比不给更糟。 */}
                你的重置次数已经用完了。这一轮额度到期会自动回满;想现在就有更多额度,可以升级会员。
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
