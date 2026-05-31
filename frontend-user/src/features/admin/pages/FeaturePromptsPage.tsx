import { useMemo, useState } from 'react';
import { History, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
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
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useCreatePrompt,
  useDeletePrompt,
  useFeaturePromptHistory,
  useFeaturePrompts,
  useRevertPrompt,
  useTogglePrompt,
  useUpdatePrompt,
  type FeaturePrompt,
  type FeaturePromptHistory,
} from '../api/feature-prompts';

/**
 * FeaturePromptsPage — 通用 AI feature system_prompt 注册表管理。
 *
 * 后端: internal/promptregistry/handler.go (7 个端点)。
 * 数据: feature_prompts 表统一管理 smart_search / claw / peerreview 等 feature 的
 *      system prompt; 改完不重启即可生效 (admin write 路径 invalidate cache)。
 *
 * 主要交互:
 *   - 顶部 feature_key 切换 (smart_search / claw / peerreview / 全部)
 *   - 列表展示 (含 persona / version / source / enabled)
 *   - 行操作: toggle / 编辑 / 历史 / 删除
 *   - 编辑弹窗: 改 name / description / subjects / weight / enabled / system_prompt + change_note
 *   - 历史弹窗: 版本时间线, 任一版本可一键 revert
 *   - 新建按钮: 给 admin 加 prompt 变体用 (主要是 peerreview 加新 reviewer skill)
 */

const FEATURE_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: '全部' },
  { value: 'smart_search', label: '智能搜索' },
  { value: 'claw', label: '智能助手' },
  { value: 'peerreview', label: '智能审稿' },
];

