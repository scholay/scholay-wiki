import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { cn } from '@/shared/lib/utils';

/**
 * 后台可复制标识符 —— 订单号 / 交易号 / 会话 ID / 用户 ID / 兑换码。
 *
 * 两个必须一起解决的问题:
 *
 * 1. **静默失效**。改造前后台四处都是 `navigator.clipboard?.writeText(x)` 后
 *    **无条件** `toast.success('已复制')`。`navigator.clipboard` 只在安全上下文存在,
 *    而本项目线上是 nginx 明文 HTTP 暴露 5411 —— 管理员从 `http://<内网IP>:5411/admin`
 *    进后台时它就是 `undefined`,`?.` 把整句变成 no-op,绿色 toast 照样弹,
 *    粘出来是空的。兑换码那处的文案还正好是「请立即复制分发」。
 *    这里统一走 `copyToClipboard`(带 execCommand 兜底、返回 boolean),**按结果**提示。
 *
 * 2. **要手动划选**。对账时最常被粘进网关后台/工单的就是这些串,
 *    却只是一段普通文本,在 40px 行高里精确划选很折磨。
 *
 * 展示上统一用 tabular-nums + 可选截断:ID 类字符串等宽对齐才扫得动。
 */
export function CopyableId({
  value,
  /** 显示文本(默认显示 value 本身);如只显示前 12 位,把截断后的串传这里 */
  display,
  /** 复制成功的 toast 文案前缀,如「订单号」→「订单号已复制」 */
  label = '已复制',
  /** 空值占位 */
  fallback = '—',
  /** 附加前缀节点,如 `#` */
  prefix,
  className,
}: {
  value?: string | number | null;
  display?: ReactNode;
  label?: string;
  fallback?: string;
  prefix?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = value == null || value === '' ? '' : String(value);

  if (!text) return <span className="text-faint">{fallback}</span>;

  const onCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(`${label}:${text}`);
    } else {
      // 兜底也失败(极少数加固浏览器):明确告知需要手选,而不是假装成功
      toast.error('复制失败,请手动选中复制');
    }
  };

  return (
    <span className={cn('group/copy inline-flex items-center gap-1 min-w-0', className)}>
      {prefix}
      {/* select-all:双击/单击即可整段选中,兜底路径也好用 */}
      <span className="select-all truncate tabular-nums" title={text}>
        {display ?? text}
      </span>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`复制${label.replace('已复制', '') || ''}`.trim() || '复制'}
        title="复制"
        className={cn(
          'shrink-0 rounded-4 p-0.5 text-faint transition-colors',
          'hover:bg-surface-2 hover:text-foreground',
          // 常态半隐,悬停行/聚焦时浮现 —— 表格里 20 行都挂一个实心图标太吵
          'opacity-0 focus-visible:opacity-100 group-hover/copy:opacity-100'
        )}
      >
        {copied ? <Check className="size-3 text-brand-green" /> : <Copy className="size-3" />}
      </button>
    </span>
  );
}
