/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, MessageSquare, MapPin, Clock, Send, CheckCircle } from 'lucide-react';
import { publicApi } from '../services/client';
import Logo from '../components/common/Logo';
import SEO from '../components/common/SEO';
import './styles/pr-editorial.css';

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface AxiosLikeError {
  response?: { data?: { message?: string } };
}

const ContactPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await publicApi.post('/feedback', {
        email: formData.email.trim(),
        content: `[联系表单] 姓名: ${formData.name}\n主题: ${formData.subject}\n\n${formData.message}`,
      });

      if (response.data.code === 0) {
        setSubmitted(true);
      } else {
        setError(response.data.message || '发送失败，请稍后重试');
      }
    } catch (err) {
      setError((err as AxiosLikeError).response?.data?.message || '发送失败，请稍后重试或直接发送邮件至 support@scholay.com');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pe-page">
      <SEO
        title="联系我们 - Scholay | 客服支持与商务合作"
        description="联系 Scholay 团队，获取技术支持、提交反馈或商务合作。邮箱：support@scholay.com，工作时间：周一至周五 9:00-18:00。"
        keywords="联系Scholay,客户支持,技术支持,商务合作,学术搜索客服"
        canonical="/contact"
      />

      <div className="pe-topbar">
        <div className="pe-topbar-inner">
          <button className="pe-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>返回</span>
          </button>
          <button className="pe-brand" onClick={() => navigate('/')} aria-label="Scholay 首页">
            <Logo size={26} />
            <span>Scholay</span>
          </button>
        </div>
      </div>

      <section className="pe-hero pe-hero-sm">
        <div className="pe-hero-bg" />
        <div className="pe-container-sm">
          <span className="pe-hero-eyebrow">
            <MessageSquare size={12} />
            <span>Contact</span>
          </span>
          <h1>我们期待听到您的声音</h1>
          <p className="pe-hero-lead">
            技术支持、功能建议、商务合作——无论哪一类问题，都可以通过以下方式与我们取得联系。
          </p>
        </div>
      </section>

      {/* 联系方式 */}
      <section className="pe-section">
        <div className="pe-container">
          <div className="pe-section-head-center">
            <div className="pe-section-eyebrow">Reach us</div>
            <h2>联系方式</h2>
            <p>工作日 24 小时内回复，紧急问题请直接发送邮件。</p>
          </div>
          <div className="pe-contact-cards">
            <div className="pe-contact-card">
              <div className="pe-contact-card-icon"><Mail size={18} /></div>
              <h3>邮箱</h3>
              <a href="mailto:support@scholay.com">support@scholay.com</a>
              <span className="pe-contact-card-sub">推荐沟通方式</span>
            </div>
            <div className="pe-contact-card">
              <div className="pe-contact-card-icon"><MapPin size={18} /></div>
              <h3>地址</h3>
              <p>中国四川省成都市高新区</p>
              <span className="pe-contact-card-sub">Scholay 团队</span>
            </div>
            <div className="pe-contact-card">
              <div className="pe-contact-card-icon"><Clock size={18} /></div>
              <h3>工作时间</h3>
              <p>周一至周五 9:00 – 18:00</p>
              <span className="pe-contact-card-sub">中国标准时间 · 节假日除外</span>
            </div>
          </div>
        </div>
      </section>

      {/* 服务说明 */}
      <section className="pe-section pe-section-alt">
        <div className="pe-container-sm">
          <div className="pe-info">
            <h2>我们可以帮助您</h2>
            <ul>
              <li><strong>技术支持</strong> — 账户登录、功能异常、PDF 预览、搜索结果异常等</li>
              <li><strong>订阅咨询</strong> — 方案对比、升级建议、付款问题、退款申请（7 天内）</li>
              <li><strong>功能建议</strong> — 新功能需求、现有功能改进、用户体验优化反馈</li>
              <li><strong>商务合作</strong> — 学术机构合作、API 接入、定制化方案、会议赞助</li>
              <li><strong>数据与隐私</strong> — 数据导出请求、账户注销、隐私相关咨询</li>
            </ul>
            <p>
              提交后请耐心等待，我们承诺工作日 24 小时内给予初步回复；如属常见问题，您也可以先查阅
              <button className="pe-link" onClick={() => navigate('/help')}>帮助中心</button>
              。
            </p>
          </div>
        </div>
      </section>

      {/* 在线留言 */}
      <section className="pe-section">
        <div className="pe-container-sm">
          <div className="pe-section-head-center">
            <div className="pe-section-eyebrow">Message</div>
            <h2>在线留言</h2>
            <p>不便发邮件？直接在下方留言，我们会将回复发送至您填写的邮箱。</p>
          </div>

          {submitted ? (
            <div className="pe-success">
              <CheckCircle size={48} className="pe-success-icon" />
              <h3>感谢您的留言！</h3>
              <p>我们已收到您的消息，会尽快回复您。</p>
              <button
                className="pe-btn pe-btn-ghost"
                onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', subject: '', message: '' }); }}
              >
                发送新消息
              </button>
            </div>
          ) : (
            <form className="pe-form" onSubmit={handleSubmit}>
              <div className="pe-form-row">
                <div className="pe-field">
                  <label>您的姓名<span className="pe-required">*</span></label>
                  <input
                    className="pe-input"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="请输入您的姓名"
                  />
                </div>
                <div className="pe-field">
                  <label>邮箱地址<span className="pe-required">*</span></label>
                  <input
                    className="pe-input"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div className="pe-field">
                <label>主题<span className="pe-required">*</span></label>
                <input
                  className="pe-input"
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                  placeholder="请简要概括您的问题或诉求"
                />
              </div>

              <div className="pe-field">
                <label>消息内容<span className="pe-required">*</span></label>
                <textarea
                  className="pe-textarea"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={6}
                  placeholder="请详细描述您想告诉我们的内容..."
                />
              </div>

              {error && <p className="pe-field-error">{error}</p>}

              <div className="pe-form-actions">
                <button className="pe-btn pe-btn-primary pe-btn-lg" type="submit" disabled={loading}>
                  {loading ? '发送中...' : <><Send size={16} /> 发送消息</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <div className="pe-page-end">
        <p>© {new Date().getFullYear()} Scholay</p>
        <div className="pe-page-end-links">
          <button onClick={() => navigate('/about')}>关于我们</button>
          <button onClick={() => navigate('/privacy')}>隐私政策</button>
          <button onClick={() => navigate('/terms')}>服务条款</button>
          <button onClick={() => navigate('/disclaimer')}>免责声明</button>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
