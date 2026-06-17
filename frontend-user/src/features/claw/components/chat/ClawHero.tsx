import type { ReactNode } from 'react';
import { BookOpen, FileText, Newspaper, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * 新对话空白态(桌面)—— 形态对齐 GPT / Claude / Codex 这类主流 AI 软件的新会话页:
 *   - 动效图标 + 简洁标题 + 一行说明(克制留白,不堆产品卡片)
 *   - 中央一个对话框(与对话中底部栏**同一个 ChatComposer**,样式一致)
 *   - 示例提问做成带图标的轻量 chip:点一下把提示词**填进输入框**(可改后再发,不直接发送)
 *
 * composer:已在 ClawPage 包好 layoutId(motion.div)的 ChatComposer 元素,这里只负责摆位 ——
 * 发出首条消息后,framer-motion 据该 layoutId 把对话框从这里居中平滑滑到底部停靠(见 ClawPage)。
 * onPickSuggestion:点 chip → ClawPage 调 composerRef.prefill。
 */
const SUGGESTIONS = [
  { icon: BookOpen, label: '找一篇综述', prompt: '找一篇关于「Transformer 在医学影像中的应用」的综述' },
  { icon: FileText, label: '读 PDF 写摘要', prompt: '我待会上传一份 PDF,帮我写一段约 200 字的中文摘要' },
  { icon: Newspaper, label: '查期刊动态', prompt: 'Nature Methods 最近半年发了哪些 AI 相关的文章?' },
];

export function ClawHero({
  composer,
  onPickSuggestion,
}: {
  composer: ReactNode;
  onPickSuggestion: (text: string) => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      {/* mb 把垂直居中的整块上移一些(更贴近 GPT/Claude 的偏上构图)。 */}
      <div className="mb-[14vh] flex w-full max-w-2xl flex-col items-center">
        <HeroSpark />
        <h2 className="mt-4 font-serif text-[1.7rem] font-bold tracking-tight text-foreground">
          智能助手 · Claw
        </h2>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          找文献 · 读论文 · 查期刊 · 改摘要,也能上传 PDF 帮你分析
        </p>

        {/* 居中对话框 */}
        <div className="mt-7 w-full">{composer}</div>

        {/* 示例提问 —— 点一下填进输入框(可改后再发) */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
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
