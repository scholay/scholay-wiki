/**
 * PromptTemplates v2 — AI 提示词模板管理
 *
 * 功能:
 *   - 列表 / 创建 / 编辑 / 删除 / 启停
 *   - 模板内容用 textarea(支持 ${var} 占位符)
 *   - key 唯一约束,创建后不可改
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  Search,
  History,
  RotateCcw,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { DangerConfirmDialog } from '../../components/ui/danger-confirm-dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Label } from '../../components/ui/label';
import {
  TemplateVariablePanel,
  PROMPT_VARS,
} from '../../components/v2/TemplateVariablePanel';

interface PromptTemplate {
  id: number;
  name: string;
  key: string;
  template: string;
  description?: string;
  is_active: boolean | number;
  created_at?: string;
  updated_at?: string;
}

interface FormState {
  id?: number;
  name: string;
  key: string;
  template: string;
  description: string;
  is_active: boolean;
  editing?: boolean;
}

function emptyForm(): FormState {
  return {
    name: '',
    key: '',
    template: '',
    description: '',
    is_active: true,
  };
}

export default function PromptTemplatesV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const keyword = searchParams.get('q') || '';
  const [keywordInput, setKeywordInput] = useState(keyword);

  function patch(p: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(p).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  const listQuery = useQuery({
    queryKey: ['admin', 'promptTemplates'],
    queryFn: async () => {
      const r = await adminAPI.getPromptTemplates();
      return (r.data?.data?.templates || []) as PromptTemplate[];
    },
  });

  const filtered = (listQuery.data ?? []).filter((t) => {
    if (!keyword) return true;
    const k = keyword.toLowerCase();
    return (
      t.name.toLowerCase().includes(k) ||
      t.key.toLowerCase().includes(k) ||
      (t.description || '').toLowerCase().includes(k)
    );
  });

  const saveMutation = useMutation({
    mutationFn: async (input: FormState) => {
      if (input.editing && input.id) {
        await adminAPI.updatePromptTemplate(input.id, {
          name: input.name,
          template: input.template,
          description: input.description,
          is_active: input.is_active,
        });
      } else {
        await adminAPI.createPromptTemplate({
          name: input.name,
          key: input.key,
          template: input.template,
          description: input.description,
          is_active: input.is_active,
        });
      }
    },
    onSuccess: (_, input) => {
      toast.success(input.editing ? '已更新' : '已创建');
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'promptTemplates'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '保存失败'),
  });

  const toggleMutation = useMutation({
    mutationFn: async (t: PromptTemplate) => {
      await adminAPI.updatePromptTemplate(t.id, { is_active: !t.is_active });
    },
    onSuccess: () => {
      toast.success('已切换状态');
      queryClient.invalidateQueries({ queryKey: ['admin', 'promptTemplates'] });
    },
    onError: () => toast.error('操作失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => adminAPI.deletePromptTemplate(id),
    onSuccess: () => {
      toast.success('已删除');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'promptTemplates'] });
    },
    onError: () => toast.error('删除失败'),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);
  const [versionsTarget, setVersionsTarget] = useState<PromptTemplate | null>(null);

  function submit() {
    if (!form) return;
    if (!form.name.trim()) return toast.error('请填写名称');
    if (!form.editing && !form.key.trim()) return toast.error('请填写 key');
    if (!form.template.trim()) return toast.error('请填写模板内容');
    saveMutation.mutate(form);
  }

  return (
    <PageLayout
      title="Prompt 模板"
      description="管理 AI 调用使用的提示词模板,支持 ${变量} 占位符"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={() => setForm(emptyForm())}>
            <Plus className="h-4 w-4" />
            新增模板
          </Button>
        </>
      }
    >
      <SectionCard
        title="模板列表"
        description={`共 ${filtered.length} 条`}
        bodyPadded={false}
        toolbar={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索 名称 / key"
              className="w-64 pl-8"
              value={keywordInput}
              onChange={(e) => {
                setKeywordInput(e.target.value);
                patch({ q: e.target.value || undefined });
              }}
            />
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称 / Key</TableHead>
              <TableHead>描述</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-44">最后更新</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    title="暂无模板"
                    description={keyword ? '调整搜索条件' : '点击右上角"新增模板"开始'}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <code className="text-xs text-muted-foreground">{t.key}</code>
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground line-clamp-2">
                    {t.description || '—'}
                  </TableCell>
                  <TableCell>
                    {t.is_active ? (
                      <Badge variant="success">启用</Badge>
                    ) : (
                      <Badge variant="secondary">停用</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(t.updated_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>操作</DropdownMenuLabel>
                        <DropdownMenuItem
                          onSelect={() =>
                            setForm({
                              ...t,
                              description: t.description || '',
                              is_active: !!t.is_active,
                              editing: true,
                            })
                          }
                        >
                          <Pencil />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleMutation.mutate(t)}>
                          <Power />
                          {t.is_active ? '停用' : '启用'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setVersionsTarget(t)}>
                          <History />
                          历史版本
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(t)}
                        >
                          <Trash2 />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* 表单 */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{form?.editing ? '编辑模板' : '新增模板'}</DialogTitle>
            <DialogDescription>
              模板内容支持 ${'${var}'} 占位符,运行时会被替换。右侧可调整变量值实时预览。
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid max-h-[65vh] gap-6 overflow-y-auto pr-1 lg:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>名称</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="给模板起个易识别的名字"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Key {form.editing && <span className="text-xs text-muted-foreground">(创建后不可改)</span>}
                    </Label>
                    <Input
                      value={form.key}
                      onChange={(e) => setForm({ ...form, key: e.target.value })}
                      placeholder="paper_summary_v2"
                      disabled={!!form.editing}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>描述</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="说明用途(代码侧通过 key 引用)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>模板内容</Label>
                  <textarea
                    className="flex min-h-[260px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={form.template}
                    onChange={(e) => setForm({ ...form, template: e.target.value })}
                    placeholder={'例: 你是一个学术论文助手,请总结以下论文:\n\n${paper_text}'}
                  />
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  启用
                </label>
              </div>

              {/* 右侧:变量字典 + 渲染预览 */}
              <TemplateVariablePanel
                vars={PROMPT_VARS}
                templates={[{ label: '渲染后', value: form.template }]}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DangerConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除 Prompt 模板"
        description={
          <>
            将删除模板 <strong>"{deleteTarget?.name}"</strong>(key:{' '}
            <code>{deleteTarget?.key}</code>)。
            <br />
            <strong className="text-destructive">所有引用此 key 的 AI 调用会失败,</strong>
            请先在代码侧确认无引用。
          </>
        }
        confirmWord={deleteTarget?.key || 'DELETE'}
        confirmWordLabel={deleteTarget?.key}
        confirmText="确认删除"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      {/* 历史版本 Drawer */}
      <PromptVersionsSheet
        target={versionsTarget}
        onClose={() => setVersionsTarget(null)}
        onRestore={(template, name, description, isActive) => {
          setVersionsTarget(null);
          // 用历史版本预填编辑表单,管理员手动确认保存
          if (versionsTarget) {
            setForm({
              id: versionsTarget.id,
              name,
              key: versionsTarget.key,
              template,
              description,
              is_active: !!isActive,
              editing: true,
            });
            toast.info('已用历史版本预填,确认后点击保存即可生效');
          }
        }}
      />
    </PageLayout>
  );
}

