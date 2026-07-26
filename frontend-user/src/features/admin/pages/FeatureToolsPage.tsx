import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, ExternalLink, Upload, Webhook as WebhookIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Label } from '@/shared/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useApiToast } from '@/shared/hooks';
import { useConfirm } from '@/shared/components';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import {
  useAdminToolList,
  useAdminToolCategories,
  useUpdateTool,
  useDeleteTool,
} from '../api/feature-tools';
import { PRICE_TYPE_LABEL, ACCESS_TYPE_LABEL, type FeatureTool } from '@/types/feature-tool';

const STATUS_LABEL: Record<string, { text: string; variant: 'default' | 'outline' | 'success' | 'warning' }> = {
  published: { text: '已上线', variant: 'success' },
  draft: { text: '草稿', variant: 'outline' },
  pending: { text: '待审', variant: 'warning' },
  archived: { text: '归档', variant: 'outline' },
};

const selectCls = 'h-9 w-full rounded-8 border border-input bg-surface-card px-2 text-12';

export function FeatureToolsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FeatureTool | null>(null);

  const { data: catData } = useAdminToolCategories();
  const { data, isLoading } = useAdminToolList({ q: q || undefined, status: status || undefined, category: category || undefined, page, page_size: 20 });
  const update = useUpdateTool();
  const del = useDeleteTool();
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const handleDelete = async (row: FeatureTool) => {
    const ok = await confirm({ title: `删除工具「${row.name}」?`, description: '删除会触发 webhook 通知下游同步删除。', danger: true, confirmText: '删除' });
    if (!ok) return;
    await apiToast(del.mutateAsync(row.id), { success: '已删除', failure: '删除失败' });
  };

  const columns: Column<FeatureTool>[] = [
    {
      header: '工具',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-8 border border-border-soft bg-surface-2 text-12 font-medium text-subtle">
            {(r.name_en || r.name || '?').charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{r.name}</p>
            <p className="truncate text-12 text-faint">{r.slug}</p>
          </div>
        </div>
      ),
    },
    { header: '分类', width: 130, cell: (r) => <span className="text-12 text-subtle">{r.category_label || r.category}</span> },
    { header: '形式', width: 80, cell: (r) => <span className="text-12 text-muted-foreground">{ACCESS_TYPE_LABEL[r.access_type]}</span> },
    { header: '价格', width: 64, cell: (r) => <span className="text-12 text-muted-foreground">{PRICE_TYPE_LABEL[r.price_type] ?? r.price_type}</span> },
    {
      header: '状态', width: 80,
      cell: (r) => {
        const s = STATUS_LABEL[r.status] ?? { text: r.status, variant: 'outline' as const };
        return <Badge variant={s.variant}>{s.text}</Badge>;
      },
    },
    { header: '浏览', width: 60, align: 'right', cell: (r) => <span className="text-12 text-faint">{r.view_count ?? 0}</span> },
    {
      header: '', width: 110, align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button asChild variant="ghost" size="icon" className="size-7">
            <a href={`/tools/${r.slug || r.id}`} target="_blank" rel="noreferrer noopener" title="前台查看"><ExternalLink className="size-3.5" /></a>
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(r)}><Pencil className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(r)}><Trash2 className="size-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="功能广场"
      description={`学术工具黄页 · 共 ${total} 个`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/admin/tools-webhooks"><WebhookIcon className="size-3.5" />Webhook</Link></Button>
          <Button asChild size="sm"><Link to="/admin/tools-import"><Upload className="size-3.5" />导入工具</Link></Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="搜索名称…" className="w-full sm:max-w-xs" />
        <select className={`${selectCls} sm:max-w-[12rem]`} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">全部分类</option>
          {(catData?.categories ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.label} ({c.count})</option>)}
        </select>
        <select className={`${selectCls} sm:max-w-[8rem]`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">全部状态</option>
          <option value="published">已上线</option>
          <option value="draft">草稿</option>
          <option value="pending">待审</option>
          <option value="archived">归档</option>
        </select>
      </div>

      <DataTable columns={columns} rows={data?.items} loading={isLoading} emptyMessage="还没有工具,去导入吧" />

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-12 text-faint">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-8 border border-border px-2 py-1 disabled:opacity-40 hover:bg-surface-1">上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-8 border border-border px-2 py-1 disabled:opacity-40 hover:bg-surface-1">下一页</button>
        </div>
      )}

      <EditDialog
        tool={editing}
        categories={(catData?.categories ?? []).map((c) => ({ slug: c.slug, label: c.label }))}
        onClose={() => setEditing(null)}
        onSubmit={async (merged) => {
          const ok = await apiToast(update.mutateAsync({ id: merged.id, data: merged }), { success: '已更新(已通知下游)', failure: '更新失败' });
          if (ok !== null) setEditing(null);
        }}
      />
    </AdminPageLayout>
  );
}

