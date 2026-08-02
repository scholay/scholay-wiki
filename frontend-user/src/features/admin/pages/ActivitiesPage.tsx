import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Save, Sparkles, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { useApiToast } from '../hooks/useApiToast';
import { PromoConfigPanel } from './PromoConfigPage';
import { useBillingConfig, useUpdateBillingConfig, type BillingConfig } from '../api/billing-config';
import { useInviteSummary } from '../api/invites';

/**
 * 活动管理 —— 限时运营活动统一配置(owner 拍板 2026-07-31:「限时领取会员」与「邀请有奖」
 * 同属限时活动,后台合并到一页管理;用户端顶栏「限时活动」菜单只显示进行中的活动)。
 *
 * 各活动独立开关:
 *   - 限时领取会员:promo_config(总开关/二维码/文案),PromoConfigPanel;
 *   - 邀请有奖:billing_config.invite_reward_credits(>0=开启)+ 每日上限 —— 旋钮真源仍是
 *     billing_config 单行表(PUT 全列覆盖,本页 GET 全量后只改这两个字段再整体提交,
 *     与计费配置页同一套防零化模式);「计费配置」页已不再渲染这两项(单点管理防两处打架)。
 * 以后新活动加一个 TabsTrigger + 面板即可。
 */
export function ActivitiesPage() {
  return (
    <Tabs defaultValue="invite" className="flex h-full min-h-0 flex-col">
      <AdminPageLayout
        title="活动管理"
        description="限时运营活动统一配置 —— 各活动独立开关;用户端顶栏「限时活动」菜单只显示进行中的活动"
        tabs={
          <TabsList>
            <TabsTrigger value="invite">邀请有奖</TabsTrigger>
            <TabsTrigger value="promo">限时领取会员</TabsTrigger>
          </TabsList>
        }
      >
        <TabsContent value="invite" className="mt-0">
          <InviteRewardPanel />
        </TabsContent>
        <TabsContent value="promo" className="mt-0">
          <PromoConfigPanel />
        </TabsContent>
      </AdminPageLayout>
    </Tabs>
  );
}

/** 邀请有奖活动面板:两个旋钮 + 状态 + 发放数据摘要 + 邀请监控入口。 */
function InviteRewardPanel() {
  const { data, isLoading } = useBillingConfig();
  const update = useUpdateBillingConfig();
  const { data: summary } = useInviteSummary();
  const apiToast = useApiToast();

  const [form, setForm] = useState<BillingConfig | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const active = (form?.invite_reward_credits ?? 0) > 0;
  const setNum = (key: 'invite_reward_credits' | 'invite_reward_daily_cap', raw: string) =>
    setForm((f) => (f ? { ...f, [key]: Math.max(0, Number(raw) || 0) } : f));

  const onSave = async () => {
    if (!form) return;
    await apiToast(update.mutateAsync(form), {
      success: form.invite_reward_credits > 0 ? '已保存,活动进行中' : '已保存,活动已关闭',
      failure: '保存失败(需管理员权限)',
    });
  };

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-16 border border-border p-6 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载配置…
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {/* 状态行 + 保存 */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-pill px-3 py-1 text-12 font-medium',
            active ? 'bg-brand-green/10 text-brand-green' : 'bg-surface-2 text-muted-foreground'
          )}
        >
          <span className={cn('size-1.5 rounded-pill', active ? 'bg-brand-green' : 'bg-faint')} />
          {active ? `活动进行中 · 每邀 1 人奖励 ${form.invite_reward_credits} 经费` : '活动已关闭'}
        </span>
        <Button size="sm" onClick={onSave} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存
        </Button>
      </div>

      {/* 旋钮 */}
      <div className="flex flex-col gap-4 rounded-16 border border-border bg-surface-card p-4">
        <div className="flex items-center gap-2 text-14 font-medium text-foreground">
          <UserPlus className="size-4 text-brand-red" />
          邀请有奖
        </div>
        <p className="text-12 leading-paragraph text-muted-foreground">
          好友经邀请链接注册成功后,自动给邀请人发放经费奖励(流水类型「邀请奖励」,附站内信)。
          开启后用户端自动点亮:顶栏「限时活动」菜单、头像菜单、账户资产卡、邀请页活动文案与额度弹窗引导。
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-12 text-subtle">奖励(经费/人)</span>
            <Input
              type="number"
              min={0}
              value={form.invite_reward_credits}
              onChange={(e) => setNum('invite_reward_credits', e.target.value)}
            />
            <span className="text-12 text-faint">经费=分,100 = ¥1;设 0 = 关闭活动</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-12 text-subtle">每日上限(人)</span>
            <Input
              type="number"
              min={0}
              value={form.invite_reward_daily_cap}
              onChange={(e) => setNum('invite_reward_daily_cap', e.target.value)}
            />
            <span className="text-12 text-faint">每邀请人每天最多计奖励的邀请数;0=不限。防小号批量刷奖励</span>
          </label>
        </div>
        <p className="text-12 text-faint">保存后最多约 90 秒对用户端全量生效(配置 30s + 前端缓存 60s)。</p>
      </div>

      {/* 数据摘要 + 监控入口 */}
      <div className="flex items-center justify-between gap-3 rounded-16 border border-border bg-surface-card p-4">
        <div className="flex flex-col gap-1">
          <span className="text-12 text-faint">累计成功邀请 / 已发放奖励</span>
          <span className="text-14 font-medium tabular-nums text-foreground">
            {summary ? `${summary.total_registrations} 人 · ${summary.total_reward_credits} 经费` : '—'}
          </span>
        </div>
        <Link
          to="/admin/invites"
          className="inline-flex items-center gap-1 text-12 text-brand-red hover:underline"
        >
          查看邀请数据(漏斗 / 名单)
          <ExternalLink className="size-3.5" />
        </Link>
      </div>

      <p className="text-12 text-faint">
        <Sparkles className="mr-1 inline size-3.5" />
        旋钮存于计费配置(billing_config);保存需管理员权限,运营账号可查看。
      </p>
    </div>
  );
}
