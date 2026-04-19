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
import { ArrowLeft, Mail, MessageSquare, MapPin, Phone, Send, CheckCircle } from 'lucide-react';
import { publicApi } from '../services/client';
import Logo from '../components/common/Logo';
import SEO from '../components/common/SEO';
import './styles/LegalPage.css';

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
      // 使用反馈 API 提交联系表单
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
    <div className="legal-page">
      <SEO
        title="联系我们 - Scholay | 客服支持与商务合作"
        description="联系 Scholay 团队，获取技术支持、提交反馈或商务合作。邮箱：support@scholay.com，工作时间：周一至周五 9:00-18:00。"
        keywords="联系Scholay,客户支持,技术支持,商务合作,学术搜索客服"
        canonical="/contact"
      />
      <div className="legal-container">
        <div className="legal-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
        </div>

        <div className="legal-hero">
          <div className="legal-logo">
            <Logo size={48} />
          </div>
          <div className="legal-title-wrapper">
            <MessageSquare size={28} className="legal-icon" />
            <h1>联系我们</h1>
          </div>
          <p className="legal-meta">我们期待听到您的声音</p>
        </div>

        <div className="legal-content">
          <div className="contact-section">
            <div className="contact-intro">
              <h2>关于 Scholay 客户服务</h2>
              <p>
                Scholay 团队致力于为每一位用户提供及时、专业的支持服务。无论您是在使用学术搜索功能时遇到技术问题，还是对 AI 分析、智能审稿、ScholayPrism LaTeX 编辑器等功能有使用疑问，亦或是有产品改进的建议，我们都乐于倾听并尽快为您解决。
              </p>
              <p>
                我们的客服团队工作时间为周一至周五 9:00-18:00（中国标准时间）。在工作时间内提交的咨询，我们承诺在 24 小时内给予初步回复；非工作时间提交的留言，将在下一个工作日优先处理。对于涉及账户安全、支付异常等紧急问题，我们将在收到消息后尽快响应。
              </p>
              <h3>我们可以帮助您</h3>
              <ul>
                <li><strong>技术支持</strong> — 账户登录问题、功能使用异常、PDF 预览故障、搜索结果异常等技术相关问题</li>
                <li><strong>订阅咨询</strong> — 订阅方案对比、升级建议、付款问题、退款申请（购买后 7 天内可申请）</li>
                <li><strong>功能建议</strong> — 新功能需求、现有功能改进建议、用户体验优化反馈</li>
                <li><strong>商务合作</strong> — 学术机构合作、API 接入、定制化解决方案、学术会议赞助等</li>
                <li><strong>数据与隐私</strong> — 数据导出请求、账户注销、隐私相关咨询</li>
              </ul>
              <p>
                如果您的问题属于常见问题，建议先查阅我们的
                <button className="contact-inline-link" onClick={() => navigate('/help')}>帮助中心</button>
                ，那里有详细的功能使用指南和 FAQ，也许能帮您快速找到答案。
              </p>
            </div>

            <h2 className="contact-heading">联系方式</h2>
            <div className="contact-cards">
              <div className="contact-card">
                <Mail size={32} className="contact-card-icon" />
                <h3>邮箱</h3>
                <a href="mailto:support@scholay.com">support@scholay.com</a>
              </div>

              <div className="contact-card">
                <MapPin size={32} className="contact-card-icon" />
                <h3>地址</h3>
                <p>中国四川省成都市高新区</p>
                <p className="contact-card-sub">成都恩特罐罐文化科技有限公司</p>
              </div>

              <div className="contact-card">
                <Phone size={32} className="contact-card-icon" />
                <h3>工作时间</h3>
                <p>周一至周五 9:00-18:00</p>
              </div>
            </div>

            <h2 className="contact-heading">在线留言</h2>

            {submitted ? (
              <div className="contact-success">
                <CheckCircle size={64} className="contact-success-icon" />
                <h3>感谢您的留言！</h3>
                <p>我们已收到您的消息，会尽快回复您。</p>
                <button
                  className="contact-success-btn"
                  onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', subject: '', message: '' }); }}
                >
                  发送新消息
                </button>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="contact-form-row">
                  <div className="contact-field">
                    <label>您的姓名 *</label>
                    <input
                      className="contact-input"
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      placeholder="请输入您的姓名"
                    />
                  </div>
                  <div className="contact-field">
                    <label>邮箱地址 *</label>
                    <input
                      className="contact-input"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="请输入您的邮箱"
                    />
                  </div>
                </div>

                <div className="contact-field">
                  <label>主题 *</label>
                  <input
                    className="contact-input"
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    placeholder="请输入消息主题"
                  />
                </div>

                <div className="contact-field">
                  <label>消息内容 *</label>
                  <textarea
                    className="contact-textarea"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={6}
                    placeholder="请输入您想告诉我们的内容..."
                  />
                </div>

                {error && (
                  <p className="contact-error">{error}</p>
                )}

                <button
                  className="contact-submit"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? '发送中...' : <><Send size={18} /> 发送消息</>}
                </button>
              </form>
            )}
          </div>
        </div>


      </div>
    </div>
  );
};

export default ContactPage;
