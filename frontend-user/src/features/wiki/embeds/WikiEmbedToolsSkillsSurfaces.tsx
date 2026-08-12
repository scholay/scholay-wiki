import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Code2,
  ExternalLink,
  FileArchive,
  FileCode2,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";

/** 功能广场单个科研工具的完整详情表面。 */
export function WikiEmbedFeatureToolDetail() {
  return (
    <article
      className="w-[min(100%,52rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="feature-tool-detail"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3 text-11 text-subtle">
        <ArrowLeft className="size-3" /> 功能广场
        <ChevronRight className="size-3 text-faint" />
        <span className="text-foreground">科研可视化</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-8 border border-border px-3 py-1">
          <Search className="size-3" /> 搜索功能广场
        </span>
      </header>

      <div className="grid lg:grid-cols-[1fr_16rem]">
        <main className="min-w-0 p-5">
          <div className="flex flex-col gap-4 sm:flex-row">
            <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-12 bg-brand-green-soft text-brand-green">
              <Code2 className="size-8" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-22 font-medium text-foreground">
                  Observable Plot
                </h2>
                <span className="rounded-pill bg-cat-green-soft px-2 py-1 text-9 text-cat-green">
                  数据可视化
                </span>
              </div>
              <p className="mt-2 text-11 leading-paragraph text-subtle">
                用简洁语法创建探索性统计图，适合论文前期分析与可复现图形原型。
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-10">
                <span className="inline-flex items-center gap-1 rounded-pill bg-brand-amber-soft px-2 py-1 text-brand-amber">
                  <Star className="size-3" /> 编辑推荐
                </span>
                <span className="rounded-pill bg-surface-2 px-2 py-1 text-subtle">
                  在线网站
                </span>
                <span className="rounded-pill bg-surface-2 px-2 py-1 text-subtle">
                  免费 / 开源
                </span>
              </div>
            </div>
            <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-8 bg-brand-red px-3 text-11 font-medium text-on-dark">
              访问官网 <ExternalLink className="size-3" />
            </span>
          </div>

          <section className="mt-6 border-t border-border pt-4">
            <h3 className="text-13 font-medium text-foreground">
              典型使用场景
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ["快速试图", "用 tidy 数据直接验证视觉编码"],
                ["方法探索", "交互比较不同分组与尺度"],
                ["成果迁移", "确认方案后迁入正式绘图链"],
              ].map(([title, detail], index) => (
                <div key={title} className="rounded-8 border border-border p-3">
                  <span className="inline-flex size-6 items-center justify-center rounded-pill bg-brand-green-soft text-10 font-medium text-brand-green">
                    {index + 1}
                  </span>
                  <p className="mt-2 text-11 font-medium text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-9 leading-paragraph text-faint">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 border-t border-border pt-4">
            <h3 className="text-13 font-medium text-foreground">核心功能</h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                "声明式 marks 与 transforms",
                "自动尺度、轴与图例",
                "响应式交互与组合",
                "JavaScript / Observable 生态",
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2 rounded-8 bg-surface-1 px-3 py-2 text-10 text-subtle"
                >
                  <Check className="size-3 text-brand-green" /> {feature}
                </li>
              ))}
            </ul>
          </section>
        </main>

        <aside className="space-y-3 border-t border-border bg-surface-1 p-4 lg:border-l lg:border-t-0">
          <DetailCard title="关于厂商" body="Observable, Inc. · 美国" />
          <DetailCard title="价格 & 授权" body="开源核心 · ISC License" />
          <DetailCard
            title="开源 / 替代"
            body="Vega-Lite · ggplot2 · ECharts"
          />
          <DetailCard
            title="教程 / 资源"
            body="快速开始 · API 文档 · 示例画廊"
          />
          <div className="rounded-8 bg-brand-amber-soft p-3 text-9 leading-paragraph text-subtle">
            外部工具由各自提供者负责；收录信息不构成安全、有效性或持续可用性保证。
          </div>
        </aside>
      </div>
    </article>
  );
}

function DetailCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-8 border border-border bg-surface-card p-3">
      <p className="text-10 font-medium text-foreground">{title}</p>
      <p className="mt-2 text-9 leading-paragraph text-faint">{body}</p>
    </section>
  );
}

