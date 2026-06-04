import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Loader2, Scale } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadingState } from '@/shared/components/LoadingState';
import { useSubmission, useDownloadSubmissionAssets } from '../api/submissions';
import { useSubmissionReports } from '../api/reports';
import { recBadgeClasses, recFillBg, recShortLabel, recTextColor } from '../lib/recommendation';
import { effectiveResult } from '../lib/partial-parse';
import type { ReviewReport, ReviewerRole } from '../types';

import { StatusGrid } from '../components/record/StatusGrid';
import { EditorialCheckPanel } from '../components/record/EditorialCheckPanel';
import { MethodologyPhaseCard } from '../components/record/MethodologyPhaseCard';
import { ReviewerDetailPanel } from '../components/record/ReviewerDetailPanel';
import { ChiefVerdictPanel } from '../components/record/ChiefVerdictPanel';
import { DetailRail } from '../components/record/DetailRail';

/**
 * 工单详情页(.pen `O4oP1` + `DYLbv` + `p9kpKj`)。
 *
 * Layout:
 *
 *   breadcrumb (40px)
 *   mainArea  (p-7)
 *     mHeader (论文标题 + 期刊 + StatusGrid)
 *     tabsBar (5 个 tab: 编辑部初审 / 审稿人 A / B / C / 主审决议)
 *     contentRow (mainCol + rail 300px)
 *
 * tab state 用 useState 局部存 (不进 URL — 用户在审稿记录里反复切 tab 是 ephemeral)。
 *
 * 子面板按 tab 渲染:
 *   editorial → EditorialCheckPanel (硬编码 4 项通过)
 *   alpha/beta/gamma → ReviewerDetailPanel (结构化评分 + 评论)
 *   chief → ChiefVerdictPanel (主审决议)
 */
