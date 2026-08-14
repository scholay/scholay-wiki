import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { TimeCell } from '../components/TimeCell';
import { UserCell } from '../components/UserCell';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useAdminSkills,
  useAdminSkillReports,
  useApproveSkill,
  useRejectSkill,
  useTakedownSkill,
  useResolveReport,
  type AdminSkillReport,
} from '../api/skills';
import type { MySkill, SkillModeration } from '@/shared/api/skills';

const MOD_BADGE: Record<
  SkillModeration,
  { text: string; variant: 'default' | 'warning' | 'success' | 'destructive' }
> = {
  draft: { text: '草稿', variant: 'default' },
  pending: { text: '待审核', variant: 'warning' },
  approved: { text: '已通过', variant: 'success' },
  rejected: { text: '已驳回', variant: 'destructive' },
  flagged: { text: '被举报', variant: 'destructive' },
};

const TABS: [string, string][] = [
  ['pending', '待审核'],
  ['flagged', '被举报'],
  ['approved', '已通过'],
  ['', '全部'],
];

/** 驳回 / 下架 —— 两者都要留一段审核意见,走同一个受控弹窗 */
type NoteAction = { kind: 'reject' | 'takedown'; row: MySkill } | null;

/**
 * 管理端 · Skills 审核队列(/admin/skills-review)。
 * 通过 / 驳回 / 下架(kill-switch)+ 举报处理。skill 内容不可信,预览在详情页(react-markdown 禁 raw)。
 */