interface Version {
  id: number;
  template_id: number;
  template_key: string;
  name: string;
  template: string;
  description?: string;
  is_active: number;
  change_note?: string;
  snapshot_by_name?: string;
  created_at: string;
}

function PromptVersionsSheet({
  target,
  onClose,
  onRestore,
}: {
  target: PromptTemplate | null;
  onClose: () => void;
  onRestore: (template: string, name: string, description: string, isActive: boolean) => void;
}) {
  const open = target != null;
  const [selected, setSelected] = useState<Version | null>(null);

  const versionsQuery = useQuery({
    queryKey: ['admin', 'promptTemplates', 'versions', target?.id],
    enabled: open,
    queryFn: async () => {
      const r = await adminAPI.getPromptTemplateVersions(target!.id);
      return ((r.data?.data?.items || []) as Version[]);
    },
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            历史版本 — {target?.name}
          </SheetTitle>
          <SheetDescription>
            每次保存模板会自动快照旧版本。点击右侧"还原"会把内容预填到编辑表单,你确认后再保存生效。
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {versionsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">加载中…</p>
          )}
          {!versionsQuery.isLoading && (versionsQuery.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">暂无历史版本(本模板还没被修改过)</p>
          )}
          {versionsQuery.data?.map((v) => (
            <div key={v.id} className="rounded-md border">
              <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2 text-xs">
                <span className="font-medium">{fmtDate(v.created_at)}</span>
                <span className="text-muted-foreground">
                  {v.snapshot_by_name || '系统'} {v.change_note && `· ${v.change_note}`}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onRestore(v.template, v.name, v.description || '', !!v.is_active)
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  还原
                </Button>
              </div>
              <pre className={`max-h-40 overflow-auto p-3 font-mono text-xs ${selected?.id === v.id ? '' : 'line-clamp-6'}`}>
                {v.template}
              </pre>
              <button
                className="w-full border-t px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
                onClick={() => setSelected(selected?.id === v.id ? null : v)}
              >
                {selected?.id === v.id ? '收起' : '展开全文'}
              </button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function fmtDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false });
}
