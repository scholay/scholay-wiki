import { Copy, Search } from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const CITATION_FORMATS = [
  "GB/T 7714",
  "BibTeX",
  "APA",
  "MLA",
  "Chicago",
] as const;

/** 独立引用生成器的 DOI 已解析状态 · 来源：CitationGeneratorPage。 */
export function WikiEmbedCitationGenerator() {
  return (
    <div
      className="w-full max-w-5xl overflow-hidden rounded-8 border border-border bg-background"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="citation-generator"
    >
      <div
        className="mx-auto w-full px-4 pb-20 pt-8 sm:px-6 sm:pt-12"
        style={{ maxWidth: 760 }}
      >
        <header>
          <p className="text-12 font-medium uppercase text-faint">
            Citation Generator
          </p>
          <h1 className="mt-2 text-32 font-medium leading-display-tight text-foreground">
            参考文献引用格式生成器
          </h1>
          <p className="mt-2 text-20 leading-paragraph text-muted-foreground">
            输入 DOI 自动解析，或手动录入文献信息，一键生成 GB/T
            7714（国标）、APA、MLA、Chicago、BibTeX 五种格式。
          </p>
        </header>

        <div className="mt-8 inline-flex rounded-12 bg-surface-2 p-1">
          <span className="inline-flex h-8 items-center rounded-8 bg-background px-4 text-16 font-medium text-foreground shadow-raised">
            DOI 解析
          </span>
          <span className="inline-flex h-8 items-center rounded-8 px-4 text-16 text-muted-foreground">
            手动录入
          </span>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 min-w-0 flex-1 items-center rounded-8 border border-border bg-background px-3 font-mono text-16 text-foreground">
              10.1038/nature14539
            </div>
            <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-8 bg-foreground px-4 text-16 font-medium text-on-dark">
              <Search className="size-4" />
              解析
            </span>
          </div>
          <p className="mt-2 text-12 text-faint">
            不知道 DOI？试试示例
            <span className="ml-1 text-brand-red">10.1038/nature14539</span>
          </p>
        </div>

        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-1">
            {CITATION_FORMATS.map((format, index) => (
              <span
                key={format}
                className={
                  index === 0
                    ? "inline-flex h-7 items-center rounded-8 bg-foreground px-3 text-16 font-medium text-on-dark"
                    : "inline-flex h-7 items-center rounded-8 px-3 text-16 font-medium text-muted-foreground"
                }
              >
                {format}
              </span>
            ))}
          </div>

          <div className="relative mt-3 min-w-0">
            <p className="break-words rounded-4 border border-border bg-surface-1 px-4 py-4 pr-20 text-20 leading-paragraph text-subtle">
              Jumper J, Evans R, Pritzel A, et al. Highly accurate protein
              structure prediction with AlphaFold[J]. Nature, 2021, 596:
              583–589.
            </p>
            <span className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-4 border border-border bg-background px-2 text-12 font-medium text-subtle">
              <Copy className="size-3" />
              复制
            </span>
          </div>
          <p className="mt-2 text-12 text-faint">
            单击切换格式 · 双击格式名设为默认
          </p>
        </section>

        <section className="mt-16 border-t border-border-hairline pt-8">
          <h2 className="text-24 font-medium text-foreground">关于引用格式</h2>
          <div className="mt-3 space-y-3 text-20 leading-paragraph text-muted-foreground">
            <p>
              <span className="font-medium text-subtle">GB/T 7714-2015</span>
              是中国国家标准《信息与文献
              参考文献著录规则》，国内学位论文与多数中文期刊均要求按此著录，形如「作者.
              题名[J]. 刊名, 年, 卷: 页码.」。
            </p>
            <p>
              <span className="font-medium text-subtle">
                APA / MLA / Chicago
              </span>
              为英文学术界主流格式，分别常见于社科、人文与历史学科；
              <span className="font-medium text-subtle">BibTeX</span>
              则用于 LaTeX 排版，可直接粘进 .bib 文件。
            </p>
            <p>
              自动解析依赖 DOI 在 Crossref
              的题录，个别文献字段可能缺失，可切到「手动录入」补全后再生成。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
