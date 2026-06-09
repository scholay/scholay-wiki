import { useState } from 'react';
import { LayoutGrid, Coins, Ticket, FileText, Gift, type LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useBillingOverview } from '../api/membership';
import { AccountAssetsCard } from '../components/account-assets-card';
import { RechargePanel, RedeemPanel, OrdersTable, OverviewContent } from '../components/billing-panels';

type TabId = 'overview' | 'recharge' | 'redeem' | 'txns' | 'earn';
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: '总览', icon: LayoutGrid },
  { id: 'recharge', label: '经费充值', icon: Coins },
  { id: 'redeem', label: '兑换码激活', icon: Ticket },
  { id: 'txns', label: '明细查看', icon: FileText },
  { id: 'earn', label: '经费领取', icon: Gift },
];

/**
 * 账户资产(合并原「我的会员」)—— 对齐设计稿 scholay-money.pen:
 * 顶部常驻汇总卡 + 分段式 tab(白底胶囊 active)。总览=近期流水+即将接入计费项。
 */
export function MembershipPage() {
  const { data, isLoading } = useBillingOverview();
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div className="flex flex-col gap-5">
      {isLoading || !data ? (
        <section className="rounded-md border border-border bg-background p-5">
          <p className="text-xs text-faint">加载中…</p>
        </section>
      ) : (
        <AccountAssetsCard data={data} onGoRecharge={() => setTab('recharge')} />
      )}

      {/* 分段式 tab —— 灰底 bar + 白底胶囊(红 icon/文字)active */}
      <div className="flex items-center gap-1 rounded-md border border-border bg-surface-1 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 h-9 rounded-sm text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-background text-brand-red shadow-sm'
                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-1">
        {tab === 'overview' && <OverviewContent onViewAll={() => setTab('txns')} />}
        {tab === 'recharge' && <RechargePanel />}
        {tab === 'redeem' && <RedeemPanel />}
        {tab === 'txns' && <OrdersTable />}
        {tab === 'earn' && (
          <section className="flex flex-col items-center gap-2 rounded-md border border-border bg-background p-10 text-center">
            <Gift className="size-7 text-faint" />
            <p className="text-sm font-bold text-foreground">任务中心即将上线</p>
            <p className="text-xs text-muted-foreground">完成签到与任务即可领取科研经费,敬请期待。</p>
          </section>
        )}
      </div>
    </div>
  );
}

export default MembershipPage;
