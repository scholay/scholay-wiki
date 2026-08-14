import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatDurationSec } from './tool-semantics';

/**
 * 「处理过程」可收起容器(prism 发源;2026-07 P0 起 claw 也接入,admin 会话监控渲染
 * prism transcript 复用):流式中默认展开(让用户实时看到工具步骤),完成后默认收起成
 * 一行「处理过程 · N 步 [summary] [· 用时 Xs]」标题。用户可点标题手动 override 展开/收起。
 *
 * - `summary`:调用方追加的标题区摘要(claw / admin claw 镜像现在只传「N 次未成功」)。
 *   🔴 **不要往这里放检索次数 / 命中篇数**:那类计数 2026-08 已从 chat-turn-layout 删除 ——
 *   前端数 blocks 的口径与执行器 `research_state` 的引擎口径必然不等,同屏并排即自相矛盾。
 *   取证类计数只有一个出处:ResearchStateChip(见其头注释第 ④ 条)。
 * - 用时:组件本地计时(mount 时若 streaming 记起点,streaming→false 冻结;≥3s 才显示)。
 *   历史回放 streaming 恒 false → 无计时、天然降级;刷新/重入进行中轮 → 从本端观察起点计。
 *   (status.elapsed 协议槽位执行器当前从未下发,故用本地口径,与 ThinkingFold 同款。)
 */
export function ProcessFold({
  streaming,
  toolSteps,
  summary,
  children,
}: {
  streaming: boolean;
  toolSteps: number;
  /** 标题区追加的摘要节点(可选;faint 小字,由调用方自带样式)。 */
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [override, setOverride] = useState<boolean | undefined>(undefined);
  const expanded = override ?? streaming;

  // 「展开过才挂载」(2026-07 审查 finding):children 里是全量 markdown/KaTeX 叙述 + 工具 chip,
  // 历史回放/管理端监控一次挂几十轮,若无条件挂载再 hidden,打开即付全量渲染成本(改造前是
  // 卸载,零成本)。故:从未展开 → 不挂载;展开过 → 保持挂载 + hidden 切换(保住用户展开态)。
  const [everOpened, setEverOpened] = useState(expanded);
  useEffect(() => {
    if (expanded) setEverOpened(true);
  }, [expanded]);

  // 本地用时:streaming 期间记起点,结束时冻结一次。
  const startRef = useRef<number | null>(null);
  const [doneSec, setDoneSec] = useState<number | null>(null);
  useEffect(() => {
    if (streaming) {
      if (startRef.current === null) startRef.current = Date.now();
      return;
    }
    if (startRef.current !== null && doneSec === null) {
      setDoneSec(Math.max(0, Math.round((Date.now() - startRef.current) / 1000)));
    }
  }, [streaming, doneSec]);

  return (
    <div className="rounded-12 border border-border-soft bg-surface-1/60 min-w-0">
      <button
        type="button"
        onClick={() => setOverride(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-12 text-muted-foreground transition-colors hover:text-foreground min-w-0"
      >
        {streaming ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-brand-green" />
        ) : (
          <Sparkles className="size-3 shrink-0 text-brand-green" />
        )}
        <span className="font-medium shrink-0">
          处理过程{toolSteps > 0 ? ` · ${toolSteps} 步` : ''}
        </span>
        {summary}
        {doneSec !== null && doneSec >= 3 && (
          <span className="text-faint shrink-0">· 用时 {formatDurationSec(doneSec)}</span>
        )}
        <ChevronRight
          className={cn('ml-auto size-3 shrink-0 transition-transform', expanded && 'rotate-90')}
        />
      </button>
      {/* 展开过之后收起 = hidden 而非卸载:保住用户流式期点开的 chip 展开态 / 错误详情
          阅读态(卸载会在重新展开时全部回到收起,对抗审查 finding #7)。 */}
      {everOpened && (
        <div className={cn('flex flex-col gap-2 px-2.5 pb-2.5', !expanded && 'hidden')}>
          {children}
        </div>
      )}
    </div>
  );
}
