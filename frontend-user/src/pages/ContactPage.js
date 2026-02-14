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
import { publicApi } from '../services/api';
import Logo from '../components/Logo';
import SEO from '../components/SEO';
import './styles/LegalPage.css';

const ContactPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
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
      setError(err.response?.data?.message || '发送失败，请稍后重试或直接发送邮件至 support@scholay.com');
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
            <h2 style={{ color: '#fff', marginBottom: '20px', fontSize: '1.3rem' }}>联系方式</h2>
            <div className="contact-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              <div className="contact-card" style={{ background: '#2a2a2a', padding: '24px', borderRadius: '12px', textAlign: 'center' }}>
                <Mail size={32} style={{ color: '#64b5f6', marginBottom: '12px' }} />
                <h3 style={{ color: '#fff', marginBottom: '8px', fontSize: '1.1rem' }}>邮箱</h3>
                <a href="mailto:support@scholay.com" style={{ color: '#9e9e9e', textDecoration: 'none' }}>support@scholay.com</a>
              </div>
              
              <div className="contact-card" style={{ background: '#2a2a2a', padding: '24px', borderRadius: '12px', textAlign: 'center' }}>
                <MapPin size={32} style={{ color: '#64b5f6', marginBottom: '12px' }} />
                <h3 style={{ color: '#fff', marginBottom: '8px', fontSize: '1.1rem' }}>地址</h3>
                <p style={{ color: '#9e9e9e', margin: 0 }}>中国四川省成都市高新区</p>
                <p style={{ color: '#757575', margin: '4px 0 0', fontSize: '0.85rem' }}>成都恩特罐罐文化科技有限公司</p>
              </div>
              
              <div className="contact-card" style={{ background: '#2a2a2a', padding: '24px', borderRadius: '12px', textAlign: 'center' }}>
                <Phone size={32} style={{ color: '#64b5f6', marginBottom: '12px' }} />
                <h3 style={{ color: '#fff', marginBottom: '8px', fontSize: '1.1rem' }}>工作时间</h3>
                <p style={{ color: '#9e9e9e', margin: 0 }}>周一至周五 9:00-18:00</p>
              </div>
            </div>

            <h2 style={{ color: '#fff', marginBottom: '20px', fontSize: '1.3rem' }}>在线留言</h2>
            
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: '#2a2a2a', borderRadius: '12px' }}>
                <CheckCircle size={64} style={{ color: '#4caf50', marginBottom: '20px' }} />
                <h3 style={{ color: '#fff', marginBottom: '12px' }}>感谢您的留言！</h3>
                <p style={{ color: '#9e9e9e' }}>我们已收到您的消息，会尽快回复您。</p>
                <button 
                  onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', subject: '', message: '' }); }}
                  style={{ marginTop: '20px', padding: '10px 24px', background: '#64b5f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  发送新消息
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ background: '#2a2a2a', padding: '30px', borderRadius: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', color: '#9e9e9e', marginBottom: '8px', fontSize: '0.9rem' }}>您的姓名 *</label>
                    <input 
                      type="text" 
                      name="name" 
                      value={formData.name}
                      onChange={handleChange}
                      required
                      style={{ width: '100%', padding: '12px', background: '#333', border: '1px solid #424242', borderRadius: '8px', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' }}
                      placeholder="请输入您的姓名"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#9e9e9e', marginBottom: '8px', fontSize: '0.9rem' }}>邮箱地址 *</label>
                    <input 
                      type="email" 
                      name="email" 
                      value={formData.email}
                      onChange={handleChange}
                      required
                      style={{ width: '100%', padding: '12px', background: '#333', border: '1px solid #424242', borderRadius: '8px', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' }}
                      placeholder="请输入您的邮箱"
                    />
                  </div>
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#9e9e9e', marginBottom: '8px', fontSize: '0.9rem' }}>主题 *</label>
                  <input 
                    type="text" 
                    name="subject" 
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    style={{ width: '100%', padding: '12px', background: '#333', border: '1px solid #424242', borderRadius: '8px', color: '#fff', fontSize: '1rem', boxSizing: 'border-box' }}
                    placeholder="请输入消息主题"
                  />
                </div>
                
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', color: '#9e9e9e', marginBottom: '8px', fontSize: '0.9rem' }}>消息内容 *</label>
                  <textarea 
                    name="message" 
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={6}
                    style={{ width: '100%', padding: '12px', background: '#333', border: '1px solid #424242', borderRadius: '8px', color: '#fff', fontSize: '1rem', resize: 'vertical', boxSizing: 'border-box' }}
                    placeholder="请输入您想告诉我们的内容..."
                  />
                </div>
                
                {error && (
                  <p style={{ color: '#ef5350', fontSize: '0.9rem', marginBottom: '16px', padding: '10px', background: 'rgba(239,83,80,0.1)', borderRadius: '8px' }}>
                    {error}
                  </p>
                )}

                <button 
                  type="submit" 
                  disabled={loading}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%', 
                    padding: '14px', 
                    background: loading ? '#424242' : '#64b5f6', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s'
                  }}
                >
                  {loading ? '发送中...' : <><Send size={18} /> 发送消息</>}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="legal-footer">
          <p className="copyright">
            © {new Date().getFullYear()} Scholay. All rights reserved.
          </p>
          <div className="footer-links">
            <button onClick={() => navigate('/about')}>关于我们</button>
            <span>|</span>
            <button onClick={() => navigate('/privacy')}>隐私政策</button>
            <span>|</span>
            <button onClick={() => navigate('/terms')}>服务条款</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
