/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { lazy, Suspense, memo } from 'react';
import './MarkdownRenderer.css';

// Lazy load the heavy markdown library
const ReactMarkdown = lazy(() => import('react-markdown'));

// Dynamic imports for plugins (they will be bundled with ReactMarkdown)
const loadPlugins = async () => {
  const [remarkGfm, rehypeHighlight, { highlightOptions }] = await Promise.all([
    import('remark-gfm'),
    import('rehype-highlight'),
    import('./highlightLanguages')
  ]);
  return {
    remarkPlugins: [remarkGfm.default],
    rehypePlugins: [[rehypeHighlight.default, highlightOptions]]
  };
};

// Loading fallback for markdown content
const MarkdownLoading = () => (
  <div className="md-loading">
    <div className="md-loading-line" />
    <div className="md-loading-line md-loading-line-short" />
  </div>
);

// Memoized markdown renderer component
const MarkdownRenderer = memo(({ content, components }) => {
  const [plugins, setPlugins] = React.useState(null);

  React.useEffect(() => {
    loadPlugins().then(setPlugins);
  }, []);

  if (!plugins) {
    return <MarkdownLoading />;
  }

  return (
    <Suspense fallback={<MarkdownLoading />}>
      <ReactMarkdown
        remarkPlugins={plugins.remarkPlugins}
        rehypePlugins={plugins.rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </Suspense>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';

export default MarkdownRenderer;
