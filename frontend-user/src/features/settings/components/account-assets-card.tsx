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
  pro: 'bg-background text-foreground border border-foreground',
  max: 'bg-foreground text-background',
};
const ALL_TIERS: Tier[] = ['free', 'pro', 'max'];

// 倍率口径:Pro 相对 Free,Max 相对 Pro。倍率从后端 plans 取(动态),兜底 5/5。
function buildSlides(proMult: number, maxMult: number) {
  return [
    { title: '额度区别', body: `Free 为基础周期额度(7 天),Pro 是 Free 的 ${proMult} 倍,Max 是 Pro 的 ${maxMult} 倍。额度越高,可连续使用越多。` },
    { title: '会员特权', body: 'Pro / Max 优先使用更强 AI 模型、新功能优先体验;Max 享顶级优先级与最强模型。' },
    { title: '额度重置机制', body: '额度按 7 天周期计算:首次使用开始计时,周期到期自动恢复 100%。耗尽后也可消耗经费立即重置。' },
    { title: '经费说明', body: '临时经费有失效日期(订阅赠送、整月有效),永久经费长期有效(充值)。' },
  ];
}

export function AccountAssetsCard({ data, onGoRecharge }: { data: Overview; onGoRecharge: () => void }) {
  const locked = ALL_TIERS.filter((t) => TIER_RANK[t] > TIER_RANK[data.tier]);
  const { data: plans } = usePlans();
  const { subscribe } = useSubscribeFlow();
  const [upgrade, setUpgrade] = useState<{ open: boolean; tier?: 'pro' | 'max' }>({ open: false });

  const methods = subscribePayMethods(plans?.payment_methods, plans?.test_payment ?? false);
  const proMult = plans?.plans?.find((p) => p.tier === 'pro')?.multiplier ?? 5;
  const maxMult = plans?.plans?.find((p) => p.tier === 'max')?.multiplier ?? 5;
  const openUpgrade = (tier?: 'pro' | 'max') => setUpgrade({ open: true, tier });

  return (
    <section className="rounded-md border border-border bg-background p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">账户资产</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-faint">
            {PLAN_LABEL[data.tier]}
            {data.tier !== 'free' && data.expires_at ? ` · 有效期至 ${data.expires_at.slice(0, 10)}` : ''}
          </span>
          <Button
            size="sm"
            onClick={() => openUpgrade()}
            className="h-7 gap-1 bg-brand-red px-2.5 text-background hover:bg-brand-red/90"
          >
            <Sparkles className="size-3.5" />
            {data.tier === 'free' ? '升级会员' : data.tier === 'max' ? '续期会员' : '续期 / 升级'}
          </Button>
        </div>
      </div>

      <ActiveRow data={data} onGoRecharge={onGoRecharge} />

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

      <ExplainerCarousel proMult={proMult} maxMult={maxMult} />

      <SubscribeDialog
        open={upgrade.open}
        onOpenChange={(o) => setUpgrade((u) => ({ ...u, open: o }))}
        plans={plans?.plans ?? []}
        popularTier={plans?.popular_plan}
        currentTier={data.tier}
        quote={quoteSubscription}
        methods={methods}
        initialTier={upgrade.tier}
        onPay={(tier, method) => subscribe(tier, method, PLAN_LABEL[tier])}
      />
    </section>
  );
}

function ActiveRow({ data, onGoRecharge }: { data: Overview; onGoRecharge: () => void }) {
  const t = data.token;
  const remaining = t.unlimited || !t.window_started_at ? 100 : Math.max(0, 100 - t.percent); // 剩余百分比(未开窗=满额)
  const exhausted = !t.unlimited && remaining <= 0;
  const lot = data.credit.lots[0];
  const ri = resetInfo(t);
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center gap-2">
        <span className={cn('inline-flex h-6 shrink-0 items-center rounded-sm px-2 text-2xs font-bold tracking-wider', NAMEPLATE[data.tier])}>
          {data.tier.toUpperCase()}
        </span>
        <span className="flex size-4 shrink-0 items-center justify-center rounded-pill border border-border text-2xs text-faint" title={`进度条与百分比为本周期(${t.window_days} 天)AI 额度的剩余;周期自首次使用起算,到期自动恢复满额,耗尽也可消耗经费立即重置`}>?</span>
        <span className="shrink-0 text-2xs font-medium text-subtle">{PLAN_LABEL[data.tier]} 剩余额度</span>
        <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
          {!t.unlimited && (
            <div
              className={cn('h-full rounded-pill', exhausted ? 'bg-brand-red' : remaining <= 20 ? 'bg-brand-amber' : 'bg-brand-green')}
              style={{ width: `${remaining}%` }}
            />
          )}
        </div>
        <span className={cn('w-9 shrink-0 text-right text-2xs tabular-nums', exhausted ? 'text-brand-red' : 'text-faint')}>
          {t.unlimited ? '不限' : `${remaining}%`}
        </span>
        {/* 重置时间(业界做法:相对为主、绝对做 tooltip)—— 未开窗=「满额·用后计时」,窗口内=「N 天后重置」 */}
        {!t.unlimited && (
          <span
            className={cn('flex shrink-0 items-center gap-1 whitespace-nowrap text-2xs', exhausted ? 'text-brand-red' : 'text-faint')}
            title={ri.hint}
          >
            <RefreshCw className="size-3 shrink-0" />
            {ri.notStarted ? '满额 · 用后计时' : ri.rel}
          </span>
        )}
        <ResetDialog data={data} exhausted={exhausted} onGoRecharge={onGoRecharge} />
      </div>

      <div className="h-10 w-px shrink-0 bg-border" />

      <div className="flex w-36 shrink-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <Coins className="size-3.5 shrink-0 text-faint" />
          <span className="text-xl font-bold leading-none tabular-nums text-foreground">{data.credit.total}</span>
          <span className="text-2xs text-faint">经费</span>
        </div>
        <span className="text-2xs leading-tight text-faint">
          {lot ? `${lot.amount} 临时 · ${monthDay(lot.expires_at)}失效` : `永久 ${data.credit.perm}`}
        </span>
      </div>
    </div>
  );
}

