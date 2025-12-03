import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { peerReviewAPI } from '../services/api';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import ModelSelector from '../components/ModelSelector';
import MarkdownRenderer from '../components/MarkdownRenderer';
import MessageModal from '../components/MessageModal';
import './styles/PeerReviewPage.css';

// 任务状态映射
const STATUS_MAP = {
  draft: { label: '草稿', color: 'gray' },
  pending: { label: '等待处理', color: 'orange' },
  processing: { label: '处理中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
};

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
        setFileName(draft.file_name || '');
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
    const allowedTypes = ['.txt', '.doc', '.docx', '.rtf', '.odt', '.pdf'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(ext)) {
      showMessage('warning', '文件类型不支持', '请上传 txt、doc、docx、rtf、odt 或 pdf 文件');
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
        setManuscriptText(data.extracted_text || '');
        setFileName(data.file_name || file.name);
        if (data.draft_id) {
          setDraftId(data.draft_id);
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

    // 验证输入
    if (!manuscriptText.trim()) {
      showMessage('warning', '请输入内容', '请输入或上传稿件内容后再开始审稿');
      return;
    }

    if (manuscriptText.trim().length < 100) {
      showMessage('warning', '内容太短', '稿件内容至少需要100个字符');
      return;
    }

    setSubmitting(true);
    try {
      const response = await peerReviewAPI.submitDraft(targetVenue, modelLevel);
      if (response.data?.code === 0) {
        const taskId = response.data.data.task_id;
        
        // 清空本地草稿状态
        clearDraft();
        
        // 跳转到详情页
        setSelectedTaskId(taskId);
        setViewMode(VIEW_MODE.DETAIL);
        
        // 刷新列表
        loadTasks();
        
        // 提交成功不弹窗，直接跳转到详情页
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
  const loadTaskDetail = async (taskId) => {
    setDetailLoading(true);
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

          // 如果完成或失败，停止轮询并重新加载详情
          if (progress.status === 'completed' || progress.status === 'failed') {
            stopPolling();
            loadTaskDetail(taskId);
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

            {/* 主内容区 */}
            <div className="prv-main">
          {viewMode === VIEW_MODE.HOME && (
            <>
              {/* 上半部分：创建任务区域 */}
              <CreateSection
                inputType={inputType}
                setInputType={setInputType}
                manuscriptText={manuscriptText}
                setManuscriptText={setManuscriptText}
                targetVenue={targetVenue}
                setTargetVenue={setTargetVenue}
                fileName={fileName}
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
            </>
          )}

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
  uploading, submitting, isDragging, draftLoading,
  modelLevel, setModelLevel,
  fileInputRef,
  onFileSelect, onDragEnter, onDragOver, onDragLeave, onDrop,
  onRemoveFile, onSubmit, onClearDraft
}) {
  const hasContent = manuscriptText.trim().length > 0;

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

        {/* 上传中遮罩 */}
        {uploading && (
          <div className="prv-upload-overlay">
            <div className="prv-spinner"></div>
            <p>正在解析文件...</p>
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
                <textarea
                  className={`prv-textarea ${fileName ? 'prv-textarea-readonly' : ''}`}
                  placeholder=""
                  value={manuscriptText}
                  onChange={(e) => !fileName && setManuscriptText(e.target.value)}
                  readOnly={!!fileName}
                  maxLength={50000}
                />
                
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
                    </div>
                  </div>
                )}
              </div>
              
              {/* 隐藏的文件输入 */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.doc,.docx,.rtf,.odt,.pdf"
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
                  <div className="prv-btn-spinner"></div>
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
      ) : tasks.length === 0 ? (
        <div className="prv-empty-history">
          <p>暂无审稿记录，开始您的第一次审稿吧</p>
        </div>
      ) : (
        <>
          <div className="prv-task-list-compact">
            {tasks.map(task => (
              <div key={task.id} className="prv-task-item" onClick={() => onViewDetail(task.id)}>
                <div className="prv-task-item-main">
                  <span className={`prv-task-status-dot prv-dot-${task.status}`}></span>
                  <div className="prv-task-item-info">
                    <h4 className="prv-task-item-title">{task.title || '未命名稿件'}</h4>
                    <span className="prv-task-item-time">
                      {new Date(task.created_at).toLocaleString('zh-CN')}
                      {task.target_venue && ` · ${task.target_venue}`}
                    </span>
                  </div>
                </div>
                <div className="prv-task-item-right">
                  <span className={`prv-task-status-badge prv-status-${task.status}`}>
                    {STATUS_MAP[task.status]?.label || task.status}
                  </span>
                  {(task.status === 'draft' || task.status === 'failed') && (
                    <button 
                      className="prv-task-item-delete" 
                      onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    <span className="prv-upload-hint">支持 .txt, .doc, .docx, .rtf, .odt, .pdf 文件，最大 10MB</span>
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
                  accept=".txt,.doc,.docx,.rtf,.odt,.pdf"
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
          <button className="prv-btn prv-btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button 
            className="prv-btn prv-btn-primary" 
            onClick={onSubmit}
            disabled={creating || (inputType === 'text' && !manuscriptText.trim()) || (inputType === 'file' && !uploadedFile)}
          >
            {creating ? (
              <>
                <div className="prv-btn-spinner"></div>
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

// 任务详情视图
function TaskDetailView({ task, loading, onBack, onDelete, onStartTask }) {
  const [targetVenue, setTargetVenue] = useState(task?.target_venue || '');
  const [modelLevel, setModelLevel] = useState(task?.model_level || 'mid');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (task) {
      setTargetVenue(task.target_venue || '');
      setModelLevel(task.model_level || 'mid');
    }
  }, [task]);

  if (loading || !task) {
    return (
      <div className="prv-loading">
        <div className="prv-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  const isDraft = task.status === 'draft';
  const isProcessing = task.status === 'pending' || task.status === 'processing';
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';

  const handleStart = async () => {
    setStarting(true);
    try {
      await onStartTask(task.id, targetVenue, modelLevel);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="prv-detail-view">
      {/* 任务头部 */}
      <div className="prv-detail-header">
        <div className="prv-detail-title-row">
          <h2 className="prv-detail-title">{task.title || '未命名稿件'}</h2>
          <span className={`prv-task-status prv-status-${task.status}`}>
            {STATUS_MAP[task.status]?.label || task.status}
          </span>
        </div>
        
        <div className="prv-detail-meta">
          {task.target_venue && !isDraft && <span>目标期刊: {task.target_venue}</span>}
          <span>创建时间: {new Date(task.created_at).toLocaleString('zh-CN')}</span>
          {task.completed_at && <span>完成时间: {new Date(task.completed_at).toLocaleString('zh-CN')}</span>}
        </div>
      </div>

      {/* 草稿状态 - 显示编辑表单 */}
      {isDraft && (
        <div className="prv-draft-card">
          <h3>稿件预览</h3>
          <div className="prv-manuscript-preview">
            {truncateString(task.manuscript_text, 500)}
          </div>
          
          <div className="prv-draft-form">
            <div className="prv-form-group">
              <label>目标期刊/会议（可选）</label>
              <input
                type="text"
                className="prv-input"
                placeholder="例如：Nature, Science, NeurIPS..."
                value={targetVenue}
                onChange={(e) => setTargetVenue(e.target.value)}
              />
            </div>
            
            <div className="prv-form-group">
              <label>AI 模型</label>
              <ModelSelector
                value={modelLevel}
                onChange={setModelLevel}
                dropdownAlign="left"
              />
            </div>
          </div>

          <div className="prv-draft-actions">
            <button 
              className="prv-btn prv-btn-primary" 
              onClick={handleStart}
              disabled={starting}
            >
              {starting ? (
                <>
                  <div className="prv-btn-spinner"></div>
                  启动中...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  开始审稿
                </>
              )}
            </button>
            <button className="prv-btn prv-btn-secondary" onClick={onDelete}>
              删除草稿
            </button>
          </div>
        </div>
      )}

      {/* 处理进度 */}
      {isProcessing && (
        <div className="prv-progress-card">
          <h3>处理进度</h3>
          <div className="prv-progress-container">
            <div className="prv-progress-bar-large">
              <div className="prv-progress-fill" style={{ width: `${task.progress}%` }}></div>
            </div>
            <div className="prv-progress-info">
              <span className="prv-progress-percent">{task.progress}%</span>
              <span className="prv-progress-stage">{task.progress_stage || '处理中...'}</span>
            </div>
          </div>
          <p className="prv-progress-hint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            审稿过程可能需要几分钟，您可以离开此页面，稍后回来查看结果
          </p>
        </div>
      )}

      {/* 错误信息 */}
      {isFailed && (
        <div className="prv-error-card">
          <h3>处理失败</h3>
          <p className="prv-error-message">{task.error_message || '未知错误'}</p>
          <button className="prv-btn prv-btn-secondary" onClick={onDelete}>
            删除任务
          </button>
        </div>
      )}

      {/* 审稿结果 */}
      {isCompleted && (
        <div className="prv-result-cards">
          {/* 推荐意见 */}
          {task.recommendation && (
            <div className="prv-result-card prv-recommendation-card">
              <h3>审稿推荐</h3>
              <div className={`prv-recommendation-badge prv-rec-${task.recommendation.toLowerCase().replace(' ', '-')}`}>
                {task.recommendation}
              </div>
            </div>
          )}

          {/* 稿件元信息 */}
          {task.manuscript_meta && (
            <div className="prv-result-card">
              <h3>稿件分析</h3>
              <div className="prv-meta-content">
                <p><strong>标题：</strong>{task.manuscript_meta.title}</p>
                <p><strong>领域：</strong>{task.manuscript_meta.field}</p>
                <p><strong>研究主题：</strong>{task.manuscript_meta.main_topic}</p>
                {task.manuscript_meta.main_methods?.length > 0 && (
                  <p><strong>研究方法：</strong>{task.manuscript_meta.main_methods.join(', ')}</p>
                )}
                {task.manuscript_meta.keywords?.length > 0 && (
                  <p><strong>关键词：</strong>{task.manuscript_meta.keywords.join(', ')}</p>
                )}
                {task.manuscript_meta.claimed_novelty?.length > 0 && (
                  <div>
                    <strong>声称的创新点：</strong>
                    <ul>
                      {task.manuscript_meta.claimed_novelty.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 文献总结 */}
          {task.literature_summary && (
            <div className="prv-result-card">
              <h3>文献前沿分析</h3>
              <div className="prv-literature-content">
                <p>{task.literature_summary.field_state}</p>
                
                {task.literature_summary.closest_papers?.length > 0 && (
                  <div className="prv-closest-papers">
                    <h4>相似论文</h4>
                    <ul>
                      {task.literature_summary.closest_papers.map((paper, idx) => (
                        <li key={idx}>
                          <strong>{paper.title}</strong> ({paper.year})
                          <br/>
                          <span className="prv-paper-reason">{paper.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {task.literature_summary.typical_gaps?.length > 0 && (
                  <div className="prv-gaps">
                    <h4>研究空白</h4>
                    <ul>
                      {task.literature_summary.typical_gaps.map((gap, idx) => (
                        <li key={idx}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 研究空白相关文献 */}
          {task.gap_literature?.length > 0 && (
            <div className="prv-result-card">
              <h3>研究空白相关文献</h3>
              <div className="prv-gap-literature-content">
                {task.gap_literature.map((item, gapIdx) => (
                  <div key={gapIdx} className="prv-gap-section">
                    <h4 className="prv-gap-title">
                      <span className="prv-gap-label">空白 {gapIdx + 1}:</span>
                      {item.gap}
                    </h4>
                    <div className="prv-gap-papers">
                      {item.papers?.map((paper, paperIdx) => (
                        <div key={paperIdx} className="prv-gap-paper-item">
                          <div className="prv-gap-paper-title">
                            {paper.url ? (
                              <a href={paper.url} target="_blank" rel="noopener noreferrer">
                                {paper.title}
                              </a>
                            ) : (
                              paper.title
                            )}
                          </div>
                          <div className="prv-gap-paper-meta">
                            <span className="prv-gap-paper-year">{paper.year}</span>
                            {paper.citationCount !== undefined && (
                              <span className="prv-gap-paper-citations">
                                引用: {paper.citationCount}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 审稿报告 */}
          {task.review_content && (
            <div className="prv-result-card prv-review-card">
              <h3>审稿报告</h3>
              <div className="prv-review-content">
                <MarkdownRenderer content={task.review_content} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
