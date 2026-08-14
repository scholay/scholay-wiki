import { useState } from 'react';
import { Search, CheckCircle2, XCircle, Mail, Smartphone, Copy, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Label } from '@/shared/ui/label';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { useUrlState, usePatchUrlState, useDebounce } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { TimeCell, formatBackendTime } from '../components/TimeCell';
import { CopyableId } from '../components/CopyableId';
import { useEmailLogs, type EmailLog, type SendChannel } from '../api/email-logs';

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
 *
 * 本页存在的唯一理由是回答「这封为什么没发出去」,所以报错**必须可读全、可复制**:
 * SMTP 的失败信息通常是「550 5.7.1 Relaying denied … spf=fail smtp.mailfrom=…」这种
 * 一两百字符的长串,挂原生 title 会被截断、鼠标一移就消失、更没法选中复制去搜。
 */
export function EmailLogsPage() {
  const [channel] = useUrlState('channel', 'email');
  const [page, setPage] = useUrlState('page', 1, Number);
  const [status] = useUrlState('status', '');
  const [category] = useUrlState('category', '');
  const [urlQ] = useUrlState('q', '');
  // 多个 key 要在同一次事件里改(筛选变更必须同时回第 1 页)—— 必须走 patch 合并成一次
  // navigate,分开调各自的 setter 会互相覆盖(见 useUrlState.ts 里 usePatchUrlState 的注释)。
  const patch = usePatchUrlState();

  // 输入框自己持有值(即时响应,不受路由 transition 影响),URL 是它的镜像:
  // 初值从 URL 读 → 贴链接给同事能复现同一份搜索结果;每次输入同步写回 URL(replace,不污染历史)。
  const [searchInput, setSearchInput] = useState(urlQ);
  const search = useDebounce(searchInput, 400);

  const [detail, setDetail] = useState<EmailLog | null>(null);

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
  const { data, isLoading, isFetching, error, refetch } = useEmailLogs(params);
  const stats = data?.stats;
  const filtered = !!status || !!category || !!search;

  const resetFilters = () => {
    setSearchInput('');
    patch({ status: null, category: null, q: null, page: null });
  };

  const columns: Column<EmailLog>[] = [
    {
      header: '状态',
      width: 70,
      cell: (r) =>
        r.status === 'success' ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-brand-green-soft px-2 py-0.5 text-12 font-medium text-brand-green">
            <CheckCircle2 className="size-3" /> 成功
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-pill bg-danger-soft px-2 py-0.5 text-12 font-medium text-brand-red">
            <XCircle className="size-3" /> 失败
          </span>
        ),
    },
    {
      header: isSms ? '手机号' : '收件人',
      width: 170,
      cell: (r) => <CopyableId value={r.to_email} label={isSms ? '手机号' : '收件人'} className="text-12 text-foreground" />,
    },
    {
      header: isSms ? '模板内容' : '主题',
      cell: (r) => <span className="text-12 text-subtle" title={r.subject}>{r.subject || '—'}</span>,
    },
    {
      header: '类别',
      width: 70,
      cell: (r) => <span className="text-12 text-faint">{CAT_LABEL[r.category] ?? r.category}</span>,
    },
    {
      header: isSms ? '签名' : '发件人',
      width: 150,
      cell: (r) => (
        <span className="block truncate text-12 text-faint" title={isSms ? r.from_name : `${r.from_name} <${r.from_email}>`}>
          {(isSms ? r.from_name : r.from_email) || '—'}
        </span>
      ),
    },
    {
      header: '报错',
      width: 200,
      cell: (r) =>
        r.error ? (
          <button
            type="button"
            onClick={() => setDetail(r)}
            title="点击查看完整报错"
            className="block max-w-[200px] truncate text-left text-12 text-brand-red underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {r.error}
          </button>
        ) : (
          <span className="text-12 text-faint">—</span>
        ),
    },
    {
      header: '发送时间',
      width: 150,
      cell: (r) => <TimeCell value={r.created_at} className="text-12" />,
    },
  ];

  return (
    <AdminPageLayout
      title="发送记录"
      description="全站邮件 + 短信的发送记录:成功 / 失败 / 报错 / 收件地址 / 主题 / 时间"
      onRefresh={() => void refetch()}
      refreshing={isFetching}
    >
      {/* 邮件 / 短信 tab */}
      <div className="mb-4 inline-flex rounded-12 border border-border bg-surface-1 p-0.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = ch === t.id;
          return (
            <button
              key={t.id}
              onClick={() => patch({ channel: t.id === 'email' ? null : t.id, page: null })}
              className={cn('flex items-center gap-1.5 rounded-8 px-4 py-1.5 text-12 font-medium transition-colors',
                active ? 'bg-surface-card text-foreground shadow-raised' : 'text-faint hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* 概览(当前 tab)—— 后端 stats 只按 channel 统计,不受下面的筛选影响,
          所以点卡片改筛选不会让卡片上的数字跟着变。 */}
      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          icon={isSms ? Smartphone : Mail}
          label="累计发送"
          value={stats?.total}
          tone="ink"
          loading={isLoading}
          error={error}
          active={status === ''}
          onClick={() => patch({ status: null, page: null })}
        />
        <StatTile
          icon={CheckCircle2}
          label="成功"
          value={stats?.success}
          tone="green"
          loading={isLoading}
          error={error}
          active={status === 'success'}
          onClick={() => patch({ status: 'success', page: null })}
        />
        <StatTile
          icon={XCircle}
          label="失败"
          value={stats?.failed}
          tone="red"
          loading={isLoading}
          error={error}
          active={status === 'failed'}
          onClick={() => patch({ status: 'failed', page: null })}
        />
      </section>

      {/* 筛选 */}
      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-16 border border-border-soft bg-surface-1 p-3">
        <Field label="状态">
          <Select
            value={status}
            onChange={(e) => patch({ status: e.target.value || null, page: null })}
            fullWidth={false}
            className="w-24">
            <option value="">全部</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
          </Select>
        </Field>
        <Field label="类别">
          <Select
            value={category}
            onChange={(e) => patch({ category: e.target.value || null, page: null })}
            fullWidth={false}
            className="w-28">
            <option value="">全部</option>
            <option value="verification">验证码</option>
            <option value="feedback">反馈</option>
            <option value="billing">会员</option>
            <option value="test">测试</option>
            <option value="other">其他</option>
          </Select>
        </Field>
        <Field label={isSms ? '搜索(手机号 / 模板)' : '搜索(收件人 / 主题)'} className="w-full sm:w-auto">
          <div className="flex h-8 w-full items-center gap-1.5 rounded-8 border border-input bg-surface-card px-2 sm:w-auto">
            <Search className="size-3.5 shrink-0 text-faint" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                patch({ q: e.target.value || null, page: null });
              }}
              placeholder={isSms ? '手机号或模板关键词' : '邮箱地址或主题关键词'}
              className="h-7 w-full min-w-0 border-0 bg-transparent px-0 text-12 sm:w-56" />
          </div>
        </Field>
      </section>

      <DataTable
        columns={columns}
        rows={data?.logs}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage={
          filtered
            ? '没有符合筛选条件的记录'
            : isSms
              ? '还没有短信发送记录'
              : '还没有邮件发送记录'
        }
        emptyDescription={
          filtered
            ? '换个状态 / 类别或清空搜索词试试'
            : '全站每封邮件 / 每条短信发出后都会记到这里'
        }
        emptyAction={
          filtered ? (
            <Button size="sm" variant="outline" onClick={resetFilters}>
              清除筛选
            </Button>
          ) : undefined
        }
      />
      <Pagination total={data?.total ?? 0} page={page} pageSize={30} onPageChange={setPage} />

      <ErrorDetailDialog log={detail} isSms={isSms} onClose={() => setDetail(null)} />
    </AdminPageLayout>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-12 text-faint">{label}</Label>
      {children}
    </div>
  );
}

