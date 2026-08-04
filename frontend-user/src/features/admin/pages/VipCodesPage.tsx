import { useState } from 'react';
import { Copy, Gift, Loader2, Ban, RotateCcw, CalendarPlus, Plus, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
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
import { copyToClipboard } from '@/shared/lib/clipboard';
import {
  GRANT_UNITS,
  GRANT_UNIT_LABEL,
  formatGrantDuration,
  maxGrantAmount,
  normGrantUnit,
  type GrantUnit,
} from '@/shared/lib/grant-unit';
import { useConfirm } from '@/shared/components';
import { useUrlState, usePatchUrlState, useDebounce } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { UserCell } from '../components/UserCell';
import { TimeCell } from '../components/TimeCell';
import { CopyableId } from '../components/CopyableId';
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

/**
 * 会员兑换码 —— 批量生成 + 列表。生成后弹出码清单供管理员复制分发。
 * 兑换码:用户在「设置 → 我的会员」输入兑换 → 升级/续期 pro。
 */

// 会员等级展示名全站统一 Free / Pro / Max(与 UserCell / UserDetailDrawer / UserGrantPanel 同口径)。
// ⚠️ 这里刻意复制而非跨文件 import:那三处也各自持有一份本地常量,收口应另起一个 shared 常量文件,
// 不在本次改动范围内。
const TIER_LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', max: 'Max' };

/** 授予数量夹到 [1, 该单位上界](与后端 maxGrantAmount 同口径)。NaN(输入框清空)回落 1。 */
const clampAmount = (v: number, unit: GrantUnit) => Math.min(maxGrantAmount(unit), Math.max(1, Number(v) || 1));

export function VipCodesPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [status] = useUrlState('status', '');
  const [tier] = useUrlState('tier', '');
  // 改筛选必须同时回第 1 页 —— 两个 useUrlState setter 在同一个事件里会互相覆盖(见 hook 注释),
  // 所以多 key 写入一律走 patch,压成一次 navigate。
  const patch = usePatchUrlState();
  const [redeemerInput, setRedeemerInput] = useState('');
  const redeemer = useDebounce(redeemerInput, 400);
  const apiToast = useApiToast();

  // 生成表单
  const [count, setCount] = useState(10);
  const [genKind, setGenKind] = useState<'tier' | 'credit'>('tier');
  const [genTier, setGenTier] = useState('pro');
  const [grantDays, setGrantDays] = useState(30); // 授予**数量**,单位见 grantUnit
  const [grantUnit, setGrantUnit] = useState<GrantUnit>('day');
  const [genCredits, setGenCredits] = useState(500);
  const [creditKind] = useState<'temp' | 'perm'>('perm'); // 0090:固定永久,选择器已删
  const [creditDays] = useState(30); // 0090:经费不过期,天数不再可编辑(仍随请求发出,后端忽略)
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

  // 续期 / 加次数 / 改会员时长 弹窗:选中行 + 操作类型 + 输入值(+ 改时长时的单位)
  type ActionOp = 'extend' | 'uses' | 'grant_days';
  const [action, setAction] = useState<{ code: VipCode; op: ActionOp } | null>(null);
  const [actionVal, setActionVal] = useState(30);
  // 只对 grant_days 有意义:续期(码有效期)与加次数都没有单位概念,固定「天 / 次」。
  const [actionUnit, setActionUnit] = useState<GrantUnit>('day');

  const params = {
    page,
    page_size: 30,
    status: status || undefined,
    tier: tier || undefined,
    redeemer: redeemer || undefined,
  };
  const codesQ = useVipCodes(params);
  const { data, isLoading } = codesQ;

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
            grant_days: grantDays, // 数量
            grant_unit: grantUnit, // 单位:day|month|year
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
    // 默认值:续期 30 天 / 加 10 次 / 改时长=该码当前的「数量 + 单位」。
    // 🔴 单位必须一起回填:month 码打开弹窗时若单位回落成 day,管理员看到「30」以为是原样,
    // 一点确定就把一张 30 个月的码改成了 30 天(反过来同理,是静默放大)。
    setActionVal(op === 'extend' ? 30 : op === 'grant_days' ? code.grant_days || 30 : 10);
    if (op === 'grant_days') setActionUnit(normGrantUnit(code.grant_unit));
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
          ? // unit 必传(后端一次写两列),哪怕它就是 day
            grantDaysMut.mutateAsync({ id: code.id, days: Math.min(n, maxGrantAmount(actionUnit)), unit: actionUnit })
          : addUsesMut.mutateAsync({ id: code.id, add: n });
    const successMsg = op === 'extend' ? '已续期' : op === 'grant_days' ? '已修改会员时长' : '已加次数';
    const res = await apiToast(call, { success: successMsg, failure: '操作失败' }).catch(() => null);
    if (res) setAction(null);
  };

  // 🔴 不能写 `navigator.clipboard?.writeText(...)` 后无条件 toast.success:
  // 线上是明文 HTTP,`navigator.clipboard` 是 undefined,`?.` 让它变成静默 no-op,
  // 而这块面板的文案正是「请立即复制分发」—— 粘出来是空的却看到「已复制 200 个兑换码」。
  // copyToClipboard 带 execCommand 兜底并返回真实结果。
  const copyCodes = async () => {
    const ok = await copyToClipboard(generated.join('\n'));
    if (ok) toast.success(`已复制 ${generated.length} 个兑换码`);
    else toast.error('复制失败,请手动全选下方列表复制');
  };

  const columns: Column<VipCode>[] = [
    {
      header: '兑换码',
      width: 170,
      cell: (r) => <CopyableId value={r.code} label="兑换码" className="font-mono text-12 text-foreground" />,
    },
    {
      header: '内容',
      width: 90,
      cell: (r) =>
        r.grant_kind === 'credit' ? (
          <Badge
            variant="muted"
            title={`${r.grant_credits} 经费 ≈ ¥${(r.grant_credits / 100).toFixed(2)}(100 经费 = ¥1)`}
          >
            {r.credit_kind === 'perm' ? '永久' : '临时'}经费 {r.grant_credits}
          </Badge>
        ) : (
          // 全站等级展示名统一 Free/Pro/Max —— 不直出后端的裸小写 `pro` / `max`
          <Badge variant="default">{TIER_LABEL[r.grant_tier] ?? r.grant_tier}</Badge>
        ),
    },
    {
      // 「天数」→「时长」:0110 起会员码可以是天/月/年,只印数字的话一个「1」既可能是
      // 1 天也可能是 1 年,运维照着列表发码必错。
      // ⚠️ 这一列被两个不同概念复用:tier 码是**授予时长**,credit 码是**经费有效期天数**
      // (后者与 grant_unit 无关,永远是天,别顺手一起改单位)。
      header: '时长',
      width: 76,
      align: 'right',
      cell: (r) => (
        <span className="text-12 tabular-nums">
          {r.grant_kind === 'credit'
            ? r.credit_kind === 'perm'
              ? '—'
              : `${r.credit_validity_days}天`
            : formatGrantDuration(r.grant_days, r.grant_unit)}
        </span>
      ),
    },
    {
      header: '次数',
      width: 70,
      align: 'right',
      cell: (r) => (
        <span className="text-12 tabular-nums text-foreground">
          {r.used_count}
          <span className="text-faint">/{r.max_uses}</span>
        </span>
      ),
    },
    {
      // 未来时刻,相对时间会算成负 diff 显示「刚刚」,故固定用绝对时刻
      header: '有效期至',
      width: 150,
      cell: (r) => <TimeCell value={r.valid_until} absolute fallback="永久" className="text-12" />,
    },
    {
      header: '状态',
      width: 80,
      cell: (r) => <CodeStatusBadge code={r} />,
    },
    {
      // 后端 RedemptionCode 的 redeemed_by_user_id / redeemed_at 注释就写着「最近兑换者(展示用)」,
      // 数据一直随列表返回。没有这一列时,按「兑换人」筛完看到的还是一堆码本身,
      // 完全不知道是谁兑的、什么时候兑的 —— 筛选功能等于半截。
      header: '最近兑换',
      width: 160,
      cell: (r) =>
        r.redeemed_by_user_id ? (
          <div className="flex min-w-0 flex-col">
            <UserCell id={r.redeemed_by_user_id} />
            <TimeCell value={r.redeemed_at} className="text-12" />
          </div>
        ) : (
          <span className="text-12 text-faint">未兑换</span>
        ),
    },
    { header: '备注', cell: (r) => <span className="text-12 text-faint truncate">{r.note || '—'}</span> },
    {
      header: '生成时间',
      width: 130,
      cell: (r) => <TimeCell value={r.created_at} className="text-12" />,
    },
    {
      header: '操作',
      width: 296,
      cell: (r) => (
        <div className="flex items-center gap-1">
          {r.grant_kind === 'tier' && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-12" onClick={() => openAction(r, 'grant_days')}>
              <CalendarClock className="size-3" /> 改时长
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 px-2 text-12" onClick={() => openAction(r, 'extend')}>
            <CalendarPlus className="size-3" /> 续期
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-12" onClick={() => openAction(r, 'uses')}>
            <Plus className="size-3" /> 次数
          </Button>
          {r.revoked_at ? (
            <Button size="sm" variant="outline" className="h-7 px-2 text-12" onClick={() => toggleStatus(r)}>
              <RotateCcw className="size-3" /> 恢复
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 px-2 text-12 text-brand-red" onClick={() => toggleStatus(r)}>
              <Ban className="size-3" /> 停用
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="会员兑换码"
      description={`共 ${data?.total ?? 0} 个 · 生成后复制分发, 用户在「我的会员」兑换`}
      onRefresh={() => void codesQ.refetch()}
      refreshing={codesQ.isFetching}
    >
      {/* 生成 */}
      <section className="mb-4 rounded-16 border border-border bg-surface-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-14 font-medium text-foreground">
          <Gift className="size-4" /> 批量生成
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="数量">
            <Input type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-8 w-24" />
          </Field>
          <Field label="发放类型">
            <Select value={genKind} onChange={(e) => setGenKind(e.target.value as 'tier' | 'credit')} fullWidth={false} className="w-24">
              <option value="tier">会员</option>
              <option value="credit">经费</option>
            </Select>
          </Field>
          {genKind === 'tier' ? (
            <>
              <Field label="等级">
                <Select value={genTier} onChange={(e) => setGenTier(e.target.value)} fullWidth={false} className="w-24">
                  <option value="pro">{TIER_LABEL.pro}</option>
                  <option value="max">{TIER_LABEL.max}</option>
                </Select>
              </Field>
              {/* 授予时长 = 数量 + 单位。单位不是「计费周期徽标」,这里只决定这批码发多久。 */}
              <Field label="授予时长">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={maxGrantAmount(grantUnit)}
                    value={grantDays}
                    onChange={(e) => setGrantDays(clampAmount(Number(e.target.value), grantUnit))}
                    className="h-8 w-20"
                  />
                  <Select
                    value={grantUnit}
                    // 换单位要把数量夹回新上界:day 下的 365 换成「年」就是 365 年,后端会静默夹到 10,
                    // 表单却还显示 365 —— 管理员以为发了 365 年。就地夹取,所见即所发。
                    onChange={(e) => {
                      const u = normGrantUnit(e.target.value);
                      setGrantUnit(u);
                      setGrantDays((v) => clampAmount(v, u));
                    }}
                    fullWidth={false}
                    className="w-20"
                  >
                    {GRANT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {GRANT_UNIT_LABEL[u]}
                      </option>
                    ))}
                  </Select>
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="经费数">
                <Input type="number" min={1} value={genCredits} onChange={(e) => setGenCredits(Number(e.target.value))} className="h-8 w-24" />
              </Field>
              {/* 0090:经费只剩一种,「经费类型/有效天数」两项已删。后端建码一律按永久,
                  存量 credit_kind='temp' 的旧码兑换时也按永久发放(不作废用户已持有的码)。 */}
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
          <div className="mt-4 rounded-12 border border-border-soft bg-surface-1 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-12 font-medium text-foreground">本次生成 {generated.length} 个(请立即复制分发)</span>
              <Button size="sm" variant="outline" onClick={copyCodes}>
                <Copy className="size-3.5" /> 复制全部
              </Button>
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-12 text-subtle">{generated.join('\n')}</pre>
          </div>
        )}
      </section>

      {/* 筛选 */}
      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-16 border border-border-soft bg-surface-1 p-3">
        <Field label="状态">
          <Select value={status} onChange={(e) => patch({ status: e.target.value || null, page: null })} fullWidth={false} className="w-28">
            <option value="">全部</option>
            <option value="unredeemed">可兑换</option>
            <option value="redeemed">已用完</option>
          </Select>
        </Field>
        <Field label="等级">
          {/* 后端 ListCodes 是 `grant_tier = ?` 精确匹配。生成表单只产 pro / max 两种会员码,
              从来没有 free 码 —— 原来的 free 选项永远筛出 0 条,而真实存在的 max 码没有选项可选。 */}
          <Select value={tier} onChange={(e) => patch({ tier: e.target.value || null, page: null })} fullWidth={false} className="w-24">
            <option value="">全部</option>
            <option value="pro">{TIER_LABEL.pro}</option>
            <option value="max">{TIER_LABEL.max}</option>
          </Select>
        </Field>
        <Field label="兑换人" className="w-full sm:w-auto">
          <Input
            value={redeemerInput}
            onChange={(e) => { setRedeemerInput(e.target.value); setPage(1); }}
            placeholder="ID / 用户名 / 邮箱 / 手机号"
            className="h-8 w-full sm:w-52"
          />
        </Field>
      </section>

      {/* error 必须透传:不传的话请求失败会和"库里真的没有兑换码"落进同一个空态 */}
      <DataTable
        columns={columns}
        rows={data?.codes}
        loading={isLoading}
        error={codesQ.error}
        onRetry={() => void codesQ.refetch()}
        emptyMessage={status || tier || redeemer ? '当前筛选下没有兑换码' : '还没有兑换码'}
        emptyDescription={status || tier || redeemer ? '换个状态 / 等级,或清空兑换人关键词再试。' : undefined}
        emptyAction={
          status || tier || redeemer ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRedeemerInput('');
                patch({ status: null, tier: null, page: null });
              }}
            >
              清除筛选
            </Button>
          ) : undefined
        }
      />
      <Pagination total={data?.total ?? 0} page={page} pageSize={30} onPageChange={setPage} />

      {/* 续期 / 加次数 / 改会员时长 弹窗 —— 对已生成的码顺延有效期 / 增加可兑换次数 / 改授予时长 */}
      <Dialog open={!!action} onOpenChange={(o) => { if (!o) setAction(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {action?.op === 'extend'
                ? '续期 · 延长有效期'
                : action?.op === 'grant_days'
                  ? '修改会员时长'
                  : '增加可兑换次数'}
            </DialogTitle>
            {action && (
              <DialogDescription className="break-all">
                兑换码 <span className="font-mono text-foreground">{action.code.code}</span>
                {action.op === 'extend'
                  ? ` · 当前有效期至 ${action.code.valid_until ? action.code.valid_until.slice(0, 10) : '永久'}(已过期则从今天起算)`
                  : action.op === 'grant_days'
                    ? // 这是管理员唯一能看到「这张码到底发多久」的确认文案 —— 数量必须连着单位一起印
                      ` · 当前授予 ${TIER_LABEL[action.code.grant_tier] ?? action.code.grant_tier} ${formatGrantDuration(action.code.grant_days, action.code.grant_unit)}。改后只影响之后的兑换,已兑换用户不受影响。`
                    : ` · 当前 ${action.code.used_count}/${action.code.max_uses} 次`}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="py-1">
            <Field label={action?.op === 'extend' ? '延长天数' : action?.op === 'grant_days' ? '会员时长' : '增加次数'}>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={action?.op === 'grant_days' ? maxGrantAmount(actionUnit) : undefined}
                  value={actionVal}
                  onChange={(e) =>
                    setActionVal(
                      action?.op === 'grant_days'
                        ? clampAmount(Number(e.target.value), actionUnit)
                        : Math.max(1, Number(e.target.value) || 1),
                    )
                  }
                  className="h-8 w-32"
                  autoFocus
                />
                {/* 只有「改会员时长」有单位;续期改的是码自身有效期(恒天)、加次数是次。 */}
                {action?.op === 'grant_days' && (
                  <Select
                    value={actionUnit}
                    onChange={(e) => {
                      const u = normGrantUnit(e.target.value);
                      setActionUnit(u);
                      setActionVal((v) => clampAmount(v, u));
                    }}
                    fullWidth={false}
                    className="w-20"
                  >
                    {GRANT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {GRANT_UNIT_LABEL[u]}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
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

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-12 text-faint">{label}</Label>
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
  return <span className="text-12 text-brand-green">可兑换</span>;
}
