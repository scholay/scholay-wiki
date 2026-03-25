import React, { memo } from 'react';
import { Skeleton, Card } from 'antd';

const PaperDetailSkeleton = memo(() => {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Skeleton.Button active size="small" style={{ width: 100 }} />
        <Skeleton.Button active size="small" style={{ width: 120 }} />
      </div>

      <Skeleton active title={{ width: '80%' }} paragraph={false} />
      <Skeleton active title={false} paragraph={{ rows: 1, width: ['60%'] }} style={{ marginTop: 4 }} />

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        {[1, 2, 3].map(i => (
          <Skeleton.Button active key={i} size="small" style={{ width: 80 }} />
        ))}
        <Skeleton.Button active size="small" style={{ width: 140 }} />
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Skeleton active title={{ width: 60 }} paragraph={{ rows: 2, width: ['95%', '80%'] }} />
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Skeleton active title={{ width: 50 }} paragraph={{ rows: 3, width: ['100%', '100%', '70%'] }} />
      </Card>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4].map(i => (
          <Skeleton.Button active key={i} style={{ width: 90, height: 36 }} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Skeleton.Button active style={{ width: 80 }} />
        <Skeleton.Button active style={{ width: 80 }} />
        <Skeleton.Button active style={{ width: 80 }} />
      </div>

      {[1, 2, 3, 4, 5].map(i => (
        <Card key={i} size="small" style={{ marginBottom: 8 }}>
          <Skeleton active title={{ width: '75%' }} paragraph={{ rows: 2, width: ['90%', '85%'] }} />
        </Card>
      ))}
    </div>
  );
});

PaperDetailSkeleton.displayName = 'PaperDetailSkeleton';

export default PaperDetailSkeleton;
