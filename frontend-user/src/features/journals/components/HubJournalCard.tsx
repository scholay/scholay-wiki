import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { JournalCover } from '@/shared/components/JournalCover';
import { journalCanonicalPath } from '@/shared/lib/seo-paths';
import { isModifiedClick, useOpenJournalInBrowser } from '@/shared/hooks';
import type { Journal } from '@/shared/api/types';
import type { JournalHubCard as JournalHubCardData } from '../api/journal-hubs';

/**
 * 枢纽页期刊卡 —— JournalSearchResults 卡片风格的紧凑版(每页 50 刊的密度)。
 *
 * SEO 硬约束(CLAUDE.md §七第5条):刊名是真实 <Link href>,href 走
 * journalCanonicalPath(后端 slug,不在 JS 重算);onClick 只做副作用
 * (openJournal.prepare 写 browser tab store),不 preventDefault、不 navigate,
 * 修饰键点击完整让给浏览器。
 */
export function HubJournalCard({ item }: { item: JournalHubCardData }) {
  const openJournal = useOpenJournalInBrowser();
  const href = journalCanonicalPath(item.journal_id, item.slug);

  const fqbQuartile = leadingQuartile(item.fqb_major_quartile);
  const xrQuartile = leadingQuartile(item.xr_major_quartile);
  const warning = item.warning_level.trim();

  // prepare 需要 Journal 形态(browser tab store 的实体);hub card 是它的子集
  const asJournal: Journal = {
    id: item.journal_id,
    canonical_name: item.name,
    seo_slug: item.slug || undefined,
    publisher: item.publisher || undefined,
    country: item.country || undefined,
    is_oa: item.is_oa,
    jcr_impact_factor: item.jcr_impact_factor > 0 ? item.jcr_impact_factor : undefined,
    jcr_quartile: item.jcr_quartile || undefined,
    fqb_quartile: fqbQuartile,
    xr_quartile: xrQuartile,
    openalex_h_index: item.h_index > 0 ? item.h_index : undefined,
    gjqk_warning: !!warning,
  };

  return (
    <div className="group flex items-center gap-3 p-3 rounded-12 bg-surface-card border border-border hover:border-foreground transition-colors">
      <JournalCover id={item.journal_id} name={item.name} size="tile" />

      <div className="flex-1 min-w-0 space-y-1">
        <h3 className="font-display font-bold text-14 leading-display-tight text-foreground truncate group-hover:text-brand-red transition-colors">
          <Link
            to={href}
            onClick={(e) => {
              if (isModifiedClick(e)) return;
              openJournal.prepare(asJournal);
            }}
            title={`查看期刊详情:${item.name}`}
          >
            {item.name}
          </Link>
        </h3>

        <div className="text-12 text-faint truncate">
          {item.publisher || '出版社未知'}
          {item.country && <> · {item.country}</>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {item.jcr_impact_factor > 0 && (
            <Chip tone="plain" title="JCR 影响因子">
              IF {item.jcr_impact_factor.toFixed(1)}
            </Chip>
          )}
          {item.jcr_quartile && (
            <Chip tone="muted" title="JCR 分区">
              JCR {item.jcr_quartile}
            </Chip>
          )}
          {fqbQuartile && (
            <Chip tone="muted" title="中科院大类分区">
              中科院 {fqbQuartile} 区{isTop(item.fqb_top) && ' · Top'}
            </Chip>
          )}
          {xrQuartile && (
            <Chip tone="green" title="中科院新锐分区">
              新锐 {xrQuartile} 区
            </Chip>
          )}
          {item.is_oa && (
            <Chip tone="green" title="开放获取">
              OA
            </Chip>
          )}
          {item.h_index > 0 && (
            <Chip tone="muted" title="h-index">
              h {item.h_index}
            </Chip>
          )}
          {warning && (
            <Chip tone="red" title="中科院国际期刊预警">
              <AlertTriangle className="size-3" />
              预警{warning !== '是' && ` · ${warning}`}
            </Chip>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================

/** "1" / "1区" / "1 区" → "1";非 1-4 开头返回 undefined(同 journals.ts 归一化口径) */
function leadingQuartile(v: string): string | undefined {
  const m = String(v ?? '').trim().match(/^([1-4])/);
  return m ? m[1] : undefined;
}

function isTop(v: boolean | number): boolean {
  return v === true || v === 1;
}

const CHIP_TONES = {
  /** 数值主指标 —— 深字压灰底 */
  plain: 'bg-surface-2 text-foreground font-medium',
  muted: 'bg-surface-2 text-subtle',
  green: 'bg-brand-green-soft text-brand-green',
  /** 预警 —— 朱砂系(existing token,红色语义) */
  red: 'bg-brand-red-soft text-brand-red font-medium',
} as const;

function Chip({
  tone,
  title,
  children,
}: {
  tone: keyof typeof CHIP_TONES;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 h-5 px-2 rounded-4 text-12 tabular-nums whitespace-nowrap ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}
