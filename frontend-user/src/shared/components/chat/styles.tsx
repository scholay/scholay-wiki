/**
 * Chat 渲染共享 CSS —— 不写进 globals.css 因为只服务 shared/components/chat,
 * 不全局复用。SSR 不需要 (chat 组件只在客户端渲染),走 <style> 注入即可。
 *
 * 内容:
 *   - .chat-thinking-dots — 思考中 "..." 三态闪烁 (取代 spinner, 视觉更轻)
 *   - .chat-cursor-blink — 流式光标 (1s 步进闪烁)
 *   - .chat-md-ol counter — markdown 有序列表的绿色圆形序号 chip
 *
 * 在两个 feature 顶层 (AssistantTurn / MessageTurn) 各挂一次即可, 重复挂没副作用
 * (浏览器自动 dedupe 相同 keyframes)。
 */
import { memo } from 'react';

const CHAT_STYLES = `
@keyframes scholay-chat-thinking-dots {
  0%, 20% { content: ''; }
  40% { content: '.'; }
  60% { content: '..'; }
  80%, 100% { content: '...'; }
}
.chat-thinking-dots::after {
  content: '';
  display: inline-block;
  min-width: 0.6em;
  animation: scholay-chat-thinking-dots 1.4s steps(1, end) infinite;
}

@keyframes scholay-chat-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.chat-cursor-blink {
  animation: scholay-chat-cursor-blink 1s step-end infinite;
}

/* Markdown 有序列表的绿色数字 chip:
   把 ol 的默认 decimal marker 关掉, 用 CSS counter 在 li::before 渲染绿色 badge,
   跟 search 的 "search papers" chip 调性呼应, 让 1./2./3. 易扫描。 */
.chat-md-ol {
  counter-reset: scholay-chat-md;
}
.chat-md-ol-li {
  counter-increment: scholay-chat-md;
}
.chat-md-ol-li::before {
  content: counter(scholay-chat-md);
  position: absolute;
  left: 0;
  top: 0.2em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35em;
  height: 1.35em;
  border-radius: 9999px;
  background-color: rgba(42, 122, 42, 0.12);
  color: #2A7A2A;
  font-size: 0.7rem;
  font-weight: 700;
  font-feature-settings: 'tnum';
  line-height: 1;
}
`;

/**
 * 单例样式注入. 任意一处 chat 渲染挂一次, 后续重复挂浏览器会 dedupe (相同 keyframes 名)。
 *
 * 使用方式 (在 AssistantTurn / MessageTurn 顶层):
 *
 *   import { ChatStyles } from '@/shared/components/chat';
 *   return <>
 *     <ChatStyles />
 *     { ... }
 *   </>;
 */
export const ChatStyles = memo(function ChatStyles() {
  // React 19 样式提升:带 `href` + `precedence` 的 <style> 会被 React **去重并提升到 <head>** ——
  // 即便长会话里 60 个 MessageTurn 各渲染一次 ChatStyles,DOM 里也只保留**一份** <style>。
  // 否则 60 份相同样式表会成倍放大滚动 / hover 时的 style 重算成本(本次滚动卡顿主因之一)。
  return (
    <style href="scholay-chat-styles" precedence="default">
      {CHAT_STYLES}
    </style>
  );
});
