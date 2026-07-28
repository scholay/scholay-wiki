import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  FileText,
  Search,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { Composer, type ComposerHandle } from '@/shared/components/chat';
import { cn } from '@/shared/lib/utils';
import { HomeFeatureNav } from './HomeFeatureNav';
import { NewsSection } from './NewsSection';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useIsAuthenticated } from '@/stores/auth.store';
import { usePendingAction } from '@/stores/pending-action.store';
import { SearchModeSwitch } from '@/features/search/components/SearchModeSwitch';

const ROTATING_PROMPTS = [
  '帮我找 3 篇 Transformer 可解释性方向的代表作',
  '我待会上传 PDF，帮我写一段 200 字中文摘要',
  'Nature Methods 最近半年有哪些 AI 相关文章？',
  '帮我做一份 10 页的 Transformer 教学演示稿',
];

const QUICK_CHIPS = [
  {
    icon: BookOpen,
    label: '找一篇综述',
    prompt: '找一篇关于「大语言模型可解释性」的综述论文',
  },
  {
    icon: FileText,
    label: '读 PDF 写摘要',
    prompt: '我待会上传一份 PDF，帮我写一段约 200 字的中文摘要',
  },
  {
    icon: Search,
    label: '矩阵检索',
    prompt: '检索近五年 diffusion model 在图像生成上的高引论文，按引用数排序',
  },
] as const;

export function HomeAgentHero() {
  const [draft, setDraft] = useState('');
  const composerRef = useRef<ComposerHandle>(null);
  const navigate = useNavigate();
  const authenticated = useIsAuthenticated();
  const openDialog = useAuthDialog((s) => s.openDialog);

  const goAgent = (message?: string) => {
    const trimmed = message?.trim() ?? '';
    const params = new URLSearchParams({ mode: 'smart' });
    if (trimmed) params.set('q', trimmed);
    const target = `/search?${params.toString()}`;
    if (!authenticated) {
      usePendingAction.getState().set({ type: 'navigate', to: target });
      openDialog('login');
      return;
    }
    navigate(target);
  };

  const handleSubmit = () => {
    if (!draft.trim()) return;
    goAgent(draft);
  };

  return (
    <div className="relative flex flex-1 flex-col">
      <AmbientBackdrop />

      <div className="relative z-10 flex flex-col">
        <div className="flex flex-col items-center px-6 py-10">
          <div className="flex w-full max-w-3xl flex-col items-center">
          <HomeFeatureNav />

          <h2 className="mt-6 flex flex-wrap items-center justify-center gap-x-1.5 text-2xl font-bold text-foreground">
            <span>和</span>
            <BrandLogo size="sm" className="text-2xl" />
            <span>一起研究</span>
          </h2>
          <p className="mt-2 max-w-lg text-center text-sm text-muted-foreground">
            找文献 · 读论文 · 写摘要 · 做汇报 —— 一个入口，直接开始对话
          </p>

          <div className="mt-8 w-full">
            <SearchModeSwitch
              mode="smart"
              onModeChange={(m) => {
                if (m === 'classic') {
                  navigate('/search', { state: { fresh: true } });
                }
              }}
              className="mb-4 max-w-md mx-auto"
            />
            <Composer
              ref={composerRef}
              value={draft}
              onChange={setDraft}
              onSend={handleSubmit}
              placeholderOverlay={<RotatingPlaceholder items={ROTATING_PROMPTS} />}
              requireAuth={!authenticated}
              onRequireAuth={handleSubmit}
              minRows={3}
              autoFocus
              className="shadow-md"
            />
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {QUICK_CHIPS.map(({ icon: Icon, label, prompt }) => (
              <button
                key={label}
                type="button"
                onClick={() => composerRef.current?.prefill(prompt)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground"
              >
                <Icon className="size-3.5 text-faint" />
                {label}
              </button>
            ))}
          </div>
        </div>
        </div>

        <NewsSection />
      </div>
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
    <div className="pointer-events-none absolute left-1 right-1 top-1 overflow-hidden text-base leading-relaxed text-faint">
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
