import { useState } from 'react';
import { Copy, Gift, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import { useUrlState } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { useApiToast } from '../hooks/useApiToast';
import { useVipCodes, useGenerateVipCodes, type VipCode } from '../api/vip-codes';

const SELECT_CLS = 'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground';

/**
 * 会员兑换码 —— 批量生成 + 列表。生成后弹出码清单供管理员复制分发。
 * 兑换码:用户在「设置 → 我的会员」输入兑换 → 升级/续期 pro。
 */
export function VipCodesPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [status, setStatus] = useUrlState('status', '');
  const [tier, setTier] = useUrlState('tier', '');
  const apiToast = useApiToast();

  // 生成表单
  const [count, setCount] = useState(10);
  const [genTier, setGenTier] = useState('pro');
  const [grantDays, setGrantDays] = useState(30);
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');
  const [generated, setGenerated] = useState<string[]>([]);
  const gen = useGenerateVipCodes();

  const params = { page, page_size: 30, status: status || undefined, tier: tier || undefined };
  const { data, isLoading } = useVipCodes(params);

  const handleGenerate = async () => {
    const res = await apiToast(
      gen.mutateAsync({
        count,
        tier: genTier,
        grant_days: grantDays,
        valid_until: validUntil || undefined,
        note: note || undefined,
      }),
      { success: '已生成兑换码', failure: '生成失败' }
    ).catch(() => null);
    if (res?.codes?.length) {
      setGenerated(res.codes);
      setPage(1);
    }
  };

  const copyCodes = () => {
    navigator.clipboard?.writeText(generated.join('\n'));
    toast.success(`已复制 ${generated.length} 个兑换码`);
  };

  const columns: Column<VipCode>[] = [
    { header: '兑换码', width: 150, cell: (r) => <span className="font-mono text-xs text-foreground select-all">{r.code}</span> },
    { header: '等级', width: 70, cell: (r) => <Badge variant={r.grant_tier === 'pro' ? 'default' : 'muted'}>{r.grant_tier}</Badge> },
    { header: '天数', width: 60, align: 'right', cell: (r) => <span className="text-xs tabular-nums">{r.grant_days}</span> },
    {
      header: '有效期',
      width: 110,
      cell: (r) => <span className="text-2xs text-faint">{r.valid_until ? r.valid_until.slice(0, 10) : '永久'}</span>,
    },
    {
      header: '状态',
      width: 90,
      cell: (r) =>
        r.redeemed_at ? (
          <Badge variant="muted">已兑换</Badge>
        ) : (
          <span className="text-xs text-brand-green">未兑换</span>
        ),
    },
    {
      header: '兑换者',
      width: 90,
      cell: (r) => <span className="text-2xs text-faint">{r.redeemed_by_user_id ? `#${r.redeemed_by_user_id}` : '—'}</span>,
    },
    { header: '备注', cell: (r) => <span className="text-2xs text-faint truncate">{r.note || '—'}</span> },
    {
      header: '生成时间',
      width: 150,
      cell: (r) => <span className="text-2xs text-faint tabular-nums">{r.created_at?.slice(0, 19).replace('T', ' ')}</span>,
    },
  ];

  return (
    <AdminPageLayout title="会员兑换码" description={`共 ${data?.total ?? 0} 个 · 生成后复制分发, 用户在「我的会员」兑换`}>
      {/* 生成 */}
      <section className="mb-4 rounded-md border border-border bg-background p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <Gift className="size-4" /> 批量生成
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="数量">
            <Input type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-8 w-24" />
          </Field>
          <Field label="等级">
            {/* 兑换码只授予 pro(后端强制);保留 select 形态以便将来扩展更多付费等级。 */}
            <select value={genTier} onChange={(e) => setGenTier(e.target.value)} className={cn(SELECT_CLS, 'w-24')}>
              <option value="pro">pro</option>
            </select>
          </Field>
          <Field label="授予天数">
            <Input type="number" min={1} value={grantDays} onChange={(e) => setGrantDays(Number(e.target.value))} className="h-8 w-24" />
          </Field>
          <Field label="码有效期(可空=永久)">
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-8 w-40" />
          </Field>
          <Field label="备注">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="批次标签" className="h-8 w-40" />
          </Field>
          <Button onClick={handleGenerate} disabled={gen.isPending || count < 1}>
            {gen.isPending && <Loader2 className="size-3.5 animate-spin" />}
            生成
          </Button>
        </div>

        {generated.length > 0 && (
          <div className="mt-4 rounded-md border border-border-soft bg-surface-1 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">本次生成 {generated.length} 个(请立即复制分发)</span>
              <Button size="sm" variant="outline" onClick={copyCodes}>
                <Copy className="size-3.5" /> 复制全部
              </Button>
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-2xs text-subtle">{generated.join('\n')}</pre>
          </div>
        )}
      </section>

      {/* 筛选 */}
      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-border-soft bg-surface-1 p-3">
        <Field label="状态">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={cn(SELECT_CLS, 'w-28')}>
            <option value="">全部</option>
            <option value="unredeemed">未兑换</option>
            <option value="redeemed">已兑换</option>
          </select>
        </Field>
        <Field label="等级">
          <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} className={cn(SELECT_CLS, 'w-24')}>
            <option value="">全部</option>
            <option value="pro">pro</option>
            <option value="free">free</option>
          </select>
        </Field>
      </section>

      <DataTable columns={columns} rows={data?.codes} loading={isLoading} emptyMessage="还没有兑换码" />
      <Pagination total={data?.total ?? 0} page={page} pageSize={30} onPageChange={setPage} />
    </AdminPageLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-2xs text-faint tracking-[0.12em]">{label}</Label>
      {children}
    </div>
  );
}
