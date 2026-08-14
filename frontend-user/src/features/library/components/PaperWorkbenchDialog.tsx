import { useRef, useState } from 'react';
import { FileText, Link2, Paperclip, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PaperSource, UserLibraryPaper } from '@/shared/api/types';
import { pickEffectiveFields } from '@/shared/lib/pick-field';
import { useLibraryPaperByUpstream, type LibraryFolderFilter } from '../api/papers';
import {
  DialogTabBar,
  WorkbenchDialogShell,
  footerGhostCn,
} from './shared/dialog-chrome';
import { IMPORT_TABS, type ImportTab } from './library-import-dialog/types';
import { OnlineSearchTab } from './library-import-dialog/OnlineSearchTab';
import { PdfUploadTab } from './library-import-dialog/PdfUploadTab';
import { ComingSoonTab } from './library-import-dialog/ComingSoonTab';
import { MetadataPanel } from './manage/MetadataPanel';
import { PdfPanel } from './manage/PdfPanel';
import { RelinkPanel } from './manage/RelinkPanel';

/**
 * 文献工作台 —— 文件夹功能唯一的"添加 / 完善"统一弹窗。
 * (「文件夹功能」而非「文件夹」:后者会被读成"某个文件夹的弹窗",这里说的是整个 feature。)
 * (合并原 LibraryImportDialog 添加弹窗 + PaperManageDialog 管理弹窗。)
 *
 * 一个壳 + 两种语境(intent),所有入口只是带不同初始 view 打开它:
 *
 *   「添加」 mode='add'    tab: 在线搜索 / 本地上传 PDF / Zotero / EndNote(占位)
 *   「管理」 mode='manage'  tab: 元数据 / PDF / 在线关联,作用于某一行 paper
 *
 * 加入 → 完善 闭环:添加语境里产生新行(PDF confirm 入库 / 在线搜索收藏)后,
 * 不关弹窗而是**原地切到该行的管理语境**(fromAdd=true,header 提供「继续添加」
 * 返回入口)。原 PDF 向导的独立"填写步"已删除 —— 管理语境的「元数据」面板
 * (上游值作 placeholder、差量 PATCH og_*)就是填写步,且不再把上游元数据
 * 重复复制进 og_*。
 *
 * 管理语境的 paper 用 by-upstream 订阅保活:面板内 PATCH / 上传 PDF 后
 * invalidate ['library'] 会自动刷新本订阅,弹窗内数据不与列表脱节。
 *
 * ⚠️ 内部用 useState(initial) 取初始视图,靠 unmount 清理(SSE / 上传进度等)。
 * 但 unmount 必须发生在 open 已为 false 之后 —— 调用方用「先关再卸」:open 由独立
 * 状态控制,关闭先置 false 让 Radix 跑完 body 锁清理,延一拍再卸载本组件,并用递增
 * key 保证延迟窗口内重开也能 remount 拿到新 initial(见 LibraryPage / LibraryPaperRow)。
 * 绝不能 `{open && <Dialog open/>}`(挂载条件==open)——那会在 open 时 unmount,泄漏
 * body pointer-events 锁 → 全站点击失灵。
 */

export type ManageTab = 'metadata' | 'pdf' | 'relink';

export type WorkbenchView =
  | { mode: 'add'; tab: ImportTab }
  | { mode: 'manage'; paper: UserLibraryPaper; tab: ManageTab; fromAdd?: boolean };

// 注:id 'metadata' 是内部值(og/metadata 双轨叫法),用户可见 label 统一叫「基本信息」
const MANAGE_TABS: Array<{ id: ManageTab; label: string; icon: typeof Link2 }> = [
  { id: 'metadata', label: '基本信息', icon: FileText },
  { id: 'pdf', label: 'PDF', icon: Paperclip },
  { id: 'relink', label: '在线关联', icon: Link2 },
];

export interface PaperWorkbenchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: WorkbenchView;
  /** 「添加」语境的目标文件夹(行级管理入口可不传) */
  currentFilter?: LibraryFolderFilter;
  currentFolderName?: string;
}

