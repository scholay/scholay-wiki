import React, { useState, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';
import {
  Layout, Menu, Button, Avatar, Dropdown, Modal, Form, Input, Drawer, Typography,
  App,
} from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  ApiOutlined,
  FilterOutlined,
  FileTextOutlined,
  RobotOutlined,
  MailOutlined,
  SendOutlined,
  SnippetsOutlined,
  CommentOutlined,
  FireOutlined,
  CodeOutlined,
  SettingOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/admin/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/admin/dashboard/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/admin/dashboard/third-party-accounts', icon: <ApiOutlined />, label: '第三方账号' },
  {
    key: 'business-data',
    icon: <FilterOutlined />,
    label: '业务数据',
    children: [
      { key: '/admin/dashboard/default-business-data', icon: <FileTextOutlined />, label: '分析维度' },
      { key: '/admin/dashboard/prompt-templates', icon: <SnippetsOutlined />, label: '提示词模板' },
      { key: '/admin/dashboard/latex-agent-config', icon: <RobotOutlined />, label: 'LaTeX Agent' },
    ],
  },
  {
    key: 'messages',
    icon: <MailOutlined />,
    label: '站内信管理',
    children: [
      { key: '/admin/dashboard/messages', icon: <SendOutlined />, label: '发送消息' },
      { key: '/admin/dashboard/message-templates', icon: <SnippetsOutlined />, label: '消息模板' },
    ],
  },
  { key: '/admin/dashboard/feedbacks', icon: <CommentOutlined />, label: '反馈管理' },
  { key: '/admin/dashboard/hot-content', icon: <FireOutlined />, label: '热门内容' },
  { key: '/admin/dashboard/code-snippets', icon: <CodeOutlined />, label: '代码片段' },
  { key: '/admin/dashboard/settings', icon: <SettingOutlined />, label: '系统设置' },
];

const DashboardLayout = () => {
  const { message } = App.useApp();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm] = Form.useForm();

  const selectedKeys = useMemo(() => {
    const path = location.pathname;
    if (path === '/admin/dashboard') return ['/admin/dashboard'];
    const matched = menuItems.flatMap(item =>
      item.children ? item.children.map(c => c.key) : [item.key]
    ).filter(key => path.startsWith(key) && key !== '/admin/dashboard');
    return matched.length ? [matched.sort((a, b) => b.length - a.length)[0]] : [path];
  }, [location.pathname]);

  const openKeys = useMemo(() => {
    const keys = [];
    menuItems.forEach(item => {
      if (item.children?.some(c => selectedKeys.includes(c.key))) {
        keys.push(item.key);
      }
    });
    return keys;
  }, [selectedKeys]);

  const handleMenuClick = ({ key }) => {
    navigate(key);
    setMobileDrawerOpen(false);
  };

  const handlePasswordSubmit = async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('新密码两次输入不一致');
      return;
    }
    setPasswordLoading(true);
    try {
      const { adminAPI } = await import('features/admin/api/adminApi');
      const response = await adminAPI.updatePassword(values.oldPassword, values.newPassword);
      if (response.data.code === 0) {
        message.success('密码修改成功');
        passwordForm.resetFields();
        setShowPasswordModal(false);
      } else {
        message.error(response.data.message || '密码修改失败');
      }
    } catch (err) {
      message.error(err.response?.data?.message || '操作失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const userMenuItems = [
    { key: 'password', icon: <LockOutlined />, label: '修改密码', onClick: () => setShowPasswordModal(true) },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: handleLogout },
  ];

  const siderContent = (
    <Menu
      mode="inline"
      selectedKeys={selectedKeys}
      defaultOpenKeys={openKeys}
      items={menuItems}
      onClick={handleMenuClick}
      style={{ borderInlineEnd: 'none' }}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sider */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={80}
        width={220}
        style={{ display: 'var(--admin-sider-display, block)' }}
        className="admin-sider-desktop"
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 20px',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <Typography.Text strong style={{ color: '#fff', fontSize: collapsed ? 0 : 18, transition: 'all 0.2s', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {collapsed ? 'S' : 'Scholar Admin'}
          </Typography.Text>
        </div>
        {siderContent}
      </Sider>

      {/* Mobile Drawer */}
      <Drawer
        placement="left"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        width={260}
        styles={{ body: { padding: 0 } }}
        className="admin-mobile-drawer"
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 16 }}>
          Scholar Admin
        </div>
        {siderContent}
      </Drawer>

      <Layout>
        <Header style={{
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          height: 56,
          lineHeight: '56px',
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => {
              if (window.innerWidth < 992) {
                setMobileDrawerOpen(true);
              } else {
                setCollapsed(!collapsed);
              }
            }}
            style={{ fontSize: 16 }}
          />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
              <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }}>
                {user?.username?.charAt(0)?.toUpperCase()}
              </Avatar>
              <span style={{ display: 'inline-block', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.username}
              </span>
            </div>
          </Dropdown>
        </Header>

        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>

      <Modal
        title="修改密码"
        open={showPasswordModal}
        onCancel={() => { setShowPasswordModal(false); passwordForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={passwordForm} layout="vertical" onFinish={handlePasswordSubmit} style={{ marginTop: 16 }}>
          <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 8, message: '密码至少8个字符' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请确认新密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button onClick={() => { setShowPasswordModal(false); passwordForm.resetFields(); }} style={{ marginRight: 8 }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={passwordLoading}>
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        @media (max-width: 991px) {
          .admin-sider-desktop { display: none !important; }
        }
        @media (min-width: 992px) {
          .admin-mobile-drawer { display: none !important; }
        }
      `}</style>
    </Layout>
  );
};

export default DashboardLayout;
