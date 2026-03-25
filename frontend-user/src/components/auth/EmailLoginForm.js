/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * EmailLoginForm - 邮箱密码登录（email 已确认存在）
 */

import React, { useRef, useState } from 'react';
import { Form, Input, Button, Checkbox } from 'antd';
import TurnstileCaptcha from '../TurnstileCaptcha';
import { useToast } from '../ToastContainer';
import { userAPI } from '../../services/api';

const EmailLoginForm = ({ email, config, onLoginSuccess, onModeChange, onShowPolicy }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(config.enableTurnstile ? '' : 'disabled');
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const captchaRef = useRef(null);
  const { showError } = useToast();

  const resetCaptcha = () => {
    setTurnstileToken(config.enableTurnstile ? '' : 'disabled');
    captchaRef.current?.reset();
  };

  const handleSubmit = async (values) => {
    if (config.enableTurnstile && !turnstileToken) {
      showError('请完成人机验证');
      return;
    }
    if (!agreedToPolicy) {
      showError('请阅读并同意使用条款和隐私政策');
      return;
    }

    setLoading(true);
    try {
      const res = await userAPI.login(email, values.password, turnstileToken);
      if (res.data.code === 0) {
        onLoginSuccess(res.data.data.token, res.data.data.user);
      } else {
        showError(res.data.message || '登录失败');
        resetCaptcha();
      }
    } catch {
      showError('网络错误，请稍后重试');
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-content">
      <div className="auth-headline">
        <h1 className="auth-title">输入密码</h1>
      </div>

      <div className="auth-email-display">
        <span>{email}</span>
        <button type="button" className="auth-change-email" onClick={() => onModeChange('welcome')}>编辑</button>
      </div>

      <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false}>
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password placeholder="密码" size="large" autoFocus />
        </Form.Item>

        <div className="auth-forgot-password">
          <Button type="link" size="small" onClick={() => onModeChange('forgot-password-email')}>
            忘记了密码?
          </Button>
        </div>

        <Form.Item>
          <TurnstileCaptcha
            ref={captchaRef}
            onSuccess={setTurnstileToken}
            onFail={() => setTurnstileToken('')}
            onExpire={() => setTurnstileToken('')}
          />
        </Form.Item>

        <Form.Item>
          <Checkbox checked={agreedToPolicy} onChange={(e) => setAgreedToPolicy(e.target.checked)}>
            我已阅读并同意
            <Button type="link" size="small" onClick={() => onShowPolicy('terms')}>使用条款</Button>
            和
            <Button type="link" size="small" onClick={() => onShowPolicy('privacy')}>隐私政策</Button>
          </Checkbox>
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            disabled={(config.enableTurnstile && !turnstileToken) || !agreedToPolicy}
            block
            size="large"
          >
            登录
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default EmailLoginForm;
