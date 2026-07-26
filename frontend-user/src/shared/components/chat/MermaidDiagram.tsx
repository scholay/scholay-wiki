import { memo, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSettled } from '@/shared/hooks/useSettled';
import { ZoomableSvg } from './ZoomableSvg';

/**
 * Mermaid 流程图/时序图/折线柱状/饼图等渲染 —— AI 回答里 ```mermaid 代码块渲染成图。
 *
 * 关键取舍:
 *   - **动态 import('mermaid')**:体积 >1MB,绝不进主包,首次遇图才按需加载(铁律 >50KB dynamic import)。
 *   - **securityLevel:'strict'**:strict 模式下 mermaid **内部**用 DOMPurify 清洗它产出的 SVG
 *     (去脚本/事件,保留 foreignObject/<br> 等图本身需要的标签),故此处不再二次清洗——
 *     再套一层 svg-profile DOMPurify 反会误删 foreignObject 导致标签/换行丢失。
 *   - **流式不抽搐(useSettled)**:流式期间源码每个 token 都在变 → 显示稳定 loader,
 *     **绝不**在「半截代码 ↔ 渲染图」之间反复横跳;源码静止 ~350ms(本块输出完整)后才渲染一次。
 *   - **结果缓存**:渲染结果按源码缓存(模块级),重入/滚动回看同一条消息瞬时出图,不再走 350ms loader。
 *   - **可放大**:渲染结果交给 ZoomableSvg(点击全屏 + 拖拽平移 + 缩放)。
 */

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'inherit',
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

let renderSeq = 0;
// 源码 → 渲染好的 SVG 缓存(模块级,跨重挂存活):重入/滚动回看同一图瞬时出,免重渲 + 免 loader。
const svgCache = new Map<string, string>();
function cacheSvg(key: string, val: string) {
  if (svgCache.size > 60) svgCache.clear(); // 简单封顶,防长会话无限增长
  svgCache.set(key, val);
}

export const MermaidDiagram = memo(function MermaidDiagram({ code }: { code: string }) {
  // 源码静止后才渲染(避免流式抽搐)。settled 在挂载瞬间为 false。
  const { value: src, settled } = useSettled(code, 350);
  const cached = svgCache.get(code.trim()) ?? null;
  const [svg, setSvg] = useState<string | null>(cached); // 命中缓存 → 挂载即出图,不走 loader
  const [error, setError] = useState(false);
  const lastRendered = useRef(cached ? code.trim() : '');

  useEffect(() => {
    const trimmed = src.trim();
    if (!settled || !trimmed) return; // 未稳定 / 空 → 不渲染(显示 loader)
    if (trimmed === lastRendered.current) return; // 同源不重渲

    let cancelled = false;
    void (async () => {
      try {
        const mermaid = await loadMermaid();
        await mermaid.parse(trimmed); // 非法/不完整 → 抛错走 catch
        const { svg: out } = await mermaid.render(`mmd-${++renderSeq}`, trimmed);
        if (!cancelled) {
          lastRendered.current = trimmed;
          cacheSvg(trimmed, out);
          setSvg(out);
          setError(false);
        }
      } catch {
        // 渲染失败:保留上一张好图(若有),标记 error 供「确已稳定」时回退原码。
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, settled]);

  // 已有渲染结果 → 出图(可放大);即便后续短暂失败也不丢图。
  if (svg) return <ZoomableSvg svgHtml={svg} />;

  // 已稳定但渲染失败(语法非法)→ 回退原始代码,方便用户/排查。
  if (settled && error) {
    return (
      <pre className="mb-2.5 last:mb-0 overflow-x-auto rounded-12 border border-border bg-surface-1 p-3 text-[12px] leading-paragraph">
        <code>{code}</code>
      </pre>
    );
  }

  // 流式中 / 渲染中 → 稳定占位,绝不闪烁。
  return (
    <div className="mb-2.5 last:mb-0 flex min-h-[96px] items-center justify-center gap-2 rounded-12 border border-border bg-surface-1 text-12 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      图表生成中…
    </div>
  );
});
