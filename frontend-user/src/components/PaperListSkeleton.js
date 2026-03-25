import React, { memo } from 'react';
import { Skeleton, Card } from 'antd';

const PaperListSkeleton = memo(() => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array(8).fill(null).map((_, index) => (
        <Card key={index} size="small" style={{ borderRadius: 'var(--radius)' }}>
          <Skeleton active title={{ width: '70%' }} paragraph={{ rows: 2, width: ['90%', '60%'] }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Skeleton.Button active size="small" style={{ width: 60 }} />
            <Skeleton.Button active size="small" style={{ width: 60 }} />
            <Skeleton.Button active size="small" style={{ width: 60 }} />
          </div>
        </Card>
      ))}
    </div>
  );
});

PaperListSkeleton.displayName = 'PaperListSkeleton';

export default PaperListSkeleton;
