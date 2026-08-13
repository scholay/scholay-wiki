import { useLayoutEffect, useRef, type ReactNode } from "react";
import { linkWikiSectionSpots } from "./wiki-spot-linker";

/**
 * 包住「正文 + 演示」：自动从 fixture 甄别标签元素，
 * 与正文同名术语关联；hover / focus 时目标保持原色，其余演示区域蒙层。
 */
export function WikiSpotSection({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return linkWikiSectionSpots(root);
  }, [children]);

  return (
    <div ref={rootRef} className="wiki-spot-section">
      {children}
    </div>
  );
}
