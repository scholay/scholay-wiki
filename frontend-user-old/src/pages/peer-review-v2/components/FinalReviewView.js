/**
 * FinalReviewView — 完成态审稿正文 + 推荐结论 + 章节锚点导航。
 *
 * 接受 markdown 字符串(合并审稿正文),用 MarkdownRenderer 渲染。
 * 解析章节标题 (## 概要 / ## 主要问题 / ...) 生成左侧目录,点击平滑滚动。
 */

import React, { useMemo, useRef } from 'react';
import MarkdownRenderer from '../../../components/common/MarkdownRenderer';
import RecommendationBadge from './RecommendationBadge';

function extractSections(md) {
  if (!md) return [];
  const lines = md.split('\n');
  const out = [];
  let idx = 0;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      idx += 1;
      const title = m[1].trim();
      const id = `prv2-sec-${idx}-${title.replace(/[^\w一-龥]+/g, '-').slice(0, 32)}`;
      out.push({ id, title });
    }
  }
  return out;
}

const FinalReviewView = ({ content, recommendation, onCopy }) => {
  const sections = useMemo(() => extractSections(content || ''), [content]);
  const bodyRef = useRef(null);

  // 渲染后给每个 ## h2 注入 id,作为锚点目标
  React.useEffect(() => {
    if (!bodyRef.current || sections.length === 0) return;
    const h2s = bodyRef.current.querySelectorAll('h2');
    h2s.forEach((h, i) => {
      if (sections[i]) h.id = sections[i].id;
    });
  }, [sections, content]);

  const onJump = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="prv2-final-wrap">
      <header className="prv2-final-head">
        <div className="prv2-final-head-l">
          <h2 className="prv2-final-title">合并审稿意见</h2>
          {recommendation && (
            <RecommendationBadge recommendation={recommendation} size="lg" />
          )}
        </div>
        <div className="prv2-final-head-r">
          <button
            type="button"
            className="prv2-final-copy"
            onClick={() => {
              if (!content) return;
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(content);
              }
              onCopy?.();
            }}
          >
            复制全文
          </button>
        </div>
      </header>

      <div className="prv2-final-body">
        {sections.length > 0 && (
          <nav className="prv2-final-toc" aria-label="章节目录">
            <div className="prv2-final-toc-title">章节</div>
            <ul>
              {sections.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="prv2-final-toc-item"
                    onClick={() => onJump(s.id)}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <article ref={bodyRef} className="prv2-final-md">
          <MarkdownRenderer content={content || ''} />
        </article>
      </div>
    </div>
  );
};

export default FinalReviewView;
