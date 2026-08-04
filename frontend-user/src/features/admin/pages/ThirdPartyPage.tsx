import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Zap, RotateCcw, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { SecretInput } from '@/shared/ui/secret-input';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { DataTable, type Column } from '../components/DataTable';
import { TimeCell } from '../components/TimeCell';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useThirdPartyAccounts,
  useCreateThirdParty,
  useUpdateThirdParty,
  useDeleteThirdParty,
  useTestThirdParty,
  useResetThirdPartyStats,
  type ThirdPartyAccount,
  type AccountType,
  type AccountConfig,
} from '../api/third-party';

type EditMode = { kind: 'create' } | { kind: 'edit'; row: ThirdPartyAccount } | null;

const TYPE_LABEL: Record<AccountType, string> = {
  ai_model: 'AI 模型',
  minicod: 'MiniCod',
};

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'ai_model', label: 'AI 模型(api_key + api_base + model)' },
  { value: 'minicod', label: 'MiniCod(api_key + base_url)' },
];

/**
 * 三方账号面板 —— 作为「模型与账号」页(AiUpstreamPage)的一个 tab 渲染。
 * 上游 AI / MiniCod 的 API key 池 CRUD。不含 AdminPageLayout 外壳(由父页统一提供),
 * actions 内联成顶部工具条。
 */
