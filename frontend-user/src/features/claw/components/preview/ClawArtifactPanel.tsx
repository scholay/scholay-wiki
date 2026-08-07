/**
 * 右侧【扩展区】—— 对话之外的第二块画布:既列出本会话产物,也承担产物的**预览**
 * (html 演示稿 / 表格 / 文档等在这里直接打开看,近似一个内嵌浏览器)。
 *
 * ⚠️ 命名:对用户一律叫「扩展区」,不叫「成果文件 / 成果栏」——
 *    旧名只描述了「列文件」这一半职责,而预览才是它更常被用到的那一半。
 *    代码内部原本的注释就已经在用「右侧文档扩展区」这个说法,此处是把口径收敛统一。
 *
 * 两态:
 *   - 未选中:列出本会话全部产物(复用 TurnArtifacts 列表)。
 *   - 选中某个:全屏预览该产物(复用 ClawArtifactPreview),顶部「← 返回」回到列表。
 *
 * 容器由调用方决定,组件本身对宽度无感:
 *   - 桌面(>1024):ConversationWorkspace 的右侧可拖拽分栏;
 *   - 窄屏 / 移动端:整屏 Sheet(ConversationWorkspace 与 MobileClawPage 各挂一处)。
 * ⚠️ 2026-08-07 之前窄屏 Sheet 里挂的是 `ClawArtifactPreview`(只能显示**一个**文件),
 *    于是 ≤1024 与 /m/claw 上根本没有产物**列表**,用户看不到 agent 产出的其它文件。
 *    现在两端共用本组件 —— 加新 feature / 改列表行为时不会再漏掉窄屏那一份。
 *
 * ⚠️ 面板内不再自带「收起」按钮 —— 开合统一由顶栏那颗「扩展区」开关负责。
 *    原先两颗按钮上下紧邻(顶栏一颗、面板头一颗)、图标又几乎一样,视觉上像重影;
 *    而且同一个动作有两个入口本身就容易让两边行为分叉(复核实测确实分叉过:
 *    顶栏那条不清 previewArtifact)。
 *
 * ⚠️ 2026-07-27 起挂载条件变了。挂载由 ConversationWorkspace(**不是 ClawPage**)的
 *    `rightOpen = rightOpenPref ?? hasArtifacts` 决定:用户点过顶栏「扩展区」开关就听用户的,
 *    没点过才回落到旧的「有产物才展开」。也就是说本组件会在**零产物**时被挂载,
 *    【必须能体面地渲染空态】(见下方 EmptyState)。
 */
import { ArrowLeft, FolderArchive } from 'lucide-react';
import { type ArtifactBasePath, type ClawArtifact } from '../../api/artifacts';
import { EmptyState } from '@/shared/components/EmptyState';
import { TurnArtifacts } from '../chat/TurnArtifacts';
import { ClawArtifactPreview } from './ClawArtifactPreview';


export function ClawArtifactPanel({
  sessionId,
  artifacts,
  previewArtifact,
  onPreview,
  onClosePreview,
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
            className="flex items-center gap-1.5 text-12 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回列表
          </button>
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
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-3 text-14 font-medium text-foreground">
        <FolderArchive className="h-3.5 w-3.5 text-brand-green" />
        扩展区
        {artifacts.length > 0 && <span className="text-faint">· {artifacts.length}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {artifacts.length > 0 ? (
          <TurnArtifacts sessionId={sessionId} files={artifacts} onPreview={onPreview} basePath={basePath} />
        ) : (
          /* 空态 —— 2026-07-27 从「居中一行灰字」升级成带图示的介绍。
             起因:扩展区现在顶栏常驻可开,用户会在【还没有任何产物时】主动打开它,
             那一刻界面必须自己说明「这是什么、什么时候会有东西」,否则就是一块空白。
             · dense:EmptyState 的常规档(py-20 / 48px 图标 / text-16 标题)是给**整页**空态定的份量,
               放进这条 24%~34% 宽的次级面板里显得过重 —— 不是会被裁掉,是比例不对。
             · h-full:保住改版前的**垂直居中**。EmptyState 自身不撑高,不给 h-full 就会顶在
               列表区顶端,与旧版观感不一致。 */
          <EmptyState
            dense
            className="h-full"
            icon={FolderArchive}
            title="扩展区暂无内容"
            description={emptyHint ?? '对话中生成的文档、表格、演示稿会自动收集到这里,点击即可预览或下载。'}
          />
        )}
      </div>
    </div>
  );
}
