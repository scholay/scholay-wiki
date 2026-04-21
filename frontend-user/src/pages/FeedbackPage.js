/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, File as FileIcon, Image as ImageIcon, Trash2, Loader2,
  CheckCircle, ArrowLeft, MessageSquare, Send
} from 'lucide-react';
import api, { publicApi } from '../services/client';
import { useAuth } from '../utils/AuthContext';
import Logo from '../components/common/Logo';
import SEO from '../components/common/SEO';
import './styles/pr-editorial.css';

const MAX_FILES = 2;
const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const FeedbackPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [uploadKey, setUploadKey] = useState('');

  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const validateFileSize = (file) => {
    if (file.size > MAX_FILE_SIZE) {
      setError(`文件 "${file.name}" 超过 10MB 限制`);
      return false;
    }
    return true;
  };

  const handleFileChange = async (e, type) => {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;

    const currentList = type === 'file' ? files : images;
    const maxCount = type === 'file' ? MAX_FILES : MAX_IMAGES;
    const remaining = maxCount - currentList.length;

    if (remaining <= 0) {
      setError(`最多只能上传 ${maxCount} 个${type === 'file' ? '文件' : '图片'}`);
      return;
    }

    const filesToUpload = selectedFiles.slice(0, remaining);

    for (const file of filesToUpload) {
      if (!validateFileSize(file)) return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      filesToUpload.forEach(file => {
        formData.append('files', file);
      });
      if (uploadKey) {
        formData.append('uploadKey', uploadKey);
      }

      const response = await publicApi.post('/feedback/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.code === 0) {
        if (response.data.data.uploadKey) {
          setUploadKey(response.data.data.uploadKey);
        }

        const uploadedFiles = (response.data.data.attachments || response.data.data.files || []).map((f) => ({
          name: f.name,
          url: f.url,
          size: f.size,
          type: f.type,
        }));

        if (type === 'file') {
          setFiles(prev => [...prev, ...uploadedFiles]);
        } else {
          setImages(prev => [...prev, ...uploadedFiles]);
        }
      } else {
        setError(response.data.message || '上传失败');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.message || '上传失败，请重试');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeFile = (index, type) => {
    if (type === 'file') {
      setFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setImages(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (!content.trim() || content.trim().length < 10) {
      setError('反馈内容至少需要 10 个字符');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const feedbackData = {
        email: email.trim(),
        content: content.trim(),
        attachmentsKey: uploadKey,
      };

      const response = isAuthenticated
        ? await api.post('/user/feedback', feedbackData)
        : await publicApi.post('/feedback', feedbackData);

      if (response.data.code === 0) {
        setSubmitted(true);
      } else {
        setError(response.data.message || '提交失败');
      }
    } catch (err) {
      console.error('Submit error:', err);
      setError(err.response?.data?.message || '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pe-page">
      <SEO
        title="意见反馈 - Scholay | 帮助我们改进"
        description="向 Scholay 团队提交您的反馈意见、功能建议或问题报告，帮助我们持续改进学术搜索服务。"
        keywords="Scholay反馈,意见建议,功能建议,问题报告,用户反馈"
        canonical="/feedback"
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
            <span>Feedback</span>
          </span>
          <h1>意见反馈</h1>
          <p className="pe-hero-lead">
            您的每一条反馈都会被认真阅读和处理——这是我们持续改进 Scholay 最重要的动力。
          </p>
        </div>
      </section>

      {/* 反馈说明 */}
      <section className="pe-section">
        <div className="pe-container-sm">
          <div className="pe-info">
            <h2>我们如何处理您的反馈</h2>
            <p>
              Scholay 团队非常重视每一位用户的意见和建议。提交反馈后，我们会在 1–3 个工作日内通过邮件回复您。
              如果您的建议被采纳，我们会在后续版本更新中致谢；对于 Bug 报告，修复后我们会通知您确认问题已解决。
            </p>
            <h3>反馈类型指南</h3>
            <ul>
              <li><strong>功能建议</strong> — 希望 Scholay 新增哪些功能，或现有功能如何改进。</li>
              <li><strong>Bug 报告</strong> — 使用中遇到的异常、错误或崩溃。请尽量附带操作步骤和截图。</li>
              <li><strong>使用体验</strong> — 对界面设计、交互流程、加载速度等方面的优化建议。</li>
              <li><strong>内容质量</strong> — 对搜索相关性、AI 分析准确度、翻译质量等方面的反馈。</li>
            </ul>
            <p>
              您也可以直接发送邮件至 <a href="mailto:support@scholay.com">support@scholay.com</a>，
              或访问 <button className="pe-link" onClick={() => navigate('/contact')}>联系我们</button> 页面了解更多方式。
            </p>
          </div>
        </div>
      </section>

      {/* 表单 */}
      <section className="pe-section pe-section-alt">
        <div className="pe-container-sm">
          {submitted ? (
            <div className="pe-success">
              <CheckCircle size={48} className="pe-success-icon" />
              <h3>感谢您的反馈！</h3>
              <p>我们已收到您的意见，会尽快处理并通过邮件回复您。</p>
              <button className="pe-btn pe-btn-primary" onClick={() => navigate('/')}>
                返回首页
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="pe-form">
              <div className="pe-field">
                <label htmlFor="feedback-email">
                  邮箱地址<span className="pe-required">*</span>
                </label>
                <input
                  id="feedback-email"
                  className="pe-input"
                  type="email"
                  placeholder="请输入您的邮箱，我们会通过邮件回复您"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="pe-field">
                <label htmlFor="feedback-content">
                  反馈内容<span className="pe-required">*</span>
                </label>
                <textarea
                  id="feedback-content"
                  className="pe-textarea"
                  placeholder="请详细描述您的问题或建议（至少 10 个字符）"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={8}
                  maxLength={5000}
                  disabled={submitting}
                />
                <div className="pe-field-char">{content.length}/5000</div>
              </div>

              <div className="pe-field">
                <label>附件（可选）</label>

                <div className="pe-upload-group">
                  <div className="pe-upload-head">
                    <FileIcon size={16} />
                    <span>文件（最多 {MAX_FILES} 个，每个不超过 10MB）</span>
                  </div>
                  <div className="pe-upload-list">
                    {files.map((file, idx) => (
                      <div key={idx} className="pe-upload-item">
                        <FileIcon size={14} />
                        <span className="pe-upload-item-name">{file.name}</span>
                        <button
                          type="button"
                          className="pe-upload-remove"
                          onClick={() => removeFile(idx, 'file')}
                          disabled={submitting}
                          aria-label="移除文件"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {files.length < MAX_FILES && (
                    <button
                      type="button"
                      className="pe-upload-add"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || submitting}
                    >
                      {uploading ? <Loader2 size={14} className="pe-spin" /> : <Upload size={14} />}
                      <span>上传文件</span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.zip,.rar"
                    onChange={e => handleFileChange(e, 'file')}
                    style={{ display: 'none' }}
                  />
                </div>

                <div className="pe-upload-group" style={{ marginTop: 10 }}>
                  <div className="pe-upload-head">
                    <ImageIcon size={16} />
                    <span>图片（最多 {MAX_IMAGES} 张，每张不超过 10MB）</span>
                  </div>
                  <div className="pe-upload-images">
                    {images.map((img, idx) => (
                      <div key={idx} className="pe-upload-image">
                        <img src={img.url} alt={img.name} loading="lazy" />
                        <button
                          type="button"
                          className="pe-upload-image-rm"
                          onClick={() => removeFile(idx, 'image')}
                          disabled={submitting}
                          aria-label="移除图片"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {images.length < MAX_IMAGES && (
                      <button
                        type="button"
                        className="pe-upload-image-add"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={uploading || submitting}
                        aria-label="添加图片"
                      >
                        {uploading ? <Loader2 size={22} className="pe-spin" /> : <Upload size={22} />}
                      </button>
                    )}
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={e => handleFileChange(e, 'image')}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              {error && <p className="pe-field-error">{error}</p>}

              {isAuthenticated && (
                <p className="pe-form-note">
                  已登录用户提交的反馈会关联您的账号信息，方便我们更精准地协助您。
                </p>
              )}

              <div className="pe-form-actions">
                <button
                  type="button"
                  className="pe-btn pe-btn-ghost"
                  onClick={() => navigate(-1)}
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="pe-btn pe-btn-primary pe-btn-lg"
                  disabled={submitting || uploading}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="pe-spin" />
                      <span>提交中...</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>提交反馈</span>
                    </>
                  )}
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
          <button onClick={() => navigate('/contact')}>联系我们</button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPage;
