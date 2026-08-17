import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { MENUS, type Menu } from '@/app/menus';
import { cn } from '@/shared/lib/utils';

type Accent = 'green' | 'amber' | 'red';

type FeatureStory = {
  menuId: string;
  accent: Accent;
  eyebrow: string;
  headline: string;
  body: string;
  bullets: string[];
  cta: string;
};

/**
 * 营销向功能故事 —— 路由 / 图标 / 即将推出仍以 MENUS 为准，
 * 这里只补落地页常用的标题、卖点与 CTA 文案。
 */
const STORIES: FeatureStory[] = [
  {
    menuId: 'search',
    accent: 'green',
    eyebrow: '学术搜索',
    headline: '把「找得到」做成科研日常的默认能力',
    body: '从关键词到学者与出处，一次检索覆盖全文与库内资源。少翻页、少猜库名，更快落到可阅读的那一篇。',
    bullets: [
      '论文 / 学者 / 期刊统一入口，结果可直接打开阅读',
      '期刊库、数据库与 scholay 情报跟文献检索同一工作流',
      '筛选与历史检索可续接，工作不被打断',
    ],
    cta: '开始检索',
  },
  {
    menuId: 'claw',
    accent: 'amber',
    eyebrow: '智能助手',
    headline: '一个能跟你一起想问题的学术搭档',
    body: '把文献线索、摘要草稿、演示提纲交给对话推进。你负责判断与取舍，助手负责把重复劳动压下去。',
    bullets: [
      '自然语言提问，直接落到可执行的下一步',
      '可衔接检索结果与个人文献集',
      '为写作、审稿等能力提供统一入口',
    ],
    cta: '打开智能助手',
  },
  {
    menuId: 'prism',
    accent: 'green',
    eyebrow: '智能写作',
    headline: '从大纲到 LaTeX，把写作现场留在一处',
    body: '面向科研写作的长文工作台：结构、公式与引用不再拆散在多个工具里。先搭骨架，再推进到可投稿的文稿。',
    bullets: [
      '科研级 LaTeX 编辑与预览一体',
      '适合论文、方法章节与长文迭代',
      '与助手、文献集形成写作闭环',
    ],
    cta: '进入智能写作',
  },
  {
    menuId: 'peer-review',
    accent: 'red',
    eyebrow: '智能审稿',
    headline: '投稿前先过一轮诚实的预审',
    body: '在真正送外审之前，先拿到结构、论证与呈现层面的反馈清单。不是替你下结论，而是帮你看见盲点。',
    bullets: [
      '针对方法披露、论证链条与完整性给建议',
      '输出可勾选的修改清单，方便逐项消化',
      '与写作工作流衔接，改完再投',
    ],
    cta: '开始预审',
  },
  {
    menuId: 'library',
    accent: 'green',
    eyebrow: '我的资源',
    headline: '文献、期刊、稿件与过程产物，各归其位',
    body: '文献集以论文入库，期刊集以期刊入库，稿件集收写作与审稿稿，通用文件夹承接表格、问卷、矩阵与附信等过程产物。',
    bullets: [
      '文献集 / 期刊集：严格按单元类型收藏',
      '稿件集：站内写作稿与审稿上传稿',
      '文件夹：数据集、问卷、矩阵、审稿结果、Cover Letter…',
    ],
    cta: '打开我的资源',
  },
  {
    menuId: 'tools',
    accent: 'amber',
    eyebrow: 'Skills 广场',
    headline: '把好用的社区技能收进同一广场',
    body: '社区技能集中发现与启用。不必再在收藏夹和群文件里找「那一个脚本」。',
    bullets: [
      '社区技能统一浏览与安装',
      '按场景发现，而不是只靠口碑链接',
      '与站内工作流逐步打通',
    ],
    cta: '逛逛 scholay广场',
  },
];

const ACCENT: Record<
  Accent,
  {
    kicker: string;
    soft: string;
    solid: string;
    ring: string;
    check: string;
    mockGlow: string;
  }
> = {
  green: {
    kicker: 'text-brand-green',
    soft: 'bg-brand-green/10',
    solid: 'bg-brand-green text-background hover:bg-brand-green/90',
    ring: 'focus-visible:ring-brand-green/35',
    check: 'text-brand-green',
    mockGlow: 'from-brand-green/20 via-transparent to-brand-amber/10',
  },
  amber: {
    kicker: 'text-brand-amber',
    soft: 'bg-brand-amber/12',
    solid: 'bg-brand-amber text-background hover:bg-brand-amber/90',
    ring: 'focus-visible:ring-brand-amber/35',
    check: 'text-brand-amber',
    mockGlow: 'from-brand-amber/25 via-transparent to-brand-green/10',
  },
  red: {
    kicker: 'text-brand-red',
    soft: 'bg-brand-red/10',
    solid: 'bg-brand-red text-background hover:bg-brand-red/90',
    ring: 'focus-visible:ring-brand-red/35',
    check: 'text-brand-red',
    mockGlow: 'from-brand-red/18 via-transparent to-brand-amber/10',
  },
};

