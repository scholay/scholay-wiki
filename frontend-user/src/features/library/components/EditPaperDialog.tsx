/**
 * 编辑论文信息弹窗 —— 对应 .pen `byWhA` 的 "补充字段" 操作。
 *
 * 数据模型:
 *   - 写入的是 og_* 字段 (用户那一边的真值), 永不污染元数据 (title/abstract/...)
 *   - 字段为空时显示元数据原值作 placeholder, 提示"留空即恢复显示元数据"
 *   - 提交时只发**用户改过**的字段, 没改的字段不出现在 payload
 *
 * 输入框 6 个: 标题 / 作者 / 摘要 / 年份 / 期刊 / DOI
 *   - 作者用 "name1; name2; name3" 文本输入, 提交时按 `;` 拆成 [{name}, ...]
 *     (符合 og_authors: PaperAuthor[] 的 wire 格式, 与上游 metadata authors 同形)
 *   - 年份限制 1800-2100, 0 / 空 = 清空
 *
 * UX 细节:
 *   - 标题栏左侧绿色 icon (与 byWhA 设计一致 —— 补充字段是 "正向" 操作)
 *   - 底部 [取消] [恢复全部为元数据] [保存]
 *   - "恢复全部为元数据" = 清空所有 og_* 字段, 让 pickField 全部 fallback
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Pencil, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { useUpdatePaper, type UpdatePaperOGPayload } from '../api/papers';
import type { PaperAuthor, UserLibraryPaper } from '@/shared/api/types';

interface EditPaperDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  paper: UserLibraryPaper;
}

// ─── 作者数组 ↔ "name1; name2" 文本互转 ───────────────────────────────────────
function authorsToText(authors?: PaperAuthor[]): string {
  if (!authors || authors.length === 0) return '';
  return authors.map((a) => a.name ?? '').filter(Boolean).join('; ');
}
function textToAuthors(text: string): PaperAuthor[] {
  return text
    .split(/[;；,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export function EditPaperDialog({ open, onOpenChange, paper }: EditPaperDialogProps) {
  const updateMut = useUpdatePaper();

  // 表单 state —— 每次 open 时按 og 值初始化, 没 og 值则为空 (placeholder 显示元数据)
  const [title, setTitle] = useState('');
  const [authorsText, setAuthorsText] = useState('');
  const [abstract, setAbstract] = useState('');
  const [year, setYear] = useState('');
  const [venue, setVenue] = useState('');
  const [doi, setDoi] = useState('');

  // 初始 og 值快照 —— 用来 diff 出"用户改过的字段"
  const initialRef = useRef({
    title: '',
    authors: '',
    abstract: '',
    year: '',
    venue: '',
    doi: '',
  });

  useEffect(() => {
    if (!open) return;
    const init = {
      title: paper.og_title ?? '',
      authors: authorsToText(paper.og_authors),
      abstract: paper.og_abstract ?? '',
      year: paper.og_year ? String(paper.og_year) : '',
      venue: paper.og_venue ?? '',
      doi: paper.og_doi ?? '',
    };
    initialRef.current = init;
    setTitle(init.title);
    setAuthorsText(init.authors);
    setAbstract(init.abstract);
    setYear(init.year);
    setVenue(init.venue);
    setDoi(init.doi);
  }, [open, paper]);

  // 元数据 placeholder —— 鼓励用户看到上游原值
  const placeholderTitle = paper.title || '(上游无标题)';
  const placeholderAuthors = useMemo(() => authorsToText(paper.authors), [paper.authors]);
  const placeholderAbstract = paper.abstract || '(上游无摘要)';
  const placeholderYear = paper.year ? String(paper.year) : '';
  const placeholderVenue = paper.venue || '(上游无期刊)';
  const placeholderDoi = paper.doi || '';

  // diff 当前表单 vs initialRef → 只把改过的字段进 payload
  const buildPayload = (): UpdatePaperOGPayload => {
    const init = initialRef.current;
    const p: UpdatePaperOGPayload = {};
    if (title !== init.title) p.og_title = title;
    if (authorsText !== init.authors) {
      const arr = textToAuthors(authorsText);
      p.og_authors = arr.length === 0 ? null : arr;
    }
    if (abstract !== init.abstract) p.og_abstract = abstract;
    if (year !== init.year) {
      const n = Number(year);
      if (year.trim() === '' || isNaN(n)) p.og_year = 0; // backend treats 0 as "clear"
      else p.og_year = Math.max(0, Math.min(9999, Math.floor(n)));
    }
    if (venue !== init.venue) p.og_venue = venue;
    if (doi !== init.doi) p.og_doi = doi;
    return p;
  };

  const handleSave = async () => {
    if (updateMut.isPending) return;
    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      await updateMut.mutateAsync({ paperId: paper.id, payload });
      toast.success('已保存编辑');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleResetAll = async () => {
    if (updateMut.isPending) return;
    try {
      await updateMut.mutateAsync({
        paperId: paper.id,
        payload: {
          og_title: '',
          og_abstract: '',
          og_authors: null,
          og_year: 0,
          og_venue: '',
          og_doi: '',
        },
      });
      toast.success('已恢复显示元数据');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '恢复失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[640px] max-w-[calc(100vw-32px)]',
            '-translate-x-1/2 -translate-y-1/2',
            'flex flex-col max-h-[85vh] overflow-hidden',
            'rounded-lg border border-border bg-background',
            'shadow-[0_8px_24px_rgba(15,23,42,0.12)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          {/* header —— green accent 表示"补充字段"是正向操作 */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
            <div className="min-w-0">
              <DialogPrimitive.Title className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                <Pencil className="size-4 text-brand-green" />
                补充 / 修正论文信息
              </DialogPrimitive.Title>
              <p className="mt-1 text-xs text-muted-foreground">
                你的修改只覆盖展示, 不会污染上游元数据 · 留空 = 恢复显示原值
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* body —— 6 字段表单 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-4">
            <Field
              label="标题"
              value={title}
              onChange={setTitle}
              placeholder={placeholderTitle}
            />
            <Field
              label="作者"
              hint="多个作者用 ; 或 , 隔开"
              value={authorsText}
              onChange={setAuthorsText}
              placeholder={placeholderAuthors || '(上游无作者)'}
            />
            <Field
              label="摘要"
              value={abstract}
              onChange={setAbstract}
              placeholder={placeholderAbstract}
              multiline
            />
            <div className="grid grid-cols-3 gap-3">
              <Field
                label="年份"
                value={year}
                onChange={setYear}
                placeholder={placeholderYear || 'YYYY'}
                inputMode="numeric"
              />
              <Field
                label="期刊 / 会议"
                value={venue}
                onChange={setVenue}
                placeholder={placeholderVenue}
              />
              <Field
                label="DOI"
                value={doi}
                onChange={setDoi}
                placeholder={placeholderDoi || '10.xxxx/xxxxx'}
              />
            </div>
          </div>

          {/* footer */}
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border-soft shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleResetAll}
              disabled={updateMut.isPending}
            >
              <RotateCcw className="size-3.5 mr-1.5" />
              全部恢复为元数据
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={updateMut.isPending}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

// ─── 表单字段子组件 ───────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: 'numeric' | 'text';
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  multiline,
  inputMode,
}: FieldProps) {
  const isOverriding = value.trim().length > 0;
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-xs font-semibold text-foreground">
          {label}
          {isOverriding && (
            <span
              className="ml-1.5 text-2xs font-normal text-brand-green"
              title="此字段当前为用户编辑值, 覆盖上游元数据"
            >
              · 已修改
            </span>
          )}
        </span>
        {hint && <span className="text-2xs text-faint">{hint}</span>}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className={cn(
            'w-full px-3 py-2 rounded-sm bg-background border border-border text-sm outline-none resize-y',
            'placeholder:text-faint',
            'focus:border-foreground focus:ring-2 focus:ring-ring/20 transition-colors'
          )}
        />
      ) : (
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'w-full h-9 px-3 rounded-sm bg-background border border-border text-sm outline-none',
            'placeholder:text-faint',
            'focus:border-foreground focus:ring-2 focus:ring-ring/20 transition-colors'
          )}
        />
      )}
    </label>
  );
}
