import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Switch } from '@/shared/ui/switch';
import { SimpleCrudPage } from '../components/SimpleCrudPage';
import type { Column } from '../components/DataTable';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useCodeSnippets,
  useCreateSnippet,
  useUpdateSnippet,
  useDeleteSnippet,
  type CodeSnippet,
} from '../api/code-snippets';

const CATEGORY_OPTIONS = [
  { value: 'seo', label: 'SEO' },
  { value: 'analytics', label: '统计分析' },
  { value: 'ad', label: '广告' },
  { value: 'social', label: '社交' },
  { value: 'other', label: '其他' },
];

const POSITION_OPTIONS = [
  { value: 'head', label: 'head 头部' },
  { value: 'body_start', label: 'body 开始' },
  { value: 'body_end', label: 'body 结束' },
];

/** 表格列直出 seo / analytics / body_start 这种裸枚举,而中文映射就在同文件里 —— 复用它 */
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label])
);
const POSITION_LABEL: Record<string, string> = Object.fromEntries(
  POSITION_OPTIONS.map((o) => [o.value, o.label])
);

/**
 * 代码片段库面板 —— 作为「系统设置」页(SystemConfigPage)的一个 tab 渲染。
 * 给用户端注入的 SEO / 统计 / 广告 / 社交脚本 CRUD。embedded 去掉自身 AdminPageLayout 外壳。
 *
 * 🔴 这一页的真实权限等级是 **XSS**:每条启用的记录都会被原样注入到所有用户端页面的
 * head/body,能读 localStorage 里的登录 token、能改页面、能劫持支付跳转。
 * 所以:① 顶部有一条警示条;② 状态列是**就地 Switch**(线上某段脚本把页面搞崩时,
 * 应急下架不该是「点铅笔 → 等弹窗 → 在 8 个字段里找到最后那个 checkbox → 取消 → 保存」四步)。
 * 开启方向要二次确认(注入全站),关闭方向**故意不确认**(那是止血路径,越快越好)。
 */
export function CodeSnippetsPanel() {
  const q = useCodeSnippets();
  const create = useCreateSnippet();
  const update = useUpdateSnippet();
  const del = useDeleteSnippet();
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const toggleEnabled = async (row: CodeSnippet, next: boolean) => {
    if (next) {
      const ok = await confirm({
        title: `启用「${row.name}」?`,
        description:
          '启用后这段代码会立刻被注入到全站所有访客的页面里(含未登录访客)。请确认代码内容与来源可信。',
        danger: true,
        confirmText: '确认启用',
      });
      if (!ok) return;
    }
    setTogglingId(row.id);
    try {
      await apiToast(update.mutateAsync({ id: row.id, data: { is_enabled: next } }), {
        success: next ? '已启用,全站生效' : '已停用,全站下架',
        failure: '操作失败',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const columns: Column<CodeSnippet>[] = [
    {
      header: '名称',
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-12 text-faint font-mono">{r.code_key}</span>
        </div>
      ),
    },
    {
      header: '分类',
      width: 110,
      cell: (r) => <Badge variant="muted">{CATEGORY_LABEL[r.category] ?? r.category}</Badge>,
    },
    {
      header: '注入位置',
      width: 120,
      cell: (r) => <Badge variant="outline">{POSITION_LABEL[r.position] ?? r.position}</Badge>,
    },
    {
      header: '优先级',
      width: 80,
      align: 'right',
      cell: (r) => <span className="text-12 text-muted-foreground tabular-nums">{r.priority}</span>,
    },
    {
      header: '全站生效',
      width: 110,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={r.is_enabled}
            disabled={togglingId === r.id}
            onCheckedChange={(v) => void toggleEnabled(r, v)}
            aria-label={r.is_enabled ? `停用 ${r.name}` : `启用 ${r.name}`}
          />
          <span className={r.is_enabled ? 'text-12 text-brand-green' : 'text-12 text-faint'}>
            {r.is_enabled ? '注入中' : '未注入'}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-12 border border-border bg-warning-soft p-3">
        <ShieldAlert className="size-4 shrink-0 text-brand-amber" />
        <div className="text-12 leading-paragraph text-foreground">
          <p className="font-medium">这里的每一条「启用」记录都会被原样注入全站所有页面</p>
          <p className="mt-1 text-subtle">
            注入的脚本与本站同源,能读取登录凭证、改写页面内容、劫持支付跳转 —— 权限等同于站点自身代码。
            只贴来源可信的代码;第三方统计/广告代码请先在测试环境验证。
          </p>
        </div>
      </div>

      <SimpleCrudPage<CodeSnippet>
        embedded
        title="代码片段库"
        description={
          q.isError
            ? '片段列表加载失败 · 下方为错误详情'
            : `共 ${q.data?.length ?? 0} 条 · 给用户端注入的 SEO / 统计 / 广告 / 社交脚本`
        }
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyMessage="还没有任何注入片段"
        columns={columns}
        createLabel="新建片段"
        emptyOf={() => ({ name: '', code_key: '', category: 'analytics', position: 'head', code_content: '', is_enabled: true, priority: 0, defer_until_idle: false })}
        fields={[
          { name: 'name', label: '名称', type: 'text', required: true },
          { name: 'code_key', label: 'Key(唯一)', type: 'text', required: true, placeholder: 'baidu_analytics' },
          { name: 'category', label: '分类', type: 'select', options: CATEGORY_OPTIONS, required: true },
          { name: 'position', label: '注入位置', type: 'select', options: POSITION_OPTIONS, required: true },
          { name: 'priority', label: '优先级', type: 'number', placeholder: '0' },
          {
            name: 'defer_until_idle',
            label: '首屏后空闲加载',
            type: 'checkbox',
            placeholder: '仅用于广告/分析等非关键片段；验证 meta、consent 和 bootstrap 不要开启',
            span: 2,
          },
          { name: 'description', label: '描述', type: 'text' },
          { name: 'code_content', label: '代码内容', type: 'textarea', rows: 12, required: true, span: 2 },
          { name: 'is_enabled', label: '启用', type: 'checkbox', placeholder: '保存后立刻对全站所有访客生效', span: 2 },
        ]}
        onCreate={(d) => create.mutateAsync(d as Omit<CodeSnippet, 'id' | 'created_at' | 'updated_at'>)}
        onUpdate={(id, d) => update.mutateAsync({ id, data: d })}
        onDelete={(id) => del.mutateAsync(id)}
        deleteConfirm={(r) => `确定删除片段「${r.name}」(${r.code_key})?`}
      />
    </div>
  );
}
