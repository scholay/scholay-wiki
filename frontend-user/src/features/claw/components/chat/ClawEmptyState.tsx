import { BookOpen, FileText, ImageIcon, Newspaper, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * 新对话空白态(移动端 MobileClawPage 用;桌面走 ClawHero)。
 *
 * 形态对齐现在常见的 AI 助手聊天首页:动效图标 + 标题 + 一行说明 + 可点的「示例提问」卡片。
 * 点卡片不直接发送,而是把提示词填进底部输入框(可改后再发)—— 通过 onPickSuggestion 回调,
 * 由页面调 composerRef.prefill。输入框始终停在底部(移动端不做桌面那套居中→停靠的位移)。
 */
const SUGGESTIONS = [
  {
    icon: BookOpen,
    label: '找一篇综述',
    prompt: '找一篇关于「Transformer 在医学影像中的应用」的综述',
  },
  {
    icon: FileText,
    label: '读 PDF 写摘要',
    prompt: '我待会上传一份 PDF,帮我写一段约 200 字的中文摘要',
  },
  {
    icon: Newspaper,
    label: '查期刊动态',
    prompt: 'Nature Methods 最近半年发了哪些 AI 相关的文章?',
  },
  {
    icon: ImageIcon,
    label: '看图分析',
    prompt: '这张实验装置图里缺少什么对照?帮我分析一下',
  },
];

export function ClawEmptyState({
  onPickSuggestion,
}: {
  /** 点示例卡片 → 把提示词填进输入框(由 MobileClawPage 调 composerRef.prefill)。 */
  onPickSuggestion?: (text: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-8">
      <div className="flex w-full max-w-sm flex-col items-center">
        {/* 动效图标 —— 外发光脉冲 + 轻微呼吸(原地动效,reduced-motion 下也不引前庭不适)。 */}
        <div className="relative">
          <motion.div
            className="absolute inset-0 rounded-16 bg-brand-green/25 blur-xl"
            animate={{ scale: [1, 1.5, 1], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="relative flex size-14 items-center justify-center rounded-16 bg-surface-2"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Sparkles className="size-7 text-brand-green" strokeWidth={1.8} />
          </motion.div>
        </div>

        <h2 className="mt-4 font-serif text-xl font-bold text-foreground">
          智能助手 · Claw
        </h2>
        <p className="mt-1.5 text-center text-sm leading-paragraph text-muted-foreground">
          找文献 · 读论文 · 查期刊 · 改摘要,也能上传 PDF / 图片帮你分析
        </p>

        {/* 示例提问卡片 —— 点一下填进底部输入框(可改后再发) */}
        <div className="mt-6 flex w-full flex-col gap-2">
          {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              type="button"
              onClick={() => onPickSuggestion?.(prompt)}
              className="flex items-center gap-3 rounded-16 border border-border bg-surface-1 px-3.5 py-3 text-left transition-colors active:bg-surface-2"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-card">
                <Icon className="size-4 text-brand-green" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="truncate text-xs text-faint">{prompt}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
