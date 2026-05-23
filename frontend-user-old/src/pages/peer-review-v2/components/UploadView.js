/**
 * UploadView — 空态/起始页:大块拖拽 + 选择 PDF 入口。
 * PDF-only,20 MiB 上限,与远端对齐。
 */

import React, { useCallback, useRef, useState } from 'react';

const MAX_BYTES = 20 * 1024 * 1024;

const UploadView = ({ onUpload, uploading, error, trialStatus }) => {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const validateAndUpload = useCallback(
    (file) => {
      if (!file) return;
      setLocalErr('');
      const isPDF =
        file.type === 'application/pdf' ||
        /\.pdf$/i.test(file.name);
      if (!isPDF) {
        setLocalErr('只支持 PDF 文件');
        return;
      }
      if (file.size > MAX_BYTES) {
        setLocalErr(`文件超过 20 MiB 上限 (当前 ${(file.size / 1024 / 1024).toFixed(1)} MiB)`);
        return;
      }
      if (file.size === 0) {
        setLocalErr('文件为空');
        return;
      }
      onUpload?.(file);
    },
    [onUpload],
  );

  const onPick = () => inputRef.current?.click();
  const onChange = (e) => validateAndUpload(e.target.files?.[0]);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    validateAndUpload(e.dataTransfer.files?.[0]);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);

  const showTrialWarning = trialStatus && trialStatus.can_trial === false;

  return (
    <div className="prv2-upload-wrap">
      <div className="prv2-upload-hero">
        <h1 className="prv2-upload-title">智能审稿</h1>
        <p className="prv2-upload-sub">
          上传论文 PDF,4 位虚拟审稿人(方法论 / 领域 / 跨学科 / 合并)将并行出具中文审稿意见。
          典型耗时 1-3 分钟。
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        className={`prv2-dropzone ${dragOver ? 'is-drag' : ''} ${uploading ? 'is-busy' : ''}`}
        onClick={uploading ? undefined : onPick}
        onKeyDown={(e) => {
          if (uploading) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPick();
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={uploading ? undefined : onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: 'none' }}
          onChange={onChange}
        />
        <div className="prv2-dropzone-icon" aria-hidden>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="9 15 12 12 15 15" />
          </svg>
        </div>
        <div className="prv2-dropzone-title">
          {uploading ? '上传中…' : '拖拽 PDF 到此处,或点击选择文件'}
        </div>
        <div className="prv2-dropzone-meta">
          仅支持 PDF · 单文件最大 20 MiB · 扫描版/纯图片 PDF 会被远端拒绝
        </div>
      </div>

      {(error || localErr) && (
        <div className="prv2-upload-err">{error || localErr}</div>
      )}

      {showTrialWarning && (
        <div className="prv2-upload-warn">
          今日匿名审稿额度已用完。登录账号可继续使用,或明日再试。
        </div>
      )}
    </div>
  );
};

export default UploadView;
