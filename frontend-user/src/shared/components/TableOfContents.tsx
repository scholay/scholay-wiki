import { forwardRef, useEffect, useState, type RefObject } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * 长文右侧悬浮 TOC —— 自动扫描内容区的 h2 / h3,生成可点击锚点列表,
 * 滚动时高亮当前 section。Linear / Stripe Docs 风格的"sticky right-side rail"。
 *
 * 实现要点:
 *   - 用 ref 拿到内容容器,首次渲染后扫 h2/h3
 *   - 给没有 id 的标题自动注入 slug id(基于 textContent 派生)
 *   - IntersectionObserver 观察这些标题,viewport 中最靠上的命中即"当前"
 *   - 滚动通过 hash + scrollIntoView smooth
 *
 * 用法:
 *   const contentRef = useRef<HTMLDivElement>(null);
 *   ...
 *   <div ref={contentRef}>...long article...</div>
 *   <TableOfContents contentRef={contentRef} />
 *
 * 调用方决定布局(grid / fixed / sticky 容器),本组件只渲染列表;
 * 默认 `sticky top-20` 适合放在 grid 右栏。
 */

interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

interface TableOfContentsProps {
  contentRef: RefObject<HTMLElement | null>;
  /** 标题(默认"目录") */
  title?: string;
  /** 文档站使用品牌色强调当前章节；默认保持既有页面外观。 */
  tone?: 'default' | 'brand';
  className?: string;
}

export const TableOfContents = forwardRef<HTMLElement, TableOfContentsProps>(
  ({ contentRef, title = '目录', tone = 'default', className }, ref) => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 扫描标题 —— 内容渲染后(可能是异步数据)拿一次,再用 MutationObserver
  // 兜底数据延后到达的情况
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const scan = () => {
      const nodes = el.querySelectorAll<HTMLHeadingElement>('h2, h3');
      const list: Heading[] = [];
      const usedIds = new Set<string>();
      nodes.forEach((node) => {
        const text = (node.textContent || '').trim();
        if (!text) return;
        let id = node.id;
        if (!id) {
          // 简单 slug:中文保留,英文小写,空格转横线
          const base =
            text
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9一-龥-]/g, '')
              .slice(0, 60) || `h-${list.length}`;
          let candidate = base;
          let n = 2;
          while (usedIds.has(candidate)) candidate = `${base}-${n++}`;
          id = candidate;
          node.id = id;
        }
        usedIds.add(id);
        list.push({
          id,
          text,
          level: node.tagName === 'H2' ? 2 : 3,
        });
      });
      setHeadings(list);
      setActiveId((current) =>
        current && list.some((heading) => heading.id === current)
          ? current
          : (list[0]?.id ?? null)
      );
    };

    scan();
    // 数据延后到达 / 内部组件 lazy 渲染 → 重新扫一次
    const mo = new MutationObserver(scan);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [contentRef]);

  // 滚动高亮 —— IntersectionObserver 找"最近顶部"的可见 heading
  useEffect(() => {
    if (headings.length === 0) return;
    const observed = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el != null);
    if (observed.length === 0) return;

    // viewport 上 1/3 区域作为"激活区"—— rootMargin top 取负值把判定线下移,
    // 让标题滚过头时下一个才接管,避免抖动
    const io = new IntersectionObserver(
      (entries) => {
        // 取所有进入观察区的标题,选其中 boundingTop 最小的(最靠上)作为 active
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => ({
            id: e.target.id,
            top: e.boundingClientRect.top,
          }))
          .sort((a, b) => a.top - b.top);
        if (visible.length > 0) {
          setActiveId(visible[0].id);
          return;
        }
        // 没有任何标题在视口里 → 用滚动方向找最近一个已经滚过头的标题作为 active
        const allTops = observed
          .map((el) => ({ id: el.id, top: el.getBoundingClientRect().top }))
          .filter((x) => x.top < 100)
          .sort((a, b) => b.top - a.top);
        if (allTops.length > 0) setActiveId(allTops[0].id);
      },
      {
        rootMargin: '-80px 0px -70% 0px',
        threshold: 0,
      }
    );
    observed.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [headings]);

  const handleClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 立即高亮(IntersectionObserver 反应慢)
    setActiveId(id);
    // 更新 URL hash 但不滚动(已自己处理)
    if (history.replaceState) {
      history.replaceState(null, '', `#${id}`);
    }
  };

  if (headings.length === 0) return null;

  return (
    <nav
      ref={ref}
      aria-label={title}
      className={cn('text-12', className)}
    >
      <p className="text-12 font-medium uppercase text-faint mb-3">
        {title}
      </p>
      <ul className="space-y-1.5 border-l border-border-soft">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => handleClick(e, h.id)}
              className={cn(
                'block py-0.5 -ml-px border-l-2 transition-colors',
                h.level === 2 ? 'pl-3' : 'pl-6',
                activeId === h.id
                  ? tone === 'brand'
                    ? 'border-brand-red text-foreground font-medium'
                    : 'border-foreground text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
  }
);
TableOfContents.displayName = 'TableOfContents';
