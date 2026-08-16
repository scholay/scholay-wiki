import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NewsListItem } from '@/shared/components/news/NewsListItem';
import { cn } from '@/shared/lib/utils';
import type { NewsCard } from '@/shared/api/news';

const INTERVAL_MS = 5600;

export function NewsFeedCarousel({ items }: { items: NewsCard[] }) {
  const reduce = !!useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [items]);

  useEffect(() => {
    if (items.length < 2 || reduce || paused) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [items.length, reduce, paused]);

  if (items.length === 0) return null;
  const current = items[index % items.length];

  const go = (dir: -1 | 1) => {
    setIndex((i) => (i + dir + items.length) % items.length);
  };

  return (
    <div
      className="relative w-full"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.slug}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            <NewsListItem item={current} variant="card" />
          </motion.div>
        </AnimatePresence>
      </div>

      {items.length > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="上一条"
            className="inline-flex size-7 items-center justify-center rounded-8 text-faint transition-colors hover:bg-surface-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </button>
          <div className="flex items-center gap-1.5">
            {items.map((it, i) => (
              <button
                key={it.slug}
                type="button"
                aria-label={`第 ${i + 1} 条`}
                onClick={() => setIndex(i)}
                className={cn(
                  'size-1.5 rounded-pill transition-colors',
                  i === index % items.length
                    ? 'bg-foreground'
                    : 'bg-border hover:bg-subtle',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="下一条"
            className="inline-flex size-7 items-center justify-center rounded-8 text-faint transition-colors hover:bg-surface-1 hover:text-foreground"
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
