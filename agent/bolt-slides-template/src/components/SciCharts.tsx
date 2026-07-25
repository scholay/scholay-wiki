import { useId } from 'react';
import { useInView } from '../deck/useInView';
import { exportAttrs } from '../deck/exportAnnotate';

/* 科研数据图 —— 补齐 Charts.tsx 缺的科研刚需:误差棒、真实 x 坐标、多序列 + 图例、散点、坐标轴刻度。
   全部**只呈现你给的真实数据**(从对话里拿的数值),绝不发明数字。需要论文级统计图(KM/森林/ROC/
   箱线)时用「科研绘图 sci_draw」的 matplotlib 车道出 SVG 再嵌进来,别在 deck 里硬凑。

   <ErrorBarChart ylabel="存活率 %" data={[{label:'对照',value:62,error:5},{label:'给药',value:81,error:4}]} />
   <ScatterChart xlabel="剂量 (mg)" ylabel="响应" series={[{name:'组A',points:[{x:1,y:2},{x:2,y:4.1}]}]} />
   <LineChartXY xlabel="时间 (h)" ylabel="浓度" series={[{name:'A',points:[{x:0,y:0},{x:2,y:8},{x:6,y:5}]}]} /> */

// 色盲友好调色板(Okabe–Ito)——多序列时用;单序列优先跟主题 --primary。
const PALETTE = ['var(--primary)', '#E69F00', '#56B4E9', '#009E73', '#CC79A7', '#D55E00', '#0072B2', '#F0E442'];

const PLOT = { w: 560, h: 320, ml: 62, mr: 18, mt: 18, mb: 46 };

/** 生成 ~5 个"好看"的刻度值(1/2/5 × 10^k 步进)。 */
function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    max = min + 1;
    min = min - 1;
  }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

type XY = { x: number; y: number };
type Series = { name: string; color?: string; points: XY[] };

