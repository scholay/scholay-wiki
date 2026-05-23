import { ArrowRight, BookmarkCheck, Bookmark, ChevronDown, Plus, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * 「智能搜索」即将上线 —— 用户切到 smart 模式时展示一个**纯视觉**的
 * 假预览,样式对照设计稿,但整个区域是 demo 性质:
 *   - 所有按钮、输入框 `pointer-events-none`,不可交互
 *   - 顶部 banner 明确说明"即将推出 · 当前展示是样式预览"
 *
 * 该预览**不替换**外层 SearcherColumn 的 header(传统/智能 切换器还在,
 * 用户可以切回传统模式),只占用 header 下方的内容区。
 */
export function SmartSearchPreview() {
  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* 顶部状态条 —— "即将推出"明确提示 */}
      <div className="flex items-center justify-center gap-2 h-9 px-4 bg-warning-soft text-brand-amber text-xs font-bold shrink-0">
        <Sparkles className="size-3.5" strokeWidth={2.5} />
        智能搜索即将推出 · 当前展示样式预览,暂不可使用
      </div>

      {/* 对话流(预览,不可交互) */}
      <div
        aria-hidden="true"
        className="flex-1 min-h-0 overflow-y-auto opacity-70 pointer-events-none select-none"
      >
        <div className="px-4 py-6 space-y-5">
          {/* 用户提问 1 */}
          <UserBubble text="帮我找一下近 3 年关于可解释性 AI 在医疗影像中应用的代表性综述" />

          {/* AI 回复 1 + 论文卡 */}
          <AIBubble>
            <p className="text-sm text-subtle leading-relaxed">
              为你检索到 6 篇高相关综述,按引用量与时效性排序。可点击任一文献「+ 暂存」加入暂存区开展矩阵分析:
            </p>
            <div className="mt-3 space-y-2.5">
              <PaperCardPreview
                title="Explainable AI in Medical Imaging: A Survey of XAI Methods 2021-2024"
                venue="Nature Machine Intelligence · 2024"
                matchPercent={96}
                abstract="综述了 2021-2024 年 Grad-CAM、SHAP、LIME、Integrated Gradients 在医学影像各亚领域的发展脉络与临床落地挑战,覆盖 86 个临床试点案例。"
                state="default"
                favorited
              />
              <PaperCardPreview
                title="Attention Maps vs. Grad-CAM in Radiology: A Reader Study"
                state="staged"
              />
              <PaperCardPreview
                title="Saliency Maps for Vision Transformers: A Comparative Study"
                state="collapsed"
              />
              <PaperCardPreview
                title="Counterfactual Explanations for Clinical Decision Support"
                venue="JAMA · 2023"
                abstract="提出生成临床场景反事实样本以提升模型可解释性的方法,覆盖三家医院真实病例数据,重点验证临床医生对解释结果的可接受度。"
                state="default"
              />
            </div>

            <div className="mt-3 space-y-2">
              <CtaButton label="将剩余 4 篇全部发送到暂存区" />
              <CtaButton label="将剩余 4 篇全部发送到文献集" />
            </div>
          </AIBubble>

          {/* 用户提问 2 */}
          <UserBubble text="再加几篇关于反事实解释的" />

          {/* AI 回复 2(进行中态) */}
          <AIBubble>
            <p className="text-sm text-subtle leading-relaxed inline-flex items-center gap-2">
              正在分析反事实解释相关文献
              <span className="inline-flex gap-0.5 items-center">
                <Dot />
                <Dot delay="100ms" />
                <Dot delay="200ms" />
              </span>
            </p>
          </AIBubble>
        </div>
      </div>

      {/* 底部条件 chip + 输入框(同样禁用) */}
      <div
        aria-hidden="true"
        className="border-t border-border-soft bg-background px-4 py-3 shrink-0 opacity-70 pointer-events-none select-none"
      >
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <ConditionChip label="近 3 年" />
          <ConditionChip label="医疗影像" />
          <ConditionChip label="反事实解释" />
          <button
            type="button"
            tabIndex={-1}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-pill border border-dashed border-border text-2xs text-muted-foreground"
          >
            <Plus className="size-3" />
            添加条件
          </button>
        </div>
        <div className="flex items-center gap-2 h-10 px-3 rounded-sm border border-border-strong bg-background">
          <input
            type="text"
            placeholder="继续与智能搜索对话…"
            disabled
            tabIndex={-1}
            className="flex-1 h-full bg-transparent text-sm outline-none placeholder:text-faint cursor-not-allowed"
          />
          <button
            type="button"
            tabIndex={-1}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-destructive text-destructive-foreground"
          >
            <Send className="size-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 子组件 —— 全部 dumb,仅渲染
// ===========================================================================

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] inline-flex items-center px-4 py-2.5 rounded-md bg-foreground text-background text-sm leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function AIBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="inline-flex size-7 items-center justify-center rounded-pill bg-brand-green text-background text-2xs font-bold shrink-0">
        AI
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

