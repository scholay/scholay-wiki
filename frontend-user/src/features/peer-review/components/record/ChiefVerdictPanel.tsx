import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useStreamingPartial } from '../../api/stream';
import { effectiveResult, parsePartialChief } from '../../lib/partial-parse';
import { recLabel, recTextColor } from '../../lib/recommendation';
import { MarkdownRenderer } from '@/shared/components/chat';
import type { ReviewReport, ReviewerResponse } from '../../types';

/**
 * Tab 5 - 主审决议(.pen `p9kpKj` mainArea)。
 *
 * 区块:
 *   1) rulingPara    — 左侧 2px 黑色引线 + Playfair italic 长段落 + 综合分概览
 *   2) synthHead     — 「审稿人综合意见」标题 + 副标题
 *   3) revA/B/C      — 三位审稿人各一节: 顶部 01/02/03 编号 + 综合意见 + 主审判断
 *   4) finalSec      — 「确认结果」结果 + 必改 + 建议 + 截止期 + 主审签署
 *
 * chief report 为空 → 空态(loading); chief 老 report (无结构化字段)→ markdown 兜底。
 */
export interface ChiefVerdictPanelProps {
  submissionId?: number;
  /** chief role 的 report */
  chief?: ReviewReport;
  /** 三位审稿人的 reports, 用于在主审段渲染各自分数 */
  reviewers: { alpha?: ReviewReport; beta?: ReviewReport; gamma?: ReviewReport };
  status: string;
}

