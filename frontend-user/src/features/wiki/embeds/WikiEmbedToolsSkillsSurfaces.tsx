import type { ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Calendar,
  ExternalLink,
  FileArchive,
  FolderOpen,
  Globe,
  Lock,
  MapPin,
  MessagesSquare,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

const TOOL_USE_CASES = [
  ["数据分析", "用 Pandas 与 NumPy 清洗和处理科研数据"],
  ["机器学习", "借助 Scikit-learn 构建预测与分类模型"],
  ["数据可视化", "用 Matplotlib 绘制科研图表"],
] as const;

const TOOL_SPEC_ROWS = [
  ["核心用途", "数据分析、统计建模、机器学习与科学计算"],
  ["面向群体", "科研人员、数据分析师与各学科学生"],
  ["适用场景", "数据清洗 · 统计分析 · 科研自动化"],
  ["使用流程", "安装解释器 → 配置计算库 → 运行分析 → 导出结果"],
  ["核心功能", "NumPy · Pandas · SciPy · Matplotlib · Scikit-learn"],
] as const;

/** 功能广场单个科研工具的详情页代表状态。 */
export function WikiEmbedFeatureToolDetail() {
  return (
    <article
      className="w-[min(100%,64rem)] overflow-hidden rounded-8 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="feature-tool-detail"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border bg-background px-6 py-3">
        <span className="inline-flex items-center gap-1 text-12 font-medium text-subtle">
          <ArrowLeft className="size-4" /> 功能广场
        </span>
        <span className="relative hidden w-full max-w-xs sm:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <span className="flex h-9 items-center rounded-8 border border-border-strong bg-surface-1 pl-9 pr-3 text-14 text-faint">
            搜索功能广场
          </span>
        </span>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-8 border border-border-soft bg-surface-2 text-24 font-medium text-subtle">
            P
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-24 font-medium text-foreground">Python</h2>
              <span className="inline-flex h-5 items-center rounded-pill border border-border bg-background px-2 text-12 font-medium text-foreground">
                免费
              </span>
              <span className="inline-flex h-5 items-center rounded-pill bg-brand-green/10 px-2 text-12 font-medium text-brand-green">
                开源
              </span>
            </div>
            <p className="mt-2 text-14 leading-paragraph text-subtle">
              科研数据分析与科学计算通用语言
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Globe className="size-4" /> python.org
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-4" /> 1991
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" /> United States
              </span>
              {["编程语言", "科研计算", "数据分析"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-4 bg-surface-2 px-2 py-1 text-12 text-subtle"
                >
                  {tag}
                </span>
              ))}
            </div>
            <span className="mt-4 inline-flex h-7 items-center justify-center gap-2 rounded-8 bg-primary px-3 text-12 font-medium text-primary-foreground">
              访问官网 <ExternalLink className="size-4" />
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <ToolSection title="这是什么">
              <p className="text-14 leading-paragraph text-subtle">
                Python
                以简洁语法和成熟的科学计算生态覆盖数据清洗、统计分析、建模与可视化，可在不同科研领域组织可复现的分析流程。
              </p>
            </ToolSection>

            <ToolSection title="典型使用场景">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {TOOL_USE_CASES.map(([title, description]) => (
                  <div
                    key={title}
                    className="rounded-8 border border-border bg-background p-3"
                  >
                    <p className="text-14 font-medium text-foreground">
                      {title}
                    </p>
                    <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </ToolSection>

            <ToolSection title="功能详情">
              <dl className="divide-y divide-border-soft">
                {TOOL_SPEC_ROWS.map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[5rem_1fr] gap-3 py-2"
                  >
                    <dt className="text-12 font-medium text-faint">{label}</dt>
                    <dd className="text-14 text-subtle">{value}</dd>
                  </div>
                ))}
              </dl>
            </ToolSection>
          </div>

          <aside className="space-y-4">
            <ToolSideCard title="关于厂商">
              <p className="flex items-center gap-2 text-14 font-medium text-foreground">
                <Building2 className="size-4 text-faint" /> Python Software
                Foundation
              </p>
              <p className="mt-1 text-12 text-faint">United States · 2001</p>
              <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
                负责推动、保护和发展 Python 编程语言及其全球社区。
              </p>
            </ToolSideCard>

            <ToolSideCard title="开源 / 替代">
              {[
                ["R", "统计分析与可视化生态成熟"],
                ["Julia", "面向高性能数值计算"],
                ["GNU Octave", "开源数值计算环境"],
              ].map(([name, note]) => (
                <div key={name} className="mb-2 last:mb-0">
                  <p className="text-14 font-medium text-foreground">{name}</p>
                  <p className="text-12 text-faint">{note}</p>
                </div>
              ))}
            </ToolSideCard>

            <ToolSideCard title="教程 / 资源">
              <p className="flex items-center gap-2 text-14 text-subtle">
                <BookOpen className="size-4 shrink-0 text-faint" /> Python
                官方教程
              </p>
              <p className="mt-2 flex items-center gap-2 text-14 text-subtle">
                <BookOpen className="size-4 shrink-0 text-faint" /> Python
                官方文档
              </p>
            </ToolSideCard>
          </aside>
        </div>
      </div>
    </article>
  );
}

function ToolSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 text-16 font-medium text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ToolSideCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-8 border border-border bg-background p-4">
      <p className="mb-3 text-12 font-medium uppercase text-faint">{title}</p>
      {children}
    </section>
  );
}

