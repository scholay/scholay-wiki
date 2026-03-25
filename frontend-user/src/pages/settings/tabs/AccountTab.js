/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 账号授权管理标签页组件
 */

import React, { memo } from 'react';
import {
  Card, Button, Modal, Input, Space, Typography, Avatar,
  Divider, Alert, Tag,
} from 'antd';
import {
  MailOutlined, PhoneOutlined, WechatOutlined, GithubOutlined,
  LockOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const AccountTab = memo(({
  user,
  loading,
  accountModal,
  setAccountModal,
  modalForm,
  setModalForm,
  modalCodeCountdown,
  getLoginMethodCount,
  handleOpenModal,
  handleCloseModal,
  handleBindWeChat,
  handleBindGitHub,
  handleCheckAvailability,
  handleSendModalCode,
  handleSendUnbindCode,
  handleModalSubmit,
}) => {
  const bindingItems = [
    {
      key: 'email',
      icon: <MailOutlined />,
      iconBg: '#10a37f',
      label: '邮箱',
      value: user?.email,
      isBound: !!user?.email,
      onBind: () => handleOpenModal('bind-email', ''),
      onRebind: () => handleOpenModal('rebind-email', user?.email),
      onUnbind: () => handleOpenModal('unbind-email', user?.email),
    },
    {
      key: 'phone',
      icon: <PhoneOutlined />,
      iconBg: '#10a37f',
      label: '手机号',
      value: user?.phone,
      isBound: !!user?.phone,
      onBind: () => handleOpenModal('bind-phone', ''),
      onRebind: () => handleOpenModal('rebind-phone', user?.phone),
      onUnbind: () => handleOpenModal('unbind-phone', user?.phone),
    },
    {
      key: 'wechat',
      icon: <WechatOutlined />,
      iconBg: '#07c160',
      label: '微信',
      value: user?.wechat_openid ? '已绑定' : null,
      isBound: !!user?.wechat_openid,
      onBind: handleBindWeChat,
      onUnbind: () => handleOpenModal('unbind-wechat', ''),
      hideRebind: true,
    },
    {
      key: 'github',
      icon: <GithubOutlined />,
      iconBg: '#333',
      label: 'GitHub',
      value: user?.github_id ? '已绑定' : null,
      isBound: !!user?.github_id,
      onBind: handleBindGitHub,
      onUnbind: () => handleOpenModal('unbind-github', ''),
      hideRebind: true,
    },
  ];

  const renderVerifyCodeInput = (onSendCode) => (
    <div style={{ marginBottom: 16 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>验证码</Text>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={modalForm.code}
          onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
          placeholder="输入验证码"
          maxLength={6}
        />
        <Button
          onClick={onSendCode}
          disabled={modalCodeCountdown > 0 || loading}
        >
          {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
        </Button>
      </Space.Compact>
    </div>
  );

  const renderModalContent = () => {
    const { type, step, currentValue } = accountModal;

    if (type === 'bind-email' || type === 'rebind-email') {
      if (step === 1) {
        return (
          <>
            {type === 'rebind-email' && (
              <Alert
                type="info"
                message={<>当前邮箱: <strong>{currentValue}</strong></>}
                description="请输入新邮箱地址"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>新邮箱地址</Text>
              <Input
                type="email"
                value={modalForm.email}
                onChange={(e) => setModalForm({ ...modalForm, email: e.target.value })}
                placeholder="输入邮箱地址"
              />
            </div>
            <Button type="primary" block onClick={handleCheckAvailability} loading={loading}>
              继续
            </Button>
          </>
        );
      }
      return (
        <>
          <Alert
            type="info"
            message={<>邮箱: <strong>{modalForm.email}</strong></>}
            action={
              <Button
                type="link"
                size="small"
                onClick={() => setAccountModal((prev) => ({ ...prev, step: 1 }))}
              >
                返回修改
              </Button>
            }
            showIcon
            style={{ marginBottom: 16 }}
          />
          {renderVerifyCodeInput(handleSendModalCode)}
          <Button type="primary" block onClick={handleModalSubmit} loading={loading}>
            确认
          </Button>
        </>
      );
    }

    if (type === 'bind-phone' || type === 'rebind-phone') {
      if (step === 1) {
        return (
          <>
            {type === 'rebind-phone' && (
              <Alert
                type="info"
                message={<>当前手机号: <strong>{currentValue}</strong></>}
                description="请输入新手机号"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>新手机号</Text>
              <Input
                type="tel"
                value={modalForm.phone}
                onChange={(e) => setModalForm({ ...modalForm, phone: e.target.value.replace(/\D/g, '') })}
                placeholder="输入11位手机号码"
                maxLength={11}
              />
            </div>
            <Button type="primary" block onClick={handleCheckAvailability} loading={loading}>
              继续
            </Button>
          </>
        );
      }
      return (
        <>
          <Alert
            type="info"
            message={<>手机号: <strong>{modalForm.phone}</strong></>}
            action={
              <Button
                type="link"
                size="small"
                onClick={() => setAccountModal((prev) => ({ ...prev, step: 1 }))}
              >
                返回修改
              </Button>
            }
            showIcon
            style={{ marginBottom: 16 }}
          />
          {renderVerifyCodeInput(handleSendModalCode)}
          <Button type="primary" block onClick={handleModalSubmit} loading={loading}>
            确认
          </Button>
        </>
      );
    }

    if (type === 'unbind-email') {
      return (
        <>
          <Alert
            type="warning"
            message={<>即将解绑邮箱: <strong>{currentValue}</strong></>}
            description="注意：必须至少保留一种登录方式"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              验证码（将发送到当前邮箱）
            </Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={modalForm.code}
                onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                placeholder="输入验证码"
                maxLength={6}
              />
              <Button
                onClick={() => handleSendUnbindCode('email')}
                disabled={modalCodeCountdown > 0 || loading}
              >
                {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
              </Button>
            </Space.Compact>
          </div>
          <Button danger type="primary" block onClick={handleModalSubmit} loading={loading}>
            确认解绑
          </Button>
        </>
      );
    }

    if (type === 'unbind-phone') {
      return (
        <>
          <Alert
            type="warning"
            message={<>即将解绑手机号: <strong>{currentValue}</strong></>}
            description="注意：必须至少保留一种登录方式"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              验证码（将发送到当前手机）
            </Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={modalForm.code}
                onChange={(e) => setModalForm({ ...modalForm, code: e.target.value })}
                placeholder="输入验证码"
                maxLength={6}
              />
              <Button
                onClick={() => handleSendUnbindCode('phone')}
                disabled={modalCodeCountdown > 0 || loading}
              >
                {modalCodeCountdown > 0 ? `${modalCodeCountdown}秒` : '发送验证码'}
              </Button>
            </Space.Compact>
          </div>
          <Button danger type="primary" block onClick={handleModalSubmit} loading={loading}>
            确认解绑
          </Button>
        </>
      );
    }

    if (type === 'unbind-wechat') {
      return (
        <>
          <Alert
            type="warning"
            message="即将解绑微信账号"
            description="注意：必须至少保留一种登录方式"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Button danger type="primary" block onClick={handleModalSubmit} loading={loading}>
            确认解绑
          </Button>
        </>
      );
    }

    if (type === 'unbind-github') {
      return (
        <>
          <Alert
            type="warning"
            message="即将解绑 GitHub 账号"
            description="注意：必须至少保留一种登录方式"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Button danger type="primary" block onClick={handleModalSubmit} loading={loading}>
            确认解绑
          </Button>
        </>
      );
    }

    if (type === 'change-password') {
      return (
        <>
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>当前密码</Text>
            <Input.Password
              value={modalForm.password}
              onChange={(e) => setModalForm({ ...modalForm, password: e.target.value })}
              placeholder="输入当前密码"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>新密码</Text>
            <Input.Password
              value={modalForm.newPassword}
              onChange={(e) => setModalForm({ ...modalForm, newPassword: e.target.value })}
              placeholder="输入新密码（至少8个字符）"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>确认新密码</Text>
            <Input.Password
              value={modalForm.confirmPassword}
              onChange={(e) => setModalForm({ ...modalForm, confirmPassword: e.target.value })}
              placeholder="再次输入新密码"
            />
          </div>
          <Button type="primary" block onClick={handleModalSubmit} loading={loading}>
            确认修改
          </Button>
        </>
      );
    }

    return null;
  };

  return (
    <>
      <Card>
        {bindingItems.map((item, index) => (
          <React.Fragment key={item.key}>
            {index > 0 && <Divider style={{ margin: '4px 0' }} />}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 0',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <Space size="middle">
                <Avatar
                  icon={item.icon}
                  style={{ backgroundColor: item.iconBg }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text strong>{item.label}</Text>
                    <Tag color={item.isBound ? 'success' : 'default'} style={{ marginRight: 0 }}>
                      {item.isBound ? '已绑定' : '未绑定'}
                    </Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {item.value || '暂未绑定'}
                  </Text>
                </div>
              </Space>
              <Space>
                {item.isBound ? (
                  <>
                    {!item.hideRebind && (
                      <Button size="small" onClick={item.onRebind}>
                        换绑
                      </Button>
                    )}
                    {getLoginMethodCount() > 1 && (
                      <Button danger size="small" onClick={item.onUnbind}>
                        解绑
                      </Button>
                    )}
                  </>
                ) : (
                  <Button type="primary" size="small" onClick={item.onBind}>
                    绑定
                  </Button>
                )}
              </Space>
            </div>
          </React.Fragment>
        ))}
      </Card>

      <div style={{ marginTop: 24 }}>
        <Button
          icon={<LockOutlined />}
          block
          size="large"
          onClick={() => handleOpenModal('change-password', '')}
        >
          修改密码
        </Button>
      </div>

      <Modal
        open={accountModal.show}
        title={accountModal.title}
        onCancel={handleCloseModal}
        footer={null}
        destroyOnClose
        width={480}
      >
        {renderModalContent()}
      </Modal>
    </>
  );
});

AccountTab.displayName = 'AccountTab';

export default AccountTab;
