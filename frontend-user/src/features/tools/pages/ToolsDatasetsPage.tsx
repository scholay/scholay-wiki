import { useEffect, useState } from 'react';
import { Database, ExternalLink } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { CenteredLanding } from '@/shared/components/CenteredLanding';
import { EmptyState } from '@/shared/components/EmptyState';
import { FeatureBrandHeading } from '@/shared/components/FeatureBrandHeading';
import { FeatureGuideCards } from '@/shared/components/FeatureGuideCards';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import {
  RESULT_ROW_ABSTRACT_CLASS,
  RESULT_ROW_ACTION_CLASS,
  RESULT_ROW_CLASS,
  RESULT_ROW_META_CLASS,
  RESULT_ROW_TITLE_CLASS,
  rowChipClass,
} from '@/shared/components/result-row';
import { cn } from '@/shared/lib/utils';
import { usePatchUrlState, useUrlState } from '@/shared/hooks';
import { DatasetDetailContent } from '../components/DatasetDetailContent';
import { PLAZA_DATASETS, type PlazaDataset } from '../data/datasets';
import { usePlazaDetail } from '../plaza-detail';

/**
 * scholay广场 · 数据集分段(/tools/datasets)。
 * 顶部 tab / 搜索 / 排序由 PlazaHeader 提供;本页只读 q 出列表。
 * 点行卡在右侧拓展区看详情,官网外链留在详情里。
 */
export function ToolsDatasetsPage() {
  const patch = usePatchUrlState();
  const [rawQ] = useUrlState('q', '');
  const q = rawQ.trim().toLowerCase();
  const showList = !!q;
  const [draft, setDraft] = useState(rawQ);
  useEffect(() => setDraft(rawQ), [rawQ]);
  const items = q
    ? PLAZA_DATASETS.filter((d) =>
        [d.name, d.field, d.tagline, ...d.tags].join(' ').toLowerCase().includes(q),
      )
    : PLAZA_DATASETS;
  const { detail, setDetail } = usePlazaDetail();

  const openDetail = (d: PlazaDataset) => {
    setDetail({
      id: d.id,
      title: d.name,
      content: <DatasetDetailContent dataset={d} />,
    });
  };

  const seo = (
    <RouteSEO
      title="数据集搜索 · 学术搜索"
      description="公开科研数据集导航:视觉、医学、文献、生物与网络语料,按领域快速找到可用数据。"
      keywords="科研数据集,公开数据,ImageNet,MIMIC,GLUE,OpenAlex,Scholay"
      canonical="/tools/datasets"
    />
  );

  if (!showList) {
    return (
      <>
        {seo}
        <CenteredLanding>
          <FeatureBrandHeading as="h1" title="数据集搜索" mark={false} />
          <div className="mt-6 w-full">
            <SearchAutocomplete
              appearance="literature"
              enableSuggestions={false}
              value={draft}
              onChange={setDraft}
              onSubmit={(v) =>
                patch({ q: v.trim() || null, page: null })
              }
              placeholder="搜索数据集 —— 名称 / 领域 / 用途"
              autoFocus
            />
          </div>
          <FeatureGuideCards
            topic="数据集搜索"
            wikiHref="/wiki/datasets-search"
            scholayPath="/tools/datasets"
          />
        </CenteredLanding>
      </>
    );
  }

  return (
    <>
      {seo}

      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-3 flex items-end justify-between px-3">
          <h2 className="text-16 font-medium text-foreground">
            {q ? `“${rawQ.trim()}” 的结果` : '全部数据集'}
          </h2>
          <span className="text-12 text-faint">共 {items.length} 个</span>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={Database}
            title="没有匹配的数据集"
            description="换个关键词或领域试试"
          />
        ) : (
          <div>
            {items.map((d) => (
              <DatasetRow
                key={d.id}
                dataset={d}
                selected={detail?.id === d.id}
                onOpen={() => openDetail(d)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * 数据集结果行卡 —— 排版参照参考文献基础信息卡:
 * 名称→ 领域 · 许可(meta)→ 标签徽章 → 一句话简介 → 操作行。
 */
function DatasetRow({
  dataset: d,
  selected,
  onOpen,
}: {
  dataset: PlazaDataset;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <article
      className={cn(RESULT_ROW_CLASS, 'cursor-pointer', selected && 'bg-brand-red/5')}
      onClick={onOpen}
    >
      <div className="min-w-0 flex-1">
        <h3 className={RESULT_ROW_TITLE_CLASS}>
          <button
            type="button"
            onClick={onOpen}
            title="在右侧查看详情"
            className="text-left transition-colors hover:text-brand-red"
          >
            {d.name}
          </button>
        </h3>

        <div className={RESULT_ROW_META_CLASS}>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className="min-w-0 truncate">{d.field}</span>
          </div>
          <span className="shrink-0 text-faint">{d.license}</span>
        </div>

        {d.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {d.tags.map((t) => (
              <span key={t} className={rowChipClass('neutral')}>
                {t}
              </span>
            ))}
          </div>
        )}

        <p className={cn(RESULT_ROW_ABSTRACT_CLASS, 'line-clamp-2')}>
          {d.tagline}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={onOpen} className={RESULT_ROW_ACTION_CLASS}>
            查看详情
          </button>
          <a
            href={d.href}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={RESULT_ROW_ACTION_CLASS}
          >
            访问官网
            <ExternalLink className="size-3 shrink-0" strokeWidth={2.5} />
          </a>
        </div>
      </div>
    </article>
  );
}
