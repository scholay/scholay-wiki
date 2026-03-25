/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  App,
  Drawer,
  Descriptions,
  Tag,
  Avatar,
  Divider,
  Space,
  Spin,
  Statistic,
  Typography,
  Flex,
  Card,
  Row,
  Col,
  Result,
} from 'antd';
import {
  MailOutlined,
  PhoneOutlined,
  CheckCircleFilled,
  UserOutlined,
} from '@ant-design/icons';
import { adminAPI } from '../../services/adminApi';

const { Text, Title } = Typography;

const statusTagMap = {
  1: { color: 'success', text: '正常' },
  0: { color: 'default', text: '未激活' },
  2: { color: 'error', text: '已封禁' },
};

const UserDetailDrawer = ({ userId, onClose }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const loadUserDetail = async (id) => {
    setLoading(true);
    try {
      const response = await adminAPI.getUserDetail(id);
      if (response.data.code === 0 && response.data.data) {
        setDetail(response.data.data);
      } else {
        message.error('加载用户详情失败');
      }
    } catch (err) {
      message.error(err.response?.data?.message || '加载用户详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadUserDetail(userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!userId) return null;

  const statusCfg = statusTagMap[detail?.status] || { color: 'default', text: '未知' };
  const avatarChar = detail?.username?.[0]?.toUpperCase() || detail?.email?.[0]?.toUpperCase() || 'U';

  return (
    <Drawer
      title="用户详情"
      open={!!userId}
      onClose={onClose}
      width={420}
      destroyOnClose
    >
      <Spin spinning={loading}>
        {detail ? (
          <Flex vertical gap={16}>
            {/* 用户概览 */}
            <Flex align="center" gap={12}>
              <Avatar
                size={48}
                icon={<UserOutlined />}
                style={{ backgroundColor: '#1677ff', fontSize: 20, flexShrink: 0 }}
              >
                {avatarChar}
              </Avatar>
              <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                <Space>
                  <Title level={5} style={{ margin: 0 }} ellipsis>
                    {detail.username || '未设置用户名'}
                  </Title>
                  <Tag color={statusCfg.color}>{statusCfg.text}</Tag>
                </Space>
                <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  ID: {detail.id}
                </Text>
              </Flex>
            </Flex>

            {/* 联系方式 */}
            <Flex vertical gap={6}>
              {detail.email && (
                <Space size={6}>
                  <MailOutlined style={{ color: '#999' }} />
                  <Text>{detail.email}</Text>
                  {detail.email_verified && (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 12 }} />
                  )}
                </Space>
              )}
              {detail.phone && (
                <Space size={6}>
                  <PhoneOutlined style={{ color: '#999' }} />
                  <Text>{detail.phone}</Text>
                  {detail.phone_verified && (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 12 }} />
                  )}
                </Space>
              )}
            </Flex>

            {/* 登录方式 */}
            {detail.auth_providers && detail.auth_providers.length > 0 && (
              <Space size={[4, 4]} wrap>
                {detail.auth_providers.map(p => (
                  <Tag key={p} color="blue">{p.toUpperCase()}</Tag>
                ))}
              </Space>
            )}

            <Divider style={{ margin: '4px 0' }} />

            {/* 数据统计 */}
            <div>
              <Text strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                数据统计
              </Text>
              <Row gutter={12} style={{ marginTop: 10 }}>
                <Col span={12}>
                  <Card size="small" styles={{ body: { textAlign: 'center', padding: '12px 8px' } }}>
                    <Statistic
                      title="AI对话"
                      value={detail.ai_conversation_stats?.total_conversations || 0}
                      valueStyle={{ fontSize: 18 }}
                    />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" styles={{ body: { textAlign: 'center', padding: '12px 8px' } }}>
                    <Statistic
                      title="智能分析"
                      value={detail.analysis_conversation_stats?.total_conversations || 0}
                      valueStyle={{ fontSize: 18 }}
                    />
                  </Card>
                </Col>
              </Row>
            </div>

            <Divider style={{ margin: '4px 0' }} />

            {/* 时间与登录信息 */}
            <Descriptions
              column={1}
              size="small"
              labelStyle={{ color: '#999', fontSize: 13 }}
              contentStyle={{ fontSize: 13, fontFamily: 'monospace' }}
            >
              <Descriptions.Item label="注册时间">
                {formatDate(detail.created_at)}
              </Descriptions.Item>
              <Descriptions.Item label="最后登录">
                {formatDate(detail.last_login_at)}
              </Descriptions.Item>
              {detail.last_login_ip && (
                <Descriptions.Item label="登录IP">
                  {detail.last_login_ip}
                  {detail.last_login_ip_info && (
                    <Text type="secondary" style={{ marginLeft: 6, fontFamily: 'inherit' }}>
                      ({detail.last_login_ip_info})
                    </Text>
                  )}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Flex>
        ) : !loading ? (
          <Result status="error" title="加载失败" subTitle="请重试" />
        ) : null}
      </Spin>
    </Drawer>
  );
};

export default UserDetailDrawer;
