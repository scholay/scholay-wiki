import { Copy, ImageDown, Link2, QrCode, ShieldCheck } from "lucide-react";

/** 文献集分享面板 · 纯样式 fixture。来源：product-mock ShareSheet。 */
export function WikiEmbedShareSheet() {
  return (
    <div
      className="w-[min(100%,28rem)] rounded-12 border border-border bg-surface-card p-4"
      aria-hidden
      data-wiki-fixture="share-sheet"
    >
      <p className="text-16 font-medium text-foreground">分享文献集</p>
      <div className="mt-4 rounded-8 border border-border bg-surface-1 p-4">
        <p className="text-14 font-medium text-foreground">
          Transformer 研究资料
        </p>
        <p className="mt-1 text-12 text-faint">24 篇文献 · 示例预览</p>
        <div className="mt-3 space-y-2">
          {[
            "Attention Is All You Need",
            "BERT: Pre-training of Deep Bidirectional Transformers",
          ].map((title) => (
            <div
              key={title}
              className="truncate rounded-4 bg-surface-card px-3 py-2 text-12 text-subtle"
            >
              {title}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-8 border border-border bg-surface-1 p-3">
        <div className="flex items-center justify-between gap-3 text-12 text-subtle">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4" />
            提取码保护
          </span>
          <span className="rounded-pill bg-brand-red px-2 py-1 font-medium text-on-dark">
            已开启
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between text-12 text-subtle">
          <span>有效期</span>
          <div className="flex gap-2">
            {["永久", "7 天", "30 天"].map((label) => (
              <span
                key={label}
                className={`rounded-4 border px-2 py-1 ${label === "永久" ? "border-brand-red bg-danger-soft text-brand-red" : "border-border text-muted-foreground"}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mb-2 mt-4 text-12 text-faint">分享渠道</p>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "复制链接", Icon: Link2 },
          { label: "复制口令", Icon: Copy },
          { label: "保存图片", Icon: ImageDown },
          { label: "二维码", Icon: QrCode },
        ].map(({ label, Icon }) => (
          <span
            key={label}
            className="flex min-w-0 flex-col items-center gap-2 rounded-8 border border-border py-3 text-muted-foreground"
          >
            <Icon className="size-4" />
            <span className="text-center text-12 text-subtle">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
