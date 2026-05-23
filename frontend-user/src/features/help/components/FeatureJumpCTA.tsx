import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, FolderOpen, Rocket, Search } from 'lucide-react';
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

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { to: '/search', icon: Search, title: '文献搜索', desc: '多源并行 + 引文矩阵' },
  { to: '/library', icon: FolderOpen, title: '我的文献集', desc: '收藏 / 文件夹 / PDF 管理' },
  { to: '/journals', icon: BookOpen, title: '期刊搜索', desc: '检索 + IF / 分区 / 收录' },
];

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
        'rounded-lg bg-surface-1 border border-border-soft p-6 md:p-8 ' +
        (className ?? '')
      }
    >
      <div className="flex items-center gap-2 mb-1">
        <Rocket className="size-4 text-brand-red" strokeWidth={2.2} />
        <h2 className="text-base font-bold text-foreground">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
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
      className="group flex items-center gap-3 p-4 rounded-md bg-background border border-border-soft hover:border-foreground/40 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-1 border border-border-soft group-hover:bg-danger-soft group-hover:border-brand-red/20 transition-colors shrink-0">
        <Icon
          className="size-4 text-subtle group-hover:text-brand-red transition-colors"
          strokeWidth={2}
        />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground leading-tight">{title}</p>
        <p className="mt-0.5 text-2xs text-muted-foreground truncate">{desc}</p>
      </div>
      <ArrowRight className="size-3.5 text-faint shrink-0 group-hover:text-brand-red transition-colors" />
    </Link>
  );
}
