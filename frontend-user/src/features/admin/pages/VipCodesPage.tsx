import { useState } from 'react';
import { Copy, Gift, Loader2, Ban, RotateCcw, CalendarPlus, Plus, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { useConfirm } from '@/shared/components';
import { useUrlState, useDebounce } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { useApiToast } from '../hooks/useApiToast';
import {
  useVipCodes,
  useGenerateVipCodes,
  useSetVipCodeStatus,
  useExtendVipCode,
  useIncreaseVipCodeUses,
  useSetVipCodeGrantDays,
  type VipCode,
} from '../api/vip-codes';

const SELECT_CLS = 'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground';

/**
 * 会员兑换码 —— 批量生成 + 列表。生成后弹出码清单供管理员复制分发。
 * 兑换码:用户在「设置 → 我的会员」输入兑换 → 升级/续期 pro。
 */
export function VipCodesPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [status, setStatus] = useUrlState('status', '');
  const [tier, setTier] = useUrlState('tier', '');
  const [redeemerInput, setRedeemerInput] = useState('');
  const redeemer = useDebounce(redeemerInput, 400);
  const apiToast = useApiToast();

  // 生成表单
  const [count, setCount] = useState(10);
  const [genKind, setGenKind] = useState<'tier' | 'credit'>('tier');
  const [genTier, setGenTier] = useState('pro');
  const [grantDays, setGrantDays] = useState(30);
  const [genCredits, setGenCredits] = useState(500);
  const [creditKind, setCreditKind] = useState<'temp' | 'perm'>('temp');
  const [creditDays, setCreditDays] = useState(30);
  const [maxUses, setMaxUses] = useState(1); // 兑换次数 1..100
  const [validDays, setValidDays] = useState(7); // 码有效期窗口 1..30 天
  const [note, setNote] = useState('');
  const [generated, setGenerated] = useState<string[]>([]);
  const gen = useGenerateVipCodes();
  const setStatusMut = useSetVipCodeStatus();
  const extendMut = useExtendVipCode();
  const addUsesMut = useIncreaseVipCodeUses();
  const grantDaysMut = useSetVipCodeGrantDays();
  const confirm = useConfirm();

  // 续期 / 加次数 / 改会员天数 弹窗:选中行 + 操作类型 + 输入值
  type ActionOp = 'extend' | 'uses' | 'grant_days';
  const [action, setAction] = useState<{ code: VipCode; op: ActionOp } | null>(null);
  const [actionVal, setActionVal] = useState(30);

  const params = {
    page,
    page_size: 30,
    status: status || undefined,
    tier: tier || undefined,
    redeemer: redeemer || undefined,
  };
  const { data, isLoading } = useVipCodes(params);

  const handleGenerate = async () => {
    const common = { count, max_uses: maxUses, valid_days: validDays, note: note || undefined };
    const payload =
      genKind === 'credit'
        ? {
            ...common,
            grant_kind: 'credit',
            grant_credits: genCredits,
            credit_kind: creditKind,
            credit_validity_days: creditDays,
          }
        : {
            ...common,
            grant_kind: 'tier',
            tier: genTier,
            grant_days: grantDays,
          };
    const res = await apiToast(gen.mutateAsync(payload), {
      success: '已生成兑换码',
      failure: '生成失败',
    }).catch(() => null);
    if (res?.codes?.length) {
      setGenerated(res.codes);
      setPage(1);
    }
  };

  const toggleStatus = async (r: VipCode) => {
    const revoked = !r.revoked_at; // 当前有效 → 停用;当前停用 → 恢复
    const ok = await confirm({
      title: revoked ? '停用该兑换码?' : '恢复该兑换码?',
      description: revoked
        ? `停用后 ${r.code} 将无法再被兑换(已兑换的用户不受影响)。`
        : `恢复后 ${r.code} 可再次被兑换(若未过期 / 未用完)。`,
      confirmText: revoked ? '停用' : '恢复',
      danger: revoked,
    });
    if (!ok) return;
    apiToast(setStatusMut.mutateAsync({ id: r.id, revoked }), {
      success: revoked ? '已停用' : '已恢复',
      failure: '操作失败',
    }).catch(() => null);
  };

  const openAction = (code: VipCode, op: ActionOp) => {
    // 默认值:续期 30 天 / 加 10 次 / 改天数=该码当前 grant_days
    setActionVal(op === 'extend' ? 30 : op === 'grant_days' ? code.grant_days || 30 : 10);
    setAction({ code, op });
  };
  const submitAction = async () => {
    if (!action) return;
    const { code, op } = action;
    const n = Math.max(1, Number(actionVal) || 1);
    const call =
      op === 'extend'
        ? extendMut.mutateAsync({ id: code.id, days: n })
        : op === 'grant_days'
          ? grantDaysMut.mutateAsync({ id: code.id, days: n })
          : addUsesMut.mutateAsync({ id: code.id, add: n });
    const successMsg = op === 'extend' ? '已续期' : op === 'grant_days' ? '已修改会员天数' : '已加次数';
    const res = await apiToast(call, { success: successMsg, failure: '操作失败' }).catch(() => null);
    if (res) setAction(null);
  };

  const copyCodes = () => {
    navigator.clipboard?.writeText(generated.join('\n'));
    toast.success(`已复制 ${generated.length} 个兑换码`);
  };

  const columns: Column<VipCode>[] = [
    { header: '兑换码', width: 150, cell: (r) => <span className="font-mono text-xs text-foreground select-all">{r.code}</span> },
    {
      header: '内容',
      width: 90,
      cell: (r) =>
        r.grant_kind === 'credit' ? (
          <Badge variant="muted">{r.credit_kind === 'perm' ? '永久' : '临时'}经费 {r.grant_credits}</Badge>
        ) : (
          <Badge variant="default">{r.grant_tier}</Badge>
        ),
    },
    {
      header: '天数',
      width: 60,
      align: 'right',
      cell: (r) => (
        <span className="text-xs tabular-nums">
          {r.grant_kind === 'credit' ? (r.credit_kind === 'perm' ? '—' : r.credit_validity_days) : r.grant_days}
        </span>
      ),
    },
    {
      header: '次数',
      width: 70,
      align: 'right',
      cell: (r) => (
        <span className="text-xs tabular-nums text-foreground">
          {r.used_count}
          <span className="text-faint">/{r.max_uses}</span>
        </span>
      ),
    },
    {
      header: '有效期至',
      width: 110,
      cell: (r) => <span className="text-2xs text-faint">{r.valid_until ? r.valid_until.slice(0, 10) : '永久'}</span>,
    },
    {
      header: '状态',
      width: 80,
      cell: (r) => <CodeStatusBadge code={r} />,
    },
    { header: '备注', cell: (r) => <span className="text-2xs text-faint truncate">{r.note || '—'}</span> },
    {
      header: '生成时间',
      width: 150,
      cell: (r) => <span className="text-2xs text-faint tabular-nums">{r.created_at?.slice(0, 19).replace('T', ' ')}</span>,
    },
    {
      header: '操作',
      width: 296,
      cell: (r) => (
        <div className="flex items-center gap-1">
          {r.grant_kind === 'tier' && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-2xs" onClick={() => openAction(r, 'grant_days')}>
              <CalendarClock className="size-3" /> 改天数
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 px-2 text-2xs" onClick={() => openAction(r, 'extend')}>
            <CalendarPlus className="size-3" /> 续期
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-2xs" onClick={() => openAction(r, 'uses')}>
            <Plus className="size-3" /> 次数
          </Button>
          {r.revoked_at ? (
            <Button size="sm" variant="outline" className="h-7 px-2 text-2xs" onClick={() => toggleStatus(r)}>
              <RotateCcw className="size-3" /> 恢复
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 px-2 text-2xs text-brand-red" onClick={() => toggleStatus(r)}>
              <Ban className="size-3" /> 停用
            </Button>
          )}
        </div>
      ),
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
          <Field label="发放类型">
            <select value={genKind} onChange={(e) => setGenKind(e.target.value as 'tier' | 'credit')} className={cn(SELECT_CLS, 'w-24')}>
              <option value="tier">会员</option>
              <option value="credit">经费</option>
            </select>
          </Field>
          {genKind === 'tier' ? (
            <>
              <Field label="等级">
                <select value={genTier} onChange={(e) => setGenTier(e.target.value)} className={cn(SELECT_CLS, 'w-24')}>
                  <option value="pro">pro</option>
                  <option value="max">max</option>
                </select>
              </Field>
              <Field label="授予天数">
                <Input type="number" min={1} value={grantDays} onChange={(e) => setGrantDays(Number(e.target.value))} className="h-8 w-24" />
              </Field>
            </>
          ) : (
            <>
              <Field label="经费数">
                <Input type="number" min={1} value={genCredits} onChange={(e) => setGenCredits(Number(e.target.value))} className="h-8 w-24" />
              </Field>
              <Field label="经费类型">
                <select value={creditKind} onChange={(e) => setCreditKind(e.target.value as 'temp' | 'perm')} className={cn(SELECT_CLS, 'w-24')}>
                  <option value="temp">临时</option>
                  <option value="perm">永久</option>
                </select>
              </Field>
              {creditKind === 'temp' && (
                <Field label="有效天数">
                  <Input type="number" min={1} value={creditDays} onChange={(e) => setCreditDays(Number(e.target.value))} className="h-8 w-24" />
                </Field>
              )}
            </>
          )}
          <Field label="兑换次数(1-100)">
            <Input
              type="number"
              min={1}
              max={100}
              value={maxUses}
              onChange={(e) => setMaxUses(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
              className="h-8 w-24"
            />
          </Field>
          <Field label="有效天数(1-30)">
            <Input
              type="number"
              min={1}
              max={30}
              value={validDays}
              onChange={(e) => setValidDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
              className="h-8 w-24"
            />
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
            <option value="unredeemed">可兑换</option>
            <option value="redeemed">已用完</option>
          </select>
        </Field>
        <Field label="等级">
          <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} className={cn(SELECT_CLS, 'w-24')}>
            <option value="">全部</option>
            <option value="pro">pro</option>
            <option value="free">free</option>
          </select>
        </Field>
        <Field label="兑换人">
          <Input
            value={redeemerInput}
            onChange={(e) => { setRedeemerInput(e.target.value); setPage(1); }}
            placeholder="ID / 用户名 / 邮箱 / 手机号"
            className="h-8 w-52"
          />
        </Field>
      </section>

      <DataTable columns={columns} rows={data?.codes} loading={isLoading} emptyMessage="还没有兑换码" />
      <Pagination total={data?.total ?? 0} page={page} pageSize={30} onPageChange={setPage} />

      {/* 续期 / 加次数 / 改会员天数 弹窗 —— 对已生成的码顺延有效期 / 增加可兑换次数 / 改授予天数 */}
      <Dialog open={!!action} onOpenChange={(o) => { if (!o) setAction(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {action?.op === 'extend'
                ? '续期 · 延长有效期'
                : action?.op === 'grant_days'
                  ? '修改会员天数'
                  : '增加可兑换次数'}
            </DialogTitle>
            {action && (
              <DialogDescription className="break-all">
                兑换码 <span className="font-mono text-foreground">{action.code.code}</span>
                {action.op === 'extend'
                  ? ` · 当前有效期至 ${action.code.valid_until ? action.code.valid_until.slice(0, 10) : '永久'}(已过期则从今天起算)`
                  : action.op === 'grant_days'
                    ? ` · 当前授予 ${action.code.grant_days} 天 ${action.code.grant_tier}。改后只影响之后的兑换,已兑换用户不受影响。`
                    : ` · 当前 ${action.code.used_count}/${action.code.max_uses} 次`}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="py-1">
            <Field label={action?.op === 'extend' ? '延长天数' : action?.op === 'grant_days' ? '会员天数' : '增加次数'}>
              <Input
                type="number"
                min={1}
                value={actionVal}
                onChange={(e) => setActionVal(Math.max(1, Number(e.target.value) || 1))}
                className="h-8 w-32"
                autoFocus
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>
              取消
            </Button>
            <Button onClick={submitAction} disabled={extendMut.isPending || addUsesMut.isPending || grantDaysMut.isPending}>
              {(extendMut.isPending || addUsesMut.isPending || grantDaysMut.isPending) && <Loader2 className="size-3.5 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

/** 兑换码状态:已停用 > 已用完 > 已过期 > 可兑换。 */
function CodeStatusBadge({ code }: { code: VipCode }) {
  if (code.revoked_at) return <Badge variant="destructive">已停用</Badge>;
  if (code.used_count >= code.max_uses) return <Badge variant="muted">已用完</Badge>;
  if (code.valid_until && new Date(code.valid_until).getTime() < Date.now()) {
    return <Badge variant="muted">已过期</Badge>;
  }
  return <span className="text-xs text-brand-green">可兑换</span>;
}
