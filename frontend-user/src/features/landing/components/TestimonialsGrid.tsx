import { cn } from '@/shared/lib/utils';
import { SectionHeader } from './SectionHeader';
import type { TestimonialsSection } from '../data/landings';

/**
 * 用户评价 3 卡 —— 每卡:大金色 " → 引述正文(text-14 / leading-paragraph)→ 作者 / 角色。
 * (真源已从 .pen 换到 Figma,见 docs/figma-design-spec-2026-07.md;此段无对应 Figma frame,按 token 阶梯实现)
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
                'flex flex-col gap-6 p-8 rounded-16 border bg-surface-1 border-border-soft'
              )}
            >
              {/* 装饰性引号字形 —— 64px 是 Figma §2.1 观测到的「字体展示样本」档(非 UI 六档阶梯,
                  故不进 --text-*);leading-[0.6] 用于把这个纯装饰字形压回卡片顶部,不占行高。
                  两处都保留 arbitrary value:token 层刻意不收 UI 阶梯外的展示字号。 */}
              <span
                className="font-display italic text-brand-amber text-[64px] leading-[0.6] select-none"
                aria-hidden
              >
                &ldquo;
              </span>
              <p className="text-14 leading-paragraph text-subtle flex-1">{t.quote}</p>
              {(t.author || t.role) && (
                <div className="flex flex-col gap-0.5 pt-4 border-t border-border-soft">
                  {t.author && (
                    <span className="text-12 font-medium text-foreground">{t.author}</span>
                  )}
                  {t.role && (
                    <span className="text-12 text-muted-foreground">{t.role}</span>
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
