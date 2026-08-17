import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { CenteredLanding } from '@/shared/components/CenteredLanding';
import { FeatureBrandHeading } from '@/shared/components/FeatureBrandHeading';
import { FeatureGuideCards } from '@/shared/components/FeatureGuideCards';
import { StepIndicator } from './StepIndicator';
import type { WizardStep } from '@/shared/lib/peer-review/types';

/**
 * Wizard 三栏布局 —— 期刊/毕业 4 步共用。
 *
 *   ┌─ NavBar(返回上一步 + StepIndicator + "下一步" 主按钮)
 *   │
 *   ├──────────────────────────────────────┬─────────────────┐
 *   │  主区(本步骤的表单 / 编辑器)         │ 右栏(已上传资料 │
 *   │                                       │  / AI 推荐 / 提示)│
 *   └──────────────────────────────────────┴─────────────────┘
 *
 * 右栏(rightPane)由各步骤自定义内容,通常是"已上传资料 + 温馨提示"。
 * 没传 rightPane 时主区占满。
 */

export interface WizardLayoutProps {
  step: WizardStep;
  steps: { id: WizardStep; label: string; subtitle?: string }[];
  /** 顶部右上角 CTA(默认"下一步 · ${nextLabel}") */
  nextLabel: string;
  /** 顶部右上角 CTA 禁用态 */
  nextDisabled?: boolean;
  /** loading 文案,replaces nextLabel during mutation */
  nextLoading?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onJump?: (s: WizardStep) => void;
  /** 顶部 CTA 左侧的"取消草稿"按钮 — 点了走 delete + 重新进入新草稿 */
  onCancel?: () => void;
  /** 取消按钮 loading (调 delete mutation 时禁掉) */
  cancelLoading?: boolean;
  /** CTA 按钮下方的小字提示(如提交步的额度预告)。不传 = 布局与原先完全一致。 */
  ctaHint?: ReactNode;

  children: ReactNode;
  rightPane?: ReactNode;
}

export function WizardLayout({
  step,
  steps,
  nextLabel,
  nextDisabled,
  nextLoading,
  onPrev,
  onNext,
  onJump,
  onCancel,
  cancelLoading,
  ctaHint,
  children,
  rightPane,
}: WizardLayoutProps) {
  const showPrev = step > 1;
  const { pathname } = useLocation();
  const heading = pathname.startsWith('/peer-review/thesis')
    ? '学位论文'
    : pathname.startsWith('/peer-review/conference')
      ? '会议论文'
      : pathname.startsWith('/peer-review/other')
        ? '其他'
        : '期刊论文';

  if (step === 1) {
    return (
      <CenteredLanding contentClassName="max-w-2xl">
        <FeatureBrandHeading as="h1" title={heading} mark={false} />
        <div className="mt-6 w-full">{children}</div>
        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={cancelLoading}
                className="inline-flex h-9 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-muted-foreground transition hover:border-destructive hover:text-destructive disabled:opacity-40"
                title="取消并删除当前草稿,上传的文件、AI 已识别的内容都会清空"
              >
                {cancelLoading ? '正在取消…' : '取消草稿'}
              </button>
            )}
            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={onNext}
              disabled={nextDisabled || nextLoading}
              className="h-9 gap-1.5"
            >
              {nextLoading ? 'AI 处理中…' : nextLabel}
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          {ctaHint}
        </div>
        <FeatureGuideCards topic={heading} wikiHref="/wiki/peer-review" />
      </CenteredLanding>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-1">
      <div className="flex shrink-0 justify-center bg-surface-1 px-8 pt-6 pb-2">
        <FeatureBrandHeading as="h1" title={heading} mark={false} />
      </div>
      {/* NavBar — 对照 .pen `yf01S` 进度条标准:
            ┌ 左侧 200px:返回上一步 outline 按钮(只在 step>1 显示, 否则 invisible 占位保中心对齐)
            ├ 中间 flex-1:StepIndicator (撑开 + 中心居中)
            └ 右侧 200px:红色 CTA 按钮 (下一步 · X) */}
      {/* py-3(12px):步骤指示器与上下边的间距。原为固定 h-14(56px),而指示器内容约 49px
          (圆点 size-7=28 + gap-1.5=6 + 标签 12px×1.25≈15),上下只剩 ~3.5px,挤得贴边。
          改成由内容撑高 + 上下各 12px,导航条随之从 56px 长到约 73px。 */}
      <header className="flex shrink-0 items-center gap-6 border-b border-border bg-surface-1 px-8 py-3">
        <div className="flex w-44 shrink-0 items-center justify-start">
          <button
            type="button"
            onClick={onPrev}
            disabled={!showPrev}
            className={
              showPrev
                ? 'inline-flex h-9 items-center gap-1 rounded-8 border border-border bg-surface-card px-4 text-12 text-subtle transition hover:border-foreground hover:text-foreground'
                : 'invisible'
            }
          >
            <ChevronLeft className="size-3.5" />
            返回上一步
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center">
          <div className="w-full max-w-2xl">
            <StepIndicator current={step} steps={steps} onJump={onJump} />
          </div>
        </div>

        {/* ctaHint(提交步的额度预告)挂在 CTA 正下方 —— 外层改竖排,按钮行本身布局不变;
            没有 hint 时渲染结果与原先一字不差(justify-center 在单行时无感)。 */}
        <div className="flex w-72 shrink-0 flex-col items-end justify-center gap-1">
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={cancelLoading}
                className="inline-flex h-9 items-center rounded-8 border border-border bg-surface-card px-3 text-12 text-muted-foreground transition hover:border-destructive hover:text-destructive disabled:opacity-40"
                title="取消并删除当前草稿,上传的文件、AI 已识别的内容都会清空"
              >
                {cancelLoading ? '正在取消…' : '取消草稿'}
              </button>
            )}
            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={onNext}
              disabled={nextDisabled || nextLoading}
              className="h-9 gap-1.5"
            >
              {nextLoading ? 'AI 处理中…' : nextLabel}
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          {ctaHint}
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto px-8 py-6">{children}</div>
        {rightPane && (
          <aside className="hidden w-80 shrink-0 overflow-auto border-l border-border bg-background xl:block">
            <div className="p-5">{rightPane}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
