import { format, parseISO } from 'date-fns';
import { cn } from '@/shared/lib/utils';
import { recAvatarClasses, recLabel } from '@/shared/lib/peer-review/recommendation';
import { effectiveResult } from '@/shared/lib/peer-review/partial-parse';
import type { ReviewReport, Submission } from '@/shared/lib/peer-review/types';

/**
 * 300px 右侧边栏(.pen `DYLbv` rail)。
 *
 * 2 张卡片纵向排:
 *   1) peerCard — 同行评审快览, 3 行迷你审稿人 (当前 tab 高亮)
 *   2) tlCard   — 时间线, 5 个节点
 *
 * (审稿状态总览 / 主审决议 已移除 —— 顶部 StatusGrid 已含进度条 + 主审决议卡, 避免重复展示。)
 * 不接 API; 全部数据从父组件已经拿到的 submission + reports 推导。
 */
export interface DetailRailProps {
  submission: Submission;
  reports: Map<string, ReviewReport>;
  /** alpha/beta/gamma/chief/editorial — 当前 tab, 用于 peerCard 高亮 */
  activeTab: string;
  /** tab 切换 — 让 peer rows 可点 */
  onTabChange: (tab: string) => void;
}

export function DetailRail({ submission, reports, activeTab, onTabChange }: DetailRailProps) {
  return (
    <aside className="flex w-full max-w-[300px] flex-col gap-3">
      <PeerCard reports={reports} activeTab={activeTab} onTabChange={onTabChange} />
      <TimelineCard submission={submission} reports={reports} />
    </aside>
  );
}

/* ─── 1) PeerCard ────────────────────────────────────────────────────── */

function PeerCard({
  reports,
  activeTab,
  onTabChange,
}: {
  reports: Map<string, ReviewReport>;
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-16 border border-border bg-surface-card p-3.5">
      <p className="text-14 font-medium text-foreground">同行评审快览</p>
      {(['alpha', 'beta', 'gamma'] as const).map((role) => {
        const letter = { alpha: 'A', beta: 'B', gamma: 'C' }[role];
        const r = reports.get(role);
        // 结果/分数缺失 (旧脏数据) 时从 contentMd 复原, 跟底部状态栏 + tab 内容一致。
        const eff = r ? effectiveResult(r) : null;
        const tabKey = role;
        const active = activeTab === tabKey;
        return (
          <button
            key={role}
            type="button"
            onClick={() => onTabChange(tabKey)}
            className={cn(
              'flex items-center gap-2.5 rounded-8 px-2.5 py-2 text-left transition-colors',
              active
                ? 'border border-foreground bg-surface-2'
                : 'border border-transparent bg-surface-1 hover:bg-surface-2',
            )}
          >
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-pill font-serif text-12 font-bold',
                // 跟底部状态栏一致: 完成后按审稿结果上色 (绿/橘/红), 否则深色
                eff?.recommendation ? recAvatarClasses(eff.recommendation) : 'bg-inverse text-on-inverse',
              )}
            >
              {letter}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-12 font-medium text-foreground">审稿人 {letter}</p>
              <p
                className={cn(
                  'truncate text-12',
                  active ? 'font-medium text-subtle' : 'text-muted-foreground',
                )}
              >
                {r
                  ? `${eff?.score ?? '—'} · ${eff?.recommendation ? recLabel(eff.recommendation) : '已完成'}`
                  : '等待中'}
              </p>
            </div>
            <span className="text-12 text-faint">›</span>
          </button>
        );
      })}
    </section>
  );
}

/* ─── 2) TimelineCard ────────────────────────────────────────────────── */

function TimelineCard({
  submission,
  reports,
}: {
  submission: Submission;
  reports: Map<string, ReviewReport>;
}) {
  const events: { label: string; at?: string; emphasis?: boolean }[] = [
    {
      label: '投稿 · 编辑部初审通过',
      at: submission.submittedAt,
    },
    ...(['alpha', 'beta', 'gamma'] as const).map((role) => {
      const r = reports.get(role);
      const letter = { alpha: 'A', beta: 'B', gamma: 'C' }[role];
      const score = r ? effectiveResult(r).score : undefined;
      return {
        label: r ? `审稿人 ${letter} 提交意见 · ${score ?? '—'}` : `审稿人 ${letter} 评议中`,
        at: r?.createdAt,
      };
    }),
    (() => {
      const chief = reports.get('chief');
      const rec = chief ? effectiveResult(chief).recommendation : undefined;
      return {
        label: chief ? `主审决议:${rec ? recLabel(rec) : '已决议'}` : '主审决议:待汇总',
        at: chief?.createdAt,
        emphasis: !!chief,
      };
    })(),
  ];

  return (
    <section className="flex flex-col gap-2.5 rounded-16 border border-border bg-surface-card p-3.5">
      <p className="text-14 font-medium text-foreground">时间线</p>
      <ul className="flex flex-col gap-2">
        {events.map((e, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className={cn(
                'mt-1 h-2 w-2 shrink-0 rounded-pill',
                e.emphasis ? 'bg-brand-amber' : e.at ? 'bg-foreground' : 'bg-faint',
              )}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-12 font-medium',
                  e.emphasis ? 'text-brand-amber' : 'text-subtle',
                )}
              >
                {e.label}
              </p>
              {e.at && (
                <p className="text-12 text-faint">{format(parseISO(e.at), 'MM-dd HH:mm')}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

