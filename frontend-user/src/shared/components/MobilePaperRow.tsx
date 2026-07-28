import { memo } from 'react';
import { Quote, Share2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { JournalBadges } from '@/shared/components/JournalBadges';
import type { JournalEnrichment } from '@/shared/api/journal-enrichment';
import type { Paper } from '@/shared/api/types';

/** 万/k 缩写(同 feed 卡口径)。 */
function formatMetric(n: number | undefined): string {
  if (n == null) return '—';
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** 作者行:前两位 + 等 N 位作者。 */
function authorsLine(paper: Paper): string {
  const names = (paper.authors ?? []).map((a) => a.name).filter(Boolean);
  if (names.length === 0) return '未知作者';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} 等 ${names.length} 位作者`;
}

export interface MobilePaperRowProps {
  paper: Paper;
  isFavorited: boolean;
  /** 该论文 venue 命中的期刊增强(JCR/中科院/CCF/IF);无则只显基础标签。 */
  enrichment?: JournalEnrichment | null;
  onOpen: (p: Paper) => void;
  onShare: (p: Paper) => void;
  onCite: (p: Paper) => void;
  /** 收藏/取消收藏成功回调 —— 调用方用它就地翻转「已收藏」态(无需重拉 /library/check) */
  onFavoriteToggle?: (paperId: string, favorited: boolean) => void;
  /** 取消收藏二次确认文案覆盖 —— 文件夹语境下「取消收藏」= 删除整行(含上传 PDF/编辑),
   *  警示要比搜索结果里的「取消收藏」重(那只是移出收藏)。 */
  unfavoriteTitle?: string;
  unfavoriteDescription?: string;
}

/**
 * 移动端论文行 —— **推特(Twitter)时间线**式连续列表项(消除卡片割裂感),
 * 移动端「搜索结果」与「文件夹详情」共用同一行样式(放 shared 以跨 feature 复用):
 *   - 无卡片描边 / 圆角 / 间隙,行与行之间仅一条细分割线,整列连续
 *   - 头像独占左列,作者/来源、标题、摘要、标签、操作条全部在右列(对齐头像右侧)
 *   - 底部操作条:收藏 / 分享 / 引用,在内容列内横向铺开
 */
export const MobilePaperRow = memo(function MobilePaperRow({
  paper,
  isFavorited,
  enrichment,
  onOpen,
  onShare,
  onCite,
  onFavoriteToggle,
  unfavoriteTitle,
  unfavoriteDescription,
}: MobilePaperRowProps) {
  const initial = paper.authors?.[0]?.name?.trim().charAt(0).toUpperCase() || '·';
  const meta =
    [paper.venue, paper.year ? String(paper.year) : null].filter(Boolean).join(' · ') ||
    '来源信息暂缺';
  const open = () => onOpen(paper);

  return (
    <article className="flex gap-3 border-b border-border px-4 py-3.5">
      {/* 左列:头像 */}
      <button
        type="button"
        onClick={open}
        aria-label="查看详情"
        className="shrink-0 transition-transform active:scale-95 active:opacity-80"
      >
        <span className="flex size-10 items-center justify-center rounded-pill bg-brand-green text-14 font-medium text-on-brand">
          {initial}
        </span>
      </button>

      {/* 右列:作者/来源 + 标题 + 摘要 + 标签 + 操作条 */}
      <div className="min-w-0 flex-1">
        <button type="button" onClick={open} className="block w-full text-left">
          <p className="truncate text-12 font-medium text-foreground">{authorsLine(paper)}</p>
          <p className="truncate text-12 text-faint">{meta}</p>
          <h3 className="mt-1.5 line-clamp-3 text-16 font-medium text-foreground">
            {paper.title}
          </h3>
          {paper.abstract && (
            <p className="mt-1 line-clamp-3 text-14 leading-paragraph text-muted-foreground">
              {paper.abstract}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* 期刊相关信息(JCR 分区 / 中科院 / CCF / IF / 预警)—— 与 PC 同口径 */}
            <JournalBadges enrichment={enrichment} />
            {paper.citationCount != null && (
              <Chip className="bg-surface-2 text-muted-foreground">被引 {formatMetric(paper.citationCount)}</Chip>
            )}
            {paper.isOpenAccess && <Chip className="bg-brand-green/10 text-brand-green">开放获取</Chip>}
          </div>
        </button>

        {/* 操作条:收藏 / 分享 / 引用(铺在内容列内,推特式) */}
        <div className="mt-2.5 flex items-center justify-between pr-2">
          <FavoritePaperButton
            paper={paper}
            isFavorited={isFavorited}
            variant="link"
            size="md"
            unfavoriteTitle={unfavoriteTitle}
            unfavoriteDescription={unfavoriteDescription}
            onSuccess={onFavoriteToggle ? () => onFavoriteToggle(paper.paperId, true) : undefined}
            onUnfavorited={onFavoriteToggle ? () => onFavoriteToggle(paper.paperId, false) : undefined}
          />
          <FooterAction icon={<Share2 className="size-3.5" />} label="分享" onClick={() => onShare(paper)} />
          <FooterAction icon={<Quote className="size-3.5" />} label="引用" onClick={() => onCite(paper)} />
        </div>
      </div>
    </article>
  );
});

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('rounded-pill px-2 py-0.5 text-12 font-medium', className)}>{children}</span>
  );
}

/** 操作条按钮 —— 与 FavoritePaperButton 的 link 变体同款质感(icon+文字,hover 转 brand-red)。 */
function FooterAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-14 font-medium text-foreground transition-[color,transform] hover:text-brand-red active:scale-95 active:opacity-70"
    >
      {icon}
      {label}
    </button>
  );
}
