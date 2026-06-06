import { useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { useDebounce } from '@/shared/hooks';
import { DataTable, type Column } from './DataTable';
import { Pagination } from './Pagination';
import { AdminTranscriptView } from './AdminTranscriptView';
import {
  useAdminSessions,
  useAdminTranscript,
  type AdminSession,
  type MonitorFeature,
} from '../api/session-monitor';

const fmtTime = (s?: string) => (s ? s.slice(0, 16).replace('T', ' ') : '—');

/** 对话型 feature(智能搜索/助手/写作)的会话监控:列会话 → 看完整 transcript(渲染同用户端)。 */
export function ChatSessionMonitor({ feature }: { feature: MonitorFeature }) {
  const [page, setPage] = useState(1);
  const [kwInput, setKwInput] = useState('');
  const keyword = useDebounce(kwInput, 300);
  const [viewing, setViewing] = useState<AdminSession | null>(null);

  const { data, isLoading } = useAdminSessions({
    feature,
    keyword: keyword.trim() || undefined,
    page,
    pageSize: 20,
  });
  const { data: transcript, isLoading: loadingTranscript } = useAdminTranscript(
    viewing?.agentSessionId ?? null,
  );

  const columns: Column<AdminSession>[] = [
    {
      header: '用户',
      width: 220,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-foreground text-xs font-bold">{r.username || r.userEmail || '—'}</span>
          <span className="text-2xs text-faint">
            {r.userEmail}
            {r.userId ? ` · ID ${r.userId}` : ''}
          </span>
        </div>
      ),
    },
    {
      header: '会话 ID',
      cell: (r) => <span className="text-2xs font-mono text-muted-foreground">{r.agentSessionId.slice(0, 12)}…</span>,
    },
    {
      header: '归属',
      width: 130,
      cell: (r) => <span className="text-2xs text-faint">{r.ownerKind ? `${r.ownerKind} #${r.ownerId}` : '—'}</span>,
    },
    {
      header: '最近活跃',
      width: 140,
      cell: (r) => <span className="text-2xs text-faint">{fmtTime(r.lastAccessedAt)}</span>,
    },
    {
      header: '',
      width: 120,
      align: 'right',
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => setViewing(r)}>
          <Eye className="size-3.5" />
          查看会话
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3">
        <input
          value={kwInput}
          onChange={(e) => {
            setKwInput(e.target.value);
            setPage(1);
          }}
          placeholder="按邮箱 / 用户名筛选"
          className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <DataTable columns={columns} rows={data?.list} loading={isLoading} />
      <Pagination total={data?.total ?? 0} page={page} pageSize={20} onPageChange={setPage} />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>会话记录 · {viewing?.username || viewing?.userEmail}</DialogTitle>
          </DialogHeader>
          {loadingTranscript ? (
            <div className="py-8 text-center text-sm text-faint">加载中…</div>
          ) : (
            <AdminTranscriptView messages={transcript ?? []} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
