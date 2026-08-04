import { useEffect, useState } from 'react';
import { Loader2, MailOpen, PenLine, RefreshCw, Reply } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { Pagination } from '../components/Pagination';
import { TimeCell } from '../components/TimeCell';
import { useApiToast } from '../hooks/useApiToast';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { EmptyState } from '@/shared/components/EmptyState';
import { ResourceError } from '@/shared/components/ResourceError';
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

  const { data, isLoading, isError, error, refetch, isFetching } = useInboxList({
    status: status || undefined,
    keyword: keyword || undefined,
    page,
    page_size: PAGE_SIZE,
  });
  const poll = usePollIMAPNow();
  const apiToast = useApiToast();

  // 「立即拉取」= 让后端连一次 IMAP。**必须把拉到几封说出来**:
  // 固定文案「拉取完成」时,点完既不知道是 0 封还是 5 封,列表刷新又是异步的,
  // 于是「到底有没有新邮件」只能靠数列表,而这正是点这个按钮的唯一目的。
  const handlePoll = async () => {
    const r = await apiToast(poll.mutateAsync(), {
      failure: '拉取失败(检查「客服配置」里的 IMAP 设置)',
    });
    if (r === null) return;
    const n = r.new_mails ?? 0;
    if (n > 0) toast.success(`拉取完成 · 新邮件 ${n} 封`);
    else toast.success('拉取完成 · 没有新邮件');
  };

  const filtered = !!status || !!keyword;
  const items = data?.items ?? [];

  return (
    <AdminPageLayout
      title="邮件中心"
      // 取数失败时未读数写「—」而不是 0:「未读 0 封」是个会被当真的结论
      description={`客服邮箱收件箱 · 未读 ${isError ? '—' : (data?.unread ?? 0)} 封 · 收/发信配置见「客服配置」`}
      onRefresh={() => void refetch()}
      refreshing={isFetching}
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
                'h-7 rounded-8 px-2.5 text-12 font-medium transition-colors',
                o.value === status
                  ? 'bg-foreground text-on-dark'
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
            {/* 🔴 error 必须先于 loading、更要先于空态判断:改造前只解构了 data/isLoading,
                接口一挂 items 退化成 [],页面斩钉截铁地说「收件箱为空(在客服配置启用 IMAP 后自动拉取)」
                —— 把一次后端故障说成配置没做,运维会跑去客服配置页排查一个不存在的问题。 */}
            {isError ? (
              <ResourceError
                error={error}
                resourceName="收件箱"
                onRetry={() => void refetch()}
                autoRedirect={false}
                className="h-auto bg-surface-card py-10"
              />
            ) : isLoading ? (
              <div className="py-16 text-center text-12 text-faint">
                <Loader2 className="mx-auto size-4 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                dense
                icon={MailOpen}
                title={filtered ? '没有符合条件的邮件' : '收件箱为空'}
                description={
                  filtered
                    ? '换个关键词或状态筛选试试'
                    : '在「客服配置 → 收信(IMAP)」启用后会自动拉取,也可点右上角「立即拉取」'
                }
                action={
                  filtered ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setStatus('');
                        setKwInput('');
                        setKeyword('');
                      }}
                    >
                      清除筛选
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="max-h-[70dvh] divide-y divide-border-soft overflow-y-auto">
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
          <span className={cn('min-w-0 flex-1 truncate text-12', unread ? 'font-medium text-foreground' : 'text-subtle')}>
            {mail.from_name || mail.from_addr}
          </span>
          {/* 「这封是刚到的还是上周的」是扫这一列的唯一目的 —— 原来的 slice(5,16) 连年都砍了 */}
          <TimeCell value={mail.sent_at ?? mail.created_at} className="shrink-0 text-12" />
        </div>
        <span className={cn('truncate text-12', unread ? 'font-medium text-foreground' : 'text-subtle')}>
          {mail.subject}
        </span>
        <span className="truncate text-12 text-faint">{mail.snippet}</span>
      </button>
    </li>
  );
}

