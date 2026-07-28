import { Send, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * Claw Landing Hero 右侧 mock —— 仿 .pen Claw HeroRight:
 *   chat panel:上方对话气泡 (问 + 答含引用角标) + 下方输入框 + 文件夹 chip
 */

export function ClawChatMock() {
  return (
    <div className={cn(
      'flex flex-col rounded-12 overflow-hidden bg-surface-card border border-border',
      'shadow-overlay'
    )}>
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-soft bg-surface-1">
        <Sparkles className="size-3.5 text-brand-amber" />
        <span className="text-12 font-medium text-foreground">Claw · 学术对话</span>
        <span className="flex-1" />
        <span className="text-12 text-muted-foreground">索引文件夹:博士论文 · 248 篇</span>
      </div>

      {/* messages */}
      <div className="flex flex-col gap-4 p-5 bg-surface-card min-h-[380px]">
        {/* user */}
        <div className="self-end max-w-[80%] px-4 py-3 rounded-8 bg-foreground text-on-dark text-12">
          帮我对比 Vaswani 与 Devlin 两篇论文在 attention 设计上的区别
        </div>

        {/* claw response */}
        <div className="self-start max-w-[88%] px-4 py-3 rounded-8 bg-surface-1 border border-border-soft">
          <div className="text-12 leading-paragraph text-foreground">
            两篇的核心差异在<span className="font-medium">注意力方向</span>:Vaswani 提出<span className="font-medium">自回归 self-attention</span>
            <span className="inline-flex items-center px-1 rounded-4 bg-brand-red/10 text-brand-red text-12 font-medium ml-0.5">[1]</span>,
            decoder 端只能看到过去 token;Devlin 则用<span className="font-medium">双向 masked LM</span>
            <span className="inline-flex items-center px-1 rounded-4 bg-brand-red/10 text-brand-red text-12 font-medium ml-0.5">[2]</span>,
            随机遮蔽 15% token 并让模型联合上下文重建。
          </div>
          {/* citations */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-soft text-12 text-muted-foreground">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-4 bg-brand-red/10 text-brand-red text-12 font-medium">[1]</span>
            <span className="truncate">Vaswani et al., 2017 · Attention Is All You Need · p.3</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-12 text-muted-foreground">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-4 bg-brand-red/10 text-brand-red text-12 font-medium">[2]</span>
            <span className="truncate">Devlin et al., 2019 · BERT · p.4</span>
          </div>
        </div>
      </div>

      {/* input */}
      <div className="flex items-center gap-2 p-3 border-t border-border-soft bg-surface-1">
        <span className="flex-1 px-3 py-2 rounded-8 bg-surface-card border border-border-soft text-12 text-faint">
          询问你的文件夹 …
        </span>
        <button
          type="button"
          aria-label="发送"
          className="inline-flex h-9 w-9 items-center justify-center rounded-8 bg-foreground text-on-dark"
        >
          <Send className="size-3.5" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
