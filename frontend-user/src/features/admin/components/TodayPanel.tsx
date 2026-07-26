import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Bell, Plug, CreditCard, Settings, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAdminAlerts } from '../hooks/useAdminAlerts';

/**
 * Dashboard 第一屏 —— "现在需要你做什么"。
 * 没有告警时显示一个绿色 "全部干净" 状态;有告警时按 tone 排序展示。
 */
export function TodayPanel() {
  const navigate = useNavigate();
  const { alerts, isLoading, hasAnyAlert } = useAdminAlerts();

  if (isLoading && !hasAnyAlert) {
    return (
      <section className="rounded-md border border-border bg-background p-4">
        <div className="text-sm text-faint">加载告警…</div>
      </section>
    );
  }

  if (!hasAnyAlert) {
    return (
      <section className="rounded-md border border-border bg-background p-4 flex items-center gap-3">
        <CheckCircle2 className="size-5 text-brand-green" />
        <div>
          <div className="text-base font-bold text-foreground">今日无待办</div>
          <div className="text-xs text-muted-foreground">所有反馈已处理 · 三方账号健康 · 支付配置激活中</div>
        </div>
      </section>
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
  if (!alerts.hasActiveAlipay || !alerts.hasActiveWechatPay) {
    const missing: string[] = [];
    if (!alerts.hasActiveAlipay) missing.push('支付宝');
    if (!alerts.hasActiveWechatPay) missing.push('微信支付');
    items.push({
      tone: 'warning',
      icon: <CreditCard />,
      label: '支付配置缺失',
      value: missing.join(' · '),
      hint: '当前无激活商户,用户无法支付',
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
    <section className="rounded-md border border-border bg-background">
      <header className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">今日待办</h2>
        <span className="text-2xs text-faint">{items.length} 项</span>
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
                  'inline-flex h-7 w-7 items-center justify-center rounded-md shrink-0 [&_svg]:size-3.5',
                  it.tone === 'danger' && 'bg-danger-soft text-brand-red',
                  it.tone === 'warning' && 'bg-warning-soft text-brand-amber',
                  it.tone === 'muted' && 'bg-surface-2 text-faint'
                )}
              >
                {it.icon}
              </span>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-sm font-bold text-foreground">{it.label}</span>
                <span className="text-2xs text-faint truncate mt-px">{it.hint}</span>
              </div>
              <span
                className={cn(
                  'text-sm font-bold tabular-nums shrink-0',
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