/** 阅读面板 —— 选中信件全文 + 回信框;未选时占位。 */
function ReadingPane({ id }: { id: number | null }) {
  const { data: mail, isLoading, isError, error, refetch } = useInboxMail(id);
  const reply = useReplyInbox();
  const apiToast = useApiToast();
  const [body, setBody] = useState('');

  useEffect(() => {
    setBody('');
  }, [id]);

  if (id == null) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-16 border border-dashed border-border bg-surface-1/40 text-12 text-faint">
        <span className="inline-flex flex-col items-center gap-2">
          <MailOpen className="size-6 text-faint" />
          选择左侧一封邮件查看
        </span>
      </div>
    );
  }

  const handleReply = async () => {
    if (!body.trim()) return;
    const ok = await apiToast(reply.mutateAsync({ id, body }), {
      success: '已回复(从客服邮箱发出,见「发送记录」)',
      failure: '发送失败',
    });
    // 发失败时**绝不清空**:SMTP 挂了 / 收件地址被拒时,清空等于把刚写完的回复扔掉,
    // 而屏幕上只有一闪而过的 error toast。
    if (ok !== null) setBody('');
  };

  return (
    <div className="flex min-w-0 flex-col rounded-16 border border-border bg-surface-card">
      {/* 🔴 error 必须先判:原写法 `isLoading || !mail` 一把抓 —— 详情请求失败时
          isLoading 变 false、mail 是 undefined,条件恒真 → 永久转圈,不给原因也没有重试。 */}
      {isError ? (
        <ResourceError
          error={error}
          resourceName="邮件"
          onRetry={() => void refetch()}
          autoRedirect={false}
          className="h-auto bg-surface-card py-10"
        />
      ) : isLoading || !mail ? (
        <div className="py-16 text-center text-12 text-faint">
          <Loader2 className="mx-auto size-4 animate-spin" />
        </div>
      ) : (
        <>
          {/* 头部 */}
          <div className="border-b border-border-soft px-5 py-4">
            <h2 className="text-16 font-medium text-foreground">{mail.subject}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-faint">
              <span className="text-subtle">
                {mail.from_name ? `${mail.from_name} <${mail.from_addr}>` : mail.from_addr}
              </span>
              <TimeCell value={mail.sent_at ?? mail.created_at} absolute className="text-12" />
              <Badge variant={mail.status === 'replied' ? 'default' : mail.status === 'unread' ? 'warning' : 'muted'}>
                {STATUS_LABEL[mail.status]}
              </Badge>
              {mail.replied_at && (
                <TimeCell value={mail.replied_at} prefix="已于 " className="text-12 text-brand-green" />
              )}
            </div>
          </div>

          {/* 正文:优先纯文本;只有 HTML 时用沙箱 iframe 隔离渲染 */}
          <div className="px-5 py-4">
            {mail.text_body ? (
              <pre className="max-h-[45dvh] overflow-y-auto whitespace-pre-wrap font-[inherit] text-12 leading-paragraph text-subtle">
                {mail.text_body}
              </pre>
            ) : mail.html_body ? (
              <iframe
                sandbox=""
                srcDoc={mail.html_body}
                title="邮件正文"
                className="h-[45dvh] w-full rounded-12 border border-border-soft bg-surface-card"
              />
            ) : (
              <p className="text-12 text-faint">(无正文)</p>
            )}
          </div>

          {/* 回信 */}
          <div className="border-t border-border-soft px-5 py-4">
            <label className="mb-2 block text-12 font-medium text-faint">
              回复 {mail.from_addr}(主题自动加 Re:)
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="输入回复内容…"
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

  // 🔴 apiToast 失败时返回 null(useApiToast 的 catch 分支)。原写法丢弃返回值后
  // 无条件清空 + 关窗 —— SMTP 挂了或收件地址被拒时,弹窗照样关闭、整封信被抹掉,
  // 视觉上和发送成功一模一样,只差一个一闪而过的 error toast。
  const handleSend = async () => {
    const ok = await apiToast(compose.mutateAsync({ to: to.trim(), subject: subject.trim(), body }), {
      success: '已发送(见「发送记录」)',
      failure: '发送失败',
    });
    if (ok === null) return; // 失败:原样留在弹窗里,改完再发
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
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="正文…"
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
