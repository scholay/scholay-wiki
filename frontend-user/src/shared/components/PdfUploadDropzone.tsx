import { useCallback, useRef, useState } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { validatePdfFile } from '@/shared/lib/validate-pdf-file';

export function PdfUploadDropzone({
  onUpload,
  isPending = false,
  progress = 0,
  size = 'md',
  className,
}: {
  onUpload: (file: File) => void;
  isPending?: boolean;
  progress?: number;
  /** lg = PDF Chat 缺文主路径,面积更大 */
  size?: 'md' | 'lg';
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLg = size === 'lg';

  const acceptFile = useCallback((f: File) => {
    const msg = validatePdfFile(f);
    if (msg) {
      setError(msg);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  };

  const handleSubmit = () => {
    if (!file || isPending) return;
    onUpload(file);
  };

  return (
    <div className={cn('flex w-full max-w-md flex-col gap-3', className)}>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isPending && inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center text-center transition-colors',
          isLg
            ? 'gap-3.5 rounded-12 border-2 border-dashed px-6 py-10'
            : 'gap-3 rounded-lg border-2 border-dashed px-6 py-8',
          dragOver
            ? 'border-brand-red/50 bg-brand-red/5'
            : 'border-brand-red/25 bg-brand-red/[0.03] hover:border-brand-red/40 hover:bg-brand-red/5',
          isPending && 'pointer-events-none opacity-70',
        )}
      >
        <UploadCloud
          className={cn(isLg ? 'size-10' : 'size-8', 'text-brand-red')}
          strokeWidth={1.75}
        />
        <div>
          <p
            className={cn(
              'font-semibold text-foreground',
              isLg ? 'text-md' : 'text-sm',
            )}
          >
            拖入 PDF，或点击选择文件
          </p>
          <p className="mt-1.5 text-xs text-subtle">
            上传后即可针对全文继续对话 · 仅 .pdf，上限 50 MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) acceptFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {file && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-xs">
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {file.name}
          </span>
          {!isPending && (
            <button
              type="button"
              aria-label="移除文件"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                setError(null);
              }}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-subtle hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-brand-red">{error}</p>}

      {isPending && progress > 0 && (
        <div className="h-1.5 overflow-hidden rounded-pill bg-surface-2">
          <div
            className="h-full rounded-pill bg-brand-red transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <button
        type="button"
        disabled={!file || isPending}
        onClick={handleSubmit}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-pill bg-brand-red px-5 font-bold text-white shadow-sm transition-colors hover:bg-brand-red/90 disabled:cursor-not-allowed disabled:opacity-50',
          isLg ? 'h-11 text-sm' : 'h-10 text-sm',
        )}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            上传中…
          </>
        ) : (
          '上传并继续'
        )}
      </button>
    </div>
  );
}
