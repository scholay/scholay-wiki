import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useStreamingPartial } from '../../api/stream';
import { parsePartialReviewer, type PartialReviewerOutput } from '../../lib/partial-parse';
import { recAvatarClasses, recBorderClasses, recLabel, recTextColor } from '../../lib/recommendation';
import { gradeFill, gradeTextColor } from '../../lib/grade';
import { MarkdownRenderer } from '@/shared/components/chat';
import { CyclingHint } from '@/shared/components/CyclingHint';
import type { ReviewReport, ReviewerRole, DimensionScore, LineComment, MacroComment } from '../../types';

// 审稿人"正在评议中"(首个 token 到达前 + 工具静默期)的循环打字等待文案 —— 减弱等待焦虑。
const REVIEWER_HINTS = [
  '正在逐段通读稿件',
  '正在核对实验设计与数据',
  '正在比对相关工作与基线',
  '正在检索佐证文献',
  '正在评估方法学严谨性',
  '正在斟酌各维度评分',
  '正在撰写逐句意见',
  '正在权衡贡献与不足',
  '正在整理可执行的修改建议',
  '马上给出审稿意见',
];

/**
 * 审稿人 A/B/C 详情面板(.pen `DYLbv` mainCol)。
 *
 * 区块:
 *   1) revHead     — 黑色头像 + 专长 + 大分数 + 推荐 pill
 *   2) ringSection — 4 维度评分卡(科学性/严谨性/创新性/可读性)
 *   3) cmtsCard    — 逐句意见 N 条 + 整体性评价 N 条 + 综合结论卡
 *
 * 三态:
 *   - report 有结构化字段     → 直接渲染结构化 panel
 *   - report 无 (审稿中)      → 订阅 SSE slot=reviewer:<role>, 实时渲染 agent 正在输出的 JSON
 *   - 老 report 仅 contentMd → 渲染 markdown 兜底
 *
 * 重入: 用户切走再回来时, hook 重新 fetch /stream, broker 立即返当前 snapshot
 * (累积 text + phase) + 继续 push delta。流刚结束 → broker 保留 30s, 也能拿到 done。
 * 流早已结束且 report 已写库 → reports query 会有数据, 直接走结构化分支。
 */
export interface ReviewerDetailPanelProps {
  role: ReviewerRole;            // alpha | beta | gamma
  submissionId?: number;
  report?: ReviewReport;
  status: string;                // submission status, 决定空态文案
  // preparing: compute_state=computing_methodology(方法论编排/审稿团组建中)。此阶段审稿人尚未开跑,
  // 面板显示"待评议"骨架且**不订阅 SSE**(订阅了只会拿到 done 空流);切到 reviewing 时 preparing→false,
  // SSE 这才订阅, 配合 SubscribePending 从头 catch 该审稿人的流, 避免漏帧。
  preparing?: boolean;
}

const ROLE_LETTER: Record<ReviewerRole, string> = {
  alpha: 'A',
  beta: 'B',
  gamma: 'C',
  chief: '主',
};

