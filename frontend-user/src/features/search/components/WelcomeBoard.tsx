import { Inbox } from 'lucide-react';
import { EmptyImportButton } from './EmptyMatrixPreview';

/**
 * 检索工作区欢迎屏 —— 暂存区全空时显示(备用;SearchPage 当前无暂存时不渲染右栏)。
 *
 * 默认只展示「工作区」列表心智,不再预置矩阵分析预览。
 */
interface WelcomeBoardProps {
  /** 暂时保留 prop 接口与 SearchPage 兼容,内部不再读 */
  onSwitchMode?: (m: 'classic' | 'smart') => void;
  currentMode?: 'classic' | 'smart';
}

export function WelcomeBoard(_props: WelcomeBoardProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <Inbox className="size-4 text-brand-red" strokeWidth={2.5} />
        <span className="text-15 font-bold text-foreground">工作区</span>
        <span className="text-xs text-faint">暂存论文后将在此管理</span>
      </header>

      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          在左侧搜索器中将论文加入工作区,即可按分区整理文献;需要多维度对比时再切换到「矩阵分析」视图。
        </p>
        <EmptyImportButton />
      </div>
    </div>
  );
}
