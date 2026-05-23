import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { Prose } from './Prose';

/**
 * 智能渲染:输入既可能是 HTML 也可能是 Markdown(后台管理后台两种都支持)。
 * 简单启发式 —— 出现 `<h1>` `<h2>` 等 HTML 标签就走 dangerouslySetInnerHTML + DOMPurify;
 * 否则走 ReactMarkdown。
 *
 * 用于:隐私政策 / 服务条款 等后台维护的长文。
 */
export function RichContent({ content }: { content: string }) {
  const looksLikeHTML = /<h[1-6][\s>]|<p[\s>]|<ul[\s>]|<ol[\s>]/i.test(content);
  if (looksLikeHTML) {
    return (
      <Prose>
        <div
          // 仅渲染后端管理员维护的法律文档,DOMPurify 再清一遍防意外
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
        />
      </Prose>
    );
  }
  return (
    <Prose>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </Prose>
  );
}
