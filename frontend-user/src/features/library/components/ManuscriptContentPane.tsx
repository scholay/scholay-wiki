import { useNavigate } from 'react-router-dom';
import { PenLine, X } from 'lucide-react';
import { LoadingState } from '@/shared/components/LoadingState';
import { useManuscript } from '@/shared/api/manuscripts';
import { Button } from '@/shared/ui/button';

/**
 * 稿件集右侧阅读区 —— 展示写作主文件 / 上传稿抽出的正文,不承担状态时间线。
 */
export function ManuscriptContentPane({
  manuscriptId,
  onClose,
}: {
  manuscriptId: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const detailQ = useManuscript(manuscriptId);
  const manuscript = detailQ.data?.manuscript;
  const preview = detailQ.data?.preview;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-15 shrink-0 items-center gap-2 border-b border-border px-6">
        <span className="min-w-0 truncate text-14 font-medium text-foreground">
          {manuscript?.title ?? '稿件内容'}
        </span>
        {preview?.sourceLabel && (
          <span className="shrink-0 rounded-4 bg-surface-2 px-1.5 py-px text-12 text-subtle">
            {preview.sourceLabel}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {manuscript?.origin === 'prism' && manuscript.prismProjectId ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-14"
              onClick={() => navigate(`/prism?p=${manuscript.prismProjectId}`)}
            >
              <PenLine className="size-3.5" />
              打开写作
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭内容"
            className="inline-flex size-8 items-center justify-center rounded-8 text-subtle transition-colors hover:bg-surface-1 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {detailQ.isLoading ? (
          <LoadingState />
        ) : detailQ.isError || !manuscript ? (
          <p className="px-6 py-10 text-center text-12 text-faint">
            稿件不存在或已被删除
          </p>
        ) : (
          <article className="mx-auto max-w-2xl px-8 py-8">
            <h2 className="font-serif text-24 font-bold leading-display-tight text-foreground">
              {preview?.title ?? manuscript.title}
            </h2>
            {preview?.authors && (
              <p className="mt-2 text-12 text-muted-foreground">{preview.authors}</p>
            )}
            {preview?.abstract && (
              <section className="mt-6">
                <h3 className="text-12 font-medium text-subtle">摘要</h3>
                <p className="mt-2 text-14 leading-paragraph text-foreground">
                  {preview.abstract}
                </p>
              </section>
            )}
            {(preview?.sections ?? []).map((section) => (
              <section key={section.heading} className="mt-6">
                <h3 className="font-serif text-16 font-bold text-foreground">
                  {section.heading}
                </h3>
                <p className="mt-2 text-14 leading-paragraph text-foreground">
                  {section.text}
                </p>
              </section>
            ))}
            {!preview?.abstract && (preview?.sections?.length ?? 0) === 0 && (
              <p className="mt-6 text-12 text-faint">这篇稿件还没有可预览的正文。</p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
