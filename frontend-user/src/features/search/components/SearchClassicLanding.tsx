import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import { NewsSection } from '@/features/home/components/NewsSection';
import type { SearchMode } from '../search-mode';

interface SearchClassicLandingProps {
  onSearch: (query: string) => void;
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
}

/**
 * 文献检索初始态 —— 居中 Logo + 与首页同壳的搜索框(含智能搜索开关)。
 */
export function SearchClassicLanding({
  onSearch,
  mode,
  onModeChange,
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

        <div className="mx-auto mt-8 w-full max-w-[640px]">
          <SearchAutocomplete
            appearance="literature"
            value={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            smartToggle={{
              checked: mode === 'smart',
              onCheckedChange: (on) => onModeChange(on ? 'smart' : 'classic'),
            }}
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
