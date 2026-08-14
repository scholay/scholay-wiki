import { useRef, type ReactNode } from 'react';
import { FileUp, FolderOpen, Library, Plus } from 'lucide-react';
import { openAttachmentManager } from '@/shared/lib/attachment-events';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

/**
 * ComposerPlusMenu —— 输入框左下角的「+」聚合菜单(三 agent feature 共用)。
 * 2026-07 输入框统一:业界收敛形态(GPT/Claude/Gemini)—— 单个 + 按钮向上弹菜单,
 * 收编「上传文件 / 引用文献」等入口,取代并排多图标(底栏空间留给模型选择器等)。
 * 菜单项按 feature 能力增减:onPickLibrary 不传则不渲染引用项;extraItems 追加 feature 特有项。
 */
export function ComposerPlusMenu({
  disabled,
  accept,
  onFiles,
  onPickLibrary,
  extraItems,
}: {
  disabled?: boolean;
  /** 文件选择器 accept 白名单(shared/hooks/useComposerAttachments 的 ATTACHMENT_ACCEPT)。 */
  accept: string;
  onFiles: (files: File[]) => void;
  /** 「引用文献」入口;不传 = 该 feature 无引用能力,不渲染菜单项。 */
  onPickLibrary?: () => void;
  /** feature 特有菜单项(已包 DropdownMenuItem 的节点)。 */
  extraItems?: ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept={accept}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = ''; // 允许重复选同一个文件
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="添加附件或引用"
            title="添加附件或引用"
            className="inline-flex h-8 w-8 items-center justify-center rounded-8 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-52">
          <DropdownMenuItem onSelect={() => fileRef.current?.click()} className="gap-2">
            <FileUp className="size-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-12">上传图片 / 文件</span>
              <span className="text-12 text-faint">也可直接粘贴或拖入输入框</span>
            </div>
          </DropdownMenuItem>
          {/* 「我的附件」—— 附件删除的**主动入口**。
              没有它,后端两条配额文案里那句「或在『我的附件』里删掉不再需要的文件」
              就又是一条用户走不到的路(撞额度时的被动弹窗只覆盖 per-user 那一种)。
              放在共用的 + 菜单里 = 四个 feature 一次到位,不做 per-feature 镜像。 */}
          <DropdownMenuItem onSelect={() => openAttachmentManager()} className="gap-2">
            <FolderOpen className="size-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-12">我的附件</span>
              <span className="text-12 text-faint">查看占用、删掉不再需要的文件</span>
            </div>
          </DropdownMenuItem>
          {onPickLibrary && (
            <DropdownMenuItem onSelect={onPickLibrary} className="gap-2">
              <Library className="size-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-12">引用文献</span>
                <span className="text-12 text-faint">把文件夹里的论文交给智能体阅读</span>
              </div>
            </DropdownMenuItem>
          )}
          {extraItems}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
