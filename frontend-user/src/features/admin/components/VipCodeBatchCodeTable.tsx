import { useEffect, useState } from 'react';
import {
  Ban,
  CalendarClock,
  CalendarPlus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { formatGrantDuration } from '@/shared/lib/grant-unit';
import { useConfirm } from '@/shared/components';
import { DataTable, type Column } from './DataTable';
import { Pagination } from './Pagination';
import { CopyableId } from './CopyableId';
import { TimeCell } from './TimeCell';
import { UserCell } from './UserCell';
import {
  createVipCodeAction,
  VipCodeActionDialog,
  type VipCodeActionState,
} from './VipCodeActionDialog';
import { useSetVipCodeStatus, type VipCode } from '../api/vip-codes';
import { useApiToast } from '../hooks/useApiToast';

const PAGE_SIZE = 50;
const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
};

export function VipCodeBatchCodeTable({
  batchId,
  codes,
  loading,
  error,
  onRetry,
}: {
  batchId: string;
  codes: VipCode[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<VipCodeActionState | null>(null);
  const setStatus = useSetVipCodeStatus();
  const confirm = useConfirm();
  const apiToast = useApiToast();

  useEffect(() => {
    setPage(1);
    setAction(null);
  }, [batchId]);

  const allCodes = codes ?? [];
  const visibleCodes = allCodes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleStatus = async (code: VipCode) => {
    const revoked = !code.revoked_at;
    const ok = await confirm({
      title: revoked ? '停用该兑换码？' : '恢复该兑换码？',
      description: revoked
        ? `停用后 ${code.code} 将无法再被兑换，已兑换用户不受影响。`
        : `恢复后 ${code.code} 可再次被兑换（若未过期、未用完）。`,
      confirmText: revoked ? '停用' : '恢复',
      danger: revoked,
    });
    if (!ok) return;
    await apiToast(setStatus.mutateAsync({ id: code.id, revoked }), {
      success: revoked ? '已停用' : '已恢复',
      failure: '操作失败',
    }).catch(() => null);
  };

  const columns: Column<VipCode>[] = [
    {
      header: '兑换码',
      width: 170,
      cell: (code) => (
        <CopyableId
          value={code.code}
          label="兑换码"
          className="font-mono text-12 text-foreground"
        />
      ),
    },
    {
      header: '内容',
      width: 110,
      cell: (code) => <CodeContentBadge code={code} />,
    },
    {
      header: '时长',
      width: 76,
      align: 'right',
      cell: (code) => (
        <span className="tabular-nums text-12">
          {code.grant_kind === 'credit'
            ? code.credit_kind === 'perm'
              ? '—'
              : `${code.credit_validity_days}天`
            : formatGrantDuration(code.grant_days, code.grant_unit)}
        </span>
      ),
    },
    {
      header: '次数',
      width: 70,
      align: 'right',
      cell: (code) => (
        <span className="tabular-nums text-foreground">
          {code.used_count}
          <span className="text-faint">/{Math.max(1, code.max_uses)}</span>
        </span>
      ),
    },
    {
      header: '有效期至',
      width: 150,
      cell: (code) => (
        <TimeCell
          value={code.valid_until}
          absolute
          fallback="永久"
          className="text-12"
        />
      ),
    },
    {
      header: '状态',
      width: 80,
      cell: (code) => <CodeStatusBadge code={code} />,
    },
    {
      header: '最近兑换',
      width: 160,
      cell: (code) =>
        code.redeemed_by_user_id ? (
          <div className="flex min-w-0 flex-col">
            <UserCell id={code.redeemed_by_user_id} />
            <TimeCell value={code.redeemed_at} className="text-12" />
          </div>
        ) : (
          <span className="text-faint">未兑换</span>
        ),
    },
    {
      header: '备注',
      width: 140,
      cell: (code) => (
        <span className="block max-w-36 truncate text-faint">
          {code.note || '—'}
        </span>
      ),
    },
    {
      header: '生成时间',
      width: 130,
      cell: (code) => <TimeCell value={code.created_at} className="text-12" />,
    },
    {
      header: '操作',
      width: 296,
      cell: (code) => (
        <div className="flex items-center gap-1">
          {code.grant_kind === 'tier' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-12"
              onClick={() => setAction(createVipCodeAction(code, 'grant_days'))}
            >
              <CalendarClock className="size-3" /> 改时长
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-12"
            onClick={() => setAction(createVipCodeAction(code, 'extend'))}
          >
            <CalendarPlus className="size-3" /> 续期
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-12"
            onClick={() => setAction(createVipCodeAction(code, 'uses'))}
          >
            <Plus className="size-3" /> 次数
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={
              code.revoked_at
                ? 'h-7 px-2 text-12'
                : 'h-7 px-2 text-12 text-brand-red'
            }
            onClick={() => toggleStatus(code)}
            disabled={setStatus.isPending}
          >
            {code.revoked_at ? (
              <RotateCcw className="size-3" />
            ) : (
              <Ban className="size-3" />
            )}
            {code.revoked_at ? '恢复' : '停用'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={visibleCodes}
        loading={loading}
        error={error}
        onRetry={onRetry}
        rowKey={(code) => code.id}
        emptyMessage="该批次没有兑换码"
      />
      <Pagination
        total={allCodes.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
      <VipCodeActionDialog action={action} onActionChange={setAction} />
    </>
  );
}

function CodeContentBadge({ code }: { code: VipCode }) {
  if (code.grant_kind === 'credit') {
    return (
      <Badge
        variant="muted"
        title={`${code.grant_credits} 经费 ≈ ¥${(code.grant_credits / 100).toFixed(2)}`}
      >
        {code.credit_kind === 'perm' ? '永久' : '临时'}经费 {code.grant_credits}
      </Badge>
    );
  }
  return (
    <Badge variant="default">
      {TIER_LABEL[code.grant_tier] ?? code.grant_tier}
    </Badge>
  );
}

/** 与后端批次互斥统计保持同一优先级：停用 > 用完 > 过期 > 可用。 */
function CodeStatusBadge({ code }: { code: VipCode }) {
  if (code.revoked_at) return <Badge variant="destructive">已停用</Badge>;
  if (code.used_count >= Math.max(1, code.max_uses))
    return <Badge variant="muted">已用完</Badge>;
  if (code.valid_until && new Date(code.valid_until).getTime() < Date.now()) {
    return <Badge variant="muted">已过期</Badge>;
  }
  return <span className="text-brand-green">可兑换</span>;
}
