import type { ComponentType } from 'react';
import { Globe, Grid3x3, MessageSquare, Share2 } from 'lucide-react';
import { QuickOpenPaperDialog } from '@/features/browser/components/QuickOpenPaperDialog';
import { useOpenPaperDetail } from '@/shared/hooks/useOpenInSearchPanel';
import {
  useSearchRightPanelStore,
  WORKSPACE_FUNCTION_LABEL,
  type WorkspaceFunctionKind,
} from '@/stores/search-right-panel.store';
import { cn } from '@/shared/lib/utils';

const FUNCTION_CARDS: {
  kind: WorkspaceFunctionKind;
  icon: ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    kind: 'pdf-chat',
    icon: MessageSquare,
    description: '针对工作区 PDF 提问、摘要与段落解读',
  },
  {
    kind: 'citation-graph',
    icon: Share2,
    description: '可视化暂存文献之间的引用与关联网络',
  },
  {
    kind: 'matrix',
    icon: Grid3x3,
    description: '多维度 AI 对比表,横向审视方法、指标与结论',
  },
];

/** 右栏空态 —— 无功能/详情页选中时,在剩余区域展示入口卡片(与工作区列并排或独占整栏) */
export function RightPanelFeatureHub() {
  const setActiveFunction = useSearchRightPanelStore((s) => s.setActiveFunction);
  const openPaper = useOpenPaperDetail();

  return (
    <div className="flex h-full min-h-0 items-center justify-center p-4 sm:p-6">
      <div
        className={cn(
          'grid w-full gap-3 sm:gap-4',
          'grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))]',
        )}
      >
        {FUNCTION_CARDS.map(({ kind, icon: Icon, description }) => (
          <FeatureHubCard
            key={kind}
            icon={Icon}
            title={WORKSPACE_FUNCTION_LABEL[kind]}
            description={description}
            onClick={() => setActiveFunction(kind)}
          />
        ))}

        <QuickOpenPaperDialog align="center" onPickPaper={openPaper}>
          <FeatureHubCard
            icon={Globe}
            title="浏览器"
            description="搜索并打开论文、作者、期刊详情页"
          />
        </QuickOpenPaperDialog>
      </div>
    </div>
  );
}

function FeatureHubCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-full min-h-[120px] w-full flex-col gap-3 rounded-xl border border-border bg-background p-4 text-left shadow-sm transition-all sm:p-5',
        'hover:border-border-strong hover:shadow-md hover:-translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10',
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2">
        <Icon className="size-5 text-brand-red" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </button>
  );
}
