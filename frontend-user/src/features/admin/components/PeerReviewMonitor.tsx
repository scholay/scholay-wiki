import { useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { useDebounce } from '@/shared/hooks';
import { ResourceError } from '@/shared/components/ResourceError';
import { DataTable, type Column } from './DataTable';
import { Pagination } from './Pagination';
import { UserCell } from './UserCell';
import { TimeCell } from './TimeCell';
import { CopyableId } from './CopyableId';
import { AdminFilePreviewDialog, type AdminPreviewFile } from './AdminFilePreviewDialog';
import { PeerReviewRecordView } from './PeerReviewRecordView';
import { prModeLabel, prStatusBadgeVariant, prStatusLabel } from '../lib/pr-labels';
import {
  usePRSubmissions,
  usePRSubmissionDetail,
  type PRSubmissionRow,
} from '../api/peer-review-monitor';

/**
 * 审稿监控:列投稿 → 看完整审稿记录。
 *
 * 详情正文用 **PeerReviewRecordView**(镜像用户端 RecordDetailPage:中文状态 / 失败横幅 /
 * 审稿人 A·B·C + 主审 tab / 评分面板 / 附件 / 运维信息 / 原始 DTO 折叠),
 * 取代改造前那份「15 个 KV + 一堆原始 JSON 平铺」—— 同一份数据,前者能一眼看出结论,
 * 后者要在 JSON 里翻。完整原始字段没有丢:RecordView 底部的 RawDebug 仍把整个 DTO 折叠保留。
 */
export function PeerReviewMonitor() {
  const [page, setPage] = useState(1);
  const [kwInput, setKwInput] = useState('');
  const keyword = useDebounce(kwInput, 300);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<AdminPreviewFile | null>(null);

  const listQ = usePRSubmissions({ keyword: keyword.trim() || undefined, page, pageSize: 20 });
  const detailQ = usePRSubmissionDetail(viewingId);

  const columns: Column<PRSubmissionRow>[] = [
    {
      header: '用户',
      width: 200,
      cell: (r) => <UserCell id={r.userId} name={r.username} email={r.userEmail} />,
    },
    {
      header: '标题',
      cell: (r) => <span className="text-12 text-subtle line-clamp-2">{r.title || '(未填)'}</span>,
    },
    {
      header: '模式',
      width: 90,
      cell: (r) => (
        <span className="text-12 text-faint" title={r.mode}>
          {prModeLabel(r.mode)}
        </span>
      ),
    },
    {
      header: '状态',
      width: 100,
      // 改造前这里是清一色的灰底 `<Badge variant="muted">{r.status}</Badge>`(还直出英文枚举),
      // 失败的投稿和已结案的长得一模一样 —— 而「哪几条炸了」正是这张表的主要用途。
      cell: (r) => (
        <Badge variant={prStatusBadgeVariant(r.status)} title={r.status}>
          {prStatusLabel(r.status)}
        </Badge>
      ),
    },
    { header: '时间', width: 120, cell: (r) => <TimeCell value={r.createdAt} className="text-12" /> },
    {
      header: '',
      width: 100,
      align: 'right',
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => setViewingId(r.id)}>
          <Eye className="size-3.5" />
          查看
        </Button>
      ),
    },
  ];

  const hasKeyword = !!keyword.trim();

  return (
    <>
      <div className="mb-3">
        <Input
          value={kwInput}
          onChange={(e) => {
            setKwInput(e.target.value);
            setPage(1);
          }}
          placeholder="ID / 用户名 / 邮箱 / 手机号 / 标题"
          className="h-9 w-full sm:w-72"
        />
      </div>
      <DataTable
        columns={columns}
        rows={listQ.data?.list}
        loading={listQ.isLoading}
        error={listQ.error}
        onRetry={() => listQ.refetch()}
        emptyMessage={hasKeyword ? '没有匹配的投稿' : '还没有投稿'}
        emptyDescription={
          hasKeyword
            ? `关键字「${keyword.trim()}」没有命中任何投稿(可搜 ID / 用户名 / 邮箱 / 手机号 / 标题)。`
            : '用户在智能审稿里提交投稿后,记录会出现在这里。'
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

      <Dialog open={viewingId != null} onOpenChange={(o) => !o && setViewingId(null)}>
        <DialogContent className="max-w-5xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              审稿记录
              <CopyableId
                value={viewingId ?? ''}
                prefix="#"
                label="投稿 ID"
                className="text-12 font-normal text-muted-foreground"
              />
            </DialogTitle>
          </DialogHeader>

          {/* 三分支,**error 必须先判**。改造前的判据是 `loadingDetail || !s`:
              请求失败时 isLoading 回到 false、detail 是 undefined → `!s` 为真 →
              弹窗**永久转圈**,既转不出来也不报错。管理员只会以为是慢,反复重开弹窗。 */}
          {detailQ.isError ? (
            <ResourceError
              error={detailQ.error}
              resourceName="审稿记录"
              onRetry={() => detailQ.refetch()}
              autoRedirect={false}
              className="h-auto bg-surface-card"
            />
          ) : !detailQ.data ? (
            <div className="py-8 text-center text-12 text-faint">加载中…</div>
          ) : (
            <PeerReviewRecordView detail={detailQ.data} onPreview={setPreview} />
          )}
        </DialogContent>
      </Dialog>

      {/* 文件预览弹窗(叠在详情之上;常驻挂载 + 内容守卫,遵守 Radix 铁律) */}
      <AdminFilePreviewDialog file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
