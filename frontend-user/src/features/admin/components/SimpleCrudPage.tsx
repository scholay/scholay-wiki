import { useState, type ReactNode } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { AdminPageLayout } from './AdminPageLayout';
import { DataTable, type Column } from './DataTable';

/**
 * 简单 CRUD 页抽象 —— 适合"列表 + 新建/编辑 Dialog + 删除"模式。
 *
 * 不适用场景:
 *   - 多 tab 的复杂配置页(用 SystemConfigPage 模式)
 *   - 需要发送/激活/特殊动作的页(用 ThirdParty 模式手写)
 *
 * 使用方式:每个 field 声明 name/type/label/default,组件自动渲染表单。
 * 复杂表单不要硬塞这里 —— 直接复制 PromptsPage 的模式写真实 Dialog。
 */

export type FormFieldType = 'text' | 'textarea' | 'number' | 'checkbox' | 'select';

export interface FormField<T> {
  name: keyof T & string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  /** 占多列宽(默认 1)。grid 是 2 列 */
  span?: 1 | 2;
  /** textarea 行数(仅 type=textarea) */
  rows?: number;
}

export interface SimpleCrudPageProps<T extends { id: number }> {
  title: ReactNode;
  description?: ReactNode;
  rows: T[] | undefined;
  loading?: boolean;
  columns: Column<T>[];
  fields: FormField<T>[];
  /** 创建按钮文案(默认 "新建") */
  createLabel?: string;
  emptyOf: () => Partial<T>;
  onCreate: (data: Partial<T>) => Promise<unknown>;
  onUpdate: (id: number, data: Partial<T>) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  /** 删除二次确认提示文案,默认 "确定删除?" */
  deleteConfirm?: (row: T) => string;
  /** 嵌入模式:去掉 AdminPageLayout 外壳(title/description 收进顶部工具条),供并入多 tab 页时用 */
  embedded?: boolean;
}

export function SimpleCrudPage<T extends { id: number }>({
  title,
  description,
  rows,
  loading,
  columns,
  fields,
  createLabel = '新建',
  emptyOf,
  onCreate,
  onUpdate,
  onDelete,
  deleteConfirm,
  embedded,
}: SimpleCrudPageProps<T>) {
  type EditMode = { kind: 'create' } | { kind: 'edit'; row: T } | null;
  const [mode, setMode] = useState<EditMode>(null);
  const apiToast = useApiToast();
  const confirm = useConfirm();

  const handleDelete = async (row: T) => {
    const ok = await confirm({
      title: deleteConfirm ? deleteConfirm(row) : '确定删除?',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    await apiToast(onDelete(row.id), { success: '已删除', failure: '删除失败' });
  };

  // 追加操作列
  const allColumns: Column<T>[] = [
    ...columns,
    {
      header: '',
      width: 90,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setMode({ kind: 'edit', row: r })}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(r)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const addButton = (
    <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
      <Plus className="size-3.5" />
      {createLabel}
    </Button>
  );

  const body = (
    <>
      <DataTable columns={allColumns} rows={rows} loading={loading} />

      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mode?.kind === 'edit' ? `编辑${createLabel.replace('新建', '')}` : createLabel}</DialogTitle>
          </DialogHeader>
          {mode && (
            <CrudForm
              fields={fields}
              initial={mode.kind === 'edit' ? mode.row : (emptyOf() as Partial<T>)}
              onCancel={() => setMode(null)}
              onSubmit={async (data) => {
                const ok =
                  mode.kind === 'create'
                    ? await apiToast(onCreate(data), { success: '已创建', failure: '创建失败' })
                    : await apiToast(onUpdate(mode.row.id, data), { success: '已更新', failure: '更新失败' });
                if (ok !== null) setMode(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  // 嵌入模式:无 AdminPageLayout,description + 新建按钮收进顶部工具条(供并入多 tab 页)
  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : <span />}
          {addButton}
        </div>
        {body}
      </div>
    );
  }

  return (
    <AdminPageLayout title={title} description={description} actions={addButton}>
      {body}
    </AdminPageLayout>
  );
}

function CrudForm<T>({
  fields,
  initial,
  onCancel,
  onSubmit,
}: {
  fields: FormField<T>[];
  initial: Partial<T>;
  onCancel: () => void;
  onSubmit: (data: Partial<T>) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const result = {} as Partial<T>;
        for (const f of fields) {
          const v = fd.get(f.name);
          if (f.type === 'checkbox') {
            (result as Record<string, unknown>)[f.name] = v === 'on';
          } else if (f.type === 'number') {
            (result as Record<string, unknown>)[f.name] = v == null || v === '' ? undefined : Number(v);
          } else {
            (result as Record<string, unknown>)[f.name] = v == null ? '' : String(v);
          }
        }
        onSubmit(result);
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.name} className={f.span === 2 ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
            <Label htmlFor={f.name}>{f.label}</Label>
            {f.type === 'textarea' ? (
              <textarea
                id={f.name}
                name={f.name}
                rows={f.rows ?? 4}
                required={f.required}
                placeholder={f.placeholder}
                defaultValue={(initial[f.name] as string) ?? ''}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : f.type === 'select' && f.options ? (
              <select
                id={f.name}
                name={f.name}
                defaultValue={(initial[f.name] as string) ?? f.options[0]?.value}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : f.type === 'checkbox' ? (
              <div className="flex items-center h-9 gap-2">
                <input
                  id={f.name}
                  name={f.name}
                  type="checkbox"
                  defaultChecked={(initial[f.name] as boolean) ?? false}
                  className="size-4"
                />
                <span className="text-xs text-muted-foreground">{f.placeholder}</span>
              </div>
            ) : (
              <Input
                id={f.name}
                name={f.name}
                type={f.type === 'number' ? 'number' : 'text'}
                required={f.required}
                placeholder={f.placeholder}
                defaultValue={(initial[f.name] as string | number) ?? ''}
              />
            )}
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  );
}
