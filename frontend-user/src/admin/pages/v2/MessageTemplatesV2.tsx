/**
 * MessageTemplates v2 — 消息模板管理(为站内信提供复用模板)
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, RefreshCw, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  TemplateVariablePanel,
  MESSAGE_VARS,
} from '../../components/v2/TemplateVariablePanel';

interface Template {
  id: number;
  name: string;
  template_key?: string;
  title_template?: string;
  content_template?: string;
  category?: string;
}

interface FormState {
  id?: number;
  name: string;
  template_key: string;
  title_template: string;
  content_template: string;
  category: string;
  editing?: boolean;
}

function emptyForm(): FormState {
  return {
    name: '',
    template_key: '',
    title_template: '',
    content_template: '',
    category: 'system',
  };
}

export default function MessageTemplatesV2() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['admin', 'msgTemplates'],
    queryFn: async () => {
      const r = await adminAPI.getMessageTemplates({});
      return ((r.data?.data?.list || r.data?.data || []) as Template[]);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: FormState) => {
      const data = {
        name: input.name,
        template_key: input.template_key,
        title_template: input.title_template,
        content_template: input.content_template,
        category: input.category,
      };
      if (input.editing && input.id) {
        await adminAPI.updateMessageTemplate(input.id, data);
      } else {
        await adminAPI.createMessageTemplate(data);
      }
    },
    onSuccess: (_, input) => {
      toast.success(input.editing ? '已更新' : '已创建');
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'msgTemplates'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '保存失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => adminAPI.deleteMessageTemplate(id),
    onSuccess: () => {
      toast.success('已删除');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'msgTemplates'] });
    },
    onError: () => toast.error('删除失败'),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  function submit() {
    if (!form) return;
    if (!form.name.trim()) return toast.error('请填写名称');
    if (!form.editing && !form.template_key.trim()) return toast.error('请填写 key');
    if (!form.title_template.trim()) return toast.error('请填写标题模板');
    if (!form.content_template.trim()) return toast.error('请填写内容模板');
    saveMutation.mutate(form);
  }

  const items = listQuery.data ?? [];

  return (
    <PageLayout
      title="消息模板"
      description="复用的消息模板,支持 ${var} 占位符,代码侧通过 key 引用"
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
      <SectionCard title="模板列表" description={`共 ${items.length} 条`} bodyPadded={false}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称 / Key</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>标题模板</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`s-${i}`}><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={4}><EmptyState title="暂无模板" /></TableCell></TableRow>
            ) : (
              items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <code className="text-xs text-muted-foreground">{t.template_key}</code>
                  </TableCell>
                  <TableCell><Badge variant="outline">{t.category || '—'}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground line-clamp-1 max-w-md">
                    {t.title_template || '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>操作</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => setForm({ ...t, name: t.name, template_key: t.template_key || '', title_template: t.title_template || '', content_template: t.content_template || '', category: t.category || 'system', editing: true })}>
                          <Pencil />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(t)}>
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

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{form?.editing ? '编辑模板' : '新增模板'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid max-h-[65vh] gap-6 overflow-y-auto pr-1 lg:grid-cols-[1fr_360px]">
              {/* 左:表单 */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>名称</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Key {form.editing && <span className="text-xs text-muted-foreground">(创建后不可改)</span>}
                    </Label>
                    <Input
                      value={form.template_key}
                      onChange={(e) => setForm({ ...form, template_key: e.target.value })}
                      disabled={!!form.editing}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>分类</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">system - 系统通知</SelectItem>
                      <SelectItem value="promotion">promotion - 营销推广</SelectItem>
                      <SelectItem value="transaction">transaction - 交易通知</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>标题模板</Label>
                  <Input
                    value={form.title_template}
                    onChange={(e) => setForm({ ...form, title_template: e.target.value })}
                    placeholder={'欢迎 ${user_name}'}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>内容模板 (支持 Markdown)</Label>
                  <textarea
                    className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                    value={form.content_template}
                    onChange={(e) => setForm({ ...form, content_template: e.target.value })}
                    placeholder={'你好 ${user_name},\n\n你的订阅 ${plan_name} 将于 ${date} 续费,金额 ¥${amount}'}
                  />
                </div>
              </div>

              {/* 右:变量字典 + 实时预览 */}
              <TemplateVariablePanel
                vars={MESSAGE_VARS}
                templates={[
                  { label: '标题', value: form.title_template },
                  { label: '正文', value: form.content_template },
                ]}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>取消</Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>{saveMutation.isPending ? '保存中…' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除该模板?"
        description={`将删除 "${deleteTarget?.name}"。引用此模板的代码将报错。`}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </PageLayout>
  );
}
