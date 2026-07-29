import { useState } from 'react';
import {
  Bug,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Mail,
  MessageCircle,
  Send,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { RhinoSplitPane } from '@/shared/components/RhinoSplitPane';
import { http, toApiError } from '@/shared/lib/http';
import { trackEvent } from '@/shared/lib/track';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useAuthStore } from '@/stores/auth.store';

type FeedbackCategory = 'bug' | 'feature' | 'other';

const MIN_CONTENT = 10;
const MAX_CONTENT = 2000;

const CATEGORIES: Array<{
  value: FeedbackCategory;
  label: string;
  icon: LucideIcon;
}> = [
  { value: 'feature', label: '建议', icon: Lightbulb },
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'other', label: '其他', icon: MessageCircle },
];

/** 小犀牛对话框内的精简反馈表单（完整页仍在 /feedback） */
export function RhinoFeedbackBody() {
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState<FeedbackCategory>('feature');
  const [content, setContent] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const contentLen = content.trim().length;
  const contentReady = contentLen >= MIN_CONTENT;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    const mail = email.trim();
    if (!mail) {
      toast.error('请填写邮箱,方便我们回复你');
      return;
    }
    if (text.length < MIN_CONTENT) {
      toast.error(`反馈内容请至少 ${MIN_CONTENT} 个字`);
      return;
    }
    setSubmitting(true);
    try {
      await http.post('/public/feedback', {
        email: mail,
        content: text,
        category,
        attachmentsKey: '',
      });
      trackEvent('feedback_submit', { category, source: 'rhino' });
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败,请稍后重试');
      void toApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-pill bg-brand-green/12 text-brand-green">
          <CheckCircle2 className="size-6" strokeWidth={1.75} />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">已收到你的反馈</p>
          <p className="text-2xs leading-relaxed text-muted-foreground">
            有进展会联系{' '}
            <span className="font-medium text-foreground">
              {email.trim() || '你'}
            </span>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => {
            setSubmitted(false);
            setContent('');
          }}
        >
          再写一条
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="h-full min-h-0">
      <RhinoSplitPane
        menu={CATEGORIES.map((c) => ({
          id: c.value,
          label: c.label,
          icon: c.icon,
        }))}
        activeId={category}
        onSelect={(id) => setCategory(id as FeedbackCategory)}
        footer={
          <div className="border-t border-border/70 p-2.5">
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="w-full gap-1.5"
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" strokeWidth={2} />
              )}
              提交反馈
            </Button>
          </div>
        }
      >
        <div className="h-full min-h-0 space-y-3 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
          <p className="text-2xs leading-relaxed text-muted-foreground">
            说说想法或问题，我们会认真看每一条。
          </p>

          <label className="block space-y-1.5">
            <span className="text-2xs font-semibold text-foreground">内容</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
              placeholder="遇到的问题、改进想法，写清楚一点更好…"
              rows={5}
              className={cn(
                'min-h-28 w-full resize-none rounded-lg border border-border/80 bg-muted/30 px-2.5 py-2',
                'text-xs leading-relaxed text-foreground outline-none transition-colors',
                'placeholder:text-faint',
                'focus-visible:border-border focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/30',
              )}
            />
            <span className="flex items-center justify-between text-2xs">
              <span
                className={cn(
                  contentLen === 0
                    ? 'text-muted-foreground'
                    : contentReady
                      ? 'text-brand-green'
                      : 'text-brand-amber',
                )}
              >
                {contentLen === 0
                  ? `至少 ${MIN_CONTENT} 字`
                  : contentReady
                    ? '可以提交'
                    : `还差 ${MIN_CONTENT - contentLen} 字`}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {contentLen}/{MAX_CONTENT}
              </span>
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-2xs font-semibold text-foreground">
              回复邮箱
            </span>
            <span className="relative block">
              <Mail
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
                strokeWidth={2}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className={cn(
                  'h-9 w-full rounded-lg border border-border/80 bg-muted/30 py-0 pl-8 pr-2.5',
                  'text-xs text-foreground outline-none transition-colors',
                  'placeholder:text-faint',
                  'focus-visible:border-border focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/30',
                )}
              />
            </span>
          </label>
        </div>
      </RhinoSplitPane>
    </form>
  );
}