export function ReviewerDetailPanel({ role, submissionId, report, status, preparing }: ReviewerDetailPanelProps) {
  const letter = ROLE_LETTER[role];

  // 没 report 且非方法论编排阶段 → 订阅 SSE 看实时流。
  // 方法论阶段(preparing)不订阅: 那时审稿人还没开跑, 订阅只会拿 done 空流, 且 effect 不会因
  // compute_state 变化重订 → 漏掉后续真流。preparing 切 false(reviewing 起)时 enabled 翻 true,
  // effect 重跑、订阅, SubscribePending 从头 catch。
  const stream = useStreamingPartial({
    submissionId,
    enabled: !!submissionId && !report && !preparing,
    slot: `reviewer:${role}`,
  });

  if (!report) {
    // 只要流里有内容就渲染流式表单 —— **关键**: 含 done 之后、report 还没回填的"空窗期"。
    // done 时 stream.text 已是完整 JSON, 渲染出来就是最终表单; 等 report 一到无缝切到结构化
    // panel (同一份数据)。之前只在 phase==='computing' 才渲染, done 时掉回下面的 loading,
    // 等 report 拉回来才重渲 —— 就是用户报的"渲染完又整屏清空 + 闪回 loading"的根因。
    if (stream.text) {
      return (
        <StreamingReviewerView
          letter={letter}
          text={stream.text}
          done={stream.phase !== 'computing'}
          status={stream.status}
        />
      );
    }
    // 还没有任何流内容 → 等待态。三种文案:
    //   preparing(方法论编排中)→ "待评议",说明审稿团组建中;
    //   reviewing 且已开跑 → "正在评议中…"(优先显示实时进度 note);
    //   其它(已完成态历史回看缺流)→ "还没出意见"。
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-16 border border-dashed border-border bg-surface-1 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-faint" />
        <p className="text-base font-semibold text-muted-foreground">
          {preparing
            ? `审稿人 ${letter} · 待评议`
            : status === 'reviewing'
              ? `审稿人 ${letter} 正在评议中…`
              : `审稿人 ${letter} 还没出意见`}
        </p>
        {preparing ? (
          <p className="text-sm text-faint">
            审稿团正在组建(通读全文、制定审稿标准),稍后由该审稿人评议,意见会在这里实时填充。
          </p>
        ) : status === 'reviewing' ? (
          // 正在评议、首个 token 还没到 → 循环打字等待文案(比静态"会实时显示在这里"更活、不像卡死)
          <CyclingHint phrases={REVIEWER_HINTS} className="text-sm text-faint" />
        ) : (
          <p className="text-sm text-faint">页面会自动刷新, 完成后即可查看完整意见。</p>
        )}
      </div>
    );
  }

  // 后端没解析出结构化字段 (常因 agent 输出的 JSON 里有未转义内嵌引号, strict 解析失败)。
  // 用与流式态同一套**宽松解析器**从 contentMd 复原结构化, 渲染成跟流式一致的表单 ——
  // 彻底消除"流式时有表单、完成后变 JSON"的落差; 复原不出 (真·老 markdown 报告) 才退回
  // markdown 渲染 (而不是裸 <pre> 平铺一坨 JSON)。
  const view = report.dimensions && report.dimensions.length > 0 ? report : recoverReviewerReport(report);

  if (!view) {
    return (
      <div className="rounded-16 border border-border bg-surface-card px-5 py-4">
        <MarkdownRenderer text={report.contentMd} />
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-4">
      <ReviewerHead role={role} report={view} />
      <DimensionRing report={view} />
      <CommentsCard report={view} />
    </article>
  );
}

/**
 * 从 report.contentMd (可能是"旁白 + ```json + 原始JSON")里用宽松解析器复原结构化字段,
 * 填进一个合成 report。能抽到维度/逐句意见/推荐之一就返回, 否则返回 null (交给 markdown 兜底)。
 */
function recoverReviewerReport(report: ReviewReport): ReviewReport | null {
  if (!report.contentMd) return null;
  const p = parsePartialReviewer(report.contentMd);
  const hasAny =
    p.dimensions.length > 0 ||
    p.lineComments.length > 0 ||
    p.macroComments.length > 0 ||
    p.score != null ||
    !!p.recommendation;
  if (!hasAny) return null;
  return {
    ...report,
    expertise: report.expertise || p.expertise,
    score: report.score ?? p.score,
    recommendation: report.recommendation || p.recommendation,
    dimensions: p.dimensions,
    lineComments: p.lineComments,
    macroComments: p.macroComments,
    finalSummaryMd: report.finalSummaryMd || p.finalSummary,
  };
}

/* ─── 流式中间态 ───────────────────────────────────────────────────────── */

/**
 * agent 在写 JSON, 我们边解析边渲染成最终样式 ——
 * 用户看到 dimension 卡片 / line comment 卡片逐个填入, 而不是 raw JSON。
 *
 * 进度阶段:
 *   0) 文本未出现任何可识别字段 → 显示 thinking 占位
 *   1) 出现 expertise / score → revHead 区域显示, 大数字 placeholder
 *   2) dimensions 数组中每出现一个闭合对象 → 对应位置的 DimensionCard 填入
 *   3) line_comments / macro_comments / final_summary 同理
 *   4) 最终 done → 父组件切到完整结构化 panel (从 reports API 拿)
 */
