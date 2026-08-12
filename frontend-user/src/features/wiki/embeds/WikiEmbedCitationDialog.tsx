import { Copy, X } from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const CITATION_FORMATS = [
  "GB/T 7714",
  "BibTeX",
  "APA",
  "MLA",
  "Chicago",
] as const;

/** 引用本文弹窗的 APA 已生成状态 · 来源：product-mock CitationDialog。 */
export function WikiEmbedCitationDialog() {
  return (
    <div
      className="flex w-full max-w-4xl items-center justify-center overflow-hidden rounded-8 bg-foreground/10 p-4 sm:p-8"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="citation-dialog"
    >
      <section
        className="relative w-full max-w-2xl rounded-12 border border-border bg-background p-4 shadow-overlay sm:p-6"
        role="dialog"
        aria-label="引用本文"
      >
        <X className="absolute right-4 top-4 size-4 text-muted-foreground" />

        <header className="pr-8">
          <h2 className="text-24 font-medium text-foreground">引用本文</h2>
          <p className="mt-2 text-16 leading-paragraph text-muted-foreground">
            选择需要的引用格式，点右上「复制」即可粘贴到论文 / 笔记。
            双击格式名可设为默认。
          </p>
        </header>

        <div className="mt-4 flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {CITATION_FORMATS.map((format) => (
              <span
                key={format}
                className={
                  format === "APA"
                    ? "inline-flex h-7 shrink-0 items-center rounded-8 bg-foreground px-3 text-16 font-medium text-on-dark"
                    : "inline-flex h-7 shrink-0 items-center rounded-8 px-3 text-16 font-medium text-muted-foreground"
                }
              >
                {format}
              </span>
            ))}
          </div>
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-4 border border-border bg-background px-2 text-12 font-medium text-subtle">
            <Copy className="size-3" strokeWidth={2.5} />
            复制
          </span>
        </div>

        <p
          className="mt-4 overflow-y-auto break-words rounded-4 border border-border bg-surface-1 px-4 py-4 text-20 leading-paragraph text-subtle"
          style={{ maxHeight: 360 }}
        >
          Jumper, J., Evans, R., Pritzel, A., Green, T., Figurnov, M.,
          Ronneberger, O., Tunyasuvunakool, K., Bates, R., Žídek, A., Potapenko,
          A., et al. (2021). Highly accurate protein structure prediction with
          AlphaFold. <em>Nature, 596</em>, 583–589.
        </p>

        <p className="mt-3 text-12 text-faint">
          单击切换格式 · 双击格式名设为默认
        </p>
      </section>
    </div>
  );
}
