import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { TimeCell, formatBackendTime, parseBackendTime } from '../components/TimeCell';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  toRFC3339,
  toDatetimeLocal,
  type Announcement,
  type AnnouncementInput,
  type AnnouncementSeverity,
  type AnnouncementType,
  type AnnouncementAudience,
} from '../api/announcements';

type EditMode = { kind: 'create' } | { kind: 'edit'; row: Announcement } | null;

type BadgeVariant = 'default' | 'outline' | 'muted' | 'success' | 'warning' | 'destructive';

// 三张标签表是**列表列与编辑弹窗 option 的唯一真源** —— 之前弹窗里写死中文、
// 列表里干脆不显示,于是"这条会不会弹窗打扰全体访客"只能逐条点开编辑弹窗去看,
// 而打开编辑弹窗本身就有误改风险(表单是非受控的,一次误提交就是整行覆盖)。
const SEVERITY_LABEL: Record<AnnouncementSeverity, { text: string; variant: BadgeVariant }> = {
  info: { text: '提示', variant: 'default' },
  warning: { text: '警告', variant: 'warning' },
  danger: { text: '严重', variant: 'destructive' },
  success: { text: '成功', variant: 'success' },
};

const TYPE_LABEL: Record<AnnouncementType, string> = {
  banner: '顶部横幅',
  popup: '弹窗',
  maintenance_note: '维护通知',
};

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  all: '全部访客',
  logged_in: '已登录用户',
  paid: '付费会员',
};

const SEVERITY_OPTIONS = Object.entries(SEVERITY_LABEL) as [
  AnnouncementSeverity,
  { text: string; variant: BadgeVariant },
][];
const TYPE_OPTIONS = Object.entries(TYPE_LABEL) as [AnnouncementType, string][];
const AUDIENCE_OPTIONS = Object.entries(AUDIENCE_LABEL) as [AnnouncementAudience, string][];

/**
 * 公告的**实际**生效状态 —— 四态。
 *
 * 改造前只判 `is_active === 1` 就渲染绿色「已发布」:一条 is_active=1 但 starts_at 在下周、
 * 或 ends_at 早已过去的公告,列表里同样是「已发布」。运维据此认为横幅正挂在全站上,
 * 实际用户根本看不到(或早已下线)。时段列虽然印着日期,但和状态列是两个割裂的信号,
 * 没人会去心算 —— 所以把时段并进状态本身。
 */
type LifeState = 'draft' | 'scheduled' | 'expired' | 'live';

const STATE_BADGE: Record<LifeState, { text: string; variant: BadgeVariant }> = {
  draft: { text: '草稿', variant: 'outline' },
  scheduled: { text: '未开始', variant: 'warning' },
  expired: { text: '已过期', variant: 'muted' },
  live: { text: '生效中', variant: 'success' },
};

function lifeState(r: Announcement, now: number): LifeState {
  if (r.is_active !== 1) return 'draft';
  const s = parseBackendTime(r.starts_at);
  if (s && s.getTime() > now) return 'scheduled';
  const e = parseBackendTime(r.ends_at);
  if (e && e.getTime() < now) return 'expired';
  return 'live';
}

/** 徽章 title —— 说清「凭什么判成这个状态」,免得又变成一个孤立的色块 */
function stateReason(r: Announcement, state: LifeState): string {
  const from = r.starts_at ? formatBackendTime(r.starts_at) : '立即';
  const to = r.ends_at ? formatBackendTime(r.ends_at) : '长期';
  switch (state) {
    case 'draft':
      return `未发布(is_active=0),对任何人都不展示。时段:${from} → ${to}`;
    case 'scheduled':
      return `已发布但未到开始时间,${from} 起才会展示(结束:${to})`;
    case 'expired':
      return `已发布但已过结束时间 ${to},现在不再展示(开始:${from})`;
    case 'live':
      return `正在展示中。时段:${from} → ${to}`;
  }
}