function StreamingReviewerView({
  letter,
  text,
  done,
  status,
}: {
  letter: string;
  text: string;
  /** 流已结束、但 report 还没回填的"空窗期" —— 横幅改成"整理结果中"避免误显示"正在审稿"。 */
  done?: boolean;
  /** 实时进度 note (正在检索文献 / 通读稿件…),来自后端 broker.Status。 */
  status?: string;
}) {
  const p = parsePartialReviewer(text);

  // 4 维度 = 设计稿固定, 用 skeleton 占位让卡片数始终是 4
  const totalDims = 4;
  const placeholderDims = Math.max(0, totalDims - p.dimensions.length);

  const isThinking =
    p.expertise == null &&
    p.score == null &&
    p.dimensions.length === 0 &&
    p.lineComments.length === 0;

  if (isThinking) {
    // agent 落 JSON 前会先用自然语言"通读 + 分析"一段 (几百字), 它先于任何结构化字段到达。
    // 过去这里只转圈 + 字数, 用户干等;现在把这段实时旁白直接显示出来, 让等待变成可读进度。
    // 一旦 expertise / score / 首个维度被解析出, 本分支退场, 交给下方结构化表单逐卡填充
    // (那套流式渲染早已就绪)。
    const narration = leadingNarration(text);
    const tail = narration.length > 360 ? '…' + narration.slice(-360) : narration;
    return (
      <section className="flex flex-col gap-3 rounded-16 border border-brand-amber/40 bg-surface-card px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-amber" />
          <p className="text-sm font-bold text-foreground">审稿人 {letter} 正在通读稿件…</p>
          <p className="ml-auto shrink-0 font-mono text-xs text-faint">已生成 {p.totalChars} 字</p>
        </div>
        {tail ? (
          <p className="whitespace-pre-wrap text-sm leading-paragraph text-muted-foreground">
            {tail}
            <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-foreground align-middle" />
          </p>
        ) : (
          <p className="text-sm text-faint">正在调取稿件全文, 第一份评分马上就来…</p>
        )}
      </section>
    );
  }

  return (
    <article className="flex flex-col gap-4">
      {/* 进度条 — 让用户感受审稿人在持续输出 */}
      <div className="flex items-center gap-2.5 rounded-16 border border-brand-amber/40 bg-warning-soft px-4 py-2.5">
        <Loader2 className="h-4 w-4 animate-spin text-brand-amber" />
        <p className="flex-1 text-sm font-semibold text-brand-amber">
          {done ? (
            `审稿人 ${letter} 已完成 · 正在整理结果…`
          ) : (
            <>
              审稿人 {letter} 正在审稿 — 已生成 {p.dimensions.length}/{totalDims} 项维度评分
              {p.lineComments.length > 0 && ` · ${p.lineComments.length} 条逐句意见`}
              {p.macroComments.length > 0 && ` · ${p.macroComments.length} 条整体性评价`}
              {status && ` · ${status}`}
            </>
          )}
        </p>
        <p className="font-mono text-xs text-brand-amber/70">{p.totalChars} 字</p>
      </div>

      {/* 1) revHead — 提前用 partial 数据撑起来, 让用户看到成型 */}
      <StreamingHead letter={letter} partial={p} />

      {/* 2) 4 维度评分卡 + skeleton */}
      <section className="flex flex-col gap-3 rounded-16 border border-border bg-surface-card px-5 py-4">
        <p className="text-base font-bold text-foreground">结构化评分 · 四维度</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {p.dimensions.map((d, i) => <DimensionCard key={i} dim={d} />)}
          {Array.from({ length: placeholderDims }).map((_, i) => (
            <SkeletonDimension key={`skel-${i}`} />
          ))}
        </div>
      </section>

      {/* 3) 逐句意见 — 已闭合的对象逐个出现 */}
      {p.lineComments.length > 0 && (
        <section className="flex flex-col gap-3 rounded-16 border border-border bg-surface-card px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-[3px] rounded-4 bg-foreground" />
            <p className="text-sm font-bold text-foreground">逐句意见</p>
            <p className="flex-1 text-xs text-faint">已生成 {p.lineComments.length} 条</p>
          </div>
          {p.lineComments.map((lc, i) => <LineCommentCard key={i} item={lc} />)}
        </section>
      )}

      {/* 4) 整体性评价 */}
      {p.macroComments.length > 0 && (
        <section className="flex flex-col gap-3 rounded-16 border border-border bg-surface-card px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-[3px] rounded-4 bg-subtle" />
            <p className="text-sm font-bold text-foreground">整体性评价</p>
            <p className="flex-1 text-xs text-faint">已生成 {p.macroComments.length} 条</p>
          </div>
          {p.macroComments.map((mc, i) => <MacroCard key={i} item={mc} />)}
        </section>
      )}

      {/* 5) 综合结论 — partial 部分文本会先出现, 让用户看到正在写 */}
      {p.finalSummary && (
        <section className="flex flex-col gap-2 rounded-16 border border-brand-amber/60 bg-surface-card px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-[3px] rounded-4 bg-brand-amber" />
            <p className="text-sm font-bold text-foreground">综合结论与推荐理由</p>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-faint">
              <Loader2 className="h-3 w-3 animate-spin" /> 写作中
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-paragraph text-subtle">{p.finalSummary}</p>
        </section>
      )}
    </article>
  );
}

