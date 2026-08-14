import { useEffect, useMemo } from 'react';
import { MermaidDiagram } from '@/shared/components/chat/MermaidDiagram';

/**
 * 小程序图表查看页(/mp/diagram)—— 由小程序 web-view 加载,复用 Web 端 mermaid
 * 渲染栈(动态 import + 渲染缓存 + ZoomableSvg 点击全屏/拖拽/缩放)。
 *
 * 约定:
 *   - 源码经 URL hash 传入:#c=<encodeURIComponent(源码)>&t=<encodeURIComponent(标题)>
 *     (hash 不发往服务器,不进 nginx access log,几 KB 的 mermaid 源码可安全携带)
 *   - 公开、免登录、不挂 AppShell/MobileShell(小程序导航栏承担页面壳),
 *     与 /s/:token 分享接收页同模式,由 app/router.tsx 顶层组装。
 */
export function MpDiagramPage() {
  const { code, title } = useMemo(() => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    return { code: (p.get('c') ?? '').trim(), title: p.get('t') || '图表' };
  }, []);

  useEffect(() => {
    document.title = title;
  }, [title]);

  if (!code) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-14 text-muted-foreground">
        缺少图表内容,请从对话里重新打开
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background px-4 py-5">
      <MermaidDiagram code={code} />
      {/* 页面级捏合被全局 viewport user-scalable=no 禁用;缩放能力在全屏视图内
          (react-zoom-pan-pinch 自带触摸手势,不受 viewport 限制)。 */}
      <p className="mt-4 text-center text-12 text-faint">点按图表进入全屏 · 全屏内可拖拽缩放</p>
    </div>
  );
}
