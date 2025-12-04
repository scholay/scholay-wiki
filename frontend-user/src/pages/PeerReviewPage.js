/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { peerReviewAPI } from '../services/api';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import ModelSelector from '../components/ModelSelector';
import MarkdownRenderer from '../components/MarkdownRenderer';
import MessageModal from '../components/MessageModal';
import './styles/PeerReviewPage.css';
import './styles/ReviewReport.css';

// 任务状态映射
const STATUS_MAP = {
  draft: { label: '草稿', color: 'gray' },
  pending: { label: '等待处理', color: 'orange' },
  processing: { label: '处理中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
};

// 右侧抽屉组件
function RightDrawer({ isOpen, onClose, title, icon, children }) {
  if (!isOpen) return null;
  
  return ReactDOM.createPortal(
    <div className="prvr-drawer-overlay" onClick={onClose}>
      <div 
        className={`prvr-drawer ${isOpen ? 'open' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prvr-drawer-header">
          <div className="prvr-drawer-title">
            {icon}
            <span>{title}</span>
          </div>
          <button className="prvr-drawer-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="prvr-drawer-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// 内容预览卡片组件（带弹窗）
function PreviewCard({ preview, fullText }) {
  const [showPopup, setShowPopup] = useState(false);
  const [popupStyle, setPopupStyle] = useState({});
  const btnRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  const calculatePosition = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // 弹窗宽度和高度
      const popupWidth = 500;
      const popupMaxHeight = Math.min(500, viewportHeight - 100);
      
      // 计算位置：在按钮右侧，顶部对齐
      let left = rect.right + 16;
      let top = Math.max(60, rect.top - 100);
      
      // 如果右侧空间不够，放在左侧
      if (left + popupWidth > viewportWidth - 20) {
        left = rect.left - popupWidth - 16;
      }
      
      // 确保不超出底部
      if (top + popupMaxHeight > viewportHeight - 20) {
        top = viewportHeight - popupMaxHeight - 20;
      }
      
      setPopupStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${popupWidth}px`,
        maxHeight: `${popupMaxHeight}px`,
        zIndex: 99999,
      });
    }
  };

  const handleMouseEnter = () => {
    // 清除隐藏定时器
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    calculatePosition();
    setShowPopup(true);
  };

  const handleMouseLeave = () => {
    // 延迟隐藏，给用户时间移动到弹窗上
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopup(false);
    }, 150);
  };

  const handlePopupMouseEnter = () => {
    // 鼠标进入弹窗，取消隐藏
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handlePopupMouseLeave = () => {
    // 鼠标离开弹窗，延迟隐藏
    hideTimeoutRef.current = setTimeout(() => {
      setShowPopup(false);
    }, 100);
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="prvr-card prvr-preview-card">
      <div className="prvr-card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        内容预览
      </div>
      <div className="prvr-preview">
        {preview}
      </div>
      {fullText && fullText.length > 100 && (
        <div className="prvr-preview-more">
          <span 
            ref={btnRef}
            className="prvr-preview-more-btn"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            查看全部
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17l9.2-9.2M17 17V7H7"/>
            </svg>
          </span>
          {showPopup && ReactDOM.createPortal(
            <div 
              className="prvr-preview-popup-portal"
              style={popupStyle}
              onMouseEnter={handlePopupMouseEnter}
              onMouseLeave={handlePopupMouseLeave}
            >
              <div className="prvr-preview-popup-content">
                {fullText}
              </div>
            </div>,
            document.body
          )}
        </div>
      )}
    </div>
  );
}

// 视图模式
const VIEW_MODE = {
  HOME: 'home',       // 主页（创建+列表）
  DETAIL: 'detail',   // 任务详情
};

// 截取字符串（按字符数，不截断中文）
const truncateString = (str, maxLen) => {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
};

