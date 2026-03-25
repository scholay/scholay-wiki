/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState } from 'react';
import { Input, Button, Typography, Space, Alert } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined, LockOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';

const { Text } = Typography;

const SensitiveField = ({ label, value, isVerified, onRequestVerify, type = 'text' }) => {
  const [showValue, setShowValue] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleViewClick = () => {
    if (!isVerified) {
      onRequestVerify?.();
    } else {
      setShowValue(prev => !prev);
    }
  };

  const handleCopyClick = async () => {
    if (!isVerified || !showValue || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const maskedValue = value ? '●●●●●●●●●●●●●●●●' : '未设置';
  const displayValue = (isVerified && showValue) ? value : maskedValue;

  const viewIcon = !isVerified
    ? <LockOutlined />
    : showValue
      ? <EyeInvisibleOutlined />
      : <EyeOutlined />;

  const viewTitle = isVerified ? (showValue ? '隐藏' : '显示') : '需要验证';

  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>
          {label}
        </Text>
      )}
      <Space.Compact block>
        <Input
          readOnly
          value={displayValue}
          type={showValue ? 'text' : 'password'}
          style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", cursor: 'not-allowed' }}
        />
        {isVerified && showValue && (
          <Button
            icon={copySuccess ? <CheckOutlined /> : <CopyOutlined />}
            title={copySuccess ? '已复制' : '复制'}
            onClick={handleCopyClick}
            type={copySuccess ? 'primary' : 'default'}
            style={copySuccess ? { color: '#52c41a', borderColor: '#52c41a' } : undefined}
          />
        )}
        <Button icon={viewIcon} title={viewTitle} onClick={handleViewClick} />
      </Space.Compact>
      {!isVerified && (
        <Alert
          type="warning"
          showIcon
          message="查看此敏感信息需要验证管理员密码"
          style={{ marginTop: 8, fontSize: 12 }}
          banner
        />
      )}
    </div>
  );
};

export default SensitiveField;
