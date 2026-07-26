import { useState } from 'react';
import { Search, CheckCircle2, XCircle, Mail, Smartphone } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { cn } from '@/shared/lib/utils';
import { useUrlState, useDebounce } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { useEmailLogs, type EmailLog, type SendChannel } from '../api/email-logs';

const SELECT_CLS = 'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground';

const CAT_LABEL: Record<string, string> = {
  verification: '验证码',
  feedback: '反馈',
  billing: '会员',
  test: '测试',
  other: '其他',
};

const TABS: { id: SendChannel; label: string; icon: typeof Mail }[] = [
  { id: 'email', label: '邮件', icon: Mail },
  { id: 'sms', label: '短信', icon: Smartphone },
];

/**
 * 发送记录 —— 邮件 + 短信统一记录,tab 切换查看。
 * 全站每封邮件 / 每条短信(验证码 / 反馈回复 / 会员通知 / 配置测试)无差别记录:
 * 成功/失败 + 报错 + 收件地址(邮箱/手机号)+ 主题/模板 + 发件人/签名 + 时间。
 */
export function EmailLogsPage() {
  const [channel, setChannel] = useUrlState('channel', 'email');
  const [page, setPage] = useUrlState('page', 1, Number);
  const [status, setStatus] = useUrlState('status', '');
  const [category, setCategory] = useUrlState('category', '');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);

  const ch = (channel === 'sms' ? 'sms' : 'email') as SendChannel;
  const isSms = ch === 'sms';

  const params = {
    channel: ch,
    page,
    page_size: 30,
    status: status || undefined,
    category: category || undefined,
    search: search || undefined,
  };
  const { data, isLoading } = useEmailLogs(params);
  const stats = data?.stats ?? { total: 0, success: 0, failed: 0 };

  const columns: Column<EmailLog>[] = [
    {
      header: '状态',
      width: 70,
      cell: (r) =>
        r.status === 'success' ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-brand-green/10 px-2 py-0.5 text-2xs font-medium text-brand-green">
            <CheckCircle2 className="size-3" /> 成功
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-pill bg-danger-soft px-2 py-0.5 text-2xs font-medium text-brand-red">
            <XCircle className="size-3" /> 失败
          </span>
        ),
    },
    {
      header: isSms ? '手机号' : '收件人',
      width: 170,
      cell: (r) => <span className="select-all break-all font-mono text-xs text-foreground">{r.to_email || '—'}</span>,
    },
    {
      header: isSms ? '模板内容' : '主题',
      cell: (r) => <span className="text-xs text-subtle" title={r.subject}>{r.subject || '—'}</span>,
    },
    {
      header: '类别',
      width: 70,
      cell: (r) => <span className="text-2xs text-faint">{CAT_LABEL[r.category] ?? r.category}</span>,
    },
    {
      header: isSms ? '签名' : '发件人',
      width: 150,
      cell: (r) => (
        <span className="truncate text-2xs text-faint" title={isSms ? r.from_name : `${r.from_name} <${r.from_email}>`}>
          {(isSms ? r.from_name : r.from_email) || '—'}
        </span>
      ),
    },
    {
      header: '报错',
      width: 200,
      cell: (r) =>
        r.error ? (
          <span className="block max-w-[200px] truncate text-2xs text-brand-red" title={r.error}>
            {r.error}
          </span>
        ) : (
          <span className="text-2xs text-faint">—</span>
        ),
    },
    {
      header: '发送时间',
      width: 150,
      cell: (r) => (
        <span className="text-2xs tabular-nums text-faint">{r.created_at?.slice(0, 19).replace('T', ' ')}</span>
      ),
    },
  ];

  return (
    <AdminPageLayout title="发送记录" description="全站邮件 + 短信的发送记录:成功 / 失败 / 报错 / 收件地址 / 主题 / 时间">
      {/* 邮件 / 短信 tab */}
      <div className="mb-4 inline-flex rounded-md border border-border bg-surface-1 p-0.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = ch === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setChannel(t.id);
                setPage(1);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-sm px-4 py-1.5 text-xs font-medium transition-colors',
                active ?'bg-background text-foreground shadow-raised':'text-faint hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* 概览(当前 tab) */}
      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={isSms ? Smartphone : Mail} label="累计发送" value={stats.total} tone="ink" />
        <StatCard icon={CheckCircle2} label="成功" value={stats.success} tone="green" />
        <StatCard icon={XCircle} label="失败" value={stats.failed} tone="red" />
      </section>

      {/* 筛选 */}
      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-border-soft bg-surface-1 p-3">
        <Field label="状态">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={cn(SELECT_CLS, 'w-24')}
          >
            <option value="">全部</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
          </select>
        </Field>
        <Field label="类别">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className={cn(SELECT_CLS, 'w-28')}
          >
            <option value="">全部</option>
            <option value="verification">验证码</option>
            <option value="feedback">反馈</option>
            <option value="billing">会员</option>
            <option value="test">测试</option>
            <option value="other">其他</option>
          </select>
        </Field>
        <Field label={isSms ? '搜索(手机号 / 模板)' : '搜索(收件人 / 主题)'} className="w-full sm:w-auto">
          <div className="flex h-8 w-full items-center gap-1.5 rounded-md border border-input bg-background px-2 sm:w-auto">
            <Search className="size-3.5 shrink-0 text-faint" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder={isSms ? '手机号或模板关键词' : '邮箱地址或主题关键词'}
              className="h-7 w-full min-w-0 border-0 bg-transparent px-0 text-xs focus-visible:ring-0 sm:w-56"
            />
          </div>
        </Field>
      </section>

      <DataTable
        columns={columns}
        rows={data?.logs}
        loading={isLoading}
        emptyMessage={isSms ? '还没有短信发送记录' : '还没有邮件发送记录'}
      />
      <Pagination total={data?.total ?? 0} page={page} pageSize={30} onPageChange={setPage} />
    </AdminPageLayout>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-2xs text-faint">{label}</Label>
      {children}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Mail;
  label: string;
  value: number;
  tone: 'ink' | 'green' | 'red';
}) {
  const color = tone === 'green' ? 'text-brand-green' : tone === 'red' ? 'text-brand-red' : 'text-foreground';
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background p-3">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-2', color)}>
        <Icon className="size-4" />
      </span>
      <div className="flex flex-col">
        <span className={cn('text-xl font-bold leading-none tabular-nums', color)}>{value.toLocaleString()}</span>
        <span className="mt-0.5 text-2xs text-faint">{label}</span>
      </div>
    </div>
  );
}
