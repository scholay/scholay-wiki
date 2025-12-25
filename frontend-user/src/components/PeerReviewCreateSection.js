/**
 * 智能审稿 - 创建任务区域组件
 * 左右分栏布局：左侧文本输入，右侧文件上传
 */

import React, { useState } from 'react';
import ModelSelector from './ModelSelector';
import { getFileIcon } from '../utils/peer-review/fileUtils';
import pasteTextGuide from '../assets/images/paste-text-guide.svg';
import uploadFileGuide from '../assets/images/upload-file-guide.svg';

export default function PeerReviewCreateSection({
  manuscriptText, onTextInput,
  targetVenue, onVenueInput,
  fileName, useFileInput,
  attachments,
  uploading, uploadProgress, submitting, isDragging, draftLoading,
  modelLevel, setModelLevel,
  fileInputRef, attachmentInputRef,
  onFileSelect, onAttachmentUpload, onDeleteAttachment,
  onDragEnter, onDragOver, onDragLeave, onDrop,
  onRemoveFile, onSubmit, onClearDraft,
  isLoggedIn, onRequireLogin
}) {
  const hasContent = manuscriptText.trim().length > 0 || !!fileName;
  const [attachmentDragging, setAttachmentDragging] = useState(false);

  // 附件拖拽处理
  const handleAttachmentDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAttachmentDragging(true);
  };

  const handleAttachmentDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAttachmentDragging(true);
  };

  const handleAttachmentDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setAttachmentDragging(false);
  };

  const handleAttachmentDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAttachmentDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && attachments.length < 5) {
      onAttachmentUpload({ target: { files: [file] } });
    }
  };

  return (
    <div className="prv-create-section">
      {/* 头部 */}
      <div className="prv-section-header">
        <div className="prv-section-intro">
          <h2 className="prv-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <path d="M12 18l-2.4-1.2L7 18v-4l2.6 1.3L12 14l2.4 1.3L17 14v4l-2.6-1.2L12 18z"/>
            </svg>
            智能审稿
          </h2>
          <p className="prv-section-desc">上传论文，获取专业审稿意见</p>
        </div>
        <div className="prv-header-right">
          {hasContent && (
            <button className="prv-clear-btn" onClick={onClearDraft}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              清空
            </button>
          )}
        </div>
      </div>

      {/* 输入区域 - 左右分栏 */}
      <InputSplitArea
        manuscriptText={manuscriptText}
        onTextInput={onTextInput}
        fileName={fileName}
        useFileInput={useFileInput}
        uploading={uploading}
        uploadProgress={uploadProgress}
        isDragging={isDragging}
        draftLoading={draftLoading}
        fileInputRef={fileInputRef}
        onFileSelect={onFileSelect}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onRemoveFile={onRemoveFile}
        hasContent={hasContent}
        submitting={submitting}
        onSubmit={onSubmit}
        isLoggedIn={isLoggedIn}
        onRequireLogin={onRequireLogin}
      />

      {/* 底部工具栏 */}
      <ComposerFooter
        modelLevel={modelLevel}
        setModelLevel={setModelLevel}
        targetVenue={targetVenue}
        onVenueInput={onVenueInput}
        isLoggedIn={isLoggedIn}
        onRequireLogin={onRequireLogin}
      />

      {/* 附件区域 */}
      <AttachmentsZone
        attachments={attachments}
        attachmentDragging={attachmentDragging}
        attachmentInputRef={attachmentInputRef}
        onAttachmentUpload={onAttachmentUpload}
        onDeleteAttachment={onDeleteAttachment}
        handleAttachmentDragEnter={handleAttachmentDragEnter}
        handleAttachmentDragOver={handleAttachmentDragOver}
        handleAttachmentDragLeave={handleAttachmentDragLeave}
        handleAttachmentDrop={handleAttachmentDrop}
        isLoggedIn={isLoggedIn}
        onRequireLogin={onRequireLogin}
      />
    </div>
  );
}