export function RecordDetailPage() {
  const { id: idStr } = useParams();
  const id = idStr ? Number(idStr) : undefined;

  const { data: sub, isLoading: subLoading } = useSubmission(id);
  const { data: reports, isLoading: reportsLoading } = useSubmissionReports(id);

  const reportMap = useMemo(() => {
    const m = new Map<ReviewerRole, ReviewReport>();
    reports?.forEach((r) => m.set(r.role, r));
    return m;
  }, [reports]);

  // Tab 自动跟随"当前在等的那张卡"(live front):
  //   - pinnedTab=null = 跟随态 → activeTab 实时 = live front,随审稿推进自动切卡(reports 5s 轮询)。
  //   - 手动点了别的卡 → 钉在那张(pinnedTab=该卡),停止跟随。
  //   - 再点回"当前在等的那张卡" → pinnedTab 归 null,恢复跟随。
  // live front 见 liveFrontTab:审稿中=第一张没出报告的卡;已完成/终态=主审决议。
  const [pinnedTab, setPinnedTab] = useState<string | null>(null);

  if (subLoading) return <LoadingState />;
  if (!sub) {
    return <EmptyState title="找不到这份审稿" description="可能已被删除, 或没有访问权限。" />;
  }

  // 当前"在等的那张卡" + 实际展示的 tab(钉住优先,否则跟随)。
  const waitingTab = liveFrontTab(sub.status, reportMap);
  const activeTab = pinnedTab ?? waitingTab;
  // 切到当前在等的卡 → 归 null 恢复跟随;切到其它卡 → 钉住停跟随。
  const handleTabChange = (tab: string) => setPinnedTab(tab === waitingTab ? null : tab);

  // 审稿中要把 5 个 tab 全挂上(见下方 contentRow), 这里抽出单 tab 的渲染。
  const REVIEW_TABS = ['editorial', 'alpha', 'beta', 'gamma', 'chief'] as const;
  const renderPanel = (tab: string) => {
    if (tab === 'editorial') return <EditorialCheckPanel submission={sub} />;
    if (tab === 'chief')
      return (
        <ChiefVerdictPanel
          submissionId={sub.id}
          chief={reportMap.get('chief')}
          reviewers={{
            alpha: reportMap.get('alpha'),
            beta: reportMap.get('beta'),
            gamma: reportMap.get('gamma'),
          }}
          status={sub.status}
        />
      );
    return (
      <ReviewerDetailPanel
        role={tab as ReviewerRole}
        submissionId={sub.id}
        report={reportMap.get(tab as ReviewerRole)}
        status={sub.status}
        preparing={sub.computeState === 'computing_methodology'}
      />
    );
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Breadcrumb */}
      <nav className="flex h-10 items-center gap-2 border-b border-border-soft bg-surface-1 px-8 text-sm">
        <Link to="/peer-review/records" className="text-brand-red hover:underline">
          所有审稿
        </Link>
        <span className="text-faint">›</span>
        <span className="font-bold text-foreground">稿件详情</span>
      </nav>

      {/* Main area */}
      <div className="flex-1 overflow-auto bg-surface-3 px-7 py-5">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3.5">
          {/* 1) mHeader */}
          <Header sub={sub} reports={reportMap} activeTab={activeTab} onTabChange={handleTabChange} />

          {/* 2) tabsBar */}
          <TabsBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            reports={reportMap}
            status={sub.status}
          />

          {/* 3) contentRow */}
          <div className="flex gap-3.5">
            <div className="min-w-0 flex-1">
              {sub.status === 'reviewing' ? (
                // 审稿中(含方法论编排阶段)布局**全程稳定**:tab 内容一直在,不做"整卡消失→loading→表单"的重构。
                // 方法论编排阶段(computing_methodology)只在顶部加一条**匿名进度条**(不 dump 原始推理、不暴露
                // 选了哪个审稿人),审稿人面板此时是"待评议"骨架;切到 reviewing 后,同一个面板原地填充成流式表单。
                // 所有 tab 挂上(隐藏非当前 tab)→ 配合后端 SubscribePending,切到任意 reviewer tab 都能从头看流。
                <>
                  {sub.computeState === 'computing_methodology' && (
                    <div className="mb-3.5">
                      <MethodologyPhaseCard />
                    </div>
                  )}
                  {REVIEW_TABS.map((tab) => (
                    <div key={tab} className={activeTab === tab ? 'contents' : 'hidden'}>
                      {renderPanel(tab)}
                    </div>
                  ))}
                </>
              ) : reportsLoading && activeTab !== 'editorial' ? (
                <LoadingState />
              ) : (
                renderPanel(activeTab)
              )}
            </div>
            <DetailRail
              submission={sub}
              reports={reportMap as unknown as Map<string, ReviewReport>}
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 子组件 ──────────────────────────────────────────────────────────── */

function Header({
  sub,
  reports,
  activeTab,
  onTabChange,
}: {
  sub: NonNullable<ReturnType<typeof useSubmission>['data']>;
  reports: Map<ReviewerRole, ReviewReport>;
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const download = useDownloadSubmissionAssets();
  // 主审已出报告时, 顶部状态徽章直接显示决议结果 (按结果上色), 而不是泛泛的"已结案"。
  const chief = reports.get('chief');
  const chiefRec = chief ? effectiveResult(chief).recommendation : undefined;
  const target =
    sub.mode === 'journal'
      ? (sub.journalTarget?.canonicalName ?? '通用 STM 期刊')
      : (sub.schoolTarget?.schoolName ?? '——');
  const submittedText = sub.submittedAt
    ? `投稿时间 ${format(parseISO(sub.submittedAt), 'yyyy-MM-dd HH:mm')}`
    : '';
  const updatedText = sub.updatedAt
    ? `· 最近更新 ${format(parseISO(sub.updatedAt), 'MM-dd HH:mm')}`
    : '';

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-background p-4.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            {chief ? (
              <span
                className={cn(
                  'rounded-sm px-2 py-0.5 text-xs font-bold',
                  chiefRec
                    ? recBadgeClasses(chiefRec)
                    : 'border border-border bg-surface-1 text-subtle',
                )}
              >
                {chiefRec ? `已决议 · ${recShortLabel(chiefRec)}` : '已决议'}
              </span>
            ) : (
              <span className="rounded-sm border border-border bg-surface-1 px-2 py-0.5 text-xs font-bold text-subtle">
                {statusLabel(sub.status)}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {submittedText} {updatedText}
            </span>
          </div>
          <h1 className="mt-1 font-serif text-xl font-bold leading-tight text-foreground">
            {sub.title ?? '(未填标题)'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{target}</span>
            {sub.extraMeta?.subjects && sub.extraMeta.subjects.length > 0 && (
              <>
                <span className="text-faint">·</span>
                <span>{sub.extraMeta.subjects.join(' / ')}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={download.isPending}
            onClick={() =>
              download.mutate(sub.id, {
                onError: () => toast.error('下载失败,请稍后重试'),
              })
            }
          >
            {download.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {download.isPending ? '打包中…' : '下载稿件'}
          </Button>
        </div>
      </div>

      <StatusGrid
        status={sub.status}
        computeState={sub.computeState}
        reports={reports as unknown as Map<string, ReviewReport>}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
    </section>
  );
}

function TabsBar({
  activeTab,
  onTabChange,
  reports,
  status,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  reports: Map<ReviewerRole, ReviewReport>;
  status: string;
}) {
  // 每个 tab: [结果色圆点 / 主审用 ⚖ 图标] + 标签 + 徽章 (审稿人=分数, 主审=结果)。
  // 结果/分数缺失 (旧脏数据) 时从 contentMd 复原, 跟状态栏 / 侧栏 / tab 内容一致。
  type TabBadge = { text: string; cls: string };
  type TabDesc = { key: string; label: string; dotCls?: string; icon?: ReactNode; badge?: TabBadge };

  const reviewerTab = (role: ReviewerRole, letter: string): TabDesc => {
    const r = reports.get(role);
    if (!r) {
      // 未出报告: 灰点, 无徽章
      return { key: role, label: `审稿人 ${letter}`, dotCls: 'bg-border-strong' };
    }
    const eff = effectiveResult(r);
    return {
      key: role,
      label: `审稿人 ${letter}`,
      dotCls: recFillBg(eff.recommendation), // 圆点 = 推荐结果色 (绿/黄/红)
      badge:
        eff.score != null
          ? { text: String(eff.score), cls: recBadgeClasses(eff.recommendation) } // 徽章 = 分数
          : undefined,
    };
  };

  const chief = reports.get('chief');
  const chiefRec = chief ? effectiveResult(chief).recommendation : undefined;
  const tabs: TabDesc[] = [
    { key: 'editorial', label: '编辑部初审', dotCls: 'bg-brand-green' },
    reviewerTab('alpha', 'A'),
    reviewerTab('beta', 'B'),
    reviewerTab('gamma', 'C'),
    {
      key: 'chief',
      label: '主审决议',
      icon: <Scale className={cn('size-3.5 shrink-0', chief ? recTextColor(chiefRec) : 'text-faint')} />,
      badge: chief
        ? {
            text: chiefRec ? recShortLabel(chiefRec) : '已决议',
            cls: chiefRec ? recBadgeClasses(chiefRec) : 'bg-surface-2 text-muted-foreground',
          }
        : status === 'reviewing'
          ? { text: '待汇总', cls: 'bg-warning-soft text-brand-amber' }
          : undefined,
    },
  ];

  return (
    <div className="flex items-end gap-6 border-b border-border-soft">
      {tabs.map((t) => {
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 pb-2 text-sm transition-colors',
              active
                ? 'border-brand-red font-bold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.icon ?? <span className={cn('size-2 shrink-0 rounded-pill', t.dotCls)} />}
            <span>{t.label}</span>
            {t.badge && (
              <span
                className={cn(
                  'rounded-pill px-1.5 py-0.5 text-2xs font-bold tabular-nums',
                  t.badge.cls,
                )}
              >
                {t.badge.text}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// live front = 当前"在等的那张卡",tab 自动跟随的目标:
//   审稿中 / 排队中 → 第一张还没出报告的卡 (alpha→beta→gamma→chief);
//   已完成 / 失败 / 其它终态 → 主审决议 (chief)。
// 编辑部初审是提交即过的合规检查,永不作为 live front。
const REVIEW_FRONT: ReviewerRole[] = ['alpha', 'beta', 'gamma', 'chief'];
function liveFrontTab(status: string, reports: Map<ReviewerRole, ReviewReport>): string {
  if (status !== 'reviewing' && status !== 'queued') return 'chief';
  for (const role of REVIEW_FRONT) {
    if (!reports.get(role)) return role;
  }
  return 'chief';
}

function statusLabel(s: string) {
  return (
    { draft: '草稿', queued: '排队中', reviewing: '审稿进行中', completed: '已结案', failed: '失败' }[s] ?? s
  );
}
