import { Send, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * Claw Landing Hero 右侧 mock —— 仿 .pen Claw HeroRight:
 *   chat panel:上方对话气泡 (问 + 答含引用角标) + 下方输入框 + 文献集 chip
 */

export function ClawChatMock() {
  return (
    <div className={cn(
      'flex flex-col rounded-12 overflow-hidden bg-background border border-border',
      'shadow-[0_24px_48px_rgba(15,23,42,0.08)]'
    )}>
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-soft bg-surface-1">
        <Sparkles className="size-3.5 text-brand-amber" />
        <span className="text-xs font-semibold text-foreground">Claw · 学术对话</span>
        <span className="flex-1" />
        <span className="text-2xs text-muted-foreground">索引文献集:博士论文 · 248 篇</span>
      </div>

      {/* messages */}
      <div className="flex flex-col gap-4 p-5 bg-background min-h-[380px]">
        {/* user */}
        <div className="self-end max-w-[80%] px-4 py-3 rounded-lg bg-foreground text-background text-sm">
          帮我对比 Vaswani 与 Devlin 两篇论文在 attention 设计上的区别
        </div>

        {/* claw response */}
        <div className="self-start max-w-[88%] px-4 py-3 rounded-lg bg-surface-1 border border-border-soft">
          <div className="text-sm leading-[1.7] text-foreground">
            两篇的核心差异在<span className="font-semibold">注意力方向</span>:Vaswani 提出<span className="font-semibold">自回归 self-attention</span>
            <span className="inline-flex items-center px-1 rounded-sm bg-brand-red/10 text-brand-red text-2xs font-bold ml-0.5">[1]</span>,
            decoder 端只能看到过去 token;Devlin 则用<span className="font-semibold">双向 masked LM</span>
            <span className="inline-flex items-center px-1 rounded-sm bg-brand-red/10 text-brand-red text-2xs font-bold ml-0.5">[2]</span>,
            随机遮蔽 15% token 并让模型联合上下文重建。
          </div>
          {/* citations */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-soft text-xs text-muted-foreground">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-brand-red/10 text-brand-red text-2xs font-bold">[1]</span>
            <span className="truncate">Vaswani et al., 2017 · Attention Is All You Need · p.3</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-brand-red/10 text-brand-red text-2xs font-bold">[2]</span>
            <span className="truncate">Devlin et al., 2019 · BERT · p.4</span>
          </div>
        </div>
      </div>

      {/* input */}
      <div className="flex items-center gap-2 p-3 border-t border-border-soft bg-surface-1">
        <span className="flex-1 px-3 py-2 rounded-md bg-background border border-border-soft text-sm text-faint">
          询问你的文献集 …
        </span>
        <button
          type="button"
          aria-label="发送"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background"
        >
          <Send className="size-3.5" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