// 左右分栏输入区域
function InputSplitArea({
  manuscriptText, onTextInput,
  fileName, useFileInput,
  uploading, uploadProgress, isDragging, draftLoading,
  fileInputRef, onFileSelect,
  onDragEnter, onDragOver, onDragLeave, onDrop,
  onRemoveFile, hasContent, submitting, onSubmit,
  isLoggedIn, onRequireLogin
}) {
  return (
    <div 
      className={`prv-composer-wrapper ${isDragging ? 'prv-dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 上传中遮罩 */}
      {uploading && (
        <div className="prv-upload-overlay">
          <div className="prv-upload-progress">
            <div className="prv-upload-icon-wrapper">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="prv-upload-pulse">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <div className="prv-upload-ring"></div>
            </div>
            <h4>{fileName}</h4>
            <div className="prv-upload-progress-bar">
              <div 
                className="prv-upload-progress-fill" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="prv-upload-progress-text">{uploadProgress}%</p>
          </div>
        </div>
      )}

      {draftLoading ? (
        <div className="prv-draft-loading">
          <div className="prv-spinner-small"></div>
          <span>加载草稿中...</span>
        </div>
      ) : (
        <>
          {/* 文件信息栏 - 上传文件后显示 */}
          {fileName && (
            <div className="prv-file-bar">
              <div className="prv-file-bar-info">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span className="prv-file-bar-name">{fileName}</span>
              </div>
              <button 
                className="prv-file-bar-remove"
                onClick={onRemoveFile}
                title="删除文件"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          <div className={`prv-input-split ${manuscriptText.trim().length > 0 || fileName ? 'has-content' : ''}`}>
            {/* 有文件时 */}
            {fileName ? (
              useFileInput ? (
                // 直传模式（PDF等）：显示文件占位提示
                <div className="prv-input-left prv-file-placeholder">
                  <div className="prv-file-placeholder-content">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <p>文件将直接传递给 AI 进行审稿</p>
                  </div>
                </div>
              ) : (
                // 文本提取模式：显示预览
                <div className="prv-input-left prv-file-preview-area">
                  <textarea
                    className="prv-split-textarea has-content prv-readonly"
                    placeholder="文件内容预览..."
                    value={manuscriptText}
                    readOnly
                  />
                </div>
              )
            ) : (
              <>
                {/* 左侧：文本输入区域 */}
                <LeftTextArea
                  manuscriptText={manuscriptText}
                  onTextInput={onTextInput}
                  fileName={fileName}
                  isLoggedIn={isLoggedIn}
                  onRequireLogin={onRequireLogin}
                />

                {/* 分割线 - 只在空状态显示 */}
                {!manuscriptText.trim() && (
                  <div className="prv-input-divider"></div>
                )}

                {/* 右侧：文件上传区域 - 只在空状态显示 */}
                {!manuscriptText.trim() && (
                  <RightFileArea
                    fileName={fileName}
                    useFileInput={useFileInput}
                    isDragging={isDragging}
                    fileInputRef={fileInputRef}
                    onFileSelect={onFileSelect}
                    onRemoveFile={onRemoveFile}
                    isLoggedIn={isLoggedIn}
                    onRequireLogin={onRequireLogin}
                  />
                )}
              </>
            )}
          </div>
          {/* 底部栏：字符计数 + 提交按钮 */}
          <div className="prv-input-bottom-bar">
            {/* 字符计数 - 只在非直传模式且有输入内容时显示 */}
            {!useFileInput && manuscriptText.length > 0 && (
              <div className="prv-input-char-count">
                <span className={manuscriptText.length > 45000 ? 'prv-char-warning' : ''}>
                  {manuscriptText.length.toLocaleString()}
                </span>
                <span> / 50,000</span>
              </div>
            )}
            {/* 提交按钮 */}
            <button 
              className="prv-submit-btn" 
              onClick={onSubmit}
              disabled={submitting || !hasContent || draftLoading}
            >
              {submitting ? (
                <>
                  <div className="prvr-btn-spinner"></div>
                  审稿中...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  开始审稿
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.doc,.docx,.rtf,.odt,.pdf,.xml,.html,.htm"
        onChange={onFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
}

// 左侧文本输入区域
function LeftTextArea({ manuscriptText, onTextInput, fileName, isLoggedIn, onRequireLogin }) {
  const isDisabled = !!fileName;
  const hasText = manuscriptText.trim().length > 0;
  
  return (
    <div className={`prv-input-left ${isDisabled ? 'prv-disabled' : ''}`}>
      {/* 空状态图例 - 直接使用SVG */}
      {!hasText && !isDisabled && (
        <img src={pasteTextGuide} alt="" className="prv-paste-guide-img" />
      )}
      
      {/* 文本输入框 */}
      <textarea
        className={`prv-split-textarea ${hasText ? 'has-content' : ''}`}
        placeholder=""
        value={manuscriptText}
        onChange={(e) => !isDisabled && onTextInput(e)}
        onFocus={() => !isLoggedIn && onRequireLogin()}
        readOnly={isDisabled}
        maxLength={50000}
      />
    </div>
  );
}

// 右侧文件上传区域
function RightFileArea({
  fileName, useFileInput, isDragging,
  fileInputRef, onFileSelect, onRemoveFile,
  isLoggedIn, onRequireLogin
}) {
  const hasFile = !!fileName;
  
  const handleClick = () => {
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    if (!hasFile) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div 
      className={`prv-input-right ${isDragging ? 'prv-input-right-dragging' : ''} ${hasFile ? 'prv-input-right-uploaded' : ''}`}
      onClick={handleClick}
    >
      {hasFile ? (
        // 已上传状态
        <div className="prv-file-uploaded">
          <div className="prv-file-uploaded-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <p className="prv-file-uploaded-name">{fileName}</p>
          <span className="prv-file-uploaded-badge">已上传</span>
          <button 
            className="prv-file-uploaded-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFile();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            删除文件
          </button>
        </div>
      ) : isDragging ? (
        // 拖拽中状态
        <div className="prv-file-dragging">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p>松开鼠标上传文件</p>
        </div>
      ) : (
        // 默认状态 - 直接使用SVG
        <img src={uploadFileGuide} alt="" className="prv-upload-guide-img" />
      )}
    </div>
  );
}

// 底部工具栏
function ComposerFooter({
  modelLevel, setModelLevel,
  targetVenue, onVenueInput,
  isLoggedIn, onRequireLogin
}) {
  return (
    <div className="prv-composer-footer">
      {/* 左侧：模型选择 */}
      <div className="prv-composer-footer-left">
        <ModelSelector
          value={modelLevel}
          onChange={setModelLevel}
          compact={true}
          allowedModels={['mid', 'high']}
        />
      </div>

      {/* 右侧：目标期刊 */}
      <div className="prv-venue-section">
        <div className="prv-venue-toggle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <input
            type="text"
            className="prv-venue-input"
            placeholder="投稿期刊（可选）"
            value={targetVenue}
            onChange={onVenueInput}
            onFocus={() => !isLoggedIn && onRequireLogin()}
          />
        </div>
      </div>
    </div>
  );
}

// 附件区域
function AttachmentsZone({
  attachments, attachmentDragging, attachmentInputRef,
  onAttachmentUpload, onDeleteAttachment,
  handleAttachmentDragEnter, handleAttachmentDragOver,
  handleAttachmentDragLeave, handleAttachmentDrop,
  isLoggedIn, onRequireLogin
}) {
  const handleClick = (e) => {
    if (e.target.closest('.prv-attachment-chip-remove')) return;
    if (e.target.closest('.prv-attachment-chip.uploading')) return;
    if (!isLoggedIn) {
      onRequireLogin();
      return;
    }
    const uploadedCount = attachments.filter(a => !a.uploading).length;
    if (uploadedCount < 5) {
      attachmentInputRef.current?.click();
    }
  };

  return (
    <div
      className={`prv-attachments-zone ${attachmentDragging ? 'prv-attachments-dragging' : ''} ${attachments.length > 0 ? 'has-attachments' : ''}`}
      onDragEnter={handleAttachmentDragEnter}
      onDragOver={handleAttachmentDragOver}
      onDragLeave={handleAttachmentDragLeave}
      onDrop={handleAttachmentDrop}
      onClick={handleClick}
    >
      {attachmentDragging && (
        <div className="prv-attachments-drag-overlay">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
          <span>松开添加附件</span>
        </div>
      )}

      <div className="prv-attachments-content">
        <div className="prv-attachments-left">
          <div className="prv-attachments-add-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <span>附件</span>
            <span className="prv-attachments-count">{attachments.filter(a => !a.uploading).length}/5</span>
          </div>
          {attachments.length === 0 && (
            <span className="prv-attachments-hint">拖拽或点击添加补充材料</span>
          )}
        </div>

        {attachments.length > 0 && (
          <div className="prv-attachments-list">
            {attachments.map((attachment) => (
              <div key={attachment.id} className={`prv-attachment-chip ${attachment.uploading ? 'uploading' : ''}`}>
                <span className="prv-attachment-chip-icon">
                  {attachment.uploading ? (
                    <div className="prv-chip-spinner"></div>
                  ) : (
                    getFileIcon(attachment.file_ext)
                  )}
                </span>
                <span className="prv-attachment-chip-name" title={attachment.file_name}>
                  {attachment.file_name.length > 15
                    ? attachment.file_name.slice(0, 12) + '...' + attachment.file_name.slice(-5)
                    : attachment.file_name}
                </span>
                {attachment.uploading ? (
                  <span className="prv-attachment-chip-status">上传中</span>
                ) : (
                  <button
                    className="prv-attachment-chip-remove"
                    onClick={() => onDeleteAttachment(attachment.id)}
                    title="删除"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <input
        ref={attachmentInputRef}
        type="file"
        accept=".txt,.doc,.docx,.rtf,.odt,.pdf,.xml,.html,.htm,.xlsx,.xls,.csv,.epub,.py,.js,.ts,.go,.java,.c,.cpp,.h,.rs,.rb,.php,.sql,.json,.yaml,.yml,.md,.r"
        onChange={onAttachmentUpload}
        style={{ display: 'none' }}
      />
    </div>
  );
}

