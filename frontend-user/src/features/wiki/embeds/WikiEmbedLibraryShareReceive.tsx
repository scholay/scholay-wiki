import { ArrowLeft, Download, Eye, FileText, Quote, Users } from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const SHARED_PAPERS = [
  [
    "Denoising Diffusion Probabilistic Models",
    "Jonathan Ho 等 · NeurIPS 2020",
    "18,420",
  ],
  [
    "High-Resolution Image Synthesis with Latent Diffusion Models",
    "Robin Rombach 等 · CVPR 2022",
    "12,804",
  ],
  [
    "Elucidating the Design Space of Diffusion-Based Generative Models",
    "Tero Karras 等 · NeurIPS 2022",
    "6,218",
  ],
  [
    "Scalable Diffusion Models with Transformers",
    "William Peebles 等 · ICCV 2023",
    "4,913",
  ],
  [
    "Classifier-Free Diffusion Guidance",
    "Jonathan Ho 等 · NeurIPS Workshop 2021",
    "3,774",
  ],
] as const;

/** 公开分享链接的普通合集预览态（已解锁、允许收藏）。 */
export function WikiEmbedLibraryShareReceive() {
  return (
    <div
      className="flex h-[38rem] w-full max-w-xl flex-col overflow-hidden rounded-8 border border-border bg-background"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="library-share-receive"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <ArrowLeft className="size-5 text-muted-foreground" />
        <span className="text-18 font-medium text-foreground">文献合集</span>
      </header>

      <div className="shrink-0 px-4 pt-4">
        <div className="flex items-center gap-3 rounded-8 bg-surface-1 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-cat-2 text-20 font-medium text-on-brand">
            Y
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-20 leading-paragraph text-foreground">
              <strong className="font-medium">YAYA</strong>
              <span className="text-muted-foreground">
                {" "}
                给你分享了一个文献合集
              </span>
            </p>
            <p className="mt-1 text-16 text-faint">
              收藏后可在你的文献库随时查看
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <CollectionCover />
          <div className="min-w-0 flex-1">
            <h2 className="text-24 font-medium leading-sans text-foreground">
              扩散模型入门与关键论文
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-16 text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <FileText className="size-3 text-faint" /> 12 篇文献
              </span>
              <span className="text-faint">·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3 text-faint" /> 26 位作者
              </span>
              <span className="text-faint">·</span>
              <span>更新于 2026-08</span>
            </div>
          </div>
        </div>

        <div className="mb-2 mt-6 flex items-center justify-between">
          <span className="text-18 font-medium text-foreground">
            合集内文献
          </span>
          <span className="text-16 text-faint">按被引量排序</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        <ul className="flex flex-col" data-wiki-spot="分享预览">
          {SHARED_PAPERS.map(([title, meta, citations], index) => (
            <li
              key={title}
              className={`flex gap-3 py-3 ${index > 0 ? "border-t border-border-hairline" : ""}`}
            >
              <span className="w-5 shrink-0 pt-1 text-20 font-medium tabular-nums text-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-20 font-medium leading-sans text-foreground">
                  {title}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-16 text-faint">
                    {meta}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-16 font-medium tabular-nums text-brand-red">
                    <Quote className="size-3" /> {citations}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-16 text-faint">等共 12 篇文献</p>
      </div>

      <footer className="shrink-0 border-t border-border p-4">
        <div className="flex gap-3">
          <span className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-8 border border-border bg-background text-20 font-medium text-subtle">
            <Eye className="size-4" /> 打开
          </span>
          <span className="inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-8 bg-brand-red text-20 font-medium text-on-brand">
            <Download className="size-4" /> 收藏整个合集
          </span>
        </div>
      </footer>
    </div>
  );
}

function CollectionCover() {
  return (
    <div className="flex h-14 w-12 shrink-0 flex-col gap-1 rounded-4 border border-border bg-surface-1 p-2">
      <span className="text-12 font-medium leading-display-tight text-faint">
        合集
      </span>
      <span className="mt-1 h-1 w-full rounded-pill bg-border-strong" />
      <span className="h-1 w-3/4 rounded-pill bg-border" />
      <span className="h-1 w-full rounded-pill bg-border" />
    </div>
  );
}