/**
 * 概览卡 —— 可点即筛选。
 * 看到「失败 37」的第一反应就是「哪 37 条」,原来要移到下面筛选区、展开下拉、选中失败,
 * 三步之后卡片和筛选态之间还是没有任何联动指示。
 * 另:接口挂了时**绝不回落成 0** —— 后台斩钉截铁地写「失败 0」比白屏危险得多。
 */
function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  loading,
  error,
  active,
  onClick,
}: {
  icon: typeof Mail;
  label: string;
  value: number | undefined;
  tone: 'ink' | 'green' | 'red';
  loading?: boolean;
  error?: unknown;
  active?: boolean;
  onClick?: () => void;
}) {
  const color = tone === 'green' ? 'text-brand-green' : tone === 'red' ? 'text-brand-red' : 'text-foreground';
  const failed = !!error || (!loading && value == null);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? '当前筛选' : `只看「${label}」`}
      className={cn(
        'flex items-center gap-3 rounded-16 border bg-surface-card p-3 text-left transition-colors',
        active ? 'border-border-strong bg-surface-1' : 'border-border hover:bg-surface-1',
      )}
    >
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-2', color)}>
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col">
        {failed ? (
          <span className="flex items-center gap-1 text-20 font-medium leading-none text-faint" title="统计加载失败">
            <span className="tabular-nums">—</span>
            <AlertTriangle className="size-4 text-brand-red" />
          </span>
        ) : loading ? (
          <Skeleton className="h-5 w-16 rounded-4" />
        ) : (
          <span className={cn('text-20 font-medium leading-none tabular-nums', color)}>
            {(value ?? 0).toLocaleString()}
          </span>
        )}
        <span className="mt-0.5 text-12 text-faint">{label}</span>
      </div>
    </button>
  );
}