export function ChiefVerdictPanel({ submissionId, chief: chiefProp, reviewers, status }: ChiefVerdictPanelProps) {
  // 主审 chief slot 流 — 主审正在写决议时实时显示。同 ReviewerDetailPanel 重入逻辑。
  // 评审 top#3:必须等 3 位审稿人都出报告(chief slot 才在后端 active)再订阅,否则在 computing_methodology
  // 期就订阅拿到空流、且 deps 不变永不重订阅 → 主审直播被整段错过(只能靠轮询蹦出来)。reviewersAllDone
  // 由 false→true 触发 useStreamingPartial 重订阅,SubscribePending 从头回放主审决议流。
  const reviewersAllDone = !!reviewers.alpha && !!reviewers.beta && !!reviewers.gamma;
  const stream = useStreamingPartial({
    submissionId,
    enabled: !!submissionId && !chiefProp && reviewersAllDone,
    slot: 'reviewer:chief',
  });

  if (!chiefProp) {
    // 同 ReviewerDetailPanel: 流里有内容就渲染 (含 done 之后 chief report 还没回填的空窗期),
    // 避免"渲染完决议又闪回 loading 再重渲"。
    if (stream.text) {
      return (
        <StreamingChiefView
          text={stream.text}
          reviewers={reviewers}
          done={stream.phase !== 'computing'}
          status={stream.status}
        />
      );
    }
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-surface-1 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-faint" />
        <p className="text-base font-semibold text-muted-foreground">
          {status === 'reviewing' ? '主审正在汇总三位审稿人的意见…' : '主审尚未给出决议'}
        </p>
        <p className="text-sm text-faint">
          {stream.status ?? '三位审稿人全部完成后, 主审会进入决议阶段。'}
        </p>
      </div>
    );
  }

  // 后端没解析出结构化字段时, 用宽松解析器从 contentMd 复原 (同 ReviewerDetailPanel);
  // 复原出的 chief 直接顶替 chiefProp 走下面的结构化渲染; 复原不出才退回 markdown。
  const chief =
    chiefProp.rulingParagraphMd || chiefProp.reviewerResponses || chiefProp.mustFix
      ? chiefProp
      : recoverChiefReport(chiefProp);
  if (!chief) {
    return (
      <div className="rounded-md border border-border bg-surface-card px-5 py-4">
        <MarkdownRenderer text={chiefProp.contentMd} />
      </div>
    );
  }

  const responsesByReviewer = mapReviewerResponses(chief.reviewerResponses);
  // 结果/分数缺失 (旧脏数据 / 后端整体解析失败) 时从 contentMd 复原, 跟状态栏 / 侧栏一致。
  const eff = effectiveResult(chief);
  const decision = eff.recommendation ?? '——';
  const decisionTheme = recTextColor(decision);

  return (
    <article className="flex flex-col gap-7">
      {/* 1) 主审 ruling 段 —— 概要(强, Playfair italic) + 详细(弱, 可折叠默认展开) */}
      {(chief.rulingSummaryMd || chief.rulingParagraphMd) && (
        <section className="flex flex-col gap-3.5 border-l-2 border-foreground py-4 pl-7">
          <p className="text-xs font-bold text-faint">SCHOLAY 主审</p>
          <FoldableAnswer
            summary={chief.rulingSummaryMd}
            detail={chief.rulingParagraphMd}
            summaryClassName="font-serif text-xl italic font-semibold leading-paragraph text-foreground"
            detailClassName="text-base leading-paragraph text-subtle"
          />
          {eff.score != null && (
            <p className="text-sm font-semibold text-muted-foreground">
              综合分 {eff.score} / 100
              {decision !== '——' && ` · ${recLabel(decision)}`}
            </p>
          )}
        </section>
      )}

      {/* 2) synthHead */}
      <header className="flex items-end justify-between border-b-2 border-foreground pb-1">
        <h3 className="font-serif text-lg font-bold text-foreground">审稿人综合意见</h3>
        <p className="text-xs text-faint">主审独立复审后逐位回应</p>
      </header>

      {/* 3) revA / B / C */}
      {(['alpha', 'beta', 'gamma'] as const).map((role, idx) => {
        const reviewer = reviewers[role];
        const resp = responsesByReviewer.get(reviewerLabel(role));
        return (
          <ReviewerSection
            key={role}
            idx={idx + 1}
            role={role}
            reviewer={reviewer}
            response={resp}
          />
        );
      })}

      {/* 4) finalSec */}
      <section className="flex flex-col gap-3.5 pt-4">
        <header className="flex items-end justify-between border-b-2 border-foreground pb-1">
          <h3 className="font-serif text-lg font-bold text-foreground">确认结果</h3>
        </header>

        {/* 大字结果 */}
        <div className="flex items-end gap-3.5 py-2.5">
          <p className="w-24 shrink-0 text-xs font-bold text-faint">结果</p>
          <p className={cn('font-serif text-display-36 font-bold leading-none', decisionTheme)}>
            {decision === '——' ? '已决议' : recLabel(decision)}
          </p>
          {eff.score != null && (
            <p className="text-base font-semibold text-muted-foreground">
              综合 {eff.score} / 100
            </p>
          )}
        </div>

        {chief.mustFix && chief.mustFix.length > 0 && (
          <ListRow label={`必改 ${chief.mustFix.length} 条`} items={chief.mustFix} emphasize />
        )}
        {chief.suggestions && chief.suggestions.length > 0 && (
          <ListRow label={`建议 ${chief.suggestions.length} 条`} items={chief.suggestions} />
        )}

        {chief.deadlineDays != null && chief.deadlineDays > 0 && (
          <div className="flex gap-3.5">
            <p className="w-24 shrink-0 text-xs font-bold text-faint">截止期</p>
            <p className="flex-1 text-base leading-paragraph text-subtle">
              自决议日起 {chief.deadlineDays} 天内提交修订稿与回复函,
              逾期视为放弃本轮主审复议机会。
            </p>
          </div>
        )}
        {chief.summaryForAuthor && (
          <div className="flex gap-3.5">
            <p className="w-24 shrink-0 text-xs font-bold text-faint">给作者</p>
            <p className="flex-1 text-base italic text-muted-foreground">
              {chief.summaryForAuthor}
            </p>
          </div>
        )}

        {/* 签署 */}
        <footer className="flex items-center gap-4 border-t border-foreground pt-4">
          <p className="w-24 shrink-0 text-xs font-bold text-faint">主审签署</p>
          <div className="flex-1 space-y-0.5">
            <p className="text-base font-semibold text-subtle">
              AI 主审
            </p>
            <p className="text-sm italic text-muted-foreground">
              已基于稿件全文与三位审稿人的综合意见独立复审, 并确认上述结果。
            </p>
          </div>
        </footer>
      </section>
    </article>
  );
}

