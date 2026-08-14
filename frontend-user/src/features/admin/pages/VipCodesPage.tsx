import { useState } from 'react';
import { Eye, Layers3 } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { formatGrantDuration } from '@/shared/lib/grant-unit';
import { useDebounce, usePatchUrlState, useUrlState } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { TimeCell } from '../components/TimeCell';
import { UserCell } from '../components/UserCell';
import { VipCodeBatchDrawer } from '../components/VipCodeBatchDrawer';
import { VipCodeGeneratePanel } from '../components/VipCodeGeneratePanel';
import { useVipCodeBatches, type VipCodeBatch } from '../api/vip-codes';

const PAGE_SIZE = 30;
const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
};

/** 会员兑换码：首屏只展示生成批次，全量码和单码操作收进批次详情。 */
export function VipCodesPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [grantKind] = useUrlState('grant_kind', '');
  const [tier] = useUrlState('tier', '');
  const patchUrl = usePatchUrlState();
  const [keywordInput, setKeywordInput] = useState('');
  const keyword = useDebounce(keywordInput.trim(), 400);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const batchesQuery = useVipCodeBatches({
    page,
    page_size: PAGE_SIZE,
    keyword: keyword || undefined,
    grant_kind: grantKind || undefined,
    // 兼容手工拼接/旧书签里的冲突参数 `grant_kind=credit&tier=pro`：
    // 经费码没有会员等级，禁用选择器时也必须停止向后端发送 tier。
    tier: grantKind === 'credit' ? undefined : tier || undefined,
  });
  const { data } = batchesQuery;

  const openBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    setDrawerOpen(true);
  };

  const handleGenerated = (batchId: string) => {
    setPage(1);
    openBatch(batchId);
  };

  const hasFilter = !!keyword || !!grantKind || !!tier;
  const columns: Column<VipCodeBatch>[] = [
    {
      header: '批次号',
      width: 190,
      cell: (batch) => (
        <button
          type="button"
          onClick={() => openBatch(batch.batch_id)}
          title={batch.batch_id}
          className="block max-w-48 truncate font-mono text-12 text-foreground hover:underline"
        >
          {batch.batch_id}
        </button>
      ),
    },
    {
      header: '发放内容',
      width: 160,
      cell: (batch) => <BatchContent batch={batch} />,
    },
    {
      header: '码数',
      width: 70,
      align: 'right',
      cell: (batch) => (
        <span className="tabular-nums text-foreground">{batch.code_count}</span>
      ),
    },
    {
      header: '状态分布',
      width: 300,
      cell: (batch) => <BatchStatusCounts batch={batch} />,
    },
    {
      header: '兑换次数',
      width: 100,
      align: 'right',
      cell: (batch) => (
        <span className="tabular-nums text-foreground">
          {batch.total_used_count}
          <span className="text-faint">/{batch.total_max_uses}</span>
        </span>
      ),
    },
    {
      header: '备注',
      cell: (batch) => (
        <span className="block max-w-40 truncate text-faint">
          {batch.note || '—'}
        </span>
      ),
    },
    {
      header: '创建人',
      width: 120,
      cell: (batch) =>
        batch.created_by ? (
          <UserCell id={batch.created_by} />
        ) : (
          <span className="text-faint">系统 / 历史</span>
        ),
    },
    {
      header: '生成时间',
      width: 140,
      cell: (batch) => (
        <TimeCell value={batch.created_at} className="text-12" />
      ),
    },
    {
      header: '操作',
      width: 92,
      cell: (batch) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openBatch(batch.batch_id)}
        >
          <Eye className="size-4" /> 查看
        </Button>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="会员兑换码"
      description={`共 ${data?.total ?? 0} 个生成批次 · 点击批次查看、复制或导出全部兑换码`}
      onRefresh={() => void batchesQuery.refetch()}
      refreshing={batchesQuery.isFetching}
    >
      <VipCodeGeneratePanel onGenerated={handleGenerated} />

      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-16 border border-border bg-surface-card p-3">
        <Field label="批次搜索" className="w-full sm:w-auto">
          <Input
            value={keywordInput}
            onChange={(event) => {
              setKeywordInput(event.target.value);
              setPage(1);
            }}
            placeholder="批次号 / 备注"
            className="h-8 w-full sm:w-52"
          />
        </Field>
        <Field label="发放类型">
          <Select
            value={grantKind}
            onChange={(event) => {
              const next = event.target.value;
              patchUrl({
                grant_kind: next || null,
                tier: next === 'credit' ? null : tier || null,
                page: null,
              });
            }}
            fullWidth={false}
            className="w-28"
          >
            <option value="">全部</option>
            <option value="tier">会员</option>
            <option value="credit">经费</option>
          </Select>
        </Field>
        <Field label="会员等级">
          <Select
            value={grantKind === 'credit' ? '' : tier}
            onChange={(event) =>
              patchUrl({ tier: event.target.value || null, page: null })
            }
            fullWidth={false}
            className="w-24"
            disabled={grantKind === 'credit'}
          >
            <option value="">全部</option>
            <option value="pro">Pro</option>
            <option value="max">Max</option>
          </Select>
        </Field>
        {hasFilter && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setKeywordInput('');
              patchUrl({ grant_kind: null, tier: null, page: null });
            }}
          >
            清除筛选
          </Button>
        )}
      </section>

      <DataTable
        columns={columns}
        rows={data?.batches}
        loading={batchesQuery.isLoading}
        error={batchesQuery.error}
        onRetry={() => void batchesQuery.refetch()}
        rowKey={(batch) => batch.batch_id}
        emptyMessage={hasFilter ? '当前筛选下没有批次' : '还没有兑换码批次'}
        emptyDescription={
          hasFilter
            ? '请更换批次关键词、发放类型或会员等级。'
            : '生成第一批兑换码后会在这里展示。'
        }
      />
      <Pagination
        total={data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <VipCodeBatchDrawer
        batchId={selectedBatchId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </AdminPageLayout>
  );
}

function BatchContent({ batch }: { batch: VipCodeBatch }) {
  if (batch.mixed) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge variant="warning">
          <Layers3 className="size-3" /> 混合配置
        </Badge>
        <span className="text-12 text-faint">
          {batch.config_variant_count} 种，请查看明细
        </span>
      </div>
    );
  }
  if (batch.grant_kind === 'credit') {
    return <Badge variant="muted">永久经费 {batch.grant_credits}</Badge>;
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="default">
        {TIER_LABEL[batch.grant_tier] ?? batch.grant_tier}
      </Badge>
      <span className="text-12 text-faint">
        {formatGrantDuration(batch.grant_days, batch.grant_unit)}
      </span>
    </div>
  );
}

function BatchStatusCounts({ batch }: { batch: VipCodeBatch }) {
  return (
    <div className="flex flex-wrap items-center gap-2 tabular-nums">
      <span className="text-brand-green">可用 {batch.available_count}</span>
      <span className="text-subtle">用完 {batch.exhausted_count}</span>
      <span className="text-faint">过期 {batch.expired_count}</span>
      <span className="text-brand-red">停用 {batch.revoked_count}</span>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-1 ${className}` : 'space-y-1'}>
      <Label className="text-12 text-faint">{label}</Label>
      {children}
    </div>
  );
}
