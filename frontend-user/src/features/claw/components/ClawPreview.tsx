import { Sparkles } from 'lucide-react';

/**
 * Claw AI 助手样式预览 —— 一段简单的智能对话流。
 * 对照 .pen 智能助手 hero 区域的对话气泡形态。
 */
export function ClawPreview() {
  return (
    <div className="flex flex-col h-full bg-background">
      <header className="h-14 px-6 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <Sparkles className="size-4 text-brand-green" strokeWidth={2.5} />
          <span className="text-15 font-bold text-foreground">智能助手</span>
        </div>
        <span className="text-xs text-faint">Claw AI</span>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
          <UserMsg text="我准备写一篇关于 Mamba 与 Transformer 在长上下文任务上的对比综述,有没有起步建议?" />
          <AIMsg>
            <p className="text-sm text-subtle leading-paragraph">
              建议从以下三个角度切入:
            </p>
            <ol className="mt-2 space-y-1.5 text-sm text-subtle list-decimal list-inside leading-paragraph">
              <li>性能维度:Long Range Arena、SCROLLS 等公共基准上的对比</li>
              <li>计算成本:序列长度 N 下的 FLOPs / 显存曲线</li>
              <li>应用边界:基因组、代码、长文档分别哪种更合适</li>
            </ol>
            <p className="mt-2 text-sm text-subtle leading-paragraph">
              我可以帮你拉出近 18 个月的相关综述 + 3 个高引基准论文。要不要先看看?
            </p>
          </AIMsg>
          <UserMsg text="好,先看综述" />
          <AIMsg>
            <p className="text-sm text-subtle leading-paragraph">
              已检索到 8 篇,正在按引用量和近期更新排序…
            </p>
          </AIMsg>
        </div>
      </div>

      <div className="border-t border-border-soft bg-surface-card px-6 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-2 h-10 px-3 rounded-16 border border-border-strong">
          <input
            type="text"
            disabled
            placeholder="向智能助手提问..."
            className="flex-1 h-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
      </div>
    </div>
  );
}

function UserMsg({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] inline-flex items-center px-4 py-2.5 rounded-16 bg-foreground text-background text-sm leading-paragraph">
        {text}
      </div>
    </div>
  );
}

function AIMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="inline-flex size-7 items-center justify-center rounded-pill bg-brand-green text-background text-2xs font-bold shrink-0">
        AI
      </span>
      <div className="flex-1 min-w-0 px-4 py-2.5 rounded-16 bg-surface-1 border border-border-soft">
        {children}
      </div>
    </div>
  );
}
