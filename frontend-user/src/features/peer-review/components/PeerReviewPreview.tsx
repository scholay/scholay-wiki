import { Filter, GraduationCap, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * 智能审稿样式预览 —— 对照 .pen `bT0Dp` 工单总览:
 * 顶部 pageHeader + filterBar + 工单表格(主审/待办/已完成 状态色编码)
 */
export function PeerReviewPreview() {
  return (
    <div className="flex flex-col h-full bg-surface-1 overflow-hidden">
      <header className="h-14 px-8 flex items-center justify-between border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2.5">
          <GraduationCap className="size-4 text-brand-red" strokeWidth={2.5} />
          <span className="text-15 font-bold text-foreground">智能审稿 · 工单总览</span>
        </div>
        <div className="flex items-center gap-2 h-8 px-3 rounded-sm border border-border w-[280px] bg-background">
          <Search className="size-3.5 text-faint" />
          <span className="text-xs text-faint">搜索投稿编号 / 标题</span>
        </div>
      </header>

      {/* filterBar */}
      <div className="h-11 px-6 flex items-center gap-2 bg-background border-b border-border shrink-0">
        <Filter className="size-3.5 text-faint" />
        {[
          { label: '全部', active: true },
          { label: '待我审稿', count: 4 },
          { label: '已提交', count: 12 },
          { label: '主审决议' },
          { label: '我的投稿' },
        ].map((f) => (
          <button
            key={f.label}
            type="button"
            tabIndex={-1}
            className={cn(
              'inline-flex items-center gap-1 h-7 px-3 rounded-sm text-xs',
              f.active
                ? 'bg-foreground text-background font-bold'
                : 'text-subtle hover:bg-surface-1'
            )}
          >
            {f.label}
            {f.count !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center h-4 px-1 rounded-pill text-2xs font-bold',
                  f.active
                    ? 'bg-background text-foreground'
                    : 'bg-surface-2 text-muted-foreground'
                )}
              >
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 工单卡片 */}
      <div className="flex-1 min-h-0 px-6 py-4 space-y-3 overflow-hidden">
        {MOCK_TICKETS.map((t) => (
          <TicketCard key={t.id} ticket={t} />
        ))}
      </div>
    </div>
  );
}

interface Ticket {
  id: string;
  title: string;
  journal: string;
  status: 'pending' | 'reviewing' | 'decision' | 'accepted' | 'revise';
  statusLabel: string;
  authors: string;
  daysAgo: number;
  rounds: number;
}

const MOCK_TICKETS: Ticket[] = [
  {
    id: 'NMI-2024-0832',
    title: 'Explainable AI in Medical Imaging: A Survey of XAI Methods 2021-2024',
    journal: 'Nature Machine Intelligence',
    status: 'reviewing',
    statusLabel: '审稿中',
    authors: '张伟,陈静,刘明',
    daysAgo: 3,
    rounds: 2,
  },
  {
    id: 'JAMA-2024-1142',
    title: 'Counterfactual Explanations for Clinical Decision Support',
    journal: 'JAMA',
    status: 'decision',
    statusLabel: '主审决议',
    authors: 'A. Sharma, B. Chen, et al.',
    daysAgo: 1,
    rounds: 3,
  },
  {
    id: 'TPAMI-2024-0501',
    title: 'Diffusion Model Interpretability via Latent Space Probing',
    journal: 'IEEE TPAMI',
    status: 'revise',
    statusLabel: '小修返修',
    authors: 'Hu, K., Yamamoto, T.',
    daysAgo: 6,
    rounds: 1,
  },
  {
    id: 'ACL-2024-2280',
    title: 'Counterfactual Explanations for Transformer-based Text Classification',
    journal: 'ACL',
    status: 'accepted',
    statusLabel: '已录用',
    authors: '吴志强,林婷婷',
    daysAgo: 12,
    rounds: 2,
  },
];

const STATUS_CLS: Record<Ticket['status'], string> = {
  pending: 'bg-surface-2 text-muted-foreground',
  reviewing: 'bg-warning-soft text-brand-amber',
  decision: 'bg-danger-soft text-brand-red',
  accepted: 'bg-brand-green/10 text-brand-green',
  revise: 'bg-warning-soft text-brand-amber',
};

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-md bg-background border border-border">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xs text-faint font-mono">{ticket.id}</span>
          <span className="text-2xs text-faint">·</span>
          <span className="text-2xs text-muted-foreground">{ticket.journal}</span>
        </div>
        <p className="text-sm font-bold text-foreground leading-snug truncate">
          {ticket.title}
        </p>
        <div className="mt-1.5 flex items-center gap-3 text-2xs text-muted-foreground">
          <span>{ticket.authors}</span>
          <span>·</span>
          <span>{ticket.daysAgo} 天前更新</span>
          <span>·</span>
          <span>第 {ticket.rounds} 轮</span>
        </div>
      </div>
      <span
        className={cn(
          'inline-flex items-center px-2 h-6 rounded-sm text-2xs font-bold shrink-0',
          STATUS_CLS[ticket.status]
        )}
      >
        {ticket.statusLabel}
      </span>
    </div>
  );
}
