/**
 * QuestionPrompt —— agent 交互式提问(AskUserQuestion)的**输入框上方分步面板**。
 *
 * 方案 B(见 docs/research/ask-mode-2026-07)+ 交互修订:agent 通过内建工具 AskUserQuestion 发出
 * 结构化问题后,不再在对话流里塞一整张大表格,而是把问题浮到输入框上方**一题一题呈现**:
 *   - 单选:点选项即自动进入下一题;答完最后一题**自动提交**(组装成一条普通 user 消息回传)。
 *   - 多选 / 自由输入:选/填后点「下一步 / 发送」推进。
 * 提交后新一轮开启、pending 问题消失,面板自动收起。天然耐断连/多端(无挂起状态);历史回放里
 * 该问题不再单独渲染,用户的答案气泡即上下文。
 *
 * 业务无关:只吃 ToolBlock + onSubmit 回调,不感知具体 feature。
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, CornerDownLeft, MessageCircleQuestion, Pencil } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { ToolBlock, Turn } from '@/shared/types/chat';

interface AskOption {
  label: string;
  description?: string;
}
interface AskQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: AskOption[];
}

/** 从 tool_use.input 安全解析 questions。容忍对象或 JSON 字符串;形状不合法返回 []。 */
export function parseAskQuestions(input: unknown): AskQuestion[] {
  let obj: unknown = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch {
      return [];
    }
  }
  if (!obj || typeof obj !== 'object') return [];
  const raw = (obj as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) return [];
  const out: AskQuestion[] = [];
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue;
    const qq = q as Record<string, unknown>;
    const question = typeof qq.question === 'string' ? qq.question : '';
    const opts = Array.isArray(qq.options) ? qq.options : [];
    const options: AskOption[] = [];
    for (const o of opts) {
      if (!o || typeof o !== 'object') continue;
      const label = (o as Record<string, unknown>).label;
      if (typeof label !== 'string' || !label) continue;
      const description = (o as Record<string, unknown>).description;
      options.push({ label, description: typeof description === 'string' ? description : undefined });
    }
    if (!question || options.length === 0) continue;
    out.push({
      question,
      header: typeof qq.header === 'string' ? qq.header : undefined,
      multiSelect: qq.multiSelect === true,
      options,
    });
  }
  return out;
}

/**
 * 找出「当前待作答」的 AskUserQuestion 块:仅当它在**最新一轮**、该轮已完成且未被打断时返回。
 * 用户一旦回答(新一轮出现)→ 最新轮改变 → 返回 null,面板自动消失。
 */
export function findPendingQuestionBlock(turns: Turn[]): ToolBlock | null {
  if (turns.length === 0) return null;
  const last = turns[turns.length - 1];
  if (!last.complete || last.paused || last.blocked || last.errorMessage) return null;
  for (let i = last.blocks.length - 1; i >= 0; i--) {
    const b = last.blocks[i];
    if (b.kind === 'tool' && b.toolName === 'AskUserQuestion') return b;
  }
  return null;
}

function composeAnswers(questions: AskQuestion[], answers: string[]): string {
  if (questions.length === 1) return answers[0] ?? '';
  return questions
    .map((q, i) => `关于「${q.header || q.question}」:${answers[i] ?? ''}`)
    .join('\n');
}

export interface QuestionPromptProps {
  /** toolName === 'AskUserQuestion' 的工具块;input = { questions }。 */
  block: ToolBlock;
  /** 全部问题答完 → 组装好的可读文本作为普通 user 消息回传。 */
  onSubmit: (text: string) => void;
}

export function QuestionPrompt({ block, onSubmit }: QuestionPromptProps) {
  const questions = useMemo(() => parseAskQuestions(block.input), [block.input]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [done, setDone] = useState(false);

  if (questions.length === 0) return null;

  const q = questions[idx];
  const isLast = idx === questions.length - 1;
  const total = questions.length;

  const advance = (answer: string) => {
    const next = [...answers];
    next[idx] = answer;
    setAnswers(next);
    setMultiSel([]);
    setFreeOpen(false);
    setFreeText('');
    if (isLast) {
      setDone(true);
      onSubmit(composeAnswers(questions, next));
    } else {
      setIdx(idx + 1);
    }
  };

  const pickSingle = (label: string) => advance(label);
  const toggleMulti = (label: string) =>
    setMultiSel((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  const commitMulti = () => {
    if (multiSel.length === 0) return;
    advance(multiSel.join('、'));
  };
  const commitFree = () => {
    const t = freeText.trim();
    if (!t) return;
    advance(t);
  };
  const back = () => {
    if (idx === 0) return;
    setMultiSel([]);
    setFreeOpen(false);
    setFreeText('');
    setIdx(idx - 1);
  };

  if (done) {
    return (
      <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-brand-green" />
        已提交,继续为你处理…
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-lg border border-border bg-background overflow-hidden">
      {/* 头部:进度 + 返回 */}
      <div className="flex items-center gap-1.5 px-3.5 py-2 border-b border-border-soft">
        <MessageCircleQuestion className="h-3.5 w-3.5 text-brand-green shrink-0" />
        <span className="text-xs font-medium text-subtle">需要你选择</span>
        {total > 1 && (
          <span className="ml-auto text-2xs text-faint tabular-nums">
            {idx + 1} / {total}
          </span>
        )}
        {idx > 0 && (
          <button
            type="button"
            onClick={back}
            className={cn(
              'inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors',
              total > 1 ? 'ml-2' : 'ml-auto',
            )}
          >
            <ArrowLeft className="h-3 w-3" />
            上一题
          </button>
        )}
      </div>

      <div className="max-h-[42vh] overflow-y-auto px-3.5 py-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="flex flex-col gap-2 min-w-0"
          >
            <div className="text-sm text-foreground">{q.question}</div>

            <div className="flex flex-col gap-1.5">
              {q.options.map((opt, oi) => {
                const active = q.multiSelect ? multiSel.includes(opt.label) : false;
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() =>
                      q.multiSelect ? toggleMulti(opt.label) : pickSingle(opt.label)
                    }
                    className={cn(
                      'flex items-start gap-2 w-full text-left rounded-md border px-3 py-2 transition-colors',
                      active
                        ? 'border-brand-green bg-brand-green/5'
                        : 'border-border bg-background hover:bg-surface-2',
                    )}
                  >
                    {q.multiSelect && (
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                          active
                            ? 'border-brand-green bg-brand-green text-background'
                            : 'border-border-button',
                        )}
                      >
                        {active && <Check className="h-3 w-3" />}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-foreground">{opt.label}</span>
                      {opt.description && (
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {opt.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}

              {/* 自由输入 */}
              {!freeOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setMultiSel([]);
                    setFreeOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-1"
                >
                  <Pencil className="h-3 w-3" />
                  自己输入
                </button>
              ) : (
                <div className="flex items-end gap-1.5">
                  <textarea
                    autoFocus
                    rows={2}
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        commitFree();
                      }
                    }}
                    placeholder="输入你的回答…"
                    className="flex-1 min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-faint resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={commitFree}
                    disabled={!freeText.trim()}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                    aria-label={isLast ? '发送' : '下一题'}
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* 多选需要显式确认(单选点即走,故无按钮) */}
            {q.multiSelect && !freeOpen && (
              <button
                type="button"
                onClick={commitMulti}
                disabled={multiSel.length === 0}
                className="mt-1 inline-flex h-8 items-center justify-center gap-1.5 self-end rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {isLast ? '完成并发送' : '下一题'}
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
