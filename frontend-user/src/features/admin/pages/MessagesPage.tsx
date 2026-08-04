import { useState } from 'react';
import { Plus, Send, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { TimeCell, formatBackendTime } from '../components/TimeCell';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import {
  useMessages,
  useCreateMessage,
  useSendMessage,
  toRFC3339,
  parseIdList,
  parseCodeList,
  type AdminMessage,
  type MessageStatus,
  type MessageSendType,
  type MessageCategory,
} from '../api/messages';

type BadgeVariant = 'default' | 'outline' | 'muted' | 'success' | 'warning' | 'destructive';

const STATUS_LABEL: Record<MessageStatus, { text: string; variant: BadgeVariant }> = {
  draft: { text: '草稿', variant: 'muted' },
  sent: { text: '已发送', variant: 'success' },
  cancelled: { text: '已取消', variant: 'outline' },
};

const STATUS_FILTERS: { value: MessageStatus | undefined; label: string }[] = [
  { value: undefined, label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'sent', label: '已发送' },
  { value: 'cancelled', label: '已取消' },
];

const CATEGORY_LABEL: Record<MessageCategory, string> = {
  system: '系统通知',
  promotion: '营销推广',
  transaction: '交易通知',
};

const SEND_TYPE_LABEL: Record<MessageSendType, string> = {
  all: '全体用户',
  by_plan: '按会员等级',
  batch: '批量用户',
  single: '单个用户',
};

/** 新建弹窗只暴露三种(single 是 batch 的退化形态,后端逻辑完全一致) */
const SEND_TYPE_OPTIONS: { value: MessageSendType; label: string; hint: string }[] = [
  { value: 'all', label: '全体用户', hint: '无需填写(所有 status=1 的注册用户)' },
  { value: 'by_plan', label: '按会员等级', hint: '等级代码,逗号分隔,如 pro,max' },
  { value: 'batch', label: '指定用户', hint: '用户 ID,逗号分隔,如 12,45,78' },
];

const PAGE_SIZE = 20;

/**
 * 目标列的可读摘要。
 *
 * 改造前这一格是 `{r.target_user_ids || r.target_plans}` 原样打进 span + `truncate max-w-[120px]`
 * 且没有 title:超过两三个目标就被切掉且无法查看 —— 而这是「发出去撤不回」的操作前
 * 唯一的核对信息。现在按 send_type 分支翻译成人话,原始值挂 title。
 *
 * ⚠️ batch/single 的具体用户 ID 后端列表接口**不下发**(MessageResponse 没映射
 * target_user_ids),只能显示类型 + 已发送后的 recipient_count。
 */
function targetSummary(r: AdminMessage): { text: string; title: string } {
  const type = SEND_TYPE_LABEL[r.send_type] ?? r.send_type;
  if (r.send_type === 'by_plan') {
    const plans = r.target_plans ?? [];
    return plans.length > 0
      ? { text: plans.join('、'), title: `${type}:${plans.join(', ')}` }
      : { text: '未指定等级', title: `${type}:目标等级为空,发送会被后端拒绝` };
  }
  if (r.send_type === 'batch' || r.send_type === 'single') {
    return r.recipient_count > 0
      ? {
          text: `${r.recipient_count.toLocaleString()} 个用户`,
          title: `${type}:已投递 ${r.recipient_count.toLocaleString()} 人`,
        }
      : {
          text: '创建时指定',
          title: `${type}:后端列表接口不下发 target_user_ids,具体用户 ID 在此不可见`,
        };
  }
  return { text: '所有注册用户', title: `${type}:所有 status=1 的注册用户` };
}

export function MessagesPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [statusFilter] = useUrlState<MessageStatus | undefined>(
    'status',
    undefined,
    (raw) => (['draft', 'sent', 'cancelled'].includes(raw) ? (raw as MessageStatus) : undefined)
  );
  /**
   * 🔴 切状态要同时改 status 和 page 两个 key,**必须走 patch 一次写完**。
   *
   * 不能写成 `setStatusFilter(x); setPage(1);` —— react-router 的 setSearchParams
   * 是基于**当前 render 闭包里的** searchParams 计算的,同一个同步事件里两次调用
   * 用的是同一份旧值,第二次 navigate 直接把第一次覆盖掉。表现就是「点了标签页没反应」:
   * status 压根没写进 URL,而 statusFilter 又是从 URL 读的 —— 筛选功能整个是死的。
   * (useUrlState.ts 顶部注释把这个失败模式写死了,本页此前踩了。)
   */
  const patchUrl = usePatchUrlState();
  const setStatusFilter = (v: MessageStatus | undefined) =>
    patchUrl({ status: v ?? null, page: null });
  const [showCreate, setShowCreate] = useState(false);
  const [preview, setPreview] = useState<AdminMessage | null>(null);
  const [sendType, setSendType] = useState<MessageSendType>('all');
  const { data, isLoading, isFetching, error, refetch } = useMessages({
    page,
    page_size: PAGE_SIZE,
    status: statusFilter,
  });
  const create = useCreateMessage();
  const send = useSendMessage();
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const sendingId = send.isPending ? send.variables : undefined;

  const handleSend = async (row: AdminMessage) => {
    const target = targetSummary(row);
    const ok = await confirm({
      title: `发送「${row.title}」?`,
      description: `目标:${SEND_TYPE_LABEL[row.send_type] ?? row.send_type} · ${target.text}。发送后无法撤回。`,
      danger: row.send_type === 'all',
      confirmText: '立即发送',
      typeToConfirm: row.send_type === 'all' ? 'SEND' : undefined,
    });
    if (!ok) return;
    const done = await apiToast(send.mutateAsync(row.id), { success: '已发送', failure: '发送失败' });
    if (done !== null) setPreview(null);
  };

  const columns: Column<AdminMessage>[] = [
    {
      header: '标题',
      // 列表只有标题、没有任何详情入口 —— content / category / link / expire_at 一旦创建完
      // 就再也看不到,而「发送」不可撤回。运维原先只能在看不见正文的情况下按下发送键。
      cell: (r) => (
        <button
          type="button"
          onClick={() => setPreview(r)}
          className="group flex min-w-0 items-center gap-2 text-left"
          title="查看正文"
        >
          <span className="truncate font-medium text-foreground group-hover:text-brand-red">{r.title}</span>
          <Eye className="size-3 shrink-0 text-faint opacity-0 group-hover:opacity-100" />
        </button>
      ),
    },
    {
      header: '目标',
      width: 150,
      cell: (r) => {
        const t = targetSummary(r);
        return (
          <div className="flex min-w-0 flex-col" title={t.title}>
            <span className="text-12 text-subtle">{SEND_TYPE_LABEL[r.send_type] ?? r.send_type}</span>
            <span className="truncate text-12 text-faint">{t.text}</span>
          </div>
        );
      },
    },
    {
      header: '状态',
      width: 100,
      cell: (r) => {
        const s = STATUS_LABEL[r.status] ?? { text: r.status, variant: 'muted' as const };
        return <Badge variant={s.variant}>{s.text}</Badge>;
      },
    },
    {
      header: '阅读',
      width: 130,
      align: 'right',
      sortKey: (r) => r.read_rate,
      cell: (r) =>
        // 草稿行原先显示「0 / 0」,看起来像发失败了;全体群发是几万级,无千分位扫不出量级
        r.recipient_count > 0 ? (
          <span className="tabular-nums text-muted-foreground">
            {r.read_count.toLocaleString()} / {r.recipient_count.toLocaleString()}
            <span className="ml-1 text-faint">{Math.round(r.read_rate)}%</span>
          </span>
        ) : (
          <span className="text-faint">未发送</span>
        ),
    },
    {
      header: '时间',
      width: 150,
      // 同一列两种语义必须写明前缀:已发送行是发送时刻,草稿行是创建时刻,
      // 不标注就会把「这条什么时候推出去的」直接读错
      cell: (r) =>
        r.send_at ? (
          <TimeCell value={r.send_at} prefix="发送 " />
        ) : (
          <TimeCell value={r.created_at} prefix="创建 " />
        ),
    },
    {
      header: '',
      width: 100,
      align: 'right',
      cell: (r) =>
        r.status === 'draft' && (
          // per-row pending:改造前用的是全局 send.isPending,点了某一行,
          // 列表里所有未发送行的按钮同时变灰同时转圈
          <Button size="sm" variant="outline" disabled={send.isPending} onClick={() => handleSend(r)}>
            {sendingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            发送
          </Button>
        ),
    },
  ];

  return (
    <AdminPageLayout
      title="站内消息"
      description={
        data ? `共 ${data.total} 条 · 创建草稿 → 发送给全体 / 会员等级 / 指定用户` : '创建草稿 → 发送站内消息'
      }
      onRefresh={() => void refetch()}
      refreshing={isFetching}
      tabs={
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.label}
              size="sm"
              variant={statusFilter === f.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      }
      actions={
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="size-3.5" />
          新建消息
        </Button>
      }
    >
      <DataTable
        columns={columns}
        rows={data?.list}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage={statusFilter ? `当前筛选下没有${STATUS_LABEL[statusFilter].text}消息` : '还没有站内消息'}
        emptyDescription={
          statusFilter ? '换个状态再看看。' : '先「新建消息」存成草稿,确认正文无误后再发送(发送不可撤回)。'
        }
        emptyAction={
          statusFilter ? (
            <Button size="sm" variant="outline" onClick={() => setStatusFilter(undefined)}>
              查看全部
            </Button>
          ) : undefined
        }
      />

      <Pagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {/* 只读预览 —— 发送前唯一能看到正文的地方 */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {preview?.title}
              {preview && (
                <Badge variant={(STATUS_LABEL[preview.status] ?? { variant: 'muted' as const }).variant}>
                  {(STATUS_LABEL[preview.status] ?? { text: preview.status }).text}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-12 border border-border bg-surface-1 p-3 sm:grid-cols-2">
                {([
                  ['分类', CATEGORY_LABEL[preview.category] ?? preview.category],
                  ['目标', `${SEND_TYPE_LABEL[preview.send_type] ?? preview.send_type} · ${targetSummary(preview).text}`],
                  ['创建时间', formatBackendTime(preview.created_at)],
                  ['发送时间', formatBackendTime(preview.send_at)],
                  ['过期时间', formatBackendTime(preview.expire_at, '不过期')],
                  ['创建人', preview.sender_name || '—'],
                  ['链接', preview.link_url ? `${preview.link_text || '查看详情'} → ${preview.link_url}` : '无'],
                  [
                    '阅读',
                    preview.recipient_count > 0
                      ? `${preview.read_count.toLocaleString()} / ${preview.recipient_count.toLocaleString()} (${Math.round(preview.read_rate)}%)`
                      : '未发送',
                  ],
                ] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <div className="text-12 text-faint">{label}</div>
                    <div className="truncate text-12 text-subtle" title={value}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-12 border border-border bg-surface-1 p-3">
                <div className="mb-1 text-12 text-faint">正文</div>
                <div className="whitespace-pre-wrap text-12 text-subtle">{preview.content}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>关闭</Button>
            {preview?.status === 'draft' && (
              <Button type="button" disabled={send.isPending} onClick={() => handleSend(preview)}>
                {sendingId === preview.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                立即发送
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCreate}
        onOpenChange={(o) => {
          if (o || create.isPending) return;
          setShowCreate(false);
          // 表单是非受控的(DialogContent 关闭即卸载,input 自然清空),
          // 但 sendType 是 React state —— 不一起收就会出现「类型是按会员等级、目标却是空」
          setSendType('all');
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建消息</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const targetValue = String(fd.get('target_value') || '').trim();
              const target_plans = sendType === 'by_plan' ? parseCodeList(targetValue) : undefined;
              const target_user_ids = sendType === 'batch' ? parseIdList(targetValue) : undefined;
              // 后端 CreateMessage 对空目标是 return error → 500,提示语被吞在通用文案里,
              // 这里前置挡掉,给出能照做的提示
              if (sendType === 'by_plan' && !target_plans) {
                toast.error('请填写目标会员等级(逗号分隔,如 pro,max)');
                return;
              }
              if (sendType === 'batch' && !target_user_ids) {
                toast.error('请填写目标用户 ID(逗号分隔的正整数,如 12,45,78)');
                return;
              }
              const ok = await apiToast(
                create.mutateAsync({
                  title: String(fd.get('title') || ''),
                  content: String(fd.get('content') || ''),
                  category: (String(fd.get('category') || 'system')) as MessageCategory,
                  send_type: sendType,
                  target_plans,
                  target_user_ids,
                  link_url: String(fd.get('link_url') || '') || undefined,
                  link_text: String(fd.get('link_text') || '') || undefined,
                  expire_at: toRFC3339(String(fd.get('expire_at') || '')),
                }),
                { success: '已存为草稿', failure: '创建失败' }
              );
              if (ok !== null) {
                setShowCreate(false);
                setSendType('all');
              }
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="title">标题</Label>
              <Input id="title" name="title" required />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="category">分类</Label>
                <Select id="category" name="category" defaultValue="system">
                  {(Object.entries(CATEGORY_LABEL) as [MessageCategory, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expire_at">过期时间(可选)</Label>
                <Input id="expire_at" name="expire_at" type="datetime-local" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="send_type">发送类型</Label>
                <Select
                  id="send_type"
                  value={sendType}
                  onChange={(e) => setSendType(e.target.value as MessageSendType)}
                >
                  {SEND_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="target_value">目标</Label>
                <Input
                  id="target_value"
                  name="target_value"
                  disabled={sendType === 'all'}
                  placeholder={SEND_TYPE_OPTIONS.find((o) => o.value === sendType)?.hint}
                />
              </div>
            </div>

            {sendType === 'by_plan' && (
              <p className="rounded-8 bg-warning-soft px-3 py-2 text-12 text-brand-amber">
                「按会员等级」匹配的是 users 表的历史列 subscription_plan,而现行会员体系用的是
                vip_tier —— 这条通道很可能一个人都匹配不到。发送前请先用「指定用户」小范围验证。
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="content">内容</Label>
              <Textarea id="content" name="content" rows={6} required />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="link_url">链接 URL(可选)</Label>
                {/* 后端 binding 是 `omitempty,url`,相对路径("/xxx")过不了校验 */}
                <Input id="link_url" name="link_url" type="url" placeholder="https://scholay.com/announcements/123" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link_text">链接文案</Label>
                <Input id="link_text" name="link_text" placeholder="查看详情" />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={create.isPending}
                onClick={() => {
                  setShowCreate(false);
                  setSendType('all');
                }}
              >
                取消
              </Button>
              {/* 无 pending 时连点两下会建出两条一样的草稿,而本页既没有删除也没有编辑入口 */}
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
                存为草稿
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
