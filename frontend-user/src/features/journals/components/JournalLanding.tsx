import { useState } from 'react';
import { CenteredLanding } from '@/shared/components/CenteredLanding';
import { FeatureBrandHeading } from '@/shared/components/FeatureBrandHeading';
import { FeatureGuideCards } from '@/shared/components/FeatureGuideCards';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';

/**
 * 期刊二级空态 —— 查询对齐传统搜索(literature 框);
 * 选刊对齐智能搜索(smart 圆角发送键)。下方示例 chip 已去掉,避免把 hero 顶上去。
 */
export function JournalLanding({
  variant,
  onSearch,
}: {
  variant: 'query' | 'select';
  onSearch: (query: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const isSelect = variant === 'select';
  const topic = isSelect ? 'scholay 选刊' : '期刊库搜索';

  return (
    <CenteredLanding>
      <FeatureBrandHeading
        as="h1"
        title={topic}
        mark={false}
      />
      <div className="mt-6 w-full">
        <SearchAutocomplete
          appearance={isSelect ? 'smart' : 'literature'}
          value={draft}
          onChange={setDraft}
          onSubmit={onSearch}
          placeholder={
            isSelect
              ? '描述稿件方向、学科与目标分区…'
              : '刊名 / ISSN / 主办机构'
          }
          autoFocus
        />
      </div>
      <FeatureGuideCards
        topic={topic}
        wikiHref={isSelect ? '/wiki/journal-selection-guide' : '/wiki/journal-search-page'}
        scholayPath={isSelect ? '/search' : '/journals/search'}
      />
    </CenteredLanding>
  );
}
