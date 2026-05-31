import { useRef, useState } from 'react';
import { ImagePlus, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { HelpLayout } from '../components/HelpLayout';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';
import { Button } from '@/shared/ui/button';

/** 单个已上传附件 (后端 /public/feedback/upload 返回项形态) */
interface UploadedAttachment {
  id: number;
  name: string;
  url: string;   // /api/v1/public/feedback/attachment/<id>
  size: number;
  type: 'image' | 'file';
}

/** 限制对齐后端 handler.go const (MaxImageBytes / MaxImageCount) */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;

/**
 * 反馈表单 —— 用户填写后 POST `/public/feedback`(后端公开端点)。
 *
 * 后端 schema(internal/feedback/handler.go `CreateFeedbackRequestWithKey`):
 *   { email: required email, content: required 10-5000 字, category: 可选,
 *     oneof bug/feature/complaint/praise/other, attachmentsKey: 可选 }
 *
 * 之前这里发的是 `{kind, content, contact}` —— email 缺失会被后端 400 binding 报错,
 * 一直在线但提交必跪。修复:
 *   - 加 email 输入(必填,登录态预填 auth user email)
 *   - kind → category(语义对齐 admin 列表的"分类"列,真实落库)
 *   - 删 contact(后端无对应字段,且 email 已能联系)
 */
type FeedbackCategory = 'bug' | 'feature' | 'other';

export function FeedbackPage() {
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState<FeedbackCategory>('feature');
  const [content, setContent] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadKey, setUploadKey] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 选择图片后立即上传 → 拿到附件 id, 暂存; 提交反馈时携 uploadKey 一并绑定 */
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const overSize = Array.from(files).find((f) => f.size > MAX_IMAGE_BYTES);
    if (overSize) {
      toast.error(`图片 ${overSize.name} 超过 10MB 限制`);
      return;
    }
    if (attachments.length + files.length > MAX_IMAGE_COUNT) {
      toast.error(`最多上传 ${MAX_IMAGE_COUNT} 张图片`);
      return;
    }

    const fd = new FormData();
    if (uploadKey) fd.append('uploadKey', uploadKey);
    Array.from(files).forEach((f) => fd.append('files', f));

    setUploading(true);
    try {
      const { data } = await http.post<{
        data: { uploadKey: string; attachments: UploadedAttachment[] };
      }>('/public/feedback/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
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
    if (text.length < 10) {
      toast.error('反馈内容请至少 10 个字,方便我们准确定位');
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
      toast.success('感谢反馈!我们会认真看每一条');
      setContent('');
      setAttachments([]);
      setUploadKey(null);
      // email 保留 —— 同一会话再提交一次不用重新填
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : '提交失败,请稍后重试'
      );
      void toApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HelpLayout
      breadcrumbs={[{ label: '帮助中心', to: '/help' }, { label: '产品反馈' }]}
      eyebrow="FEEDBACK"
      title="告诉我们哪里可以做得更好"
      lead="无论是 bug、功能建议还是吐槽,每一条反馈我们都会认真看。"
    >
      <RouteSEO
        title="意见反馈 - Scholay | 帮助我们改进"
        description="向 Scholay 团队提交您的反馈意见、功能建议或问题报告,帮助我们持续改进学术搜索服务。"
        keywords="Scholay 反馈,意见建议,功能建议,问题报告,用户反馈,Bug 报告"
      />
      {/* 表单卡 —— 用 surface-1 软底 + border 把表单视觉收成一块,与 hero 区隔
         避免 hero 下面直接是裸字段的"无边界"观感 */}
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-lg bg-surface-1 border border-border-soft p-6 md:p-8"
      >
        <div>
          <label className="block text-xs font-bold text-foreground mb-2">
            反馈类型
          </label>
          <div className="inline-flex items-center gap-1 p-0.5 rounded-md bg-surface-2">
            {(
              [
                { value: 'feature', label: '✨ 功能建议' },
                { value: 'bug', label: '🐛 Bug 报告' },
                { value: 'other', label: '💬 其他' },
              ] as Array<{ value: FeedbackCategory; label: string }>
            ).map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setCategory(k.value)}
                className={
                  category === k.value
                    ? 'inline-flex items-center h-8 px-3 rounded-sm bg-background text-foreground text-xs font-bold shadow-sm'
                    : 'inline-flex items-center h-8 px-3 rounded-sm text-muted-foreground text-xs hover:text-foreground transition-colors'
                }
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="feedback-content"
            className="block text-xs font-bold text-foreground mb-2"
          >
            反馈内容 <span className="text-brand-red">*</span>
          </label>
          <textarea
            id="feedback-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="请详细描述遇到的问题或您的建议(至少 10 字,最多 2000 字)"
            className="w-full px-3 py-2.5 rounded-sm border border-border bg-background text-sm leading-relaxed resize-y focus:outline-none focus:border-foreground focus:ring-2 focus:ring-ring/20"
          />
          <p className="mt-1 text-2xs text-faint">{content.length}/2000</p>
        </div>

        <div>
          <label
            htmlFor="feedback-email"
            className="block text-xs font-bold text-foreground mb-2"
          >
            邮箱 <span className="text-brand-red">*</span>{' '}
            <span className="text-faint font-normal">(用于回复反馈结果)</span>
          </label>
          <input
            id="feedback-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full h-10 px-3 rounded-sm border border-border bg-background text-sm focus:outline-none focus:border-foreground focus:ring-2 focus:ring-ring/20"
          />
        </div>

        {/* 图片附件 — 复制 bug / 截图反馈时用 */}
        <div>
          <label className="block text-xs font-bold text-foreground mb-2">
            截图附件 <span className="text-faint font-normal">(可选, 最多 {MAX_IMAGE_COUNT} 张, 每张 ≤ 10MB)</span>
          </label>

          {attachments.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="relative group rounded-sm border border-border bg-background overflow-hidden"
                >
                  {a.type === 'image' ? (
                    <img
                      src={a.url}
                      alt={a.name}
                      className="w-full h-20 object-cover"
                    />
                  ) : (
                    <div className="w-full h-20 flex items-center justify-center text-2xs text-muted-foreground p-2 text-center">
                      {a.name}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="absolute top-1 right-1 inline-flex items-center justify-center size-5 rounded-full bg-foreground/70 text-background opacity-0 group-hover:opacity-100 transition-opacity hover:bg-foreground"
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
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={uploading || attachments.length >= MAX_IMAGE_COUNT}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 h-8 px-3 border border-border"
          >
            <ImagePlus className="size-3.5" />
            {uploading ? '上传中…' : '添加图片'}
          </Button>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={submitting || content.trim().length < 10 || !email.trim()}
          className="inline-flex items-center gap-2 h-10 px-5"
        >
          <Send className="size-3.5" />
          {submitting ? '提交中…' : '提交反馈'}
        </Button>
      </form>

      {/* 承诺区 —— 与表单卡平级,视觉成对(都是软底卡),区分提交动作 vs 信息读取 */}
      <div className="mt-6 rounded-lg bg-background border border-border-soft p-6 md:p-8">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground mb-3">
          <Sparkles className="size-4 text-brand-amber" strokeWidth={2.2} />
          我们承诺
        </h2>
        <ul className="space-y-2 text-sm text-subtle leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="text-brand-amber mt-1.5 inline-block size-1 rounded-full bg-current shrink-0" />
            每一条反馈都会被产品团队看到
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-amber mt-1.5 inline-block size-1 rounded-full bg-current shrink-0" />
            明确的 bug 通常在 1-3 个工作日内修复
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-amber mt-1.5 inline-block size-1 rounded-full bg-current shrink-0" />
            功能建议会进入产品 backlog,采纳后会单独邮件告知
          </li>
        </ul>
      </div>

      {/* 提交完反馈 → 引导回产品 */}
      <div className="mt-6">
        <FeatureJumpCTA />
      </div>
    </HelpLayout>
  );
}
