import { forwardRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { JournalBadges, type JournalBadgeInput } from '@/shared/components/JournalBadges';

/**
 * 分享卡片 —— 既用于 ShareSheet 的预览,也作为「分享图」html-to-image 渲染的 DOM 目标。
 * 对齐设计稿 scholay-mobile.pen「分享卡片 · 全样式」:顶部三色品牌条 + 内容 + 二维码块。
 *   - single   单篇论文:标签(venue·年/开放获取)+ 标题 + 作者 + 被引
 *   - journal  单期刊:封面字标 + 刊名 + 出版社/分区
 *   - collection 文献集:堆叠封面 + 篇目预览
 * 刻意不用 framer-motion / 外部图片:html-to-image 对纯 DOM + 本地字体最稳。
 */
export interface ShareCardData {
  kind: 'single' | 'collection' | 'journal' | 'tool';
  title: string;
  subtitle?: string;
  paperCount: number;
  /** 预览前几篇标题(集合用) */
  sampleTitles?: string[];
  /** 标签 pills(单篇:venue·年 / 开放获取) */
  tags?: string[];
  /** 期刊分区/IF 徽章(期刊用,JCR/中科院/CCF/IF)。 */
  journalRank?: JournalBadgeInput | null;
  /** 作者行(单篇用) */
  authors?: string;
  /** 指标行(单篇:被引 128,430) */
  metric?: string;
  /** 二维码内容(链接) */
  qrValue: string;
  /** 二维码下方展示的短链文字 */
  urlLabel: string;
}

const KIND_LABEL: Record<ShareCardData['kind'], string> = {
  single: '论文卡片',
  collection: '文献集卡片',
  journal: '期刊卡片',
  tool: '功能卡片',
};

export const ShareCard = forwardRef<HTMLDivElement, { data: ShareCardData }>(
  function ShareCard({ data }, ref) {
    const isCollection = data.kind === 'collection';
    const isJournal = data.kind === 'journal';
    const isTool = data.kind === 'tool';
    const scanLabel = isCollection
      ? '扫码查看整本合集'
      : isJournal
        ? '扫码查看期刊详情'
        : isTool
          ? '扫码体验该功能'
          : '扫码查看全文';

    return (
      <div
        ref={ref}
        className="w-full overflow-hidden rounded-16 border border-border bg-surface-card"
      >
        {/* 三色品牌条 */}
        <div className="flex h-1">
          <div className="flex-1 bg-brand-red" />
          <div className="flex-1 bg-brand-green" />
          <div className="flex-1 bg-brand-amber" />
        </div>

        {/* 品牌行 */}
        <div className="flex items-center justify-between bg-surface-1 px-4 py-2.5">
          <span className="font-serif text-14 font-bold text-brand-red">Scholay</span>
          <span className="text-12 text-faint">{KIND_LABEL[data.kind]}</span>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          {isTool ? (
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-8 bg-brand-red text-14 font-medium text-on-brand">
                {data.title.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-14 font-medium text-foreground">{data.title}</p>
                {data.tags && data.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {data.tags.map((t) => (
                      <span key={t} className="rounded-pill bg-surface-2 px-2 py-0.5 text-12 font-medium text-muted-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {data.subtitle && (
                  <p className="mt-1 line-clamp-2 text-12 text-muted-foreground">{data.subtitle}</p>
                )}
              </div>
            </div>
          ) : isJournal ? (
            <div className="flex flex-col gap-2">
              <p className="font-serif text-16 font-bold text-foreground">{data.title}</p>
              {data.journalRank && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <JournalBadges enrichment={data.journalRank} />
                </div>
              )}
              {data.subtitle && (
                <p className="line-clamp-2 text-12 text-muted-foreground">{data.subtitle}</p>
              )}
            </div>
          ) : isCollection ? (
            <div className="flex items-start gap-3">
              <div className="relative size-12 shrink-0">
                <div className="absolute left-2 top-0 size-9 rounded-8 bg-brand-amber/80" />
                <div className="absolute left-1 top-1 size-9 rounded-8 bg-brand-red/85" />
                <div className="absolute left-0 top-2 flex size-9 items-center justify-center rounded-8 bg-brand-green text-12 font-medium text-on-brand">
                  {data.paperCount}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-14 font-medium text-foreground">{data.title}</p>
                <p className="mt-0.5 text-12 text-faint">{data.paperCount} 篇文献</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.tags && data.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {data.tags.map((t) => (
                    <span
                      key={t}
                      className={`rounded-pill px-2 py-0.5 text-12 font-medium ${
                        t === '开放获取'
                          ? 'bg-brand-green/10 text-brand-green'
                          : 'bg-surface-2 text-muted-foreground'
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <p className="font-serif text-16 font-bold text-foreground">
                {data.title}
              </p>
              {data.authors && (
                <p className="line-clamp-2 text-12 text-muted-foreground">{data.authors}</p>
              )}
              {data.metric && <p className="text-12 font-medium text-brand-red">{data.metric}</p>}
            </div>
          )}

          {isCollection && data.sampleTitles && data.sampleTitles.length > 0 && (
            <ol className="space-y-1 border-t border-border-soft pt-2">
              {data.sampleTitles.slice(0, 3).map((t, i) => (
                <li key={i} className="flex gap-1.5 text-12 text-subtle">
                  <span className="text-faint">{String(i + 1).padStart(2, '0')}</span>
                  <span className="line-clamp-1 flex-1">{t}</span>
                </li>
              ))}
              {data.paperCount > 3 && (
                <li className="text-12 text-faint">… 等 {data.paperCount} 篇</li>
              )}
            </ol>
          )}

          {/* 二维码块 */}
          <div className="flex items-center gap-3 border-t border-border-soft pt-3">
            <div className="rounded-8 border border-border bg-surface-card p-1.5">
              <QRCodeCanvas value={data.qrValue} size={64} level="M" marginSize={0} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-12 font-medium text-subtle">{scanLabel}</p>
              <p className="mt-0.5 truncate text-12 text-faint">{data.urlLabel}</p>
              <p className="mt-0.5 text-12 text-faint">
                {isCollection ? '在 Scholay 一键转存到自己的文献集' : '由 Scholay 学术分享生成'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
