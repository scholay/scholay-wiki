import { useEffect, useState } from 'react';
import { Languages, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { toApiError } from '@/shared/lib/http';
import { trackEvent } from '@/shared/lib/track';
import { getTerminology, putTerminology } from '../api/prism';

/**
 * 中英双语工作流向导(V4-④,降级版)—— 两遍纪律的用户在环编排:
 *   第一步:逐节忠实直译(每轮一节;terminology.md 为 soft constraint,agent 首译回填);
 *   第二步:全部直译 apply 后【开新对话】—— 单语润色必须在“只见译文”的干净上下文里做(去翻译腔的前提);
 *          多对话:开新对话即得干净上下文,同一篇论文继续(每轮 prepare 铺源注入当前译文);
 *   第三步:逐批单语润色。
 * 术语表:DB 真源,轮前物化 cwd;这里可直接编辑(下一轮生效)。
 */
export function PrismTranslateDialog({
  projectId,
  open,
  onOpenChange,
  onPrefill,
  onResetSession,
  chatIdle,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrefill: (instr: string) => void;
  onResetSession: () => Promise<void> | void;
  chatIdle: boolean;
}) {
  const [term, setTerm] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    getTerminology(projectId)
      .then((t) => setTerm(t))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [open, projectId]);

  const saveTerm = async () => {
    setSaving(true);
    try {
      await putTerminology(projectId, term);
      toast.success('术语表已保存(下一轮生效)');
    } catch (err) {
      toast.error(toApiError(err).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const step = (key: string, instr: string) => {
    trackEvent('prism_translate_step', { step: key });
    onPrefill(instr);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Languages className="size-4" /> 整篇翻译(两遍纪律)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-12 text-subtle">
          <div className="rounded-12 border border-border p-2.5">
            <p className="text-14 font-medium text-foreground">第一步 · 逐节忠实直译</p>
            <p className="mt-0.5 text-12 text-muted-foreground">
              一轮一节;数字/单位/引用键逐字保真;首译术语会写回术语表。每节译完在 diff 里确认应用,再译下一节。
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-1.5 h-7 text-12"
              disabled={!chatIdle}
              onClick={() =>
                step(
                  'literal',
                  '请把《__节名__》忠实直译成英文(第一遍只求信:不增删信息、数字/单位/引用键逐字保真;术语按 terminology.md,首译术语写回该表)。本轮只译这一节。',
                )
              }
            >
              <Sparkles className="size-3" /> 直译下一节
            </Button>
          </div>

          <div className="rounded-12 border border-border p-2.5">
            <p className="text-14 font-medium text-foreground">第二步 · 开新对话(关键)</p>
            <p className="mt-0.5 text-12 text-muted-foreground">
              全部直译并应用后开一条新对话:润色必须在「只见译文」的干净上下文里做,否则中文原文一直在历史里,翻译腔磨不掉。同一篇论文继续写,文稿/术语表不丢。
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-1.5 h-7 text-12"
              disabled={!chatIdle}
              onClick={async () => {
                await onResetSession();
                toast.success('已开新对话 —— 现在开始第三步单语润色');
              }}
            >
              <RotateCcw className="size-3" /> 开新对话
            </Button>
          </div>

          <div className="rounded-12 border border-border p-2.5">
            <p className="text-14 font-medium text-foreground">第三步 · 逐批单语润色</p>
            <p className="mt-0.5 text-12 text-muted-foreground">只读译文去翻译腔(拆长句/补主语/时态惯例);只改表达不改事实。</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-1.5 h-7 text-12"
              disabled={!chatIdle}
              onClick={() =>
                step(
                  'polish',
                  '请对英文稿做单语润色去翻译腔(拆中式长句/补全主语/时态按学术惯例/被动与 we 全文统一);只改表达绝不改事实、数字与引用。按节分批:本轮只润前两节,完成后停下等我确认。',
                )
              }
            >
              <Sparkles className="size-3" /> 开始润色前两节
            </Button>
          </div>
        </div>

        {/* 术语表(soft constraint;直接编辑,下一轮生效) */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-12 font-medium text-faint">项目术语表(原文 | 译文,每行一条;agent 翻译时遵从并回填)</p>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-12" onClick={saveTerm} disabled={saving || !loaded}>
              {saving ? <Loader2 className="size-3 animate-spin" /> : null} 保存
            </Button>
          </div>
          <textarea
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            rows={5}
            placeholder={'| 原文 | 译文 | 备注 |\n| --- | --- | --- |\n| 注意力机制 | attention mechanism | |'}
            className="w-full resize-y rounded-8 border border-border bg-surface-1 p-2 font-mono text-12 outline-none placeholder:text-faint"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
PrismTranslateDialog.displayName = 'PrismTranslateDialog';
