import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import {
  useOpenAuthorInBrowser,
  useOpenJournalInBrowser,
  useOpenPaperInBrowser,
} from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import { HomeNoviceTour } from './HomeNoviceTour';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useIsAuthenticated } from '@/stores/auth.store';
import { usePendingAction } from '@/stores/pending-action.store';
import type { SearchMode } from '@/features/search/search-mode';
import { HomeFeatureEntrances } from './HomeFeatureEntrances';
import { HomeFeatureZones } from './HomeFeatureZones';

const ROTATING_PROMPTS = [
  '帮我找 3 篇 Transformer 可解释性方向的代表作',
  '我待会上传 PDF，帮我写一段 200 字中文摘要',
  'Nature Methods 最近半年有哪些 AI 相关文章？',
  '帮我做一份 10 页的 Transformer 教学演示稿',
];

export function HomeAgentHero() {
  const [mode, setMode] = useState<SearchMode>('smart');
  const [agentDraft, setAgentDraft] = useState('');
  const [classicDraft, setClassicDraft] = useState('');
  const navigate = useNavigate();
  const authenticated = useIsAuthenticated();
  const openDialog = useAuthDialog((s) => s.openDialog);
  const openPaper = useOpenPaperInBrowser();
  const openJournal = useOpenJournalInBrowser();
  const openAuthor = useOpenAuthorInBrowser();

  const smart = mode === 'smart';
  const draft = smart ? agentDraft : classicDraft;
  const setDraft = smart ? setAgentDraft : setClassicDraft;

  /** 进文献搜索 · 智能搜索模式;带 q 时 SmartSearchPanel 自动发首条。 */
  const goSmartSearch = (opts?: { message?: string }) => {
    const params = new URLSearchParams();
    params.set('mode', 'smart');
    const trimmed = opts?.message?.trim() ?? '';
    if (trimmed) params.set('q', trimmed);
    const target = `/search?${params.toString()}`;
    if (!authenticated) {
      usePendingAction.getState().set({ type: 'navigate', to: target });
      openDialog('login');
      return;
    }
    navigate(target);
  };

  const handleSubmit = (query: string) => {
    if (smart) {
      if (!query.trim()) return;
      goSmartSearch({ message: query });
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) {
      navigate('/search', { state: { fresh: true } });
      return;
    }
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="relative flex flex-1 flex-col">
      <AmbientBackdrop />

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex flex-col items-center px-6 py-10">
          <div className="flex w-full max-w-3xl flex-col items-center">
          <h2 data-tour="home-brand">
            <BrandLogo size="xl" />
          </h2>

          {/* 同一输入壳:切模式只过渡圆角 + 右侧按钮,不整块消失/出现。 */}
          <div className="mx-auto mt-8 w-full max-w-[640px]" data-tour="home-composer">
            <SearchAutocomplete
              appearance={smart ? 'smart' : 'literature'}
              value={draft}
              onChange={setDraft}
              onSubmit={handleSubmit}
              placeholderOverlay={
                smart ? <RotatingPlaceholder items={ROTATING_PROMPTS} /> : undefined
              }
              requireAuth={smart && !authenticated}
              smartToggle={{
                checked: smart,
                onCheckedChange: (on) => setMode(on ? 'smart' : 'classic'),
              }}
              onSearchJournals={(q) => {
                const trimmed = q.trim();
                navigate(
                  trimmed
                    ? `/journals/search?q=${encodeURIComponent(trimmed)}`
                    : '/journals/search',
                );
              }}
              onPickJournal={(j) =>
                openJournal({
                  id: j.id,
                  canonical_name: j.canonical_name,
                })
              }
              onPickPaper={(p) =>
                openPaper({
                  paperId: p.id,
                  title: p.title,
                  source: p.source,
                })
              }
              onPickAuthor={(a) => {
                if (!a.authorId) return;
                openAuthor({
                  authorId: a.authorId,
                  name: a.name ?? '',
                  affiliations: a.affiliations,
                  paperCount: a.paperCount,
                  hIndex: a.hIndex,
                  source: a.source,
                });
              }}
              autoFocus
            />
          </div>

          <div className="mx-auto mt-6 w-full max-w-3xl">
            <HomeFeatureEntrances />
          </div>
        </div>
        </div>

        <HomeFeatureZones />

        <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-4">
          <p className="text-center text-sm text-muted-foreground">
            让热爱学术的人彼此连接
          </p>
        </div>
      </div>

      <HomeNoviceTour />
    </div>
  );
}

function AmbientBackdrop() {
  const reduce = useReducedMotion();
  const blobs = [
    {
      cls: '-left-28 -top-24 size-[36rem] bg-brand-green/14',
      anim: { x: [0, 90, 0], y: [0, 70, 0], scale: [1, 1.22, 1], opacity: [0.45, 0.9, 0.45] },
      calm: { scale: [1, 1.15, 1], opacity: [0.4, 0.85, 0.4] },
      dur: 12,
    },
    {
      cls: '-right-32 top-8 size-[38rem] bg-brand-amber/14',
      anim: { x: [0, -84, 0], y: [0, 80, 0], scale: [1, 1.26, 1], opacity: [0.5, 0.95, 0.5] },
      calm: { scale: [1, 1.18, 1], opacity: [0.45, 0.9, 0.45] },
      dur: 14,
    },
    {
      cls: '-bottom-32 left-1/4 size-[36rem] bg-brand-green/10',
      anim: { x: [0, 76, 0], y: [0, -64, 0], scale: [1, 1.2, 1], opacity: [0.45, 0.85, 0.45] },
      calm: { scale: [1, 1.16, 1], opacity: [0.4, 0.8, 0.4] },
      dur: 13,
    },
  ];

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {blobs.map((b) => (
        <motion.div
          key={b.cls}
          className={cn('absolute rounded-full blur-3xl', b.cls)}
          animate={reduce ? b.calm : b.anim}
          transition={{ duration: b.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function RotatingPlaceholder({ items }: { items: readonly string[] }) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || items.length < 2) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % items.length),
      3200,
    );
    return () => clearInterval(timer);
  }, [reduce, items.length]);

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center overflow-hidden text-base leading-normal text-faint">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="truncate"
        >
          {items[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
