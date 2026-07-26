import { cn } from '@/shared/lib/utils';
import { SectionHeader } from './SectionHeader';
import type { TestimonialsSection } from '../data/landings';

/**
 * 用户评价 3 卡 —— .pen Submit kD0nu:
 *   每卡:大金色 " → 引述正文(15px / 1.7)→ 作者 / 角色
 *
 * 目前只 Submit 用,数据缺时(其他 5 页)自动跳过本段。
 */
export function TestimonialsGrid({ section }: { section: TestimonialsSection }) {
  return (
    <section className="bg-background py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col gap-12">
        <SectionHeader eyebrow={section.eyebrow} title={section.title} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {section.items.map((t, i) => (
            <div
              key={i}
              className={cn(
                'flex flex-col gap-6 p-8 rounded-lg border bg-surface-1 border-border-soft'
              )}
            >
              <span
                className="font-display italic text-brand-amber leading-[0.6] select-none"
                style={{ fontSize: 64 }}
                aria-hidden
              >
                &ldquo;
              </span>
              <p className="text-md leading-paragraph text-subtle flex-1">{t.quote}</p>
              {(t.author || t.role) && (
                <div className="flex flex-col gap-0.5 pt-4 border-t border-border-soft">
                  {t.author && (
                    <span className="text-sm font-semibold text-foreground">{t.author}</span>
                  )}
                  {t.role && (
                    <span className="text-xs text-muted-foreground">{t.role}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
