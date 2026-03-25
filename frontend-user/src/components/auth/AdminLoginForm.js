/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * AdminLoginForm - 管理员用户名密码登录（无 Turnstile，无 session）
 */

import React, { useState } from 'react';
import { Form, Input, Button } from 'antd';
import { useToast } from '../ToastContainer';
import { userAPI } from '../../services/api';

const AdminLoginForm = ({ username, onLoginSuccess, onModeChange }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { showError } = useToast();

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const res = await userAPI.loginWithUsername(username, values.password);
      if (res.data.code === 0) {
        onLoginSuccess(res.data.data.token, res.data.data.user);
      } else {
        showError(res.data.message || '登录失败');
      }
    } catch {
      showError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-content">
      <div className="auth-headline">
        <h1 className="auth-title">管理员登录</h1>
      </div>

      <div className="auth-email-display">
        <span>{username}</span>
        <button type="button" className="auth-change-email" onClick={() => onModeChange('welcome')}>编辑</button>
      </div>

      <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false}>
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password placeholder="密码" size="large" autoFocus />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block size="large">
            登录
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default AdminLoginForm;
