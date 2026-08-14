import { cn } from '@/shared/lib/utils';
import { SectionHeader } from './SectionHeader';
import type { LandingFeature, WorkflowStep } from '../data/landings';

/**
 * 工作流 N 步 —— .pen 「五步完成投稿 / 一篇稿件三个步骤」类型 section:
 *   段头 → 每一步左右交替:左数字+标题+描述,右占位 mock
 *   这里 mock 用纯色块占位(避免每页都画不同 mock,工作量过大)
 *
 * 数字采用 Playfair italic 大字号 + 品牌色循环(amber → red → green),
 * 符合 .pen 设计稿的视觉节奏。
 */

const NUM_TONES = ['text-brand-amber', 'text-brand-red', 'text-brand-green'] as const;

function StepRow({ step, index }: { step: WorkflowStep; index: number }) {
  const reverse = index % 2 === 1;
  const numTone = NUM_TONES[index % NUM_TONES.length];
  return (
    <div
      className={cn(
        'grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center',
        reverse && 'lg:grid-flow-dense'
      )}
    >
      <div className={cn('flex flex-col gap-4', reverse && 'lg:col-start-2')}>
        <span className="text-12 font-medium uppercase text-muted-foreground">
          {step.tag}
        </span>
        {/* 展示级小标题随视口缩放 —— clamp 无法用离散字号 token 表达,保留 arbitrary(同 SectionHeader) */}
        <h3 className="font-display italic font-medium text-foreground text-[clamp(24px,3vw,36px)] leading-display-tight">
          {step.title}
        </h3>
        <p className="text-14 leading-paragraph text-subtle">{step.desc}</p>
      </div>
      {/* 占位 mock —— 用渐变 + 大数字代替具体产品截图 */}
      <div
        className={cn(
          'relative aspect-[16/10] rounded-16 border border-border bg-surface-1 overflow-hidden',
          'flex items-center justify-center',
          reverse && 'lg:col-start-1 lg:row-start-1'
        )}
      >
        <span
          className={cn(
            'font-display italic font-medium opacity-15 select-none',
            // 纯装饰的巨大水印序号(120–200px):远超任何字号档,只能 clamp,保留 arbitrary。
            'text-[clamp(120px,20vw,200px)]',
            numTone
          )}
          aria-hidden
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="absolute bottom-4 left-5 text-12 font-medium uppercase text-faint">
          step {index + 1} preview
        </span>
      </div>
    </div>
  );
}

export function WorkflowSteps({ feature }: { feature: LandingFeature }) {
  return (
    <section className="bg-background py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col gap-16">
        <SectionHeader
          eyebrow={feature.workflowHeader.eyebrow}
          title={feature.workflowHeader.title}
          sub={feature.workflowHeader.sub}
        />
        <div className="flex flex-col gap-20">
          {feature.steps.map((s, i) => (
            <StepRow key={s.tag} step={s} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
