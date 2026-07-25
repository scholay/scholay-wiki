import type { ReactNode } from 'react';

/* 学术要素 —— 引文标记 + 参考文献列表 + 带编号图注。文献综述 / journal club / 开题 / 答辩的基本盘。
   编号由你(作者)显式给,前后对齐即可(deck 不做跨组件自增,保持确定、可控)。

   正文里挂引用:  下降了 12%<Cite n={1} />,与 <Cite n={[2,3]} /> 一致。
   末页排文献:    <References items={['Smith J, et al. Nature. 2020;580:1-9.', '...']} />
   图带编号图注:  <Figure n={1} caption="不同剂量下的存活率(n=30)" source="本研究">
                    <BarChart data={[...]} />
                  </Figure>
*/

/** 行内引用上标标记:<Cite n={1} /> → ¹⁽¹⁾ 风格的 [1];支持 <Cite n={[2,3]} />。 */
export function Cite({ n }: { n: number | number[] }) {
  const arr = Array.isArray(n) ? n : [n];
  return <sup className="cite">[{arr.join(',')}]</sup>;
}

/** 参考文献列表(末页)。items 每项一条文献(已排好版的字符串或 ReactNode)。numbered 默认 true。 */
export function References({
  items,
  title = 'References',
  numbered = true,
}: {
  items: ReactNode[];
  title?: string;
  numbered?: boolean;
  nav?: string;
  notes?: string;
}) {
  return (
    <div className="refs">
      <div className="refs-title">{title}</div>
      {numbered ? (
        <ol className="refs-list refs-num">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      ) : (
        <ul className="refs-list">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 带编号图注的图容器:把任意视觉(图表 / 图片 / 自绘 SVG)包一层「图 N. 说明(来源)」。 */
export function Figure({
  n,
  caption,
  source,
  label = '图',
  children,
}: {
  n: number | string;
  caption: ReactNode;
  /** 数据/图片来源标注(可选),按学术惯例附在图注末尾。 */
  source?: ReactNode;
  /** 标签词:中文默认「图」,英文 deck 传 "Fig." 或 "Figure"。 */
  label?: string;
  children: ReactNode;
}) {
  return (
    <figure className="fig">
      <div className="fig-body">{children}</div>
      <figcaption className="fig-cap">
        <b className="fig-n">
          {label} {n}.
        </b>{' '}
        {caption}
        {source ? <span className="fig-src"> 来源:{source}</span> : null}
      </figcaption>
    </figure>
  );
}

export default Figure;
