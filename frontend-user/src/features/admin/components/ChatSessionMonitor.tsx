import { useEffect, useState } from 'react';
import {
  Bot,
  Clock3,
  Eye,
  History,
  Pin,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { useDebounce } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import { ResourceError } from '@/shared/components/ResourceError';
import { DataTable, type Column } from './DataTable';
import { Pagination } from './Pagination';
import { TimeCell } from './TimeCell';
import { CopyableId } from './CopyableId';
import { AdminTranscriptView } from './AdminTranscriptView';
import {
  AdminFilePreviewDialog,
  type AdminPreviewFile,
} from './AdminFilePreviewDialog';
import { SessionStatusBadge } from './SessionTurnMeta';
import { UserCell } from './UserCell';
import {
  useAdminSessions,
  useAdminSessionArtifacts,
  useAdminTranscript,
  type AdminSession,
  type MonitorFeature,
} from '../api/session-monitor';

export const FEATURE_LABEL: Record<MonitorFeature, string> = {
  smart_search: '智能搜论文',
  claw: '智能助手',
  prism: '智能写作',
  boltslides: '制作 PPT',
  sci_draw: '科研绘图',
  stat_lab: '数据分析',
};

const OWNER_LABEL: Record<string, string> = {
  project: '项目',
  submission: '投稿',
  user: '用户',
  document: '文档',
};

/** 对话型 feature 的只读会话监控：会话列表 → 用户端同源回放推屏。 */
export function ChatSessionMonitor({ feature }: { feature: MonitorFeature }) {
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState('');
  const keyword = useDebounce(keywordInput, 300);
  const [viewing, setViewing] = useState<AdminSession | null>(null);
  const [preview, setPreview] = useState<AdminPreviewFile | null>(null);

  useEffect(() => {
    setPage(1);
    setKeywordInput('');
    setViewing(null);
    setPreview(null);
  }, [feature]);

  const listQuery = useAdminSessions({
    feature,
    keyword: keyword.trim() || undefined,
    page,
    pageSize: 20,
  });
  const transcriptQuery = useAdminTranscript(viewing?.agentSessionId ?? null);
  const artifactsQuery = useAdminSessionArtifacts(
    viewing?.agentSessionId ?? null,
  );

  // 推屏不能永远停在“点开那一刻”的列表快照。列表每 30 秒更新时，
  // 同步更新标题、实际模型、状态、轮数与活跃时间。
  useEffect(() => {
    if (!viewing) return;
    const fresh = listQuery.data?.list.find(
      (session) => session.agentSessionId === viewing.agentSessionId,
    );
    if (fresh) setViewing(fresh);
  }, [listQuery.data?.list, viewing?.agentSessionId]);

  const columns: Column<AdminSession>[] = [
    {
      header: '会话',
      width: 270,
      cell: (session) => (
        <div className="min-w-0 py-1">
          <button
            type="button"
            onClick={() => setViewing(session)}
            className="block max-w-full truncate text-left text-14 font-medium text-foreground hover:text-brand-red"
            title={session.title || `${FEATURE_LABEL[feature]}会话`}
          >
            {session.title || `${FEATURE_LABEL[feature]}会话`}
          </button>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-12 text-faint">
            <CopyableId
              value={session.agentSessionId}
              display={`${session.agentSessionId.slice(0, 10)}…`}
              label="会话 ID"
              className="min-w-0"
            />
            {session.ownerKind && (
              <span
                className="shrink-0"
                title={`${session.ownerKind} #${session.ownerId ?? '—'}`}
              >
                {OWNER_LABEL[session.ownerKind] ?? session.ownerKind} #
                {session.ownerId}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: '用户',
      width: 190,
      cell: (session) => (
        <UserCell
          id={session.userId}
          name={session.username}
          email={session.userEmail}
        />
      ),
    },
    {
      header: '模型',
      width: 190,
      cell: (session) => <SessionModel session={session} />,
    },
    {
      header: '轮次 / 状态',
      width: 135,
      cell: (session) => (
        <div className="flex flex-col items-start gap-1 py-1">
          <div className="flex items-center gap-1.5 text-12 text-subtle">
            <History className="size-3.5 text-faint" />
            <span className="tabular-nums">
              {session.turnCount.toLocaleString('zh-CN')} 轮
            </span>
            <SessionStatusBadge status={session.latestTurnStatus} />
          </div>
          {session.resetCount > 0 && (
            <span className="inline-flex items-center gap-1 text-12 text-brand-amber">
              <RotateCcw className="size-3" />
              已重置 {session.resetCount} 次
            </span>
          )}
        </div>
      ),
    },
    {
      header: '时间',
      width: 145,
      cell: (session) => (
        <div className="flex flex-col gap-1 py-1">
          <TimeCell
            value={session.lastAccessedAt}
            prefix="活跃 "
            className="text-12"
          />
          <TimeCell
            value={session.createdAt}
            prefix="创建 "
            className="text-12"
          />
        </div>
      ),
    },
    {
      header: '',
      width: 110,
      align: 'right',
      cell: (session) => (
        <Button size="sm" variant="outline" onClick={() => setViewing(session)}>
          <Eye className="size-3.5" />
          查看会话
        </Button>
      ),
    },
  ];

  const hasKeyword = !!keyword.trim();
  const featureName = FEATURE_LABEL[feature];
  const loadingEarlier = transcriptQuery.isFetchingNextPage;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Input
          value={keywordInput}
          onChange={(event) => {
            setKeywordInput(event.target.value);
            setPage(1);
          }}
          placeholder="会话 ID / 标题 / 用户 / 邮箱 / 手机号"
          className="h-9 w-full sm:w-80"
        />
        <p className="text-12 text-faint">列表每 30 秒更新 · 会话内容只读</p>
      </div>

      <DataTable
        columns={columns}
        rows={listQuery.data?.list}
        loading={listQuery.isLoading}
        error={listQuery.error}
        onRetry={() => listQuery.refetch()}
        rowKey={(session) => session.agentSessionId}
        emptyMessage={
          hasKeyword ? '没有匹配的会话' : `${featureName}还没有会话`
        }
        emptyDescription={
          hasKeyword
            ? `关键字「${keyword.trim()}」在${featureName}下没有命中任何会话。`
            : '用户发起对话后，会话会出现在这里。'
        }
        emptyAction={
          hasKeyword ? (
            <Button
              variant="outline"
              onClick={() => {
                setKeywordInput('');
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          ) : undefined
        }
      />
      <Pagination
        total={listQuery.data?.total ?? 0}
        page={page}
        pageSize={20}
        onPageChange={setPage}
      />

      <Sheet
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      >
        <SheetContent className="min-w-0 gap-0 sm:max-w-[min(92vw,960px)]">
          {viewing && (
            <>
              <SheetHeader className="shrink-0 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-12 bg-brand-green/10 text-brand-green">
                    <Bot className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 pr-8">
                      <SheetTitle className="max-w-full truncate">
                        {viewing.title || `${featureName}会话`}
                      </SheetTitle>
                      <Badge variant="outline">只读回放</Badge>
                      <SessionStatusBadge status={viewing.latestTurnStatus} />
                    </div>
                    <SheetDescription className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span>
                        {viewing.username ||
                          viewing.userEmail ||
                          `用户 #${viewing.userId}`}
                      </span>
                      <span>·</span>
                      <CopyableId
                        value={viewing.agentSessionId}
                        label="会话 ID"
                        className="max-w-full"
                      />
                    </SheetDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mr-7 h-8 shrink-0"
                    onClick={() => {
                      void Promise.all([
                        transcriptQuery.refetch(),
                        listQuery.refetch(),
                        artifactsQuery.refetch(),
                      ]);
                    }}
                    disabled={transcriptQuery.isFetching}
                    title="重新拉取该会话的最新内容"
                  >
                    <RefreshCw
                      className={cn(
                        'size-3.5',
                        transcriptQuery.isFetching && 'animate-spin',
                      )}
                    />
                    刷新
                  </Button>
                </div>
              </SheetHeader>

              <div className="grid shrink-0 grid-cols-2 gap-px border-b border-border-soft bg-border-soft sm:grid-cols-4">
                <SessionFact
                  label="最近实际模型"
                  value={viewing.latestModel || '未记录'}
                  icon={<Bot className="size-3.5" />}
                />
                <SessionFact
                  label="对话轮数"
                  value={`${viewing.turnCount.toLocaleString('zh-CN')} 轮`}
                  icon={<History className="size-3.5" />}
                />
                <SessionFact
                  label="创建时间"
                  value={
                    <TimeCell
                      value={viewing.createdAt}
                      absolute
                      className="text-12"
                    />
                  }
                  icon={<Clock3 className="size-3.5" />}
                />
                <SessionFact
                  label="最近活跃"
                  value={
                    <TimeCell
                      value={viewing.lastAccessedAt}
                      absolute
                      className="text-12"
                    />
                  }
                  icon={<Clock3 className="size-3.5" />}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-background">
                {transcriptQuery.isError && !transcriptQuery.data ? (
                  <ResourceError
                    error={transcriptQuery.error}
                    resourceName="会话记录"
                    onRetry={() => transcriptQuery.refetch()}
                    autoRedirect={false}
                    className="h-full bg-background"
                  />
                ) : transcriptQuery.isPending || !transcriptQuery.data ? (
                  <div className="flex h-48 items-center justify-center text-12 text-faint">
                    加载会话中…
                  </div>
                ) : (
                  <AdminTranscriptView
                    transcript={transcriptQuery.data}
                    featureKey={viewing.featureKey as MonitorFeature}
                    sessionId={viewing.agentSessionId}
                    artifacts={artifactsQuery.data?.items}
                    onPreview={setPreview}
                    onLoadEarlier={() => void transcriptQuery.fetchNextPage()}
                    loadingEarlier={loadingEarlier}
                  />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AdminFilePreviewDialog file={preview} onClose={() => setPreview(null)} />
    </>
  );
}

function SessionModel({ session }: { session: AdminSession }) {
  const model = session.latestModel;
  if (!model && !session.pinnedModel) {
    return <span className="text-12 text-faint">未记录</span>;
  }
  return (
    <div className="min-w-0 py-1">
      <span
        className="flex min-w-0 items-center gap-1 text-12 text-subtle"
        title={model || '历史轮次没有记录实际模型'}
      >
        <Bot className="size-3.5 shrink-0 text-faint" />
        <span className="truncate">{model || '实际模型未记录'}</span>
      </span>
      {session.pinnedModel && (
        <span
          className="mt-0.5 inline-flex max-w-full items-center gap-1 text-12 text-faint"
          title={`会话锁定模型：${session.pinnedModel}`}
        >
          <Pin className="size-3" />
          <span className="truncate">锁定：{session.pinnedModel}</span>
        </span>
      )}
    </div>
  );
}

function SessionFact({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-surface-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-12 text-faint">
        {icon}
        {label}
      </div>
      <div
        className="mt-1 truncate text-12 font-medium text-foreground"
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}
