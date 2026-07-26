import { useEffect, useState } from 'react';
import { Loader2, MailOpen, PenLine, RefreshCw, Reply } from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { Pagination } from '../components/Pagination';
import { useApiToast } from '../hooks/useApiToast';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import {
  useInboxList,
  useInboxMail,
  usePollIMAPNow,
  useReplyInbox,
  useComposeMail,
  type InboxMail,
  type MailStatus,
} from '../api/support-center';

/**
 * 邮件中心(后台)—— 客服邮箱收件箱,**邮件客户端式 master-detail**:
 * 左列邮件列表(整行可点 + 未读加粗/圆点),右列阅读面板(信件全文 + 直接回信)。
 * 收件配置在「客服配置 → 收信(IMAP)」,发信走「客服配置 → 发信(SMTP)」。
 */

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<MailStatus, string> = { unread: '未读', read: '已读', replied: '已回复' };

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'read', label: '已读' },
  { value: 'replied', label: '已回复' },
];

export function MailCenterPage() {
  const [status, setStatus] = useState('');
  const [kwInput, setKwInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  // 筛选/翻页变化 → 回第 1 页 + 清空选中(选中项可能已不在新列表里)
  useEffect(() => {
    setPage(1);
  }, [status, keyword]);
  useEffect(() => {
    setSelectedId(null);
  }, [status, keyword, page]);

  const { data, isLoading } = useInboxList({
    status: status || undefined,
    keyword: keyword || undefined,
    page,
    page_size: PAGE_SIZE,
  });
  const poll = usePollIMAPNow();
  const apiToast = useApiToast();

  const handlePoll = () =>
    apiToast(poll.mutateAsync(), {
      success: '拉取完成',
      failure: '拉取失败(检查「客服配置」里的 IMAP 设置)',
    });

  const items = data?.items ?? [];

  return (
    <AdminPageLayout
      title="邮件中心"
      description={`客服邮箱收件箱 · 未读 ${data?.unread ?? 0} 封 · 收/发信配置见「客服配置」`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={poll.isPending} onClick={handlePoll}>
            {poll.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            立即拉取
          </Button>
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <PenLine className="size-3.5" />
            写邮件
          </Button>
        </div>
      }
    >
      {/* 筛选 */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setStatus(o.value)}
              className={cn(
                'h-7 rounded-8 px-2.5 text-xs font-medium transition-colors',
                o.value === status
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <form
          className="w-full sm:ml-auto sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setKeyword(kwInput.trim());
          }}
        >
          <Input
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onBlur={() => setKeyword(kwInput.trim())}
            placeholder="发件人 / 主题"
            className="h-8 w-full sm:w-56"
          />
        </form>
      </section>

      {/* master-detail:列表 + 阅读面板 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* 列表 */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="overflow-hidden rounded-16 border border-border bg-surface-card">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-faint">
                <Loader2 className="mx-auto size-4 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-sm text-faint">
                收件箱为空(在「客服配置」启用 IMAP 后自动拉取)
              </div>
            ) : (
              <ul className="max-h-[70vh] divide-y divide-border-soft overflow-y-auto">
                {items.map((m) => (
                  <MailRow
                    key={m.id}
                    mail={m}
                    active={m.id === selectedId}
                    onClick={() => setSelectedId(m.id)}
                  />
                ))}
              </ul>
            )}
          </div>
          <Pagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>

        {/* 阅读面板 */}
        <ReadingPane id={selectedId} />
      </div>

      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} />
    </AdminPageLayout>
  );
}

/** 列表行 —— 整行可点;未读加粗 + 圆点;长文本正确截断(min-w-0 + truncate)。 */
function MailRow({ mail, active, onClick }: { mail: InboxMail; active: boolean; onClick: () => void }) {
  const unread = mail.status === 'unread';
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors',
          active ? 'bg-surface-2' : 'hover:bg-surface-1',
        )}
      >
        <div className="flex items-center gap-1.5">
          {unread && <span className="size-1.5 shrink-0 rounded-pill bg-brand-red" />}
          <span className={cn('min-w-0 flex-1 truncate text-xs', unread ? 'font-bold text-foreground' : 'text-subtle')}>
            {mail.from_name || mail.from_addr}
          </span>
          <span className="shrink-0 text-2xs tabular-nums text-faint">
            {(mail.sent_at ?? mail.created_at)?.slice(5, 16).replace('T', ' ')}
          </span>
        </div>
        <span className={cn('truncate text-xs', unread ? 'font-semibold text-foreground' : 'text-subtle')}>
          {mail.subject}
        </span>
        <span className="truncate text-2xs text-faint">{mail.snippet}</span>
      </button>
    </li>
  );
}

