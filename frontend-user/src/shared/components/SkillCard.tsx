import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { User, Download } from 'lucide-react';
import type { SkillCard as SkillCardData } from '@/shared/api/skills';

/**
 * 社区技能卡片 —— 市场列表 / 功能广场「社区技能」分段共用(跨 feature 复用故落 shared)。
 * 点击进 /skills/:slug(详情/分享落地页,匿名可看)。name/tagline/authorName 是不可信内容,
 * 纯文本渲染(React 默认转义)。
 */
export const SkillGridCard = forwardRef<HTMLAnchorElement, { skill: SkillCardData }>(
  function SkillGridCard({ skill }, ref) {
    return (
      <Link
        ref={ref}
        to={`/skills/${skill.slug || skill.id}`}
        className="group flex flex-col rounded-16 border border-border bg-surface-card p-4 transition-colors hover:border-border-strong hover:bg-surface-1"
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-14 font-medium text-foreground group-hover:text-brand-green">
            {skill.name}
          </h3>
          {skill.installed && (
            <span className="shrink-0 rounded-pill bg-brand-green/10 px-1.5 py-0.5 text-12 text-brand-green">
              已安装
            </span>
          )}
        </div>
        <p className="line-clamp-2 flex-1 text-12 text-muted-foreground">
          {skill.tagline || '(暂无简介)'}
        </p>
        <div className="mt-3 flex items-center gap-3 text-12 text-faint">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {skill.authorName}
          </span>
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {skill.installCount}
          </span>
        </div>
      </Link>
    );
  }
);
