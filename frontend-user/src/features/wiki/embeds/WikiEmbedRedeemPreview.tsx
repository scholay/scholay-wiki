import { Check, Ticket, X } from "lucide-react";

/** RedeemConfirmDialog 的会员码预览成功态；确认前只展示服务端解析出的权益。 */
export function WikiEmbedRedeemPreview() {
  return (
    <div
      className="relative w-[min(100%,28rem)] overflow-hidden rounded-16 border border-border bg-surface-card shadow-overlay [--redeem-action-gap:1.25rem]"
      aria-hidden
      data-wiki-fixture="redeem-preview"
    >
      <span className="absolute right-4 top-4 inline-flex size-6 items-center justify-center rounded-4 text-faint">
        <X className="size-4" />
      </span>
      <span className="block h-1 w-full bg-status-info" />
      <div className="p-6">
        <span className="inline-flex items-center gap-1 text-12 font-medium text-brand-red">
          <Ticket className="size-3" />
          礼品码兑换 · 会员
        </span>
        <h2 className="mt-2 text-16 font-medium text-foreground">
          确认兑换会员权益?
        </h2>
        <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
          该礼品码将为当前账号开通对应会员权益，兑换后立即生效、到期后自动失效。
        </p>

        <div className="mt-4 flex flex-col gap-3 rounded-12 border border-border bg-surface-1 p-4">
          <InfoRow label="对应活动" value="新学期科研助力计划" />
          <InfoRow label="兑换内容" value="Pro 会员 · 3 个月" accent />
        </div>

        <p className="mt-3 flex items-start gap-2 text-12 leading-paragraph text-faint">
          <span className="mt-1 size-2 shrink-0 rounded-pill bg-status-info" />
          兑换后立即生效，同一兑换码每个账号仅可兑换一次；多人码的总可用次数以活动配置为准。
        </p>

        <div className="mt-[var(--redeem-action-gap)] flex justify-end gap-2">
          <span className="inline-flex h-9 items-center rounded-8 border border-border px-3 text-12 text-subtle">
            取消
          </span>
          <span className="inline-flex h-9 items-center gap-1 rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
            <Check className="size-4" />
            确认兑换会员
          </span>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-12 text-muted-foreground">{label}</span>
      <span
        className={`truncate text-right text-12 font-medium ${
          accent ? "text-brand-amber" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