function Axes({
  xTicks,
  yTicks,
  xScale,
  yScale,
  xlabel,
  ylabel,
  fmt,
}: {
  xTicks: number[];
  yTicks: number[];
  xScale: (v: number) => number;
  yScale: (v: number) => number;
  xlabel?: string;
  ylabel?: string;
  fmt: (v: number) => string;
}) {
  const { ml, mr, mt, mb, w, h } = PLOT;
  const x0 = ml,
    x1 = w - mr,
    y0 = h - mb,
    y1 = mt;
  return (
    <g className="scx-axes">
      {yTicks.map((t, i) => (
        <g key={'y' + i}>
          <line x1={x0} x2={x1} y1={yScale(t)} y2={yScale(t)} stroke="var(--hair-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={x0 - 8} y={yScale(t)} textAnchor="end" dominantBaseline="central" className="scx-tick">
            {fmt(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t, i) => (
        <text key={'x' + i} x={xScale(t)} y={y0 + 18} textAnchor="middle" className="scx-tick">
          {fmt(t)}
        </text>
      ))}
      <line x1={x0} x2={x1} y1={y0} y2={y0} stroke="var(--hair)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <line x1={x0} x2={x0} y1={y0} y2={y1} stroke="var(--hair)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      {xlabel && (
        <text x={(x0 + x1) / 2} y={h - 6} textAnchor="middle" className="scx-axlabel">
          {xlabel}
        </text>
      )}
      {ylabel && (
        <text transform={`translate(14 ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle" className="scx-axlabel">
          {ylabel}
        </text>
      )}
    </g>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="scx-legend">
      {items.map((it, i) => (
        <span className="scx-leg" key={i}>
          <span className="scx-swatch" style={{ background: it.color }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

/** 均值 ± 误差(SEM/SD)柱状图 —— 科研最高频。data 每项 {label,value,error?,color?}。 */
export function ErrorBarChart({
  data,
  ylabel,
  height = 300,
}: {
  data: { label: string; value: number; error?: number; color?: string }[];
  ylabel?: string;
  height?: number;
  nav?: string;
  notes?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const { w, h, ml, mr, mt, mb } = PLOT;
  const vals = data.flatMap((d) => [d.value + (d.error ?? 0), d.value - (d.error ?? 0)]);
  const dataMax = Math.max(0, ...vals);
  const dataMin = Math.min(0, ...vals);
  const yTicks = niceTicks(dataMin, dataMax);
  const yMin = yTicks[0],
    yMax = yTicks[yTicks.length - 1];
  const yScale = (v: number) => h - mb - ((v - yMin) / (yMax - yMin || 1)) * (h - mb - mt);
  const band = (w - ml - mr) / data.length;
  const bw = Math.min(64, band * 0.56);
  return (
    // 导出:P0 走截图(pptxgenjs 无原生误差棒);model 带 data 供 P1 的 c:errBars JSZip 注入。
    <div className="scx" ref={ref} {...exportAttrs('image', { kind: 'errorbar', data, ylabel: ylabel ?? null })}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ height }} className="scx-svg">
        <Axes xTicks={[]} yTicks={yTicks} xScale={() => 0} yScale={yScale} ylabel={ylabel} fmt={(v) => String(v)} />
        {data.map((d, i) => {
          const cx = ml + band * (i + 0.5);
          const top = yScale(d.value);
          const base = yScale(0);
          const color = d.color ?? PALETTE[i % PALETTE.length];
          return (
            <g key={i}>
              <rect
                x={cx - bw / 2}
                y={inView ? Math.min(top, base) : base}
                width={bw}
                height={inView ? Math.abs(base - top) : 0}
                fill={color}
                opacity={0.85}
                style={{ transition: 'y .7s cubic-bezier(.16,1,.3,1), height .7s cubic-bezier(.16,1,.3,1)' }}
              />
              {d.error != null && inView && (
                <g stroke="var(--fg)" strokeWidth={1.4} opacity={0.75} vectorEffect="non-scaling-stroke">
                  <line x1={cx} x2={cx} y1={yScale(d.value - d.error)} y2={yScale(d.value + d.error)} />
                  <line x1={cx - 6} x2={cx + 6} y1={yScale(d.value + d.error)} y2={yScale(d.value + d.error)} />
                  <line x1={cx - 6} x2={cx + 6} y1={yScale(d.value - d.error)} y2={yScale(d.value - d.error)} />
                </g>
              )}
              <text x={cx} y={h - mb + 18} textAnchor="middle" className="scx-tick">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function frame(series: Series[]) {
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const xTicks = niceTicks(Math.min(...xs), Math.max(...xs));
  const yTicks = niceTicks(Math.min(...ys, 0), Math.max(...ys));
  const xMin = xTicks[0],
    xMax = xTicks[xTicks.length - 1];
  const yMin = yTicks[0],
    yMax = yTicks[yTicks.length - 1];
  const { w, h, ml, mr, mt, mb } = PLOT;
  const xScale = (v: number) => ml + ((v - xMin) / (xMax - xMin || 1)) * (w - ml - mr);
  const yScale = (v: number) => h - mb - ((v - yMin) / (yMax - yMin || 1)) * (h - mb - mt);
  return { xTicks, yTicks, xScale, yScale };
}

/** 散点图 —— 真实 x/y 坐标,多序列 + 图例。points {x,y}。 */
export function ScatterChart({
  series,
  xlabel,
  ylabel,
  height = 320,
}: {
  series: Series[];
  xlabel?: string;
  ylabel?: string;
  height?: number;
  nav?: string;
  notes?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const { xTicks, yTicks, xScale, yScale } = frame(series);
  const { w, h } = PLOT;
  const legend = series.map((s, i) => ({ name: s.name, color: s.color ?? PALETTE[i % PALETTE.length] }));
  return (
    <div className="scx" ref={ref} {...exportAttrs('chart', { chartType: 'scatter', series, xlabel: xlabel ?? null, ylabel: ylabel ?? null })}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ height }} className="scx-svg">
        <Axes xTicks={xTicks} yTicks={yTicks} xScale={xScale} yScale={yScale} xlabel={xlabel} ylabel={ylabel} fmt={(v) => String(v)} />
        {series.map((s, si) =>
          s.points.map((p, pi) => (
            <circle
              key={si + '-' + pi}
              cx={xScale(p.x)}
              cy={yScale(p.y)}
              r={inView ? 4.5 : 0}
              fill={s.color ?? PALETTE[si % PALETTE.length]}
              opacity={0.82}
              style={{ transition: `r .4s ${0.2 + pi * 0.02}s` }}
            />
          )),
        )}
      </svg>
      {series.length > 1 && <Legend items={legend} />}
    </div>
  );
}

/** 折线图(真实 x)—— 剂量-反应 / 生长曲线 / 时间序列;多序列 + 图例,x 是真实数值(非均匀采样也对)。 */
export function LineChartXY({
  series,
  xlabel,
  ylabel,
  height = 320,
}: {
  series: Series[];
  xlabel?: string;
  ylabel?: string;
  height?: number;
  nav?: string;
  notes?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const gid = useId();
  const { xTicks, yTicks, xScale, yScale } = frame(series);
  const { w, h } = PLOT;
  const legend = series.map((s, i) => ({ name: s.name, color: s.color ?? PALETTE[i % PALETTE.length] }));
  return (
    <div className="scx" ref={ref} {...exportAttrs('chart', { chartType: 'scatterLine', series, xlabel: xlabel ?? null, ylabel: ylabel ?? null })}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ height }} className="scx-svg">
        <Axes xTicks={xTicks} yTicks={yTicks} xScale={xScale} yScale={yScale} xlabel={xlabel} ylabel={ylabel} fmt={(v) => String(v)} />
        {series.map((s, si) => {
          const color = s.color ?? PALETTE[si % PALETTE.length];
          const pts = [...s.points].sort((a, b) => a.x - b.x);
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.x).toFixed(1)},${yScale(p.y).toFixed(1)}`).join(' ');
          return (
            <g key={si}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: inView ? 0 : 1,
                  transition: `stroke-dashoffset 1.1s ${0.1 + si * 0.15}s cubic-bezier(.16,1,.3,1)`,
                }}
                key={gid + si}
              />
              {pts.map((p, i) => (
                <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={inView ? 3 : 0} fill={color} style={{ transition: `r .3s ${0.3 + i * 0.03}s` }} />
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && <Legend items={legend} />}
    </div>
  );
}