export function FeaturePromptsPage() {
  const [featureKey, setFeatureKey] = useState<string>('');
  const { data, isLoading } = useFeaturePrompts(featureKey || undefined);
  const toggleMut = useTogglePrompt();
  const deleteMut = useDeletePrompt();
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const [editing, setEditing] = useState<FeaturePrompt | null>(null);
  const [showingHistory, setShowingHistory] = useState<FeaturePrompt | null>(null);
  const [creating, setCreating] = useState(false);

  const handleToggle = async (row: FeaturePrompt) => {
    await apiToast(
      toggleMut.mutateAsync({ id: row.id, enabled: !row.enabled }),
      { success: row.enabled ? '已停用' : '已启用', failure: '切换失败' },
    );
  };

  const handleDelete = async (row: FeaturePrompt) => {
    const ok = await confirm({
      title: `确定删除 prompt「${row.name}」?`,
      description: '删除后会一并清除版本历史; seed 行下次启动会被 migration 重建。',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    await apiToast(deleteMut.mutateAsync(row.id), { success: '已删除', failure: '删除失败' });
  };

  const items = data?.items ?? [];

  const columns: Column<FeaturePrompt>[] = [
    {
      header: '名称',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-foreground">{r.name}</span>
          <span className="text-2xs text-faint font-mono">{r.slug}</span>
        </div>
      ),
      sortKey: (r) => r.name,
    },
    {
      header: 'Feature',
      width: 120,
      cell: (r) => <Badge variant="muted">{r.feature_key}</Badge>,
      sortKey: (r) => r.feature_key,
    },
    {
      header: 'Persona',
      width: 90,
      cell: (r) => <span className="text-xs text-muted-foreground font-mono">{r.persona}</span>,
      sortKey: (r) => r.persona,
    },
    {
      header: '学科',
      cell: (r) =>
        r.applicable_subjects.length === 0 ? (
          <span className="text-xs text-faint">— 通用 —</span>
        ) : (
          <div className="flex flex-wrap gap-1 max-w-[280px]">
            {r.applicable_subjects.slice(0, 3).map((s) => (
              <Badge key={s} variant="outline" className="text-2xs">{s}</Badge>
            ))}
            {r.applicable_subjects.length > 3 && (
              <span className="text-2xs text-faint">+{r.applicable_subjects.length - 3}</span>
            )}
          </div>
        ),
    },
    {
      header: '权重',
      width: 70,
      align: 'right',
      cell: (r) => <span className="text-xs text-muted-foreground tabular-nums">{r.weight.toFixed(2)}</span>,
      sortKey: (r) => r.weight,
    },
    {
      header: '版本',
      width: 70,
      align: 'right',
      cell: (r) => (
        <span className="text-xs tabular-nums">
          v{r.version}
          {r.source === 'admin' && <span className="ml-1 text-2xs text-brand-amber">·改</span>}
        </span>
      ),
      sortKey: (r) => r.version,
    },
    {
      header: '状态',
      width: 90,
      cell: (r) => (
        <Switch
          checked={r.enabled}
          onCheckedChange={() => handleToggle(r)}
          aria-label={r.enabled ? '停用' : '启用'}
        />
      ),
    },
    {
      header: '',
      width: 130,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="size-7" title="历史" onClick={() => setShowingHistory(r)}>
            <History className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" title="编辑" onClick={() => setEditing(r)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-brand-red" title="删除" onClick={() => handleDelete(r)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="AI Prompt 注册表"
      description={`共 ${items.length} 条 · 统一管理 smart_search / claw / peerreview 的 system_prompt, 改完不重启`}
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-3.5" />
          新建变体
        </Button>
      }
      tabs={
        <div className="flex items-center gap-1">
          {FEATURE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFeatureKey(tab.value)}
              className={`h-7 px-3 rounded-pill text-xs font-bold transition-colors ${
                featureKey === tab.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
    >
      <DataTable columns={columns} rows={items} loading={isLoading} emptyMessage="没有 prompt" />

      <EditDialog row={editing} onClose={() => setEditing(null)} />

      <HistoryDialog row={showingHistory} onClose={() => setShowingHistory(null)} />

      <CreateDialog open={creating} onClose={() => setCreating(false)} />
    </AdminPageLayout>
  );
}

// ─── 编辑 dialog ─────────────────────────────────────────────────────────

function EditDialog({ row, onClose }: { row: FeaturePrompt | null; onClose: () => void }) {
  const update = useUpdatePrompt();
  const apiToast = useApiToast();

  if (!row) return null;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>编辑 prompt · {row.name}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-2xs">{row.feature_key} / {row.persona} / {row.slug}</span>
            <span className="ml-2 text-faint">v{row.version} · {row.source === 'admin' ? 'admin 改过' : '源码种子'}</span>
          </DialogDescription>
        </DialogHeader>
        <PromptForm
          initial={row}
          submitting={update.isPending}
          onSubmit={async (payload) => {
            const ok = await apiToast(
              update.mutateAsync({ id: row.id, payload }),
              { success: '已保存, 缓存已刷', failure: '保存失败' },
            );
            if (ok !== null) onClose();
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── 新建 dialog ─────────────────────────────────────────────────────────

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreatePrompt();
  const apiToast = useApiToast();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>新建 prompt 变体</DialogTitle>
          <DialogDescription>
            常见用法: 给 peerreview 加一个新学科的 reviewer skill (feature_key=peerreview, persona=alpha/beta/gamma)。
          </DialogDescription>
        </DialogHeader>
        <PromptForm
          mode="create"
          submitting={create.isPending}
          onSubmit={async (payload, extras) => {
            const ok = await apiToast(
              create.mutateAsync({
                feature_key: extras?.feature_key ?? 'peerreview',
                slug: extras?.slug ?? '',
                persona: extras?.persona ?? 'default',
                name: payload.name,
                description: payload.description ?? null,
                applicable_subjects: payload.applicable_subjects,
                weight: payload.weight,
                enabled: payload.enabled,
                system_prompt: payload.system_prompt,
              }),
              { success: '已创建', failure: '创建失败 (slug 可能已存在)' },
            );
            if (ok !== null) onClose();
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── PromptForm 共用 ────────────────────────────────────────────────────

interface PromptFormPayload {
  name: string;
  description: string | null;
  applicable_subjects: string[];
  weight: number;
  enabled: boolean;
  system_prompt: string;
  change_note?: string | null;
}

interface PromptFormExtras {
  feature_key?: string;
  slug?: string;
  persona?: string;
}

function PromptForm({
  initial,
  mode = 'edit',
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: FeaturePrompt;
  mode?: 'edit' | 'create';
  submitting: boolean;
  onSubmit: (payload: PromptFormPayload, extras?: PromptFormExtras) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [subjectsRaw, setSubjectsRaw] = useState(initial?.applicable_subjects.join(', ') ?? '');
  const [weight, setWeight] = useState(initial?.weight ?? 1.0);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '');
  const [changeNote, setChangeNote] = useState('');

  // create-only 字段
  const [featureKey, setFeatureKey] = useState('peerreview');
  const [slug, setSlug] = useState('');
  const [persona, setPersona] = useState('alpha');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('请填写名称');
    if (!systemPrompt.trim()) return toast.error('请填写 system_prompt');
    if (mode === 'create' && !slug.trim()) return toast.error('请填写 slug');

    const subjects = subjectsRaw
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    onSubmit(
      {
        name: name.trim(),
        description: description.trim() || null,
        applicable_subjects: subjects,
        weight,
        enabled,
        system_prompt: systemPrompt,
        change_note: changeNote.trim() || null,
      },
      mode === 'create' ? { feature_key: featureKey, slug: slug.trim(), persona } : undefined,
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'create' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="feature_key">Feature</Label>
            <select
              id="feature_key"
              value={featureKey}
              onChange={(e) => setFeatureKey(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="smart_search">smart_search</option>
              <option value="claw">claw</option>
              <option value="peerreview">peerreview</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="persona">Persona</Label>
            <select
              id="persona"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="default">default</option>
              <option value="alpha">alpha</option>
              <option value="beta">beta</option>
              <option value="gamma">gamma</option>
              <option value="chief">chief</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="alpha-methodology-newfield"
              className="font-mono text-xs"
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">名称</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">描述 (可选)</Label>
        <Input
          id="description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="subjects">学科白名单 (逗号分隔)</Label>
          <Input
            id="subjects"
            value={subjectsRaw}
            onChange={(e) => setSubjectsRaw(e.target.value)}
            placeholder="biomedicine, clinical-medicine, ..."
          />
          <p className="text-2xs text-faint">留空 = 通用 fallback (peerreview picker 命中条件)</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weight">权重</Label>
          <Input
            id="weight"
            type="number"
            step="0.1"
            min="0.01"
            value={weight}
            onChange={(e) => setWeight(parseFloat(e.target.value) || 1.0)}
          />
          <p className="text-2xs text-faint">加权随机 picker 用; 默认 1.0</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="system_prompt">System Prompt</Label>
        <textarea
          id="system_prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={18}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-2xs text-faint">
          {systemPrompt.length.toLocaleString()} 字符 · 改完会自动 +version 并落 history 一条
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="enabled" className="font-normal cursor-pointer">
            启用 (picker 候选池要 enabled=true 才会被选中)
          </Label>
        </div>
      </div>

      {mode === 'edit' && (
        <div className="space-y-1.5">
          <Label htmlFor="change_note">改动备注 (落 history, 给后续审计看)</Label>
          <Input
            id="change_note"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="为什么改, 给未来的自己 / 同事看"
          />
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? '保存中…' : mode === 'create' ? '创建' : '保存改动'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── 历史 dialog ────────────────────────────────────────────────────────

function HistoryDialog({ row, onClose }: { row: FeaturePrompt | null; onClose: () => void }) {
  const { data, isLoading } = useFeaturePromptHistory(row?.id ?? null);
  const revert = useRevertPrompt();
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<FeaturePromptHistory | null>(null);

  const handleRevert = async (h: FeaturePromptHistory) => {
    const ok = await confirm({
      title: `回滚到 v${h.version}?`,
      description: '会用该历史版本的内容写入当前 prompt, 产生新的 version 并落一条 history (note=reverted from vN)。',
      confirmText: '确认回滚',
    });
    if (!ok) return;
    if (!row) return;
    const result = await apiToast(
      revert.mutateAsync({ id: row.id, version: h.version }),
      { success: `已回滚到 v${h.version}`, failure: '回滚失败' },
    );
    if (result !== null) {
      setSelected(null);
      onClose();
    }
  };

  const items = useMemo(() => data ?? [], [data]);

  if (!row) return null;

  return (
    <Dialog
      open={!!row}
      onOpenChange={(o) => {
        if (!o) {
          setSelected(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>版本历史 · {row.name}</DialogTitle>
          <DialogDescription>
            当前 v{row.version} · 共 {items.length} 个历史快照 · 任一可回滚
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            还没有历史快照 (这条 prompt 没被编辑过)
          </div>
        ) : (
          <div className="grid grid-cols-[260px_1fr] gap-4 h-[480px]">
            {/* 左侧版本列表 */}
            <div className="border border-border rounded-md overflow-y-auto">
              {items.map((h) => {
                const isActive = selected?.id === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelected(h)}
                    className={`w-full text-left p-3 border-b border-border-soft last:border-0 transition-colors ${
                      isActive ? 'bg-surface-2' : 'hover:bg-surface-1'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">v{h.version}</span>
                      <span className="text-2xs text-faint">{formatTime(h.created_at)}</span>
                    </div>
                    {h.change_note ? (
                      <p className="text-2xs text-muted-foreground mt-1 line-clamp-2">{h.change_note}</p>
                    ) : (
                      <p className="text-2xs text-faint mt-1">(无备注)</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-2xs h-4 px-1.5">
                        {h.enabled ? '启用' : '停用'}
                      </Badge>
                      <span className="text-2xs text-faint">{h.system_prompt.length} 字</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 右侧详情 */}
            <div className="border border-border rounded-md overflow-hidden flex flex-col">
              {selected ? (
                <>
                  <div className="flex items-center justify-between px-3 h-10 border-b border-border bg-surface-1">
                    <span className="text-xs font-bold">
                      v{selected.version} 的快照 · {selected.name}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRevert(selected)}
                      disabled={revert.isPending}
                    >
                      <RotateCcw className="size-3" />
                      回滚到此版本
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <pre className="text-2xs font-mono leading-relaxed whitespace-pre-wrap">
                      {selected.system_prompt}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  从左侧选一个版本看快照
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