export function SkillReviewPage() {
  const [tab, setTab] = useState('pending');
  const { data: skills, isLoading, isFetching, error, refetch } = useAdminSkills(tab);
  // 积压量:pending / flagged 两个 backlog tab 常驻取数(query key 与上面同名时
  // react-query 自动去重,切到该 tab 不会多发一次请求)
  const pendingQ = useAdminSkills('pending');
  const flaggedQ = useAdminSkills('flagged');
  const approve = useApproveSkill();
  const reject = useRejectSkill();
  const takedown = useTakedownSkill();
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const [noteAction, setNoteAction] = useState<NoteAction>(null);

  const tabCount = (val: string): number | undefined => {
    if (val === 'pending') return pendingQ.data?.length;
    if (val === 'flagged') return flaggedQ.data?.length;
    return val === tab ? skills?.length : undefined;
  };

  /**
   * 审核动作互斥 —— 三个 mutation 都是整页共享的一个实例,
   * spinner 必须按 `variables.id` 判到具体行(改造前一行点了通过,所有行一起变灰转圈)。
   */
  const anyPending = approve.isPending || reject.isPending || takedown.isPending;

  const handleApprove = (row: MySkill) =>
    apiToast(approve.mutateAsync({ id: row.id }), { success: '已通过', failure: '操作失败' });

  /**
   * 提交驳回 / 下架。
   *
   * 下架是全局 kill-switch(已安装用户下次新对话就不再加载),所以在受控弹窗之后
   * 还要过一道 typeToConfirm。改造前这两条路径分别是 `prompt('驳回原因(可选):')` 与
   * `window.confirm(...) + prompt(...)`:prompt 在部分内嵌 webview 里被直接屏蔽
   * (返回 null → 静默变成空原因),而且只能输入单行、粘不进多行审核意见。
   */
  const submitNote = async (action: NonNullable<NoteAction>, note: string) => {
    if (action.kind === 'takedown') {
      const ok = await confirm({
        title: `下架「${action.row.name}」?`,
        description: '已安装该技能的用户在下次新建对话时将不再加载它;技能同时会被转为私有。',
        danger: true,
        confirmText: '确认下架',
        typeToConfirm: 'TAKEDOWN',
      });
      if (!ok) return;
      const done = await apiToast(takedown.mutateAsync({ id: action.row.id, note }), {
        success: '已下架',
        failure: '操作失败',
      });
      if (done !== null) setNoteAction(null);
      return;
    }
    const done = await apiToast(reject.mutateAsync({ id: action.row.id, note }), {
      success: '已驳回',
      failure: '操作失败',
    });
    if (done !== null) setNoteAction(null);
  };

  const columns: Column<MySkill>[] = [
    {
      header: '名称',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <Link
            to={`/skills/${r.slug || r.id}`}
            target="_blank"
            className="truncate font-medium text-foreground hover:text-brand-green"
          >
            {r.name}
          </Link>
          <span className="truncate text-12 text-muted-foreground">{r.tagline}</span>
        </div>
      ),
    },
    { header: '分类', width: 110, cell: (r) => <span className="text-12 text-subtle">{r.category}</span> },
    {
      header: '状态',
      width: 90,
      cell: (r) => {
        const b = MOD_BADGE[r.moderationStatus] ?? { text: r.moderationStatus, variant: 'default' as const };
        return <Badge variant={b.variant}>{b.text}</Badge>;
      },
    },
    {
      // 复审 rejected / flagged 时最需要的一列:上一位审核员的处置理由。
      // 看不到它,两个人对同一个 skill 给出互相矛盾的结论只是时间问题。
      header: '上次处置意见',
      width: 200,
      cell: (r) =>
        r.moderationNote ? (
          <span className="line-clamp-2 text-12 text-subtle" title={r.moderationNote}>
            {r.moderationNote}
          </span>
        ) : (
          <span className="text-12 text-faint">—</span>
        ),
    },
    {
      // 待审 skill 压了多久 —— 点表头可按时间排序,先处理最老的
      header: '更新',
      width: 120,
      sortKey: (r) => r.updatedAt,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <TimeCell value={r.updatedAt} />
          {/* ⚠️ 后端 AdminList 的 DTO 没有映射 version(service.go AdminList),恒为 0 ——
              有值才显示,免得每一行都印一个假的 v0 */}
          {r.version > 0 && <span className="text-12 text-faint">v{r.version}</span>}
        </span>
      ),
    },
    { header: '安装', width: 70, cell: (r) => <span className="tabular-nums">{r.installCount}</span>, align: 'right' },
    {
      header: '操作',
      width: 200,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={anyPending} onClick={() => handleApprove(r)}>
            {approve.isPending && approve.variables?.id === r.id && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            通过
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={anyPending}
            onClick={() => setNoteAction({ kind: 'reject', row: r })}
          >
            驳回
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={anyPending}
            onClick={() => setNoteAction({ kind: 'takedown', row: r })}
          >
            下架
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="Skill 审核"
      description="用户上传的技能是不可信内容;审核只是降噪层,真正隔离靠运行时(见设计文档)。"
      onRefresh={() => void refetch()}
      refreshing={isFetching}
      tabs={
        <div className="flex flex-wrap gap-1">
          {TABS.map(([val, label]) => {
            const count = tabCount(val);
            return (
              <Button
                key={val}
                size="sm"
                variant={tab === val ? 'default' : 'outline'}
                onClick={() => setTab(val)}
              >
                {label}
                {count != null && <span className="tabular-nums opacity-70">{count}</span>}
              </Button>
            );
          })}
        </div>
      }
    >
      <DataTable
        columns={columns}
        rows={skills}
        loading={isLoading}
        // 「避免漏审」的原文案保留在 emptyDescription 里;错误态交给 DataTable 统一渲染
        error={error}
        onRetry={() => void refetch()}
        rowKey={(r) => r.id}
        emptyMessage={tab === 'pending' ? '没有待审核的 Skill' : '这个筛选下没有 Skill'}
        emptyDescription={tab === 'pending' ? '队列已清空 —— 新提交会自动出现在这里。' : undefined}
      />

      <ReportsSection />

      <ModerationNoteDialog
        action={noteAction}
        pending={reject.isPending || takedown.isPending}
        onClose={() => setNoteAction(null)}
        onSubmit={(note) => noteAction && submitNote(noteAction, note)}
      />
    </AdminPageLayout>
  );
}

