import { Search } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { useDebounce } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { useUrlState } from '@/shared/hooks';
import { useAuditLogs, type AuditLog } from '../api/audit-logs';

export function AuditLogsPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [action, setAction] = useUrlState('action', '');
  const [resourceType, setResourceType] = useUrlState('resource', '');
  const debouncedAction = useDebounce(action, 300);
  const debouncedResource = useDebounce(resourceType, 300);

  const { data, isLoading } = useAuditLogs({
    page,
    page_size: 30,
    action: debouncedAction || undefined,
    resource_type: debouncedResource || undefined,
  });

  const columns: Column<AuditLog>[] = [
    {
      header: '时间',
      width: 150,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.created_at?.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      header: '管理员',
      width: 180,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-foreground text-xs font-bold">{r.admin_username}</span>
          <span className="text-2xs text-faint">{r.admin_role} · ID {r.admin_user_id}</span>
        </div>
      ),
    },
    {
      header: '操作',
      width: 140,
      cell: (r) => <Badge variant="muted">{r.action}</Badge>,
    },
    {
      header: '资源',
      cell: (r) => (
        <span className="text-xs">
          <span className="text-subtle">{r.resource_type}</span>
          {r.resource_id && <span className="text-faint"> · #{r.resource_id}</span>}
        </span>
      ),
    },
    {
      header: 'IP',
      width: 120,
      cell: (r) => <span className="text-2xs text-faint font-mono">{r.ip || '—'}</span>,
    },
  ];

  return (
    <AdminPageLayout
      title="审计日志"
      description={`共 ${data?.total ?? 0} 条记录 · 管理员操作不可篡改流水`}
      actions={
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-faint" />
            <Input
              placeholder="操作类型"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className="pl-8 h-8 w-40"
            />
          </div>
          <Input
            placeholder="资源类型"
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setPage(1);
            }}
            className="h-8 w-40"
          />
        </div>
      }
    >
      <DataTable columns={columns} rows={data?.list} loading={isLoading} />

      <Pagination total={data?.total ?? 0} page={page} pageSize={30} onPageChange={setPage} />
    </AdminPageLayout>
  );
}
