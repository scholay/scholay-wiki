/**
 * UserTagManagement v2 — 用户标签字典 + 用户数统计
 *
 * 功能:
 *   - 标签 CRUD (名称 / 颜色 / 说明)
 *   - 显示每个标签下的用户数
 *   - 颜色对齐 Badge variant: default/success/warning/destructive/info/secondary/outline
 *
 * 批量打/取消标签的入口在 UserManagementV2 (复选 + 批量栏)。
 */

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, RefreshCw, Pencil, Trash2, Tag as TagIcon } from 'lucide-react';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';

interface Tag {
  id: number;
  name: string;
  color: string;
  description: string;
  user_count: number;
  created_at: string;
}

const COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: 'default', label: 'Default (灰)' },
  { value: 'success', label: 'Success (绿)' },
  { value: 'warning', label: 'Warning (黄)' },
  { value: 'destructive', label: 'Destructive (红)' },
  { value: 'info', label: 'Info (蓝)' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'outline', label: 'Outline' },
];

export default function UserTagManagementV2() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Tag> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Tag | null>(null);

  const tagsQuery = useQuery({
    queryKey: ['admin', 'user-tags'],
    queryFn: async () => {
      const r = await adminAPI.listUserTags();
      const data = r.data?.data;
      return (Array.isArray(data) ? data : data?.items || []) as Tag[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (form: Partial<Tag>) => {
      const payload = {
        name: form.name!,
        color: form.color || 'default',
        description: form.description || '',
      };
      if (form.id) return adminAPI.updateUserTag(form.id, payload);
      return adminAPI.createUserTag(payload);
    },
    onSuccess: () => {
      toast.success(editing?.id ? '已更新' : '已创建');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin', 'user-tags'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '保存失败,可能是名称重复');
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => adminAPI.deleteUserTag(id),
    onSuccess: () => {
      toast.success('已删除');
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['admin', 'user-tags'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '删除失败');
    },
  });

  const tags = tagsQuery.data || [];

  return (
    <PageLayout
      title="用户标签"
      description="给用户打标签便于精准运营,如 VIP / 高价值 / 待激活 / 即将流失"
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'user-tags'] })}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={() => setEditing({ color: 'default' })}>
            <Plus className="mr-1.5 h-4 w-4" />
            新增标签
          </Button>
        </div>
      }
    >
      <SectionCard
        title="标签字典"
        description={`共 ${tags.length} 个标签,在用户管理页可批量打/取消`}
      >
        {tagsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <EmptyState
            icon={<TagIcon className="h-8 w-8" />}
            title="还没有标签"
            description="创建标签后,可以在用户管理页批量打标签,精准做运营"
            action={
              <Button onClick={() => setEditing({ color: 'default' })}>
                <Plus className="mr-1.5 h-4 w-4" />
                创建第一个标签
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标签</TableHead>
                <TableHead>说明</TableHead>
                <TableHead className="text-right">用户数</TableHead>
                <TableHead className="w-32 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Badge variant={t.color as any}>{t.name}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.description || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.user_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(t)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {/* 创建/编辑 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? '编辑标签' : '新增标签'}</DialogTitle>
            <DialogDescription>
              标签名唯一,颜色对齐 Badge variant,删除标签会同时移除所有用户身上的关联
            </DialogDescription>
          </DialogHeader>
          <form
            id="tag-form"
            className="space-y-4"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              if (!editing?.name?.trim()) {
                toast.error('请输入标签名');
                return;
              }
              upsert.mutate(editing);
            }}
          >
            <div className="space-y-1.5">
              <Label>名称 *</Label>
              <Input
                value={editing?.name ?? ''}
                onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                placeholder="VIP"
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label>颜色</Label>
              <Select
                value={editing?.color || 'default'}
                onValueChange={(v) => setEditing((s) => ({ ...s, color: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <Badge variant={c.value as any}>预览</Badge>
                        <span>{c.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>说明</Label>
              <Input
                value={editing?.description ?? ''}
                onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))}
                placeholder="累计消费 ¥1000+"
                maxLength={255}
              />
            </div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button type="submit" form="tag-form" disabled={upsert.isPending}>
              {upsert.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="删除标签"
        description={
          confirmDelete
            ? `删除「${confirmDelete.name}」会移除 ${confirmDelete.user_count} 位用户身上的此标签,此操作无法撤销`
            : ''
        }
        confirmText="删除"
        destructive
        onConfirm={() => confirmDelete && del.mutate(confirmDelete.id)}
      />
    </PageLayout>
  );
}
