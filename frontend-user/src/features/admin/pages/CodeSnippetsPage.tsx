import { Badge } from '@/shared/ui/badge';
import { SimpleCrudPage } from '../components/SimpleCrudPage';
import type { Column } from '../components/DataTable';
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

/**
 * 代码片段库面板 —— 作为「系统设置」页(SystemConfigPage)的一个 tab 渲染。
 * 给用户端注入的 SEO / 统计 / 广告 / 社交脚本 CRUD。embedded 去掉自身 AdminPageLayout 外壳。
 */
export function CodeSnippetsPanel() {
  const { data, isLoading } = useCodeSnippets();
  const create = useCreateSnippet();
  const update = useUpdateSnippet();
  const del = useDeleteSnippet();

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
    { header: '分类', width: 110, cell: (r) => <Badge variant="muted">{r.category}</Badge> },
    {
      header: '注入位置',
      width: 120,
      cell: (r) => <Badge variant="outline">{r.position}</Badge>,
    },
    {
      header: '优先级',
      width: 80,
      align: 'right',
      cell: (r) => <span className="text-12 text-muted-foreground">{r.priority}</span>,
    },
    {
      header: '状态',
      width: 80,
      cell: (r) =>
        r.is_enabled ? (
          <Badge variant="outline" className="text-brand-green border-brand-green">启用</Badge>
        ) : (
          <Badge variant="outline">停用</Badge>
        ),
    },
  ];

  return (
    <SimpleCrudPage<CodeSnippet>
      embedded
      title="代码片段库"
      description={`共 ${data?.length ?? 0} 条 · 给用户端注入的 SEO / 统计 / 广告 / 社交脚本`}
      rows={data}
      loading={isLoading}
      columns={columns}
      createLabel="新建片段"
      emptyOf={() => ({ name: '', code_key: '', category: 'analytics', position: 'head', code_content: '', is_enabled: true, priority: 0 })}
      fields={[
        { name: 'name', label: '名称', type: 'text', required: true },
        { name: 'code_key', label: 'Key(唯一)', type: 'text', required: true, placeholder: 'baidu_analytics' },
        { name: 'category', label: '分类', type: 'select', options: CATEGORY_OPTIONS, required: true },
        { name: 'position', label: '注入位置', type: 'select', options: POSITION_OPTIONS, required: true },
        { name: 'priority', label: '优先级', type: 'number', placeholder: '0' },
        { name: 'description', label: '描述', type: 'text' },
        { name: 'code_content', label: '代码内容', type: 'textarea', rows: 12, required: true, span: 2 },
        { name: 'is_enabled', label: '启用', type: 'checkbox', placeholder: '立即生效', span: 2 },
      ]}
      onCreate={(d) => create.mutateAsync(d as Omit<CodeSnippet, 'id' | 'created_at' | 'updated_at'>)}
      onUpdate={(id, d) => update.mutateAsync({ id, data: d })}
      onDelete={(id) => del.mutateAsync(id)}
      deleteConfirm={(r) => `确定删除片段「${r.name}」?`}
    />
  );
}
