import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { CitationProse } from '@/shared/components/CitationProse';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import {
  CITATION_FORMATS,
  CITATION_FORMAT_LABELS,
  generateCitation,
  isMonoCitation,
  readDefaultCitationFormat,
  setDefaultCitationFormat,
  stripItalic,
  type CitationFormat,
  type CitationPaper,
} from '@/shared/lib/citation';
import { cn } from '@/shared/lib/utils';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { useSiteSupportEmail } from '@/shared/api/public-config';
import { fetchCrossrefByDoi } from '../lib/crossref';

/**
 * 引用格式生成器 —— 独立工具页 `/citation-generator`。
 *
 * 两种录入:
 *   1) DOI 解析:粘 DOI / DOI 链接 → Crossref 取题录 → 出 5 种格式
 *   2) 手动录入:作者/题名/刊名/年/卷/页 → 出 5 种格式
 * 复用 [[generateCitation]] 单一真源,GB/T 7714 默认置顶(中文用户刚需)。
 *
 * SEO 目标词:参考文献生成器 / GB/T 7714 在线 / 引用格式生成 / DOI 转引用。
 */

const EXAMPLE_DOI = '10.1038/nature14539';

function authorsToList(input: string): CitationPaper['authors'] {
  return input
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export function CitationGeneratorPage() {
  const [mode, setMode] = useState<'doi' | 'manual'>('doi');
  // Crossref 礼貌池邮箱用本环境自己的 SUPPORT_EMAIL,不再共用一个写死的地址
  // (Crossref 按 email 维度限速,共用会让一套环境的批量测试拖累其它所有环境)。
  const politeEmail = useSiteSupportEmail();

  // ── DOI 模式 ──
  const [doiInput, setDoiInput] = useState('');
  const resolve = useMutation({
    mutationFn: (doi: string) => fetchCrossrefByDoi(doi, politeEmail),
    onError: (err) => toast.error((err as Error).message || '解析失败'),
  });

  // ── 手动模式 ──
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [venue, setVenue] = useState('');
  const [year, setYear] = useState('');
  const [volume, setVolume] = useState('');
  const [pages, setPages] = useState('');

  const manualPaper = useMemo<CitationPaper>(
    () => ({
      title: title.trim() || undefined,
      authors: authorsToList(authors),
      year: year.trim() || undefined,
      venue: venue.trim() || undefined,
      journal: {
        volume: volume.trim() || undefined,
        pages: pages.trim() || undefined,
      },
    }),
    [title, authors, venue, year, volume, pages]
  );

  const paper = mode === 'doi' ? resolve.data ?? null : manualPaper;
  const hasContent = !!(paper?.title || paper?.authors?.length);

  return (
    <div className="h-full overflow-auto bg-background">
      <RouteSEO
        title="参考文献引用格式生成器(GB/T 7714 / APA / MLA / BibTeX) - Scholay"
        description="免费在线参考文献生成器:输入 DOI 或手动录入,一键生成 GB/T 7714 国标、APA、MLA、Chicago、BibTeX 五种引用格式,支持一键复制,适用于学位论文与期刊投稿。"
        keywords="参考文献生成器,GB/T 7714,引用格式生成,DOI转引用,APA格式,MLA格式,BibTeX,毕业论文参考文献格式"
      />

      <div className="mx-auto max-w-[760px] px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
        <header className="space-y-2">
          <div className="text-12 font-medium uppercase text-faint">
            CITATION GENERATOR
          </div>
          <h1 className="font-display font-bold text-24 sm:text-28 text-foreground">
            参考文献引用格式生成器
          </h1>
          <p className="text-12 text-muted-foreground leading-paragraph">
            输入 DOI 自动解析,或手动录入文献信息,一键生成 GB/T 7714(国标)、APA、MLA、
            Chicago、BibTeX 五种格式。
          </p>
        </header>

        {/* 录入方式切换 */}
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as 'doi' | 'manual')}
          className="mt-8"
        >
          <TabsList>
            <TabsTrigger value="doi">DOI 解析</TabsTrigger>
            <TabsTrigger value="manual">手动录入</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'doi' ? (
          <form
            className="mt-4 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (doiInput.trim()) resolve.mutate(doiInput);
            }}
          >
            <div className="flex items-center gap-2">
              <Input
                value={doiInput}
                onChange={(e) => setDoiInput(e.target.value)}
                placeholder="粘贴 DOI 或 DOI 链接,如 10.1038/nature14539"
                className="flex-1"
                inputMode="text"
                autoComplete="off"
              />
              <Button type="submit" disabled={!doiInput.trim() || resolve.isPending}>
                {resolve.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                解析
              </Button>
            </div>
            <p className="text-12 text-faint">
              不知道 DOI?试试示例{' '}
              <button
                type="button"
                className="text-brand-red hover:underline"
                onClick={() => {
                  setDoiInput(EXAMPLE_DOI);
                  resolve.mutate(EXAMPLE_DOI);
                }}
              >
                {EXAMPLE_DOI}
              </button>
            </p>
          </form>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ManualField
              label="题名"
              value={title}
              onChange={setTitle}
              className="sm:col-span-2"
            />
            <ManualField
              label="作者(多位用分号 ; 或换行分隔)"
              value={authors}
              onChange={setAuthors}
              className="sm:col-span-2"
            />
            <ManualField label="刊名 / 会议" value={venue} onChange={setVenue} />
            <ManualField label="年份" value={year} onChange={setYear} />
            <ManualField label="卷(期)" value={volume} onChange={setVolume} />
            <ManualField label="页码" value={pages} onChange={setPages} />
          </div>
        )}

        {/* 结果区 */}
        <div className="mt-8">
          {hasContent ? (
            <CitationResult paper={paper} />
          ) : (
            <div className="rounded-16 border border-dashed border-border bg-surface-1 px-6 py-12 text-center text-12 text-faint">
              {mode === 'doi'
                ? '输入 DOI 并点「解析」,这里会显示各格式引用'
                : '填写上方文献信息,这里会实时生成各格式引用'}
            </div>
          )}
        </div>

        <CiteGuide />
      </div>
    </div>
  );
}

