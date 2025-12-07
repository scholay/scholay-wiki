/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM, { flushSync } from 'react-dom';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { peerReviewAPI } from '../services/api';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import ModelSelector from '../components/ModelSelector';
import MarkdownRenderer from '../components/MarkdownRenderer';
import MessageModal from '../components/MessageModal';
import ReviewRadarChart from '../components/ReviewRadarChart';
import { 
  STATUS_MAP, 
  VIEW_MODE,
  ALLOWED_FILE_TYPES,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_FILE_SIZE,
  MAX_ATTACHMENTS,
  MAX_CHAR_COUNT
} from '../utils/peer-review/constants';
import { parseReviewJSON, getRecommendationClass, getConfidenceLabel } from '../utils/peer-review/parseUtils';
import { getFileIcon } from '../utils/peer-review/fileUtils';
import './styles/PeerReviewPage.css';
import './styles/ReviewReport.css';

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
  const [modelLevel, setModelLevel] = useState('mid'); // 默认进阶模式（AI审稿只支持进阶和高级）
  const [fileName, setFileName] = useState('');
  const [useFileInput, setUseFileInput] = useState(false); // 是否直接使用文件（不提取文本，如PDF、Word等）
  const [attachments, setAttachments] = useState([]); // 附件列表（每个附件项自己管理 uploading 状态）
  const [uploading, setUploading] = useState(false); // 主稿件上传中
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
  const attachmentInputRef = useRef(null); // 附件上传
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
        // AI审稿只支持进阶和高级模型，如果是 low 则转换为 mid
        const level = draft.model_level || 'mid';
        setModelLevel(level === 'low' ? 'mid' : level);
        // 新结构：从 manuscript_file 获取文件信息
        if (draft.manuscript_file) {
          setFileName(draft.manuscript_file.file_name || '');
          setUseFileInput(draft.manuscript_file.process_mode === 'direct');
        } else {
          setFileName('');
          setUseFileInput(false);
        }
        // 加载附件列表
        setAttachments(draft.attachments || []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputType, manuscriptText, targetVenue, modelLevel, fileName, user, draftLoading]);

  // 初始加载：获取草稿和任务列表
  useEffect(() => {
    if (!user) return;
    loadDraft();
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 分页变化时重新加载任务列表
  useEffect(() => {
    if (!user) return;
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_FILE_TYPES.includes(ext)) {
      showMessage('warning', '文件类型不支持', '请上传 txt、doc、docx、rtf、odt、pdf、xml 或 html 文件');
      return null;
    }

    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      showMessage('warning', '文件过大', `文件大小不能超过 5MB，当前文件 ${sizeMB}MB`);
      return null;
    }

    return file;
  };

  // 上传文件（解析并保存到草稿）- 异步非阻塞方式
  const uploadFile = (file) => {
    if (!user) {
      showMessage('warning', '请先登录', '上传文件需要登录');
      openLoginModal();
      return;
    }

    // 使用 flushSync 强制同步更新 UI，确保 loading 状态立即显示
    flushSync(() => {
      setUploading(true);
      setInputType('file');
      setFileName(file.name);
    });

    // 使用 setTimeout 确保 UI 更新后再发起请求
    setTimeout(() => {
      peerReviewAPI.uploadFile(file)
        .then(response => {
          if (response.data?.code === 0) {
            const data = response.data.data;
            // 更新为服务器返回的文件名
            setFileName(data.file_name || file.name);
            // 新结构：process_mode 为 'direct' 表示直接传AI
            const isDirect = data.process_mode === 'direct';
            setUseFileInput(isDirect);
            
            // 文件直传模式（PDF、Word等）不提取文本，使用预览信息
            if (isDirect) {
              setManuscriptText(data.content_preview || '');
            } else {
              // 重新加载草稿以获取提取的文本
              loadDraft();
            }
          } else {
            // 上传失败，清空文件状态
            setFileName('');
            setInputType('text');
            showMessage('error', '上传失败', response.data?.message || '文件上传失败');
          }
        })
        .catch(error => {
          console.error('文件上传失败:', error);
          // 上传失败，清空文件状态
          setFileName('');
          setInputType('text');
          showMessage('error', '上传失败', error.response?.data?.message || error.message);
        })
        .finally(() => {
          setUploading(false);
        });
    }, 0);
  };

  // 文件选择处理（非阻塞）
  const handleFileSelect = (e) => {
    const file = validateFile(e.target.files[0]);
    if (file) {
      uploadFile(file); // 不使用 await，异步执行
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

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = validateFile(e.dataTransfer.files[0]);
    if (file) {
      uploadFile(file); // 不使用 await，异步执行
    }
  };

  // 验证附件文件
  const validateAttachmentFile = (file) => {
    if (!file) return null;

    // 检查文件类型
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) {
      showMessage('warning', '文件类型不支持', '附件支持文档、表格、代码等多种格式');
      return null;
    }

    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      showMessage('warning', '文件过大', `附件大小不能超过 5MB，当前文件 ${sizeMB}MB`);
      return null;
    }

    return file;
  };

  // 上传附件 - 异步非阻塞方式
  const handleAttachmentUpload = (e) => {
    if (!user) {
      showMessage('warning', '请先登录', '上传附件需要登录');
      openLoginModal();
      return;
    }

    const file = validateAttachmentFile(e.target.files[0]);
    if (!file) {
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
      return;
    }

    // 检查已上传成功的附件数量（排除正在上传的）
    const uploadedCount = attachments.filter(a => !a.uploading).length;
    if (uploadedCount >= MAX_ATTACHMENTS) {
      showMessage('warning', '附件数量已达上限', `最多只能上传${MAX_ATTACHMENTS}个附件`);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
      return;
    }

    // 立即清空 input
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }

    // 生成临时 ID 用于追踪这个上传
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileExt = file.name.split('.').pop().toLowerCase();

    // 立即添加一个 loading 状态的临时附件项
    const tempAttachment = {
      id: tempId,
      file_name: file.name,
      file_ext: fileExt,
      uploading: true, // 标记为上传中
    };

    // 使用 flushSync 强制同步更新 UI
    flushSync(() => {
      setAttachments(prev => [...prev, tempAttachment]);
    });

    // 使用 setTimeout 确保 UI 更新后再发起请求
    setTimeout(() => {
      peerReviewAPI.uploadAttachment(file)
        .then(response => {
          if (response.data?.code === 0) {
            const newAttachment = response.data.data;
            // 用真实数据替换临时附件
            setAttachments(prev => prev.map(att => 
              att.id === tempId ? newAttachment : att
            ));
          } else {
            // 上传失败，移除临时附件
            setAttachments(prev => prev.filter(att => att.id !== tempId));
            showMessage('error', '上传失败', response.data?.message || '附件上传失败');
          }
        })
        .catch(error => {
          console.error('附件上传失败:', error);
          // 上传失败，移除临时附件
          setAttachments(prev => prev.filter(att => att.id !== tempId));
          showMessage('error', '上传失败', error.response?.data?.message || error.message);
        });
    }, 0);
  };

  // 删除附件
  const handleDeleteAttachment = async (attachmentId) => {
    try {
      const response = await peerReviewAPI.deleteAttachment(attachmentId);
      if (response.data?.code === 0) {
        setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      } else {
        showMessage('error', '删除失败', response.data?.message || '附件删除失败');
      }
    } catch (error) {
      console.error('删除附件失败:', error);
      showMessage('error', '删除失败', error.response?.data?.message || error.message);
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
        const taskData = response.data.data;
        const taskId = taskData.task_id;
        
        // 立即构建初始任务对象，让页面能快速显示
        // 使用后端返回的数据，确保时间等字段准确（由后端生成）
        const initialTask = {
          id: taskId,
          status: 'pending',
          progress: 0,
          progress_stage: '等待处理',
          input_type: taskData.input_type || (fileName ? 'file' : 'text'),
          manuscript_text: taskData.manuscript_text || manuscriptText,
          target_venue: taskData.target_venue || targetVenue,
          model_level: taskData.model_level || modelLevel,
          // 后端返回的 created_at 实际是 submitted_at（提交时间）
          submitted_at: taskData.created_at,
          created_at: taskData.created_at,
          // 使用后端返回的文件信息
          manuscript_file: taskData.manuscript_file || (fileName ? { file_name: fileName } : null),
          // 使用后端返回的附件列表
          attachments: taskData.attachments || attachments,
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

  // 清空草稿（调用后端API删除主稿件和附件）
  const clearDraft = async () => {
    try {
      // 调用后端清空草稿API（会删除主稿件和所有附件文件）
      const response = await peerReviewAPI.clearDraft();
      if (response.data?.code === 0) {
        // 清空本地状态
        setManuscriptText('');
        setTargetVenue('');
        setFileName('');
        setInputType('text');
        setUseFileInput(false);
        setAttachments([]);
      } else {
        showMessage('error', '清空失败', response.data?.message || '清空草稿失败');
      }
    } catch (error) {
      console.error('清空草稿失败:', error);
      showMessage('error', '清空失败', error.response?.data?.message || error.message);
    }
  };

  // 删除主稿件文件（调用后端API）
  const removeManuscriptFile = async () => {
    try {
      const response = await peerReviewAPI.deleteManuscript();
      if (response.data?.code === 0) {
        // 清空本地状态
        setFileName('');
        setManuscriptText('');
        setInputType('text');
        setUseFileInput(false);
      } else {
        showMessage('error', '删除失败', response.data?.message || '删除主稿件失败');
      }
    } catch (error) {
      console.error('删除主稿件失败:', error);
      showMessage('error', '删除失败', error.response?.data?.message || error.message);
    }
  };

  // 查看任务详情
  const viewTaskDetail = async (taskId) => {
    // 先清空旧的任务详情，避免显示上一次的数据
    setTaskDetail(null);
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
                  attachments={attachments}
                  uploading={uploading}
                  submitting={submitting}
                  isDragging={isDragging}
                  draftLoading={draftLoading}
                  modelLevel={modelLevel}
                  setModelLevel={setModelLevel}
                  fileInputRef={fileInputRef}
                  attachmentInputRef={attachmentInputRef}
                  onFileSelect={handleFileSelect}
                  onAttachmentUpload={handleAttachmentUpload}
                  onDeleteAttachment={handleDeleteAttachment}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onRemoveFile={removeManuscriptFile}
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
  attachments,
  uploading, submitting, isDragging, draftLoading,
  modelLevel, setModelLevel,
  fileInputRef,
  attachmentInputRef,
  onFileSelect, onAttachmentUpload, onDeleteAttachment,
  onDragEnter, onDragOver, onDragLeave, onDrop,
  onRemoveFile, onSubmit, onClearDraft
}) {
  // PDF文件也算有内容
  // 文件直传模式（PDF、Word等）也算有内容
  const hasContent = manuscriptText.trim().length > 0 || (fileName && useFileInput);

  // 附件拖拽状态
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
      // 创建一个模拟的 event 对象传给 onAttachmentUpload
      const fakeEvent = { target: { files: [file] } };
      onAttachmentUpload(fakeEvent);
    }
  };

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
                    
                    <div className="prv-guide-tip">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                      </svg>
                      <span>支持添加最多 5 个附件（图表、数据等补充材料）</span>
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
              allowedModels={['mid', 'high']}
            />

            {/* 主稿件已上传时隐藏上传按钮 */}
            {!fileName && (
              <button
                className="prv-footer-btn prv-simple-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="上传文件"
              >
                {uploading ? (
                  <div className="prv-btn-spinner-small"></div>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <span className="prv-simple-btn-label">文件</span>
                  </>
                )}
              </button>
            )}

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
            {/* 显示字符计数：文本输入模式 或 文本类文件（提取了文字）模式下显示 */}
            {/* useFileInput=true 表示直传AI的文件（仅PDF），此时隐藏字符计数 */}
            {/* Word/TXT等文件会提取文本，useFileInput=false，显示字符计数 */}
            {!useFileInput && (
              <div className="prv-char-count">
                <span className={manuscriptText.length > 45000 ? 'prv-char-warning' : ''}>
                  {manuscriptText.length.toLocaleString()}
                </span>
                <span className="prv-char-separator">/</span>
                <span className="prv-char-max">50,000</span>
              </div>
            )}
            
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

      {/* 附件区域 - 支持拖拽和点击上传 */}
      <div
        className={`prv-attachments-zone ${attachmentDragging ? 'prv-attachments-dragging' : ''} ${attachments.length > 0 ? 'has-attachments' : ''}`}
        onDragEnter={handleAttachmentDragEnter}
        onDragOver={handleAttachmentDragOver}
        onDragLeave={handleAttachmentDragLeave}
        onDrop={handleAttachmentDrop}
        onClick={(e) => {
          // 如果点击的是删除按钮或正在上传的附件，不触发上传
          if (e.target.closest('.prv-attachment-chip-remove')) return;
          if (e.target.closest('.prv-attachment-chip.uploading')) return;
          // 计算非上传中的附件数量
          const uploadedCount = attachments.filter(a => !a.uploading).length;
          if (uploadedCount < 5) {
            attachmentInputRef.current?.click();
          }
        }}
      >
        {/* 拖拽提示遮罩 */}
        {attachmentDragging && (
          <div className="prv-attachments-drag-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <span>松开添加附件</span>
          </div>
        )}

        <div className="prv-attachments-content">
          {/* 左侧：图标和提示 */}
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

          {/* 右侧：附件列表 */}
          {attachments.length > 0 && (
            <div className="prv-attachments-list">
              {attachments.map((attachment) => (
                <div 
                  key={attachment.id} 
                  className={`prv-attachment-chip ${attachment.uploading ? 'uploading' : ''}`}
                >
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
                      : attachment.file_name
                    }
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

        {/* 隐藏的附件上传 input */}
        <input
          ref={attachmentInputRef}
          type="file"
          accept=".txt,.doc,.docx,.rtf,.odt,.pdf,.xml,.html,.htm,.xlsx,.xls,.csv,.epub,.py,.js,.ts,.go,.java,.c,.cpp,.h,.rs,.rb,.php,.sql,.json,.yaml,.yml,.md,.r"
          onChange={onAttachmentUpload}
          style={{ display: 'none' }}
        />
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

  // 获取推荐意见的显示文本和样式类
  const getRecommendationInfo = (recommendation) => {
    if (!recommendation) return null;
    const map = {
      'Accept': { label: '接受', className: 'accept' },
      'Minor Revision': { label: '小修', className: 'minor' },
      'Major Revision': { label: '大修', className: 'major' },
      'Reject': { label: '拒稿', className: 'reject' },
      'Pending Review': { label: '待定', className: 'pending' },
    };
    return map[recommendation] || { label: recommendation, className: 'pending' };
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
            {tasks.map(task => {
              const recommendationInfo = getRecommendationInfo(task.final_recommendation);
              return (
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
                  {/* 推荐意见标签 - 只在已完成且有推荐意见时显示 */}
                  {task.status === 'completed' && recommendationInfo && (
                    <span className={`prv-task-meta-tag prv-meta-recommendation prv-recommendation-${recommendationInfo.className}`}>
                      {recommendationInfo.className === 'accept' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                      {(recommendationInfo.className === 'minor' || recommendationInfo.className === 'major') && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      )}
                      {recommendationInfo.className === 'reject' && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      )}
                      {recommendationInfo.label}
                    </span>
                  )}

                  {/* 输入类型标签 - 文件显示类型，文字显示文字输入 */}
                  {task.input_type === 'file' ? (
                    <span className="prv-task-meta-tag prv-meta-file">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="prv-meta-label">{task.file_ext ? task.file_ext.toUpperCase() : '文件'}</span>
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
            );
            })}
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

// 任务详情视图 - 左右分栏布局
function TaskDetailView({ task, loading, onBack, onDelete, onStartTask }) {
  const [displayProgress, setDisplayProgress] = useState(0); // 显示的进度值（用于平滑动画）
  const [showReport, setShowReport] = useState(false); // 控制是否显示报告（等待进度条完成）
  const [activeDrawer, setActiveDrawer] = useState(null); // 当前打开的抽屉: 'analysis' | 'papers' | 'gaps' | 'reviewer' | null
  const [selectedReviewer, setSelectedReviewer] = useState(null); // 当前选中的审稿人
  const progressIntervalRef = useRef(null);
  
  // 解析最终审稿报告 JSON
  const parsedReport = useMemo(() => {
    const content = task?.final_review_content || task?.review_content;
    return parseReviewJSON(content);
  }, [task?.final_review_content, task?.review_content]);
  
  // 解析单个审稿人的报告 JSON
  const parseReviewerReport = (reviewContent) => {
    return parseReviewJSON(reviewContent);
  };
  
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.progress, task?.status]);
  
  // 任务变化时重置进度和报告显示状态
  useEffect(() => {
    if (task?.id) {
      // 如果是新任务，重置状态
      setDisplayProgress(task.progress || 0);
      // 如果任务已完成且有报告内容，直接显示报告
      if (task.status === 'completed' && (task.final_review_content || task.review_content)) {
        setShowReport(true);
      } else {
        setShowReport(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            {task.input_type === 'file' && task.manuscript_file ? (
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
                  <span className="prvr-source-name" title={task.manuscript_file.file_name}>
                    {task.manuscript_file.file_name}
                  </span>
                </div>
                {task.manuscript_file.id && (
                  <button 
                    className="prvr-download-btn"
                    onClick={() => window.open(`/api/v1/user/peer-review/files/${task.manuscript_file.id}/download`, '_blank')}
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
              <span>提交于 {formatDate(task.submitted_at || task.created_at)}</span>
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
          
          {/* 附件信息 */}
          {task.attachments && task.attachments.length > 0 && (
            <div className="prvr-attachments-section">
              <div className="prvr-attachments-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                <span>附件 ({task.attachments.length})</span>
              </div>
              <div className="prvr-attachments-list">
                {task.attachments.map((att, idx) => (
                  <div 
                    key={att.id || idx} 
                    className="prvr-attachment-item clickable"
                    onClick={() => att.id && window.open(`/api/v1/user/peer-review/files/${att.id}/download`, '_blank')}
                    title={`点击下载: ${att.file_name}`}
                  >
                    {getFileIcon(att.file_ext)}
                    <span className="prvr-attachment-name">
                      {att.file_name}
                    </span>
                    <span className="prvr-attachment-download">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 内容预览卡片 - 仅文本输入方式显示（有 manuscript_file 表示是文件上传） */}
        {!task.manuscript_file && task.manuscript_text && (
          <PreviewCard 
            preview={getManuscriptPreview()} 
            fullText={task.manuscript_text} 
          />
        )}

        {/* 稿件分析卡片 */}
        {isCompleted && showReport && task.manuscript_meta && (
          <div className="prvr-card prvr-analysis-card">
            <div className="prvr-card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              稿件分析
            </div>
            <div className="prvr-analysis-content">
              {task.manuscript_meta.title && (
                <div className="prvr-analysis-item prvr-analysis-title">
                  <span className="prvr-analysis-label">论文标题</span>
                  <span className="prvr-analysis-value">{task.manuscript_meta.title}</span>
                </div>
              )}
              {task.manuscript_meta.field && (
                <div className="prvr-analysis-item">
                  <span className="prvr-analysis-label">研究领域</span>
                  <span className="prvr-analysis-value">{task.manuscript_meta.field}</span>
                </div>
              )}
              {task.manuscript_meta.main_topic && (
                <div className="prvr-analysis-item">
                  <span className="prvr-analysis-label">研究主题</span>
                  <span className="prvr-analysis-value">{task.manuscript_meta.main_topic}</span>
                </div>
              )}
              {task.manuscript_meta.keywords?.length > 0 && (
                <div className="prvr-analysis-item">
                  <span className="prvr-analysis-label">关键词</span>
                  <div className="prvr-analysis-tags">
                    {task.manuscript_meta.keywords.map((keyword, idx) => (
                      <span key={idx} className="prvr-analysis-tag">{keyword}</span>
                    ))}
                  </div>
                </div>
              )}
              {task.manuscript_meta.claimed_novelty?.length > 0 && (
                <div className="prvr-analysis-item">
                  <span className="prvr-analysis-label">创新点</span>
                  <ul className="prvr-analysis-list">
                    {task.manuscript_meta.claimed_novelty.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* 右侧主内容 - 审稿报告 */}
      <main className="prvr-main">
        {/* 报告头部 */}
        <div className="prvr-header">
          <div className="prvr-header-left">
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
            
            {/* 推荐意见和三审一致性 - 放在标题旁边 */}
            {isCompleted && showReport && (
              <div className="prvr-header-badges">
                {(task.final_recommendation || task.recommendation) && (
                  <div className={`prvr-verdict-badge ${getRecommendationClass(task.final_recommendation || task.recommendation)}`}>
                    <span className="prvr-verdict-text">{task.final_recommendation || task.recommendation}</span>
                  </div>
                )}
                {task.consensus_score > 0 && (
                  <div className={`prvr-consensus-badge ${task.consensus_score >= 0.67 ? 'high' : task.consensus_score >= 0.34 ? 'medium' : 'low'}`}>
                    <span className="prvr-consensus-label">三审一致性</span>
                    <span className="prvr-consensus-value">{Math.round(task.consensus_score * 100)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
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
            
            {/* 处理步骤提示 - 匹配后端阶段 */}
            <div className="prvr-steps-hint">
              {/* 解析稿件 5%-25% */}
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
              {/* 检索文献 25%-50% */}
              <div className={`prvr-step ${displayProgress >= 25 ? 'active' : ''} ${displayProgress >= 50 ? 'done' : ''}`}>
                <div className="prvr-step-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                </div>
                <span>检索文献</span>
              </div>
              <div className="prvr-step-line">
                <div className="prvr-step-line-fill" style={{ width: displayProgress >= 50 ? '100%' : displayProgress >= 25 ? `${(displayProgress - 25) * 4}%` : '0%' }}></div>
              </div>
              {/* 三审并行 50%-90% */}
              <div className={`prvr-step ${displayProgress >= 50 ? 'active' : ''} ${displayProgress >= 90 ? 'done' : ''}`}>
                <div className="prvr-step-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <span>三审并行</span>
              </div>
              <div className="prvr-step-line">
                <div className="prvr-step-line-fill" style={{ width: displayProgress >= 90 ? '100%' : displayProgress >= 50 ? `${(displayProgress - 50) * 2.5}%` : '0%' }}></div>
              </div>
              {/* 汇总完成 90%-100% */}
              <div className={`prvr-step ${displayProgress >= 90 ? 'active' : ''} ${displayProgress >= 100 ? 'done' : ''}`}>
                <div className="prvr-step-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span>汇总完成</span>
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

        {/* 任务完成但没有最终汇总报告（可能部分审稿人完成） */}
        {isCompleted && !task.final_review_content && !task.review_content && (
          <div className="prvr-partial-result">
            {/* 提示信息 */}
            <div className="prvr-partial-notice">
              <div className="prvr-partial-notice-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4"/>
                  <path d="M12 16h.01"/>
                </svg>
              </div>
              <div className="prvr-partial-notice-content">
                <h4>
                  {task.reviews?.every(r => r.status === 'failed') 
                    ? '审稿未能完成'
                    : '综合报告生成失败'}
                </h4>
                <p>
                  {task.reviews?.every(r => r.status === 'failed') 
                    ? '三位审稿人均审稿失败，请重新提交或联系客服'
                    : task.reviews?.some(r => r.status === 'completed' && r.review_content)
                      ? '部分审稿人已完成，您可以查看已完成的审稿意见'
                      : '审稿报告生成失败，请重新提交或联系客服'}
                </p>
              </div>
              <button className="prvr-btn prvr-btn-secondary prvr-btn-small" onClick={onDelete}>
                删除任务
              </button>
            </div>

            {/* 如果有部分审稿人完成，展示他们的独立意见 */}
            {task.reviews && task.reviews.some(r => r.status === 'completed' || r.review_content) && (
              <div className="prvr-report-content">
                <section className="prvr-report-section prvr-section-reviewers">
                  <h3 className="prvr-section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    三位审稿人意见 ({task.reviews.filter(r => r.status === 'completed').length}/3 完成)
                  </h3>
                  <div className="prvr-section-content">
                    <div className="prvr-reviewers-grid">
                      {task.reviews.map((review, idx) => (
                        <div 
                          key={idx} 
                          className={`prvr-reviewer-card ${review.status} ${(review.status === 'completed' || review.review_content) ? 'clickable' : ''}`}
                          onClick={() => {
                            if (review.status === 'completed' || review.review_content) {
                              setSelectedReviewer(review);
                              setActiveDrawer('reviewer');
                            }
                          }}
                        >
                          <div className="prvr-reviewer-avatar">
                            {['A', 'B', 'C'][review.reviewer_index - 1] || review.reviewer_index}
                          </div>
                          <div className="prvr-reviewer-info">
                            <span className="prvr-reviewer-name">审稿人 {['A', 'B', 'C'][review.reviewer_index - 1] || review.reviewer_index}</span>
                            <span className={`prvr-reviewer-status ${review.status}`}>
                              {review.status === 'completed' ? '已完成' : review.status === 'processing' ? '审稿中' : review.status === 'failed' ? '失败' : '等待中'}
                            </span>
                          </div>
                          {review.recommendation && (
                            <span className={`prvr-mini-badge ${getRecommendationClass(review.recommendation)}`}>
                              {review.recommendation}
                            </span>
                          )}
                          {(review.status === 'completed' || review.review_content) && (
                            <svg className="prvr-reviewer-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        )}

        {/* 已完成 - 显示审稿报告（等待进度条动画完成后显示） */}
        {isCompleted && showReport && (
          <div className="prvr-report-layout">
            {/* 左侧：审稿报告正文 */}
            <div className="prvr-report-left">
              {(task.final_review_content || task.review_content) && (
                <div className="prvr-report-content">
                  {/* 结构化报告内容 */}
                  {parsedReport ? (
                    <div className="prvr-structured-report">
                      {/* 总体评估 */}
                      {parsedReport.overall_assessment?.summary && (
                        <section className="prvr-report-section">
                          <h3 className="prvr-section-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            总体评估
                          </h3>
                          <div className="prvr-section-content">
                            <p className="prvr-summary-text">{parsedReport.overall_assessment.summary}</p>
                          </div>
                        </section>
                      )}

                      {/* 关键问题 */}
                      {parsedReport.critical_issues?.length > 0 && (
                        <section className="prvr-report-section prvr-section-critical">
                          <h3 className="prvr-section-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <line x1="12" y1="8" x2="12" y2="12"/>
                              <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            关键问题 ({parsedReport.critical_issues.length})
                          </h3>
                          <div className="prvr-section-content">
                            <div className="prvr-issues-list">
                              {parsedReport.critical_issues.map((issue, idx) => (
                                <div key={idx} className="prvr-issue-card prvr-issue-critical">
                                  <div className="prvr-issue-header">
                                    <span className="prvr-issue-number">{idx + 1}</span>
                                    <span className="prvr-issue-title">
                                      {issue.issue_title || issue.issue || issue.title || (typeof issue === 'string' ? issue : '问题 ' + (idx + 1))}
                                    </span>
                                  </div>
                                  {(issue.issue_description || issue.description || issue.detail) && (
                                    <p className="prvr-issue-description">{issue.issue_description || issue.description || issue.detail}</p>
                                  )}
                                  {(issue.affected_sections || issue.location) && (
                                    <div className="prvr-issue-meta">
                                      <span className="prvr-issue-location">
                                        位置: {Array.isArray(issue.affected_sections) ? issue.affected_sections.join(', ') : (issue.affected_sections || issue.location)}
                                      </span>
                                    </div>
                                  )}
                                  {(issue.required_actions || issue.suggestion) && (
                                    <div className="prvr-issue-suggestion">
                                      <strong>建议：</strong>{issue.required_actions || issue.suggestion}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </section>
                      )}

                      {/* 改进建议 */}
                      {parsedReport.other_suggestions?.length > 0 && (
                        <section className="prvr-report-section prvr-section-suggestions">
                          <h3 className="prvr-section-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9"/>
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                            </svg>
                            改进建议 ({parsedReport.other_suggestions.length})
                          </h3>
                          <div className="prvr-section-content">
                            <div className="prvr-suggestions-list">
                              {parsedReport.other_suggestions.map((suggestion, idx) => (
                                <div key={idx} className="prvr-suggestion-card">
                                  <span className="prvr-suggestion-number">{idx + 1}</span>
                                  <div className="prvr-suggestion-content">
                                    <span className="prvr-suggestion-title">
                                      {suggestion.suggestion_title || suggestion.suggestion || suggestion.title || (typeof suggestion === 'string' ? suggestion : '建议 ' + (idx + 1))}
                                    </span>
                                    {(suggestion.suggestion_description || suggestion.description) && (
                                      <p className="prvr-suggestion-description">{suggestion.suggestion_description || suggestion.description}</p>
                                    )}
                                    {(suggestion.suggestion_location) && (
                                      <p className="prvr-suggestion-location">位置: {suggestion.suggestion_location}</p>
                                    )}
                                    {(suggestion.suggestion_rationale) && (
                                      <p className="prvr-suggestion-rationale">理由: {suggestion.suggestion_rationale}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </section>
                      )}

                      {/* 评分雷达图 */}
                      {parsedReport.extended_review_items && (
                        <section className="prvr-report-section prvr-section-scores">
                          <h3 className="prvr-section-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                            评分维度
                          </h3>
                          <div className="prvr-section-content">
                            <ReviewRadarChart extendedItems={parsedReport.extended_review_items} />
                          </div>
                        </section>
                      )}

                      {/* 详细评审 */}
                      {parsedReport.extended_review_items && (
                        <section className="prvr-report-section prvr-section-extended">
                          <h3 className="prvr-section-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="16" y1="13" x2="8" y2="13"/>
                              <line x1="16" y1="17" x2="8" y2="17"/>
                            </svg>
                            详细评审
                          </h3>
                          <div className="prvr-section-content">
                            <div className="prvr-extended-items">
                              {parsedReport.extended_review_items.novelty_evaluation && (
                                <div className="prvr-extended-item">
                                  <h4>新颖性评价</h4>
                                  <p>{parsedReport.extended_review_items.novelty_evaluation}</p>
                                </div>
                              )}
                              {parsedReport.extended_review_items.technical_soundness && (
                                <div className="prvr-extended-item">
                                  <h4>技术严谨性</h4>
                                  <p>{parsedReport.extended_review_items.technical_soundness}</p>
                                </div>
                              )}
                              {parsedReport.extended_review_items.clarity_and_presentation && (
                                <div className="prvr-extended-item">
                                  <h4>清晰度与呈现</h4>
                                  <p>{parsedReport.extended_review_items.clarity_and_presentation}</p>
                                </div>
                              )}
                              {parsedReport.extended_review_items.reproducibility && (
                                <div className="prvr-extended-item">
                                  <h4>可复现性</h4>
                                  {typeof parsedReport.extended_review_items.reproducibility === 'object' ? (
                                    <div className="prvr-reproducibility-detail">
                                      {parsedReport.extended_review_items.reproducibility.data_availability && (
                                        <p><strong>数据可用性：</strong>{parsedReport.extended_review_items.reproducibility.data_availability}</p>
                                      )}
                                      {parsedReport.extended_review_items.reproducibility.code_availability && (
                                        <p><strong>代码可用性：</strong>{parsedReport.extended_review_items.reproducibility.code_availability}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <p>{parsedReport.extended_review_items.reproducibility}</p>
                                  )}
                                </div>
                              )}
                              {parsedReport.extended_review_items.ethical_considerations && (
                                <div className="prvr-extended-item">
                                  <h4>伦理考量</h4>
                                  <p>{parsedReport.extended_review_items.ethical_considerations}</p>
                                </div>
                              )}
                              {parsedReport.extended_review_items.impact_and_significance && (
                                <div className="prvr-extended-item">
                                  <h4>影响力与重要性</h4>
                                  <p>{parsedReport.extended_review_items.impact_and_significance}</p>
                                </div>
                              )}
                              {parsedReport.extended_review_items.recommend_for_improvement && (
                                <div className="prvr-extended-item">
                                  <h4>改进建议</h4>
                                  <p>{parsedReport.extended_review_items.recommend_for_improvement}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </section>
                      )}
                    </div>
                  ) : (
                    /* 降级：无法解析 JSON 时显示原始 Markdown */
                    <div className="prvr-review-report prvr-fallback-report">
                      <MarkdownRenderer content={task.final_review_content || task.review_content} />
                    </div>
                  )}
                  
                  {/* 三审独立结果 - 卡片点击打开侧边面板 */}
                  {task.reviews && task.reviews.length > 0 && (
                    <section className="prvr-report-section prvr-section-reviewers">
                      <h3 className="prvr-section-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        三位审稿人独立意见 ({task.reviews.filter(r => r.status === 'completed').length}/3)
                      </h3>
                      <div className="prvr-section-content">
                        <div className="prvr-reviewers-grid">
                          {task.reviews.map((review, idx) => (
                            <div 
                              key={idx} 
                              className={`prvr-reviewer-card ${review.status} ${review.status === 'completed' ? 'clickable' : ''}`}
                              onClick={() => {
                                if (review.status === 'completed') {
                                  setSelectedReviewer(review);
                                  setActiveDrawer('reviewer');
                                }
                              }}
                            >
                              <div className="prvr-reviewer-avatar">
                                {['A', 'B', 'C'][review.reviewer_index - 1] || review.reviewer_index}
                              </div>
                              <div className="prvr-reviewer-info">
                                <span className="prvr-reviewer-name">审稿人 {['A', 'B', 'C'][review.reviewer_index - 1] || review.reviewer_index}</span>
                                <span className={`prvr-reviewer-status ${review.status}`}>
                                  {review.status === 'completed' ? '已完成' : review.status === 'processing' ? '审稿中' : review.status === 'failed' ? '失败' : '等待中'}
                                </span>
                              </div>
                              {review.recommendation && (
                                <span className={`prvr-mini-badge ${getRecommendationClass(review.recommendation)}`}>
                                  {review.recommendation}
                                </span>
                              )}
                              {review.status === 'completed' && (
                                <svg className="prvr-reviewer-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="9 18 15 12 9 6"/>
                                </svg>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            {/* 右侧：辅助信息面板（仅审稿人详情） */}
            {activeDrawer === 'reviewer' && selectedReviewer && (
              <div className="prvr-report-right">
                <div className="prvr-panel">
                  <div className="prvr-panel-header">
                    <span className="prvr-panel-title">
                      {`审稿人 ${['A', 'B', 'C'][selectedReviewer.reviewer_index - 1] || selectedReviewer.reviewer_index} 的意见`}
                    </span>
                    <button className="prvr-panel-close" onClick={() => { setActiveDrawer(null); setSelectedReviewer(null); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="prvr-panel-body">
                    <div className="prvr-panel-content prvr-reviewer-detail">
                        {/* 推荐意见 */}
                        {selectedReviewer.recommendation && (
                          <div className="prvr-reviewer-recommendation">
                            <span className={`prvr-recommendation-badge ${getRecommendationClass(selectedReviewer.recommendation)}`}>
                              {selectedReviewer.recommendation}
                            </span>
                          </div>
                        )}
                        
                        {/* 解析审稿人的 JSON 报告 */}
                        {(() => {
                          const reviewerReport = parseReviewerReport(selectedReviewer.review_content);
                          if (reviewerReport) {
                            return (
                              <div className="prvr-reviewer-structured">
                                {/* 总体评估 */}
                                {reviewerReport.overall_assessment?.summary && (
                                  <div className="prvr-panel-item">
                                    <span className="prvr-panel-label">总体评估</span>
                                    <p className="prvr-panel-value">{reviewerReport.overall_assessment.summary}</p>
                                  </div>
                                )}
                                
                                {/* 关键问题 */}
                                {reviewerReport.critical_issues?.length > 0 && (
                                  <div className="prvr-panel-item">
                                    <span className="prvr-panel-label">关键问题 ({reviewerReport.critical_issues.length})</span>
                                    <div className="prvr-panel-issues">
                                      {reviewerReport.critical_issues.map((issue, idx) => (
                                        <div key={idx} className="prvr-panel-issue">
                                          <span className="prvr-panel-issue-num">{idx + 1}</span>
                                          <span className="prvr-panel-issue-text">
                                            {issue.issue_title || issue.issue || issue.title || (typeof issue === 'string' ? issue : '问题 ' + (idx + 1))}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                {/* 改进建议 */}
                                {reviewerReport.other_suggestions?.length > 0 && (
                                  <div className="prvr-panel-item">
                                    <span className="prvr-panel-label">改进建议 ({reviewerReport.other_suggestions.length})</span>
                                    <div className="prvr-panel-suggestions">
                                      {reviewerReport.other_suggestions.map((sug, idx) => (
                                        <div key={idx} className="prvr-panel-suggestion">
                                          <span className="prvr-panel-suggestion-num">{idx + 1}</span>
                                          <span className="prvr-panel-suggestion-text">
                                            {sug.suggestion_title || sug.suggestion || sug.title || (typeof sug === 'string' ? sug : '建议 ' + (idx + 1))}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* 雷达图 */}
                                {reviewerReport.extended_review_items && (
                                  <div className="prvr-panel-item">
                                    <span className="prvr-panel-label">评分维度</span>
                                    <ReviewRadarChart 
                                      extendedItems={reviewerReport.extended_review_items} 
                                      compact={true}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            // 降级：显示原始内容
                            return (
                              <div className="prvr-panel-item">
                                <span className="prvr-panel-label">审稿意见</span>
                                <div className="prvr-panel-markdown">
                                  <MarkdownRenderer content={selectedReviewer.review_content} />
                                </div>
                              </div>
                            );
                          }
                        })()}
                    </div>
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
