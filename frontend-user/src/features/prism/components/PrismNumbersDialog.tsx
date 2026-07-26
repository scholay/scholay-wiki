import { useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { verifyNumbers, type NumberCheck } from '../api/prism';

/**
 * 数字成员校验(V4-⑤ 轻版)—— 确定性检查:生成段落里的每个数字是否真的来自源数据
 * (千分位归一;文献年份豁免)。红 = 不在源表(可能编造/改写);派生值(百分比变化/合计)请自行核对。
 */
export function PrismNumbersDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [checks, setChecks] = useState<NumberCheck[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!source.trim() || !text.trim()) return;
    setLoading(true);
    try {
      setChecks(await verifyNumbers(projectId, source, text));
    } catch (err) {
      toast.error(toApiError(err).message || '校验失败');
    } finally {
      setLoading(false);
    }
  };

  const bad = (checks ?? []).filter((c) => !c.found);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Calculator className="size-4" /> 数字校验(生成段 ⊆ 源数据)
          </DialogTitle>
        </DialogHeader>

        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={4}
          placeholder="源数据:粘贴数据表 / 统计输出(CSV/TSV/文本)…"
          className="w-full resize-y rounded-8 border border-border bg-surface-1 p-2 font-mono text-12 outline-none placeholder:text-faint"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="生成的段落:粘贴 AI 写的结果段…"
          className="w-full resize-y rounded-8 border border-border p-2 text-12 outline-none placeholder:text-faint"
        />
        <div className="flex items-center justify-between">
          <p className="text-12 text-faint">派生值(百分比变化/差值/合计)不在源表属正常,但请自行核对。</p>
          <Button size="sm" onClick={run} disabled={loading || !source.trim() || !text.trim()}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : null} 校验
          </Button>
        </div>

        {checks && (
          <div className="space-y-1.5">
            {bad.length > 0 ? (
              <p className="text-12 text-brand-red">{bad.length} 个数字在源数据中找不到(红色)—— 逐一核对,勿让编造数字进正文:</p>
            ) : (
              <p className="text-12 text-brand-green">全部数字都能在源数据中找到。</p>
            )}
            <div className="flex flex-wrap gap-1">
              {checks.map((c, i) => (
                <span
                  key={i}
                  className={cn(
                    'rounded-4 px-1.5 py-0.5 font-mono text-12',
                    c.found ? 'bg-brand-green/10 text-brand-green' : 'bg-danger-soft text-brand-red',
                  )}
                >
                  {c.number}
                </span>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
PrismNumbersDialog.displayName = 'PrismNumbersDialog';
