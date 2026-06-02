import { useState } from 'react';
import { Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { useMembership, useRedeemCode, type FeatureUsage } from '../api/membership';

/**
 * 我的会员 —— 等级/到期 + 各 AI 功能今日额度 + 兑换码兑换。
 * 简单版:VIP 通过兑换码发放;free 与 pro 在各 AI 功能上有不同的每日次数上限。
 */
export function MembershipPage() {
  const { data, isLoading } = useMembership();
  const redeem = useRedeemCode();
  const [code, setCode] = useState('');

  const isPro = data?.tier === 'pro';

  const onRedeem = async () => {
    const c = code.trim();
    if (!c) return;
    try {
      const res = await redeem.mutateAsync(c);
      toast.success(`兑换成功!专业版有效期至 ${res.expires_at.slice(0, 10)}`);
      setCode('');
    } catch (err) {
      toast.error(toApiError(err).message || '兑换失败');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 等级卡 */}
      <section className="rounded-md border border-border bg-background p-5">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex size-10 items-center justify-center rounded-pill',
              isPro ? 'bg-brand-amber/15 text-brand-amber' : 'bg-surface-2 text-faint'
            )}
          >
            <Crown className="size-5" />
          </span>
          <div>
            <p className="text-base font-bold text-foreground">
              {isPro ? '专业版会员' : '免费用户'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPro
                ? data?.expires_at
                  ? `有效期至 ${data.expires_at.slice(0, 10)}`
                  : '永久有效'
                : '升级专业版可大幅提升各 AI 功能的每日额度'}
            </p>
          </div>
        </div>
      </section>

      {/* 兑换码 */}
      <section className="rounded-md border border-border bg-background p-5">
        <h3 className="text-sm font-bold text-foreground mb-1">兑换码</h3>
        <p className="text-xs text-faint mb-3">输入兑换码升级 / 续期专业版会员。</p>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="输入兑换码"
            className="h-9 max-w-xs font-mono tracking-wider"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRedeem();
            }}
          />
          <Button onClick={onRedeem} disabled={redeem.isPending || !code.trim()}>
            {redeem.isPending && <Loader2 className="size-3.5 animate-spin" />}
            兑换
          </Button>
        </div>
      </section>

      {/* 今日额度 */}
      <section className="rounded-md border border-border bg-background p-5">
        <h3 className="text-sm font-bold text-foreground mb-3">今日额度(每日 0 点重置)</h3>
        {isLoading ? (
          <p className="text-xs text-faint">加载中…</p>
        ) : (
          <div className="flex flex-col gap-4">
            {(data?.features ?? []).map((f) => (
              <QuotaRow key={f.feature} f={f} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuotaRow({ f }: { f: FeatureUsage }) {
  const unlimited = f.limit <= 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((f.used / f.limit) * 100));
  const exhausted = !unlimited && f.remaining <= 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-subtle font-medium">{f.label}</span>
        <span className={cn('tabular-nums', exhausted ? 'text-brand-red' : 'text-faint')}>
          {unlimited ? '不限' : `已用 ${f.used} / ${f.limit} · 剩 ${f.remaining}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
          <div
            className={cn('h-full rounded-pill', exhausted ? 'bg-brand-red' : 'bg-brand-green')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default MembershipPage;
