import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Bell, Plug, CreditCard, Settings, CheckCircle2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAdminAlerts } from '../hooks/useAdminAlerts';

/**
 * Dashboard 第一屏 —— "现在需要你做什么"。
 * 没有告警时显示一个绿色 "全部干净" 状态;有告警时按 tone 排序展示。
 *
 * ⚠️ 「全部干净」这句话是有前提的:**六项检查全部查到了**。任何一项没查到就不能这么说 ——
 * 见 useAdminAlerts 的 degraded/failedChecks 注释。
 */
export function TodayPanel() {
  const navigate = useNavigate();
  const { alerts, isLoading, hasAnyAlert, noPaymentChannel, degraded, failedChecks, refetchAll } =
    useAdminAlerts();

  if (isLoading && !hasAnyAlert) {
    return (
      <section className="rounded-16 border border-border bg-surface-card p-4">
        <div className="text-12 text-faint">加载告警…</div>
      </section>
    );
  }

  // 降级态优先于「全部干净」:有项目没查到时,绿灯是在说反话。
  // 即使另有真实告警也要挂这条,否则会以为"待办就这些了"。
  const degradedBanner = degraded ? (
    <section className="rounded-16 border border-border bg-warning-soft p-4 flex items-start gap-3">
      <AlertTriangle className="size-5 shrink-0 text-brand-amber" />
      <div className="min-w-0 flex-1">
        <div className="text-14 font-medium text-foreground">部分状态未能查到</div>
        {/* JSX 文本节点不走 Markdown,`**x**` 会原样渲染成星号 —— 强调要用 <strong> */}
        <div className="text-12 text-muted-foreground">
          {failedChecks.join(' · ')} 加载失败 —— 下面的结论
          <strong className="font-medium text-foreground">不完整</strong>
          ,别当成「没问题」。
        </div>
      </div>
      <button
        type="button"
        onClick={refetchAll}
        className="shrink-0 inline-flex items-center gap-1 rounded-8 px-2 h-7 text-12 text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
      >
        <RefreshCw className="size-3" />
        重试
      </button>
    </section>
  ) : null;

  if (!hasAnyAlert) {
    return (
      <div className="flex flex-col gap-3">
        {degradedBanner}
        {!degraded && (
          <section className="rounded-16 border border-border bg-surface-card p-4 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-brand-green" />
            <div>
              <div className="text-14 font-medium text-foreground">今日无待办</div>
              <div className="text-12 text-muted-foreground">所有反馈已处理 · 三方账号健康 · 支付配置激活中</div>
            </div>
          </section>
        )}
      </div>
    );
  }

  // 收集所有告警 item,danger 优先,warning 其次
  const items: AlertItem[] = [];

  if (alerts.pendingFeedback > 0) {
    items.push({
      tone: 'danger',
      icon: <MessageSquare />,
      label: '待处理反馈',
      value: `${alerts.pendingFeedback} 条`,
      hint: '点击查看 →',
      href: '/admin/feedback',
    });
  }
  if (alerts.unhealthyThirdParty > 0) {
    items.push({
      tone: 'danger',
      icon: <Plug />,
      label: '三方账号失败率高',
      value: `${alerts.unhealthyThirdParty} 个`,
      hint: '失败率 > 10%',
      href: '/admin/third-party',
    });
  }
  // 判据与侧栏红点、hasAnyAlert 保持同一条(两个渠道都没启用才是事故);
  // 只接其中一个是正常经营选择,报出来就是狼来了。
  if (noPaymentChannel) {
    items.push({
      tone: 'danger',
      icon: <CreditCard />,
      label: '无可用支付渠道',
      value: '支付宝 · 微信支付',
      hint: '两者均未启用,用户当前无法完成支付',
      href: '/admin/payment',
    });
  }
  if (alerts.maintenanceMode) {
    items.push({
      tone: 'warning',
      icon: <Settings />,
      label: '维护模式已开启',
      value: '全站只读',
      hint: '记得关闭',
      href: '/admin/system',
    });
  }
  if (alerts.draftMessages > 0) {
    items.push({
      tone: 'muted',
      icon: <Bell />,
      label: '草稿消息未发送',
      value: `${alerts.draftMessages} 条`,
      hint: '点击查看 →',
      href: '/admin/messages',
    });
  }

  return (
    <div className="flex flex-col gap-3">
    {degradedBanner}
    <section className="rounded-16 border border-border bg-surface-card">
      <header className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
        <h2 className="text-16 font-medium text-foreground">今日待办</h2>
        <span className="text-12 text-faint">{items.length} 项</span>
      </header>
      <ul>
        {items.map((it, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => navigate(it.href)}
              className={cn(
                'w-full flex items-center gap-3 px-4 h-12 text-left transition-colors hover:bg-surface-1',
                i !== items.length - 1 && 'border-b border-border-soft'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-8 shrink-0 [&_svg]:size-3.5',
                  it.tone === 'danger' && 'bg-danger-soft text-brand-red',
                  it.tone === 'warning' && 'bg-warning-soft text-brand-amber',
                  it.tone === 'muted' && 'bg-surface-2 text-faint'
                )}
              >
                {it.icon}
              </span>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-12 font-medium text-foreground">{it.label}</span>
                <span className="text-12 text-faint truncate mt-px">{it.hint}</span>
              </div>
              <span
                className={cn(
                  'text-12 font-medium tabular-nums shrink-0',
                  it.tone === 'danger' && 'text-brand-red',
                  it.tone === 'warning' && 'text-brand-amber',
                  it.tone === 'muted' && 'text-subtle'
                )}
              >
                {it.value}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
    </div>
  );
}

interface AlertItem {
  tone: 'danger' | 'warning' | 'muted';
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  href: string;
}
