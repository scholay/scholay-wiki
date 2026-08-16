import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import { ClawHero } from '@/features/claw/components/chat/ClawHero';
import { FeatureGuideCards } from '@/shared/components/FeatureGuideCards';
import { SMART_SEARCH_LABEL, type SearchMode } from '../search-mode';

interface SearchLandingProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  /** Classic keyword submit. Ignored when `composer` is passed. */
  onClassicSearch?: (query: string) => void;
  /** Smart-search input. When omitted, the classic search box is shown. */
  composer?: ReactNode;
  aboveComposer?: ReactNode;
  onPickSuggestion?: (text: string) => void;
}

/**
 * Literature-search empty landing —— one shell, two states.
 * Classic = keyword box; smart = conversation composer.
 * Layout (logo, width, vertical center) is shared so mode switch is not a new page.
 */
export function SearchLanding({
  mode,
  onModeChange,
  onClassicSearch,
  composer,
  aboveComposer,
  onPickSuggestion,
}: SearchLandingProps) {
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();
  const isSmart = mode === 'smart' || !!composer;
  const topic = isSmart ? SMART_SEARCH_LABEL : '论文库搜索';

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onClassicSearch?.(trimmed);
  };

  return (
    <ClawHero
      title={topic}
      brandMark={isSmart}
      contentClassName="max-w-[640px]"
      suggestions={[]}
      extra={
        <FeatureGuideCards
          topic={topic}
          wikiHref={isSmart ? '/wiki/smart-search' : '/wiki/literature-search'}
        />
      }
      aboveComposer={aboveComposer}
      onPickSuggestion={onPickSuggestion ?? setDraft}
      composer={
        composer ?? (
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
        )
      }
    />
  );
}
