import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import type { FeatureTool } from '@/types/feature-tool';

/**
 * 工具 logo —— logo 缺省 **或加载失败** 时回落到彩色首字母方块,
 * 杜绝 <img> 图裂(冷数据里偶有坏链/异常格式)。白底 object-contain 与卡片一致。
 */
export function ToolLogo({
  tool,
  className,
  textClass = 'text-base',
}: {
  tool: Pick<FeatureTool, 'logo' | 'name' | 'name_en'>;
  className?: string;
  textClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (tool.name_en || tool.name || '?').trim().charAt(0).toUpperCase();
  const box = cn('shrink-0 rounded-8 border border-border-soft', className);

  if (!tool.logo || failed) {
    return (
      <span className={cn(box, 'flex items-center justify-center bg-surface-2 font-bold text-subtle', textClass)}>
        {initial}
      </span>
    );
  }
  return (
    <img
      src={tool.logo}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(box, 'bg-surface-card object-contain')}
    />
  );
}
