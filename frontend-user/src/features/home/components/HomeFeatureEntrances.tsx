import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { RhinoBrandIcon } from '@/shared/components/RhinoBrandIcon';
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
          'group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border',
          'bg-background outline-none transition-[border-color,box-shadow,transform]',
          'hover:border-brand-amber/40 hover:shadow-md',
          'focus-visible:ring-2 focus-visible:ring-ring/30',
          'sm:flex-row sm:items-stretch',
        )}
      >
        {/* 氛围底 —— amber 与首页 ambient / 助手品牌色一致 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_20%,hsl(var(--brand-amber)/0.16),transparent_55%),radial-gradient(ellipse_at_10%_90%,hsl(var(--brand-green)/0.1),transparent_50%)]"
        />

        <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-3 px-6 py-7 sm:px-8 sm:py-8">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-brand-amber/15 text-brand-amber">
              <RhinoBrandIcon className="size-5" strokeWidth={2} />
            </span>
            <span className="text-xs font-semibold tracking-wide text-brand-amber">
              智能助手 · Claw
            </span>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-serif text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              一个能跟你一起想问题的学术搭档
            </h3>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              读文献、写摘要、做演示提纲——用对话推进科研任务，把重复劳动交给助手。
            </p>
          </div>

          <span
            className={cn(
              'mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2',
              'text-sm font-semibold text-background transition-colors',
              'group-hover:bg-foreground/90',
            )}
          >
            打开智能助手
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.25}
            />
          </span>
        </div>

        <div
          aria-hidden
          className="relative flex items-center justify-center px-6 pb-7 sm:w-[220px] sm:shrink-0 sm:px-8 sm:pb-0"
        >
          <motion.div
            className="relative flex size-24 items-center justify-center rounded-2xl bg-brand-amber/12 text-brand-amber ring-1 ring-brand-amber/20 sm:size-28"
            animate={
              reduce
                ? undefined
                : { y: [0, -6, 0], rotate: [0, 1.5, 0] }
            }
            transition={{
              duration: 5.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <RhinoBrandIcon className="size-12 sm:size-14" strokeWidth={1.6} />
            <span className="absolute -right-1 -top-1 rounded-pill bg-brand-red px-1.5 py-0.5 text-[10px] font-bold leading-none text-background">
              HOT
            </span>
          </motion.div>
        </div>
      </Link>
    </motion.div>
  );
}
