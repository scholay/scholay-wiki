import { useEffect, useState } from 'react';
import { Loader2, ClipboardPaste, Download, Sparkles, Check, X as XIcon, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { trackEvent } from '@/shared/lib/track';
import {
  parseRevision,
  listRevision,
  updateRevisionItem,
  fetchRevisionLetter,
  type RevisionItem,
} from '../api/prism';

/**
 * 修改意见回应工作流(V4-③)——「粘贴任何修改意见」:审稿人 decision letter / 导师批注 / 合作者意见。
 * 拆条 → 逐条(一条意见 = 一轮改稿,AI 指令预填进对话框由用户确认发出)→ 回应文本 → 导出 response letter。
 * 铁律:needs_author_input 绝不编造实验/数据;条目状态服务端持久(wizard=本地 state + 下一步 PATCH)。
 */

const ACTION_LABELS: Record<string, string> = {
  concede_revise: '采纳并修改',
  clarify: '澄清表述',
  partial: '部分采纳',
  refute: '有据答复',
  needs_author_input: '需作者补充',
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待处理', cls: 'bg-surface-2 text-subtle' },
  applied: { label: '已修改', cls: 'bg-brand-green/10 text-brand-green' },
  rejected: { label: '不采纳', cls: 'bg-surface-2 text-faint' },
  needs_author_input: { label: '待作者补充', cls: 'bg-warning-soft text-brand-amber' },
};

function buildRoundInstruction(it: RevisionItem): string {
  const action = ACTION_LABELS[it.action] || '按意见处理';
  const strategy: Record<string, string> = {
    concede_revise: '按此意见修改正文相应部分',
    clarify: '不改变结论,在正文补充澄清性表述,让该误解不再发生',
    partial: '部分采纳:采纳合理部分修改正文,其余给出理由',
    refute: '不修改正文;基于正文已有证据,拟一段礼貌、有依据的答复(含让步性补充建议)',
    needs_author_input: '',
  };
  return (
    `【修改意见回应 · 第 ${it.seq} 条${it.reviewer ? ` · ${it.reviewer}` : ''}${it.severity === 'major' ? ' · major' : ''}】\n` +
    `意见原文:\n"${it.quote.trim()}"\n` +
    (it.interpretation ? `解读:${it.interpretation}\n` : '') +
    (it.anchor ? `定位线索:${it.anchor}\n` : '') +
    `处理策略:${action} —— ${strategy[it.action] || strategy.concede_revise}。\n` +
    `要求:本轮只处理这一条意见;保持无关内容、引用与锚不动;完成后用 1-2 句总结改了哪里/答复要点(我会填进回应信)。`
  );
}

export function PrismRevisionDialog({
  projectId,
  open,
  onOpenChange,
  onPrefill,
  chatIdle,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 把该条的改稿指令预填进对话输入框(用户确认后发出 = 一条意见一轮)。 */
  onPrefill: (instr: string) => void;
  chatIdle: boolean;
}) {
  const [pasteText, setPasteText] = useState('');
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);

  // 打开时恢复既有条目(重入:条目状态在 DB,可从第 k 条续跑)。
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listRevision(projectId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, projectId]);

  const doParse = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    trackEvent('prism_revision_parse', { len: pasteText.length });
    try {
      const parsed = await parseRevision(projectId, pasteText);
      setItems(parsed);
      setPasteText('');
      toast.success(`已拆出 ${parsed.length} 条意见`);
    } catch (err) {
      toast.error(toApiError(err).message || '解析失败,请重试');
    } finally {
      setParsing(false);
    }
  };

  const patch = async (it: RevisionItem, p: Parameters<typeof updateRevisionItem>[2]) => {
    try {
      const updated = await updateRevisionItem(projectId, it.id, p);
      if (updated) setItems((xs) => xs.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      toast.error(toApiError(err).message || '保存失败');
    }
  };

  const exportLetter = async () => {
    try {
      const letter = await fetchRevisionLetter(projectId);
      const blob = new Blob([letter], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'response-letter.md';
      a.click();
      URL.revokeObjectURL(url);
      await navigator.clipboard?.writeText(letter).catch(() => {});
      toast.success('回应信已导出(并已复制到剪贴板)');
    } catch (err) {
      toast.error(toApiError(err).message || '导出失败');
    }
  };

  const done = items.filter((i) => i.status === 'applied' || i.status === 'rejected').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <ClipboardPaste className="size-4" /> 修改意见回应
            {items.length > 0 && (
              <span className="text-12 font-normal text-faint">
                {done}/{items.length} 已处理
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* 粘贴区(重新粘贴 = 重开追踪) */}
        <div className="flex gap-2">
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="粘贴任何修改意见:审稿人 decision letter / 导师批注 / 合作者意见…(重新解析会覆盖现有条目)"
            rows={3}
            className="flex-1 resize-none p-2"
          />
          <Button size="sm" onClick={doParse} disabled={parsing || !pasteText.trim()} className="self-end">
            {parsing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} 拆条
          </Button>
        </div>

        {/* 条目列表 */}
        <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-12 text-faint">
              <Loader2 className="mr-1.5 size-4 animate-spin" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-12 text-faint">
              粘贴意见并拆条后,逐条交给 AI 改稿(一条意见 = 一个额度轮),完成后导出回应信。
            </p>
          ) : (
            items.map((it) => {
              const st = STATUS_LABELS[it.status] ?? STATUS_LABELS.pending;
              return (
                <div key={it.id} className="rounded-12 border border-border p-2">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-12 font-medium text-faint">#{it.seq}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-12 text-subtle" title={it.quote}>
                        {it.quote}
                      </p>
                      {it.interpretation && <p className="mt-0.5 text-12 text-faint">{it.interpretation}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {it.severity === 'major' && (
                        <span className="rounded-pill bg-brand-red/10 px-1.5 py-0.5 text-12 text-brand-red">major</span>
                      )}
                      <span className={cn('rounded-pill px-1.5 py-0.5 text-12', st.cls)}>{st.label}</span>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Select
                      value={it.action || 'concede_revise'}
                      onChange={(e) => patch(it, { action: e.target.value })}
                      fullWidth={false}
                      className="h-6 rounded-4 pl-1 pr-6"
                    >
                      {Object.entries(ACTION_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                    {it.action !== 'needs_author_input' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-12"
                        disabled={!chatIdle}
                        onClick={() => {
                          trackEvent('prism_revision_round', { item: it.seq });
                          onPrefill(buildRoundInstruction(it));
                          onOpenChange(false);
                        }}
                      >
                        <Sparkles className="size-3" /> AI 处理此条
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-12 text-brand-amber">
                        <HelpCircle className="size-3" /> 需要你补充材料/数据 —— AI 不代编
                      </span>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-12" onClick={() => patch(it, { status: 'applied' })}>
                      <Check className="size-3" /> 标记已改
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-12 text-faint" onClick={() => patch(it, { status: 'rejected' })}>
                      <XIcon className="size-3" /> 不采纳
                    </Button>
                  </div>
                  <Textarea
                    defaultValue={it.response}
                    key={`resp-${it.id}-${it.response.length}`}
                    placeholder="该条的回应文本(会渲染进回应信;AI 处理后把它的总结粘进来)…"
                    rows={1}
                    onBlur={(e) => {
                      if (e.target.value !== it.response) patch(it, { response: e.target.value });
                    }}
                    className="mt-1.5 min-h-0 rounded-4 bg-surface-1 p-1.5"
                  />
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-12 text-faint">铁律:major 条目别跳确认;缺数据的条目 AI 不代编。</p>
            <Button size="sm" variant="outline" onClick={exportLetter}>
              <Download className="size-3.5" /> 导出回应信
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
PrismRevisionDialog.displayName = 'PrismRevisionDialog';
