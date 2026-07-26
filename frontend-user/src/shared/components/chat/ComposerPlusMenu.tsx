import { useRef, type ReactNode } from 'react';
import { FileUp, Library, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

/**
 * ComposerPlusMenu —— 输入框左下角的「+」聚合菜单(三 agent feature 共用)。
 * 2026-07 输入框统一:业界收敛形态(GPT/Claude/Gemini)—— 单个 + 按钮向上弹菜单,
 * 收编「上传文件 / 引用文献集」等入口,取代并排多图标(底栏空间留给模型选择器等)。
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
  /** 「引用文献集」入口;不传 = 该 feature 无引用能力,不渲染菜单项。 */
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
              <span className="text-sm">上传图片 / 文件</span>
              <span className="text-2xs text-faint">也可直接粘贴或拖入输入框</span>
            </div>
          </DropdownMenuItem>
          {onPickLibrary && (
            <DropdownMenuItem onSelect={onPickLibrary} className="gap-2">
              <Library className="size-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm">引用文献集</span>
                <span className="text-2xs text-faint">把文献集里的论文交给智能体阅读</span>
              </div>
            </DropdownMenuItem>
          )}
          {extraItems}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