/** 社区 Skill 创建向导的“上传源码”代表状态。 */
export function WikiEmbedCommunitySkillPublish() {
  return (
    <section
      className="w-[min(100%,48rem)] rounded-8 bg-surface-1 px-4 py-6 sm:px-6"
      aria-hidden
      data-wiki-fixture="community-skill-publish"
    >
      <div className="mb-6 flex flex-wrap items-center gap-6">
        <span className="flex items-center gap-1 text-14 text-muted-foreground">
          <ArrowLeft className="size-4" /> 返回
        </span>
        <div className="flex items-center gap-3 text-14">
          <SkillStep number={1} label="上传源码" active />
          <span className="h-px w-16 bg-border" />
          <SkillStep number={2} label="填写信息" />
        </div>
      </div>

      <div className="rounded-8 border border-border bg-background p-6">
        <h3 className="text-16 font-medium text-foreground">选择上传方式</h3>
        <p className="mt-1 text-12 text-muted-foreground">
          选择以下任意一种方式上传你的 Skill 源码
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="flex items-center gap-2 rounded-8 border border-border-strong bg-surface-2 px-3 py-2 text-14 text-foreground">
            <FolderOpen className="size-4" /> 上传文件
          </span>
          <span className="flex items-center gap-2 rounded-8 border border-border bg-background px-3 py-2 text-14 text-muted-foreground opacity-50">
            <MessagesSquare className="size-4" /> 通过对话上传
            <span className="text-12 text-faint">即将上线</span>
          </span>
        </div>

        <div className="mt-4">
          <div className="flex flex-col items-center gap-3 rounded-8 border border-dashed border-border-strong bg-surface-1 px-4 py-10 text-center">
            <UploadCloud className="size-8 text-faint" />
            <p className="text-14 text-muted-foreground">
              拖拽 <span className="font-medium text-foreground">zip 文件</span>{" "}
              到此处，或用下方按钮选择文件夹 / zip
            </p>
            <p className="text-12 text-faint">
              支持常见文本与脚本文件；单文件 ≤10 MB，总包 ≤30 MB
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <span className="inline-flex h-7 items-center justify-center gap-1 rounded-8 border border-border bg-background px-3 text-12 font-medium text-foreground">
                <FolderOpen className="size-4" /> 选择文件夹
              </span>
              <span className="inline-flex h-7 items-center justify-center gap-1 rounded-8 border border-border bg-background px-3 text-12 font-medium text-foreground">
                <FileArchive className="size-4" /> 选择 zip 文件
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-12">
            <span className="flex items-center gap-1 text-foreground">
              <FileArchive className="size-4" /> systematic-review.zip
            </span>
            <span className="text-brand-green">或直接粘贴 SKILL.md 文本</span>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-14 font-medium text-foreground">
            选择内容来源
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-8 border border-brand-green bg-brand-green/5 px-4 py-3 text-14 text-foreground">
              <input
                type="radio"
                name="wiki-skill-source"
                checked
                readOnly
                className="size-4 accent-brand-green"
              />
              Skill 源码为原创
            </label>
            <label className="flex items-center gap-2 rounded-8 border border-border px-4 py-3 text-14 text-muted-foreground">
              <input
                type="radio"
                name="wiki-skill-source"
                readOnly
                className="size-4 accent-brand-green"
              />
              Skill 源码来自转载
            </label>
          </div>
        </div>

        <label className="mt-5 flex items-center justify-center gap-2 text-14 text-muted-foreground">
          <input
            type="checkbox"
            checked
            readOnly
            className="size-4 accent-brand-green"
          />
          我已阅读并同意
          <span className="text-brand-green">《Skill 发布安全规范》</span>
        </label>

        <div className="mt-5 flex justify-center">
          <span className="inline-flex h-8 items-center justify-center rounded-8 bg-primary px-10 text-14 font-medium text-primary-foreground">
            下一步
          </span>
        </div>
      </div>
    </section>
  );
}

