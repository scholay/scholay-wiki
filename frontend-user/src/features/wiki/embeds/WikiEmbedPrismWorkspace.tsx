import {
  Bold,
  Check,
  ChevronDown,
  FileText,
  Image,
  Italic,
  List,
  MessageSquarePlus,
  Play,
  Quote,
  Sigma,
  Sparkles,
  X,
} from "lucide-react";

const OUTLINE = ["摘要", "1 引言", "2 方法", "3 实验", "4 讨论"] as const;

/**
 * Prism 结构化写作工作区 · 纯样式 fixture。
 * 对齐 PrismStructSidebar + PrismChatPanel + StructEditor；冻结在逐块审阅待确认态。
 */
export function WikiEmbedPrismWorkspace() {
  return (
    <div
      className="w-[min(100%,54rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="prism-workspace"
    >
      <header className="flex h-14 items-center gap-3 border-b border-border px-4">
        <FileText className="size-4 shrink-0 text-brand-red" />
        <p className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
          扩散模型医学影像综述
        </p>
        <span className="shrink-0 text-12 text-faint">已自动保存</span>
        <span className="hidden h-8 items-center gap-1 rounded-8 border border-brand-green/40 px-3 text-12 text-brand-green sm:inline-flex">
          <MessageSquarePlus className="size-3.5" />
          新对话
        </span>
        <span className="hidden h-8 items-center gap-1 rounded-8 bg-foreground px-3 text-12 text-on-dark sm:inline-flex">
          <Play className="size-3" />
          编译
        </span>
      </header>

      <div className="grid min-h-96 md:grid-cols-[11rem_minmax(0,1fr)] lg:grid-cols-[9rem_15rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border-soft bg-surface-1 p-3 lg:block">
          <p className="px-2 py-2 text-12 font-medium text-foreground">
            文章大纲
          </p>
          <div className="mt-1 space-y-1">
            {OUTLINE.map((item, index) => (
              <div
                key={item}
                className={
                  index === 2
                    ? "rounded-8 bg-surface-card px-2 py-2 text-12 text-brand-red shadow-raised"
                    : "rounded-8 px-2 py-2 text-12 text-subtle"
                }
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-border-soft pt-3">
            <p className="px-2 text-12 font-medium text-foreground">
              本项目对话
            </p>
            <p className="mt-2 truncate rounded-8 bg-surface-card px-2 py-2 text-12 text-subtle">
              方法章节修订
            </p>
          </div>
        </aside>

        <section className="hidden min-w-0 flex-col border-r border-border-soft md:flex">
          <div className="flex h-10 items-center gap-2 border-b border-border-soft px-3">
            <Sparkles className="size-3.5 text-brand-green" />
            <p className="text-12 font-medium text-foreground">AI 写作对话</p>
            <span className="ml-auto rounded-pill bg-brand-green/10 px-2 py-1 text-12 text-brand-green">
              逐块审阅 · 开
            </span>
          </div>
          <div className="flex-1 space-y-3 p-3">
            <div className="ml-auto rounded-12 rounded-tr-4 bg-foreground px-3 py-2 text-12 leading-paragraph text-on-dark">
              收紧方法章节，保留样本量、基线和全部引用。
            </div>
            <div className="rounded-12 rounded-tl-4 border border-border bg-surface-card px-3 py-2 text-12 leading-paragraph text-foreground">
              已重组两段方法说明，并保留所有数字与引用键。
            </div>
            <div className="overflow-hidden rounded-8 border border-brand-green/30 bg-brand-green/5">
              <div className="flex items-center gap-2 px-3 py-2">
                <FileText className="size-3.5 text-brand-green" />
                <p className="min-w-0 flex-1 truncate text-12 font-medium text-foreground">
                  AI 改动 · 1 个文件
                </p>
                <span className="text-12 text-brand-green">待应用</span>
              </div>
              <div className="flex justify-end gap-2 border-t border-brand-green/20 px-3 py-2">
                <span className="inline-flex h-7 items-center gap-1 rounded-8 px-2 text-12 text-faint">
                  <X className="size-3" />
                  丢弃
                </span>
                <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-brand-green px-2 text-12 text-on-dark">
                  <Check className="size-3" />
                  应用
                </span>
              </div>
            </div>
          </div>
          <div className="border-t border-border-soft p-3">
            <div className="rounded-12 border border-border-strong px-3 py-3 text-12 text-faint shadow-raised">
              先在上方审阅并应用 / 丢弃当前改动
            </div>
          </div>
        </section>

        <section className="min-w-0 bg-surface-card">
          <div className="flex h-10 items-center gap-1 overflow-hidden border-b border-border-soft bg-surface-1 px-3 text-subtle">
            <span className="inline-flex size-7 items-center justify-center rounded-8 bg-surface-card">
              <Bold className="size-3.5" />
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-8">
              <Italic className="size-3.5" />
            </span>
            <span className="inline-flex h-7 items-center gap-1 rounded-8 px-2 text-12">
              正文
              <ChevronDown className="size-3" />
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-8">
              <List className="size-3.5" />
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-8">
              <Image className="size-3.5" />
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-8">
              <Sigma className="size-3.5" />
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-8">
              <Quote className="size-3.5" />
            </span>
            <span className="ml-auto hidden rounded-pill bg-brand-green/10 px-2 py-1 text-12 text-brand-green sm:inline">
              AI 改动 2 处
            </span>
          </div>
          <article className="mx-auto max-w-lg px-4 py-6 sm:px-8">
            <p className="text-12 text-faint">2 方法</p>
            <h2 className="mt-2 font-serif text-20 font-medium text-foreground">
              数据与重建流程
            </h2>
            <p className="mt-4 text-14 leading-paragraph text-subtle">
              本研究纳入 1,240 例 MRI
              扫描，并在统一预处理后比较三类扩散重建策略。
            </p>
            <p className="mt-3 rounded-8 border-l-2 border-brand-green bg-brand-green/5 px-3 py-2 text-14 leading-paragraph text-foreground">
              所有模型使用相同训练集划分，并报告 PSNR、SSIM 与外部验证结果
              [12–14]。
            </p>
            <p className="mt-3 text-14 leading-paragraph text-subtle">
              统计分析预先设定显著性阈值，并对多重比较进行校正。
            </p>
          </article>
        </section>
      </div>
    </div>
  );
}
