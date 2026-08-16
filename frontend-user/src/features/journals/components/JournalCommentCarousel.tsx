import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useJournalComments } from '../data/journal-comments';

/**
 * 期刊行卡底部的评论轮播 —— 一条一行,自动切换。
 */
export function JournalCommentCarousel({ journalId }: { journalId: number }) {
  const comments = useJournalComments(journalId);
  const reduce = !!useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (comments.length < 2 || reduce) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % comments.length);
    }, 4200);
    return () => window.clearInterval(t);
  }, [comments.length, reduce]);

  if (comments.length === 0) return null;
  const current = comments[index % comments.length];

  return (
    <div className="mt-2 h-5 overflow-hidden text-12 text-faint">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={current.id}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.22 }}
          className="truncate"
          title={`${current.author} · ${current.body}`}
        >
          {current.author} · {current.body}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