export default function PeerReviewPage() {
  const navigate = useNavigate();
  const { sidebarCollapsed, openMobileSidebar, isMobile } = useOutletContext() || {};
  const { user, openLoginModal } = useAuth();
  const { resetSidebarConfig } = useSidebar();

  // 进入页面时清空侧边栏历史记录
  useEffect(() => {
    resetSidebarConfig();
  }, [resetSidebarConfig]);

  // 视图状态
  const [viewMode, setViewMode] = useState(VIEW_MODE.HOME);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  // 任务列表状态
  const [tasks, setTasks] = useState([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // 草稿状态（从后端加载）
  const [draftId, setDraftId] = useState(null);
  const [inputType, setInputType] = useState('text');
  const [manuscriptText, setManuscriptText] = useState('');
  const [targetVenue, setTargetVenue] = useState('');
  const [modelLevel, setModelLevel] = useState('low'); // 默认普通模式
  const [fileName, setFileName] = useState('');
  const [useFileInput, setUseFileInput] = useState(false); // 是否直接使用文件（不提取文本，如PDF、Word等）
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);

  // 任务详情状态
  const [taskDetail, setTaskDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 弹窗状态
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null });

  // 轮询和防抖相关
  const pollingRef = useRef(null);
  const fileInputRef = useRef(null);
  const saveDraftTimeoutRef = useRef(null);

  // 显示弹窗
  const showMessage = (type, title, message) => {
    setModal({ isOpen: true, type, title, message, onConfirm: null });
  };

  // 显示确认弹窗
  const showConfirm = (title, message, onConfirm) => {
    setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  };

  // 关闭弹窗
  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  // 从后端加载草稿
  const loadDraft = async () => {
    if (!user) return;
    
    setDraftLoading(true);
    try {
      const response = await peerReviewAPI.getDraft();
      if (response.data?.code === 0) {
        const draft = response.data.data;
        setDraftId(draft.id);
        setInputType(draft.input_type || 'text');
        setManuscriptText(draft.manuscript_text || '');
        setTargetVenue(draft.target_venue || '');
        setModelLevel(draft.model_level || 'low');
        // 新结构：从 manuscript_file 获取文件信息
        if (draft.manuscript_file) {
          setFileName(draft.manuscript_file.file_name || '');
          setUseFileInput(draft.manuscript_file.process_mode === 'direct');
        } else {
          setFileName('');
          setUseFileInput(false);
        }
      }
    } catch (error) {
      console.error('加载草稿失败:', error);
    } finally {
      setDraftLoading(false);
    }
  };

  // 保存草稿到后端（防抖）
  const saveDraftToServer = async (data) => {
    if (!user) return;
    
    try {
      await peerReviewAPI.saveDraft(data);
    } catch (error) {
      console.error('保存草稿失败:', error);
    }
  };

  // 防抖保存草稿
  const debouncedSaveDraft = (data) => {
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
    }
    saveDraftTimeoutRef.current = setTimeout(() => {
      saveDraftToServer(data);
    }, 1000); // 1秒防抖
  };

  // 当草稿内容变化时自动保存
  useEffect(() => {
    if (!user || draftLoading) return;
    
    debouncedSaveDraft({
      input_type: inputType,
      manuscript_text: manuscriptText,
      target_venue: targetVenue,
      model_level: modelLevel,
      file_name: fileName,
    });
  }, [inputType, manuscriptText, targetVenue, modelLevel, fileName, user, draftLoading]);

  // 初始加载：获取草稿和任务列表
  useEffect(() => {
    if (!user) return;
    loadDraft();
    loadTasks();
  }, [user]);

  // 分页变化时重新加载任务列表
  useEffect(() => {
    if (!user) return;
    loadTasks();
  }, [currentPage]);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // 加载任务列表
  const loadTasks = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const response = await peerReviewAPI.getTaskList(currentPage, 10);
      if (response.data?.code === 0) {
        setTasks(response.data.data.tasks || []);
        setTotalTasks(response.data.data.total || 0);
      }
    } catch (error) {
      console.error('加载任务列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 验证文件
  const validateFile = (file) => {
    if (!file) return null;

    // 检查文件类型
    const allowedTypes = ['.txt', '.doc', '.docx', '.rtf', '.odt', '.pdf', '.xml', '.html', '.htm'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(ext)) {
      showMessage('warning', '文件类型不支持', '请上传 txt、doc、docx、rtf、odt、pdf、xml 或 html 文件');
      return null;
    }

    // 检查文件大小
    if (file.size > 10 * 1024 * 1024) {
      showMessage('warning', '文件过大', '文件大小不能超过 10MB');
      return null;
    }

    return file;
  };

  // 上传文件（解析并保存到草稿）
  const uploadFile = async (file) => {
    if (!user) {
      showMessage('warning', '请先登录', '上传文件需要登录');
      openLoginModal();
      return;
    }

    setUploading(true);
    try {
      const response = await peerReviewAPI.uploadFile(file);
      if (response.data?.code === 0) {
        const data = response.data.data;
        // 文件上传后，后端会自动保存到草稿，更新本地状态
        setInputType('file');
        setFileName(data.file_name || file.name);
        // 新结构：process_mode 为 'direct' 表示直接传AI
        const isDirect = data.process_mode === 'direct';
        setUseFileInput(isDirect);
        
        // 文件直传模式（PDF、Word等）不提取文本，使用预览信息
        if (isDirect) {
          setManuscriptText(data.content_preview || '');
        } else {
          // 重新加载草稿以获取提取的文本
          await loadDraft();
        }
        
        // 上传成功不弹窗，直接显示在输入框中
      } else {
        showMessage('error', '上传失败', response.data?.message || '文件上传失败');
      }
    } catch (error) {
      console.error('文件上传失败:', error);
      showMessage('error', '上传失败', error.response?.data?.message || error.message);
    } finally {
      setUploading(false);
    }
  };

  // 文件选择处理
  const handleFileSelect = async (e) => {
    const file = validateFile(e.target.files[0]);
    if (file) {
      await uploadFile(file);
    }
    // 清空 input 以便重新选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 拖拽上传处理
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开上传区域时才取消拖拽状态
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = validateFile(e.dataTransfer.files[0]);
    if (file) {
      await uploadFile(file);
    }
  };

  // 提交草稿开始审稿
  const handleSubmitDraft = async () => {
    if (!user) {
      openLoginModal();
      return;
    }

    // 验证输入（文件直传模式跳过文本长度验证）
    if (!useFileInput) {
      if (!manuscriptText.trim()) {
        showMessage('warning', '请输入内容', '请输入或上传稿件内容后再开始审稿');
        return;
      }

      if (manuscriptText.trim().length < 100) {
        showMessage('warning', '内容太短', '稿件内容至少需要100个字符');
        return;
      }
    } else if (!fileName) {
      showMessage('warning', '请上传文件', '请上传稿件文件后再开始审稿');
      return;
    }

    setSubmitting(true);
    try {
      const response = await peerReviewAPI.submitDraft(targetVenue, modelLevel);
      if (response.data?.code === 0) {
        const taskId = response.data.data.task_id;
        
        // 立即构建初始任务对象，让页面能快速显示
        const initialTask = {
          id: taskId,
          status: 'pending',
          progress: 0,
          progress_stage: '等待处理',
          input_type: fileName ? 'file' : 'text',
          file_name: fileName || '',
          manuscript_text: manuscriptText,
          target_venue: targetVenue,
          model_level: modelLevel,
          created_at: new Date().toISOString(),
        };
        
        // 清空本地草稿状态
        clearDraft();
        
        // 先设置初始任务数据，让左侧信息立即显示
        setTaskDetail(initialTask);
        setSelectedTaskId(taskId);
        setViewMode(VIEW_MODE.DETAIL);
        
        // 启动轮询获取进度
        startPolling(taskId);
        
        // 刷新列表
        loadTasks();
        
        // 异步加载完整任务详情（不显示 loading）
        setTimeout(() => loadTaskDetail(taskId, false), 500);
      } else {
        showMessage('error', '提交失败', response.data?.message || '提交审稿失败');
      }
    } catch (error) {
      console.error('提交审稿失败:', error);
      showMessage('error', '提交失败', error.response?.data?.message || error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 清空草稿（本地状态）
  const clearDraft = () => {
    setManuscriptText('');
    setTargetVenue('');
    setFileName('');
    setInputType('text');
    setUseFileInput(false);
    // 同时保存空草稿到后端
    saveDraftToServer({
      input_type: 'text',
      manuscript_text: '',
      target_venue: '',
      model_level: modelLevel,
      file_name: '',
    });
  };

  // 查看任务详情
  const viewTaskDetail = async (taskId) => {
    setSelectedTaskId(taskId);
    setViewMode(VIEW_MODE.DETAIL);
    await loadTaskDetail(taskId);
  };

  // 加载任务详情
  const loadTaskDetail = async (taskId, isInitialLoad = true) => {
    // 只在首次加载且没有任务数据时显示 loading
    if (isInitialLoad && !taskDetail) {
      setDetailLoading(true);
    }
    try {
      const response = await peerReviewAPI.getTaskDetail(taskId);
      if (response.data?.code === 0) {
        setTaskDetail(response.data.data);
        
        // 如果任务还在处理中，启动轮询
        if (response.data.data.status === 'pending' || response.data.data.status === 'processing') {
          startPolling(taskId);
        } else {
          stopPolling();
        }
      }
    } catch (error) {
      console.error('加载任务详情失败:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  // 启动轮询
  const startPolling = (taskId) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const response = await peerReviewAPI.getTaskProgress(taskId);
        if (response.data?.code === 0) {
          const progress = response.data.data;
          setTaskDetail(prev => ({
            ...prev,
            status: progress.status,
            progress: progress.progress,
            progress_stage: progress.progress_stage,
          }));

          // 如果完成或失败，停止轮询并重新加载详情（不显示 loading）
          if (progress.status === 'completed' || progress.status === 'failed') {
            stopPolling();
            loadTaskDetail(taskId, false);
          }
        }
      } catch (error) {
        console.error('轮询失败:', error);
      }
    }, 2000);
  };

  // 停止轮询
  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // 删除任务
  const handleDeleteTask = async (taskId) => {
    showConfirm('确认删除', '确定要删除这个审稿任务吗？删除后无法恢复。', async () => {
      try {
        const response = await peerReviewAPI.deleteTask(taskId);
        if (response.data?.code === 0) {
          loadTasks();
          if (selectedTaskId === taskId) {
            setViewMode(VIEW_MODE.HOME);
            setSelectedTaskId(null);
          }
        }
      } catch (error) {
        console.error('删除任务失败:', error);
        showMessage('error', '删除失败', error.response?.data?.message || error.message);
      }
    });
  };

  // 返回主页
  const backToHome = () => {
    stopPolling();
    setViewMode(VIEW_MODE.HOME);
    setSelectedTaskId(null);
    setTaskDetail(null);
    loadTasks();
  };

  // 启动草稿任务（保留用于详情页中的草稿任务）
  const handleStartTask = async (taskId, targetVenue, modelLevel) => {
    try {
      const response = await peerReviewAPI.startTask(taskId, targetVenue, modelLevel);
      if (response.data?.code === 0) {
        // 重新加载任务详情
        await loadTaskDetail(taskId);
        loadTasks();
      } else {
        showMessage('error', '启动失败', response.data?.message || '启动任务失败');
      }
    } catch (error) {
      console.error('启动任务失败:', error);
      showMessage('error', '启动失败', error.response?.data?.message || error.message);
    }
  };

  // 未登录提示
  if (!user) {
    return (
      <div className={`prv-page-wrapper ${sidebarCollapsed ? 'prv-sidebar-collapsed' : 'prv-sidebar-expanded'}`}>
        <div className="prv-main-container">
          <div className="prv-content">
            <div className="prv-login-prompt">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/>
                <path d="M12 8V12M12 16H12.01"/>
              </svg>
              <h2>请先登录</h2>
              <p>AI 审稿人功能需要登录后才能使用</p>
              <button className="prv-login-btn" onClick={openLoginModal}>
                立即登录
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`prv-page-wrapper ${sidebarCollapsed ? 'prv-sidebar-collapsed' : 'prv-sidebar-expanded'}`}>
      <div className="prv-main-container">
        <div className="prv-content">
          <div className="prv-layout">
            {/* 顶部导航 */}
            <nav className="prv-navbar">
              {isMobile && (
                <button className="prv-mobile-menu-btn" onClick={openMobileSidebar}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="4" y1="8" x2="20" y2="8" />
                    <line x1="4" y1="16" x2="14" y2="16" />
                  </svg>
                </button>
              )}
              
              <div className="prv-navbar-left">
                {/* 面包屑导航 */}
                <div className="prv-breadcrumb">
                  <button className="prv-breadcrumb-link" onClick={() => navigate('/assistant')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                    文献助手
                  </button>
                  <span className="prv-breadcrumb-separator">/</span>
                  <span className="prv-breadcrumb-current">AI 审稿</span>
                </div>
                
                {viewMode === VIEW_MODE.DETAIL && (
                  <button className="prv-back-btn" onClick={backToHome}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    返回列表
                  </button>
                )}
              </div>
            </nav>

            {/* 主内容区 - 仅用于首页 */}
            {viewMode === VIEW_MODE.HOME && (
              <div className="prv-main">
                {/* 上半部分：创建任务区域 */}
                <CreateSection
                  inputType={inputType}
                  setInputType={setInputType}
                  manuscriptText={manuscriptText}
                  setManuscriptText={setManuscriptText}
                  targetVenue={targetVenue}
                  setTargetVenue={setTargetVenue}
                  fileName={fileName}
                  useFileInput={useFileInput}
                  uploading={uploading}
                  submitting={submitting}
                  isDragging={isDragging}
                  draftLoading={draftLoading}
                  modelLevel={modelLevel}
                  setModelLevel={setModelLevel}
                  fileInputRef={fileInputRef}
                  onFileSelect={handleFileSelect}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onRemoveFile={() => { 
                    setFileName(''); 
                    setManuscriptText(''); 
                    setInputType('text');
                    setUseFileInput(false);
                    // 同步清空后端草稿中的文件信息
                    saveDraftToServer({
                      input_type: 'text',
                      manuscript_text: '',
                      target_venue: targetVenue,
                      model_level: modelLevel,
                      file_name: '',
                    });
                  }}
                  onSubmit={handleSubmitDraft}
                  onClearDraft={clearDraft}
                />

                {/* 下半部分：历史任务列表 */}
                <HistorySection
                  tasks={tasks}
                  loading={loading}
                  totalTasks={totalTasks}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  onViewDetail={viewTaskDetail}
                  onDelete={handleDeleteTask}
                />
              </div>
            )}

            {/* 详情视图 - 独立布局，不在 prv-main 内 */}
            {viewMode === VIEW_MODE.DETAIL && (
              <TaskDetailView
                task={taskDetail}
                loading={detailLoading}
                onBack={backToHome}
                onDelete={() => handleDeleteTask(selectedTaskId)}
                onStartTask={handleStartTask}
              />
            )}
          </div>
        </div>
      </div>

      {/* 消息弹窗 */}
      <MessageModal
        isOpen={modal.isOpen}
        onClose={closeModal}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onConfirm={modal.onConfirm}
      />
    </div>
  );
}

// ========== 子组件 ==========

// 创建任务区域（上半部分）
function CreateSection({
  inputType, setInputType,
  manuscriptText, setManuscriptText,
  targetVenue, setTargetVenue,
  fileName,
  useFileInput,
  uploading, submitting, isDragging, draftLoading,
  modelLevel, setModelLevel,
  fileInputRef,
  onFileSelect, onDragEnter, onDragOver, onDragLeave, onDrop,
  onRemoveFile, onSubmit, onClearDraft
}) {
  // PDF文件也算有内容
  // 文件直传模式（PDF、Word等）也算有内容
  const hasContent = manuscriptText.trim().length > 0 || (fileName && useFileInput);

  return (
    <div className="prv-create-section">
      <div className="prv-section-header">
        <div className="prv-section-intro">
          <h2 className="prv-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <path d="M12 18l-2.4-1.2L7 18v-4l2.6 1.3L12 14l2.4 1.3L17 14v4l-2.6-1.2L12 18z"/>
            </svg>
            AI 审稿
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


      {/* 输入区域 - 毛玻璃效果，支持粘贴文本和拖拽上传 */}
      <div 
        className={`prv-composer-wrapper ${isDragging ? 'prv-dragging' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* 拖拽上传遮罩 */}
        {isDragging && (
          <div className="prv-drag-overlay">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p>松开鼠标上传文件</p>
          </div>
        )}

        {/* 上传中遮罩 - 更明显的加载状态 */}
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
              <h4>正在上传文件</h4>
              <p>请稍候...</p>
              <div className="prv-upload-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}

        <div className="prv-input-area">
          {draftLoading ? (
            <div className="prv-draft-loading">
              <div className="prv-spinner-small"></div>
              <span>加载草稿中...</span>
            </div>
          ) : (
            <>
              {/* 已上传文件信息条 */}
              {fileName && (
                <div className="prv-file-bar">
                  <div className="prv-file-bar-info">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span className="prv-file-bar-name">{fileName}</span>
                  </div>
                  <button className="prv-file-bar-remove" onClick={onRemoveFile}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              )}
              
              {/* 文本输入区域 */}
              <div className="prv-textarea-wrapper">
                {/* PDF文件显示特殊提示 */}
                {useFileInput && fileName ? (
                  <div className="prv-pdf-preview">
                    <div className="prv-pdf-icon">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <path d="M9 15h6"/>
                        <path d="M9 11h6"/>
                      </svg>
                    </div>
                    <h4>文件已上传</h4>
                    <p className="prv-pdf-filename">{fileName}</p>
                    <p className="prv-pdf-hint">文件将直接传递给AI进行分析</p>
                  </div>
                ) : (
                  <textarea
                    className={`prv-textarea ${fileName ? 'prv-textarea-readonly' : ''}`}
                    placeholder=""
                    value={manuscriptText}
                    onChange={(e) => !fileName && setManuscriptText(e.target.value)}
                    readOnly={!!fileName}
                    maxLength={50000}
                  />
                )}
                
                {/* 空状态引导提示 */}
                {!manuscriptText && !fileName && (
                  <div className="prv-empty-guide">
                    <div className="prv-guide-methods">
                      {/* 文字输入方式 */}
                      <div className="prv-guide-method">
                        <div className="prv-method-icon prv-method-text">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                          </svg>
                        </div>
                        <p className="prv-method-title">直接输入</p>
                        <p className="prv-method-desc">粘贴或输入论文内容</p>
                      </div>
                      
                      <div className="prv-guide-divider">
                        <span>或</span>
                      </div>
                      
                      {/* 文件上传方式 */}
                      <div className="prv-guide-method">
                        <div className="prv-method-icon prv-method-file">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                        </div>
                        <p className="prv-method-title">上传文件</p>
                        <p className="prv-method-desc">拖拽文件到此处</p>
                      </div>
                    </div>
                    
                    <div className="prv-guide-formats">
                      <span>支持格式：</span>
                      <span className="prv-format-tag">TXT</span>
                      <span className="prv-format-tag">DOC</span>
                      <span className="prv-format-tag">DOCX</span>
                      <span className="prv-format-tag">PDF</span>
                      <span className="prv-format-tag">RTF</span>
                      <span className="prv-format-tag">ODT</span>
                      <span className="prv-format-tag">XML</span>
                      <span className="prv-format-tag">HTML</span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* 隐藏的文件输入 */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.doc,.docx,.rtf,.odt,.pdf,.xml,.html,.htm"
                onChange={onFileSelect}
                style={{ display: 'none' }}
              />
            </>
          )}
        </div>

        {/* Composer Footer */}
        <div className="prv-composer-footer">
          {/* 左侧：模型选择和上传 */}
          <div className="prv-composer-footer-left">
            <ModelSelector 
              value={modelLevel} 
              onChange={setModelLevel}
              compact={true}
            />
            
            <button 
              className="prv-footer-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="上传文件"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
          </div>

          {/* 中间：目标期刊 - 可展开的输入 */}
          <div className="prv-venue-section">
            <div className="prv-venue-toggle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <input
                type="text"
                className="prv-venue-input"
                placeholder="投稿期刊（可选，让审稿更有针对性）"
                value={targetVenue}
                onChange={(e) => setTargetVenue(e.target.value)}
              />
            </div>
          </div>
          
          {/* 右侧：字符计数 + 提交按钮 */}
          <div className="prv-composer-footer-right">
            <div className="prv-char-count">
              <span className={manuscriptText.length > 45000 ? 'prv-char-warning' : ''}>
                {manuscriptText.length.toLocaleString()}
              </span>
              <span className="prv-char-separator">/</span>
              <span className="prv-char-max">50,000</span>
            </div>
            
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
        </div>
      </div>
    </div>
  );
}

// 历史任务区域（下半部分）
function HistorySection({ tasks, loading, totalTasks, currentPage, onPageChange, onViewDetail, onDelete }) {
  const pageSize = 10;
  const totalPages = Math.ceil(totalTasks / pageSize);

  // 获取模型名称
  const getModelName = (level) => {
    const models = { low: '普通', mid: '进阶', high: '高级' };
    return models[level] || level || '普通';
  };

  // 如果没有历史任务且不在加载中，直接返回 null 不渲染
  if (!loading && tasks.length === 0) {
    return null;
  }

  return (
    <div className="prv-history-section">
      <div className="prv-section-header">
        <h2 className="prv-section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          历史任务
          {totalTasks > 0 && <span className="prv-task-count">({totalTasks})</span>}
        </h2>
      </div>

      {loading ? (
        <div className="prv-loading-inline">
          <div className="prv-spinner-small"></div>
          <span>加载中...</span>
        </div>
      ) : (
        <>
          <div className="prv-task-list-compact">
            {tasks.map(task => (
              <div key={task.id} className={`prv-task-card prv-task-card-${task.status}`} onClick={() => onViewDetail(task.id)}>
                {/* 顶部：标题和状态 */}
                <div className="prv-task-card-header">
                  <h4 className="prv-task-card-title">{task.title || '未命名稿件'}</h4>
                  <span className={`prv-task-status-badge prv-status-${task.status}`}>
                    {task.status === 'processing' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="prv-spin-icon">
                        <path d="M21 12a9 9 0 11-6.219-8.56"/>
                      </svg>
                    )}
                    {task.status === 'completed' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                    {task.status === 'failed' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                    )}
                    {STATUS_MAP[task.status]?.label || task.status}
                    </span>
                  </div>

                {/* 中部：任务信息标签 */}
                <div className="prv-task-card-meta">
                  {/* 输入类型标签 - 文件和文字使用不同的样式类 */}
                  {task.input_type === 'file' ? (
                    <span className="prv-task-meta-tag prv-meta-file">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="prv-meta-label" title={task.file_name}>{task.file_name || '文件上传'}</span>
                    </span>
                  ) : (
                    <span className="prv-task-meta-tag prv-meta-text">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      <span className="prv-meta-label">文字输入</span>
                    </span>
                  )}

                  {/* 模型标签 - 使用与模型选择器一致的图标 */}
                  <span className={`prv-task-meta-tag prv-meta-model prv-meta-model-${task.model_level || 'low'}`}>
                    {/* 普通模型 - 闪电图标 */}
                    {(!task.model_level || task.model_level === 'low') && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                      </svg>
                    )}
                    {/* 进阶模型 - 同心圆图标 */}
                    {task.model_level === 'mid' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <circle cx="12" cy="12" r="6"/>
                        <circle cx="12" cy="12" r="2"/>
                      </svg>
                    )}
                    {/* 高级模型 - 星星图标 */}
                    {task.model_level === 'high' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    )}
                    {getModelName(task.model_level)}
                  </span>

                  {/* 目标期刊 */}
                  {task.target_venue && (
                    <span className="prv-task-meta-tag prv-meta-venue">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                      </svg>
                      <span className="prv-meta-label" title={task.target_venue}>{task.target_venue}</span>
                    </span>
                  )}
                </div>

                {/* 底部：时间和操作 */}
                <div className="prv-task-card-footer">
                  <span className="prv-task-card-time">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {new Date(task.created_at).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  {(task.status === 'draft' || task.status === 'failed') && (
                    <button 
                      className="prv-task-card-delete" 
                      onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                      title="删除任务"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="prv-pagination-compact">
              <button 
                className="prv-page-btn-small" 
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
              >
                ‹ 上一页
              </button>
              <span className="prv-page-info-small">{currentPage} / {totalPages}</span>
              <button 
                className="prv-page-btn-small" 
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
              >
                下一页 ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// 创建任务视图
function CreateTaskView({
  inputType, setInputType,
  manuscriptText, setManuscriptText,
  targetVenue, setTargetVenue,
  modelLevel, setModelLevel,
  uploadedFile, filePreview,
  uploading, creating, isDragging,
  fileInputRef,
  onFileSelect, onDragEnter, onDragOver, onDragLeave, onDrop, onRemoveFile,
  onSubmit, onCancel
}) {
  return (
    <div className="prv-create-view">
      <div className="prv-create-card">
        <h2 className="prv-create-title">创建审稿任务</h2>
        
        {/* 输入类型选择 */}
        <div className="prv-form-group">
          <label className="prv-form-label">输入方式</label>
          <div className="prv-input-type-tabs">
            <button 
              className={`prv-tab ${inputType === 'text' ? 'active' : ''}`}
              onClick={() => setInputType('text')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              直接输入文本
            </button>
            <button 
              className={`prv-tab ${inputType === 'file' ? 'active' : ''}`}
              onClick={() => setInputType('file')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              上传文件
            </button>
          </div>
        </div>

        {/* 文本输入 */}
        {inputType === 'text' && (
          <div className="prv-form-group">
            <label className="prv-form-label">稿件内容 *</label>
            <textarea
              className="prv-textarea"
              placeholder="请粘贴您的论文稿件内容（摘要或全文）..."
              value={manuscriptText}
              onChange={(e) => setManuscriptText(e.target.value)}
              rows={15}
            />
            <span className="prv-char-count">{manuscriptText.length} 字符</span>
          </div>
        )}

        {/* 文件上传 */}
        {inputType === 'file' && (
          <div className="prv-form-group">
            <label className="prv-form-label">上传文件 *</label>
            
            {!uploadedFile ? (
              <div 
                className={`prv-upload-area ${isDragging ? 'prv-dragging' : ''}`}
                onClick={() => !uploading && fileInputRef.current?.click()}
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                {uploading ? (
                  <div className="prv-upload-loading">
                    <div className="prv-spinner"></div>
                    <p>正在上传并解析文件...</p>
                    <span className="prv-upload-hint">请稍候，正在提取文本内容</span>
                  </div>
                ) : isDragging ? (
                  <div className="prv-upload-drop-hint">
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <p>松开鼠标上传文件</p>
                  </div>
                ) : (
                  <div className="prv-upload-default">
                    <div className="prv-upload-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <p className="prv-upload-title">拖拽文件到此处，或点击选择</p>
                    <span className="prv-upload-hint">支持 .txt, .doc, .docx, .rtf, .odt, .pdf, .xml, .html 文件，最大 10MB</span>
                    <button type="button" className="prv-upload-btn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      选择文件
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.doc,.docx,.rtf,.odt,.pdf,.xml,.html,.htm"
                  onChange={onFileSelect}
                  style={{ display: 'none' }}
                />
              </div>
            ) : (
              <div className="prv-uploaded-file">
                <div className="prv-file-info">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div>
                    <p className="prv-file-name">{uploadedFile.file_name}</p>
                    <span className="prv-file-size">{(uploadedFile.file_size / 1024).toFixed(1)} KB</span>
                  </div>
                  <button className="prv-remove-file" onClick={onRemoveFile}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                {filePreview && (
                  <div className="prv-file-preview">
                    <p className="prv-preview-label">内容预览：</p>
                    <p className="prv-preview-text">{filePreview}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 目标期刊 */}
        <div className="prv-form-group">
          <label className="prv-form-label">目标期刊/会议（可选）</label>
          <input
            type="text"
            className="prv-input"
            placeholder="例如：Nature, Science, NeurIPS..."
            value={targetVenue}
            onChange={(e) => setTargetVenue(e.target.value)}
          />
        </div>

        {/* 模型选择 */}
        <div className="prv-form-group">
          <label className="prv-form-label">AI 模型</label>
          <div className="prv-model-selector-wrapper">
            <ModelSelector
              value={modelLevel}
              onChange={setModelLevel}
              dropdownAlign="left"
            />
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="prv-form-actions">
          <button className="prvr-btn prvr-btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button 
            className="prvr-btn prvr-btn-primary" 
            onClick={onSubmit}
            disabled={creating || (inputType === 'text' && !manuscriptText.trim()) || (inputType === 'file' && !uploadedFile)}
          >
            {creating ? (
              <>
                <div className="prvr-btn-spinner"></div>
                创建中...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                开始审稿
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// 任务详情视图 - 左右分栏布局
function TaskDetailView({ task, loading, onBack, onDelete, onStartTask }) {
  const [activeSection, setActiveSection] = useState('report'); // 当前激活的模块
  const [displayProgress, setDisplayProgress] = useState(0); // 显示的进度值（用于平滑动画）
  const [showReport, setShowReport] = useState(false); // 控制是否显示报告（等待进度条完成）
  const [activeDrawer, setActiveDrawer] = useState(null); // 当前打开的抽屉: 'analysis' | 'papers' | 'gaps' | null
  const progressIntervalRef = useRef(null);
  
  // 平滑进度条动画
  useEffect(() => {
    const targetProgress = task?.progress || 0;
    const isCompleted = task?.status === 'completed';
    const isFailed = task?.status === 'failed';
    
    // 清除之前的定时器
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    // 如果任务失败，停止动画
    if (isFailed) {
      return;
    }
    
    // 如果任务完成，先平滑到100%，然后再显示报告
    if (isCompleted) {
      // 如果当前进度已经是100%，直接显示报告
      if (displayProgress >= 99.5) {
        setDisplayProgress(100);
        setTimeout(() => setShowReport(true), 300);
        return;
      }
      
      // 平滑过渡到100%
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          const diff = 100 - prev;
          if (diff <= 0.5) {
            clearInterval(progressIntervalRef.current);
            // 到达100%后延迟显示报告
            setTimeout(() => setShowReport(true), 500);
            return 100;
          }
          // 快速但平滑地到达100%
          const increment = Math.max(1, diff * 0.15);
          return Math.min(prev + increment, 100);
        });
      }, 50);
      return;
    }
    
    // 处理中：计算实际目标值，最后阶段卡在99%
    const actualTarget = targetProgress >= 90 ? Math.min(targetProgress, 99) : targetProgress;
    
    // 如果目标进度大于当前显示进度，启动平滑动画
    if (actualTarget > displayProgress) {
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          const diff = actualTarget - prev;
          if (diff <= 0) {
            clearInterval(progressIntervalRef.current);
            return actualTarget;
          }
          
          // 根据不同阶段使用不同的增速
          let increment;
          if (prev < 25) {
            // 第一阶段：较慢
            increment = Math.max(0.3, diff * 0.08);
          } else if (prev < 55) {
            // 第二阶段：中等
            increment = Math.max(0.25, diff * 0.06);
          } else if (prev < 90) {
            // 第三阶段：较慢
            increment = Math.max(0.2, diff * 0.05);
          } else {
            // 最后阶段：非常慢，逐渐接近99%
            increment = Math.max(0.1, diff * 0.03);
          }
          
          const next = prev + increment;
          
          // 如果接近目标，直接到达
          if (diff < 0.5) {
            clearInterval(progressIntervalRef.current);
            return actualTarget;
          }
          
          return Math.min(next, actualTarget);
        });
      }, 150);
    } else if (targetProgress < displayProgress && targetProgress < 10) {
      // 如果目标进度小于当前且很小（可能是新任务），直接设置
      setDisplayProgress(targetProgress);
    }
    
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [task?.progress, task?.status]);
  
  // 任务变化时重置进度和报告显示状态
  useEffect(() => {
    if (task?.id) {
      // 如果是新任务，重置状态
      setDisplayProgress(task.progress || 0);
      // 如果任务已完成且有报告内容，直接显示报告
      if (task.status === 'completed' && task.review_content) {
        setShowReport(true);
      } else {
        setShowReport(false);
      }
    }
  }, [task?.id]);

  // 只有在完全没有任务数据时才显示全屏 loading
  if (!task && loading) {
    return (
      <div className="prvr-page">
        <div className="prvr-loading">
          <div className="prvr-loading-content">
            <div className="prvr-spinner"></div>
            <h3>正在加载审稿报告...</h3>
            <p>请稍候</p>
          </div>
        </div>
      </div>
    );
  }

  // 如果没有任务数据且不在加载中，显示错误
  if (!task) {
    return (
      <div className="prvr-page">
        <div className="prvr-loading">
          <div className="prvr-loading-content">
            <h3>未找到任务</h3>
            <p>任务可能已被删除</p>
            <button className="prvr-btn prvr-btn-secondary" onClick={onBack}>
              返回列表
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isProcessing = task.status === 'pending' || task.status === 'processing';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';

  // 解析稿件内容获取预览
  const getManuscriptPreview = () => {
    if (!task.manuscript_text) return '暂无内容';
    return task.manuscript_text.length > 300 
      ? task.manuscript_text.substring(0, 300) + '...' 
      : task.manuscript_text;
  };

  // 格式化日期
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 获取模型名称
  const getModelName = (level) => {
    const models = { low: '普通模型', mid: '进阶模型', high: '高级模型' };
    return models[level] || level;
  };

  return (
    <div className="prvr-page">
      {/* 左侧边栏 - 稿件信息 */}
      <aside className="prvr-sidebar">
        {/* 状态卡片 */}
        <div className="prvr-card">
          <div className="prvr-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            任务状态
          </div>
          <div className={`prvr-status prvr-status-${task.status}`}>
            {isProcessing && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="prvr-spin">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
            )}
            {isCompleted && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
            {isFailed && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            )}
            {STATUS_MAP[task.status]?.label || task.status}
          </div>
        </div>

        {/* 提交信息卡片 - 重新设计 */}
        <div className="prvr-card prvr-submit-card">
          <div className="prvr-card-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            提交信息
          </div>
          
          {/* 文件/文本来源区块 */}
          <div className="prvr-source-block">
            {task.input_type === 'file' && task.file_name ? (
              <>
                <div className="prvr-source-icon file">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div className="prvr-source-info">
                  <span className="prvr-source-type">文件上传</span>
                  <span className="prvr-source-name" title={task.file_name}>{task.file_name}</span>
                </div>
                {task.file_id && (
                  <button 
                    className="prvr-download-btn"
                    onClick={() => window.open(`/api/v1/user/peer-review/files/${task.file_id}/download`, '_blank')}
                    title="下载原文件"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="prvr-source-icon text">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                  </svg>
                </div>
                <div className="prvr-source-info">
                  <span className="prvr-source-type">文本粘贴</span>
                  <span className="prvr-source-name">{task.manuscript_text?.length?.toLocaleString() || 0} 字</span>
                </div>
              </>
            )}
          </div>
          
          {/* 信息网格 */}
          <div className="prvr-info-grid">
            {task.target_venue && (
              <div className="prvr-info-cell">
                <span className="prvr-info-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                </span>
                <span className="prvr-info-text">{task.target_venue}</span>
              </div>
            )}
            <div className="prvr-info-cell">
              <span className="prvr-info-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              </span>
              <span className="prvr-info-text">
                <span className="prvr-info-label">AI 模型:</span> {getModelName(task.model_level)}
              </span>
            </div>
          </div>
          
          {/* 时间信息 */}
          <div className="prvr-time-info">
            <div className="prvr-time-row">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <span>提交于 {formatDate(task.created_at)}</span>
            </div>
            {task.completed_at && (
              <div className="prvr-time-row completed">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>完成于 {formatDate(task.completed_at)}</span>
              </div>
            )}
          </div>
        </div>

        {/* 内容预览卡片 */}
        <PreviewCard 
          preview={getManuscriptPreview()} 
          fullText={task.manuscript_text} 
        />
      </aside>

      {/* 右侧主内容 - 审稿报告 */}
      <main className="prvr-main">
        {/* 报告头部 */}
        <div className="prvr-header">
          <div className="prvr-title">
            <div className="prvr-title-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <path d="M12 18l-2.4-1.2L7 18v-4l2.6 1.3L12 14l2.4 1.3L17 14v4l-2.6-1.2L12 18z"/>
              </svg>
            </div>
            <h2>审稿报告</h2>
          </div>
          
          {/* 辅助信息按钮 - 放在头部 */}
          {isCompleted && showReport && (
            <div className="prvr-header-buttons">
              {task.manuscript_meta && (
                <button 
                  className={`prvr-header-btn ${activeDrawer === 'analysis' ? 'active' : ''}`}
                  onClick={() => setActiveDrawer(activeDrawer === 'analysis' ? null : 'analysis')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  稿件分析
                </button>
              )}
              {task.literature_summary?.closest_papers?.length > 0 && (
                <button 
                  className={`prvr-header-btn ${activeDrawer === 'papers' ? 'active' : ''}`}
                  onClick={() => setActiveDrawer(activeDrawer === 'papers' ? null : 'papers')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  相似论文
                </button>
              )}
              {(task.literature_summary?.typical_gaps?.length > 0 || task.gap_literature?.length > 0) && (
                <button 
                  className={`prvr-header-btn ${activeDrawer === 'gaps' ? 'active' : ''}`}
                  onClick={() => setActiveDrawer(activeDrawer === 'gaps' ? null : 'gaps')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  研究空白
                </button>
              )}
            </div>
          )}
        </div>

        {/* 处理中状态 - 更友好的展示（包括等待进度条完成的过渡期） */}
        {(isProcessing || (isCompleted && !showReport)) && (
          <div className="prvr-processing-container">
            {/* 进度卡片 */}
            <div className="prvr-processing-card">
              <div className="prvr-processing-header">
                <div className="prvr-processing-animation">
                  <div className="prvr-processing-ring"></div>
                  <div className="prvr-processing-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                </div>
                <div className="prvr-processing-info">
                  <h3>正在生成审稿报告</h3>
                  <p className="prvr-processing-stage">{task.progress_stage || 'AI 正在分析您的论文...'}</p>
                </div>
              </div>
              
              <div className="prvr-progress-section">
                <div className="prvr-progress-bar">
                  <div className="prvr-progress-fill" style={{ width: `${displayProgress}%` }}></div>
                  <div className="prvr-progress-glow" style={{ left: `${displayProgress}%` }}></div>
                </div>
                <div className="prvr-progress-meta">
                  <span className="prvr-progress-percent">{Math.round(displayProgress)}%</span>
                  <span className="prvr-progress-time">预计 2-5 分钟</span>
                </div>
              </div>
            </div>
            
            {/* 处理步骤提示 */}
            <div className="prvr-steps-hint">
              <div className={`prvr-step ${displayProgress >= 5 ? 'active' : ''} ${displayProgress >= 25 ? 'done' : ''}`}>
                <div className="prvr-step-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <span>解析稿件</span>
              </div>
              <div className="prvr-step-line">
                <div className="prvr-step-line-fill" style={{ width: displayProgress >= 25 ? '100%' : displayProgress >= 5 ? `${(displayProgress - 5) * 5}%` : '0%' }}></div>
              </div>
              <div className={`prvr-step ${displayProgress >= 25 ? 'active' : ''} ${displayProgress >= 55 ? 'done' : ''}`}>
                <div className="prvr-step-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                </div>
                <span>检索文献</span>
              </div>
              <div className="prvr-step-line">
                <div className="prvr-step-line-fill" style={{ width: displayProgress >= 55 ? '100%' : displayProgress >= 25 ? `${(displayProgress - 25) * 3.33}%` : '0%' }}></div>
              </div>
              <div className={`prvr-step ${displayProgress >= 55 ? 'active' : ''} ${displayProgress >= 90 ? 'done' : ''}`}>
                <div className="prvr-step-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </div>
                <span>生成报告</span>
              </div>
              <div className="prvr-step-line">
                <div className="prvr-step-line-fill" style={{ width: displayProgress >= 90 ? '100%' : displayProgress >= 55 ? `${(displayProgress - 55) * 2.86}%` : '0%' }}></div>
              </div>
              <div className={`prvr-step ${displayProgress >= 90 ? 'active' : ''} ${displayProgress >= 100 ? 'done' : ''}`}>
                <div className="prvr-step-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span>完成</span>
              </div>
            </div>
          </div>
        )}

        {/* 错误状态 */}
        {isFailed && (
          <div className="prvr-error">
            <div className="prvr-error-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h3>审稿失败</h3>
            <p>{task.error_message || '处理过程中发生错误，请重试'}</p>
            <button className="prvr-btn prvr-btn-secondary" onClick={onDelete}>
              删除任务
            </button>
          </div>
        )}

        {/* 已完成 - 显示审稿报告（等待进度条动画完成后显示） */}
        {isCompleted && showReport && (
          <div className="prvr-report-layout">
            {/* 左侧：审稿报告正文 */}
            <div className="prvr-report-left">
              {(task.final_review_content || task.review_content) && (
                <div className="prvr-report-content">
                  {/* 三审一致性分数 */}
                  {task.consensus_score > 0 && (
                    <div className="prvr-consensus-score">
                      <span className="prvr-consensus-label">三审一致性：</span>
                      <span className={`prvr-consensus-value ${task.consensus_score >= 0.67 ? 'high' : task.consensus_score >= 0.34 ? 'medium' : 'low'}`}>
                        {Math.round(task.consensus_score * 100)}%
                      </span>
                    </div>
                  )}
                  {(task.final_recommendation || task.recommendation) && (
                    <div className="prvr-report-recommendation">
                      <span className={`prvr-recommendation-badge ${(task.final_recommendation || task.recommendation).toLowerCase().replace(/\s+/g, '-')}`}>
                        {task.final_recommendation || task.recommendation}
                      </span>
                    </div>
                  )}
                  <div className="prvr-review-report">
                    <MarkdownRenderer content={task.final_review_content || task.review_content} />
                  </div>
                  
                  {/* 三审独立结果（可折叠） */}
                  {task.reviews && task.reviews.length > 0 && (
                    <div className="prvr-three-reviews">
                      <details>
                        <summary className="prvr-reviews-summary">
                          查看三位审稿人独立意见 ({task.reviews.filter(r => r.status === 'completed').length}/3)
                        </summary>
                        <div className="prvr-reviews-list">
                          {task.reviews.map((review, idx) => (
                            <div key={idx} className={`prvr-review-item ${review.status}`}>
                              <div className="prvr-review-header">
                                <span className="prvr-reviewer-name">审稿人 {review.reviewer_index}</span>
                                {review.recommendation && (
                                  <span className={`prvr-mini-badge ${review.recommendation.toLowerCase().replace(/\s+/g, '-')}`}>
                                    {review.recommendation}
                                  </span>
                                )}
                                <span className={`prvr-review-status ${review.status}`}>
                                  {review.status === 'completed' ? '已完成' : review.status === 'processing' ? '审稿中' : review.status === 'failed' ? '失败' : '等待中'}
                                </span>
                              </div>
                              {review.review_content && (
                                <div className="prvr-review-content-preview">
                                  <MarkdownRenderer content={review.review_content.substring(0, 500) + (review.review_content.length > 500 ? '...' : '')} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 右侧：辅助信息面板 */}
            {activeDrawer && (
              <div className="prvr-report-right">
                <div className="prvr-panel">
                  <div className="prvr-panel-header">
                    <span className="prvr-panel-title">
                      {activeDrawer === 'analysis' && '稿件分析'}
                      {activeDrawer === 'papers' && `相似论文 (${task.literature_summary?.closest_papers?.length || 0}篇)`}
                      {activeDrawer === 'gaps' && '研究空白'}
                    </span>
                    <button className="prvr-panel-close" onClick={() => setActiveDrawer(null)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="prvr-panel-body">
                    {/* 稿件分析内容 */}
                    {activeDrawer === 'analysis' && task.manuscript_meta && (
                      <div className="prvr-panel-content">
                        <div className="prvr-panel-item">
                          <span className="prvr-panel-label">论文标题</span>
                          <span className="prvr-panel-value">{task.manuscript_meta.title}</span>
                        </div>
                        <div className="prvr-panel-item">
                          <span className="prvr-panel-label">研究领域</span>
                          <span className="prvr-panel-value">{task.manuscript_meta.field}</span>
                        </div>
                        <div className="prvr-panel-item">
                          <span className="prvr-panel-label">研究主题</span>
                          <span className="prvr-panel-value">{task.manuscript_meta.main_topic}</span>
                        </div>
                        {task.manuscript_meta.keywords?.length > 0 && (
                          <div className="prvr-panel-item">
                            <span className="prvr-panel-label">关键词</span>
                            <div className="prvr-panel-tags">
                              {task.manuscript_meta.keywords.map((keyword, idx) => (
                                <span key={idx} className="prvr-panel-tag">{keyword}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {task.manuscript_meta.claimed_novelty?.length > 0 && (
                          <div className="prvr-panel-item">
                            <span className="prvr-panel-label">创新点</span>
                            <ul className="prvr-panel-list">
                              {task.manuscript_meta.claimed_novelty.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 相似论文内容 */}
                    {activeDrawer === 'papers' && task.literature_summary && (
                      <div className="prvr-panel-content">
                        {task.literature_summary.field_state && (
                          <p className="prvr-panel-desc">{task.literature_summary.field_state}</p>
                        )}
                        <div className="prvr-panel-papers">
                          {task.literature_summary.closest_papers?.map((paper, idx) => (
                            <div key={idx} className="prvr-panel-paper">
                              <span className="prvr-panel-paper-num">{idx + 1}</span>
                              <div className="prvr-panel-paper-info">
                                <span className="prvr-panel-paper-title">{paper.title}</span>
                                <span className="prvr-panel-paper-year">{paper.year}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 研究空白内容 */}
                    {activeDrawer === 'gaps' && (
                      <div className="prvr-panel-content">
                        <div className="prvr-panel-gaps">
                          {task.gap_literature?.map((item, gapIdx) => (
                            <div key={gapIdx} className="prvr-panel-gap">
                              <span className="prvr-panel-gap-num">{gapIdx + 1}</span>
                              <span className="prvr-panel-gap-text">{item.gap}</span>
                            </div>
                          )) || task.literature_summary?.typical_gaps?.map((gap, idx) => (
                            <div key={idx} className="prvr-panel-gap">
                              <span className="prvr-panel-gap-num">{idx + 1}</span>
                              <span className="prvr-panel-gap-text">{gap}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
