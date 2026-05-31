import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Zap, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
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

export function ThirdPartyPage() {
  const { data, isLoading } = useThirdPartyAccounts();
  const create = useCreateThirdParty();
  const update = useUpdateThirdParty();
  const del = useDeleteThirdParty();
  const test = useTestThirdParty();
  const reset = useResetThirdPartyStats();
  const [mode, setMode] = useState<EditMode>(null);
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
    await apiToast(test.mutateAsync(r.id), {
      success: `「${r.name}」连接成功`,
      failure: `「${r.name}」连接失败`,
    });
  };

  const handleReset = async (r: ThirdPartyAccount) => {
    const ok = await confirm({
      title: `重置「${r.name}」的用量统计?`,
      description: 'success / fail / latency 计数都会归零。',
    });
    if (!ok) return;
    await apiToast(reset.mutateAsync(r.id), { success: '用量已重置', failure: '重置失败' });
  };

  // 成功率展示 —— 优先用后端预计算 stats.success_rate,fallback 到 success_count / total_requests
  const successRate = (r: ThirdPartyAccount): string => {
    if (r.stats?.success_rate != null) {
      return `${(r.stats.success_rate * 100).toFixed(1)}%`;
    }
    const total = r.total_requests ?? 0;
    if (total === 0) return '—';
    return `${(((r.success_count ?? 0) / total) * 100).toFixed(1)}%`;
  };

  const columns: Column<ThirdPartyAccount>[] = [
    {
      header: '账号',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-foreground">{r.name}</span>
          <span className="text-2xs text-faint">优先级 {r.priority}</span>
        </div>
      ),
    },
    {
      header: '类型',
      width: 150,
      cell: (r) => <Badge variant="muted">{TYPE_LABEL[r.type] || r.type}</Badge>,
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
    },
    {
      header: '调用',
      width: 110,
      align: 'right',
      cell: (r) => (
        <div className="flex flex-col items-end">
          <span className="text-xs text-foreground">{(r.usage_count ?? 0).toLocaleString()}</span>
          <span className="text-2xs text-faint">成功率 {successRate(r)}</span>
        </div>
      ),
    },
    {
      header: '最近使用',
      width: 140,
      cell: (r) => (
        <span className="text-2xs text-faint">
          {r.last_used_at?.slice(0, 16).replace('T', ' ') || '—'}
        </span>
      ),
    },
    {
      header: '',
      width: 170,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="size-7" title="测试" onClick={() => handleTest(r)}>
            <Zap className="size-3.5" />
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
    <AdminPageLayout
      title="三方账号"
      description={`共 ${data?.length ?? 0} 个 · API key 池,按优先级和健康度轮询,5 分钟缓存`}
      actions={
        <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
          <Plus className="size-3.5" />
          添加账号
        </Button>
      }
    >
      <DataTable columns={columns} rows={data} loading={isLoading} />

      <ThirdPartyDialog
        mode={mode}
        onClose={() => setMode(null)}
        onSubmit={async (form) => {
          const ok =
            mode?.kind === 'create'
              ? await apiToast(create.mutateAsync(form), { success: '已添加', failure: '创建失败' })
              : mode?.kind === 'edit'
              ? await apiToast(update.mutateAsync({ id: mode.row.id, data: form }), { success: '已更新', failure: '更新失败' })
              : null;
          if (ok !== null) setMode(null);
        }}
      />
    </AdminPageLayout>
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
  onClose,
  onSubmit,
}: {
  mode: EditMode;
  onClose: () => void;
  onSubmit: (form: Omit<ThirdPartyAccount, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'last_used_at'>) => void;
}) {
  const isEdit = mode?.kind === 'edit';
  const initial = isEdit ? (mode as { kind: 'edit'; row: ThirdPartyAccount }).row : undefined;

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

  if (!mode) return null;

  const fieldsByType = FIELDS_BY_TYPE[type];

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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑账号' : '添加三方账号'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 基础字段 —— 所有 type 共用 */}
          <div className="grid grid-cols-2 gap-3">
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
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                disabled={isEdit}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
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
            <div className="flex items-center gap-2 h-9 mt-5">
              <input
                id="active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="size-4"
              />
              <Label htmlFor="active" className="text-sm">启用</Label>
            </div>
          </div>

          {/* 类型相关字段 —— 来自 FIELDS_BY_TYPE 配置表 */}
          <div className="space-y-3 border-t border-border-soft pt-3">
            <div className="text-xs text-muted-foreground">
              {type === 'ai_model' && '通用 LLM API key + base_url + 3 档模型 + 3 个审稿模型(留空走默认)'}
              {type === 'minicod' && 'MiniCod 学术接口 —— api_key + base_url 均必填(无兜底域名)'}
            </div>
            <DynamicFields
              fields={fieldsByType}
              values={config}
              onChange={(k, v) => setConfig({ ...config, [k]: v })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">{isEdit ? '保存' : '添加'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
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
}: {
  fields: DynamicField[];
  values: AccountConfig;
  onChange: (key: string, value: string) => void;
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
        <div key={idx} className={row.length === 2 ? 'grid grid-cols-2 gap-3' : ''}>
          {row.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`cfg-${f.key}`}>{f.label}</Label>
              <Input
                id={`cfg-${f.key}`}
                type={f.secret ? 'password' : 'text'}
                value={(values[f.key] as string) ?? ''}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                autoComplete={f.secret ? 'new-password' : undefined}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
