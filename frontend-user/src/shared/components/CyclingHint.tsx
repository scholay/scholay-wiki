import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * CyclingHint —— 循环打字机式等待提示(业务无关)。
 *
 * 给一组预设文案,组件会逐字"流式"打出当前这条,停顿,再切到下一条,**循环不息**
 * (类似 Claude Code 的 "Manifesting…" 那种动态等待词)。用于减弱长时间等待的焦虑:
 * 比起一个静态的"加载中…"或一个会让人盯着的计数器,不断变化的相关文案更"活"、不像卡死。
 *
 * 纯展示、零业务依赖,可在任何等待场景复用(传入与该场景相关的 phrases 即可)。
 *
 * @param phrases  预设文案池(顺序循环);为空则不渲染。
 * @param typeMs   每字打出的间隔(ms),默认 45。
 * @param holdMs   一条打完后停顿多久再切下一条(ms),默认 1500。
 */
export interface CyclingHintProps {
  phrases: string[];
  className?: string;
  typeMs?: number;
  holdMs?: number;
}

export function CyclingHint({ phrases, className, typeMs = 45, holdMs = 1500 }: CyclingHintProps) {
  const [idx, setIdx] = useState(0); // 当前第几条
  const [len, setLen] = useState(0); // 已打出的字数

  // phrases 每次父组件重渲染都可能是新数组引用(如 StreamingIndicator 每秒 tick 传 [text, ...] 新字面量),
  // 直接放进 effect 依赖会让打字/停顿计时器每秒被清空重排 → 永远停在第一条、不轮换(审计 [23])。
  // 改用内容键:内容不变则引用变化不重跑 effect,1500ms 停顿计时器得以真正 fire。
  const phrasesKey = phrases.join('\n');

  useEffect(() => {
    if (phrases.length === 0) return;
    const phrase = phrases[idx % phrases.length];
    if (len < phrase.length) {
      const t = setTimeout(() => setLen((n) => n + 1), typeMs);
      return () => clearTimeout(t);
    }
    // 这条打完 → 停顿 → 切下一条(从头打)
    const t = setTimeout(() => {
      setIdx((i) => (i + 1) % phrases.length);
      setLen(0);
    }, holdMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意用 phrasesKey 代替 phrases 引用(见上注释)
  }, [idx, len, phrasesKey, typeMs, holdMs]);

  if (phrases.length === 0) return null;
  const phrase = phrases[idx % phrases.length];

  return (
    <span className={cn('inline-flex items-baseline', className)}>
      <span>{phrase.slice(0, len)}</span>
      {/* 流式光标 */}
      <span className="ml-0.5 inline-block h-[1em] w-px shrink-0 animate-pulse self-center bg-current" aria-hidden="true" />
    </span>
  );
}

CyclingHint.displayName = 'CyclingHint';
