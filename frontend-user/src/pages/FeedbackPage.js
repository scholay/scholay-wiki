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
import { Upload, File, Image, Trash2, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import api, { publicApi } from '../services/api';
import { useAuth } from '../utils/AuthContext';
import SEO from '../components/SEO';
import './styles/FeedbackPage.css';

// 文件限制常量
const MAX_FILES = 2;
const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const FeedbackPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]); // 文件附件
  const [images, setImages] = useState([]); // 图片附件
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [uploadKey, setUploadKey] = useState(''); // 上传批次key
  
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // 验证文件大小
  const validateFileSize = (file) => {
    if (file.size > MAX_FILE_SIZE) {
      setError(`文件 "${file.name}" 超过10MB限制`);
      return false;
    }
    return true;
  };

  // 处理文件上传
  const handleFileChange = async (e, type) => {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;

    const currentList = type === 'file' ? files : images;
    const maxCount = type === 'file' ? MAX_FILES : MAX_IMAGES;
    const remaining = maxCount - currentList.length;

    if (remaining <= 0) {
      setError(`最多只能上传${maxCount}个${type === 'file' ? '文件' : '图片'}`);
      return;
    }

    const filesToUpload = selectedFiles.slice(0, remaining);
    
    // 验证文件大小
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
      // 如果已有uploadKey，则使用同一个key
      if (uploadKey) {
        formData.append('uploadKey', uploadKey);
      }

      const response = await publicApi.post('/feedback/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.code === 0) {
        // 保存uploadKey用于后续上传和提交
        if (response.data.data.uploadKey) {
          setUploadKey(response.data.data.uploadKey);
        }

        // 后端返回 attachments 数组，包含 name, url, size, type
        const uploadedFiles = (response.data.data.attachments || response.data.data.files || []).map((f) => ({
          name: f.name,
          url: f.url,
          size: f.size,
          type: f.type, // 'image' 或 'file'
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
      // 清空 input
      e.target.value = '';
    }
  };

  // 删除文件
  const removeFile = (index, type) => {
    if (type === 'file') {
      setFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setImages(prev => prev.filter((_, i) => i !== index));
    }
  };

  // 提交反馈
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // 验证
    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (!content.trim() || content.trim().length < 10) {
      setError('反馈内容至少需要10个字符');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const feedbackData = {
        email: email.trim(),
        content: content.trim(),
        attachmentsKey: uploadKey, // 使用上传时返回的key关联附件
      };

      // 如果用户已登录，使用带认证的API，以便后端关联用户信息
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
    <div className="feedback-page">
      <SEO
        title="意见反馈 - Scholay | 帮助我们改进"
        description="向 Scholay 团队提交您的反馈意见、功能建议或问题报告，帮助我们持续改进学术搜索服务。"
        keywords="Scholay反馈,意见建议,功能建议,问题报告,用户反馈"
        canonical="/feedback"
      />
      <div className="feedback-container">
        <div className="feedback-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
          <h1>意见反馈</h1>
          <p>您的反馈对我们非常重要，我们会认真对待每一条意见</p>
        </div>

        {submitted ? (
          <div className="feedback-success">
            <CheckCircle size={64} className="success-icon" />
            <h2>感谢您的反馈！</h2>
            <p>我们已收到您的意见，会尽快处理并通过邮件回复您。</p>
            <button className="btn-primary" onClick={() => navigate('/')}>
              返回首页
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="feedback-form">
            <div className="form-field">
              <label htmlFor="feedback-email">
                邮箱地址 <span className="required">*</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                placeholder="请输入您的邮箱，我们会通过邮件回复您"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="form-field">
              <label htmlFor="feedback-content">
                反馈内容 <span className="required">*</span>
              </label>
              <textarea
                id="feedback-content"
                placeholder="请详细描述您的问题或建议（至少10个字符）"
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={8}
                maxLength={5000}
                disabled={submitting}
              />
              <div className="char-count">{content.length}/5000</div>
            </div>

            {/* 文件上传区域 */}
            <div className="form-field">
              <label>附件（可选）</label>
              <div className="upload-section">
                {/* 文件上传 */}
                <div className="upload-group">
                  <div className="upload-header">
                    <File size={18} />
                    <span>文件（最多{MAX_FILES}个，每个不超过10MB）</span>
                  </div>
                  <div className="upload-list">
                    {files.map((file, idx) => (
                      <div key={idx} className="upload-item">
                        <File size={16} />
                        <span className="upload-item-name">{file.name}</span>
                        <button 
                          type="button" 
                          className="upload-remove-btn"
                          onClick={() => removeFile(idx, 'file')}
                          disabled={submitting}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {files.length < MAX_FILES && (
                      <button
                        type="button"
                        className="upload-add-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || submitting}
                      >
                        {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                        <span>上传文件</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.zip,.rar"
                    onChange={e => handleFileChange(e, 'file')}
                    style={{ display: 'none' }}
                  />
                </div>

                {/* 图片上传 */}
                <div className="upload-group">
                  <div className="upload-header">
                    <Image size={18} />
                    <span>图片（最多{MAX_IMAGES}张，每张不超过10MB）</span>
                  </div>
                  <div className="upload-images">
                    {images.map((img, idx) => (
                      <div key={idx} className="upload-image-item">
                        <img src={img.url} alt={img.name} />
                        <button 
                          type="button" 
                          className="upload-image-remove"
                          onClick={() => removeFile(idx, 'image')}
                          disabled={submitting}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {images.length < MAX_IMAGES && (
                      <button
                        type="button"
                        className="upload-image-add"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={uploading || submitting}
                      >
                        {uploading ? <Loader2 size={24} className="spin" /> : <Upload size={24} />}
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
            </div>

            {error && <div className="form-error">{error}</div>}

            {isAuthenticated && (
              <div className="form-note">
                已登录用户提交的反馈会关联您的账号信息
              </div>
            )}

            <div className="form-actions">
              <button 
                type="button" 
                className="btn-secondary"
                onClick={() => navigate(-1)}
                disabled={submitting}
              >
                取消
              </button>
              <button 
                type="submit" 
                className="btn-primary"
                disabled={submitting || uploading}
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    <span>提交中...</span>
                  </>
                ) : (
                  '提交反馈'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackPage;