function StreamingHead({ letter, partial }: { letter: string; partial: PartialReviewerOutput }) {
  const rec = partial.recommendation;
  const recCls = rec ? recBorderClasses(rec) : '';
  return (
    <header className="flex items-start justify-between gap-4 rounded-16 border border-border bg-surface-card px-5 py-4">
      {/* 头像 + 名称:名称只剩单行(匿名审稿已去掉专长),用 items-center 让名称与头像垂直居中对齐 */}
      <div className="flex items-center gap-3">
        {/* 流式中: rec 一旦解析出来就按结果上色, 之前 (unknown) 走深色兜底 */}
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-pill transition-colors',
            recAvatarClasses(rec),
          )}
        >
          <span className="font-serif text-lg font-bold">{letter}</span>
        </div>
        {/* 匿名审稿:不展示审稿人专长/领域(只显示 A/B/C),避免泄露选了哪个专科审稿人 */}
        <p className="text-base font-bold text-foreground">审稿人 {letter}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-end gap-1">
          <span
            className={cn(
              'font-serif text-3xl font-bold transition-colors',
              rec ? recTextColor(rec) : partial.score != null ? 'text-foreground' : 'text-faint',
            )}
          >
            {partial.score != null ? partial.score : '--'}
          </span>
          <span className="text-sm text-faint">/ 100</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">推荐:</span>
          {rec ? (
            <span className={cn('rounded-4 px-2 py-0.5 text-xs font-bold', recCls)}>{recLabel(rec)}</span>
          ) : (
            <span className="rounded-4 border border-dashed border-border bg-surface-1 px-2 py-0.5 text-xs text-faint">
              评估中
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

/** 占位 dimension card —— 维度未生成时的灰色 skeleton */
function SkeletonDimension() {
  return (
    <div className="flex animate-pulse flex-col gap-2 rounded-12 border border-dashed border-border bg-surface-1 p-3.5">
      <div className="flex items-end justify-between">
        <div className="h-4 w-16 rounded-4 bg-border" />
        <div className="h-7 w-10 rounded-4 bg-border" />
      </div>
      <div className="h-3 w-full rounded-4 bg-border" />
      <div className="h-3 w-4/5 rounded-4 bg-border" />
    </div>
  );
}

/* ─── 1) revHead ──────────────────────────────────────────────────────── */

function ReviewerHead({ role, report }: { role: ReviewerRole; report: ReviewReport }) {
  const letter = ROLE_LETTER[role];
  const rec = report.recommendation ?? '——';
  const recCls = recBorderClasses(rec);

  return (
    <header className="flex items-start justify-between gap-4 rounded-16 border border-border bg-surface-card px-5 py-4">
      {/* 头像 + 名称:名称只剩单行(匿名审稿已去掉专长),用 items-center 让名称与头像垂直居中对齐 */}
      <div className="flex items-center gap-3">
        {/* 头像按该审稿人的推荐结果上色 (绿/黄/红), 跟状态栏 / tab 圆点一致 */}
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-pill',
            recAvatarClasses(rec),
          )}
        >
          <span className="font-serif text-lg font-bold">{letter}</span>
        </div>
        {/* 匿名审稿:不展示审稿人专长/领域(只显示 A/B/C),避免泄露选了哪个专科审稿人 */}
        <p className="text-base font-bold text-foreground">审稿人 {letter}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-end gap-1">
          {/* 分数也按结果上色, 强化"这位审稿人倾向" */}
          <span className={cn('font-serif text-3xl font-bold', recTextColor(rec))}>
            {report.score ?? '—'}
          </span>
          <span className="text-sm text-faint">/ 100</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">推荐:</span>
          <span className={cn('rounded-4 px-2 py-0.5 text-xs font-bold', recCls)}>{recLabel(rec)}</span>
        </div>
      </div>
    </header>
  );
}

