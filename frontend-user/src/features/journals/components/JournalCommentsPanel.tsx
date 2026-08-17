import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import {
  addJournalComment,
  useJournalComments,
} from '../data/journal-comments';

/**
 * 期刊详情里的用户评论 —— mock 会话内可追加,刷新回种子。
 */
export function JournalCommentsPanel({ journalId }: { journalId: number }) {
  const comments = useJournalComments(journalId);
  const user = useAuthStore((s) => s.user);
  const openAuth = useAuthDialog((s) => s.openDialog);
  const [draft, setDraft] = useState('');

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    if (!user) {
      openAuth('login');
      return;
    }
    addJournalComment(
      journalId,
      user.username || user.email.split('@')[0] || '我',
      body,
    );
    setDraft('');
    toast.success('已发表评论');
  };

  return (
    <section className="space-y-3">
      <h2 className="font-display text-16 font-medium text-foreground">
        用户评论
      </h2>
      <ul className="space-y-3">
        {comments.length === 0 ? (
          <li className="text-12 text-faint">还没有评论,来写第一条。</li>
        ) : (
          comments.map((c) => (
            <li key={c.id} className="border-b border-border pb-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-12 font-medium text-foreground">
                  {c.author}
                </span>
                <span className="shrink-0 text-12 text-faint">
                  {formatWhen(c.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-14 leading-paragraph text-subtle">
                {c.body}
              </p>
            </li>
          ))
        )}
      </ul>
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={user ? '写下你对这本期刊的看法…' : '登录后可以发表评论'}
          className="w-full resize-none rounded-8 border border-border bg-background px-3 py-2 text-14 text-foreground outline-none placeholder:text-faint focus-visible:border-foreground"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={!draft.trim()}
            onClick={submit}
          >
            发表评论
          </Button>
        </div>
      </div>
    </section>
  );
}

function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const days = Math.max(0, Math.round((Date.now() - t) / 86_400_000));
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  return new Date(t).toLocaleDateString('zh-CN');
}
