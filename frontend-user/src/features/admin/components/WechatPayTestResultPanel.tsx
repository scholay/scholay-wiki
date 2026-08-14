import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import type {
  WeChatPayValidationStatus,
  WechatPayCheck,
  WechatPayCheckStatus,
  WechatPayTestResult,
} from '../api/payment';

/**
 * 微信支付「测试配置」结果 —— 逐项清单。
 *
 * 🔴 这个端点**永远回 HTTP 200**,ok=false 也一样。所有诊断信息都在 summary 与
 * checks[].detail 里,detail 是「下一步该做什么」级别的中文指引,可能很长 ——
 * 必须 whitespace-pre-wrap + break-words 完整展开,截断等于把最有价值的部分扔掉。
 */

const STATUS_ICON: Record<WechatPayCheckStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  fail: XCircle,
  skip: MinusCircle,
};

const STATUS_TONE: Record<WechatPayCheckStatus, string> = {
  pass: 'text-brand-green',
  fail: 'text-brand-red',
  skip: 'text-muted-foreground',
};

export const WECHAT_KEY_MODE_LABEL: Record<string, string> = {
  public_key: '公钥模式',
  platform_cert: '平台证书模式',
};

/** 校验状态徽章 —— 列表列与编辑弹窗共用一份口径。 */
export function WechatPayValidationBadge({ status }: { status: WeChatPayValidationStatus }) {
  if (status === 'valid') return <Badge variant="success">已验证</Badge>;
  if (status === 'invalid') return <Badge variant="destructive">未通过</Badge>;
  return <Badge variant="muted">未测试</Badge>;
}

function CheckRow({ check }: { check: WechatPayCheck }) {
  const Icon = STATUS_ICON[check.status] ?? MinusCircle;
  const tone = STATUS_TONE[check.status] ?? 'text-muted-foreground';
  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <Icon className={cn('size-3.5 shrink-0', tone)} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn('text-12 font-medium', tone)}>{check.label}</p>
        {check.detail && (
          <p className="whitespace-pre-wrap break-words text-12 text-subtle">{check.detail}</p>
        )}
      </div>
    </div>
  );
}

export function WechatPayTestResultPanel({ result }: { result: WechatPayTestResult }) {
  const checks = result.checks ?? [];
  const modeLabel = WECHAT_KEY_MODE_LABEL[result.key_mode] ?? result.key_mode;
  return (
    <div className="space-y-2">
      <div
        className={cn(
          'flex items-start gap-2 rounded-12 border border-border px-3 py-2',
          result.ok ? 'bg-brand-green-soft' : 'bg-brand-red-soft',
        )}
      >
        {result.ok ? (
          <CheckCircle2 className="size-4 shrink-0 text-brand-green" />
        ) : (
          <XCircle className="size-4 shrink-0 text-brand-red" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-12 font-medium', result.ok ? 'text-brand-green' : 'text-brand-red')}>
              {result.ok ? '测试通过,可以启用该配置' : '测试未通过,请按下面的逐项结果排查'}
            </span>
            {modeLabel && <Badge variant="outline">{modeLabel}</Badge>}
          </div>
          {result.summary && (
            <p className="whitespace-pre-wrap break-words text-12 text-subtle">{result.summary}</p>
          )}
        </div>
      </div>

      {checks.length > 0 && (
        <div className="divide-y divide-border rounded-12 border border-border">
          {checks.map((c, i) => (
            <CheckRow key={c.key || i} check={c} />
          ))}
        </div>
      )}
    </div>
  );
}
