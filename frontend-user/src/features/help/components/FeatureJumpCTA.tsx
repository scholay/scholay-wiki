import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FolderOpen,
  MessagesSquare,
  PenLine,
  Rocket,
  Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * 帮助文章 / 长内容页底部的"回到产品"区。
 *
 * 用户读完一篇学术教程 / 博客后,下一步的常见动作是立刻去用工具,而不是再读
 * 另一篇文章。这里给一个统一的 CTA 模块,内置 3 个核心 feature 快捷入口
 * (文献搜索 / 文献集 / 期刊搜索),无需调用方配置。
 *
 * 设计上与 HelpCenterPage 底部"回到产品"区是同款 —— 让用户在帮助内容的任意
 * 端点都能一键回归产品。
 */

interface Shortcut {
  to: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}

// 单个功能入口(复用,组成各主题预设)
const SC = {
  search: { to: '/search', icon: Search, title: '文献搜索', desc: '多源并行 + AI 智能检索' },
  library: { to: '/library', icon: FolderOpen, title: '我的文献集', desc: '收藏 / 文件夹 / PDF 管理' },
  journals: { to: '/journals', icon: BookOpen, title: '期刊搜索', desc: '检索 + IF / 分区 / 收录' },
  claw: { to: '/claw', icon: MessagesSquare, title: '智能助手', desc: 'AI 学术对话与调研' },
  prism: { to: '/prism', icon: PenLine, title: '智能写作 Prism', desc: 'AI-native LaTeX 写作' },
  review: { to: '/peer-review', icon: ClipboardCheck, title: 'AI 审稿', desc: '投稿前多维度预审' },
} satisfies Record<string, Shortcut>;

const DEFAULT_SHORTCUTS: Shortcut[] = [SC.search, SC.library, SC.journals];

// 按文章主题(category)匹配最相关的 3 个功能入口,让每篇内容都"融合"对应的 Scholay 能力。
// 覆盖 blog 分类(学术搜索/AI与学术/论文写作/研究方法/工具教程/行业观察)与 qa 主题分类
// (学术开题/研究领域/研究方法/数据集/AI 辅助写作/模拟审稿/论文查重/AI 写作幻觉/文献引用不准确/AI 辅助科研技能)。
const CATEGORY_SHORTCUTS: Record<string, Shortcut[]> = {
  学术搜索: [SC.search, SC.library, SC.journals],
  研究领域: [SC.search, SC.library, SC.claw],
  数据集: [SC.search, SC.library, SC.journals],
  文献引用不准确: [SC.search, SC.library, SC.review],
  学术开题: [SC.search, SC.claw, SC.library],
  研究方法: [SC.search, SC.claw, SC.library],
  论文写作: [SC.prism, SC.search, SC.review],
  AI与学术: [SC.search, SC.prism, SC.claw],
  'AI 辅助写作' : [SC.prism, SC.search, SC.review],
  'AI 写作幻觉' : [SC.search, SC.prism, SC.library],
  论文查重: [SC.prism, SC.search, SC.review],
  'AI 辅助科研技能' : [SC.claw, SC.search, SC.prism],
  模拟审稿: [SC.review, SC.prism, SC.search],
  学术规范: [SC.review, SC.prism, SC.search],
  投稿发表: [SC.journals, SC.review, SC.search],
  文献管理: [SC.library, SC.search, SC.journals],
  学术诚信: [SC.search, SC.review, SC.prism],
  毕业答辩: [SC.review, SC.prism, SC.search],
  统计方法: [SC.search, SC.claw, SC.library],
  实验数据: [SC.claw, SC.search, SC.library],
  工具教程: [SC.search, SC.claw, SC.journals],
};

/** 按文章 category 返回最相关的功能入口,未命中回落到默认三件套。 */
export function shortcutsForCategory(category?: string): Shortcut[] {
  return (category && CATEGORY_SHORTCUTS[category]) || DEFAULT_SHORTCUTS;
}

interface FeatureJumpCTAProps {
  /** 自定义标题,默认"回到产品" */
  title?: string;
  /** 自定义副文,默认"看完帮助,直接用起来。" */
  desc?: string;
  /** 自定义快捷入口列表,默认 3 个核心 feature */
  shortcuts?: Shortcut[];
  className?: string;
}

export function FeatureJumpCTA({
  title = '回到产品',
  desc = '看完帮助,直接用起来。',
  shortcuts = DEFAULT_SHORTCUTS,
  className,
}: FeatureJumpCTAProps) {
  return (
    <section
      className={
        'rounded-16 bg-surface-1 border border-border-soft p-6 md:p-8 ' +
        (className ?? '')
      }
    >
      <div className="flex items-center gap-2 mb-1">
        <Rocket className="size-4 text-brand-red" strokeWidth={2.2} />
        <h2 className="text-14 font-medium text-foreground">{title}</h2>
      </div>
      <p className="text-12 text-muted-foreground">{desc}</p>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {shortcuts.map((s) => (
          <ShortcutCard key={s.to} shortcut={s} />
        ))}
      </div>
    </section>
  );
}

function ShortcutCard({ shortcut }: { shortcut: Shortcut }) {
  const { to, icon: Icon, title, desc } = shortcut;
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 p-4 rounded-12 bg-surface-card border border-border-soft hover:border-foreground/40 transition-all hover:"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-8 bg-surface-1 border border-border-soft group-hover:bg-danger-soft group-hover:border-brand-red/20 transition-colors shrink-0">
        <Icon
          className="size-4 text-subtle group-hover:text-brand-red transition-colors"
          strokeWidth={2}
        />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-12 font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-12 text-muted-foreground truncate">{desc}</p>
      </div>
      <ArrowRight className="size-3.5 text-faint shrink-0 group-hover:text-brand-red transition-colors" />
    </Link>
  );
}
