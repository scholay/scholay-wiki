import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { UpdatePaperOGPayload } from '../api/papers';
import { textToAuthors } from '../lib/resolve-paper';

/**
 * 文件夹内论文的核心元数据表单(RHF + zod)—— 6 个会落到 og_* 的字段。
 * 「手动编辑」「PDF 上传填充」「(PR5)统一管理弹窗 · 元数据 tab」共用一套表单 + 同一序列化出口。
 *
 *   - authors: "; " / "," 分隔的可编辑文本(经 textToAuthors 转回数组)
 *   - year:    4 位数字文本
 *   - 其余:    直接字符串
 *
 * 两种提交语义,对应两个出口:
 *   - toOgPayload()      只发改过的字段(diff,RHF dirtyFields)—— 手动编辑用
 *   - toFullOgPayload()  全量 6 字段 —— PDF 填充(新建论文,表单即 og)用
 *
 * RHF 的 dirtyFields 天生是"和 defaultValues 的差量"(还原到初值会自动清脏),
 * 比原先手写的 useState + initialRef 更可靠。切换论文时调 form.reset(newDefaults) 重置基线。
 */
export const metadataSchema = z.object({
  title: z.string(),
  authors: z.string(),
  venue: z.string(),
  year: z.string(),
  doi: z.string(),
  abstract: z.string(),
});

export type MetadataFormValues = z.infer<typeof metadataSchema>;

export const EMPTY_METADATA: MetadataFormValues = {
  title: '',
  authors: '',
  venue: '',
  year: '',
  doi: '',
  abstract: '',
};

const ALL_DIRTY: Record<keyof MetadataFormValues, boolean> = {
  title: true,
  authors: true,
  venue: true,
  year: true,
  doi: true,
  abstract: true,
};

/**
 * 纯函数:表单值 + 脏字段标记 → og_* PATCH payload(只发标脏的字段)。
 * 收编原 PaperEditDialog.buildOGPayload(diff)与 PdfUploadTab.formToOG(全量=全脏)。可单测。
 */
export function formToOgPayload(
  values: MetadataFormValues,
  dirty: Partial<Record<keyof MetadataFormValues, boolean>>
): UpdatePaperOGPayload {
  const p: UpdatePaperOGPayload = {};
  if (dirty.title) p.og_title = values.title.trim();
  if (dirty.abstract) p.og_abstract = values.abstract;
  if (dirty.venue) p.og_venue = values.venue.trim();
  if (dirty.doi) p.og_doi = values.doi.trim();
  if (dirty.year) {
    const n = parseInt(values.year, 10);
    p.og_year = Number.isFinite(n) ? n : 0;
  }
  if (dirty.authors) p.og_authors = textToAuthors(values.authors);
  return p;
}

export interface UseMetadataFormReturn {
  form: UseFormReturn<MetadataFormValues>;
  /** 当前脏字段 → og_* PATCH(空对象 = 没改)。手动编辑用。 */
  toOgPayload: () => UpdatePaperOGPayload;
  /** 全量 6 字段 → og_*。PDF 填充(新建论文)用。 */
  toFullOgPayload: () => UpdatePaperOGPayload;
}

export function useMetadataForm(initial?: Partial<MetadataFormValues>): UseMetadataFormReturn {
  const form = useForm<MetadataFormValues>({
    resolver: zodResolver(metadataSchema),
    defaultValues: { ...EMPTY_METADATA, ...initial },
  });
  return {
    form,
    toOgPayload: () =>
      formToOgPayload(
        form.getValues(),
        form.formState.dirtyFields as Partial<Record<keyof MetadataFormValues, boolean>>
      ),
    toFullOgPayload: () => formToOgPayload(form.getValues(), ALL_DIRTY),
  };
}
