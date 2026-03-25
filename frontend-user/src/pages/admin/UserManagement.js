/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  App,
  Table,
  Input,
  Select,
  Button,
  Card,
  Statistic,
  Collapse,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Segmented,
  Row,
  Col,
  Typography,
  Flex,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  TeamOutlined,
  UserOutlined,
  BarChartOutlined,
  UnorderedListOutlined,
  ClockCircleOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { adminAPI } from 'features/admin/api/adminApi';
import UserStatisticsChart from '../../components/admin/UserStatisticsChart';
import OnlineUserChart from '../../components/admin/OnlineUserChart';
import UserDetailDrawer from '../../components/admin/UserDetailDrawer';

const { Title, Text } = Typography;

const MAX_ONLINE_USERS_DISPLAY = 500;

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: '1', label: '正常' },
  { value: '0', label: '未激活' },
  { value: '2', label: '已封禁' },
];

const statusTagMap = {
  1: { color: 'success', text: '正常' },
  0: { color: 'default', text: '未激活' },
  2: { color: 'error', text: '已封禁' },
};

const formatRelativeTime = (dateString) => {
  if (!dateString) return '从未登录';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) {
    if (diffMinutes >= 30 && diffHours < 1) return '半小时前';
    return `${diffHours}小时前`;
  }
  if (diffDays < 30) return `${diffDays}天前`;
  if (diffMonths < 12) return `${diffMonths}个月前`;
  return `${diffYears}年前`;
};

const formatDate = (dateString) => {
  if (!dateString) return '从未登录';
  return new Date(dateString).toLocaleString('zh-CN');
};

