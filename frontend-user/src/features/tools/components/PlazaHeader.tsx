import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Select } from '@/shared/ui';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import { FeatureBrandHeading } from '@/shared/components/FeatureBrandHeading';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import { PlazaSegmentTabs } from './PlazaSegmentTabs';

const TOOL_SORT: [string, string][] = [
  ['hot', '热度排序'],
  ['new', '最新收录'],
  ['name', '名称 A–Z'],
];
const SKILL_SORT: [string, string][] = [
  ['popular', '热门'],
  ['recent', '最新'],
];

/**
 * scholay广场共享头部 —— logo + 分段 tab + 与传统搜索同壳的 SearchAutocomplete。
 * 切段只换下方内容;q / sort 写在 URL 上。
 */
export function PlazaHeader() {
  const { pathname } = useLocation();
  const isSkills = pathname.startsWith('/tools/skills');
  const isPrompts = pathname.startsWith('/tools/prompts');
  const isCatalog = pathname === '/tools/catalog';
  const isPlaza = isSkills || isPrompts || isCatalog;
  const isNews = pathname.startsWith('/tools/news');
  const isDatasets = pathname.startsWith('/tools/datasets');
  const patch = usePatchUrlState();
  const [rawQ] = useUrlState('q', '');
  const [sort] = useUrlState('sort', '');

  const [draft, setDraft] = useState(rawQ);
  useEffect(() => setDraft(rawQ), [rawQ]);

  const setQuery = (v: string) => patch({ q: v || null, page: null });
  const setSort = (v: string) => patch({ sort: v || null, page: null });

  const sortOpts = isPlaza ? SKILL_SORT : TOOL_SORT;
  const sortValue = sort || sortOpts[0][0];
  const heading = isNews
    ? 'scholay 情报'
    : isSkills
      ? '学术skills'
      : isPrompts
        ? '学术prompts'
        : isDatasets
          ? '数据集检索'
          : '学术工具';
  const placeholder = isSkills
    ? '搜索社区技能 —— 名称 / 用途'
    : isPrompts
      ? '搜索提示词 —— 场景 / 用途'
      : isDatasets
        ? '搜索数据集 —— 名称 / 领域 / 用途'
        : isNews
          ? '搜索 scholay 情报 —— 标题 / 关键词'
          : '搜索科研工具 —— 名称 / 关键词 / 用途';

  return (
    <header className="shrink-0 border-b border-border bg-background px-6 py-4">
      <div className="mx-auto max-w-[640px]">
        <div className="mb-4 flex justify-center">
          <FeatureBrandHeading
            as="h1"
            title={heading}
            mark={!isNews && !isDatasets}
          />
        </div>
        {isPlaza ? (
          <div className="mb-3 flex justify-center">
            <PlazaSegmentTabs />
          </div>
        ) : null}
        {/* 情报段也是检索方式 —— 搜索框与文献库检索同壳;排序留给页内的最新/最热 pill。 */}
        <SearchAutocomplete
          appearance="literature"
          enableSuggestions={false}
          value={draft}
          onChange={(v) => {
            setDraft(v);
            if (!v) setQuery('');
          }}
          onSubmit={(v) => setQuery(v.trim())}
          placeholder={placeholder}
        />
        {isNews ? null : (
          <div className="mt-2 flex justify-end">
            <Select
              fullWidth={false}
              value={sortValue}
              onChange={(e) => setSort(e.target.value)}
              aria-label="排序"
              className="h-8 rounded-8 bg-background pl-3 text-12 font-medium text-subtle hover:border-border-strong"
            >
              {sortOpts.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    </header>
  );
}
