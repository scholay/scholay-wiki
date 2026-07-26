/**
 * 右侧成果面板 —— 智能助手生成的文件统一展示在这里(不再挂在对话底部)。
 *
 * 两态:
 *   - 未选中:列出本会话全部产物(复用 TurnArtifacts 列表)。
 *   - 选中某个:全屏预览该产物(复用 ClawArtifactPreview),顶部「← 返回」回到列表。
 *
 * 仅桌面(≥1024)用;窄屏走 Sheet。ClawPage 控制何时挂载(有产物或点了预览即挂)。
 */
import { ArrowLeft, FolderArchive, PanelRightClose } from 'lucide-react';
import { type ArtifactBasePath, type ClawArtifact } from '../../api/artifacts';
import { TurnArtifacts } from '../chat/TurnArtifacts';
import { ClawArtifactPreview } from './ClawArtifactPreview';

// 收起按钮:把右侧成果栏收起(ClawPage 控制,中间对话区随之占满)。
function CollapseBtn({ onCollapse }: { onCollapse?: () => void }) {
  if (!onCollapse) return null;
  return (
    <button
      type="button"
      onClick={onCollapse}
      title="收起成果栏"
      aria-label="收起成果栏"
      className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <PanelRightClose className="h-3.5 w-3.5" />
    </button>
  );
}

export function ClawArtifactPanel({
  sessionId,
  artifacts,
  previewArtifact,
  onPreview,
  onClosePreview,
  onCollapse,
  basePath = '/user/claw',
  onExportDeck,
  exportingFormat = null,
  emptyHint,
}: {
  sessionId: string;
  artifacts: ClawArtifact[];
  previewArtifact: ClawArtifact | null;
  onPreview: (a: ClawArtifact) => void;
  onClosePreview: () => void;
  onCollapse?: () => void;
  /** 交付物端点前缀:'/user/claw'(智能助手) | '/user/boltslides'(制作PPT)。默认 claw。 */
  basePath?: ArtifactBasePath;
  /** 制作PPT:html 演示稿导出 PDF/PPTX(pdf=矢量,pptx=图片版)。 */
  onExportDeck?: (a: ClawArtifact, format: 'pptx' | 'pptx-native' | 'pdf') => void;
  exportingFormat?: 'pptx' | 'pptx-native' | 'pdf' | null;
  /** 空态文案(各 feature 定制,如制作PPT「生成的演示稿会出现在这里」)。缺省用通用句。 */
  emptyHint?: string;
}) {
  // 选中某产物 → 预览(顶部加「返回列表」)。
  if (previewArtifact) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-surface-card">
        <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-3">
          <button
            type="button"
            onClick={onClosePreview}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回成果列表
          </button>
          <CollapseBtn onCollapse={onCollapse} />
        </div>
        <div className="min-h-0 flex-1">
          <ClawArtifactPreview
            artifact={previewArtifact}
            onClose={onClosePreview}
            hideHeaderClose
            basePath={basePath}
            onExportDeck={onExportDeck ? (fmt) => onExportDeck(previewArtifact, fmt) : undefined}
            exportingFormat={exportingFormat}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-3 text-xs font-semibold text-foreground">
        <FolderArchive className="h-3.5 w-3.5 text-brand-green" />
        成果文件
        {artifacts.length > 0 && <span className="text-faint">· {artifacts.length}</span>}
        <CollapseBtn onCollapse={onCollapse} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {artifacts.length > 0 ? (
          <TurnArtifacts sessionId={sessionId} files={artifacts} onPreview={onPreview} basePath={basePath} />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-faint">
            {emptyHint ?? '助手生成的文件会出现在这里'}
          </div>
        )}
      </div>
    </div>
  );
}
