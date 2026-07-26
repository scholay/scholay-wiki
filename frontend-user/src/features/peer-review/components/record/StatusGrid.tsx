import { Check, Clock, Loader2, Scale } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  recAvatarClasses,
  recBadgeClasses,
  recFillBg,
  recLabel,
  recShortLabel,
} from '../../lib/recommendation';
import { effectiveResult } from '../../lib/partial-parse';
import type { ReviewReport } from '../../types';

/**
 * 5 并列状态格(.pen `O4oP1` parallelProg) — 顶部 mHeader 内嵌。
 *
 *   编辑部初审 ─── 审稿人 A ┃ 审稿人 B ┃ 审稿人 C ─── 主审决议
 *
 * 三位审稿人共享一个白底框 + 内部用 1px 灰线分隔(与设计稿一致),
 * 编辑部初审 / 主审 各自独立卡片, 用 24px 灰线连到 peerGroup 两侧。
 *
 * 「投稿成功 = 初审通过」的产品决定 → 编辑部初审格永远显示 通过 状态。
 */
export interface StatusGridProps {
  /** 投稿状态: 'reviewing' 或 'completed' 等 */
  status: string;
  /** 异步 agent 细分状态; 'computing_methodology' 时进度条显示方法论阶段而非假"审稿人A评议中" */
  computeState?: string;
  /** 4 份 report by role */
  reports: Map<string, ReviewReport>;
  /** 当前选中的 tab, 用于高亮对应状态格 */
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function StatusGrid({ status, computeState, reports, activeTab, onTabChange }: StatusGridProps) {
  const a = reports.get('alpha');
  const b = reports.get('beta');
  const c = reports.get('gamma');
  const chief = reports.get('chief');

  // 进度: 3 位审稿人 + 主审 = 4 个阶段。审稿是串行的, 下一个未完成的就是"正在评审"的。
  const reviewersDone = [a, b, c].filter(Boolean).length;
  const stagesDone = reviewersDone + (chief ? 1 : 0);
  const reviewing = status === 'reviewing' && stagesDone < 4;
  // 方法论编排阶段: 三位审稿人都还没开跑, 不能让任何一格脉冲成"评审中"(那是误标的根因)。
  const inMethodology = computeState === 'computing_methodology';
  // 当前正在跑的角色 (串行: 第一个还没出报告的); 方法论阶段统一为 null。
  const loadingRole = !reviewing || inMethodology
    ? null
    : !a ? 'alpha' : !b ? 'beta' : !c ? 'gamma' : 'chief';

  return (
    <div className="flex w-full flex-col gap-2">
      {reviewing && (
        <ReviewProgress stagesDone={stagesDone} loadingRole={loadingRole} inMethodology={inMethodology} />
      )}

      {/* items-stretch: 初审 / 三审稿人 / 主审决议三块统一拉伸到同一高度 (取最高者),
          每块内部各自 justify-center 把内容垂直居中 —— 整行卡片上下对齐, 不再参差。 */}
      <div className="flex w-full items-stretch gap-0">
        {/* 编辑部初审 — 永远通过 (业务约定: 投稿成功 = 初审通过) */}
        <EditorialCell active={activeTab === 'editorial'} onClick={() => onTabChange('editorial')} />

        <Connector />

        {/* 三位审稿人共享一个白底框 — 自身定宽 (紧凑), 两侧 Connector 伸缩把它居中 */}
        <div className="flex shrink-0 overflow-hidden rounded-md border border-border-strong bg-background">
          <ReviewerCell
            letter="A"
            report={a}
            loading={loadingRole === 'alpha'}
            active={activeTab === 'alpha'}
            onClick={() => onTabChange('alpha')}
          />
          <div className="w-px self-stretch bg-border-soft" />
          <ReviewerCell
            letter="B"
            report={b}
            loading={loadingRole === 'beta'}
            active={activeTab === 'beta'}
            onClick={() => onTabChange('beta')}
          />
          <div className="w-px self-stretch bg-border-soft" />
          <ReviewerCell
            letter="C"
            report={c}
            loading={loadingRole === 'gamma'}
            active={activeTab === 'gamma'}
            onClick={() => onTabChange('gamma')}
          />
        </div>

        <Connector />

        <ChiefCell
          report={chief}
          loading={loadingRole === 'chief'}
          active={activeTab === 'chief'}
          onClick={() => onTabChange('chief')}
        />
      </div>
    </div>
  );
}

/**
 * 顶部量化进度条 — 审稿是 5 个串行阶段: 方法论编排 → 审稿人 A → B → C → 主审决议。
 * 显示「当前阶段文案 + 阶段 N/5 进度条 + 粗略预计剩余」, 让等待不黑盒(尤其方法论那段最久)。
 * 预计时间是按每阶段 ~2 分钟的经验估计(实测一轮约 9-10 分钟), 标「预计」避免被重试拖长时显得失真。
 */
function ReviewProgress({
  stagesDone,
  loadingRole,
  inMethodology,
}: {
  stagesDone: number;
  loadingRole: string | null;
  inMethodology: boolean;
}) {
  // 阶段号 1..5: 方法论=1; 之后 alpha=2 / beta=3 / gamma=4 / chief=5 (= 已完成报告数 + 2)。
  const phaseNum = inMethodology ? 1 : Math.min(5, stagesDone + 2);
  // 进度条按阶段推进, 留 8% 起步量避免方法论阶段显示成 0。
  const pct = Math.min(100, Math.round(((phaseNum - 1) / 5) * 100) + 8);
  // 粗略预计剩余: 含当前阶段在内还剩 (6 - phaseNum) 个阶段, 每阶段约 2 分钟。
  const remainMin = Math.max(1, (6 - phaseNum) * 2);
  const label = inMethodology
    ? '通读全文 · 制定审稿标准…'
    : loadingRole === 'chief'
      ? '主审决议中…'
      : loadingRole
        ? `审稿人 ${{ alpha: 'A', beta: 'B', gamma: 'C' }[loadingRole]} 评审中…`
        : '汇总结果中…';
  return (
    <div className="flex items-center gap-3 rounded-md border border-brand-amber/40 bg-warning-soft px-3.5 py-2">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-amber" />
      <span className="shrink-0 text-xs font-bold text-brand-amber">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-brand-amber/15">
        <div
          className="h-full rounded-pill bg-brand-amber transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-2xs font-bold tabular-nums text-brand-amber">
        阶段 {phaseNum}/5 · 预计剩余 ~{remainMin} 分钟
      </span>
    </div>
  );
}

/* ─── 子格 ────────────────────────────────────────────────────────────── */

function EditorialCell({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-52 flex-col justify-center gap-1.5 rounded-md border bg-background px-3 py-2.5 text-left transition-colors',
        active
          ? 'border-foreground ring-2 ring-foreground/10'
          : 'border-border-strong hover:border-foreground/30',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-pill bg-brand-green">
          <Check className="h-3.5 w-3.5 text-background" strokeWidth={3.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">编辑部初审</p>
          <p className="truncate text-xs text-faint">排版 · 查重 · AIGC</p>
        </div>
        <span className="shrink-0 rounded-sm bg-surface-2 px-2 py-0.5 text-xs font-bold text-subtle">
          通过
        </span>
      </div>
      <div className="flex items-end justify-between pt-1">
        <span className="font-serif text-xl font-bold text-foreground">通过</span>
        <span className="text-2xs text-faint">4/4 项</span>
      </div>
    </button>
  );
}

function ReviewerCell({
  letter,
  report,
  loading,
  active,
  onClick,
}: {
  letter: 'A' | 'B' | 'C';
  report?: ReviewReport;
  loading?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  // "完成" 以**报告是否存在**为准 (报告行只在审稿结束时落库), 不再用 recommendation —
  // 否则旧脏数据 (recommendation=NULL) 会被误判成"等待中"。结果/分数缺失时从 contentMd 复原。
  const done = !!report;
  const eff = report ? effectiveResult(report) : null;
  const chip = chipFor(report, eff, loading);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // 上下布局: 头像在上、文案在下, 居中; 定宽 w-36 让三卡紧凑, 整行靠 Connector 伸缩撑满
        'flex w-36 flex-col items-center justify-center gap-1.5 px-2 py-3 text-center transition-colors',
        active ? 'bg-surface-2' : 'bg-background hover:bg-surface-1',
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-pill font-serif text-sm font-bold',
          // 完成 → 按审稿结果上色 (绿/橘/红); 进行中 → 脉冲; 等待 → 灰描边
          done
            ? recAvatarClasses(eff?.recommendation)
            : loading
              ? 'animate-pulse bg-brand-amber/20 text-brand-amber'
              : 'border-2 border-border-strong bg-background text-faint',
        )}
      >
        {letter}
      </div>
      <p className={cn('text-sm font-bold', done ? 'text-foreground' : 'text-muted-foreground')}>
        审稿人 {letter}
      </p>
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1 truncate rounded-pill px-2 py-0.5 text-2xs font-bold',
          chip.cls,
        )}
      >
        {chip.icon}
        {chip.label}
      </span>
    </button>
  );
}