function SkillStep({
  number,
  label,
  active = false,
}: {
  number: number;
  label: string;
  active?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={
          active
            ? "flex size-5 items-center justify-center rounded-pill bg-foreground text-12 text-on-dark"
            : "flex size-5 items-center justify-center rounded-pill bg-surface-2 text-12 text-faint"
        }
      >
        {number}
      </span>
      <span className={active ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </span>
  );
}

const MY_SKILLS = [
  {
    name: "系统综述工作流",
    tagline: "从问题框定到证据表与 PRISMA 检查",
    status: "审核中",
    tone: "amber",
    visibility: "public",
  },
  {
    name: "论文数字核验",
    tagline: "逐项检查表格、图注和正文中的数字一致性",
    status: "已通过",
    tone: "green",
    visibility: "public",
  },
  {
    name: "定性访谈编码",
    tagline: "整理访谈材料并生成可复核的主题编码表",
    status: "草稿",
    tone: "neutral",
    visibility: "private",
  },
] as const;

/** “我的 Skills”列表及其编辑弹窗的代表状态。 */
export function WikiEmbedCommunitySkillManagement() {
  return (
    <section
      className="relative min-h-[36rem] w-[min(100%,48rem)] overflow-hidden rounded-8 border border-border bg-background"
      aria-hidden
      data-wiki-fixture="community-skill-management"
    >
      <div className="px-4 py-6 sm:px-6">
        <header className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-20 font-medium text-foreground">
              <Sparkles className="size-5 text-brand-green" /> 我的 Skills
            </h3>
            <p className="mt-1 text-14 text-muted-foreground">
              上传纯文本 SKILL.md；公开需通过审核。
              <span className="ml-2 text-brand-green">浏览市场 →</span>
            </p>
          </div>
          <span className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-8 bg-primary px-3 text-12 font-medium text-primary-foreground">
            <Plus className="size-4" /> 新建 Skill
          </span>
        </header>

        <div className="space-y-2">
          {MY_SKILLS.map((skill) => (
            <article
              key={skill.name}
              className="flex items-center gap-3 rounded-8 border border-border bg-background p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-14 font-medium text-foreground">
                    {skill.name}
                  </p>
                  {skill.visibility === "public" ? (
                    <span
                      className={
                        skill.tone === "green"
                          ? "inline-flex h-5 items-center rounded-pill bg-brand-green/10 px-2 text-12 font-medium text-brand-green"
                          : "inline-flex h-5 items-center rounded-pill bg-warning-soft px-2 text-12 font-medium text-brand-amber"
                      }
                    >
                      {skill.status}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-12 text-muted-foreground">
                  {skill.tagline}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-8 text-faint">
                  <Pencil className="size-4" />
                </span>
                <span className="inline-flex size-8 items-center justify-center rounded-8">
                  {skill.visibility === "public" ? (
                    <Globe className="size-4 text-brand-green" />
                  ) : (
                    <Lock className="size-4 text-faint" />
                  )}
                </span>
                <span className="inline-flex size-8 items-center justify-center rounded-8 text-brand-red">
                  <Trash2 className="size-4" />
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="absolute inset-0 z-overlay bg-foreground/40 backdrop-blur-2" />
      <section className="absolute left-1/2 top-1/2 z-modal grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-8 border border-border bg-background p-6 shadow-overlay">
        <header className="flex flex-col gap-2 pr-6 text-left">
          <h4 className="text-16 font-medium text-foreground">编辑 Skill</h4>
          <p className="text-14 text-muted-foreground">
            改信息即时生效；上传新版本会替换内容，已公开的将重新过审。
          </p>
        </header>
        <X className="absolute right-4 top-4 size-4 text-foreground opacity-70" />

        <div className="space-y-4">
          <div className="space-y-2">
            {[
              "系统综述工作流",
              "从问题框定到证据表与 PRISMA 检查",
              "文献研究",
            ].map((value) => (
              <div
                key={value}
                className="flex h-9 w-full items-center rounded-8 border border-border bg-background px-3 text-14 text-foreground"
              >
                {value}
              </div>
            ))}
            <div className="flex justify-end">
              <span className="inline-flex h-7 items-center justify-center rounded-8 border border-border bg-background px-3 text-12 font-medium text-foreground">
                保存信息
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="mb-2 text-12 font-medium text-foreground">
              上传新版本（zip）
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 items-center justify-center gap-1 rounded-8 border border-border bg-background px-3 text-12 font-medium text-foreground">
                <FileArchive className="size-4" /> 选择 zip
              </span>
              <span className="flex h-8 min-w-36 flex-1 items-center rounded-8 border border-border bg-background px-2 text-12 text-faint">
                更新说明（可选）
              </span>
              <span className="inline-flex h-7 items-center justify-center rounded-8 bg-primary px-3 text-12 font-medium text-primary-foreground opacity-50">
                上传
              </span>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