/**
 * 首页下部：产品功能营销带（落地页常见的交替分区叙事）。
 * 每段 = 卖点文案 + CTA + 产品示意；路由真源仍为 MENUS。
 */
export function HomeFeatureZones() {
  const reduce = useReducedMotion();
  const menuById = new Map(MENUS.map((m) => [m.id, m]));

  const bands = STORIES.map((story) => {
    const menu = menuById.get(story.menuId);
    return menu ? { story, menu } : null;
  }).filter((x): x is { story: FeatureStory; menu: Menu } => x != null);

  return (
    <div aria-label="产品功能" className="w-full">
      {/* 分区总起 —— 像常见产品站「Why / Features」开场 */}
      <section className="border-t border-border bg-surface-1/60 px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-2xs font-bold tracking-[0.12em] text-brand-green">
            PRODUCT CAPABILITIES
          </p>
          <h2 className="mt-3 font-display text-28 font-bold tracking-tight text-foreground sm:text-[2rem]">
            从检索到写作、审稿，一整条学术工作流
          </h2>
        </div>
      </section>

      {bands.map(({ story, menu }, index) => {
        const accent = ACCENT[story.accent];
        const reverse = index % 2 === 1;
        const Icon = menu.icon;

        return (
          <section
            key={menu.id}
            className={cn(
              'border-t border-border px-6 py-16 sm:py-20',
              reverse ? 'bg-surface-1/50' : 'bg-background',
            )}
          >
            <motion.div
              className={cn(
                'mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16',
              )}
              initial={reduce ? false : { opacity: 0, y: 28 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Copy */}
              <div className={cn(reverse && 'lg:order-2')}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex size-9 items-center justify-center rounded-lg',
                      accent.soft,
                      accent.kicker,
                    )}
                  >
                    <Icon className="size-4.5" strokeWidth={1.9} />
                  </span>
                  <p
                    className={cn(
                      'text-2xs font-bold tracking-[0.1em]',
                      accent.kicker,
                    )}
                  >
                    {story.eyebrow.toUpperCase()}
                    <span className="mx-2 text-faint">·</span>
                    <span className="tracking-normal text-faint">
                      {menu.englishName}
                    </span>
                  </p>
                  {menu.comingSoon && (
                    <span className="rounded-pill bg-brand-amber/15 px-2 py-0.5 text-[10px] font-bold text-brand-amber">
                      即将推出
                    </span>
                  )}
                </div>

                <h3 className="mt-4 max-w-lg font-display text-24 font-bold leading-tight tracking-tight text-foreground sm:text-28">
                  {story.headline}
                </h3>
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {story.body}
                </p>

                <ul className="mt-6 max-w-lg space-y-3">
                  {story.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2.5 text-sm text-foreground/90"
                    >
                      <Check
                        className={cn(
                          'mt-0.5 size-4 shrink-0',
                          accent.check,
                        )}
                        strokeWidth={2.4}
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    to={menu.href}
                    className={cn(
                      'inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2',
                      accent.solid,
                      accent.ring,
                    )}
                  >
                    {menu.comingSoon ? '先睹为快' : story.cta}
                    <ArrowRight className="size-4" strokeWidth={2.2} />
                  </Link>
                </div>
              </div>

              {/* Visual mock */}
              <div className={cn(reverse && 'lg:order-1')}>
                <FeatureMock
                  menuId={menu.id}
                  accent={story.accent}
                  label={menu.label}
                />
              </div>
            </motion.div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Product UI mocks (marketing visuals, not live widgets) ---------- */

function FeatureMock({
  menuId,
  accent,
  label,
}: {
  menuId: string;
  accent: Accent;
  label: string;
}) {
  const tone = ACCENT[accent];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5',
        'bg-gradient-to-br',
        tone.mockGlow,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />
      <div className="mb-3 flex items-center justify-between px-0.5">
        <span className="text-2xs font-semibold text-faint">{label}</span>
        <span className="flex gap-1">
          <span className="size-1.5 rounded-pill bg-border-strong" />
          <span className="size-1.5 rounded-pill bg-border-strong" />
          <span className="size-1.5 rounded-pill bg-border-strong" />
        </span>
      </div>
      <div className="rounded-xl border border-border bg-background/90 p-3 shadow-sm backdrop-blur-sm sm:p-4">
        {menuId === 'search' && <MockSearch />}
        {menuId === 'claw' && <MockClaw />}
        {menuId === 'prism' && <MockPrism />}
        {menuId === 'peer-review' && <MockReview />}
        {menuId === 'library' && <MockLibrary />}
        {menuId === 'tools' && <MockTools />}
      </div>
    </div>
  );
}

function MockSearch() {
  return (
    <div className="space-y-3">
      <div className="flex h-9 items-center rounded-lg border border-border bg-surface-1 px-3 text-xs text-faint">
        Transformer interpretability · 代表作
      </div>
      {[
        { title: 'Attention Is All You Need', meta: 'NeurIPS · 2017 · 高引' },
        { title: 'Towards Interpretable Transformers', meta: 'ICLR · 综述' },
        { title: 'Mechanistic Interpretability Survey', meta: '预印本 · 2024' },
      ].map((row, i) => (
        <div
          key={row.title}
          className={cn(
            'rounded-lg border border-border px-3 py-2.5',
            i === 0 && 'border-brand-green/30 bg-brand-green/5',
          )}
        >
          <p className="truncate text-xs font-semibold text-foreground">
            {row.title}
          </p>
          <p className="mt-0.5 text-2xs text-faint">{row.meta}</p>
        </div>
      ))}
    </div>
  );
}

function MockClaw() {
  return (
    <div className="space-y-2.5">
      <div className="ml-8 rounded-lg rounded-tr-sm bg-brand-amber/12 px-3 py-2 text-xs leading-relaxed text-foreground">
        帮我找 3 篇 Transformer 可解释性方向的代表作
      </div>
      <div className="mr-6 rounded-lg rounded-tl-sm border border-border bg-surface-1 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        先按综述与高引原论文各筛一轮，再给你一份可核对的短名单……
      </div>
      <div className="flex gap-1.5 pt-1">
        {['检索中', '整理引用', '写摘要'].map((s) => (
          <span
            key={s}
            className="rounded-pill bg-background px-2 py-1 text-[10px] font-semibold text-faint ring-1 ring-border"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function MockPrism() {
  return (
    <div className="overflow-hidden rounded-lg border border-border font-mono text-[11px] leading-relaxed">
      <div className="flex items-center gap-2 border-b border-border bg-surface-1 px-3 py-1.5 text-2xs text-faint">
        <span className="text-brand-green">main.tex</span>
        <span>·</span>
        <span>编译预览</span>
      </div>
      <div className="space-y-1 bg-background px-3 py-3 text-muted-foreground">
        <p>
          <span className="text-brand-red">\section</span>
          {'{Introduction}'}
        </p>
        <p className="pl-2">
          Recent advances in{' '}
          <span className="text-brand-green">transformer</span> models…
        </p>
        <p>
          <span className="text-brand-red">\begin</span>
          {'{equation}'}
        </p>
        <p className="pl-4 text-foreground">Attention(Q, K, V) = …</p>
        <p>
          <span className="text-brand-red">\end</span>
          {'{equation}'}
        </p>
      </div>
    </div>
  );
}

function MockReview() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-foreground">预审清单</p>
        <p className="text-2xs font-semibold text-brand-red">3 项待处理</p>
      </div>
      {[
        { ok: true, text: '摘要与贡献声明一致' },
        { ok: false, text: '方法披露：生成内容未标注边界' },
        { ok: false, text: '图表：缺误差条与样本量说明' },
        { ok: false, text: '相关工作：缺少 2024 关键综述' },
      ].map((item) => (
        <div
          key={item.text}
          className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2"
        >
          <span
            className={cn(
              'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
              item.ok
                ? 'border-brand-green bg-brand-green text-background'
                : 'border-border',
            )}
          >
            {item.ok && <Check className="size-2.5" strokeWidth={3} />}
          </span>
          <p
            className={cn(
              'text-2xs leading-snug',
              item.ok ? 'text-faint line-through' : 'text-foreground',
            )}
          >
            {item.text}
          </p>
        </div>
      ))}
    </div>
  );
}

function MockLibrary() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { name: '可解释性综述', n: 18 },
        { name: '投稿候选', n: 7 },
        { name: '方法学精读', n: 12 },
        { name: '开题草稿', n: 5 },
      ].map((f) => (
        <div
          key={f.name}
          className="rounded-lg border border-border bg-surface-1 px-3 py-3"
        >
          <div className="mb-2 size-8 rounded-md bg-brand-green/12" />
          <p className="truncate text-xs font-semibold text-foreground">
            {f.name}
          </p>
          <p className="mt-0.5 text-2xs text-faint">{f.n} 篇文献</p>
        </div>
      ))}
    </div>
  );
}

function MockTools() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {['PDF 解析', '引用格式', '术语表', '图表助手', '开题模板', '演示稿'].map(
        (name, i) => (
          <div
            key={name}
            className={cn(
              'flex aspect-square flex-col items-center justify-center rounded-lg border border-border px-1 text-center',
              i === 0 && 'border-brand-amber/35 bg-brand-amber/8',
            )}
          >
            <span className="mb-1.5 size-6 rounded-md bg-surface-1 ring-1 ring-border" />
            <span className="text-[10px] font-semibold leading-tight text-foreground">
              {name}
            </span>
          </div>
        ),
      )}
    </div>
  );
}
