import { type ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { EmptyState } from '@/shared/components/EmptyState';

/**
 * 基础占位页 —— 框架就位但内容待实现。
 * 单文件一个 export,保证 routes.tsx 的 lazy import 形状稳定。
 *
 * 后续填充时:复制 PromptsPage / UsersPage 的模式
 * (api 文件 + react-query hook + AdminPageLayout + DataTable)即可。
 */
export function StubPage({
  title,
  description,
  hint,
}: {
  title: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <AdminPageLayout title={title} description={description}>
      <EmptyState
        icon={Construction}
        title="此模块正在迁移中"
        description={hint ?? '后端 API 已就绪,前端表单/表格按 Prompts / Users 页面模式扩展。'}
      />
    </AdminPageLayout>
  );
}