function ChiefCell({
  report,
  loading,
  active,
  onClick,
}: {
  report?: ReviewReport;
  loading?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  // 同 ReviewerCell: "已决议"以报告存在为准, 结果/分数缺失 (旧脏数据) 时从 contentMd 复原。
  const decided = !!report;
  const eff = report ? effectiveResult(report) : null;
  const rec = eff?.recommendation;

  // 未决议 — 浅色占位卡 (跟未完成节点同一视觉档)。
  if (!decided) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-80 flex-col justify-center gap-1.5 rounded-md border bg-background px-4 py-2.5 text-left transition-colors',
          active ? 'border-foreground ring-2 ring-foreground/10' : 'border-border-strong hover:border-foreground/30',
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-pill',
              loading ? 'animate-pulse bg-brand-amber/20 text-brand-amber' : 'border-2 border-border-strong bg-background text-faint',
            )}
          >
            <Scale className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-muted-foreground">主审决议</p>
            <p className="truncate text-xs text-faint">{loading ? '决议中…' : '待 3 位完成'}</p>
          </div>
          <span className="shrink-0 rounded-pill bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-faint">
            {loading ? '汇总中' : '待汇总'}
          </span>
        </div>
        <div className="flex items-end justify-between pt-1">
          <span className="font-serif text-xl font-bold text-faint">待定</span>
        </div>
      </button>
    );
  }

  // 已决议 — 整卡按结果填色 (绿/黄/红) + 白字。结果已由上方大字 "录用/返修/拒稿" 表达,
  // 不再画底部三档分段 (录用/返修/拒稿) —— 既去重复, 也让本卡不被多撑一截高度。
  const time = report?.createdAt
    ? new Date(report.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-80 flex-col justify-center gap-2.5 rounded-md p-4 text-left text-background transition',
        recFillBg(rec),
        active ? 'ring-2 ring-foreground/30 ring-offset-2 ring-offset-background' : 'opacity-95 hover:opacity-100',
      )}
    >
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 shrink-0" />
        <p className="text-sm font-bold">主审已决议</p>
        {time && <span className="ml-auto text-2xs text-background/70 tabular-nums">{time}</span>}
      </div>
      <div className="flex items-end gap-2.5">
        <span className="font-serif text-3xl font-bold leading-none">{rec ? recLabel(rec) :'已决议'}</span>
        {eff?.score != null && (
          <span className="text-xs font-semibold text-background/85">综合 {eff.score} / 100</span>
        )}
      </div>
      {report?.summaryForAuthor && (
        <p className="line-clamp-2 text-2xs leading-paragraph text-background/90">{report.summaryForAuthor}</p>
      )}
    </button>
  );
}