function EditDialog({
  tool,
  categories,
  onClose,
  onSubmit,
}: {
  tool: FeatureTool | null;
  categories: { slug: string; label: string }[];
  onClose: () => void;
  onSubmit: (merged: FeatureTool) => void;
}) {
  return (
    <Dialog open={!!tool} onOpenChange={(o) => !o && onClose()}>
      {tool && (
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>编辑工具 · {tool.name}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            // 关键:基于完整原对象做合并, 保留 spec/faq/access 等嵌套字段不被清空
            const tagsRaw = String(fd.get('tags') || '').trim();
            onSubmit({
              ...tool,
              name: String(fd.get('name') || tool.name),
              name_en: String(fd.get('name_en') || ''),
              tagline: String(fd.get('tagline') || ''),
              category: String(fd.get('category') || tool.category),
              price_type: String(fd.get('price_type') || tool.price_type),
              access_type: (String(fd.get('access_type')) || tool.access_type) as FeatureTool['access_type'],
              status: (String(fd.get('status')) || tool.status) as FeatureTool['status'],
              official_url: String(fd.get('official_url') || ''),
              logo: String(fd.get('logo') || ''),
              description_md: String(fd.get('description_md') || ''),
              tags: tagsRaw ? tagsRaw.split(/[,，]/).map((t) => t.trim()).filter(Boolean) : [],
            });
          }}
          className="max-h-[70vh] space-y-3 overflow-y-auto pr-1"
        >
          <Field label="名称"><Input name="name" defaultValue={tool.name} required /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="英文名"><Input name="name_en" defaultValue={tool.name_en} /></Field>
            <Field label="Logo URL"><Input name="logo" defaultValue={tool.logo} placeholder="https://" /></Field>
          </div>
          <Field label="一句话简介"><Input name="tagline" defaultValue={tool.tagline} /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="分类">
              <select name="category" defaultValue={tool.category} className={selectCls}>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="价格">
              <select name="price_type" defaultValue={tool.price_type} className={selectCls}>
                {Object.entries(PRICE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="形式">
              <select name="access_type" defaultValue={tool.access_type} className={selectCls}>
                {Object.entries(ACCESS_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="官网 URL"><Input name="official_url" defaultValue={tool.official_url} placeholder="https://" /></Field>
          <Field label="标签 (逗号分隔)"><Input name="tags" defaultValue={(tool.tags ?? []).join(', ')} /></Field>
          <Field label="详细描述">
            <textarea name="description_md" defaultValue={tool.description_md} rows={4} className="w-full rounded-8 border border-input bg-surface-card px-3 py-2 text-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Field>
          <Field label="状态" inline>
            <select name="status" defaultValue={tool.status} className={`${selectCls} w-32`}>
              <option value="published">已上线</option>
              <option value="draft">草稿</option>
              <option value="pending">待审</option>
              <option value="archived">归档</option>
            </select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
      )}
    </Dialog>
  );
}

function Field({ label, children, inline }: { label: string; children: ReactNode; inline?: boolean }) {
  return (
    <div className={inline ? 'space-y-1.5' : 'space-y-1.5'}>
      <Label className="text-12">{label}</Label>
      {children}
    </div>
  );
}
