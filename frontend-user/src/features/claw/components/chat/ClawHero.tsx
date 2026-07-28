import type { ComponentType, ReactNode } from 'react';
import { BookOpen, FileText, Newspaper, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

export interface HeroSuggestion {
  icon: ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

/**
 * 新对话空白态(桌面)—— 形态对齐 GPT / Claude / Codex 这类主流 AI 软件的新会话页:
 *   - 顶部品牌区(大发光图标 + 大标题 + 一行副标题)对齐**远程 main 的样式**
 *   - 中央一个对话框(与对话中底部栏**同一个 ChatComposer**,样式一致)
 *   - 模板卡(制作PPT / 科研绘图 的「扑克牌扇」)放在**输入框下方**(见 TemplateCards)
 *   - 示例提问做成带图标的轻量 chip:点一下把提示词**填进输入框**(可改后再发,不直接发送)
 *
 * 布局容器:外层只负责纵向滚动,中层 `min-h-full items-center` 让整块「内容矮就居中、内容高就从顶部
 * 开始滚」—— 避免旧写法(flex items-center + overflow + mb 上移)在内容变高时把**顶部**(发光图标 /
 * 标题)裁掉、且不可滚回去看的老问题。
 *
 * composer:已在 ClawPage 包好 layoutId(motion.div)的 ChatComposer 元素,这里只负责摆位 ——
 * 发出首条消息后,framer-motion 据该 layoutId 把对话框从这里平滑滑到底部停靠(见 ClawPage)。
 * onPickSuggestion:点 chip → ClawPage 调 composerRef.prefill。
 */
const SUGGESTIONS: HeroSuggestion[] = [
  { icon: BookOpen, label: '找一篇综述', prompt: '找一篇关于「Transformer 在医学影像中的应用」的综述' },
  { icon: FileText, label: '读 PDF 写摘要', prompt: '我待会上传一份 PDF,帮我写一段约 200 字的中文摘要' },
  { icon: Newspaper, label: '查期刊动态', prompt: 'Nature Methods 最近半年发了哪些 AI 相关的文章?' },
];

/** claw 空态默认文案 —— 供 ConversationWorkspace 的 claw 配置复用(单一真源,不漂移)。 */
export const clawHeroDefaults = {
  title: '智能助手 · Claw',
  subtitle: '找文献 · 读论文 · 查期刊 · 改摘要,也能上传 PDF 帮你分析',
  suggestions: SUGGESTIONS,
};

export function ClawHero({
  composer,
  onPickSuggestion,
  title = '智能助手 · Claw',
  subtitle = clawHeroDefaults.subtitle,
  suggestions = SUGGESTIONS,
  extra,
  contentClassName = 'max-w-2xl',
}: {
  composer: ReactNode;
  onPickSuggestion: (text: string) => void;
  /** 空态标题 / 示例提问(默认 claw;制作PPT 传各自文案)。 */
  title?: string;
  /** 副标题(品牌区第二行,对齐远程 main)。 */
  subtitle?: string;
  suggestions?: HeroSuggestion[];
  /** 输入框**下方**的附加内容(模板卡扑克牌扇 / 换回对话模式条)。 */
  extra?: ReactNode;
  /** 内容区最大宽度(默认 max-w-2xl;首页/搜索 hero 可传 max-w-3xl)。 */
  contentClassName?: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center px-6 py-8">
        <div className={cn('flex w-full flex-col items-center', contentClassName)}>
          {/* 品牌区 —— 对齐远程 main:大发光图标 + 大标题 + 一行副标题。 */}
          <HeroSpark />
          <h2 className="mt-4 font-serif text-[1.7rem] font-bold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-1.5 text-center text-sm text-muted-foreground">{subtitle}</p>

          {/* 居中对话框 */}
          <div className="mt-6 w-full">{composer}</div>

          {/* 模板卡 —— 移到输入框**下方**,带封面动画诠释功能(制作PPT / 科研绘图);见 TemplateCards。 */}
          {extra && <div className="mt-5 w-full">{extra}</div>}

          {/* 示例提问 —— 点一下填进输入框(可改后再发) */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map(({ icon: Icon, label, prompt }) => (
              <button
                key={label}
                type="button"
                onClick={() => onPickSuggestion(prompt)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground"
              >
                <Icon className="size-3.5 text-faint" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 标题上方的图标 —— 外发光脉冲 + 轻微呼吸缩放(原地动效,reduced-motion 下也保留,不引前庭不适)。 */
function HeroSpark() {
  return (
    <div className="relative">
      <motion.div
        className="absolute inset-0 rounded-2xl bg-brand-green/25 blur-xl"
        animate={{ scale: [1, 1.55, 1], opacity: [0.45, 0, 0.45] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="relative flex size-14 items-center justify-center rounded-2xl bg-surface-2"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles className="size-7 text-brand-green" strokeWidth={1.8} />
      </motion.div>
    </div>
  );
}
