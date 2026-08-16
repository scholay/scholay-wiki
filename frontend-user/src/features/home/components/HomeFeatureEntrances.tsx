import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { BrandMarkNest } from '@/shared/components/BrandMarkNest';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { cn } from '@/shared/lib/utils';

/**
 * 首页搜索框下方 —— 主推智能助手的营销卡(取代原多功能入口条)。
 */
export function HomeFeatureEntrances() {
  const reduce = !!useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-3xl"
    >
      <Link
        to="/claw"
        title="进入智能助手"
        className={cn(
          'group relative flex w-full flex-col overflow-visible rounded-2xl border border-border',
          'bg-background outline-none transition-[border-color,box-shadow,transform]',
          'hover:border-brand-amber/40 hover:shadow-md',
          'focus-visible:ring-2 focus-visible:ring-ring/30',
          'sm:flex-row sm:items-stretch',
        )}
      >
        <div
          className="relative flex shrink-0 items-end self-stretch"
          aria-hidden
        >
          <img
            src="/brand/rhino-card-stand.svg"
            alt=""
            className="h-36 w-auto sm:h-40"
          />
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-3 px-5 pb-5 pt-5 sm:px-6 sm:py-6">
          <span className="text-xs font-semibold tracking-wide text-brand-amber">
            scholay {RHINO_NAME}
          </span>

          <h3 className="font-serif text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            立即培养一只学术Agent，开启智能科研之旅
          </h3>

          <span
            className={cn(
              'mt-1 inline-flex w-fit items-center gap-2 rounded-8 bg-foreground px-5 py-2.5',
              'text-16 font-semibold text-background transition-colors',
              'group-hover:bg-foreground/90',
            )}
          >
            打开智能助手
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.25}
            />
          </span>
        </div>

        <div
          className="relative flex shrink-0 items-end self-stretch px-2 sm:px-3"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <BrandMarkNest
            playOnceKey="scholay.home-claw-card-nest"
            size="xl"
            markOnly
            well
          />
        </div>
      </Link>
    </motion.div>
  );
}