function ManualField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-12 font-medium text-subtle">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** 结果面板 —— 格式 tab + 当前格式正文 + 复制(与详情页 Footer 同心智)。 */
function CitationResult({ paper }: { paper: CitationPaper }) {
  const [format, setFormat] = useState<CitationFormat>(() =>
    readDefaultCitationFormat('gbt7714')
  );
  const citation = useMemo(
    () => generateCitation(paper, format),
    [paper, format]
  );
  const isMono = isMonoCitation(format);

  const copy = async () => {
    const ok = await copyToClipboard(stripItalic(citation));
    if (ok) toast.success(`${CITATION_FORMAT_LABELS[format]} 已复制`);
    else toast.error('复制失败,请检查浏览器剪贴板权限');
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1 flex-wrap">
        {CITATION_FORMATS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            onDoubleClick={() => {
              setDefaultCitationFormat(f);
              toast.success(`已设为默认: ${CITATION_FORMAT_LABELS[f]}`);
            }}
            className={cn(
              'h-7 px-3 rounded-8 text-12 font-medium transition-colors',
              format === f
                ? 'bg-inverse text-on-inverse'
                : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
            )}
            title="单击切换 · 双击设为默认"
          >
            {CITATION_FORMAT_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="relative min-w-0">
        {isMono ? (
          <pre className="w-full rounded-16 bg-surface-1 border border-border px-5 py-4 font-mono text-12 leading-paragraph text-subtle overflow-x-auto whitespace-pre">
            {citation}
          </pre>
        ) : (
          <p className="rounded-16 bg-surface-1 border border-border px-5 py-4 text-14 leading-paragraph text-subtle break-words">
            <CitationProse text={citation} />
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copy}
          className="absolute top-2 right-2 gap-1 border-border text-subtle hover:border-foreground hover:text-foreground"
          aria-label={`复制 ${CITATION_FORMAT_LABELS[format]}`}
        >
          <Copy strokeWidth={2.5} />
          复制
        </Button>
      </div>
      <p className="text-12 text-faint">单击切换格式 · 双击格式名设为默认</p>
    </section>
  );
}

/** 底部科普 —— 增厚页面内容,利于 SEO 不被判薄页。 */
function CiteGuide() {
  return (
    <section className="mt-16 space-y-3 border-t border-border-soft pt-8">
      <h2 className="font-display font-bold text-16 text-foreground">
        关于引用格式
      </h2>
      <div className="space-y-3 text-12 leading-paragraph text-muted-foreground">
        <p>
          <span className="font-medium text-subtle">GB/T 7714-2015</span>{' '}
          是中国国家标准《信息与文献 参考文献著录规则》,国内学位论文与多数中文期刊均要求按此著录,
          形如「作者. 题名[J]. 刊名, 年, 卷: 页码.」。
        </p>
        <p>
          <span className="font-medium text-subtle">APA / MLA / Chicago</span>{' '}
          为英文学术界主流格式,分别常见于社科、人文与历史学科;
          <span className="font-medium text-subtle"> BibTeX</span>{' '}
          则用于 LaTeX 排版,可直接粘进 .bib 文件。
        </p>
        <p>
          自动解析依赖 DOI 在 Crossref 的题录,个别文献字段可能缺失,可切到「手动录入」补全后再生成。
        </p>
      </div>
    </section>
  );
}
