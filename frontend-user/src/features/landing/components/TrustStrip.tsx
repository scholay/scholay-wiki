import { cn } from '@/shared/lib/utils';

/**
 * Trust strip —— .pen `TrustStrip / sXx3w`:浅灰底,顶部一行标签 +
 * 大字间距 logos 横排(模拟 wordmark,不真用品牌 logo 图)。
 *
 * 这里 logos 用 Google Sans italic / 700 交错,
 * 模拟出 .pen 里期刊 / 大学 wordmark 那种排版多样性。
 */
export function TrustStrip({
  label,
  logos,
}: {
  label: string;
  logos: string[];
}) {
  return (
    <section className="bg-surface-1 border-y border-border-soft">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 flex flex-col gap-6 items-center">
        <span className="text-12 font-medium uppercase text-muted-foreground">
          {label}
        </span>
        <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-4">
          {logos.map((l, i) => (
            <span
              key={l}
              className={cn(
                'text-subtle whitespace-nowrap',
                // 交错样式 —— 模拟期刊 / 大学 wordmark 多样性
                i % 3 === 0
                  ? 'font-display italic text-24 font-medium'
                  : i % 3 === 1
                    ? 'text-16 font-medium'
                    : 'font-display text-20 font-medium'
              )}
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
