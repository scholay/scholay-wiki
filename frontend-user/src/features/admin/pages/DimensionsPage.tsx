import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
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
import {
  useDimensions,
  useUpdateDimension,
  type AnalysisDimension,
  type UpdateDimensionPayload,
} from '../api/dimensions';

/**
 * DimensionsPage — 8 个系统级"分析维度"的 admin 编辑界面。
 *
 * 后端 (AdminUpdateSystemDimension) 支持 name / description / sortOrder / isActive,
 * dimensionKey 不可改(改了 → 已有 paper_analysis 缓存 hash 失效)。
 *
 * 系统级提示词模板已下线(0045 迁移),但维度本身仍由本表驱动 ——
 * AI 分析 prompt 在每次请求时基于这里的维度动态拼出维度清单 + JSON schema。
 */
export function DimensionsPage() {
  const { data, isLoading } = useDimensions();
  const update = useUpdateDimension();
  const apiToast = useApiToast();
  const [editing, setEditing] = useState<AnalysisDimension | null>(null);

  const handleSave = async (id: number, payload: UpdateDimensionPayload) => {
    const ok = await apiToast(update.mutateAsync({ id, data: payload }), {
      success: '已保存',
      failure: '保存失败',
    });
    if (ok !== null) setEditing(null);
  };

  const columns: Column<AnalysisDimension>[] = [
    {
      header: '维度',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-foreground">{r.name}</span>
          <span className="text-2xs text-faint font-mono">{r.dimensionKey}</span>
        </div>
      ),
    },
    {
      header: '描述 / AI 分析指示',
      cell: (r) => (
        <span className="text-xs text-muted-foreground line-clamp-2 max-w-xl">
          {r.description || '—'}
        </span>
      ),
    },
    {
      header: '排序',
      width: 70,
      align: 'right',
      cell: (r) => <span className="text-xs text-muted-foreground tabular-nums">{r.sortOrder}</span>,
    },
    {
      header: '状态',
      width: 90,
      cell: (r) =>
        r.isActive ? (
          <Badge variant="outline" className="text-brand-green border-brand-green">
            启用
          </Badge>
        ) : (
          <Badge variant="outline">停用</Badge>
        ),
    },
    {
      header: '',
      width: 80,
      align: 'right',
      cell: (r) => (
        <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(r)} title="编辑">
          <Pencil className="size-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="分析维度"
      description={`共 ${data?.length ?? 0} 个系统维度 · 名称 / 描述 / 排序 / 启用可改,key 锁定`}
    >
      <DataTable columns={columns} rows={data} loading={isLoading} />

      <DimensionEditDialog
        dimension={editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        saving={update.isPending}
      />
    </AdminPageLayout>
  );
}

function DimensionEditDialog({
  dimension,
  onClose,
  onSave,
  saving,
}: {
  dimension: AnalysisDimension | null;
  onClose: () => void;
  onSave: (id: number, payload: UpdateDimensionPayload) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!dimension) return;
    setName(dimension.name);
    setDescription(dimension.description);
    setSortOrder(dimension.sortOrder);
    setIsActive(dimension.isActive);
  }, [dimension?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={!!dimension} onOpenChange={(o) => !o && onClose()}>
      {dimension && (
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>编辑维度</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{dimension.dimensionKey}</span> · key 不可改,修改 key 会破坏 paper_analysis
            缓存
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(dimension.id, { name, description, sortOrder, isActive });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="dim-name">维度名称</Label>
            <Input
              id="dim-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              placeholder="例如:研究方法"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dim-desc">AI 分析指示</Label>
            <textarea
              id="dim-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={6}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="给 AI 的指示 —— 例如:请提取论文采用的研究方法,如实验、调查、案例分析等。"
            />
            <p className="text-2xs text-faint">
              这里写的是给 AI 的"提示" —— 用大白话告诉它在这一个维度上要识别什么。每次论文分析时会拼进 prompt 里。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dim-sort">排序(数字越小越靠前)</Label>
              <Input
                id="dim-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dim-active">启用</Label>
              <div className="flex items-center h-9 gap-2">
                <Switch id="dim-active" checked={isActive} onCheckedChange={setIsActive} />
                <span className="text-xs text-muted-foreground">
                  {isActive ? '矩阵分析会包含本维度' : '停用后所有调用都不传给 AI'}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      )}
    </Dialog>
  );
}
