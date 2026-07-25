/**
 * 细胞图配方(compartment spec)—— sci_draw 的产物格式(agent 输出,无坐标)。
 * 由 compose.ts 渲染成分层隔室的静态 SVG(细胞外/膜/胞质/核 背景 + 图标按区摆 + 信号箭头)。
 * 契约:与 agent-skills/sci-draw-skills/figures/SKILL.md 的 schema 严格对齐。
 */
export type CompartmentKind = 'extracellular' | 'membrane' | 'cytoplasm' | 'organelle' | 'nucleus' | 'region';

export interface Compartment {
  id: string;
  kind: CompartmentKind;
  label?: string;
}
export interface FigEntity {
  id: string;
  compartment: string;
  iconKey?: string;
  label?: string;
  /** 无图标节点的配色名:blue/green/orange/purple/yellow/red/teal/gray。 */
  color?: string;
  kind?: 'icon' | 'node';
}
export interface FigEdge {
  source: string;
  target: string;
  label?: string;
  type?: 'activate' | 'inhibit' | 'transport';
}
export interface FigureSpec {
  title?: string;
  subtitle?: string;
  compartments: Compartment[];
  entities: FigEntity[];
  edges: FigEdge[];
}

/** 解析 out/*.fig.json → FigureSpec(非法 / 无 entities 返回 null)。 */
export function parseFigureSpec(text: string): FigureSpec | null {
  try {
    const d = JSON.parse(text) as Partial<FigureSpec>;
    if (!d || !Array.isArray(d.entities)) return null;
    return {
      title: d.title,
      subtitle: d.subtitle,
      compartments: Array.isArray(d.compartments) ? (d.compartments as Compartment[]) : [],
      entities: d.entities as FigEntity[],
      edges: Array.isArray(d.edges) ? (d.edges as FigEdge[]) : [],
    };
  } catch {
    return null;
  }
}