export function PaperWorkbenchDialog({
  open,
  onOpenChange,
  initial,
  currentFilter = 'root',
  currentFolderName = '我的文件夹',
}: PaperWorkbenchDialogProps) {
  const [view, setView] = useState<WorkbenchView>(initial);
  const close = () => onOpenChange(false);

  // 「继续添加」回到用户来时的添加 tab(在线搜索 / PDF),而不是固定某一个
  const lastAddTabRef = useRef<ImportTab>(initial.mode === 'add' ? initial.tab : 'pdf');
  if (view.mode === 'add') lastAddTabRef.current = view.tab;

  // 管理语境:订阅最新行数据(PATCH / 上传 / 关联后 invalidate 自动刷新)。
  // relink 成功后面板随即关闭弹窗;若订阅 miss(如切换上游后 (source,
  // source_paper_id) 变化),回落到打开弹窗时传入的 view.paper 快照。
  const manage = view.mode === 'manage' ? view : null;
  const freshQ = useLibraryPaperByUpstream(
    manage ? (manage.paper.source as PaperSource) : undefined,
    manage?.paper.source_paper_id
  );
  const paper = manage ? (freshQ.data ?? manage.paper) : null;

  // 「添加」语境产生了新行(PDF confirm 入库 / 在线搜索收藏后点「完善」)
  // → 原地切到该行的管理语境
  const enterManage = (row: UserLibraryPaper, tab: ManageTab = 'metadata') => {
    setView({ mode: 'manage', paper: row, tab, fromAdd: view.mode === 'add' });
  };

  const handleCreated = (row: UserLibraryPaper, merged: boolean) => {
    toast.success(
      merged ? '你已收藏过这篇论文,已为你合并 · 可继续完善信息' : '已加入文件夹 · 可继续完善信息'
    );
    enterManage(row, 'metadata');
  };

  // ─── header 内容按语境切换 ────────────────────────────────────────────────
  const shellProps =
    view.mode === 'add'
      ? {
          icon: <Plus className="size-4 text-foreground" strokeWidth={2.25} />,
          iconBg: 'bg-surface-2',
          title: '添加文献',
          description: (
            <>
              通过在线搜索或上传 PDF,把文献添加到{' '}
              <span className="font-medium text-foreground">「{currentFolderName}」</span>
            </>
          ),
          headerExtra: undefined,
        }
      : {
          icon: <Settings2 className="size-4 text-brand-amber" strokeWidth={2.25} />,
          iconBg: 'bg-warning-soft',
          title: '论文信息管理',
          description: (paper ? pickEffectiveFields(paper).title : '') || '(无标题)',
          headerExtra: view.fromAdd ? (
            <button
              type="button"
              onClick={() => setView({ mode: 'add', tab: lastAddTabRef.current })}
              className={footerGhostCn}
            >
              <Plus className="size-3.5" />
              继续添加
            </button>
          ) : undefined,
        };

  return (
    <WorkbenchDialogShell open={open} onOpenChange={onOpenChange} {...shellProps}>
      {view.mode === 'add' ? (
        <>
          <DialogTabBar
            tabs={IMPORT_TABS}
            value={view.tab}
            onChange={(t) => setView({ mode: 'add', tab: t })}
            ariaLabel="添加方式"
          />
          {/* 各 tab 自管 body 滚动 + footer;切 tab unmount 重置半截输入 */}
          {view.tab === 'search' && (
            <OnlineSearchTab
              currentFilter={currentFilter}
              currentFolderName={currentFolderName}
              onDone={close}
              onManagePaper={(row) => enterManage(row, 'metadata')}
            />
          )}
          {view.tab === 'pdf' && (
            <PdfUploadTab
              currentFilter={currentFilter}
              currentFolderName={currentFolderName}
              onDone={close}
              onCreated={handleCreated}
            />
          )}
          {view.tab === 'zotero' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ComingSoonTab name="Zotero" />
            </div>
          )}
          {view.tab === 'endnote' && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ComingSoonTab name="EndNote" />
            </div>
          )}
        </>
      ) : (
        paper && (
          <>
            <DialogTabBar
              tabs={MANAGE_TABS}
              value={view.tab}
              onChange={(t) => setView({ ...view, tab: t })}
              ariaLabel="管理类别"
            />
            {view.tab === 'metadata' && (
              <MetadataPanel paper={paper} onClose={close} justAdded={view.fromAdd} />
            )}
            {view.tab === 'pdf' && (
              <PdfPanel
                paper={paper}
                onClose={close}
                onRequestEditMeta={() => setView({ ...view, tab: 'metadata' })}
              />
            )}
            {view.tab === 'relink' && <RelinkPanel paper={paper} onClose={close} />}
          </>
        )
      )}
    </WorkbenchDialogShell>
  );
}