/* ─── 视觉元素 ────────────────────────────────────────────────────────── */

function Connector() {
  // flex-1: 连接线伸缩, 把两端的卡片顶到最左/最右 (整行撑满 + 两端对齐), 间隙由它吸收。
  return <div className="my-auto h-0.5 flex-1 min-w-6 bg-border-strong" />;
}

/** 根据 report 状态返回 chip 文案 + 样式。完成后按审稿结果上色 (绿/橘/红)。 */
function chipFor(
  report: ReviewReport | undefined,
  eff: { recommendation?: string; score?: number } | null,
  loading?: boolean,
): { icon: React.ReactNode; label: string; cls: string } {
  if (report) {
    // 报告已落库 = 完成。结果/分数缺失 (旧脏数据) 时退化为"已完成 · —", 不再显示等待中。
    const rec = eff?.recommendation;
    return {
      icon: <Check className="h-2.5 w-2.5" strokeWidth={3} />,
      // 窄卡 (w-36) 用紧凑名 "录用/返修/拒稿", 避免 "(修改后)录用 · 87" 被截断
      label: rec ? `${recShortLabel(rec)} · ${eff?.score ?? '—'}` : `已完成 · ${eff?.score ?? '—'}`,
      cls: rec ? recBadgeClasses(rec) : 'bg-surface-2 text-subtle',
    };
  }
  if (loading) {
    return {
      icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
      label: '评审中…',
      cls: 'bg-warning-soft text-brand-amber',
    };
  }
  return {
    icon: <Clock className="h-2.5 w-2.5" />,
    label: '等待中',
    cls: 'bg-surface-2 text-faint',
  };
}
