import { forwardRef } from 'react';
import { BookOpen } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

/**
 * 文献集「保存图片」海报 —— 对齐 scholay-mobile.pen「文献集卡组 · 分享图片」(g3aoD / Poster Inner T1LeWP):
 *   浅灰托 + 白卡(三色品牌条 + 多色 Scholay logo + 奶油「文献集」胶囊)/ 标题 + 篇数 / 堆叠封面 /
 *   编号论文列表(序号色块 + 题名 + venue·年) / 整理人 / 分隔线 / 二维码页脚。
 * 屏外渲染作 html-to-image 导出目标(文献集);面板内预览仍是 ShareCard。
 * 用设计稿原始品牌色值以保证导出图配色精确。
 */
export interface CollectionPosterPaper {
  title: string;
  venue?: string;
  year?: number;
}

export interface CollectionSharePosterData {
  title: string;
  paperCount: number;
  samplePapers?: CollectionPosterPaper[]; // 前几篇预览(带 venue/年);无则不渲染列表
  curatorName?: string; // 整理人
  curatorYear?: number; // 整理年份
  qrValue: string;
  urlLabel: string;
}

const LOGO = [
  { c: 'S', color: '#CD2323' },
  { c: 'c', color: '#2A7A2A' },
  { c: 'h', color: '#2A7A2A' },
  { c: 'o', color: '#DD9D13' },
  { c: 'l', color: '#111111' },
  { c: 'a', color: '#CD2323' },
  { c: 'y', color: '#2A7A2A' },
];

// 编号色块循环(对齐 .pen:绿/红/金/蓝/绿)
const IDX_COLORS = ['#2A7A2A', '#CD2323', '#DD9D13', '#1E5FA8', '#2A7A2A'];

export const CollectionSharePoster = forwardRef<HTMLDivElement, { data: CollectionSharePosterData }>(
  function CollectionSharePoster({ data }, ref) {
    const papers = data.samplePapers ?? [];
    // 外层灰底托 —— .pen Stage(zdApc)padding [纵16,横20];Tailwind 无对应横向档,保留 arbitrary px-5(20)。
    return (
      <div ref={ref} className="w-[390px] bg-[#F5F5F5] px-5 py-4 font-sans">
        <div className="overflow-hidden rounded-[6px] border border-[#E9E9E9] bg-surface-card">
          {/* 三色品牌条 */}
          <div className="flex h-1">
            <div className="flex-1 bg-[#CD2323]" />
            <div className="flex-1 bg-[#2A7A2A]" />
            <div className="flex-1 bg-[#DD9D13]" />
          </div>

          <div className="flex flex-col gap-3.5 px-5 pb-[18px] pt-[18px]">
            {/* 头部:logo + 文献集胶囊 */}
            <div className="flex items-center justify-between">
              <div className="flex items-end font-display text-[17px] font-bold leading-none tracking-brand">
                {LOGO.map((l, i) => (
                  <span key={i} style={{ color: l.color }}>
                    {l.c}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-[5px] rounded-pill bg-[#F1EADA] px-2.5 py-1">
                <BookOpen className="size-3 text-[#DD9D13]" />
                <span className="text-[11px] font-semibold text-[#DD9D13]">文献集</span>
              </div>
            </div>

            {/* 标题 + 篇数(.pen Title Block Jmo0o gap 5) */}
            <div className="flex flex-col gap-[5px]">
              <h2 className="font-display text-[24px] font-bold leading-display-tight text-[#111]">{data.title}</h2>
              {/* .pen 副标题为「N 篇 · M 作者 · K 主题」,但作者/主题聚合数在分享链路拿不到;
                  按诚实指标原则只渲染真实可得的篇数,不臆造作者/主题数。 */}
              <p className="text-[12.5px] text-[#666]">{data.paperCount} 篇文献</p>
            </div>

            {/* 堆叠封面 */}
            <div className="flex justify-center py-1">
              <StackedCover initial={data.title.trim().charAt(0) || '集'} />
            </div>

            {/* 编号论文列表 */}
            {papers.length > 0 && (
              <div className="flex flex-col">
                {papers.slice(0, 5).map((p, i) => {
                  const meta = [p.venue, p.year].filter(Boolean).join(' ');
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2.5 py-2 ${i > 0 ? 'border-t border-[#E9E9E9]' : ''}`}
                    >
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[12px] font-bold leading-none text-on-brand"
                        style={{ backgroundColor: IDX_COLORS[i % IDX_COLORS.length] }}
                      >
                        {i + 1}
                      </span>
                      <span className="line-clamp-1 min-w-0 flex-1 text-[13px] font-medium text-[#111]">
                        {p.title}
                      </span>
                      {meta && <span className="shrink-0 text-[11px] text-[#999]">{meta}</span>}
                    </div>
                  );
                })}
                {data.paperCount > Math.min(papers.length, 5) && (
                  <div className="border-t border-[#E9E9E9] py-2 text-[12px] text-[#999]">
                    等共 {data.paperCount} 篇文献
                  </div>
                )}
              </div>
            )}

            {/* 整理人 */}
            {data.curatorName && (
              <div className="flex items-center gap-2">
                <span className="flex size-[22px] items-center justify-center rounded-pill bg-[#2A7A2A] text-[11px] font-semibold text-on-brand">
                  {data.curatorName.charAt(0)}
                </span>
                <span className="text-[12px] font-medium text-[#666]">
                  {data.curatorName} 整理{data.curatorYear ? ` · ${data.curatorYear}` : ''}
                </span>
              </div>
            )}

            {/* 分隔线 */}
            <div className="h-px bg-[#E9E9E9]" />

            {/* 二维码页脚 */}
            <div className="flex items-center gap-3.5">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-4 border border-[#E9E9E9] bg-surface-card">
                <QRCodeCanvas value={data.qrValue} size={52} level="M" marginSize={0} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <p className="text-[13px] font-semibold text-[#111]">长按识别二维码 · 在 Scholay 查看合集</p>
                <p className="truncate text-[11px] text-[#999]">{data.urlLabel}</p>
                <p className="text-[11px] text-[#666]">由 Scholay 学术分享生成</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

/**
 * 堆叠封面 —— 对齐 .pen c/StackedCover(iTkFr):三块绝对定位的实色瓦片(74×84,圆角4,白色1px描边),
 * 后→前 琥珀/红/绿,各居中一个白色 Playfair(font-display)大写字母。
 * 后两块用固定品牌字 S/C(装饰性书脊),最前一块(绿)渲染合集首字。容器 90×96。
 */
function StackedCover({ initial }: { initial: string }) {
  const tiles = [
    { bg: '#DD9D13', pos: 'left-4 top-0', letter: 'S' }, // 琥珀,最后
    { bg: '#CD2323', pos: 'left-2 top-1.5', letter: 'C' }, // 红,中间
    { bg: '#2A7A2A', pos: 'left-0 top-3', letter: initial }, // 绿,最前
  ];
  return (
    <div className="relative h-24 w-[90px]">
      {tiles.map((t, i) => (
        <div
          key={i}
          className={`absolute ${t.pos} flex h-[84px] w-[74px] items-center justify-center rounded-sm border border-on-brand`}
          style={{ backgroundColor: t.bg }}
        >
          <span className="font-display text-[30px] font-bold leading-none text-on-brand">{t.letter}</span>
        </div>
      ))}
    </div>
  );
}
