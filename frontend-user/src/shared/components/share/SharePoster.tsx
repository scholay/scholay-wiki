import { forwardRef } from 'react';
import { BookOpen, FileText, LayoutGrid, Quote, Sparkles, TrendingUp } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { BrandLogo } from '../BrandLogo';

/**
 * 「保存图片」海报 —— 严格对齐 scholay-mobile.pen「单文献卡 · 分享图片」(j4K0y / Poster xjsqc):
 *   浅灰底托(Stage)+ 白卡(圆角+描边+轻阴影)。卡内:
 *   三色品牌条 → 头部(多色 Scholay logo + 奶油「论文名片」胶囊)→ 主体(深色文档图标块 + 衬线大标题
 *   + 灰色 meta 行 + venue/被引 胶囊)→ 摘要 → 绿色「被引·影响力」高亮条 → 分隔线 → 二维码页脚(浅色)。
 * 仅作 html-to-image 导出目标(屏外渲染),不是面板里的预览卡(预览仍是 ShareCard)。
 * 固定 390 宽、按内容自适应高度。用设计稿原始品牌色值(非 token)以保证导出图配色精确。
 *
 * 单期刊也复用本组件(数据由 ShareSheet 映射):icon='journal' + 不加引号标题 + 期刊 meta/分区胶囊。
 */
export interface PosterPill {
  text: string;
  /** muted=灰底(venue)· red=红底白字(被引/分区)· outline=描边(JCR/IF)。 */
  tone: 'muted' | 'red' | 'outline';
  /** outline 拆成 IF 灰字 + 金色数值。 */
  ifValue?: string;
  /** red 胶囊前缀引号图标(论文「被引」胶囊)。 */
  cite?: boolean;
}

export interface SharePosterData {
  kindLabel: string; // 论文名片 / 期刊名片 / 功能名片
  icon?: 'paper' | 'journal' | 'tool'; // 文档图标块图标,默认 paper(tool=红色块+功能图标)
  title: string;
  quoteTitle?: boolean; // 标题包中文弯引号(论文名片)
  metaLine?: string; // "NeurIPS 2017 · Vaswani A. 等 8 人"
  pills?: PosterPill[]; // venue + 被引 / 分区 + IF
  blurb?: string; // 摘要 / 简介
  highlight?: string; // "被引 128,430 · 高被引论文"
  qrValue: string;
  scanLabel?: string; // "长按识别二维码 · 在 Scholay 查看全文"
  urlLabel: string; // 去掉 scheme 后的展示用短链,如 "example.com/p/attention"
}

export const SharePoster = forwardRef<HTMLDivElement, { data: SharePosterData }>(
  function SharePoster({ data }, ref) {
    const isTool = data.icon === 'tool';
    const TileIcon = isTool ? LayoutGrid : data.icon === 'journal' ? BookOpen : FileText;
    const KindIcon = isTool ? Sparkles : TileIcon; // 名片胶囊图标:功能用 sparkles
    const title = data.quoteTitle ? `“${data.title}”` : data.title;
    return (
      // Stage(浅灰托)—— 让白卡的圆角/阴影落在灰底上,导出图更精致(对齐 .pen Stage)
      <div ref={ref} className="w-[390px] bg-surface-1 p-4 font-sans">
        {/* 白卡 */}
        <div className="overflow-hidden rounded-8 border border-border bg-surface-card">
          {/* 三色品牌条 */}
          <div className="flex h-1">
            <div className="flex-1 bg-brand-red" />
            <div className="flex-1 bg-brand-green" />
            <div className="flex-1 bg-brand-amber" />
          </div>

          <div className="flex flex-col gap-4 px-5 pb-[18px] pt-[18px]">
            {/* 头部:logo + 名片胶囊 */}
            <div className="flex items-center justify-between">
              <BrandLogo variant="wordmark" size="sm" />
              <div className="flex items-center gap-[5px] rounded-pill bg-amber-soft px-2.5 py-1">
                <KindIcon className="size-3 text-amber-soft-fg" />
                <span className="text-[11px] font-medium text-amber-soft-fg">{data.kindLabel}</span>
              </div>
            </div>

            {/* 主体:文档块 + 标题/meta/胶囊 */}
            <div className="flex items-center gap-3.5">
              <div
                className={`flex h-[84px] w-[66px] shrink-0 items-center justify-center rounded-8 ${isTool ? 'bg-brand-red' : 'bg-foreground'}`}
              >
                <TileIcon className="size-[30px] text-on-brand" strokeWidth={1.6} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
                <h2 className="font-display text-[22px] font-bold leading-display-tight text-foreground">{title}</h2>
                {data.metaLine && (
                  <p className="text-[12px] text-faint">{data.metaLine}</p>
                )}
                {data.pills && data.pills.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {data.pills.map((p, i) => (
                      <PosterPillView key={i} pill={p} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 摘要 */}
            {data.blurb && (
              <p className="line-clamp-4 text-[12.5px] leading-paragraph text-muted-foreground">{data.blurb}</p>
            )}

            {/* 高亮条:被引 · 影响力 */}
            {data.highlight && (
              <div className="flex items-center gap-2 rounded-4 bg-surface-1 px-3 py-2.5">
                <TrendingUp className="size-3.5 shrink-0 text-brand-green" />
                <span className="text-[12px] font-medium text-muted-foreground">{data.highlight}</span>
              </div>
            )}

            {/* 分隔线 */}
            <div className="h-px bg-border" />

            {/* 二维码页脚(浅色) */}
            <div className="flex items-center gap-3.5">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-4 border border-border bg-surface-card">
                <QRCodeCanvas value={data.qrValue} size={52} level="M" marginSize={0} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <p className="text-[13px] font-medium text-foreground">
                  {data.scanLabel ?? '长按识别二维码 · 在 Scholay 查看全文'}
                </p>
                <p className="truncate text-[11px] text-faint">{data.urlLabel}</p>
                <p className="text-[11px] text-muted-foreground">由 Scholay 学术分享生成</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

function PosterPillView({ pill }: { pill: PosterPill }) {
  if (pill.tone === 'red') {
    return (
      <span className="flex items-center gap-1 rounded-pill bg-brand-red px-2.5 py-1 text-[11px] font-medium text-on-brand">
        {pill.cite && <Quote className="size-[11px] fill-on-brand text-on-brand" />}
        {pill.text}
      </span>
    );
  }
  if (pill.tone === 'outline') {
    return (
      <span className="flex items-center gap-1 rounded-pill border border-border-strong bg-surface-card px-2.5 py-1 text-[11px] font-medium">
        <span className="text-faint">{pill.text}</span>
        {pill.ifValue && <span className="font-medium text-amber-soft-fg">{pill.ifValue}</span>}
      </span>
    );
  }
  return (
    <span className="rounded-pill bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-subtle">
      {pill.text}
    </span>
  );
}
