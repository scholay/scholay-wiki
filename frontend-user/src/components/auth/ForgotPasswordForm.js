/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * ForgotPasswordForm - 邮箱 / 手机号重置密码
 */

import React, { useState, useEffect } from 'react';
import { Form, Input, Button } from 'antd';
import { useToast } from '../ToastContainer';
import { authApi as userAPI } from 'features/auth/api/authApi';

const ForgotPasswordForm = ({ type, identifier, onModeChange }) => {
  const [form] = Form.useForm();
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { showError, showSuccess } = useToast();
  const isEmail = type === 'email';

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    if (countdown > 0) return;
    setSendingCode(true);
    try {
      const res = isEmail
        ? await userAPI.sendVerificationCode(identifier, 'reset_password')
        : await userAPI.sendPhoneCode(identifier, 'reset_password');
      if (res.data.code === 0) {
        setCountdown(60);
      } else {
        showError(res.data.message || '发送验证码失败');
      }
    } catch {
      showError('网络错误，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      const res = isEmail
        ? await userAPI.resetPassword(identifier, values.code, values.password)
        : await userAPI.resetPasswordPhone(identifier, values.code, values.password);
      if (res.data.code === 0) {
        showSuccess('密码重置成功');
        onModeChange(isEmail ? 'login' : 'phone-login');
      } else {
        showError(res.data.message || '重置密码失败');
      }
    } catch {
      showError('网络错误，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-content">
      <div className="auth-headline">
        <h1 className="auth-title">{isEmail ? '重置密码' : '短信重置密码'}</h1>
        <p className="auth-subtitle">{isEmail ? '输入验证码后立刻修改。' : '短信验证码后即可修改。'}</p>
      </div>

      <div className="auth-email-display">
        <span>{identifier}</span>
        <button type="button" className="auth-change-email" onClick={() => onModeChange('welcome')}>更换</button>
      </div>

      <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false}>
        <div className="auth-code-group">
          <Form.Item name="code" noStyle rules={[{ required: true, message: '请输入验证码' }]}>
            <Input placeholder="验证码" maxLength={6} size="large" autoFocus />
          </Form.Item>
          <Button size="large" onClick={handleSendCode} loading={sendingCode} disabled={countdown > 0} style={{ minWidth: 80 }}>
            {countdown > 0 ? `${countdown}秒` : '发送'}
          </Button>
        </div>

        <Form.Item name="password" rules={[
          { required: true, message: '请输入新密码' },
          { min: 8, message: '密码长度至少8位' },
        ]}>
          <Input.Password placeholder="新密码（至少8位）" size="large" />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            { required: true, message: '请确认新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="确认新密码" size="large" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting} block size="large">
            重置密码
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default ForgotPasswordForm;
