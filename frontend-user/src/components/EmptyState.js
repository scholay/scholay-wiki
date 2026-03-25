import React, { memo } from 'react';
import { Empty, Button, Result } from 'antd';
import { SearchOutlined, InboxOutlined, WarningOutlined } from '@ant-design/icons';

const EmptyState = memo(({
  icon,
  title,
  description,
  action,
  actionText,
  className = '',
}) => {
  return (
    <div className={className} style={{ padding: '40px 0' }}>
      <Empty
        image={icon || Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <>
            {title && <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>{title}</div>}
            {description && <div style={{ color: 'var(--text-tertiary)' }}>{description}</div>}
          </>
        }
      >
        {action && actionText && (
          <Button type="primary" onClick={action}>{actionText}</Button>
        )}
      </Empty>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';

export const NoResults = memo(({ query, onClear }) => (
  <Empty
    image={<SearchOutlined style={{ fontSize: 48, color: 'var(--text-quaternary)' }} />}
    description={query ? `没有找到与"${query}"相关的内容` : '没有找到相关内容'}
    style={{ padding: '40px 0' }}
  >
    {onClear && <Button onClick={onClear}>清除搜索</Button>}
  </Empty>
));
NoResults.displayName = 'NoResults';

export const NoData = memo(({ title = '暂无数据', description }) => (
  <Empty
    image={<InboxOutlined style={{ fontSize: 48, color: 'var(--text-quaternary)' }} />}
    description={
      <>
        <div>{title}</div>
        {description && <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{description}</div>}
      </>
    }
    style={{ padding: '40px 0' }}
  />
));
NoData.displayName = 'NoData';

export const ErrorState = memo(({
  title = '加载失败',
  description = '请稍后重试',
  onRetry,
}) => (
  <Result
    status="error"
    title={title}
    subTitle={description}
    extra={onRetry && <Button type="primary" onClick={onRetry}>重试</Button>}
  />
));
ErrorState.displayName = 'ErrorState';

export default EmptyState;