type PaperState = 'default' | 'staged' | 'collapsed';

function PaperCardPreview({
  title,
  venue,
  abstract,
  matchPercent,
  state = 'default',
  favorited,
}: {
  title: string;
  venue?: string;
  abstract?: string;
  matchPercent?: number;
  state?: PaperState;
  favorited?: boolean;
}) {
  if (state === 'staged') {
    return (
      <div className="flex items-center justify-between gap-2 h-9 px-3 rounded-sm bg-brand-green/10 border border-brand-green/30">
        <div className="flex items-center gap-2 min-w-0">
          <BookmarkCheck className="size-3.5 text-brand-green shrink-0" />
          <span className="text-sm text-foreground font-semibold truncate">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-2xs">
          <span className="inline-flex items-center px-1.5 h-5 rounded-sm bg-brand-green text-background font-bold">
            已暂存
          </span>
          <ChevronDown className="size-3.5 text-faint" />
          <X className="size-3.5 text-faint" />
        </div>
      </div>
    );
  }
  if (state === 'collapsed') {
    return (
      <div className="flex items-center justify-between gap-2 h-9 px-3 rounded-sm border border-dashed border-border">
        <span className="text-sm text-muted-foreground truncate">{title}</span>
        <div className="flex items-center gap-1.5 shrink-0 text-2xs text-faint">
          <span className="inline-flex items-center px-1.5 h-5 rounded-sm bg-surface-2 font-bold">
            已折叠
          </span>
          <span className="inline-flex items-center gap-0.5 hover:text-foreground">
            <RotateCcw className="size-3" />
            还原
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-sm border border-border bg-background">
      <p className="text-sm font-bold text-foreground leading-snug">{title}</p>
      {(venue || matchPercent !== undefined) && (
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          {venue && <span>{venue}</span>}
          {matchPercent !== undefined && (
            <span className="inline-flex items-center px-1.5 py-px rounded-sm bg-danger-soft text-brand-red font-bold">
              高匹配 {matchPercent}%
            </span>
          )}
        </div>
      )}
      {abstract && (
        <p className="text-xs text-subtle leading-relaxed line-clamp-2">
          {abstract}
        </p>
      )}
      <div className="flex items-center gap-1.5 mt-1">
        <ActionChip variant="filled">📌 暂存</ActionChip>
        <ActionChip>
          {favorited ? (
            <>
              <BookmarkCheck className="size-3 text-brand-red" />
              <span className="text-brand-red">★ 已收藏</span>
            </>
          ) : (
            <>
              <Bookmark className="size-3" />
              收藏
            </>
          )}
        </ActionChip>
        <ActionChip>📄 查看全文</ActionChip>
        <ActionChip>译 AI 翻译</ActionChip>
        <ActionChip>折叠</ActionChip>
      </div>
    </div>
  );
}

function ActionChip({
  children,
  variant = 'outline',
}: {
  children: React.ReactNode;
  variant?: 'filled' | 'outline';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-2xs font-semibold',
        variant === 'filled'
          ? 'bg-brand-red text-background'
          : 'border border-border text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

function CtaButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-sm border border-brand-red text-brand-red text-sm font-bold"
    >
      <ArrowRight className="size-3.5" strokeWidth={2.5} />
      {label}
    </button>
  );
}

function ConditionChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-surface-2 text-2xs text-foreground font-semibold">
      {label}
      <X className="size-2.5 text-faint" />
    </span>
  );
}

function Dot({ delay = '0ms' }: { delay?: string }) {
  return (
    <span
      className="inline-block size-1 rounded-pill bg-brand-red animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}
