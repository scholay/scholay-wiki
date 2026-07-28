import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import { NewsSection } from '@/features/home/components/NewsSection';
import { SearchModeSwitch } from './SearchModeSwitch';
import type { SearchMode } from '../search-mode';

interface SearchClassicLandingProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  onSearch: (query: string) => void;
}

/**
 * 文献检索初始态 —— 居中 Logo + 搜索框 + 学术情报。
 * 用户提交关键词后 SearcherColumn 切到结果列表布局。
 */
export function SearchClassicLanding({
  mode,
  onModeChange,
  onSearch,
}: SearchClassicLandingProps) {
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col items-center px-6 py-10">
        <BrandLogo size="xl" />
        <p className="mt-3 text-sm text-muted-foreground">
          学术搜索 · AI 审稿 · LaTeX 协作
        </p>

        <div className="mt-8 w-full max-w-2xl">
          <SearchModeSwitch
            mode={mode}
            onModeChange={onModeChange}
            className="mb-4 max-w-md mx-auto"
          />
          <SearchAutocomplete
            value={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            onSearchJournals={(q) => {
              const trimmed = q.trim();
              navigate(
                trimmed
                  ? `/journals/search?q=${encodeURIComponent(trimmed)}`
                  : '/journals/search',
              );
            }}
            autoFocus
          />
        </div>
      </div>

      <NewsSection />
    </div>
  );
}
