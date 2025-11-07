import React, { lazy, Suspense, memo } from 'react';

// Lazy load the heavy markdown library
const ReactMarkdown = lazy(() => import('react-markdown'));

// Dynamic imports for plugins (they will be bundled with ReactMarkdown)
const loadPlugins = async () => {
  const [remarkGfm, rehypeHighlight] = await Promise.all([
    import('remark-gfm'),
    import('rehype-highlight')
  ]);
  return {
    remarkPlugins: [remarkGfm.default],
    rehypePlugins: [rehypeHighlight.default]
  };
};

// Loading fallback for markdown content
const MarkdownLoading = () => (
  <div style={{ padding: '8px 0' }}>
    <div style={{
      height: '1em',
      background: '#e0e0e0',
      borderRadius: '4px',
      marginBottom: '8px',
      animation: 'pulse 1.5s ease-in-out infinite'
    }} />
    <div style={{
      height: '1em',
      background: '#e0e0e0',
      borderRadius: '4px',
      width: '80%'
    }} />
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
