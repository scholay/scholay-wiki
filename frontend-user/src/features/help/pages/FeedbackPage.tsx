import { useRef, useState } from 'react';
import {
  Bug,
  CheckCircle2,
  Lightbulb,
  Loader2,
  MessageCircle,
  Paperclip,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { BrandName } from '@/shared/components/BrandName';
import { Button } from '@/shared/ui/button';
import { Input, Textarea } from '@/shared/ui';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { trackEvent } from '@/shared/lib/track';
import { HelpLayout } from '../components/HelpLayout';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';
import { ContactChannels } from '../components/ContactChannels';

/** 单个已上传附件 (后端 /public/feedback/upload 返回项形态) */
interface UploadedAttachment {
  id: number;
  name: string;
  url: string; // /api/v1/public/feedback/attachment/<id>
  size: number;
  type: 'image' | 'file';
}

/** 限制对齐后端 handler.go const (MaxImageBytes/Count、MaxFileBytes/Count、MaxTotalBytes) */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 5;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = MAX_IMAGE_COUNT + MAX_FILE_COUNT;
/** 表单 accept —— 图片(白名单与后端一致)+ 文件(pdf/doc/xls/txt/zip)。 */
const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip';

const MIN_CONTENT = 10;
const MAX_CONTENT = 2000;

/**
 * 反馈表单 —— 用户填写后 POST `/public/feedback`(后端公开端点)。
 * 后端 schema:{ email required, content 10-5000 字, category oneof, attachmentsKey 可选 }。
 *
 * 优化点(2026-06):品牌名走 <BrandName/>;分类用 lucide 图标(去 emoji);桌面两栏(表单 + 承诺/客服侧栏);
 * 提交成功转 inline 成功态;附件支持拖拽 + 图片点击放大;字数门槛实时提示;提交 loading spinner。
 */
type FeedbackCategory = 'bug' | 'feature' | 'other';

const CATEGORIES: Array<{ value: FeedbackCategory; label: string; hint: string; icon: LucideIcon }> = [
  { value: 'feature', label: '功能建议', hint: '改进想法 / 新功能', icon: Lightbulb },
  { value: 'bug', label: 'Bug 报告', hint: '遇到的问题 / 异常', icon: Bug },
  { value: 'other', label: '其他', hint: '投诉 / 表扬 / 咨询', icon: MessageCircle },
];

export function FeedbackPage() {
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState<FeedbackCategory>('feature');
  const [content, setContent] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadKey, setUploadKey] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [lightbox, setLightbox] = useState<UploadedAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentLen = content.trim().length;
  const contentTooShort = contentLen > 0 && contentLen < MIN_CONTENT;

  /** 选择附件(图片/文件)后立即上传 → 拿 id 暂存;提交时携 uploadKey 一并绑定。 */
  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    const curImg = attachments.filter((a) => a.type === 'image').length;
    const curFile = attachments.filter((a) => a.type === 'file').length;
    const curBytes = attachments.reduce((s, a) => s + a.size, 0);

    let newImg = 0;
    let newFile = 0;
    let newBytes = 0;
    for (const f of picked) {
      const isImg = f.type.startsWith('image/');
      if (f.size > (isImg ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) {
        toast.error(`${isImg ? '图片' : '文件'} ${f.name} 超过 10MB 限制`);
        return;
      }
      if (isImg) newImg++;
      else newFile++;
      newBytes += f.size;
    }
    if (curImg + newImg > MAX_IMAGE_COUNT) {
      toast.error(`最多上传 ${MAX_IMAGE_COUNT} 张图片`);
      return;
    }
    if (curFile + newFile > MAX_FILE_COUNT) {
      toast.error(`最多上传 ${MAX_FILE_COUNT} 个文件`);
      return;
    }
    if (curBytes + newBytes > MAX_TOTAL_BYTES) {
      toast.error('附件总大小超过 50MB 限制');
      return;
    }

    const fd = new FormData();
    if (uploadKey) fd.append('uploadKey', uploadKey);
    picked.forEach((f) => fd.append('files', f));

    setUploading(true);
    try {
      const { data } = await http.post<{
        data: { uploadKey: string; attachments: UploadedAttachment[] };
      }>('/public/feedback/upload', fd, {
        headers: { 'Content-Type' : 'multipart/form-data' },
      });
      setUploadKey(data.data.uploadKey);
      setAttachments((prev) => [...prev, ...(data.data.attachments ?? [])]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '附件上传失败');
      void toApiError(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: number) => {
    // 仅本地移除 — 后端 cleanup 任务会清理孤儿对象 (1h 内 + lifecycle 24h 兜底)
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    const mail = email.trim();
    if (!mail) {
      toast.error('请填写邮箱,方便我们回复你');
      return;
    }
    if (text.length < MIN_CONTENT) {
      toast.error(`反馈内容请至少 ${MIN_CONTENT} 个字,方便我们准确定位`);
      return;
    }
    setSubmitting(true);
    try {
      await http.post('/public/feedback', {
        email: mail,
        content: text,
        category,
        attachmentsKey: attachments.length > 0 ? uploadKey : '',
      });
      trackEvent('feedback_submit', { category });
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败,请稍后重试');
      void toApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  /** 再写一条 —— 从成功态返回空表单(保留邮箱,省得重填)。 */
  const resetForm = () => {
    setSubmitted(false);
    setContent('');
    setAttachments([]);
    setUploadKey(null);
    setCategory('feature');
  };

  // 表单页:外壳仍是 1440(hero / 面包屑与全站对齐),但表单列**刻意不铺满** ——
  // 输入框拉到 1000+ 宽会让「标签 → 输入框」的视线距离失控。1024 是表单的舒适上限。
  return (
    <HelpLayout
      breadcrumbs={[{ label: '帮助中心', to: '/help' }, { label: '产品反馈' }]}
      eyebrow="FEEDBACK"
      title="告诉我们哪里可以做得更好"
      lead={
        <>
          无论是 bug、功能建议还是吐槽,<BrandName /> 团队每一条反馈都会认真看。
        </>
      }
      contentMaxWidth="max-w-5xl"
    >
      <RouteSEO
        title="意见反馈 - Scholay | 帮助我们改进"
        description="向 Scholay 团队提交您的反馈意见、功能建议或问题报告,帮助我们持续改进学术搜索服务。"
        keywords="Scholay 反馈,意见建议,功能建议,问题报告,用户反馈,Bug 报告"
      />

      {submitted ? (
        <SuccessPanel email={email.trim()} onAgain={resetForm} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          {/* 左:表单 */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-16 border border-border-soft bg-surface-1 p-6 md:p-8"
          >
            {/* 分类 */}
            <div>
              <label className="mb-2 block text-12 font-medium text-foreground">反馈类型</label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((c) => {
                  const active = category === c.value;
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-8 border px-2 py-2.5 text-center transition-colors',
                        active
                          ? 'border-brand-red/40 bg-danger-soft'
                          : 'border-border bg-surface-card hover:border-foreground/30 hover:bg-surface-2',
                      )}
                    >
                      <Icon
                        className={cn('size-4', active ? 'text-brand-red' : 'text-subtle')}
                        strokeWidth={2}
                      />
                      <span className={cn('text-12 font-medium', active ? 'text-foreground' : 'text-subtle')}>
                        {c.label}
                      </span>
                      <span className="text-12 text-faint">{c.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 内容 */}
            <div>
              <label htmlFor="feedback-content" className="mb-2 block text-12 font-medium text-foreground">
                反馈内容 <span className="text-brand-red">*</span>
              </label>
              <Textarea
                id="feedback-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                maxLength={MAX_CONTENT}
                aria-invalid={contentTooShort}
                aria-describedby="feedback-content-hint"
                placeholder="请详细描述遇到的问题或您的建议,越具体我们越能帮上忙"
                className={cn(
                  'py-2.5 text-14 leading-paragraph',
                  contentTooShort && 'border-brand-red focus-visible:border-brand-red',
                )}
              />
              <p
                id="feedback-content-hint"
                className={cn('mt-1 text-12', contentTooShort ? 'text-brand-red' : 'text-faint')}
              >
                {contentTooShort
                  ? `还差 ${MIN_CONTENT - contentLen} 个字(至少 ${MIN_CONTENT} 字)`
                  : `${content.length}/${MAX_CONTENT} · 最少 ${MIN_CONTENT} 字`}
              </p>
            </div>

            {/* 邮箱 */}
            <div>
              <label htmlFor="feedback-email" className="mb-2 block text-12 font-medium text-foreground">
                邮箱 <span className="text-brand-red">*</span>{' '}
                <span className="font-normal text-faint">(用于回复反馈结果)</span>
              </label>
              <Input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-10 text-14"
              />
              {user?.email && email.trim() === user.email && (
                <p className="mt-1 inline-flex items-center gap-1 text-12 text-brand-green">
                  <CheckCircle2 className="size-3" />
                  已使用你的登录邮箱
                </p>
              )}
            </div>

            {/* 附件 — 拖拽或点击 */}
            <div>
              <label className="mb-2 block text-12 font-medium text-foreground">
                截图 / 文件附件{' '}
                <span className="font-normal text-faint">
                  (可选 · 图片 ≤10MB×{MAX_IMAGE_COUNT} · 文件 ≤10MB×{MAX_FILE_COUNT} · 总 ≤50MB)
                </span>
              </label>

              {attachments.length > 0 && (
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {attachments.map((a) => (
                    <div
                      key={a.id}
                      className="group relative overflow-hidden rounded-8 border border-border bg-surface-card"
                    >
                      {a.type === 'image' ? (
                        <button
                          type="button"
                          onClick={() => setLightbox(a)}
                          className="block w-full"
                          title="点击放大"
                        >
                          <img src={a.url} alt={a.name} className="h-20 w-full object-cover" />
                        </button>
                      ) : (
                        <div className="flex h-20 w-full items-center justify-center p-2 text-center text-12 text-muted-foreground">
                          {a.name}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-pill bg-foreground/70 text-on-dark opacity-0 transition-opacity hover:bg-foreground group-hover:opacity-100"
                        aria-label="移除附件"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (attachments.length < MAX_ATTACHMENTS) void handleFiles(e.dataTransfer.files);
                }}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 rounded-12 border border-dashed py-5 text-center transition-colors',
                  dragOver ? 'border-brand-green bg-brand-green/5' : 'border-border bg-surface-card',
                )}
              >
                <Paperclip className="size-4 text-faint" />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 border border-border px-3"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      上传中…
                    </>
                  ) : attachments.length >= MAX_ATTACHMENTS ? (
                    '已达上限'
                  ) : (
                    '选择文件'
                  )}
                </Button>
                <span className="text-12 text-faint">也可以把文件拖到这里</span>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              aria-busy={submitting}
              disabled={submitting || contentLen < MIN_CONTENT || !email.trim()}
              className="h-10 px-5"
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {submitting ? '提交中…' : '提交反馈'}
            </Button>
          </form>

          {/* 右:承诺 + 其他联系方式(桌面侧栏 / 移动堆叠在表单下) */}
          <aside className="space-y-6">
            <PromiseCard />
            <ContactChannels />
          </aside>
        </div>
      )}

      {/* 提交完反馈 → 引导回产品(成功态自带 CTA,这里只在表单态展示) */}
      {!submitted && (
        <div className="mt-6">
          <FeatureJumpCTA />
        </div>
      )}

      {/* 图片放大 */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          {lightbox && (
            <img src={lightbox.url} alt={lightbox.name} className="max-h-[75dvh] w-full rounded-8 object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </HelpLayout>
  );
}

/** 「我们承诺」卡(品牌信心区)。 */
function PromiseCard() {
  return (
    <section className="rounded-12 border border-border-soft bg-surface-card p-5">
      <h2 className="mb-3 inline-flex items-center gap-2 text-14 font-medium text-foreground">
        <Sparkles className="size-4 text-brand-amber" strokeWidth={2.2} />
        我们承诺
      </h2>
      <ul className="space-y-2 text-12 leading-paragraph text-subtle">
        {[
          '每一条反馈都会被产品团队看到',
          '明确的 bug 通常在 1–3 个工作日内修复',
          '功能建议会进入 backlog,采纳后单独邮件告知',
        ].map((t) => (
          <li key={t} className="flex items-start gap-2">
            <span className="mt-1.5 inline-block size-1 shrink-0 rounded-pill bg-brand-amber" />
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 提交成功 inline 态 —— 取代静默清空,给明确的完成反馈 + 下一步。 */
function SuccessPanel({ email, onAgain }: { email: string; onAgain: () => void }) {
  return (
    <div className="rounded-16 border border-border-soft bg-surface-1 p-8 text-center md:p-12">
      <span className="mx-auto inline-flex size-12 items-center justify-center rounded-pill bg-brand-green/10">
        <CheckCircle2 className="size-6 text-brand-green" strokeWidth={2.2} />
      </span>
      <h2 className="mt-4 text-16 font-medium text-foreground">感谢你的反馈!</h2>
      <p className="mx-auto mt-2 max-w-md text-12 leading-paragraph text-muted-foreground">
        <BrandName /> 团队会认真看每一条。如有结论,我们会通过{' '}
        {email ? <span className="font-medium text-subtle">{email}</span> : '你填写的邮箱'} 回复你。
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" onClick={onAgain}>
          <Send className="size-3.5" />
          再写一条
        </Button>
        <Button asChild variant="primary">
          <Link to="/search">返回产品</Link>
        </Button>
      </div>
      <div className="mt-8 text-left">
        <ContactChannels />
      </div>
    </div>
  );
}
