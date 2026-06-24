import { BookText, FolderOpen, X } from 'lucide-react';
import type { TurnReference } from '@/shared/types/chat';

/**
 * 「引用文献」chip 列表 —— claw 用户引用文献集论文/文件夹后的特有展示样式
 * (区别于上传附件的深色 chip;引用走描边 + 品牌绿,呼应 Cursor/Codex 的 @ 引用观感)。
 *
 * 两处复用:
 *   - 输入框:可删除(传 onRemove),发送前可去掉某条引用。
 *   - 聊天记录(用户气泡上方):只读展示(不传 onRemove)。
 */
export interface ReferenceChipListProps {
  references: TurnReference[];
  /** 传了 = 可删(输入框态);不传 = 只读(气泡/历史态)。 */
  onRemove?: (index: number) => void;
  /** 用户气泡侧靠右对齐;输入框侧靠左。 */
  align?: 'start' | 'end';
}

export function ReferenceChipList({ references, onRemove, align = 'start' }: ReferenceChipListProps) {
  if (references.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 max-w-full ${align === 'end' ? 'justify-end' : ''}`}>
      {references.map((r, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 max-w-[220px] rounded-sm border border-brand-green/40 bg-brand-green/10 px-2 py-0.5 text-2xs text-brand-green"
          title={
            r.kind === 'folder'
              ? `引用文件夹「${r.title}」(${r.paperCount ?? 0} 篇)`
              : `引用文献:${r.title}${r.hasPdf ? ' · 含 PDF 全文' : ''}`
          }
        >
          {r.kind === 'folder' ? (
            <FolderOpen className="size-3 shrink-0" strokeWidth={2.2} />
          ) : (
            <BookText className="size-3 shrink-0" strokeWidth={2.2} />
          )}
          <span className="truncate min-w-0">{r.title}</span>
          {r.kind === 'folder' && (
            <span className="shrink-0 opacity-70">· {r.paperCount ?? 0}篇</span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="shrink-0 -mr-0.5 rounded-sm p-0.5 hover:bg-brand-green/20"
              title="移除引用"
            >
              <X className="size-2.5" strokeWidth={2.5} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