/** 受控的「审核意见」弹窗 —— 替掉 prompt(),支持多行粘贴 */
function ModerationNoteDialog({
  action,
  pending,
  onClose,
  onSubmit,
}: {
  action: NoteAction;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  // 换一条 skill / 换一种动作就清空草稿 —— 弹窗常驻挂载(不能在 open 时 unmount),
  // 只靠关闭时清会把上一条的驳回理由带到下一条上。渲染期同步 state 是 React 官方
  // 推荐的"派生 state"写法,比 useEffect 少一帧闪烁。
  const actionKey = action ? `${action.kind}:${action.row.id}` : '';
  const [lastKey, setLastKey] = useState('');
  if (actionKey !== lastKey) {
    setLastKey(actionKey);
    setNote('');
  }
  const isTakedown = action?.kind === 'takedown';

  return (
    <Dialog
      open={!!action}
      onOpenChange={(o) => {
        if (o || pending) return;
        setNote('');
        onClose();
      }}
    >
      {action && (
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isTakedown ? '下架' : '驳回'}「{action.row.name}」
            </DialogTitle>
            <DialogDescription>
              {isTakedown
                ? '这条意见会写进 moderationNote,作者与后续复审的人都能看到。下一步还需要打字确认。'
                : '这条意见会写进 moderationNote,作者能看到 —— 写清楚要改什么,复审时也用得上。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="moderation-note">{isTakedown ? '下架原因' : '驳回原因'}(可选)</Label>
            <Textarea
              id="moderation-note"
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                isTakedown
                  ? '如:SKILL.md 中包含向外部地址回传会话内容的指令'
                  : '如:whenToUse 与实际能力不符,请补充触发条件说明'
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              取消
            </Button>
            <Button
              type="button"
              variant={isTakedown ? 'destructive' : 'default'}
              disabled={pending}
              onClick={() => onSubmit(note.trim())}
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {isTakedown ? '下架' : '驳回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function ReportsSection() {
  // isError 必须解构出来:页面上半部分已经正确处理了错误态,下半部分原先只解构
  // data/isLoading —— 接口失败时 reports 是 undefined,和「真的没有举报」一样落进
  // 「暂无待处理举报」的空态,把故障藏了起来。
  const { data: reports, isLoading, isFetching, error, refetch } = useAdminSkillReports('open');
  const resolve = useResolveReport();
  const apiToast = useApiToast();

  const busy = (id: number) => resolve.isPending && resolve.variables?.id === id;

  const handleResolve = (r: AdminSkillReport, action: 'actioned' | 'dismissed') =>
    apiToast(resolve.mutateAsync({ id: r.id, action }), {
      success: action === 'actioned' ? '已处理' : '已忽略',
      failure: '操作失败',
    });

  const columns: Column<AdminSkillReport>[] = [
    {
      header: 'Skill',
      width: 90,
      cell: (r) => (
        <Link to={`/skills/${r.skillId}`} target="_blank" className="text-brand-green hover:underline">
          #{r.skillId}
        </Link>
      ),
    },
    {
      // 同一个账号连着举报多条 = 恶意举报竞品,是这类市场的常见玩法。
      // 不显示举报人就既看不出刷举报,也无法从这里跳去看他的其它行为。
      header: '举报人',
      width: 170,
      cell: (r) => <UserCell id={r.reporterUserId ?? null} anonymousLabel="未知用户" />,
    },
    { header: '原因', width: 130, cell: (r) => <Badge variant="warning">{r.reason}</Badge> },
    {
      header: '详情',
      cell: (r) => (
        <span className="line-clamp-2 text-12 text-muted-foreground" title={r.detail || undefined}>
          {r.detail || '—'}
        </span>
      ),
    },
    {
      header: '举报于',
      width: 120,
      sortKey: (r) => r.createdAt,
      cell: (r) => <TimeCell value={r.createdAt} />,
    },
    {
      header: '处理',
      width: 160,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={resolve.isPending}
            onClick={() => handleResolve(r, 'actioned')}
          >
            {busy(r.id) && <Loader2 className="size-3.5 animate-spin" />}
            采纳
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={resolve.isPending}
            onClick={() => handleResolve(r, 'dismissed')}
          >
            忽略
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-14 font-medium text-foreground">待处理举报</h2>
        {reports != null && (
          <span className="rounded-pill bg-surface-2 px-2 text-12 tabular-nums text-faint">
            {reports.length}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {isFetching && <Loader2 className="size-3.5 animate-spin" />}
          刷新
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={reports}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        rowKey={(r) => r.id}
        emptyMessage="暂无待处理举报"
      />
    </div>
  );
}