export function AnnouncementsPage() {
  const { data, isLoading, isFetching, error, refetch } = useAnnouncements();
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const del = useDeleteAnnouncement();
  const [mode, setMode] = useState<EditMode>(null);
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const liveCount = useMemo(() => {
    const now = Date.now();
    return (data ?? []).filter((r) => lifeState(r, now) === 'live').length;
  }, [data]);

  const handleDelete = async (row: Announcement) => {
    const ok = await confirm({
      title: `删除公告「${row.title}」?`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    await apiToast(del.mutateAsync(row.id), { success: '已删除', failure: '删除失败' });
  };

  /**
   * 发布闸门 —— 危险开关比删除影响面更大。
   * 删除走了 useConfirm(danger),而新建弹窗的「立即发布」默认勾选:填完点「创建」的瞬间
   * 一条全站公告就对目标人群生效了,此前零确认。
   */
  const confirmPublish = async (form: AnnouncementInput, isCreate: boolean) => {
    if (form.is_active !== 1) return true;
    const audience = AUDIENCE_LABEL[form.target_audience] ?? form.target_audience;
    const type = TYPE_LABEL[form.type] ?? form.type;
    const when = form.starts_at ? `${formatBackendTime(form.starts_at)} 起` : '立即';
    const until = form.ends_at ? `,${formatBackendTime(form.ends_at)} 自动下线` : ',不自动下线';
    return confirm({
      title: isCreate ? `发布公告「${form.title}」?` : `保存并保持「${form.title}」为发布状态?`,
      description: `${when}以「${type}」形式对「${audience}」展示${until}。`,
      danger: form.severity === 'danger' || form.target_audience === 'all',
      confirmText: '确认发布',
    });
  };

  const columns: Column<Announcement>[] = [
    { header: '标题', cell: (r) => <span className="font-medium text-foreground">{r.title}</span> },
    {
      header: '形式',
      width: 96,
      cell: (r) => <span className="text-12 text-subtle">{TYPE_LABEL[r.type] ?? r.type}</span>,
    },
    {
      header: '目标人群',
      width: 110,
      cell: (r) => (
        <span className="text-12 text-subtle">
          {AUDIENCE_LABEL[r.target_audience] ?? r.target_audience}
        </span>
      ),
    },
    {
      header: '等级',
      width: 80,
      cell: (r) => {
        const s = SEVERITY_LABEL[r.severity] ?? { text: r.severity, variant: 'muted' as const };
        return <Badge variant={s.variant}>{s.text}</Badge>;
      },
    },
    {
      header: '状态',
      width: 90,
      cell: (r) => {
        const state = lifeState(r, Date.now());
        const b = STATE_BADGE[state];
        return (
          <Badge variant={b.variant} title={stateReason(r, state)}>
            {b.text}
          </Badge>
        );
      },
    },
    {
      header: '时段',
      width: 190,
      cell: (r) => (
        // 两行都带前缀 —— 改造前起始为空显示「—」、结束为空显示「长期」,
        // 同一格两种空值两种写法,「—」到底是「立即开始」还是「没设置」看不出来。
        <div className="flex flex-col">
          <TimeCell value={r.starts_at} prefix="起 " absolute fallback="起 立即" />
          <TimeCell value={r.ends_at} prefix="止 " absolute fallback="止 长期" />
        </div>
      ),
    },
    {
      header: '优先级',
      width: 80,
      align: 'right',
      // 多条同时生效时前台只挑一条,优先级是判断「用户实际看到哪一条」的唯一依据
      sortKey: (r) => r.priority,
      cell: (r) => <span className="tabular-nums text-subtle">{r.priority}</span>,
    },
    {
      header: '',
      width: 110,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="编辑"
            title="编辑"
            onClick={() => setMode({ kind: 'edit', row: r })}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive"
            aria-label="删除"
            title="删除"
            onClick={() => handleDelete(r)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="公告"
      description={
        data
          ? `共 ${data.length} 条 · 当前生效中 ${liveCount} 条`
          : '发布站内公告 / 全局横幅'
      }
      onRefresh={() => void refetch()}
      refreshing={isFetching}
      actions={
        <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
          <Plus className="size-3.5" />
          新建公告
        </Button>
      }
    >
      <DataTable
        columns={columns}
        rows={data}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        emptyMessage="还没有公告"
        emptyDescription="新建后可用「目标人群 + 生效时段」控制它何时对谁展示;未勾选「立即发布」的会先存成草稿。"
        emptyAction={
          <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
            <Plus className="size-3.5" />
            新建公告
          </Button>
        }
      />

      <AnnouncementDialog
        mode={mode}
        pending={create.isPending || update.isPending}
        onClose={() => setMode(null)}
        onSubmit={async (form) => {
          if (!mode) return;
          if (!(await confirmPublish(form, mode.kind === 'create'))) return;
          const ok =
            mode.kind === 'create'
              ? await apiToast(create.mutateAsync(form), { success: '已创建', failure: '创建失败' })
              : await apiToast(update.mutateAsync({ id: mode.row.id, data: form }), {
                  success: '已更新',
                  failure: '更新失败',
                });
          if (ok !== null) setMode(null);
        }}
      />
    </AdminPageLayout>
  );
}

function AnnouncementDialog({
  mode,
  pending,
  onClose,
  onSubmit,
}: {
  mode: EditMode;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (form: AnnouncementInput) => void;
}) {
  const isEdit = mode?.kind === 'edit';
  const initial = mode?.kind === 'edit' ? mode.row : undefined;

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && !pending && onClose()}>
      {mode && (
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑公告' : '新建公告'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              onSubmit({
                title: String(fd.get('title') || ''),
                content: String(fd.get('content') || ''),
                type: (fd.get('type') as AnnouncementType) || 'banner',
                severity: (fd.get('severity') as AnnouncementSeverity) || 'info',
                target_audience: (fd.get('target_audience') as AnnouncementAudience) || 'all',
                link_url: String(fd.get('link_url') || '') || undefined,
                link_text: String(fd.get('link_text') || '') || undefined,
                dismissable: fd.get('dismissable') === 'on' ? 1 : 0,
                is_active: fd.get('is_active') === 'on' ? 1 : 0,
                priority: Number(fd.get('priority') || 0),
                // 后端只吃 RFC3339;datetime-local 的 `2026-08-03T14:00` 直接发过去是 400
                starts_at: toRFC3339(String(fd.get('starts_at') || '')),
                ends_at: toRFC3339(String(fd.get('ends_at') || '')),
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="title">标题</Label>
              <Input id="title" name="title" defaultValue={initial?.title} required />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="severity">严重程度</Label>
                <Select id="severity" name="severity" defaultValue={initial?.severity || 'info'}>
                  {SEVERITY_OPTIONS.map(([value, { text }]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">形式</Label>
                <Select id="type" name="type" defaultValue={initial?.type || 'banner'}>
                  {TYPE_OPTIONS.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="target_audience">目标人群</Label>
                <Select
                  id="target_audience"
                  name="target_audience"
                  defaultValue={initial?.target_audience || 'all'}
                >
                  {AUDIENCE_OPTIONS.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="starts_at">开始(留空 = 立即)</Label>
                {/* datetime-local 而非 date:「今晚 22:00 挂维护横幅」原先既存不进也看不见 */}
                <Input
                  id="starts_at"
                  name="starts_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(initial?.starts_at)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ends_at">结束(留空 = 长期)</Label>
                <Input
                  id="ends_at"
                  name="ends_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(initial?.ends_at)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="content">内容</Label>
              <Textarea id="content" name="content" defaultValue={initial?.content} required rows={6} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="link_url">链接 URL(可选)</Label>
                <Input
                  id="link_url"
                  name="link_url"
                  defaultValue={initial?.link_url}
                  placeholder="/announcements/123"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link_text">链接文案</Label>
                <Input
                  id="link_text"
                  name="link_text"
                  defaultValue={initial?.link_text}
                  placeholder="查看详情"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex h-9 items-center gap-2">
                <input
                  id="is_active"
                  name="is_active"
                  type="checkbox"
                  defaultChecked={(initial?.is_active ?? 1) === 1}
                  className="size-4"
                />
                <Label htmlFor="is_active" className="text-12">立即发布</Label>
              </div>
              <div className="flex h-9 items-center gap-2">
                <input
                  id="dismissable"
                  name="dismissable"
                  type="checkbox"
                  defaultChecked={(initial?.dismissable ?? 1) === 1}
                  className="size-4"
                />
                <Label htmlFor="dismissable" className="text-12">用户可关闭</Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="priority" className="text-12">优先级</Label>
                <Input
                  id="priority"
                  name="priority"
                  type="number"
                  defaultValue={initial?.priority ?? 0}
                  className="h-8"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                {isEdit ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
