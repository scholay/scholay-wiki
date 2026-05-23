/**
 * CodeSnippets v2 — 代码片段管理(注入到页面 head/body 的统计/广告/SDK 代码)
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Plus,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  Search,
} from 'lucide-react';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { DangerConfirmDialog } from '../../components/ui/danger-confirm-dialog';
import { ShieldAlert } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Label } from '../../components/ui/label';

interface CodeSnippet {
  id: number;
  name: string;
  code_key: string;
  position: string;
  code_content: string;
  description?: string;
  is_enabled: boolean;
  priority: number;
  pages?: string[] | null;
}

interface FormState {
  id?: number;
  name: string;
  code_key: string;
  position: string;
  code_content: string;
  description: string;
  is_enabled: boolean;
  priority: number;
  pages: string;
  editing?: boolean;
}

const POSITIONS = [
  { value: 'head', label: 'Head', desc: 'meta / CSS / 统计代码' },
  { value: 'body_start', label: 'Body 开始', desc: '需要早期加载的脚本' },
  { value: 'body_end', label: 'Body 结束', desc: '延迟加载脚本 / 广告' },
];

function emptyForm(): FormState {
  return {
    name: '',
    code_key: '',
    position: 'head',
    code_content: '',
    description: '',
    is_enabled: true,
    priority: 100,
    pages: '',
  };
}

export default function CodeSnippetsV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const position = searchParams.get('position') || 'all';

  function patch(p: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(p).forEach(([k, v]) => {
      if (!v || v === 'all') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  const listQuery = useQuery({
    queryKey: ['admin', 'codeSnippets'],
    queryFn: async () => {
      const r = await adminAPI.getCodeSnippets('');
      return (r.data?.data || []) as CodeSnippet[];
    },
  });

  const filtered = (listQuery.data ?? []).filter(
    (s) => position === 'all' || s.position === position,
  );

  const saveMutation = useMutation({
    mutationFn: async (input: FormState) => {
      const data = {
        name: input.name,
        code_key: input.code_key,
        position: input.position,
        code_content: input.code_content,
        description: input.description,
        is_enabled: input.is_enabled,
        priority: input.priority,
        pages: input.pages
          ? input.pages.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };
      if (input.editing && input.id) {
        await adminAPI.updateCodeSnippet(input.id, data);
      } else {
        await adminAPI.createCodeSnippet(data);
      }
    },
    onSuccess: (_, input) => {
      toast.success(input.editing ? '已更新' : '已创建');
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'codeSnippets'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '保存失败'),
  });

  const toggleMutation = useMutation({
    mutationFn: async (s: CodeSnippet) => {
      await adminAPI.updateCodeSnippet(s.id, { is_enabled: !s.is_enabled });
    },
    onSuccess: () => {
      toast.success('已切换');
      queryClient.invalidateQueries({ queryKey: ['admin', 'codeSnippets'] });
    },
    onError: () => toast.error('操作失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => adminAPI.deleteCodeSnippet(id),
    onSuccess: () => {
      toast.success('已删除');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'codeSnippets'] });
    },
    onError: () => toast.error('删除失败'),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CodeSnippet | null>(null);

  function submit() {
    if (!form) return;
    if (!form.name.trim()) return toast.error('请填写名称');
    if (!form.editing && !form.code_key.trim()) return toast.error('请填写 key');
    if (!form.code_content.trim()) return toast.error('请填写代码内容');
    saveMutation.mutate(form);
  }

  return (
    <PageLayout
      title="代码片段"
      description="注入到页面 head / body 的统计、广告、SDK 等第三方代码"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={() => setForm(emptyForm())}>
            <Plus className="h-4 w-4" />
            新增片段
          </Button>
        </>
      }
    >
      <SectionCard
        title="片段列表"
        description={`共 ${filtered.length} 条`}
        bodyPadded={false}
        toolbar={
          <Select value={position} onValueChange={(v) => patch({ position: v })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部位置</SelectItem>
              {POSITIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称 / Key</TableHead>
              <TableHead className="w-32">位置</TableHead>
              <TableHead className="w-20">优先级</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead>页面范围</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState
                    title="暂无代码片段"
                    description="点击右上角新增,常用于 GA / 百度统计 / Tag Manager"
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => {
                const pos = POSITIONS.find((p) => p.value === s.position);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      <code className="text-xs text-muted-foreground">{s.code_key}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{pos?.label || s.position}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {s.priority}
                    </TableCell>
                    <TableCell>
                      {s.is_enabled ? (
                        <Badge variant="success">启用</Badge>
                      ) : (
                        <Badge variant="secondary">停用</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.pages?.length ? s.pages.join(', ') : '所有页面'}
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
                                ...s,
                                description: s.description || '',
                                pages: (s.pages || []).join(', '),
                                editing: true,
                              })
                            }
                          >
                            <Pencil />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => toggleMutation.mutate(s)}>
                            <Power />
                            {s.is_enabled ? '停用' : '启用'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleteTarget(s)}
                          >
                            <Trash2 />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* 表单 */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.editing ? '编辑片段' : '新增片段'}</DialogTitle>
            <DialogDescription>注入到指定位置的第三方代码,请填来源可信的脚本</DialogDescription>
          </DialogHeader>

          {/* 显眼的安全警告 */}
          <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium">安全风险提示</p>
              <p className="text-xs">
                代码会<strong>原样输出</strong>到所有用户浏览器(可访问 cookie / localStorage / DOM)。
                只填写来自可信来源的统计/广告/SDK 代码;不要粘贴未知来源的脚本以免 XSS / 数据泄露。
              </p>
            </div>
          </div>

          {form && (
            <div className="grid max-h-[55vh] gap-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>名称</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Key {form.editing && <span className="text-xs text-muted-foreground">(创建后不可改)</span>}</Label>
                  <Input
                    value={form.code_key}
                    onChange={(e) => setForm({ ...form, code_key: e.target.value })}
                    placeholder="ga4 / baidu_stat"
                    disabled={!!form.editing}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>位置</Label>
                  <Select
                    value={form.position}
                    onValueChange={(v) => setForm({ ...form, position: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label} — {p.desc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>优先级 (越小越靠前)</Label>
                  <Input
                    type="number"
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>页面范围 (逗号分隔的路径,留空 = 所有页面)</Label>
                <Input
                  value={form.pages}
                  onChange={(e) => setForm({ ...form, pages: e.target.value })}
                  placeholder="/ , /search-results , /pricing"
                />
              </div>
              <div className="space-y-1.5">
                <Label>描述</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>代码内容</Label>
                <textarea
                  className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.code_content}
                  onChange={(e) => setForm({ ...form, code_content: e.target.value })}
                  placeholder="<script>...</script>"
                />
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
                />
                启用
              </label>
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除该片段?"
        description={`将删除 "${deleteTarget?.name}"。如果该代码用于统计,删除后将不再追踪。`}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </PageLayout>
  );
}