/* ─── 子组件 ──────────────────────────────────────────────────────────── */

function ReviewerSection({
  idx,
  role,
  reviewer,
  response,
}: {
  idx: number;
  role: 'alpha' | 'beta' | 'gamma';
  reviewer?: ReviewReport;
  response?: ReviewerResponse;
}) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-border-soft pb-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-serif text-xl font-bold text-border-soft">
            {String(idx).padStart(2, '0')}
          </span>
          <p className="text-base font-bold text-foreground">
            {reviewerLabel(role)}
            {reviewerHeadSuffix(reviewer)}
          </p>
        </div>
        {response?.judgment && (
          <p className="text-sm font-bold text-foreground">主审:{response.judgment}</p>
        )}
      </header>

      <div className="flex gap-3.5">
        <p className="w-24 shrink-0 text-xs font-bold text-faint">其综合意见</p>
        <p className="flex-1 text-base leading-paragraph text-subtle">
          {reviewer?.finalSummaryMd || '(该审稿人未给出意见)'}
        </p>
      </div>

      {(response?.summary || response?.body) && (
        <div className="flex gap-3.5">
          <p className="w-24 shrink-0 text-xs font-bold text-foreground">主审判断</p>
          {/* 概要(强) + 详细(弱, 可折叠默认展开) */}
          <div className="flex-1 min-w-0">
            <FoldableAnswer
              summary={response.summary}
              detail={response.body}
              summaryClassName="text-base font-semibold leading-paragraph text-foreground"
              detailClassName="text-sm leading-paragraph text-muted-foreground"
            />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * 概要(强) + 详细(弱, 可折叠默认展开) 的通用渲染。
 *   - 有 summary: summary 用强样式常驻; detail 跟一个「收起详情/展开详情」开关, 默认展开。
 *   - 无 summary (老 report): detail 就是主体, 用 summaryClassName 强样式直接展示, 不折叠。
 */
function FoldableAnswer({
  summary,
  detail,
  summaryClassName,
  detailClassName,
}: {
  summary?: string;
  detail?: string;
  summaryClassName?: string;
  detailClassName?: string;
}) {
  const [open, setOpen] = useState(true);
  if (!summary && !detail) return null;
  if (!summary) {
    return <p className={summaryClassName}>{detail}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className={summaryClassName}>{summary}</p>
      {detail && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {open ? '收起详情' : '展开详情'}
          </button>
          {open && <p className={detailClassName}>{detail}</p>}
        </>
      )}
    </div>
  );
}

function ListRow({
  label,
  items,
  emphasize,
}: {
  label: string;
  items: string[];
  emphasize?: boolean;
}) {
  return (
    <div className="flex gap-3.5">
      <p className="w-24 shrink-0 text-xs font-bold text-faint">{label}</p>
      <ol
        className={cn(
          'flex-1 list-decimal space-y-1.5 pl-4 text-base leading-paragraph',
          emphasize ? 'text-subtle' : 'text-muted-foreground',
        )}
      >
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * 从 chief.contentMd 用宽松解析器复原结构化字段 (后端 strict 解析失败时)。
 * 抽到 ruling/responses/mustFix/推荐之一就返回合成 report, 否则 null (交给 markdown 兜底)。
 */
/** 审稿人小节标题后缀 "· 综合 70 · 推荐返修" — 分数/结果缺失时从 contentMd 复原 (旧脏数据兜底)。 */
function reviewerHeadSuffix(reviewer?: ReviewReport): string {
  if (!reviewer) return '';
  const eff = effectiveResult(reviewer);
  let s = '';
  if (eff.score != null) s += ` · 综合 ${eff.score}`;
  if (eff.recommendation) s += ` · 推荐${recLabel(eff.recommendation)}`;
  return s;
}

function recoverChiefReport(chief: ReviewReport): ReviewReport | null {
  if (!chief.contentMd) return null;
  const p = parsePartialChief(chief.contentMd);
  const hasAny =
    !!p.rulingSummary ||
    !!p.rulingParagraph ||
    p.reviewerResponses.length > 0 ||
    p.mustFix.length > 0 ||
    p.suggestions.length > 0 ||
    p.score != null ||
    !!p.recommendation;
  if (!hasAny) return null;
  return {
    ...chief,
    score: chief.score ?? p.score,
    recommendation: chief.recommendation || p.recommendation,
    rulingSummaryMd: chief.rulingSummaryMd || p.rulingSummary,
    rulingParagraphMd: chief.rulingParagraphMd || p.rulingParagraph,
    reviewerResponses: chief.reviewerResponses ?? p.reviewerResponses,
    mustFix: chief.mustFix ?? p.mustFix,
    suggestions: chief.suggestions ?? p.suggestions,
    deadlineDays: chief.deadlineDays ?? p.deadlineDays,
    summaryForAuthor: chief.summaryForAuthor || p.summaryForAuthor,
  };
}

/* ─── 流式中间态 ───────────────────────────────────────────────────────── */

/**
 * 主审流式视图 — partial-parse 边解析边渲染:
 *   1) ruling_paragraph 部分文本先现身, 后续随着 token 追加
 *   2) score / recommendation 出现后顶部出大字
 *   3) reviewer_responses 三段依次出现
 *   4) must_fix / suggestions 列表项随 JSON 闭合逐条 push
 */
function StreamingChiefView({
  text,
  reviewers,
  done,
  status,
}: {
  text: string;
  reviewers: { alpha?: ReviewReport; beta?: ReviewReport; gamma?: ReviewReport };
  /** 流已结束、chief report 还没回填的空窗期 —— 横幅改"整理结果中"。 */
  done?: boolean;
  /** 实时进度 note (正在通读 / 分析…)。 */
  status?: string;
}) {
  const p = parsePartialChief(text);
  // ruling_summary 在 schema 里先于 ruling_paragraph 输出 —— 也要算"已有内容", 否则概要已经
  // 流到了却还卡在 loader 上, 白白浪费"概要先行"的好处。
  const isThinking =
    !p.rulingSummary &&
    !p.rulingParagraph &&
    p.score == null &&
    !p.recommendation &&
    p.reviewerResponses.length === 0;

  if (isThinking) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-md border border-border bg-surface-card text-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-amber" />
        <p className="text-base font-semibold text-foreground">主审正在通读三位审稿人意见…</p>
        <p className="text-sm text-faint">已生成 {p.totalChars} 字 · 决议结论稍后出现</p>
      </div>
    );
  }

  const responses = mapReviewerResponses(p.reviewerResponses);
  const decision = p.recommendation ?? '——';
  const dTheme = recTextColor(decision);

  return (
    <article className="flex flex-col gap-7">
      {/* 顶部进度条 */}
      <div className="flex items-center gap-2.5 rounded-md border border-brand-amber/40 bg-warning-soft px-4 py-2.5">
        <Loader2 className="h-4 w-4 animate-spin text-brand-amber" />
        <p className="flex-1 text-sm font-semibold text-brand-amber">
          {done ? (
            '主审决议已完成 · 正在整理结果…'
          ) : (
            <>
              主审正在撰写决议
              {p.reviewerResponses.length > 0 && ` · 已回应 ${p.reviewerResponses.length}/3 位审稿人`}
              {p.mustFix.length > 0 && ` · ${p.mustFix.length} 条必改`}
              {status && ` · ${status}`}
            </>
          )}
        </p>
        <p className="font-mono text-xs text-brand-amber/70">{p.totalChars} 字</p>
      </div>

      {/* ruling 段 —— 概要(强) + 详细(弱, 可折叠默认展开), 流式中也按新格式渲染 */}
      {(p.rulingSummary || p.rulingParagraph) && (
        <section className="flex flex-col gap-3.5 border-l-2 border-foreground py-4 pl-7">
          <p className="text-xs font-bold text-faint">SCHOLAY 主审 · 正在撰写</p>
          <FoldableAnswer
            summary={p.rulingSummary}
            detail={p.rulingParagraph}
            summaryClassName="font-serif text-xl italic font-semibold leading-paragraph text-foreground"
            detailClassName="text-base leading-paragraph text-subtle"
          />
          {p.score != null && (
            <p className="text-sm font-semibold text-muted-foreground">
              综合分 {p.score} / 100 {decision !== '——' && `· ${recLabel(decision)}`}
            </p>
          )}
        </section>
      )}

      {/* 三位审稿人逐段出现 */}
      {(['alpha', 'beta', 'gamma'] as const).map((role, idx) => {
        const reviewer = reviewers[role];
        const resp = responses.get(reviewerLabel(role));
        if (!resp && !reviewer) return null;
        return (
          <section key={role} className="flex flex-col gap-2.5 border-b border-border-soft pb-4">
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="font-serif text-xl font-bold text-border-soft">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <p className="text-base font-bold text-foreground">
                  {reviewerLabel(role)}
                  {reviewerHeadSuffix(reviewer)}
                </p>
              </div>
              {resp?.judgment ? (
                <p className="text-sm font-bold text-foreground">主审:{resp.judgment}</p>
              ) : (
                <p className="text-sm text-faint">主审复审中…</p>
              )}
            </header>
            {(resp?.summary || resp?.body) && (
              <div className="flex gap-3.5">
                <p className="w-24 shrink-0 text-xs font-bold text-foreground">主审判断</p>
                <div className="flex-1 min-w-0">
                  <FoldableAnswer
                    summary={resp.summary}
                    detail={resp.body}
                    summaryClassName="text-base font-semibold leading-paragraph text-foreground"
                    detailClassName="text-sm leading-paragraph text-muted-foreground"
                  />
                </div>
              </div>
            )}
          </section>
        );
      })}

      {/* 大字结果 + 必改 + 建议 — 各自独立, partial 解析到啥渲染啥 */}
      {(decision !== '——' || p.score != null) && (
        <section className="flex flex-col gap-3.5 pt-4">
          <header className="flex items-end justify-between border-b-2 border-foreground pb-1">
            <h3 className="font-serif text-lg font-bold text-foreground">确认结果</h3>
            <p className="text-xs text-faint">主审正在落笔</p>
          </header>
          <div className="flex items-end gap-3.5 py-2.5">
            <p className="w-24 shrink-0 text-xs font-bold text-faint">结果</p>
            <p className={cn('font-serif text-display-36 font-bold leading-none', dTheme)}>{recLabel(decision)}</p>
            {p.score != null && (
              <p className="text-base font-semibold text-muted-foreground">综合 {p.score} / 100</p>
            )}
          </div>
          {p.mustFix.length > 0 && <StreamingListRow label={`必改 ${p.mustFix.length} 条`} items={p.mustFix} emphasize />}
          {p.suggestions.length > 0 && <StreamingListRow label={`建议 ${p.suggestions.length} 条`} items={p.suggestions} />}
        </section>
      )}
    </article>
  );
}

function StreamingListRow({ label, items, emphasize }: { label: string; items: string[]; emphasize?: boolean }) {
  return (
    <div className="flex gap-3.5">
      <p className="w-24 shrink-0 text-xs font-bold text-faint">{label}</p>
      <ol
        className={cn(
          'flex-1 list-decimal space-y-1.5 pl-4 text-base leading-paragraph',
          emphasize ? 'text-subtle' : 'text-muted-foreground',
        )}
      >
        {items.map((it, i) => (
          <li key={i} className="duration-300 animate-in fade-in slide-in-from-left-2">{it}</li>
        ))}
      </ol>
    </div>
  );
}

/* ─── helpers ────────────────────────────────────────────────────────── */

function reviewerLabel(role: 'alpha' | 'beta' | 'gamma') {
  return { alpha: '审稿人 A', beta: '审稿人 B', gamma: '审稿人 C' }[role];
}

function mapReviewerResponses(arr?: ReviewerResponse[]) {
  const map = new Map<string, ReviewerResponse>();
  arr?.forEach((r) => map.set(r.reviewer, r));
  return map;
}

