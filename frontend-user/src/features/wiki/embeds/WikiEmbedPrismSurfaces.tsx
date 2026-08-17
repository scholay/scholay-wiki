import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Calculator,
  Check,
  ChevronRight,
  ClipboardPaste,
  Download,
  FlaskConical,
  HelpCircle,
  Languages,
  Plus,
  Quote,
  RotateCcw,
  Search,
  Sparkles,
  Stethoscope,
  Trash2,
  UserPen,
  X,
} from "lucide-react";

export const PRISM_MOCK_THEME = {
  "--wiki-mock-space-2": "0.125rem",
  "--wiki-mock-space-6": "0.375rem",
  "--wiki-mock-space-10": "0.625rem",
  "--wiki-mock-space-14": "0.875rem",
  "--wiki-mock-space-20": "1.25rem",
  "--radius-4": "0.25rem",
  "--radius-8": "0.375rem",
  "--radius-12": "0.5rem",
  "--radius-16": "0.75rem",
  "--radius-20": "1rem",
  "--text-12": "0.625rem",
  "--text-14": "0.6875rem",
  "--text-16": "0.75rem",
  "--text-18": "0.8125rem",
  "--text-20": "0.875rem",
  "--text-24": "1rem",
  "--text-28": "1.25rem",
  "--text-32": "1.5rem",
  "--font-weight-medium": "700",
} as CSSProperties;

function DialogSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative grid w-full gap-4 overflow-hidden rounded-12 border border-border bg-background p-6 shadow-overlay ${className}`}
    >
      {children}
      <X className="absolute right-4 top-4 size-4 text-muted-foreground opacity-70" />
    </section>
  );
}

const PROFILE_ROWS = [
  ["实证 STEM · 通用", FlaskConical, "bg-brand-green/10", "text-brand-green"],
  ["生物医学实证", Stethoscope, "bg-danger-soft", "text-brand-red"],
  [
    "CS · 系统与机器学习",
    FlaskConical,
    "bg-brand-green/10",
    "text-brand-green",
  ],
  ["工程 · 系统研究", FlaskConical, "bg-surface-2", "text-subtle"],
  ["人文 · 论证型", FlaskConical, "bg-warning-soft", "text-brand-amber"],
  ["数学 · 定理证明", FlaskConical, "bg-surface-2", "text-subtle"],
  ["系统综述 · Meta 分析", FlaskConical, "bg-danger-soft", "text-brand-red"],
] as const;

export function WritingProfileDialog() {
  return (
    <DialogSurface className="max-w-3xl gap-0 p-0">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3 pr-12">
        <UserPen className="size-4" />
        <h3 className="text-16 font-medium text-foreground">写作画像</h3>
        <span className="text-12 font-normal text-faint">
          定调结构 · 时态 · 引用 · 严谨底线
        </span>
        <span className="flex-1" />
        <span className="inline-flex h-7 items-center gap-[var(--wiki-mock-space-6)] rounded-8 border border-border px-3 text-12 text-subtle">
          <Sparkles className="size-[var(--wiki-mock-space-14)]" /> AI 识别
        </span>
      </header>

      <div className="flex h-[26rem] min-h-0">
        <aside className="w-52 shrink-0 space-y-2 overflow-hidden border-r border-border p-2">
          <p className="px-2 pt-1 text-12 font-medium text-faint">学科论文</p>
          {PROFILE_ROWS.map(([name, Icon, chip, color], index) => (
            <div
              key={name}
              className={
                index === 1
                  ? "flex w-full items-center gap-2 rounded-8 bg-surface-2 px-2 py-[var(--wiki-mock-space-6)]"
                  : "flex w-full items-center gap-2 rounded-8 px-2 py-[var(--wiki-mock-space-6)]"
              }
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-8 ${chip}`}
              >
                <Icon className={`size-4 ${color}`} />
              </span>
              <span className="min-w-0 flex-1 truncate text-14 text-foreground">
                {name}
              </span>
              {index === 1 ? (
                <Check className="size-[var(--wiki-mock-space-14)] shrink-0 text-brand-green" />
              ) : null}
            </div>
          ))}
          <p className="px-2 pt-2 text-12 font-medium text-faint">
            文体（非论文正文）
          </p>
          <div className="flex w-full items-center gap-2 rounded-8 px-2 py-[var(--wiki-mock-space-6)]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-8 bg-surface-2">
              <Quote className="size-4 text-subtle" />
            </span>
            <span className="text-14 text-foreground">审稿回应函</span>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden p-[var(--wiki-mock-space-20)]">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-12 bg-danger-soft">
                <Stethoscope className="size-7 text-brand-red" />
              </span>
              <div className="min-w-0">
                <p className="text-20 font-medium text-foreground">
                  生物医学实证
                </p>
                <div className="mt-1 flex items-center gap-[var(--wiki-mock-space-6)]">
                  <span className="rounded-pill bg-surface-2 px-2 py-[var(--wiki-mock-space-2)] text-12 text-subtle">
                    学科人格
                  </span>
                  <span className="rounded-pill bg-brand-green/10 px-2 py-[var(--wiki-mock-space-2)] text-12 text-brand-green">
                    当前使用
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-12 font-medium text-faint">一篇会长成这样</p>
              <div className="mt-[var(--wiki-mock-space-6)] flex flex-wrap items-center gap-y-[var(--wiki-mock-space-6)]">
                {["引言", "方法（报告规范）", "结果", "讨论", "局限"].map(
                  (stage, index) => (
                    <span key={stage} className="flex items-center">
                      {index > 0 ? (
                        <ChevronRight className="mx-[var(--wiki-mock-space-2)] size-3 shrink-0 text-faint" />
                      ) : null}
                      <span
                        className={
                          index === 0
                            ? "rounded-8 border border-transparent bg-danger-soft px-2 py-1 text-12 font-medium text-foreground"
                            : "rounded-8 border border-border bg-surface-1 px-2 py-1 text-12 text-subtle"
                        }
                      >
                        {stage}
                      </span>
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="mt-4 rounded-8 border-l-2 border-l-brand-red bg-surface-1 px-3 py-[var(--wiki-mock-space-10)]">
              <p className="text-12 font-medium text-faint">写出来的味道</p>
              <p className="mt-1 font-serif text-14 italic leading-paragraph text-subtle">
                “主要终点事件率 12.4% vs 17.8%（HR 0.68，95% CI 0.52–0.89）。”
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-[var(--wiki-mock-space-6)]">
              {[
                ["结构约束", 5],
                ["量化密度", 5],
                ["客观克制", 5],
                ["表达自由", 1],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-12 text-muted-foreground">{label}</span>
                  <span className="flex gap-[var(--wiki-mock-space-2)]">
                    {[1, 2, 3, 4, 5].map((meter) => (
                      <span
                        key={meter}
                        className={
                          meter <= Number(value)
                            ? "h-[var(--wiki-mock-space-6)] w-[var(--wiki-mock-space-14)] rounded-4 bg-brand-red/60"
                            : "h-[var(--wiki-mock-space-6)] w-[var(--wiki-mock-space-14)] rounded-4 bg-surface-2"
                        }
                      />
                    ))}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-8 bg-surface-1 px-3 py-[var(--wiki-mock-space-10)]">
              <Sparkles className="mt-[var(--wiki-mock-space-2)] size-[var(--wiki-mock-space-14)] shrink-0 text-faint" />
              <div>
                <p className="text-12 font-medium text-faint">适用场景</p>
                <p className="mt-[var(--wiki-mock-space-2)] text-14 text-subtle">
                  临床 / 临床前 / 观察性生物医学研究论文
                </p>
              </div>
            </div>
          </div>

          <footer className="flex items-center justify-between border-t border-border px-4 py-[var(--wiki-mock-space-10)]">
            <p className="text-12 text-faint">
              更改在下一轮 AI 对话生效（会话按新画像重建）
            </p>
            <span className="inline-flex h-8 items-center rounded-8 bg-brand-green px-3 text-14 text-on-brand">
              当前使用中
            </span>
          </footer>
        </div>
      </div>
    </DialogSurface>
  );
}

const REVISION_ITEMS = [
  {
    seq: 1,
    quote: "请补充主要结局的样本量估算依据，并说明失访病例的处理方式。",
    interpretation: "方法部分缺少把握度与缺失数据处理。",
    severity: "major",
    status: "待处理",
    statusClass: "bg-surface-2 text-subtle",
    action: "采纳并修改",
  },
  {
    seq: 2,
    quote: "讨论中对因果关系的表述过强，请降低结论强度。",
    interpretation: "观察性证据不能写成确定因果。",
    severity: "minor",
    status: "已修改",
    statusClass: "bg-brand-green/10 text-brand-green",
    action: "澄清表述",
  },
  {
    seq: 3,
    quote: "请提供亚组分析所用的原始数据与预注册计划。",
    interpretation: "缺少作者才能提供的材料。",
    severity: "major",
    status: "待作者补充",
    statusClass: "bg-warning-soft text-brand-amber",
    action: "需作者补充",
  },
] as const;

export function RevisionDialog() {
  return (
    <DialogSurface className="max-w-2xl">
      <header className="flex items-center gap-[var(--wiki-mock-space-6)] pr-8">
        <ClipboardPaste className="size-4" />
        <h3 className="text-16 font-medium text-foreground">修改意见回应</h3>
        <span className="text-12 font-normal text-faint">1/3 已处理</span>
      </header>

      <div className="flex gap-2">
        <div className="min-h-16 flex-1 rounded-8 border border-border bg-background p-2 text-14 text-faint">
          粘贴任何修改意见：审稿人 decision letter / 导师批注 /
          合作者意见…（重新解析会覆盖现有条目）
        </div>
        <span className="inline-flex h-8 self-end items-center gap-1 rounded-8 bg-brand-green px-3 text-14 text-on-brand">
          <Sparkles className="size-[var(--wiki-mock-space-14)]" /> 拆条
        </span>
      </div>

      <div className="space-y-2">
        {REVISION_ITEMS.map((item) => (
          <article
            key={item.seq}
            className="rounded-8 border border-border p-2"
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-12 font-medium text-faint">
                #{item.seq}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-14 text-subtle">{item.quote}</p>
                <p className="mt-[var(--wiki-mock-space-2)] text-12 text-faint">
                  {item.interpretation}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.severity === "major" ? (
                  <span className="rounded-pill bg-brand-red/10 px-[var(--wiki-mock-space-6)] py-[var(--wiki-mock-space-2)] text-12 text-brand-red">
                    major
                  </span>
                ) : null}
                <span
                  className={`rounded-pill px-[var(--wiki-mock-space-6)] py-[var(--wiki-mock-space-2)] text-12 ${item.statusClass}`}
                >
                  {item.status}
                </span>
              </div>
            </div>
            <div className="mt-[var(--wiki-mock-space-6)] flex flex-wrap items-center gap-[var(--wiki-mock-space-6)]">
              <span className="inline-flex h-6 items-center rounded-4 border border-border bg-background px-1 text-12">
                {item.action}⌄
              </span>
              {item.action !== "需作者补充" ? (
                <span className="inline-flex h-6 items-center gap-1 rounded-8 border border-border px-2 text-12 text-subtle">
                  <Sparkles className="size-3" /> AI 处理此条
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-12 text-brand-amber">
                  <HelpCircle className="size-3" /> 需要你补充材料/数据 —— AI
                  不代编
                </span>
              )}
              <span className="inline-flex h-6 items-center gap-1 px-[var(--wiki-mock-space-6)] text-12 text-subtle">
                <Check className="size-3" /> 标记已改
              </span>
              <span className="inline-flex h-6 items-center gap-1 px-[var(--wiki-mock-space-6)] text-12 text-faint">
                <X className="size-3" /> 不采纳
              </span>
            </div>
            <div className="mt-[var(--wiki-mock-space-6)] min-h-7 w-full rounded-4 border border-border bg-surface-1 p-[var(--wiki-mock-space-6)] text-12 text-faint">
              该条的回应文本（会渲染进回应信）…
            </div>
          </article>
        ))}
      </div>

      <footer className="flex items-center justify-between">
        <p className="text-12 text-faint">
          铁律：major 条目别跳确认；缺数据的条目 AI 不代编。
        </p>
        <span className="inline-flex h-8 items-center gap-[var(--wiki-mock-space-6)] rounded-8 border border-border px-3 text-14 text-subtle">
          <Download className="size-[var(--wiki-mock-space-14)]" /> 导出回应信
        </span>
      </footer>
    </DialogSurface>
  );
}

export function TranslateDialog() {
  return (
    <DialogSurface className="max-w-lg">
      <header className="flex items-center gap-[var(--wiki-mock-space-6)] pr-8">
        <Languages className="size-4" />
        <h3 className="text-16 font-medium text-foreground">
          整篇翻译（两遍纪律）
        </h3>
      </header>

      <div className="space-y-2 text-14 text-subtle">
        {[
          {
            title: "第一步 · 逐节忠实直译",
            text: "一轮一节；数字/单位/引用键逐字保真；首译术语会写回术语表。每节译完在 diff 里确认应用，再译下一节。",
            action: "直译下一节",
            icon: Sparkles,
          },
          {
            title: "第二步 · 开新对话（关键）",
            text: "全部直译并应用后开一条新对话：润色必须在「只见译文」的干净上下文里做。同一篇论文继续写，文稿/术语表不丢。",
            action: "开新对话",
            icon: RotateCcw,
          },
          {
            title: "第三步 · 逐批单语润色",
            text: "只读译文去翻译腔（拆长句/补主语/时态惯例）；只改表达不改事实。",
            action: "开始润色前两节",
            icon: Sparkles,
          },
        ].map(({ title, text, action, icon: Icon }) => (
          <section
            key={title}
            className="rounded-8 border border-border p-[var(--wiki-mock-space-10)]"
          >
            <p className="font-medium text-foreground">{title}</p>
            <p className="mt-[var(--wiki-mock-space-2)] text-12 text-muted-foreground">
              {text}
            </p>
            <span className="mt-[var(--wiki-mock-space-6)] inline-flex h-7 items-center gap-1 rounded-8 border border-border px-2 text-12">
              <Icon className="size-3" /> {action}
            </span>
          </section>
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-12 font-medium text-faint">
            项目术语表（原文 | 译文，每行一条；agent 翻译时遵从并回填）
          </p>
          <span className="inline-flex h-6 items-center px-2 text-12 text-subtle">
            保存
          </span>
        </div>
        <pre className="min-h-24 whitespace-pre-wrap rounded-8 border border-border bg-surface-1 p-2 font-mono text-12 leading-code text-subtle">
          {
            "| 原文 | 译文 | 备注 |\n| --- | --- | --- |\n| 注意力机制 | attention mechanism | |\n| 主要终点 | primary endpoint | |"
          }
        </pre>
      </div>
    </DialogSurface>
  );
}

export function NumbersDialog() {
  return (
    <DialogSurface className="max-w-lg">
      <header className="flex items-center gap-[var(--wiki-mock-space-6)] pr-8">
        <Calculator className="size-4" />
        <h3 className="text-16 font-medium text-foreground">
          数字校验（生成段 ⊆ 源数据）
        </h3>
      </header>

      <pre className="min-h-20 whitespace-pre-wrap rounded-8 border border-border bg-surface-1 p-2 font-mono text-12 leading-code text-subtle">
        {"组别,n,事件率\n干预组,1,204,12.4%\n对照组,1,198,17.8%"}
      </pre>
      <div className="min-h-20 rounded-8 border border-border p-2 text-14 leading-paragraph text-subtle">
        干预组共 1,204 人，事件率为 12.4%；模型报告改善 73.4%，对照组为 17.8%。
      </div>
      <div className="flex items-center justify-between">
        <p className="text-12 text-faint">
          派生值（百分比变化/差值/合计）不在源表属正常，但请自行核对。
        </p>
        <span className="inline-flex h-8 items-center rounded-8 bg-brand-green px-3 text-14 text-on-brand">
          校验
        </span>
      </div>
      <div className="space-y-[var(--wiki-mock-space-6)]">
        <p className="text-12 text-brand-red">
          1 个数字在源数据中找不到（红色）—— 逐一核对，勿让编造数字进正文：
        </p>
        <div className="flex flex-wrap gap-1">
          {[
            ["1,204", true],
            ["12.4%", true],
            ["73.4%", false],
            ["17.8%", true],
          ].map(([number, found]) => (
            <span
              key={String(number)}
              className={
                found
                  ? "rounded-4 bg-brand-green/10 px-[var(--wiki-mock-space-6)] py-[var(--wiki-mock-space-2)] font-mono text-12 text-brand-green"
                  : "rounded-4 bg-danger-soft px-[var(--wiki-mock-space-6)] py-[var(--wiki-mock-space-2)] font-mono text-12 text-brand-red"
              }
            >
              {number}
            </span>
          ))}
        </div>
      </div>
    </DialogSurface>
  );
}

function QualityDialog() {
  return (
    <DialogSurface className="max-w-lg">
      <header className="pr-8">
        <h3 className="text-16 font-medium text-foreground">
          质量检查 · 确定性
        </h3>
      </header>

      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-8 border border-brand-red/30 bg-danger-soft p-[var(--wiki-mock-space-10)] text-14 text-brand-red">
          <AlertTriangle className="mt-[var(--wiki-mock-space-2)] size-[var(--wiki-mock-space-14)] shrink-0" />
          <span>
            发现 3 处 AI 可修的确定性问题（引用/交叉引用/前置）。一键交给 AI
            修复（消耗一个额度轮）。
          </span>
        </div>
        {[
          ["悬空文献引用（1）", "[@smith2024]"],
          ["未定义交叉引用（1）", "[@fig:overview]"],
          ["摘要数字无正文出处（1）", "73.4%"],
        ].map(([title, issue]) => (
          <section key={title}>
            <p className="mb-1 text-12 font-medium text-brand-red">{title}</p>
            <span className="rounded-4 bg-danger-soft px-[var(--wiki-mock-space-6)] py-[var(--wiki-mock-space-2)] text-12 text-brand-red">
              {issue}
            </span>
          </section>
        ))}
        <section className="space-y-1 rounded-8 border border-border px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-12 font-medium text-subtle">全文一致性（2）</p>
            <span className="inline-flex h-6 items-center rounded-8 border border-border px-2 text-12 text-subtle">
              让 AI 统一
            </span>
          </div>
          <p className="text-12 text-muted-foreground">
            · “large language model” 与 “LLM” 首次定义不一致
          </p>
          <p className="text-12 text-muted-foreground">
            · 方法部分混用过去时与现在时
          </p>
        </section>
        <section className="rounded-8 border border-border bg-surface-1 px-3 py-2 text-12 text-muted-foreground">
          <p className="font-medium text-subtle">作者 / 机构信息</p>
          <p className="mt-[var(--wiki-mock-space-2)]">缺少通讯作者邮箱。</p>
          <p className="mt-[var(--wiki-mock-space-2)] text-faint">
            在顶栏「作者/机构」里填写，AI 不代填（避免编造真实人名/单位）。
          </p>
        </section>
        <div className="flex justify-end">
          <span className="inline-flex h-8 items-center gap-[var(--wiki-mock-space-6)] rounded-8 bg-brand-green px-3 text-14 text-on-brand">
            <Sparkles className="size-[var(--wiki-mock-space-14)]" /> 让 AI 修复
          </span>
        </div>
      </div>
    </DialogSurface>
  );
}

/** Prism 质量检查弹窗；一次只冻结一个写作工具。 */
export function WikiEmbedPrismWritingToolsDialogs() {
  return (
    <div
      className="flex w-[min(100%,48rem)] flex-col items-center gap-6 bg-surface-1 p-4"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-writing-tools-dialogs"
    >
      <QualityDialog />
    </div>
  );
}

function StaticInput({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-7 min-w-0 items-center truncate rounded-8 border border-border bg-background px-2 text-14 text-subtle ${className}`}
    >
      {children}
    </span>
  );
}

export function AuthorsDialog() {
  return (
    <DialogSurface className="max-w-2xl">
      <header className="pr-8">
        <h3 className="text-16 font-medium text-foreground">作者与机构</h3>
      </header>

      <div className="space-y-4">
        <section>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-12 font-medium text-faint">
              机构（供作者上标关联）
            </p>
            <span className="inline-flex h-6 items-center gap-1 px-[var(--wiki-mock-space-6)] text-12 text-subtle">
              <Plus className="size-3" /> 添加机构
            </span>
          </div>
          <div className="flex items-center gap-[var(--wiki-mock-space-6)]">
            <span className="w-8 shrink-0 text-center text-12 text-faint">
              1
            </span>
            <StaticInput className="flex-[2]">Example University</StaticInput>
            <StaticInput className="flex-1">
              Institute for AI Research
            </StaticInput>
            <StaticInput className="w-20">Shanghai</StaticInput>
            <StaticInput className="w-20">China</StaticInput>
            <Trash2 className="size-[var(--wiki-mock-space-14)] shrink-0 text-faint" />
          </div>
        </section>

        <section>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-12 font-medium text-faint">作者（按署名顺序）</p>
            <span className="inline-flex h-6 items-center gap-1 px-[var(--wiki-mock-space-6)] text-12 text-subtle">
              <Plus className="size-3" /> 添加作者
            </span>
          </div>
          <div className="space-y-2">
            {[
              ["Lin", "Chen", "lin.chen@example.edu", true],
              ["Mateo", "Silva", "mateo.silva@example.edu", false],
            ].map(([given, family, email, corresponding]) => (
              <article
                key={String(email)}
                className="rounded-8 border border-border p-2"
              >
                <div className="flex items-center gap-[var(--wiki-mock-space-6)]">
                  <StaticInput className="flex-1">{given}</StaticInput>
                  <StaticInput className="flex-1">{family}</StaticInput>
                  <StaticInput className="flex-[1.5]">{email}</StaticInput>
                  <span className="flex shrink-0 items-center gap-1 text-12 text-subtle">
                    <span
                      className={
                        corresponding
                          ? "inline-flex size-4 items-center justify-center rounded-4 border border-brand-green bg-brand-green text-on-brand"
                          : "size-4 rounded-4 border border-border"
                      }
                    >
                      {corresponding ? <Check className="size-3" /> : null}
                    </span>
                    通讯
                  </span>
                  <Trash2 className="size-[var(--wiki-mock-space-14)] shrink-0 text-faint" />
                </div>
                <div className="mt-[var(--wiki-mock-space-6)] flex flex-wrap items-center gap-1">
                  <span className="text-12 text-faint">机构：</span>
                  <span className="rounded-pill border border-brand-green/50 bg-brand-green/10 px-[var(--wiki-mock-space-6)] py-[var(--wiki-mock-space-2)] text-12 text-foreground">
                    1. Example University
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer className="flex justify-end gap-2">
        <span className="inline-flex h-8 items-center px-3 text-14 text-subtle">
          取消
        </span>
        <span className="inline-flex h-8 items-center rounded-8 bg-brand-green px-3 text-14 text-on-brand">
          保存
        </span>
      </footer>
    </DialogSurface>
  );
}

function CitationDialog() {
  return (
    <DialogSurface className="max-w-xl">
      <header className="pr-8">
        <h3 className="text-16 font-medium text-foreground">
          插入引用 · 从文献库
        </h3>
      </header>
      <div className="relative">
        <Search className="absolute left-[var(--wiki-mock-space-10)] top-1/2 size-4 -translate-y-1/2 text-faint" />
        <div className="flex h-9 items-center rounded-8 border border-border bg-background pl-8 pr-3 text-14 text-faint">
          搜索文献库（标题 / 作者）…
        </div>
      </div>
      <ul className="space-y-1">
        {[
          [
            "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
            "Lewis 等 · 2020 · NeurIPS",
            "lewis2020rag",
          ],
          [
            "Dense Passage Retrieval for Open-Domain Question Answering",
            "Karpukhin 等 · 2020 · EMNLP",
            "karpukhin2020dpr",
          ],
          [
            "Atlas: Few-shot Learning with Retrieval Augmented Language Models",
            "Izacard 等 · 2022 · JMLR",
            "izacard2022atlas",
          ],
        ].map(([title, meta, key]) => (
          <li key={key} className="rounded-8 border border-border px-3 py-2">
            <p className="line-clamp-2 text-14 font-medium text-foreground">
              {title}
            </p>
            <p className="mt-[var(--wiki-mock-space-2)] line-clamp-1 text-12 text-muted-foreground">
              {meta}
            </p>
            <p className="mt-[var(--wiki-mock-space-2)] text-12 text-faint">
              插入键：[@{key}]
            </p>
          </li>
        ))}
      </ul>
    </DialogSurface>
  );
}

export function MathDialog() {
  return (
    <DialogSurface className="max-w-lg">
      <header className="pr-8">
        <h3 className="text-16 font-medium text-foreground">插入公式</h3>
      </header>
      <div className="flex min-h-[3.25rem] items-center rounded-8 border border-border bg-surface-1 p-3 font-serif text-28 text-foreground">
        E = mc<sup>2</sup>
      </div>
      <footer className="flex justify-end gap-2">
        <span className="inline-flex h-9 items-center px-4 text-14 text-subtle">
          取消
        </span>
        <span className="inline-flex h-9 items-center rounded-8 bg-brand-green px-4 text-14 text-on-brand">
          插入
        </span>
      </footer>
    </DialogSurface>
  );
}

/** Prism 文库引用弹窗；作者和公式入口只在正文中说明。 */
export function WikiEmbedPrismDocumentInsertDialogs() {
  return (
    <div
      className="flex w-[min(100%,42rem)] flex-col items-center gap-6 bg-surface-1 p-4"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-document-insert-dialogs"
    >
      <CitationDialog />
    </div>
  );
}

function VersionsDialog() {
  return (
    <DialogSurface className="max-w-lg">
      <header className="pr-8">
        <h3 className="text-16 font-medium text-foreground">
          版本历史 · document.md
        </h3>
      </header>
      <div>
        {[
          ["v19", "AI · 已采纳 · 2026-08-12 14:26", true],
          ["v18", "AI · 2026-08-12 13:52", false],
          ["v17", "手动 · 2026-08-11 21:08", false],
        ].map(([version, meta, current]) => (
          <div
            key={String(version)}
            className="flex items-center justify-between border-b border-border-hairline py-2 last:border-0"
          >
            <div className="flex items-center gap-2 text-14">
              <span className="font-medium text-foreground">{version}</span>
              <span className="text-faint">{meta}</span>
              {current ? (
                <span className="rounded-4 border border-brand-green px-2 py-[var(--wiki-mock-space-2)] text-12 text-brand-green">
                  当前
                </span>
              ) : null}
            </div>
            {!current ? (
              <span className="inline-flex h-8 items-center rounded-8 border border-border px-3 text-14 text-subtle">
                恢复此版本
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </DialogSurface>
  );
}

export function SelectionToolbar() {
  return (
    <div className="flex items-center gap-[var(--wiki-mock-space-2)] rounded-12 border border-border bg-popover p-[var(--wiki-mock-space-2)] shadow-overlay">
      <span className="flex items-center gap-1 rounded-8 px-2 py-1 text-12 text-subtle">
        <Sparkles className="size-3 text-brand-green" /> 编辑此处
      </span>
      <span className="h-4 w-px bg-border" />
      <span className="flex items-center gap-1 rounded-8 px-2 py-1 text-12 text-subtle">
        <Quote className="size-3" /> 引用此处
      </span>
    </div>
  );
}

export function InlineEditPrompt() {
  return (
    <section className="w-[23.75rem] max-w-full rounded-12 border border-border bg-popover p-[var(--wiki-mock-space-10)] shadow-overlay">
      <header className="mb-2 flex items-center gap-[var(--wiki-mock-space-6)]">
        <Sparkles className="size-[var(--wiki-mock-space-14)] text-brand-green" />
        <span className="text-12 font-medium text-foreground">
          就选中内容让 AI 修改
        </span>
        <span className="ml-auto text-12 text-faint">已选 86 字</span>
        <X className="size-[var(--wiki-mock-space-14)] text-faint" />
      </header>
      <div className="mb-2 flex flex-wrap gap-1">
        {["润色", "精简", "扩写", "改公式", "更学术"].map((action) => (
          <span
            key={action}
            className="rounded-pill border border-border-strong px-2 py-[var(--wiki-mock-space-2)] text-12 text-subtle"
          >
            {action}
          </span>
        ))}
      </div>
      <div className="flex items-end gap-[var(--wiki-mock-space-6)]">
        <div className="min-h-11 flex-1 rounded-8 border border-border-strong bg-background px-[var(--wiki-mock-space-10)] py-[var(--wiki-mock-space-6)] text-14 leading-paragraph text-faint">
          或描述你想怎么改…（Enter 提交）
        </div>
        <span className="mb-[var(--wiki-mock-space-2)] inline-flex size-8 shrink-0 items-center justify-center rounded-8 bg-foreground text-on-dark">
          <ArrowUp className="size-4" />
        </span>
      </div>
    </section>
  );
}

/** Prism 版本历史弹窗；选区工具条和行内编辑不与它同时出现。 */
export function WikiEmbedPrismHistoryInlineEdit() {
  return (
    <div
      className="flex w-[min(100%,36rem)] flex-col items-center gap-6 bg-surface-1 p-4"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-history-inline-edit"
    >
      <VersionsDialog />
    </div>
  );
}