/* ─── 2) 4 维度评分 ──────────────────────────────────────────────────── */

function DimensionRing({ report }: { report: ReviewReport }) {
  const dims = report.dimensions ?? [];
  return (
    <section className="flex flex-col gap-3 rounded-16 border border-border bg-surface-card px-5 py-4">
      <header className="flex items-center justify-between">
        <p className="text-base font-bold text-foreground">结构化评分 · 四维度</p>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {dims.map((d) => (
          <DimensionCard key={d.name} dim={d} />
        ))}
      </div>
    </section>
  );
}

function DimensionCard({ dim }: { dim: DimensionScore }) {
  return (
    <div className="flex flex-col gap-2 rounded-12 border border-border bg-surface-1 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">{dim.name}</p>
        <GradeRing grade={dim.grade} />
      </div>
      <p className="text-xs leading-paragraph text-muted-foreground">{dim.comment}</p>
    </div>
  );
}

/** 等级评分环 — 按 A/B/C 三档上色 (绿/橘/红), 环长度按等级近似。 */
function GradeRing({ grade }: { grade: string }) {
  const pct = Math.round(gradeFill(grade) * 100);
  // conic-gradient 是动态角度, 属"动态计算尺寸", 允许内联 style (globals 例外项)。
  const ringStyle = {
    background: `conic-gradient(currentColor ${pct * 3.6}deg, var(--color-border) 0deg)`,
  };
  return (
    <span
      className={cn('relative inline-flex size-11 shrink-0 items-center justify-center', gradeTextColor(grade))}
      title={`等级 ${grade}`}
    >
      <span className="absolute inset-0 rounded-pill" style={ringStyle} aria-hidden="true" />
      {/* 中心挖空成环: 内圆用卡片底色盖住 */}
      <span className="absolute inset-[3px] rounded-pill bg-surface-1" aria-hidden="true" />
      <span className="relative font-serif text-base font-bold">{grade}</span>
    </span>
  );
}

/* ─── 3) 主观评论 + 整体性 + 综合结论 ──────────────────────────────── */