/**
 * 报错详情 —— 完整报错 + 一并列出收件人/主题/时间,方便整段贴给上游客服。
 * `<pre>` 保留换行、可选中;两个复制按钮:只复制报错(拿去搜)/ 复制全部(拿去开工单)。
 */
function ErrorDetailDialog({
  log,
  isSms,
  onClose,
}: {
  log: EmailLog | null;
  isSms: boolean;
  onClose: () => void;
}) {
  const copy = async (text: string, what: string) => {
    // 走 copyToClipboard:线上是明文 HTTP,navigator.clipboard 直接是 undefined,
    // 裸 `navigator.clipboard?.writeText()` 会静默 no-op 而绿色 toast 照弹。
    const ok = await copyToClipboard(text);
    if (ok) toast.success(`${what}已复制`);
    else toast.error('复制失败,请手动选中复制');
  };

  const fullText = log
    ? [
        `时间:${formatBackendTime(log.created_at)}`,
        `${isSms ? '手机号' : '收件人'}:${log.to_email || '—'}`,
        `${isSms ? '模板内容' : '主题'}:${log.subject || '—'}`,
        `类别:${CAT_LABEL[log.category] ?? log.category}`,
        `${isSms ? '签名' : '发件人'}:${(isSms ? log.from_name : log.from_email) || '—'}`,
        `报错:${log.error}`,
      ].join('\n')
    : '';

  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-brand-red">
            <XCircle className="size-4" />
            发送失败详情
          </DialogTitle>
        </DialogHeader>
        {log && (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-12">
              <dt className="text-faint">时间</dt>
              <dd className="text-subtle">
                <TimeCell value={log.created_at} absolute className="text-12 text-subtle" />
              </dd>
              <dt className="text-faint">{isSms ? '手机号' : '收件人'}</dt>
              <dd className="min-w-0 text-subtle">
                <CopyableId value={log.to_email} label={isSms ? '手机号' : '收件人'} className="text-12" />
              </dd>
              <dt className="text-faint">{isSms ? '模板内容' : '主题'}</dt>
              <dd className="min-w-0 break-all text-subtle">{log.subject || '—'}</dd>
              <dt className="text-faint">{isSms ? '签名' : '发件人'}</dt>
              <dd className="min-w-0 break-all text-subtle">
                {(isSms ? log.from_name : log.from_email) || '—'}
              </dd>
              <dt className="text-faint">类别</dt>
              <dd className="text-subtle">{CAT_LABEL[log.category] ?? log.category}</dd>
            </dl>

            <div className="flex flex-col gap-1.5">
              <span className="text-12 text-faint">上游返回的原始报错</span>
              <pre className="max-h-[50dvh] select-text overflow-y-auto whitespace-pre-wrap break-all rounded-12 border border-border-soft bg-surface-1 p-3 font-mono text-12 leading-paragraph text-brand-red">
                {log.error || '(无)'}
              </pre>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => void copy(log.error, '报错')}>
                <Copy className="size-3.5" />
                复制报错
              </Button>
              <Button size="sm" variant="outline" onClick={() => void copy(fullText, '全部信息')}>
                <Copy className="size-3.5" />
                复制全部信息
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
