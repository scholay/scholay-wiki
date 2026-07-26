/**
 * Step3 信件编辑 — 纯文本编辑器(.pen DA8l7 cover letter / Auz6H 审稿信)。
 *
 * 0058 起 AI 起草由 wizard 的 advance flow 在进入 Step3 时自动触发,
 * 这里只负责展示 + 让用户微调。父组件传 `value` 是 submission.letterBody,
 * 改动通过 onChange 写到本地 state,父组件在 "下一步" 时 PATCH 回去。
 *
 * 期刊模式:Cover Letter(英文,致编辑部)
 * 毕业模式:致评阅老师投稿信(中文)
 */
import { AIOverlay } from '@/shared/ui/ai-overlay';

export interface LetterEditorStepProps {
  submissionId: number;
  variant: 'cover_letter' | 'review_letter';
  value: string;
  onChange: (next: string) => void;
  /** AI 正在起草 (computing_letter) — 给编辑器外轮廓套霓虹光晕等待动画 */
  computing?: boolean;
  /** 流式进度提示 ("正在检索文献…") */
  statusNote?: string;
}

const COPY = {
  cover_letter: {
    title: '投稿信 (Cover Letter)',
    hint: '致期刊编辑部 · 一段稿件简介 + 一段亮点 + 一段贡献,通常一页内',
    placeholder: 'Dear Editor,\n\nWe submit our manuscript "..." for your consideration ...',
  },
  review_letter: {
    title: '致评阅老师投稿信',
    hint: '简要介绍论文背景 + 希望评阅老师重点关注的章节',
    placeholder: '尊敬的评阅老师:\n\n您好。本论文是关于 ... 的研究,主要工作包括 ...',
  },
};

// submissionId 当前只是给将来"插入引用 / 摘要"等富功能预留,目前未使用
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LetterEditorStep({
  submissionId: _submissionId,
  variant,
  value,
  onChange,
  computing,
  statusNote,
}: LetterEditorStepProps) {
  const copy = COPY[variant];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-foreground">{copy.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {computing ? (statusNote || '正在起草…') + ' · 内容会逐字写入下方' : copy.hint}
        </p>
      </div>

      {/* 蒙层只盖到"第一个字写进来"为止:开始流式起草后立即撤,内容逐字写入用户可见 */}
      <AIOverlay active={computing && !value.trim()} label="AI 正在起草投稿信">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={computing ? '正在起草投稿信…' : copy.placeholder}
          className="min-h-[480px] w-full resize-y rounded-8 border border-border bg-surface-card p-4 font-mono text-sm leading-paragraph text-foreground placeholder:text-faint focus-visible:border-brand-red focus-visible:outline-none"
        />
      </AIOverlay>

      <p className="text-xs text-faint">
        已 {value.length} 字 · 提交后随稿件一起递交给审稿人参考
      </p>
    </div>
  );
}
