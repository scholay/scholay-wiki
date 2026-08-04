import { useEffect, useState } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { useDebounce } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import { ResourceError } from '@/shared/components/ResourceError';
import { DataTable, type Column } from './DataTable';
import { Pagination } from './Pagination';
import { TimeCell } from './TimeCell';
import { CopyableId } from './CopyableId';
import { AdminTranscriptView } from './AdminTranscriptView';
import { AdminFilePreviewDialog, type AdminPreviewFile } from './AdminFilePreviewDialog';
import { UserCell } from './UserCell';
import {
  useAdminSessions,
  useAdminTranscript,
  type AdminSession,
  type MonitorFeature,
} from '../api/session-monitor';

const FEATURE_LABEL: Record<string, string> = {
  smart_search: '智能搜索',
  claw: '智能助手',
  prism: '智能写作',
};

/**
 * 会话归属实体的中文名 —— 后端 `agent_sessions.owner_kind`
 * (mirrors backend/internal/agentbridge/repository.go:UpsertByOwnerEntity 的调用点)。
 * 未识别值原样回显,原始英文一律留在 title 里(排查时要跟 DB 里的值对齐)。
 */
const OWNER_LABEL: Record<string, string> = {
  project: '项目',
  submission: '投稿',
  user: '用户',
  document: '文档',
};