function LockedRow({ tier, onUpgrade }: { tier: Tier; onUpgrade: () => void }) {
  const VIcon = TIER_ICON[tier];
  return (
    <div className="flex items-center gap-2">
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-sm', TIER_BADGE[tier])}>
        <VIcon className="size-3" />
      </span>
      <span className="shrink-0 text-2xs font-medium text-faint">{PLAN_LABEL[tier]} 额度</span>
      <div className="h-2 flex-1 rounded-pill bg-surface-2" />
      <button
        onClick={() => tier !== 'free' && onUpgrade()}
        title="升级解锁更高额度"
        className="flex shrink-0 items-center gap-1 rounded-pill border border-brand-red/40 px-2 py-0.5 text-2xs font-bold text-brand-red transition-colors hover:bg-brand-red hover:text-background"
      >
        <Lock className="size-3" /> 升级解锁
      </button>
    </div>
  );
}

function ExplainerCarousel({ proMult, maxMult }: { proMult: number; maxMult: number }) {
  const [i, setI] = useState(0);
  const slides = buildSlides(proMult, maxMult);
  const s = slides[i % slides.length];
  return (
    <div className="mt-4 flex items-center gap-3 rounded-md border border-border-soft bg-surface-1 p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-faint">
        <Gauge className="size-4" />
      </span>
      <div className="flex-1">
        <p className="text-xs font-bold text-foreground">{s.title}</p>
        <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">{s.body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-2xs tabular-nums text-faint">{(i % slides.length) + 1}/{slides.length}</span>
        <button onClick={() => setI((i - 1 + slides.length) % slides.length)} className="flex size-6 items-center justify-center rounded-sm border border-border text-faint transition-colors hover:bg-surface-2">
          <ChevronLeft className="size-3.5" />
        </button>
        <button onClick={() => setI((i + 1) % slides.length)} className="flex size-6 items-center justify-center rounded-sm border border-border text-faint transition-colors hover:bg-surface-2">
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function ResetDialog({ data, exhausted, onGoRecharge }: { data: Overview; exhausted: boolean; onGoRecharge: () => void }) {
  const reset = useResetQuota();
  const [open, setOpen] = useState(false);
  const enough = data.credit.total >= data.reset_cost;

  const onReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success('本周期额度已重置为 100%');
      setOpen(false);
    } catch (err) {
      toast.error(toApiError(err).message || '重置失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        title="消耗经费重置额度"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors',
          exhausted ? 'border-brand-red text-brand-red hover:bg-danger-soft' : 'border-border text-faint hover:bg-surface-2'
        )}
      >
        <RefreshCw className="size-3.5" />
      </button>
      <DialogContent>
        {enough ? (
          <>
            <DialogHeader>
              <DialogTitle>{exhausted ? '本周期额度已耗尽' : '重置本周期额度'}</DialogTitle>
              <DialogDescription>
                消耗 <b className="text-foreground">{data.reset_cost}</b> 经费立即把本周期 AI 额度重置为 100%(当前 {data.credit.total} 经费),或等待周期到期自动重置。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">稍后再说</Button>
              </DialogClose>
              <Button size="sm" onClick={onReset} disabled={reset.isPending}>
                {reset.isPending && <Loader2 className="size-3.5 animate-spin" />}
                使用 {data.reset_cost} 经费重置
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>经费不足,无法重置</DialogTitle>
              <DialogDescription>
                重置需 {data.reset_cost} 经费,当前仅 {data.credit.total}。可升级会员获更多额度与经费,或直接充值经费。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Link to="/pricing">
                <Button variant="outline" size="sm">升级会员</Button>
              </Link>
              <Button size="sm" onClick={() => { setOpen(false); onGoRecharge(); }}>购入经费</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
