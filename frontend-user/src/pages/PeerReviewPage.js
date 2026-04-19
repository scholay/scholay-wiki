/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { peerReviewAPI } from '../services/payment.api';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../stores/sidebar.store';
import MessageModal from '../components/common/MessageModal';
import {
  VIEW_MODE,
  ALLOWED_FILE_TYPES,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_FILE_SIZE,
  MAX_ATTACHMENTS
} from '../utils/peer-review/constants';
import PeerReviewCreateSection from '../components/peer-review/PeerReviewCreateSection';
import { trackAIPeerReview } from '../utils/usageTracker';
import SEO from '../components/common/SEO';
import logger from '../utils/logger';

// 子组件
import { HistorySection, TaskDetailView } from './peer-review/components';

import './styles/PeerReviewPage.css';
import './styles/ReviewReport.css';

// 懒加载 AuthModal - 只在需要时加载
const AuthModal = lazy(() => import('../components/auth/AuthModal'));

/* PreviewCard 组件已移至 ./peer-review/components/PreviewCard.js */
/* HistorySection 组件已移至 ./peer-review/components/HistorySection.js */
/* TaskDetailView 组件已移至 ./peer-review/components/TaskDetailView.js */

export default function PeerReviewPage() {
  // navigate 保留供将来跳转使用
  // eslint-disable-next-line no-unused-vars
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { resetSidebarConfig } = useSidebar();
  
  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // 打开登录弹窗
  const openLoginModal = () => setShowAuthModal(true);

  // 进入页面时清空侧边栏历史记录
  useEffect(() => {
    resetSidebarConfig();
  }, [resetSidebarConfig]);

  // 视图状态
  const [viewMode, setViewMode] = useState(VIEW_MODE.HOME);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  
  // 标记是否已处理过 URL 参数（避免重复处理）
  const urlTaskIdHandled = useRef(false);

  // 任务列表状态
  const [tasks, setTasks] = useState([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const searchKeywordRef = useRef(''); // 使用 ref 避免重渲染

  // 草稿状态（从后端加载）
  const [inputType, setInputType] = useState('text');
  const [manuscriptText, setManuscriptText] = useState('');
  // targetVenue 和 modelLevel 已废弃，后端使用固定配置
  const [fileName, setFileName] = useState('');
  const [useFileInput, setUseFileInput] = useState(false); // 是否直接使用文件（不提取文本，如PDF、Word等）
  const [attachments, setAttachments] = useState([]); // 附件列表（每个附件项自己管理 uploading 状态）
  const [uploading, setUploading] = useState(false); // 主稿件上传中
  const [uploadProgress, setUploadProgress] = useState(0); // 上传进度 0-100
  const [submitting, setSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false); // 隐私模式

  // 任务详情状态
  const [taskDetail, setTaskDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // 步骤详情状态（三位审稿人的详细步骤）
  const [taskSteps, setTaskSteps] = useState({});
  const [stepsLoading, setStepsLoading] = useState(false);

  // 弹窗状态
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: null });

  // 轮询和防抖相关
  const pollingRef = useRef(null);
  const stepsPollingRef = useRef(null); // 步骤轮询
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
        // draftId 状态已移除，draft.id 仅用于内部逻辑
        setInputType(draft.input_type || 'text');
        setManuscriptText(draft.manuscript_text || '');
        // targetVenue 和 modelLevel 已废弃，不再从草稿加载
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
      logger.error('加载草稿失败:', error);
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
      logger.error('保存草稿失败:', error);
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
      file_name: fileName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputType, manuscriptText, fileName, user, draftLoading]);

  // 初始加载：获取草稿和任务列表
  // 用户登录后自动认领匿名任务
  useEffect(() => {
    if (!user) return;
    loadDraft();
    loadTasks();

    // 认领匿名任务：用户登录后，将之前匿名创建的任务绑定到账户
    const anonToken = peerReviewAPI.getAnonToken();
    if (anonToken && selectedTaskId) {
      peerReviewAPI.claimTask(selectedTaskId, anonToken)
        .then(() => {
          peerReviewAPI.clearAnonToken();
          loadTasks(); // 刷新列表以显示认领的任务
        })
        .catch(() => {
          // 认领失败不影响使用
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 从 URL 参数加载指定任务（匿名用户也可通过 taskId 查看自己的任务）
  useEffect(() => {
    if (urlTaskIdHandled.current) return;

    const taskIdFromUrl = searchParams.get('taskId');
    if (taskIdFromUrl) {
      // 匿名用户需要有 anon_token 才能查看任务
      const anonToken = peerReviewAPI.getAnonToken();
      if (!user && !anonToken) return;

      urlTaskIdHandled.current = true;
      // 延迟执行，确保任务列表已加载
      setTimeout(() => {
        viewTaskDetail(taskIdFromUrl);
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, searchParams]);

  // 分页变化时重新加载任务列表
  useEffect(() => {
    if (!user) return;
    loadTasks(searchKeywordRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      if (stepsPollingRef.current) {
        clearInterval(stepsPollingRef.current);
      }
    };
  }, []);

  // 加载任务列表
  const loadTasks = async (search = searchKeywordRef.current, page = currentPage) => {
    if (!user) return;
    
    setLoading(true);
    try {
      const response = await peerReviewAPI.getTaskList(page, 10, '', search);
      if (response.data?.code === 0) {
        setTasks(response.data.data.tasks || []);
        setTotalTasks(response.data.data.total || 0);
      }
    } catch (error) {
      logger.error('加载任务列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 处理搜索（不触发父组件重渲染）
  const handleSearch = (keyword) => {
    searchKeywordRef.current = keyword;
    setCurrentPage(1); // 搜索时重置到第一页
    loadTasks(keyword, 1); // 直接加载，不依赖 state 变化
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
  // 匿名用户也可上传，后端会生成 anon_token
  const uploadFile = (file) => {
    // 使用 flushSync 强制同步更新 UI，确保 loading 状态立即显示
    flushSync(() => {
      setUploading(true);
      setUploadProgress(0);
      setInputType('file');
      setFileName(file.name);
    });

    // 模拟进度：渐进式增长到90%
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          return prev;
        }
        // 越接近90%增长越慢
        const increment = Math.max(1, Math.floor((90 - prev) / 10));
        return Math.min(90, prev + increment);
      });
    }, 200);

    // 使用 setTimeout 确保 UI 更新后再发起请求
    setTimeout(() => {
      peerReviewAPI.uploadFile(file)
        .then(response => {
          clearInterval(progressInterval);
          setUploadProgress(100);

          if (response.data?.code === 0) {
            const data = response.data.data;
            // 匿名用户保存 anon_token
            if (data.anon_token) {
              peerReviewAPI.setAnonToken(data.anon_token);
            }
            // 更新为服务器返回的文件名
            setFileName(data.file_name || file.name);
            // 新结构：process_mode 为 'direct' 表示直接传AI
            const isDirect = data.process_mode === 'direct';
            setUseFileInput(isDirect);

            // 文件直传模式（PDF、Word等）不提取文本，使用预览信息
            if (isDirect) {
              setManuscriptText(data.content_preview || '');
            } else if (user) {
              // 登录用户重新加载草稿以获取提取的文本
              loadDraft();
            } else {
              // 匿名用户直接使用返回的预览
              setManuscriptText(data.content_preview || '');
            }
          } else {
            // 上传失败，清空文件状态
            setFileName('');
            setInputType('text');
            showMessage('error', '上传失败', response.data?.message || '文件上传失败');
          }
        })
        .catch(error => {
          clearInterval(progressInterval);
          logger.error('文件上传失败:', error);
          // 上传失败，清空文件状态
          setFileName('');
          setInputType('text');
          showMessage('error', '上传失败', error.response?.data?.message || error.message);
        })
        .finally(() => {
          // 延迟重置，让用户看到100%
          setTimeout(() => {
            setUploading(false);
            setUploadProgress(0);
          }, 300);
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
          logger.error('附件上传失败:', error);
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
      logger.error('删除附件失败:', error);
      showMessage('error', '删除失败', error.response?.data?.message || error.message);
    }
  };

  // 点击开始审稿按钮 - 直接提交（匿名用户也可使用）
  const handleSubmitDraft = async () => {
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

    // 记录智能审稿使用
    trackAIPeerReview();

    setSubmitting(true);
    try {
      // targetVenue 和 modelLevel 已废弃，后端使用固定配置
      const response = await peerReviewAPI.submitDraft('', 'mid', isPrivate);
      if (response.data?.code === 0) {
        const taskData = response.data.data;
        const taskId = taskData.task_id;

        // 匿名用户保存 anon_token
        if (taskData.anon_token) {
          peerReviewAPI.setAnonToken(taskData.anon_token);
        }

        // 立即构建初始任务对象，让页面能快速显示
        // 使用后端返回的数据，确保时间等字段准确（由后端生成）
        const initialTask = {
          id: taskId,
          status: 'pending',
          progress: 0,
          progress_stage: '等待处理',
          input_type: taskData.input_type || (fileName ? 'file' : 'text'),
          manuscript_text: taskData.manuscript_text || manuscriptText,
          // target_venue 和 model_level 已废弃
          // 后端返回的 created_at 实际是 submitted_at（提交时间）
          submitted_at: taskData.created_at,
          created_at: taskData.created_at,
          // 使用后端返回的文件信息
          manuscript_file: taskData.manuscript_file || (fileName ? { file_name: fileName } : null),
          // 使用后端返回的附件列表
          attachments: taskData.attachments || attachments,
        };

        // 清空本地草稿状态（仅清空本地，匿名用户不调用后端清空）
        if (user) {
          clearDraft();
        } else {
          // 匿名用户仅清空本地状态
          setManuscriptText('');
          setFileName('');
          setInputType('text');
          setUseFileInput(false);
          setAttachments([]);
        }

        // 先设置初始任务数据，让左侧信息立即显示
        setTaskDetail(initialTask);
        setSelectedTaskId(taskId);
        setViewMode(VIEW_MODE.DETAIL);

        // 更新 URL，添加 taskId 参数
        setSearchParams({ taskId });

        // 启动轮询获取进度
        startPolling(taskId);

        // 已登录用户刷新列表
        if (user) {
          loadTasks();
        }

        // 异步加载完整任务详情（不显示 loading）
        setTimeout(() => loadTaskDetail(taskId, false), 500);
      } else {
        showMessage('error', '提交失败', response.data?.message || '提交审稿失败');
      }
    } catch (error) {
      logger.error('提交审稿失败:', error);
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
        setFileName('');
        setInputType('text');
        setUseFileInput(false);
        setAttachments([]);
      } else {
        showMessage('error', '清空失败', response.data?.message || '清空草稿失败');
      }
    } catch (error) {
      logger.error('清空草稿失败:', error);
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
      logger.error('删除主稿件失败:', error);
      showMessage('error', '删除失败', error.response?.data?.message || error.message);
    }
  };

  // 查看任务详情
  const viewTaskDetail = async (taskId) => {
    // 先清空旧的任务详情，避免显示上一次的数据
    setTaskDetail(null);
    setSelectedTaskId(taskId);
    setViewMode(VIEW_MODE.DETAIL);
    
    // 更新 URL，添加 taskId 参数
    setSearchParams({ taskId });
    
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
      logger.error('加载任务详情失败:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  // 获取任务步骤详情
  const loadTaskSteps = async (taskId) => {
    if (!taskId) return;
    
    setStepsLoading(true);
    try {
      const response = await peerReviewAPI.getTaskSteps(taskId);
      if (response.data?.code === 0) {
        // 后端返回完整的 TaskStepsResponse
        const stepsResponse = response.data.data;
        setTaskSteps(stepsResponse || {});
      }
    } catch (error) {
      logger.error('获取任务步骤失败:', error);
    } finally {
      setStepsLoading(false);
    }
  };

  // 启动轮询（同时轮询进度和步骤）
  const startPolling = (taskId) => {
    stopPolling();
    
    // 进度轮询
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
            loadTaskSteps(taskId); // 最后获取一次步骤详情
          }
        }
      } catch (error) {
        logger.error('轮询失败:', error);
      }
    }, 2000);
    
    // 步骤详情轮询（间隔稍长）
    stepsPollingRef.current = setInterval(async () => {
      try {
        const response = await peerReviewAPI.getTaskSteps(taskId);
        if (response.data?.code === 0) {
          // 后端返回完整的 TaskStepsResponse
          const stepsResponse = response.data.data;
          setTaskSteps(stepsResponse || {});
        }
      } catch (error) {
        logger.error('步骤轮询失败:', error);
      }
    }, 3000);
    
    // 立即获取一次步骤详情
    loadTaskSteps(taskId);
  };

  // 停止轮询
  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (stepsPollingRef.current) {
      clearInterval(stepsPollingRef.current);
      stepsPollingRef.current = null;
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
            // 清除 URL 中的 taskId 参数
            setSearchParams({});
            urlTaskIdHandled.current = false;
          }
        }
      } catch (error) {
        logger.error('删除任务失败:', error);
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
    
    // 清除 URL 中的 taskId 参数
    setSearchParams({});
    
    // 重置 URL 处理标记，允许再次从 URL 加载
    urlTaskIdHandled.current = false;
    
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
      logger.error('启动任务失败:', error);
      showMessage('error', '启动失败', error.response?.data?.message || error.message);
    }
  };

  // 检查登录状态的辅助函数
  const requireLogin = (action) => {
    if (!user) {
      openLoginModal();
      return false;
    }
    return true;
  };

  // 构建文件下载 URL（支持匿名用户）
  const getDownloadUrl = (fileId) => {
    const params = new URLSearchParams();
    const token = localStorage.getItem('user_token');
    if (token) params.set('token', token);
    const anonToken = peerReviewAPI.getAnonToken();
    if (anonToken) params.set('anon_token', anonToken);
    const qs = params.toString();
    return `/api/v1/user/peer-review/files/${fileId}/download${qs ? '?' + qs : ''}`;
  };

  // 处理文本输入（匿名用户也可输入）
  const handleTextInput = (e) => {
    setManuscriptText(e.target.value);
  };

  // handleVenueInput 已废弃，投稿期刊功能已移除

  return (
    <div className="prv-page">
      <SEO
        title="智能审稿 - Scholay | AI论文评审与修改建议"
        description="Scholay 智能审稿服务，AI 多角度评审您的论文，提供专业的修改意见和改进建议，帮助提升论文质量和录用率。"
        keywords="AI审稿,智能审稿,论文评审,学术审稿,论文修改建议,peer review"
        canonical="/peer-review"
      />
      {/* 功能介绍横幅 */}
      {viewMode === VIEW_MODE.HOME && (
        <div style={{
          margin: '0 0 20px',
          padding: '16px 20px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(79,70,229,0.05) 100%)',
          border: '1px solid rgba(99,102,241,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
              AI 智能审稿 — 三位审稿人，五大维度全面评审
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              {user ? '上传论文即可获取期刊级审稿报告，支持隐私模式。' : '无需登录即可体验，登录后可保存审稿历史。'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => navigate('/features/peer-review')}
              style={{
                padding: '8px 18px', borderRadius: 999,
                border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)',
                color: '#818cf8', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              了解更多
            </button>
            {!user && (
              <button
                onClick={openLoginModal}
                style={{
                  padding: '8px 18px', borderRadius: 999,
                  border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.15)',
                  color: '#a5b4fc', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                登录
              </button>
            )}
          </div>
        </div>
      )}

      {/* 详情视图时显示返回按钮 */}
      {viewMode === VIEW_MODE.DETAIL && (
        <div className="prv-detail-header">
          <button className="prv-back-btn" onClick={backToHome}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            返回列表
          </button>
        </div>
      )}

      {/* 主内容区 - 仅用于首页 */}
      {viewMode === VIEW_MODE.HOME && (
        <div className="prv-main">
                {/* 上半部分：创建任务区域 */}
                <PeerReviewCreateSection
                  manuscriptText={manuscriptText}
                  onTextInput={handleTextInput}
                  fileName={fileName}
                  useFileInput={useFileInput}
                  attachments={attachments}
                  uploading={uploading}
                  uploadProgress={uploadProgress}
                  submitting={submitting}
                  isDragging={isDragging}
                  draftLoading={draftLoading}
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
                  isLoggedIn={!!user}
                  onRequireLogin={openLoginModal}
                  isPrivate={isPrivate}
                  onTogglePrivate={() => setIsPrivate(prev => !prev)}
                />

                {/* 下半部分：历史任务列表 - 仅登录用户显示 */}
                {user && (
                  <HistorySection
                    tasks={tasks}
                    loading={loading}
                    totalTasks={totalTasks}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    onSearch={handleSearch}
                    onViewDetail={viewTaskDetail}
                    onDelete={handleDeleteTask}
                  />
                )}
          </div>
        )}

        {/* 详情视图 - 独立布局 */}
        {viewMode === VIEW_MODE.DETAIL && (
          <TaskDetailView
            task={taskDetail}
            loading={detailLoading}
            onBack={backToHome}
            onDelete={() => handleDeleteTask(selectedTaskId)}
            onStartTask={handleStartTask}
            taskSteps={taskSteps}
            stepsLoading={stepsLoading}
            getDownloadUrl={getDownloadUrl}
          />
        )}

      {/* 消息弹窗 */}
      <MessageModal
        isOpen={modal.isOpen}
        onClose={closeModal}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onConfirm={modal.onConfirm}
      />

      {/* 登录注册弹窗 - 只在需要时加载 */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={() => setShowAuthModal(false)}
          />
        </Suspense>
      )}

    </div>
  );
}

// ========== 子组件说明 ==========
// CreateSection 已移至 components/PeerReviewCreateSection.js
// HistorySection 已移至 ./peer-review/components/HistorySection.js
// TaskDetailView 已移至 ./peer-review/components/TaskDetailView.js
// TaskDetailSidebar 已移至 ./peer-review/components/TaskDetailSidebar.js
// ReportSections 已移至 ./peer-review/components/ReportSections.js
