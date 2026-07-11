import { useState } from 'react';
import { Loader2, MessageSquareText, Lightbulb, Search, Gavel } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { inlineReview } from '../api/prism';

/**
 * 快通道评议(V3-4.5-1)—— 对选中文字做**只读**点评(解释/找漏洞/审稿人视角)。
 * 结果只在弹层显示,**绝不改正文**(零 accept 流程、零风险);走廉价 ModelLow 单次补全,不进 agent 会话。
 */
const MODES = [
  { key: 'explain', label: '解释这段', icon: Lightbulb, hint: '用通俗的话讲清核心论点' },
  { key: 'critique', label: '找论证漏洞', icon: Search, hint: '未支撑的跳步 / 可被攻击处' },
  { key: 'reviewer', label: '审稿人视角', icon: Gavel, hint: '挑剔审稿人会怎么质疑' },
] as const;

export function PrismReviewDialog({
  projectId,
  open,
  onOpenChange,
  selection,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: string;
}) {
  const [mode, setMode] = useState<string>('critique');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [err, setErr] = useState('');

  const run = async (m: string) => {
    setMode(m);
    setLoading(true);
    setResult('');
    setErr('');
    try {
      const text = await inlineReview(projectId, m, selection);
      setResult(text);
    } catch (e) {
      setErr(toApiError(e).message || '点评失败,请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <MessageSquareText className="size-4" /> AI 点评(只读,不改正文)
          </DialogTitle>
        </DialogHeader>

        {/* 选中的原文预览 */}
        <div className="max-h-24 overflow-y-auto rounded-md bg-surface-1 px-3 py-2 text-2xs text-muted-foreground">
          {selection}
        </div>

        {/* 三档动作 */}
        <div className="flex gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              disabled={loading}
              onClick={() => run(m.key)}
              title={m.hint}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 text-2xs transition-colors disabled:opacity-50',
                mode === m.key ? 'border-brand-green/50 bg-brand-green/10 text-foreground' : 'border-border hover:bg-surface-2',
              )}
            >
              <m.icon className="size-3.5" />
              {m.label}
            </button>
          ))}
        </div>

        {/* 结果 */}
        <div className="min-h-24 rounded-md border border-border px-3 py-2 text-xs">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-faint">
              <Loader2 className="mr-1.5 size-4 animate-spin" /> 点评中…
            </div>
          ) : err ? (
            <p className="text-brand-red">{err}</p>
          ) : result ? (
            <p className="whitespace-pre-wrap leading-relaxed text-subtle">{result}</p>
          ) : (
            <p className="py-6 text-center text-faint">选一种点评方式(消耗少量额度)。结果仅供参考,不会改动你的正文。</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
PrismReviewDialog.displayName = 'PrismReviewDialog';
