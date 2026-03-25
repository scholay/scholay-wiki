/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState } from 'react';
import { Modal, Form, Input, App } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { adminAPI } from '../../services/adminApi';

const VerifyPasswordModal = ({ isOpen, onClose, onVerified }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const response = await adminAPI.verifyPassword(values.password);
      if (response.data.code === 0) {
        message.success('验证成功');
        form.resetFields();
        onVerified();
        onClose();
      } else {
        message.error(response.data.message || '密码错误');
      }
    } catch (err) {
      if (err.response) {
        message.error(err.response?.data?.message || '验证失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title={
        <span>
          <LockOutlined style={{ marginRight: 8, color: '#faad14' }} />
          安全验证
        </span>
      }
      open={isOpen}
      onOk={handleSubmit}
      onCancel={handleClose}
      okText="验证并查看"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      width={480}
    >
      <p style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 16 }}>
        查看敏感信息需要验证您的管理员密码
      </p>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="password"
          label="管理员密码"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="请输入管理员密码"
            autoFocus
            onPressEnter={handleSubmit}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default VerifyPasswordModal;