/** 社区 Skill 的两步上传与发布工作面。 */
export function WikiEmbedCommunitySkillPublish() {
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="community-skill-publish"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowLeft className="size-3 text-faint" />
          <div>
            <h3 className="text-14 font-medium text-foreground">发布 Skill</h3>
            <p className="text-9 text-faint">上传源码并填写市场信息</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-10">
          <span className="inline-flex size-6 items-center justify-center rounded-pill bg-brand-red text-on-dark">
            1
          </span>
          <span className="font-medium text-brand-red">上传源码</span>
          <span className="h-px w-10 bg-border" />
          <span className="inline-flex size-6 items-center justify-center rounded-pill border border-border text-faint">
            2
          </span>
          <span className="text-faint">填写信息</span>
        </div>
      </header>

      <div className="grid md:grid-cols-2">
        <section className="border-b border-border p-4 md:border-b-0 md:border-r">
          <h4 className="text-12 font-medium text-foreground">选择上传方式</h4>
          <p className="mt-1 text-9 text-faint">
            文件夹、zip 或直接粘贴 SKILL.md
          </p>
          <div className="mt-3 flex rounded-8 bg-surface-1 p-1 text-10">
            <span className="flex-1 rounded-4 bg-surface-card px-3 py-2 text-center font-medium text-foreground shadow-raised">
              上传文件
            </span>
            <span className="flex-1 px-3 py-2 text-center text-faint">
              粘贴文本
            </span>
          </div>
          <div className="mt-3 flex min-h-32 flex-col items-center justify-center rounded-12 border border-dashed border-border bg-surface-1 p-4 text-center">
            <Upload className="size-6 text-brand-green" />
            <p className="mt-2 text-10 font-medium text-foreground">
              拖入文件夹或 zip
            </p>
            <p className="mt-1 text-9 text-faint">
              必须包含 SKILL.md；可带 scripts 与 resources
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-8 border border-brand-green/30 bg-brand-green-soft p-2">
            <FileArchive className="size-4 text-brand-green" />
            <span className="min-w-0 flex-1 truncate text-10 text-foreground">
              systematic-review.zip · 28 KB
            </span>
            <Check className="size-3 text-brand-green" />
          </div>
        </section>

        <section className="p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-pill bg-surface-2 text-10 text-faint">
              2
            </span>
            <h4 className="text-12 font-medium text-foreground">
              市场信息预览
            </h4>
          </div>
          <div className="mt-3 space-y-2">
            {[
              ["名称", "系统综述工作流"],
              ["简介", "从问题框定到证据表与 PRISMA 检查"],
              ["分类", "文献研究"],
              ["可见性", "Public · 提交后等待审核"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-9 font-medium text-faint">{label}</p>
                <div className="mt-1 rounded-8 border border-border px-3 py-2 text-10 text-subtle">
                  {value}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-8 bg-brand-amber-soft p-2 text-9 leading-paragraph text-subtle">
            <ShieldCheck className="size-3 shrink-0 text-brand-amber" />{" "}
            公开技能需通过审核；上传不自动获得工具权限。
          </div>
          <span className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1 rounded-8 bg-brand-red text-10 font-medium text-on-dark">
            发布 <ArrowRight className="size-3" />
          </span>
        </section>
      </div>
    </div>
  );
}

const SKILLS = [
  ["系统综述工作流", "v3 · Public", "审核中", "amber"],
  ["论文数字核验", "v2 · Public", "已通过", "green"],
  ["定性访谈编码", "v1 · Private", "草稿", "neutral"],
] as const;

/** 我的 Skills 列表、审核状态和编辑新版本面板。 */
export function WikiEmbedCommunitySkillManagement() {
  return (
    <div
      className="grid w-[min(100%,54rem)] gap-4 lg:grid-cols-[1fr_20rem]"
      aria-hidden
      data-wiki-fixture="community-skill-management"
    >
      <section className="overflow-hidden rounded-12 border border-border bg-surface-card">
        <header className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="font-serif text-16 font-medium text-foreground">
              我的 Skills
            </h3>
            <p className="mt-1 text-9 text-faint">
              管理上传、可见性、审核与版本
            </p>
          </div>
          <span className="inline-flex h-8 items-center gap-1 rounded-8 bg-brand-red px-3 text-10 font-medium text-on-dark">
            <Plus className="size-3" /> 新建 Skill
          </span>
        </header>
        <div className="divide-y divide-border-hairline">
          {SKILLS.map(([name, meta, status, tone]) => (
            <article key={name} className="flex items-center gap-3 p-4">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-1 text-brand-green">
                <FileCode2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-11 font-medium text-foreground">
                  {name}
                </p>
                <p className="mt-1 text-9 text-faint">{meta}</p>
              </div>
              <span
                className={
                  tone === "green"
                    ? "rounded-pill bg-brand-green-soft px-2 py-1 text-9 text-brand-green"
                    : tone === "amber"
                      ? "rounded-pill bg-brand-amber-soft px-2 py-1 text-9 text-brand-amber"
                      : "rounded-pill bg-surface-2 px-2 py-1 text-9 text-faint"
                }
              >
                {status}
              </span>
              <PencilLine className="size-3 text-faint" />
              <MoreHorizontal className="size-3 text-faint" />
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-12 border border-border bg-surface-card shadow-raised">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-12 font-medium text-foreground">编辑 Skill</h3>
            <p className="text-9 text-faint">公开版本更新后会重新审核</p>
          </div>
          <X className="size-3 text-faint" />
        </header>
        <div className="p-4">
          {[
            ["名称", "系统综述工作流"],
            ["分类", "文献研究"],
          ].map(([label, value]) => (
            <div key={label} className="mb-3">
              <p className="text-9 font-medium text-faint">{label}</p>
              <div className="mt-1 rounded-8 border border-border px-3 py-2 text-10 text-subtle">
                {value}
              </div>
            </div>
          ))}
          <span className="inline-flex h-8 w-full items-center justify-center rounded-8 bg-foreground text-10 font-medium text-on-dark">
            保存信息
          </span>
          <div className="my-4 h-px bg-border" />
          <p className="text-10 font-medium text-foreground">
            上传新版本（zip）
          </p>
          <div className="mt-2 flex items-center gap-2 rounded-8 border border-dashed border-border p-3">
            <Upload className="size-3 text-brand-green" />
            <span className="text-9 text-faint">选择新版本文件</span>
          </div>
          <p className="mt-4 inline-flex items-center gap-1 text-9 text-brand-red">
            <Trash2 className="size-3" /> 删除 Skill 需再次确认
          </p>
        </div>
      </section>
    </div>
  );
}