/** 阅读面板 —— 选中信件全文 + 回信框;未选时占位。 */
function ReadingPane({ id }: { id: number | null }) {
  const { data: mail, isLoading } = useInboxMail(id);
  const reply = useReplyInbox();
  const apiToast = useApiToast();
  const [body, setBody] = useState('');

  useEffect(() => {
    setBody('');
  }, [id]);

  if (id == null) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-16 border border-dashed border-border bg-surface-1/40 text-sm text-faint">
        <span className="inline-flex flex-col items-center gap-2">
          <MailOpen className="size-6 text-faint" />
          选择左侧一封邮件查看
        </span>
      </div>
    );
  }

  const handleReply = async () => {
    if (!body.trim()) return;
    await apiToast(reply.mutateAsync({ id, body }), {
      success: '已回复(从客服邮箱发出,见「发送记录」)',
      failure: '发送失败',
    });
    setBody('');
  };

  return (
    <div className="flex min-w-0 flex-col rounded-16 border border-border bg-surface-card">
      {isLoading || !mail ? (
        <div className="py-16 text-center text-sm text-faint">
          <Loader2 className="mx-auto size-4 animate-spin" />
        </div>
      ) : (
        <>
          {/* 头部 */}
          <div className="border-b border-border-soft px-5 py-4">
            <h2 className="text-base font-bold text-foreground">{mail.subject}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
              <span className="text-subtle">
                {mail.from_name ? `${mail.from_name} <${mail.from_addr}>` : mail.from_addr}
              </span>
              <span>{(mail.sent_at ?? mail.created_at)?.slice(0, 19).replace('T', ' ')}</span>
              <Badge variant={mail.status === 'replied' ? 'default' : mail.status === 'unread' ? 'warning' : 'muted'}>
                {STATUS_LABEL[mail.status]}
              </Badge>
              {mail.replied_at && (
                <span className="text-brand-green">已于 {mail.replied_at.slice(5, 16).replace('T', ' ')} 回复</span>
              )}
            </div>
          </div>

          {/* 正文:优先纯文本;只有 HTML 时用沙箱 iframe 隔离渲染 */}
          <div className="px-5 py-4">
            {mail.text_body ? (
              <pre className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap font-[inherit] text-sm leading-paragraph text-subtle">
                {mail.text_body}
              </pre>
            ) : mail.html_body ? (
              <iframe
                sandbox=""
                srcDoc={mail.html_body}
                title="邮件正文"
                className="h-[45vh] w-full rounded-12 border border-border-soft bg-surface-card"
              />
            ) : (
              <p className="text-xs text-faint">(无正文)</p>
            )}
          </div>

          {/* 回信 */}
          <div className="border-t border-border-soft px-5 py-4">
            <label className="mb-2 block text-2xs font-bold text-faint">
              回复 {mail.from_addr}(主题自动加 Re:)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="输入回复内容…"
              className="w-full rounded-8 border border-input bg-surface-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-2 flex justify-end">
              <Button onClick={handleReply} disabled={reply.isPending || !body.trim()}>
                {reply.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Reply className="size-3.5" />}
                发送回复
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 主动写信(给任意邮箱;用户邮箱在「用户管理」可查)。 */
function ComposeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const compose = useComposeMail();
  const apiToast = useApiToast();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const handleSend = async () => {
    await apiToast(compose.mutateAsync({ to: to.trim(), subject: subject.trim(), body }), {
      success: '已发送(见「发送记录」)',
      failure: '发送失败',
    });
    setTo('');
    setSubject('');
    setBody('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="size-4" />
            写邮件
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="收件邮箱(用户邮箱见「用户管理」)" />
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="主题" />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="正文…"
            className="w-full rounded-8 border border-input bg-surface-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end">
            <Button onClick={handleSend} disabled={compose.isPending || !to.trim() || !subject.trim() || !body.trim()}>
              {compose.isPending && <Loader2 className="size-3.5 animate-spin" />}
              发送
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
