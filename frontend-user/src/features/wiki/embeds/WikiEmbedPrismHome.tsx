import { PenTool } from "lucide-react";
import { PRISM_MOCK_THEME } from "./WikiEmbedPrismSurfaces";

/** `/prism` 一级 Hub：高级写作可进入，快速写作保持 disabled 占位。 */
export function WikiEmbedPrismHome() {
  return (
    <div
      className="flex min-h-80 w-[min(100%,52rem)] flex-col items-center justify-center bg-background px-6 py-10"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-home"
    >
      <div className="mb-6 flex items-center gap-2">
        <PenTool className="size-7 text-foreground" />
        <h1 className="m-0 font-serif text-24 font-medium text-foreground">
          智能写作
        </h1>
      </div>
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="flex h-36 flex-col items-center justify-center gap-2 rounded-16 border border-border bg-surface-card px-6 text-center">
          <span className="text-16 font-medium text-foreground">高级写作</span>
          <span className="text-12 text-muted-foreground">
            科研级 LaTeX 写作工作区
          </span>
        </section>
        <section
          className="flex h-36 flex-col items-center justify-center gap-2 rounded-16 border border-border bg-surface-card px-6 text-center opacity-70"
          aria-disabled
        >
          <span className="text-16 font-medium text-foreground">快速写作</span>
          <span className="text-12 text-faint">敬请期待</span>
        </section>
      </div>
    </div>
  );
}
