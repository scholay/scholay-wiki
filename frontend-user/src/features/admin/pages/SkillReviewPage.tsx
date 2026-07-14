import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { toast } from 'sonner';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
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

/**
 * 管理端 · Skills 审核队列(/admin/skills-review)。
 * 通过 / 驳回 / 下架(kill-switch)+ 举报处理。skill 内容不可信,预览在详情页(react-markdown 禁 raw)。
 */
export function SkillReviewPage() {
  const [tab, setTab] = useState('pending');
  const { data: skills, isLoading, isError, refetch } = useAdminSkills(tab);
  const approve = useApproveSkill();
  const reject = useRejectSkill();
  const takedown = useTakedownSkill();

  const columns: Column<MySkill>[] = [
    {
      header: '名称',
      cell: (r) => (
        <Link
          to={`/skills/${r.slug || r.id}`}
          target="_blank"
          className="font-medium text-foreground hover:text-brand-green"
        >
          {r.name}
        </Link>
      ),
    },
    { header: '简介', cell: (r) => <span className="text-muted-foreground">{r.tagline}</span> },
    { header: '分类', cell: (r) => r.category },
    {
      header: '状态',
      cell: (r) => {
        const b = MOD_BADGE[r.moderationStatus];
        return <Badge variant={b.variant}>{b.text}</Badge>;
      },
    },
    { header: '安装', cell: (r) => r.installCount, align: 'right' },
    {
      header: '操作',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate(
                { id: r.id },
                { onSuccess: () => toast.success('已通过'), onError: (e) => toast.error((e as Error).message || '操作失败') }
              )
            }
          >
            通过
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const note = prompt('驳回原因(可选):') ?? '';
              reject.mutate(
                { id: r.id, note },
                { onSuccess: () => toast.success('已驳回'), onError: (e) => toast.error((e as Error).message || '操作失败') }
              );
            }}
          >
            驳回
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (!confirm(`下架「${r.name}」?已安装用户下次新对话将不再加载。`)) return;
              const note = prompt('下架原因(可选):') ?? '';
              takedown.mutate(
                { id: r.id, note },
                { onSuccess: () => toast.success('已下架'), onError: (e) => toast.error((e as Error).message || '操作失败') }
              );
            }}
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
    >
      <div className="mb-3 flex gap-1.5">
        {TABS.map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTab(val)}
            className={
              'rounded-md px-3 py-1 text-xs ' +
              (tab === val
                ? 'bg-surface-2 text-foreground'
                : 'text-muted-foreground hover:bg-surface-1')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {isError ? (
        <div className="rounded-md border border-border bg-danger-soft p-4 text-sm text-brand-red">
          加载审核队列失败,请
          <button className="ml-1 underline" onClick={() => refetch()}>
            重试
          </button>
          (避免漏审)。
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={skills}
          loading={isLoading}
          rowKey={(r) => r.id}
          emptyMessage="没有待处理的 Skill"
        />
      )}

      <ReportsSection />
    </AdminPageLayout>
  );
}

function ReportsSection() {
  const { data: reports, isLoading } = useAdminSkillReports('open');
  const resolve = useResolveReport();

  const columns: Column<AdminSkillReport>[] = [
    {
      header: 'Skill',
      cell: (r) => (
        <Link
          to={`/skills/${r.skillId}`}
          target="_blank"
          className="text-brand-green hover:underline"
        >
          #{r.skillId}
        </Link>
      ),
    },
    { header: '原因', cell: (r) => <Badge variant="warning">{r.reason}</Badge> },
    { header: '详情', cell: (r) => <span className="text-muted-foreground">{r.detail || '—'}</span> },
    {
      header: '处理',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              resolve.mutate(
                { id: r.id, action: 'actioned' },
                { onSuccess: () => toast.success('已处理'), onError: (e) => toast.error((e as Error).message || '操作失败') }
              )
            }
          >
            采纳
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              resolve.mutate(
                { id: r.id, action: 'dismissed' },
                { onSuccess: () => toast.success('已忽略'), onError: (e) => toast.error((e as Error).message || '操作失败') }
              )
            }
          >
            忽略
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mt-8">
      <h2 className="mb-2 text-sm font-semibold text-foreground">待处理举报</h2>
      <DataTable
        columns={columns}
        rows={reports}
        loading={isLoading}
        rowKey={(r) => r.id}
        emptyMessage="暂无待处理举报"
      />
    </div>
  );
}