export function ThirdPartyPanel() {
  // reveal 由编辑弹窗的小眼睛控制; reveal=true 时列表用 ?show_sensitive=true 重拉明文,
  // 弹窗选中 row 的 secret 字段随之同步成明文。脱敏/明文分开缓存(queryKey 含 showSensitive)。
  //
  // 🔴 关弹窗必须一并复位 —— 否则列表 query 长期停在 `?show_sensitive=true`,
  // 之后每一次 refetch(现在还叠了 30s 自动刷新)都把全部明文 API key 拉进前端,
  // 而界面上没有任何提示。见下方 onClose + 「明文模式」按钮。
  const [reveal, setReveal] = useState(false);
  const accountsQ = useThirdPartyAccounts({ showSensitive: reveal });
  const { data, isLoading, error, dataUpdatedAt } = accountsQ;
  const create = useCreateThirdParty();
  const update = useUpdateThirdParty();
  const del = useDeleteThirdParty();
  const test = useTestThirdParty();
  const reset = useResetThirdPartyStats();
  const [mode, setMode] = useState<EditMode>(null);
  // 「测试连接」共用一个 mutation 实例,上游超时时一次十几秒 —— 没有 per-row 的
  // pending 标记,界面毫无反应,管理员会连点好几行且分不清 toast 是哪条回来的。
  const [testingId, setTestingId] = useState<number | null>(null);
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const handleDelete = async (r: ThirdPartyAccount) => {
    const ok = await confirm({
      title: `删除账号「${r.name}」?`,
      description: '该账号的 API key 池会被立即移除,正在用它的请求可能失败。',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    await apiToast(del.mutateAsync(r.id), { success: '已删除', failure: '删除失败' });
  };

  const handleTest = async (r: ThirdPartyAccount) => {
    if (testingId != null) return; // 串行:一次只测一个,toast 才对得上行
    setTestingId(r.id);
    try {
      await apiToast(test.mutateAsync(r.id), {
        success: `「${r.name}」连接成功`,
        failure: `「${r.name}」连接失败`,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleReset = async (r: ThirdPartyAccount) => {
    const ok = await confirm({
      title: `重置「${r.name}」的用量统计?`,
      description: 'success / fail / latency 计数都会归零。',
    });
    if (!ok) return;
    await apiToast(reset.mutateAsync(r.id), { success: '用量已重置', failure: '重置失败' });
  };

  // 成功率 —— total_requests 是真实分母(= success + fail,含重试)。
  // 没有任何请求记录(total=0,如未被使用过、或不纳入统计的 minicod 账号)时返回 null,
  // 展示「—」而不是 0.0%(那会被误读成"全部失败")。
  const rateOf = (r: ThirdPartyAccount): number | null => {
    const total = r.total_requests ?? 0;
    if (total === 0) return null;
    return r.stats?.success_rate ?? (r.success_count ?? 0) / total;
  };

  // 这一页是判断「哪个 API key 挂了」的唯一入口,而改造前 12.3% 和 99.9% 都是同一档
  // text-faint 小灰字 —— 扫一列灰字找病灶等于没有监控。按阈值上色。
  const rateClass = (rate: number | null) =>
    rate == null ? 'text-faint' : rate < 0.8 ? 'text-brand-red font-medium' : rate < 0.95 ? 'text-brand-amber' : 'text-faint';

  const rateTitle = (r: ThirdPartyAccount) =>
    `成功 ${(r.success_count ?? 0).toLocaleString()} / 失败 ${(r.fail_count ?? 0).toLocaleString()}` +
    (r.stats?.avg_latency_ms ? ` · 平均 ${Math.round(r.stats.avg_latency_ms)}ms` : '') +
    (r.stats?.slow_rate ? ` · 慢请求 ${(r.stats.slow_rate * 100).toFixed(1)}%` : '');

  const baseUrlOf = (r: ThirdPartyAccount) =>
    typeof r.config?.base_url === 'string' ? r.config.base_url : '';

  // key 尾号 —— 后端默认把整个 api_key 换成 `********`(utils.MaskedSecretValue),
  // 遮罩态下**拿不到任何尾号**;只有开了明文模式才有真实值可截。
  const keyTailOf = (r: ThirdPartyAccount): string => {
    const k = typeof r.config?.api_key === 'string' ? r.config.api_key : '';
    if (!k || k.includes('****')) return '';
    return k.length <= 4 ? k : `····${k.slice(-4)}`;
  };

  const columns: Column<ThirdPartyAccount>[] = [
    {
      header: '账号',
      cell: (r) => {
        const base = baseUrlOf(r);
        const tail = keyTailOf(r);
        return (
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-foreground">{r.name}</span>
            {/* 同一 type 下常有主 key / 备用 / 不同中转,不标上游只能逐个点开弹窗才知道指哪 */}
            <span className="block max-w-80 truncate text-12 text-faint" title={base || undefined}>
              优先级 {r.priority}
              {base && ` · ${base}`}
              {tail && ` · key ${tail}`}
            </span>
          </div>
        );
      },
    },
    {
      header: '类型',
      width: 150,
      cell: (r) => <Badge variant="muted">{TYPE_LABEL[r.type] || r.type}</Badge>,
      sortKey: (r) => r.type,
    },
    {
      header: '状态',
      width: 80,
      cell: (r) =>
        r.status === 1 ? (
          <Badge variant="outline" className="text-brand-green border-brand-green">启用</Badge>
        ) : (
          <Badge variant="outline">停用</Badge>
        ),
      sortKey: (r) => r.status,
    },
    {
      header: '调用',
      width: 130,
      align: 'right',
      sortKey: (r) => r.total_requests ?? 0,
      cell: (r) => {
        const rate = rateOf(r);
        const avg = r.stats?.avg_latency_ms ?? 0;
        return (
          <div className="flex flex-col items-end" title={rateTitle(r)}>
            <span className="text-12 text-foreground tabular-nums">
              {(r.total_requests ?? 0) > 0 ? (r.total_requests ?? 0).toLocaleString() : '—'}
            </span>
            <span className="text-12 text-faint tabular-nums">
              成功率{' '}
              <span className={rateClass(rate)}>{rate == null ? '—' : `${(rate * 100).toFixed(1)}%`}</span>
              {avg > 0 && ` · ${Math.round(avg)}ms`}
            </span>
          </div>
        );
      },
    },
    {
      header: '最近使用',
      width: 140,
      sortKey: (r) => r.last_used_at ?? null,
      cell: (r) => <TimeCell value={r.last_used_at} className="text-12" />,
    },
    {
      header: '',
      width: 170,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={testingId === r.id ? '正在测试…' : '测试'}
            disabled={testingId != null}
            onClick={() => handleTest(r)}
          >
            {testingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7" title="重置用量" onClick={() => handleReset(r)}>
            <RotateCcw className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" title="编辑" onClick={() => setMode({ kind: 'edit', row: r })}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" title="删除" onClick={() => handleDelete(r)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-12 text-muted-foreground">
          共 {data?.length ?? 0} 个 · API key 池,按优先级和健康度轮询,5 分钟缓存 · 每 30 秒自动刷新
          {dataUpdatedAt > 0 && (
            <>
              {' · 更新于 '}
              <TimeCell value={new Date(dataUpdatedAt).toISOString()} className="text-muted-foreground" />
            </>
          )}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {/* 明文模式是全局可见状态 —— 列表此刻正以 ?show_sensitive=true 拉全部明文 key */}
          {reveal && (
            <Button
              variant="outline"
              size="sm"
              className="border-brand-red text-brand-red"
              title="列表正在以 ?show_sensitive=true 拉取,全部 API key 明文进入前端;自动刷新也会带明文。点此关闭。"
              onClick={() => setReveal(false)}
            >
              <Eye className="size-3.5" />
              明文模式 · 点此关闭
            </Button>
          )}
          <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
            <Plus className="size-3.5" />
            添加账号
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={data}
        loading={isLoading}
        error={error}
        onRetry={() => accountsQ.refetch()}
        emptyMessage="还没有三方账号"
        emptyDescription="API key 池是空的 —— 上游 AI / MiniCod 调用都会失败。点右上「添加账号」接入。"
      />

      <ThirdPartyDialog
        mode={mode}
        accounts={data}
        reveal={reveal}
        onToggleReveal={() => setReveal((v) => !v)}
        onClose={() => {
          setMode(null);
          setReveal(false); // 关弹窗即退出明文模式,别让列表长期停在 show_sensitive
        }}
        onSubmit={async (form) => {
          const ok =
            mode?.kind === 'create'
              ? await apiToast(create.mutateAsync(form), { success: '已添加', failure: '创建失败' })
              : mode?.kind === 'edit'
              ? await apiToast(update.mutateAsync({ id: mode.row.id, data: form }), { success: '已更新', failure: '更新失败' })
              : null;
          if (ok !== null) {
            setMode(null);
            setReveal(false);
          }
        }}
      />
    </div>
  );
}

/**
 * ThirdPartyDialog —— 按 type 渲染动态字段,告别 JSON textarea。
 *
 * 字段集来自 legacy frontend-user/src/admin/pages/v2/ThirdPartyAccountsV2.tsx(line 576-767):
 *   - ai_model:        api_key + base_url + model_low/mid/high + peer_review_model_1/2/3 (共 8 个)
 *   - minicod:         api_key + base_url (均必填, 无兜底域名)
 *
 * 切换 type 时保留 config 里其它字段(用户误切回去不丢数据),
 * 提交时只挑当前 type 显式声明的字段,避免脏数据写库。
 */
function ThirdPartyDialog({
  mode,
  accounts,
  reveal,
  onToggleReveal,
  onClose,
  onSubmit,
}: {
  mode: EditMode;
  /** 列表实时数据(随 reveal 切 ?show_sensitive 重拉);弹窗据此重解选中 row 的明文/脱敏值 */
  accounts: ThirdPartyAccount[] | undefined;
  reveal: boolean;
  onToggleReveal: () => void;
  onClose: () => void;
  onSubmit: (form: Omit<ThirdPartyAccount, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'last_used_at'>) => void;
}) {
  const isEdit = mode?.kind === 'edit';
  // 编辑态: 用 row.id 从实时 accounts 重解当前 row —— reveal 切换后列表重拉,
  // 这里拿到的 config 才是 ?show_sensitive 解蔽后的明文(mode.row 是打开时的旧快照)。
  const editingId = isEdit ? (mode as { kind: 'edit'; row: ThirdPartyAccount }).row.id : undefined;
  const liveRow =
    isEdit ? accounts?.find((a) => a.id === editingId) ?? (mode as { kind: 'edit'; row: ThirdPartyAccount }).row : undefined;
  const initial = liveRow;

  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<AccountType>(initial?.type ?? 'ai_model');
  const [priority, setPriority] = useState<number>(initial?.priority ?? 100);
  const [active, setActive] = useState<boolean>((initial?.status ?? 1) === 1);
  const [config, setConfig] = useState<AccountConfig>(initial?.config ?? {});

  // mode 切换时重新 hydrate 表单 —— 否则关闭再打开会留上次脏数据
  const modeKey = mode === null ? 'closed' : mode.kind === 'create' ? 'create' : `edit-${mode.row.id}`;
  useEffect(() => {
    if (!mode) return;
    if (mode.kind === 'create') {
      setName('');
      setType('ai_model');
      setPriority(100);
      setActive(true);
      setConfig({});
    } else {
      setName(mode.row.name);
      setType(mode.row.type);
      setPriority(mode.row.priority);
      setActive(mode.row.status === 1);
      setConfig(mode.row.config ?? {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeKey]);

  const fieldsByType = FIELDS_BY_TYPE[type];

  // reveal 切换后 liveRow 的 secret 值从 ******** 变明文(或反之),把这些 secret 字段
  // 重新同步进受控 config —— 依赖"各 secret 值"而非整个 liveRow 对象引用,避免列表
  // 窗口重聚焦重拉时冲掉用户正在编辑的非 secret 字段。非 secret 字段不在此处覆盖。
  const liveConfig = liveRow?.config ?? {};
  const secretSig = fieldsByType
    .filter((f) => f.secret)
    .map((f) => `${f.key}=${String(liveConfig[f.key] ?? '')}`)
    .join('|');
  useEffect(() => {
    if (!isEdit) return;
    setConfig((prev) => {
      const next = { ...prev };
      for (const f of fieldsByType) {
        if (f.secret) next[f.key] = liveConfig[f.key] ?? '';
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secretSig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 只挑当前 type 声明的 key 落到提交里 —— 其它残留字段保留在 state 但不写库
    const submitted: AccountConfig = {};
    for (const f of fieldsByType) {
      const v = config[f.key];
      if (v != null && String(v) !== '') {
        submitted[f.key] = v;
      }
    }
    onSubmit({
      name,
      type,
      config: submitted,
      status: active ? 1 : 0,
      priority,
    });
  };

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      {mode && (
      <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑账号' : '添加三方账号'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 基础字段 —— 所有 type 共用 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="给账号起个易识别的名字"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">类型</Label>
              <Select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
                className="disabled:opacity-60"
                disabled={isEdit}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">优先级(数字越小越高)</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center gap-2 h-9 sm:mt-5">
              <input
                id="active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="size-4"
              />
              <Label htmlFor="active" className="text-12">启用</Label>
            </div>
          </div>

          {/* 类型相关字段 —— 来自 FIELDS_BY_TYPE 配置表 */}
          <div className="space-y-3 border-t border-border-soft pt-3">
            <div className="text-12 text-muted-foreground">
              {type === 'ai_model' && '通用 LLM API key + base_url + 3 档模型 + 3 个审稿模型(留空走默认)'}
              {type === 'minicod' && 'MiniCod 学术接口 —— api_key + base_url 均必填(无兜底域名)'}
            </div>
            <DynamicFields
              fields={fieldsByType}
              values={config}
              onChange={(k, v) => setConfig({ ...config, [k]: v })}
              reveal={reveal}
              onToggleReveal={onToggleReveal}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">{isEdit ? '保存' : '添加'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
      )}
    </Dialog>
  );
}

interface DynamicField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  /** 1 = 两个字段拼一行,默认整行 */
  colSpan?: 1 | 2;
}

const FIELDS_BY_TYPE: Record<AccountType, DynamicField[]> = {
  minicod: [
    { key: 'api_key', label: 'API Key', secret: true, colSpan: 1 },
    { key: 'base_url', label: 'Base URL', placeholder: 'https://your-minicod-host(必填,无兜底)', colSpan: 1 },
  ],
  ai_model: [
    { key: 'base_url', label: 'Base URL', placeholder: 'https://api.openai.com/v1', colSpan: 1 },
    { key: 'api_key', label: 'API Key', secret: true, colSpan: 1 },
    { key: 'model_low', label: '低档模型', placeholder: 'gpt-3.5-turbo / claude-haiku', colSpan: 1 },
    { key: 'model_mid', label: '中档模型', placeholder: 'gpt-4 / claude-sonnet', colSpan: 1 },
    { key: 'model_high', label: '高档模型', placeholder: 'gpt-4-turbo / claude-opus', colSpan: 1 },
    { key: 'peer_review_model_1', label: '审稿模型 1', placeholder: '可选', colSpan: 1 },
    { key: 'peer_review_model_2', label: '审稿模型 2', placeholder: '可选', colSpan: 1 },
    { key: 'peer_review_model_3', label: '审稿模型 3', placeholder: '可选', colSpan: 1 },
  ],
};

function DynamicFields({
  fields,
  values,
  onChange,
  reveal,
  onToggleReveal,
}: {
  fields: DynamicField[];
  values: AccountConfig;
  onChange: (key: string, value: string) => void;
  /** secret 字段是否显示明文(受控,弹窗级别共享) */
  reveal: boolean;
  onToggleReveal: () => void;
}) {
  // 把 colSpan=1 的字段按对儿分组进 grid-cols-2 行,其余字段整行
  const rows: Array<DynamicField[]> = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.colSpan === 1 && fields[i + 1]?.colSpan === 1) {
      rows.push([f, fields[i + 1]]);
      i += 2;
    } else {
      rows.push([f]);
      i++;
    }
  }
  return (
    <div className="space-y-3">
      {rows.map((row, idx) => (
        <div key={idx} className={row.length === 2 ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : ''}>
          {row.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`cfg-${f.key}`}>{f.label}</Label>
              {f.secret ? (
                <SecretInput
                  id={`cfg-${f.key}`}
                  name={f.key}
                  value={(values[f.key] as string) ?? ''}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  autoComplete="new-password"
                  revealed={reveal}
                  onToggleReveal={onToggleReveal}
                />
              ) : (
                <Input
                  id={`cfg-${f.key}`}
                  type="text"
                  value={(values[f.key] as string) ?? ''}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
