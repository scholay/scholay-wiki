import { UploadCloud } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { MAX_PDF_SIZE } from '../../api/pdf';

/** Step 1 —— 拖拽 / 点选 PDF;识别完成前阻塞下一步 */
export function UploadStep({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center w-full gap-2.5 px-6 py-16 rounded-md',
          'border border-dashed transition-colors',
          dragOver
            ? 'border-foreground bg-surface-1'
            : 'border-border-strong bg-surface-1/40 hover:bg-surface-1 hover:border-foreground/60'
        )}
      >
        <UploadCloud
          className="size-8 text-muted-foreground"
          strokeWidth={1.5}
        />
        <div className="text-sm font-semibold text-foreground">
          点击选择 PDF 文件
        </div>
        <div className="text-xs text-muted-foreground">或拖拽 PDF 到此处</div>
      </button>
      <p className="mt-3 text-2xs text-faint leading-relaxed">
        仅支持 PDF,大小 ≤ {MAX_PDF_SIZE / 1024 / 1024} MB。我们会自动解析标题 →
        从多个上游论文源搜索关联;若搜不到,走 AI 智能识别为
        <span className="text-brand-green font-semibold">自由文件</span>。
      </p>
    </>
  );
}