const UserManagement = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    onlineUsers: 0,
    onlineGuests: 0,
    todayRegistrations: 0,
  });
  const [users, setUsers] = useState([]);
  const [onlineUsersList, setOnlineUsersList] = useState([]);

  const isMountedRef = useRef(true);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [sortConfig, setSortConfig] = useState({
    sortBy: 'last_login_at',
    sortOrder: 'desc',
  });
  const [activeView, setActiveView] = useState('list');
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCharts, setShowCharts] = useState(true);

  const loadUserStatistics = useCallback(async () => {
    try {
      const response = await adminAPI.getUserStatistics();
      if (response.data.code === 0 && response.data.data) {
        setStats({
          onlineUsers: response.data.data.online_users || 0,
          onlineGuests: response.data.data.online_guests || 0,
          todayRegistrations: response.data.data.today_registrations || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load user statistics:', err);
    }
  }, []);

  const loadUserList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getUserList(
        pagination.page,
        pagination.pageSize,
        sortConfig.sortBy,
        sortConfig.sortOrder
      );
      if (!isMountedRef.current) return;

      if (response.data.code === 0 && response.data.data) {
        setUsers(response.data.data.users || []);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total || 0,
        }));
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      message.error('加载用户列表失败');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [pagination.page, pagination.pageSize, sortConfig.sortBy, sortConfig.sortOrder, message]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadUserStatistics();
    loadUserList();
  }, [loadUserStatistics, loadUserList]);

  const loadOnlineUsers = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getOnlineUsers();
      if (!isMountedRef.current) return;

      if (response.data.code === 0 && response.data.data) {
        const onlineUsers = response.data.data.online_users || [];
        const limitedUsers = onlineUsers.slice(0, MAX_ONLINE_USERS_DISPLAY);
        setOnlineUsersList(limitedUsers);

        if (onlineUsers.length > MAX_ONLINE_USERS_DISPLAY) {
          message.info(`显示前 ${MAX_ONLINE_USERS_DISPLAY} 个在线用户（共 ${onlineUsers.length} 个）`);
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      message.error('加载在线用户失败');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleViewChange = (view) => {
    setActiveView(view);
    if (view === 'online') {
      loadOnlineUsers();
    }
  };

  const handleDeleteConfirm = async (user) => {
    try {
      const response = await adminAPI.deleteUser(user.id);
      if (response.data.code === 0) {
        message.success('用户删除成功');
        loadUserList();
        loadUserStatistics();
      } else {
        message.error(response.data.message || '删除失败');
      }
    } catch (err) {
      message.error(err.response?.data?.message || '删除用户失败');
    }
  };

  const handleTableChange = (pag, _filters, sorter) => {
    if (sorter && sorter.field) {
      const fieldMap = {
        last_login_at: 'last_login_at',
        created_at: 'created_at',
      };
      const sortBy = fieldMap[sorter.field] || sorter.field;
      const sortOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
      setSortConfig({ sortBy, sortOrder });
    }
    setPagination(prev => ({
      ...prev,
      page: pag.current,
      pageSize: pag.pageSize,
    }));
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      if (searchKeyword) {
        const keyword = searchKeyword.toLowerCase();
        const matchId = user.id.toString().includes(keyword);
        const matchName = user.username?.toLowerCase().includes(keyword);
        const matchEmail = user.email?.toLowerCase().includes(keyword);
        const matchPhone = user.phone?.includes(keyword);
        if (!matchId && !matchName && !matchEmail && !matchPhone) {
          return false;
        }
      }
      if (filterStatus !== '' && user.status !== parseInt(filterStatus, 10)) {
        return false;
      }
      return true;
    });
  }, [users, searchKeyword, filterStatus]);

  const userColumns = [
    {
      title: '用户信息',
      dataIndex: 'username',
      key: 'username',
      width: 280,
      render: (_, record) => (
        <Flex vertical gap={4}>
          <Space size={8}>
            <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>#{record.id}</Text>
            <Text strong>{record.username || '-'}</Text>
          </Space>
          <Space size={4} wrap>
            {record.email && <Tag color="blue" style={{ margin: 0 }}>{record.email}</Tag>}
            {record.phone && <Tag color="green" style={{ margin: 0 }}>{record.phone}</Tag>}
          </Space>
        </Flex>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const cfg = statusTagMap[status] || { color: 'default', text: '未知' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 140,
      sorter: true,
      sortOrder: sortConfig.sortBy === 'last_login_at'
        ? (sortConfig.sortOrder === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (val) => (
        <Tooltip title={formatDate(val)}>
          <Text>{formatRelativeTime(val)}</Text>
        </Tooltip>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      sorter: true,
      sortOrder: sortConfig.sortBy === 'created_at'
        ? (sortConfig.sortOrder === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (val) => (
        <Tooltip title={formatDate(val)}>
          <Text>{formatRelativeTime(val)}</Text>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedUserId(record.id);
            }}
          >
            详情
          </Button>
          <Popconfirm
            title="确认删除用户"
            description={
              <div style={{ maxWidth: 280 }}>
                <p>确定要删除用户 <strong>{record.email || record.username || `ID: ${record.id}`}</strong> 吗？</p>
                <p style={{ color: '#ff4d4f', fontWeight: 600, margin: '8px 0 4px' }}>
                  ⚠️ 此操作将删除该用户的所有数据（除统计数据外），包括：
                </p>
                <ul style={{ margin: '4px 0 8px', paddingLeft: 20, color: '#666' }}>
                  <li>用户账号信息</li>
                  <li>登录认证信息</li>
                  <li>会话记录</li>
                  <li>对话历史和消息</li>
                </ul>
                <p style={{ color: '#ff4d4f', fontWeight: 600 }}>此操作<strong>不可撤销</strong>！</p>
              </div>
            }
            onConfirm={() => handleDeleteConfirm(record)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const onlineColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (val) => val || '-',
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 140,
      render: (val) => val || '-',
    },
    {
      title: '最后活跃时间',
      dataIndex: 'last_activity',
      key: 'last_activity',
      width: 180,
      render: (val) => formatDate(val),
    },
    {
      title: 'IP地址/地区',
      key: 'ip',
      width: 180,
      render: (_, record) => (
        <Flex vertical gap={2}>
          <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {record.ip || '-'}
          </Text>
          {record.location && (
            <Tag style={{ margin: 0, width: 'fit-content' }}>{record.location}</Tag>
          )}
        </Flex>
      ),
    },
    {
      title: '设备信息',
      dataIndex: 'device',
      key: 'device',
      width: 280,
      ellipsis: true,
      render: (val) => val || '-',
    },
  ];

  const chartsCollapseItems = [
    {
      key: 'charts',
      label: (
        <Space>
          <BarChartOutlined />
          <span>数据趋势</span>
        </Space>
      ),
      children: (
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={12}>
            <Card size="small" title="用户注册趋势" styles={{ body: { minHeight: 280 } }}>
              <UserStatisticsChart />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="在线用户趋势" styles={{ body: { minHeight: 280 } }}>
              <OnlineUserChart />
            </Card>
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <Flex vertical gap={20} style={{ padding: 20, maxWidth: 1600, margin: '0 auto', width: '100%' }}>
      {/* 顶部：标题 + 统计摘要 */}
      <Card styles={{ body: { padding: '20px 24px' } }}>
        <Flex justify="space-between" align="flex-start" wrap="wrap" gap={24}>
          <Flex align="center" gap={32} wrap="wrap">
            <div>
              <Title level={4} style={{ margin: 0 }}>用户管理</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>管理和分析平台用户数据</Text>
            </div>
            <Row gutter={16}>
              <Col>
                <Statistic
                  title="用户在线"
                  value={stats.onlineUsers}
                  prefix={<TeamOutlined />}
                  valueStyle={{ color: '#22c55e', fontSize: 20 }}
                />
              </Col>
              <Col>
                <Statistic
                  title="访客在线"
                  value={stats.onlineGuests}
                  prefix={<UserOutlined />}
                  valueStyle={{ color: '#8b5cf6', fontSize: 20 }}
                />
              </Col>
              <Col>
                <Statistic
                  title="今日新增"
                  value={stats.todayRegistrations}
                  prefix={<UserAddOutlined />}
                  valueStyle={{ color: '#3b82f6', fontSize: 20 }}
                />
              </Col>
              <Col>
                <Statistic
                  title="总用户"
                  value={pagination.total}
                  prefix={<TeamOutlined />}
                  valueStyle={{ color: '#7c3aed', fontSize: 20 }}
                />
              </Col>
            </Row>
          </Flex>
        </Flex>
      </Card>

      {/* 图表区域 - 可折叠 */}
      <Collapse
        items={chartsCollapseItems}
        activeKey={showCharts ? ['charts'] : []}
        onChange={(keys) => setShowCharts(keys.includes('charts'))}
        style={{ background: '#fff' }}
      />

      {/* 工具栏 */}
      <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space wrap>
            <Input.Search
              placeholder="搜索用户ID、用户名、邮箱、手机号..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onSearch={() => {}}
              allowClear
              style={{ width: 340 }}
              prefix={<SearchOutlined />}
            />
            <Select
              value={filterStatus}
              onChange={(val) => setFilterStatus(val)}
              options={statusOptions}
              style={{ minWidth: 120 }}
            />
          </Space>
          <Space>
            <Segmented
              value={activeView}
              onChange={handleViewChange}
              options={[
                { value: 'list', icon: <UnorderedListOutlined />, label: '全部用户' },
                { value: 'online', icon: <ClockCircleOutlined />, label: '在线用户' },
              ]}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={activeView === 'list' ? loadUserList : loadOnlineUsers}
            />
          </Space>
        </Flex>
      </Card>

      {/* 表格 */}
      {activeView === 'list' ? (
        <Table
          rowKey="id"
          columns={userColumns}
          dataSource={filteredUsers}
          loading={loading}
          onChange={handleTableChange}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 800 }}
          locale={{ emptyText: searchKeyword || filterStatus ? '没有找到匹配的用户' : '暂无用户数据' }}
          size="middle"
        />
      ) : (
        <Table
          rowKey={(record, index) => record.id || index}
          columns={onlineColumns}
          dataSource={onlineUsersList}
          loading={loading}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: '暂无在线用户' }}
          size="middle"
        />
      )}

      {/* User Detail Drawer */}
      {selectedUserId && (
        <UserDetailDrawer
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </Flex>
  );
};

export default UserManagement;
