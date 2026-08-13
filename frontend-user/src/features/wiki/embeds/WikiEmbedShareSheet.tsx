import { Copy, ImageDown, Link2, QrCode, X } from "lucide-react";
import { ShareCard } from "@/shared/components/share/ShareCard";

/**
 * 桌面端文件夹分享抽屉的链接已生成状态 · 纯样式 fixture。
 * 来源：current shared/components/share/ShareSheet.tsx + ShareCard.tsx。
 */
export function WikiEmbedShareSheet() {
  return (
    <aside
      className="relative flex h-[42rem] max-h-[82dvh] w-[28rem] max-w-full flex-col overflow-y-auto border-l border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="share-sheet"
    >
      <header className="shrink-0 border-b border-border-soft px-4 py-3 pr-10">
        <h2 className="text-14 font-medium text-foreground">分享文件夹</h2>
      </header>
      <X className="absolute right-4 top-4 size-4 text-foreground opacity-70" />

      <div className="flex flex-col gap-4 p-4">
        <ShareCard
          data={{
            kind: "collection",
            title: "Transformer 研究资料",
            paperCount: 24,
            sampleTitles: [
              "Attention Is All You Need",
              "BERT: Pre-training of Deep Bidirectional Transformers",
              "Language Models are Few-Shot Learners",
            ],
            qrValue: "https://scholay.com/s/M8Q7K2?code=H7K9",
            urlLabel: "scholay.com/s/M8Q7K2",
          }}
        />

        <div className="flex items-center justify-between rounded-12 border border-border bg-surface-1 px-3 py-2">
          <span className="text-12 text-subtle">提取码</span>
          <span className="font-mono text-16 font-medium text-brand-red">
            H7K9
          </span>
        </div>

        <div>
          <p className="mb-2 text-12 text-faint">分享渠道</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "复制链接", Icon: Link2 },
              { label: "复制口令", Icon: Copy },
              { label: "保存图片", Icon: ImageDown },
              { label: "二维码", Icon: QrCode },
            ].map(({ label, Icon }) => (
              <span
                key={label}
                className="flex flex-col items-center gap-1 rounded-8 border border-border bg-surface-card py-2 text-muted-foreground"
              >
                <Icon className="size-5" />
                <span className="text-12 text-subtle">{label}</span>
              </span>
            ))}
          </div>
        </div>

        <p className="text-12 leading-paragraph text-faint">
          “复制口令”会同时带上链接和提取码；对方打开链接后输入提取码即可查看并转存。
        </p>
      </div>
    </aside>
  );
}
