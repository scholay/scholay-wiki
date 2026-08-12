import {
  ArrowLeft,
  BookOpen,
  Download,
  LockOpen,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const SHARED_PAPERS = [
  ["Denoising Diffusion Probabilistic Models", "NeurIPS 2020 · 被引 18,420"],
  [
    "High-Resolution Image Synthesis with Latent Diffusion Models",
    "CVPR 2022 · 被引 12,804",
  ],
  [
    "Elucidating the Design Space of Diffusion-Based Generative Models",
    "NeurIPS 2022 · 被引 6,218",
  ],
] as const;

/**
 * 文献集分享接收页 · 纯样式 fixture。
 * 对齐 product-mock SharedReceivePage 的合集预览与转存操作栏。
 */
export function WikiEmbedLibraryShareReceive() {
  return (
    <div
      className="w-[min(100%,28rem)] overflow-hidden rounded-20 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="library-share-receive"
    >
      <header className="flex h-12 items-center gap-2 border-b border-border px-4">
        <ArrowLeft className="size-4 text-muted-foreground" />
        <span className="text-14 font-medium text-foreground">文献合集</span>
      </header>

      <div className="p-4">
        <div className="flex items-start gap-3 rounded-12 bg-brand-amber-soft p-3">
          <Sparkles className="mt-1 size-4 shrink-0 text-brand-amber" />
          <p className="text-12 leading-paragraph text-foreground">
            <span className="font-medium">“YAYA”</span> 给你分享了一组文献
            <span className="block text-muted-foreground">
              无需登录即可预览前 5 篇
            </span>
          </p>
        </div>

        <section className="mt-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-8 bg-brand-green-soft text-brand-green">
              <BookOpen className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-20 font-medium leading-display text-foreground">
                扩散模型入门与关键论文
              </h2>
              <p className="mt-1 text-12 text-faint">
                共 12 篇 · 按被引次数排序
              </p>
            </div>
          </div>

          <ul
            className="mt-4 divide-y divide-border-hairline"
            data-wiki-spot="分享预览"
          >
            {SHARED_PAPERS.map(([title, meta], index) => (
              <li key={title} className="flex gap-3 py-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-8 bg-surface-1 text-12 tabular-nums text-faint">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-14 font-medium leading-sans text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-12 text-faint">
                    <TrendingUp className="size-3" />
                    {meta}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 rounded-8 bg-surface-1 py-2 text-center text-12 text-faint">
            还有 9 篇，打开后查看全部
          </div>
        </section>
      </div>

      <footer className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <span className="inline-flex h-10 items-center justify-center gap-2 rounded-pill border border-border text-12 font-medium text-subtle">
          <LockOpen className="size-4" />
          打开合集
        </span>
        <span className="inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-brand-red text-12 font-medium text-on-dark">
          <Download className="size-4" />
          转存到文献集
        </span>
      </footer>
    </div>
  );
}