/** 对话型 feature(智能搜索/助手/写作)的会话监控:列会话 → 看完整 transcript(渲染同用户端)。 */
export function ChatSessionMonitor({ feature }: { feature: MonitorFeature }) {
  const [page, setPage] = useState(1);
  const [kwInput, setKwInput] = useState('');
  const keyword = useDebounce(kwInput, 300);
  const [viewing, setViewing] = useState<AdminSession | null>(null);
  const [preview, setPreview] = useState<AdminPreviewFile | null>(null);

  // feature 切换时**就地复位**(页码/关键字/正在看的会话),不再靠父级 `key={tab}` 重挂。
  // 父级重挂会把还 open 的 transcript Dialog 连根撕掉(浏览器前进/后退切 ?tab= 时尤其会),
  // → Radix body pointer-events 锁泄漏、全站点击失灵(见 BodyPointerLockGuard)。
  // 用 effect 复位让 viewing→null,Dialog 走正常 open→closed 收尾,锁被有序还原。
  useEffect(() => {
    setPage(1);
    setKwInput('');
    setViewing(null);
    setPreview(null);
  }, [feature]);

  const listQ = useAdminSessions({
    feature,
    keyword: keyword.trim() || undefined,
    page,
    pageSize: 20,
  });
  const transcriptQ = useAdminTranscript(viewing?.agentSessionId ?? null);

  const columns: Column<AdminSession>[] = [
    {
      header: '用户',
      width: 200,
      cell: (r) => <UserCell id={r.userId} name={r.username} email={r.userEmail} />,
    },
    {
      header: '会话 ID',
      cell: (r) => (
        // 完整 ID 是 `docker logs scholar_backend | grep <id>`、进 agent 容器翻 jsonl、
        // 贴工单时唯一的关联键 —— 只显示前 12 位且不可复制等于把排查的第一步掐断。
        <CopyableId
          value={r.agentSessionId}
          display={`${r.agentSessionId.slice(0, 12)}…`}
          label="会话 ID"
          className="text-12 text-muted-foreground"
        />
      ),
    },
    {
      header: '归属',
      width: 110,
      cell: (r) =>
        r.ownerKind ? (
          <span className="text-12 text-faint" title={`${r.ownerKind} #${r.ownerId}`}>
            {(OWNER_LABEL[r.ownerKind] ?? r.ownerKind)} #{r.ownerId}
          </span>
        ) : (
          <span className="text-12 text-faint">—</span>
        ),
    },
    {
      header: '重置',
      width: 70,
      align: 'right',
      // 「用户反复重置会话」是出问题的直接信号 —— 被重置 7 次的那条通常就是要查的那条。
      cell: (r) => (
        <span
          className={cn('text-12 tabular-nums', r.resetCount > 0 ? 'text-brand-amber' : 'text-faint')}
          title={r.resetCount > 0 ? `用户已重置该会话 ${r.resetCount} 次` : '未重置过'}
        >
          {r.resetCount > 0 ? `${r.resetCount} 次` : '—'}
        </span>
      ),
    },
    {
      header: '创建',
      width: 120,
      cell: (r) => <TimeCell value={r.createdAt} className="text-12" />,
    },
    {
      header: '最近活跃',
      width: 120,
      cell: (r) => <TimeCell value={r.lastAccessedAt} className="text-12" />,
    },
    {
      header: '',
      width: 110,
      align: 'right',
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => setViewing(r)}>
          <Eye className="size-3.5" />
          查看会话
        </Button>
      ),
    },
  ];

  const hasKeyword = !!keyword.trim();
  const featureName = FEATURE_LABEL[feature] ?? feature;

  return (
    <>
      <div className="mb-3">
        <Input
          value={kwInput}
          onChange={(e) => {
            setKwInput(e.target.value);
            setPage(1);
          }}
          placeholder="ID / 用户名 / 邮箱 / 手机号"
          className="h-9 w-full sm:w-64"
        />
      </div>

      <DataTable
        columns={columns}
        rows={listQ.data?.list}
        loading={listQ.isLoading}
        error={listQ.error}
        onRetry={() => listQ.refetch()}
        emptyMessage={hasKeyword ? '没有匹配的会话' : `${featureName}还没有会话`}
        emptyDescription={
          hasKeyword
            ? `关键字「${keyword.trim()}」在${featureName}下没有命中任何会话。`
            : '用户发起对话后,会话会出现在这里。'
        }
        emptyAction={
          hasKeyword ? (
            <Button
              variant="outline"
              onClick={() => {
                setKwInput('');
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          ) : undefined
        }
      />
      <Pagination total={listQ.data?.total ?? 0} page={page} pageSize={20} onPageChange={setPage} />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            {/* pr-8:给 DialogContent 右上角的关闭按钮让位 */}
            <DialogTitle className="pr-8">
              {/* 微信 / GitHub 注册用户 username 与 userEmail 可能同时为空 —— 不兜底会渲染成
                  「会话记录 · 」一个悬空的间隔号。 */}
              会话记录 · {viewing?.username || viewing?.userEmail || `用户 #${viewing?.userId ?? '—'}`}
            </DialogTitle>
          </DialogHeader>

          {/* 元信息行 —— 弹窗一打开就要能回答「我在看谁的哪条会话、什么时候的」。 */}
          {viewing && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-faint">
              <span>{FEATURE_LABEL[viewing.featureKey] ?? viewing.featureKey}</span>
              <span>用户 #{viewing.userId}</span>
              <CopyableId
                value={viewing.agentSessionId}
                label="会话 ID"
                className="max-w-full text-12 text-muted-foreground"
              />
              <TimeCell value={viewing.createdAt} prefix="创建 " className="text-12" />
              <TimeCell value={viewing.lastAccessedAt} prefix="最近活跃 " className="text-12" />
              {viewing.resetCount > 0 && (
                <span className="text-brand-amber">已重置 {viewing.resetCount} 次</span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7"
                onClick={() => transcriptQ.refetch()}
                disabled={transcriptQ.isFetching}
                title="重新拉取该会话的最新内容"
              >
                <RefreshCw className={cn('size-3.5', transcriptQ.isFetching && 'animate-spin')} />
                刷新
              </Button>
            </div>
          )}

          {/* 三分支,**error 必须先判**:失败时 data 是 undefined,若直接 `?? []` 交给
              AdminTranscriptView,它会渲染「无会话内容(用户尚未对话,或会话已被清理)」——
              后端 500 / agent 容器挂 / jsonl 读不到时,管理员看到的是一句肯定的业务结论。
              那不是少了个提示,是给了假信息,排查会被直接带沟里。 */}
          {transcriptQ.isError ? (
            <ResourceError
              error={transcriptQ.error}
              resourceName="会话记录"
              onRetry={() => transcriptQ.refetch()}
              autoRedirect={false}
              className="h-auto bg-surface-card"
            />
          ) : transcriptQ.isPending ? (
            <div className="py-8 text-center text-12 text-faint">加载中…</div>
          ) : (
            <AdminTranscriptView
              messages={transcriptQ.data ?? []}
              featureKey={viewing?.featureKey ?? feature}
              sessionId={viewing?.agentSessionId}
              onPreview={setPreview}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 会话内文件预览(叠在 transcript 弹窗之上;常驻挂载 + 内容守卫,遵守 Radix 铁律) */}
      <AdminFilePreviewDialog file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