function CommentsCard({ report }: { report: ReviewReport }) {
  const lineComments = report.lineComments ?? [];
  const macros = report.macroComments ?? [];
  return (
    <section className="flex flex-col gap-3.5 rounded-16 border border-border bg-surface-card px-5 py-4">
      <header className="flex items-center justify-between">
        <p className="text-base font-bold text-foreground">主观评论与建议</p>
        <p className="text-xs text-faint">客观评估难免主观, 仅供作者参考</p>
      </header>

      {/* 逐句意见 */}
      {lineComments.length > 0 && (
        <>
          <SectionHead barCls="bg-foreground" title="逐句意见" subtitle="针对原文具体语句的可定位修改建议" count={lineComments.length} />
          {lineComments.map((lc, i) => (
            <LineCommentCard key={i} item={lc} />
          ))}
        </>
      )}

      {/* 整体性评价 */}
      {macros.length > 0 && (
        <>
          <SectionHead barCls="bg-subtle" title="整体性评价" subtitle="针对结构 / 逻辑 / 叙事等宏观层面" count={macros.length} />
          {macros.map((m, i) => (
            <MacroCard key={i} item={m} />
          ))}
        </>
      )}

      {/* 综合结论 */}
      {report.finalSummaryMd && (
        <>
          <SectionHead barCls="bg-brand-amber" title="综合结论与推荐理由" subtitle="结合上述意见的最终判断" />
          <div className="flex flex-col gap-2 rounded-12 border border-brand-amber/60 bg-surface-card px-4 py-3.5">
            <p className="whitespace-pre-wrap text-sm leading-paragraph text-subtle">
              {report.finalSummaryMd}
            </p>
            <p className="pt-2 text-xs italic text-muted-foreground">
              最终结果由主审在汇总三位审稿人意见后决议。
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function SectionHead({
  barCls,
  title,
  subtitle,
  count,
}: {
  barCls: string;
  title: string;
  subtitle: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <div className={cn('h-5 w-[3px] rounded-4', barCls)} />
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="flex-1 text-xs text-faint">{subtitle}</p>
      {count != null && <p className="text-xs font-semibold text-faint">{count} 条</p>}
    </div>
  );
}

function LineCommentCard({ item }: { item: LineComment }) {
  const sevCls = severityClasses(item.severity);
  return (
    <div className="flex flex-col gap-2 rounded-12 border border-border bg-surface-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-4 bg-surface-2 px-2 py-0.5 text-xs font-bold text-subtle">
          {item.location}
        </span>
        <span className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-xs text-muted-foreground">
          {item.dimension}
        </span>
        <span className={cn('ml-auto rounded-4 px-2 py-0.5 text-xs font-bold', sevCls)}>
          {item.severity}
        </span>
      </div>
      {item.quote && (
        <blockquote className="rounded-8 border-l-2 border-border-strong bg-surface-card px-3 py-2.5 text-sm italic text-subtle">
          {item.quote}
        </blockquote>
      )}
      <KvRow k="问题" v={item.issue} />
      <KvRow k="同行处理" v={item.peer_practice} dim />
      <KvRow k="建议" v={item.suggestion} />
    </div>
  );
}

function MacroCard({ item }: { item: MacroComment }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-12 border border-border bg-surface-1 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="rounded-4 bg-surface-2 px-2 py-0.5 text-xs text-subtle">
          {item.aspect}
        </span>
        <span className="ml-auto text-xs font-semibold text-subtle">{item.stance}</span>
      </div>
      <p className="text-sm leading-paragraph text-subtle">{item.body}</p>
    </div>
  );
}

function KvRow({ k, v, dim = false }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className="flex gap-2.5">
      <span className="w-14 shrink-0 text-2xs font-bold text-faint">{k}</span>
      <p
        className={cn(
          'flex-1 text-sm leading-paragraph',
          dim ? 'text-muted-foreground' : 'text-subtle',
        )}
      >
        {v}
      </p>
    </div>
  );
}

/* ─── helpers ────────────────────────────────────────────────────────── */

/**
 * thinking 阶段的可读旁白 —— 取 agent 输出里 JSON 对象 / ```json 围栏开始之前的自然语言部分。
 * 流式中一旦出现首个结构化字段 (expertise/score/维度…), 上层 isThinking=false, 不会再走到这里;
 * 所以这里截到第一个 ``` 或 { 之前即可, 避免把刚冒头的 JSON 头也显示出来。
 */
function leadingNarration(text: string): string {
  const fence = text.indexOf('```');
  const brace = text.indexOf('{');
  const cut = Math.min(
    fence >= 0 ? fence : text.length,
    brace >= 0 ? brace : text.length,
  );
  return text.slice(0, cut).trim();
}

function severityClasses(sev: string): string {
  switch (sev) {
    case '必改':
      return 'bg-danger-soft text-brand-red';
    case '建议':
      return 'bg-warning-soft text-brand-amber';
    case '参考':
      return 'bg-surface-2 text-muted-foreground';
    default:
      return 'bg-surface-2 text-muted-foreground';
  }
}
