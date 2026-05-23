/**
 * DefaultBusinessData v2 — 默认业务数据 (目前只有"分析维度")
 *
 * 后续如果有更多业务数据,这里加 tab 即可。
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, RefreshCw } from 'lucide-react';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
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
import { Label } from '../../components/ui/label';

interface Dimension {
  id: number;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface FormState {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export default function DefaultBusinessDataV2() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['admin', 'analysisDimensions'],
    queryFn: async () => {
      const r = await adminAPI.getAnalysisDimensions();
      return ((r.data?.data?.dimensions || []) as Dimension[]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: FormState) => {
      await adminAPI.updateAnalysisDimension(input.id, {
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      });
    },
    onSuccess: () => {
      toast.success('已更新');
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'analysisDimensions'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '更新失败'),
  });

  const [form, setForm] = useState<FormState | null>(null);

  return (
    <PageLayout
      title="分析维度"
      description="AI 论文分析使用的维度配置(由系统预置,只支持调整名称/描述/状态)"
      actions={
        <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      }
    >
      <SectionCard
        title="分析维度列表"
        description={`共 ${listQuery.data?.length ?? 0} 项`}
        bodyPadded={false}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>描述</TableHead>
              <TableHead className="w-20">状态</TableHead>
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
            ) : (listQuery.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState title="暂无分析维度" description="由系统初始化时预置" />
                </TableCell>
              </TableRow>
            ) : (
              (listQuery.data ?? []).map((d, idx) => (
                <TableRow key={d.id}>
                  <TableCell className="text-muted-foreground">{d.sortOrder ?? idx + 1}</TableCell>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground line-clamp-2">
                    {d.description || '—'}
                  </TableCell>
                  <TableCell>
                    {d.isActive ? <Badge variant="success">启用</Badge> : <Badge variant="secondary">停用</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setForm({
                          id: d.id,
                          name: d.name,
                          description: d.description || '',
                          sortOrder: d.sortOrder ?? 0,
                          isActive: !!d.isActive,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑分析维度</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label>名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>描述</Label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>排序</Label>
                  <Input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  启用
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>取消</Button>
            <Button onClick={() => form && updateMutation.mutate(form)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
