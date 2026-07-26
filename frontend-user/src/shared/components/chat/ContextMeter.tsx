import { cn } from '@/shared/lib/utils';
import { useUserModels } from '@/shared/api/models';

/**
 * 上下文水位指示 —— footer 右下角的紧凑环 + 百分比(设计参考 Claude / Cursor)。
 * 智能助手(claw)/ 智能写作(prism)共用;不抢眼,hover 看明细。
 *   - < 80%: 灰(text-faint)— 常态
 *   - >= 80%: brand-red — 提醒该新开对话 / 精简上下文
 * 环用纯 CSS conic-gradient,不引第三方图表库。
 */
export interface ContextMeterProps {
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  model?: string;
  className?: string;
}

export function ContextMeter({ totalTokens, maxTokens, percentage, model, className }: ContextMeterProps) {
  // 展示名映射:上游 model code → 目录展示名(查不到回落 code)。目录 feature 参数只影响
  // is_default 标注,任一 feature 的可选集都含全部模型,固定用 claw(与选择器共享缓存,零额外请求)。
  const { data: catalogModels } = useUserModels('claw');
  const displayModel = (model && catalogModels?.find((m) => m.model_id === model)?.display_name) || model;
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));
  const danger = pct >= 80;
  // conic-gradient 是动态角度,属于「动态计算的尺寸」,允许内联 style(globals 约定例外项)。
  const ringStyle = { background: `conic-gradient(currentColor ${pct * 3.6}deg, var(--color-border) 0deg)` };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 text-2xs tabular-nums',
        danger ? 'text-brand-red' : 'text-faint',
        className,
      )}
      title={`上下文 ${totalTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${displayModel || '未知模型'})`}
    >
      <span className="inline-block size-3 shrink-0 rounded-pill" style={ringStyle} aria-hidden="true">
        {/* 中心挖空成环:内层小圆用背景色盖住,留 ~2px 环宽 */}
        <span className="block size-3 scale-[0.55] rounded-pill bg-surface-card" />
      </span>
      上下文 {pct}%
    </span>
  );
}
