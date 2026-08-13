import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { RouteSEO } from "@/shared/components/RouteSEO";
import { WIKI_ARTICLES } from "../content";
import {
  WIKI_AUDIT_AREAS,
  WIKI_AUDIT_BASELINE,
  WIKI_MOCK_SURFACE_BASELINE,
} from "../coverage";
import { WIKI_EMBED_REGISTRY } from "../embeds/registry";

export function WikiCoveragePage() {
  const sourceCount = new Set(
    WIKI_ARTICLES.flatMap((article) => article.sourcePaths),
  ).size;

  return (
    <>
      <RouteSEO
        title="覆盖与核验 | Scholay Wiki"
        description="查看 Scholay Wiki 对页面、后端模块、Agent、小程序、技能、迁移和工具数据的审计覆盖。"
        keywords="Scholay Wiki 覆盖,Scholay 审计,Scholay 版本"
      />
      <section className="border-b border-border bg-surface-card">
        <div className="mx-auto max-w-page px-6 py-10 md:py-14">
          <p className="text-12 font-medium text-brand-red">
            VERIFIED COVERAGE
          </p>
          <h1 className="mt-2 font-display text-32 font-bold leading-display-tight text-foreground">
            覆盖与核验
          </h1>
          <p className="mt-3 max-w-reading text-14 leading-paragraph text-muted-foreground">
            本页说明“完整”的审计口径，而不是把词条数量当作完成度。动态生产配置和外部服务状态仍需在目标环境单独核验。
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-12 text-faint">
            <span>{WIKI_ARTICLES.length} 篇词条</span>
            <span aria-hidden>·</span>
            <span>{sourceCount} 个代码来源</span>
            <span aria-hidden>·</span>
            <span>{Object.keys(WIKI_EMBED_REGISTRY).length} 个界面示意</span>
            <span aria-hidden>·</span>
            <span>
              {WIKI_AUDIT_BASELINE.version} / {WIKI_AUDIT_BASELINE.shortCommit}
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-page px-6 py-10 md:py-14">
        <section aria-labelledby="coverage-areas">
          <h2
            id="coverage-areas"
            className="font-serif text-24 font-medium text-foreground"
          >
            静态审计范围
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {WIKI_AUDIT_AREAS.map((area) => (
              <article
                key={area.title}
                className="rounded-16 border border-border bg-surface-card p-4"
              >
                <CheckCircle2 className="size-icon-inline text-brand-green" />
                <p className="mt-4 text-12 font-medium text-muted-foreground">
                  {area.title}
                </p>
                <p className="mt-2 font-display text-28 font-bold text-foreground">
                  {area.value}{" "}
                  <span className="text-12 font-medium text-muted-foreground">
                    {area.unit}
                  </span>
                </p>
                <p className="mt-3 text-12 leading-paragraph text-muted-foreground">
                  {area.detail}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-16 border border-border bg-surface-card p-6">
          <h2 className="font-serif text-20 font-medium text-foreground">
            验收门禁
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-14 leading-paragraph text-subtle">
            <li>词条 slug、标题、章节和关联关系必须唯一且可解析。</li>
            <li>每个来源路径必须在当前仓库真实存在。</li>
            <li>
              后端一级模块、小程序页面、Agent feature 与 Skill 清单必须可从 Wiki
              检索。
            </li>
            <li>
              product-mock 的 {WIKI_MOCK_SURFACE_BASELINE.visible}{" "}
              个稳定可见表面必须逐组有注册、挂载和源文件证据；内部原子与动态宿主只可显式排除。
            </li>
            <li>类型检查、设计系统检查、Wiki 内容测试和生产构建必须通过。</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/wiki/all"
              className="text-12 font-medium text-brand-red hover:underline"
            >
              查看词条索引
            </Link>
            <Link
              to="/wiki/sources"
              className="text-12 font-medium text-brand-red hover:underline"
            >
              查看来源索引
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
