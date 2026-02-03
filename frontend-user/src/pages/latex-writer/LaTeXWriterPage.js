/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX Writer - AI辅助LaTeX论文编辑器
 * 三栏布局：左侧文件树、中间编辑区（代码+对话）、右侧PDF预览
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSidebar } from '../../contexts/SidebarContext';
import { useAuth } from '../../utils/AuthContext';
import FileTree from '../../components/latex-writer/FileTree';
import LatexEditor from '../../components/latex-writer/LatexEditor';
import AiChatPanel from '../../components/latex-writer/AiChatPanel';
import PdfPreview from '../../components/latex-writer/PdfPreview';
// DiffViewer 已改为使用编辑器内的 inline diff 模式
import LatexToolbar from '../../components/latex-writer/LatexToolbar';
import LatexCompiler from '../../components/latex-writer/LatexCompiler';
import { userAPI } from '../../services/api';
import './LaTeXWriterPage.css';

// 默认 LaTeX 模板（英文）
const DEFAULT_LATEX_TEMPLATE = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{My Paper Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract goes here.
\\end{abstract}

\\section{Introduction}
Start writing your introduction here.

\\section{Methods}
Describe your methods.

\\section{Results}
Present your results.

\\section{Conclusion}
Summarize your findings.

\\end{document}
`;

// 中文 LaTeX 模板（使用 xeCJK，需要 XeTeX 引擎）
const CHINESE_LATEX_TEMPLATE = `\\documentclass{article}
\\usepackage{xeCJK}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{geometry}

% 设置中文字体（使用 Noto 字体，在线编译器支持）
\\setCJKmainfont{Noto Serif CJK SC}
\\setCJKsansfont{Noto Sans CJK SC}
\\setCJKmonofont{Noto Sans Mono CJK SC}

% 页面设置
\\geometry{a4paper, margin=2.5cm}

\\title{论文标题}
\\author{作者姓名}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
在此处填写摘要内容。
\\end{abstract}

\\section{引言}
在此处开始撰写引言部分。

\\section{方法}
描述您的研究方法。

\\section{结果}
展示您的研究结果。

\\section{结论}
总结您的研究发现。

\\end{document}
`;

function LaTeXWriterPage() {
  const { resetSidebarConfig } = useSidebar();
  const { isAuthenticated, showAuthModal } = useAuth();
  
  // 项目/文档状态
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // 编辑器状态
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [files, setFiles] = useState([]);
  
  // PDF 预览状态
  const [pdfUrl, setPdfUrl] = useState(null);
  const [lastSuccessfulPdf, setLastSuccessfulPdf] = useState(null); // 保存上一次成功的 PDF
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState(null);
  const [autoCompileEnabled, setAutoCompileEnabled] = useState(true); // 自动编译开关
  const [hasInitialCompiled, setHasInitialCompiled] = useState(false); // 是否已执行初始编译
  
  // AI 对话状态
  const [selectedText, setSelectedText] = useState('');
  const [cursorPosition, setCursorPosition] = useState({ line: 0, ch: 0 });
  
  // Diff 对比状态
  const [showDiff, setShowDiff] = useState(false);
  const [diffOldContent, setDiffOldContent] = useState('');
  const [diffNewContent, setDiffNewContent] = useState('');
  
  // 布局状态
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  
  // 可调整宽度状态
  const [centerWidth, setCenterWidth] = useState(50); // 中间区域占比 (%)
  const [isResizing, setIsResizing] = useState(false);
  
  // 编辑器引用
  const editorRef = useRef(null);
  const contentRef = useRef(null);

  // 进入页面时清空侧边栏历史记录
  useEffect(() => {
    resetSidebarConfig();
  }, [resetSidebarConfig]);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoadingProjects(false);
      return;
    }
    
    try {
      setIsLoadingProjects(true);
      const response = await userAPI.getLatexDocuments(true); // tree=true
      if (response.data.code === 0) {
        const docs = response.data.data || [];
        // 筛选出顶级文件夹作为项目
        const projectFolders = docs.filter(d => d.is_folder && !d.parent_id);
        setProjects(projectFolders);
        
        // 如果没有项目，显示创建引导
        if (projectFolders.length === 0) {
          setShowCreateProject(true);
        }
      }
    } catch (error) {
      console.error('加载项目失败:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [isAuthenticated]);

  // 登录状态变化时加载项目
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 创建新项目
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    
    try {
      setIsCreating(true);
      // 创建项目文件夹
      const folderResponse = await userAPI.createLatexDocument({
        title: newProjectName.trim(),
        is_folder: true
      });
      
      if (folderResponse.data.code === 0) {
        const projectFolder = folderResponse.data.data;
        
        // 在项目中创建 main.tex 文件
        const fileResponse = await userAPI.createLatexDocument({
          title: 'main.tex',
          content: DEFAULT_LATEX_TEMPLATE,
          parent_id: projectFolder.id,
          is_folder: false
        });
        
        if (fileResponse.data.code === 0) {
          const mainFile = fileResponse.data.data;
          
          // 刷新项目列表
          await loadProjects();
          
          // 设置文件列表
          setFiles([mainFile]);
          
          // 选择新创建的项目
          setSelectedProject({
            ...projectFolder,
            children: [mainFile]
          });
          
          // 选择 main.tex 并加载内容
          setSelectedFile(mainFile);
          setContent(mainFile.content || DEFAULT_LATEX_TEMPLATE);
        }
        
        setShowCreateProject(false);
        setNewProjectName('');
      }
    } catch (error) {
      console.error('创建项目失败:', error);
      alert('创建项目失败，请重试');
    } finally {
      setIsCreating(false);
    }
  };

  // 选择项目
  const handleSelectProject = useCallback(async (project) => {
    setSelectedProject(project);
    
    // 加载项目中的文件
    try {
      const response = await userAPI.getLatexDocuments(true);
      if (response.data.code === 0) {
        const docs = response.data.data || [];
        
        // 查找 children
        const projectWithChildren = docs.find(d => d.id === project.id);
        const children = projectWithChildren?.children || [];
        
        setFiles(children);
        
        // 自动选择第一个 .tex 文件
        const mainFile = children.find(f => !f.is_folder && f.title?.endsWith('.tex'));
        const firstFile = mainFile || children.find(f => !f.is_folder);
        
        if (firstFile) {
          // 获取文件详情
          try {
            const fileResponse = await userAPI.getLatexDocument(firstFile.id);
            if (fileResponse.data.code === 0) {
              const fileData = fileResponse.data.data;
              setSelectedFile(fileData);
              setContent(fileData.content || '');
            }
          } catch (error) {
            console.error('加载文件内容失败:', error);
            setSelectedFile(firstFile);
            setContent(firstFile.content || '');
          }
        } else {
          setSelectedFile(null);
          setContent('');
        }
      }
    } catch (error) {
      console.error('加载项目文件失败:', error);
    }
  }, []);

  // 处理文件选择
  const handleFileSelect = useCallback(async (file) => {
    if (file.is_folder) return;
    
    try {
      // 获取文件详情
      const response = await userAPI.getLatexDocument(file.id);
      if (response.data.code === 0) {
        const fileData = response.data.data;
        setSelectedFile(fileData);
        setContent(fileData.content || '');
      }
    } catch (error) {
      console.error('加载文件失败:', error);
    }
  }, []);

  // 处理内容变化（带防抖保存）
  const saveTimeoutRef = useRef(null);
  const handleContentChange = useCallback((newContent) => {
    setContent(newContent);
    
    // 防抖保存到后端
    if (selectedFile && selectedFile.id) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await userAPI.updateLatexDocument(selectedFile.id, {
            content: newContent
          });
        } catch (error) {
          console.error('保存失败:', error);
        }
      }, 1000);
    }
  }, [selectedFile]);

  // 处理文本选择
  const handleTextSelect = useCallback((text, position) => {
    setSelectedText(text);
    if (position) {
      setCursorPosition(position);
    }
  }, []);

  // 处理 AI 建议应用 - 使用编辑器内的 inline diff 模式
  const handleApplySuggestion = useCallback((suggestion) => {
    // 直接在编辑器中显示 diff，不使用弹窗
    setDiffNewContent(suggestion);
    setShowDiff(true);
  }, []);

  // 确认应用 diff
  const handleAcceptDiff = useCallback(() => {
    // 应用新内容到编辑器
    handleContentChange(diffNewContent);
    // 退出 diff 模式
    setShowDiff(false);
    setDiffOldContent('');
    setDiffNewContent('');
  }, [diffNewContent, handleContentChange]);

  // 拒绝 diff
  const handleRejectDiff = useCallback(() => {
    // 退出 diff 模式，保持原内容不变
    setShowDiff(false);
    setDiffOldContent('');
    setDiffNewContent('');
  }, []);

  // AI 聊天面板引用
  const aiChatRef = useRef(null);
  
  // 让 AI 修复编译错误
  const handleAiFixError = useCallback((errorMessage) => {
    if (!errorMessage) return;
    
    // 构造修复请求消息
    const fixPrompt = `我的 LaTeX 代码编译出错了，请帮我修复。

错误信息:
\`\`\`
${errorMessage}
\`\`\`

请分析错误原因并提供修复后的完整 LaTeX 代码。`;
    
    // 触发 AI 聊天发送消息（通过设置一个状态来触发）
    // 这里我们使用一个简单的方式：将错误信息放到 selectedText 中触发对话
    setSelectedText(content.substring(0, Math.min(content.length, 500))); // 选中部分代码作为上下文
    
    // 模拟用户在 AI 聊天面板中输入修复请求
    // 由于 AiChatPanel 是独立组件，我们通过 props 传递一个触发消息
    if (aiChatRef.current && aiChatRef.current.sendMessage) {
      aiChatRef.current.sendMessage(fixPrompt);
    } else {
      // 如果没有直接的 ref 方法，我们使用事件或状态
      // 这里简化处理：设置一个待发送的消息状态
      setAiPendingMessage(fixPrompt);
    }
  }, [content]);

  // AI 待发送消息（用于 AI 修复功能）
  const [aiPendingMessage, setAiPendingMessage] = useState(null);

  // 编译引擎状态
  const [engineStatus, setEngineStatus] = useState('unloaded');
  const [isPreloading, setIsPreloading] = useState(false);
  
  // 监听编译引擎状态
  useEffect(() => {
    const unsubscribe = LatexCompiler.addStatusListener(setEngineStatus);
    // 初始化时获取当前状态
    setEngineStatus(LatexCompiler.getStatus());
    return unsubscribe;
  }, []);
  
  // 页面加载时立即预加载编译引擎和常用宏包
  useEffect(() => {
    let isMounted = true;
    
    const preloadEngine = async () => {
      // 延迟 500ms 避免阻塞初始渲染
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!isMounted) return;
      
      console.log('[LaTeX] 开始预加载编译引擎...');
      setIsPreloading(true);
      
      try {
        // 初始化引擎
        const initialized = await LatexCompiler.initializeEngine();
        
        if (initialized && isMounted) {
          console.log('[LaTeX] 引擎初始化完成，开始预热编译...');
          
          // 使用与默认模板相同的结构预热，预加载所有需要的宏包和字体
          const warmupDoc = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Warmup}
\\author{System}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Abstract text.
\\end{abstract}

\\section{Section One}
Text with \\textbf{bold} and \\textit{italic}.

\\section{Section Two}
More text here.

\\section{Section Three}
Additional content.

\\section{Section Four}
Final section.

\\end{document}`;
          
          // 静默预热编译（不显示结果）
          try {
            await LatexCompiler.compileLaTeX(warmupDoc, '_warmup.tex');
            console.log('[LaTeX] 预热编译完成，常用宏包和字体已缓存');
          } catch (e) {
            console.log('[LaTeX] 预热编译完成（可能有警告）');
          }
        }
      } catch (error) {
        console.error('[LaTeX] 引擎预加载失败:', error);
      } finally {
        if (isMounted) {
          setIsPreloading(false);
        }
      }
    };
    
    preloadEngine();
    
    return () => {
      isMounted = false;
    };
  }, []); // 只在组件挂载时运行一次
  
  // 编译 PDF（使用 SwiftLaTeX WASM）
  const handleCompile = useCallback(async () => {
    if (!content.trim()) {
      setCompileError('请先编写 LaTeX 内容');
      return;
    }
    
    setIsCompiling(true);
    setCompileError(null);
    
    try {
      const result = await LatexCompiler.compileLaTeX(content, selectedFile?.title || 'main.tex');
      
      if (result.success) {
        // 保存当前成功的 PDF 作为备份
        if (pdfUrl) {
          // 不立即释放旧的 PDF URL，将其作为上一次成功的 PDF 保存
          setLastSuccessfulPdf(pdfUrl);
        }
        setPdfUrl(result.pdfUrl);
        setCompileError(null);
        setHasInitialCompiled(true);
      } else {
        // 编译失败时保留上一次成功的 PDF
        setCompileError(result.error || '编译失败，请检查 LaTeX 语法');
        // 如果这是第一次编译失败，将当前 PDF 设为上一次成功的
        if (pdfUrl && !lastSuccessfulPdf) {
          setLastSuccessfulPdf(pdfUrl);
        }
      }
    } catch (error) {
      console.error('编译失败:', error);
      setCompileError(error.message || '编译过程中发生错误');
    } finally {
      setIsCompiling(false);
    }
  }, [content, selectedFile, pdfUrl, lastSuccessfulPdf]);

  // 自动编译定时器引用
  const autoCompileTimeoutRef = useRef(null);
  // 使用 ref 存储编译函数，避免依赖循环
  const handleCompileRef = useRef(handleCompile);
  handleCompileRef.current = handleCompile;
  
  // 追踪上一次编译的内容，避免重复编译相同内容
  const lastCompiledContentRef = useRef('');
  
  // 代码变动后自动编译（防抖 3 秒）
  useEffect(() => {
    // 不自动编译的条件
    if (!autoCompileEnabled || !selectedFile || isCompiling) {
      return;
    }
    
    const trimmedContent = content.trim();
    
    // 内容太短或为空，不编译
    if (trimmedContent.length < 50) {
      return;
    }
    
    // 如果内容与上次编译的相同，不重复编译
    if (trimmedContent === lastCompiledContentRef.current) {
      return;
    }
    
    // 清除之前的定时器
    if (autoCompileTimeoutRef.current) {
      clearTimeout(autoCompileTimeoutRef.current);
    }
    
    // 设置新的定时器（3 秒后自动编译）
    autoCompileTimeoutRef.current = setTimeout(() => {
      // 再次检查条件
      if (engineStatus === 'ready' && !isCompiling) {
        console.log('[LaTeX] 自动编译触发');
        lastCompiledContentRef.current = trimmedContent;
        handleCompileRef.current();
      }
    }, 3000);
    
    return () => {
      if (autoCompileTimeoutRef.current) {
        clearTimeout(autoCompileTimeoutRef.current);
      }
    };
  }, [content, autoCompileEnabled, selectedFile, isCompiling, engineStatus]); // 移除 handleCompile 依赖

  // 首次选择文件后自动编译（只执行一次）
  const initialCompileTriggeredRef = useRef(false);
  
  useEffect(() => {
    // 重置初始编译标记
    if (!selectedFile) {
      initialCompileTriggeredRef.current = false;
      setHasInitialCompiled(false);
      lastCompiledContentRef.current = '';
      return;
    }
    
    // 已经触发过初始编译，不再触发
    if (initialCompileTriggeredRef.current || hasInitialCompiled) {
      return;
    }
    
    const trimmedContent = content.trim();
    if (!trimmedContent || trimmedContent.length < 50) {
      return;
    }
    
    if (engineStatus === 'ready' && !isCompiling) {
      // 标记已触发，防止重复
      initialCompileTriggeredRef.current = true;
      
      // 延迟一点时间确保内容已加载
      const timer = setTimeout(() => {
        console.log('[LaTeX] 首次加载自动编译');
        lastCompiledContentRef.current = trimmedContent;
        handleCompileRef.current();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [selectedFile, content, engineStatus, hasInitialCompiled, isCompiling]); // 移除 handleCompile 依赖

  // 处理工具栏操作
  const handleToolbarAction = useCallback((action, value) => {
    if (editorRef.current) {
      editorRef.current.insertText(value);
    }
  }, []);

  // 创建新文件
  const handleCreateFile = useCallback(async (name, parentId = null) => {
    if (!selectedProject) return;
    
    try {
      const response = await userAPI.createLatexDocument({
        title: name,
        content: name.endsWith('.tex') ? DEFAULT_LATEX_TEMPLATE : '',
        parent_id: parentId || selectedProject.id,
        is_folder: false
      });
      
      if (response.data.code === 0) {
        const newFile = response.data.data;
        setFiles(prev => [...prev, newFile]);
        setSelectedFile(newFile);
        setContent(newFile.content || '');
      }
    } catch (error) {
      console.error('创建文件失败:', error);
    }
  }, [selectedProject]);

  // 创建新文件夹
  const handleCreateFolder = useCallback(async (name, parentId = null) => {
    if (!selectedProject) return;
    
    try {
      const response = await userAPI.createLatexDocument({
        title: name,
        parent_id: parentId || selectedProject.id,
        is_folder: true
      });
      
      if (response.data.code === 0) {
        setFiles(prev => [...prev, response.data.data]);
      }
    } catch (error) {
      console.error('创建文件夹失败:', error);
    }
  }, [selectedProject]);

  // 删除文件/文件夹
  const handleDeleteFile = useCallback(async (fileId) => {
    try {
      await userAPI.deleteLatexDocument(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      if (selectedFile?.id === fileId) {
        setSelectedFile(null);
        setContent('');
      }
    } catch (error) {
      console.error('删除失败:', error);
    }
  }, [selectedFile]);

  // 处理拖拽调整宽度
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !contentRef.current) return;
    
    const container = contentRef.current;
    const rect = container.getBoundingClientRect();
    const leftPanelWidth = isLeftPanelCollapsed ? 0 : 240; // 左侧面板宽度
    const availableWidth = rect.width - leftPanelWidth;
    const mouseX = e.clientX - rect.left - leftPanelWidth;
    
    // 计算中间区域的百分比 (最小 30%, 最大 70%)
    let newWidth = (mouseX / availableWidth) * 100;
    newWidth = Math.max(30, Math.min(70, newWidth));
    
    setCenterWidth(newWidth);
  }, [isResizing, isLeftPanelCollapsed]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // 监听鼠标事件
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // 未登录状态
  if (!isAuthenticated) {
    return (
      <div className="latex-writer-page latex-writer-auth-required">
        <div className="latex-writer-auth-card">
          <div className="latex-writer-auth-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2>需要登录</h2>
          <p>使用 LaTeX AI 论文编辑器需要先登录账号</p>
          <button 
            className="latex-writer-login-btn"
            onClick={() => showAuthModal('login')}
          >
            立即登录
          </button>
          <p className="latex-writer-auth-hint">
            还没有账号？
            <button 
              className="latex-writer-register-link"
              onClick={() => showAuthModal('register')}
            >
              免费注册
            </button>
          </p>
        </div>
      </div>
    );
  }

  // 加载中状态
  if (isLoadingProjects) {
    return (
      <div className="latex-writer-page latex-writer-loading">
        <div className="latex-writer-loading-spinner" />
        <p>加载中...</p>
      </div>
    );
  }

  // 没有选择项目 - 显示项目列表或创建引导
  if (!selectedProject) {
    return (
      <div className="latex-writer-page latex-writer-project-select">
        <div className="latex-writer-project-header">
          <h1>LaTeX AI 论文编辑器</h1>
          <p>使用 AI 对话方式撰写学术论文</p>
        </div>
        
        {/* 创建新项目 */}
        {showCreateProject ? (
          <div className="latex-writer-create-project">
            <h3>创建新项目</h3>
            <div className="latex-writer-create-form">
              <input
                type="text"
                placeholder="输入项目名称，如：我的毕业论文"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                autoFocus
              />
              <div className="latex-writer-create-actions">
                <button 
                  className="latex-writer-create-btn primary"
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || isCreating}
                >
                  {isCreating ? '创建中...' : '创建项目'}
                </button>
                {projects.length > 0 && (
                  <button 
                    className="latex-writer-create-btn secondary"
                    onClick={() => setShowCreateProject(false)}
                  >
                    取消
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 项目列表 */}
            <div className="latex-writer-project-list">
              <div className="latex-writer-project-list-header">
                <h3>我的项目</h3>
                <button 
                  className="latex-writer-new-project-btn"
                  onClick={() => setShowCreateProject(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  新建项目
                </button>
              </div>
              
              {projects.length > 0 ? (
                <div className="latex-writer-project-grid">
                  {projects.map(project => (
                    <div 
                      key={project.id}
                      className="latex-writer-project-card"
                      onClick={() => handleSelectProject(project)}
                    >
                      <div className="latex-writer-project-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                      </div>
                      <div className="latex-writer-project-info">
                        <h4>{project.title}</h4>
                        <span className="latex-writer-project-date">
                          {new Date(project.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="latex-writer-empty-projects">
                  <p>还没有项目，点击上方按钮创建第一个项目</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // 主编辑界面
  return (
    <div className="latex-writer-page">
      {/* 工具栏 */}
      <LatexToolbar 
        onAction={handleToolbarAction}
        onCompile={handleCompile}
        isCompiling={isCompiling}
        onToggleLeftPanel={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
        onToggleRightPanel={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)}
        isLeftPanelCollapsed={isLeftPanelCollapsed}
        isRightPanelCollapsed={isRightPanelCollapsed}
        projectName={selectedProject?.title}
        onBackToProjects={() => setSelectedProject(null)}
      />
      
      {/* 主内容区 */}
      <div className="latex-writer-content" ref={contentRef}>
        {/* 左侧：文件树 */}
        {!isLeftPanelCollapsed && (
          <div className="latex-writer-left-panel">
            <FileTree 
              files={files}
              selectedFile={selectedFile}
              onSelect={handleFileSelect}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onDelete={handleDeleteFile}
            />
          </div>
        )}
        
        {/* 中间：编辑区 + AI对话 */}
        <div 
          className="latex-writer-center-panel"
          style={{ 
            width: isRightPanelCollapsed ? '100%' : `${centerWidth}%`,
            flex: isRightPanelCollapsed ? 1 : 'none'
          }}
        >
          {selectedFile ? (
            <>
              {/* 代码编辑器 - 支持 inline diff 模式 */}
              <div className="latex-writer-editor-area">
                <LatexEditor
                  ref={editorRef}
                  value={content}
                  onChange={handleContentChange}
                  onTextSelect={handleTextSelect}
                  // Diff 模式属性
                  diffMode={showDiff}
                  diffNewContent={diffNewContent}
                  onAcceptDiff={handleAcceptDiff}
                  onRejectDiff={handleRejectDiff}
                />
              </div>
              
              {/* AI 对话面板 */}
              <div className="latex-writer-chat-area">
                <AiChatPanel
                  ref={aiChatRef}
                  documentId={selectedFile?.id}
                  selectedText={selectedText}
                  fullContent={content}
                  onApplySuggestion={handleApplySuggestion}
                  cursorPosition={cursorPosition}
                  pendingMessage={aiPendingMessage}
                  onPendingMessageSent={() => setAiPendingMessage(null)}
                />
              </div>
            </>
          ) : (
            <div className="latex-writer-no-file">
              <div className="latex-writer-no-file-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </div>
              <h3>选择或创建文件</h3>
              <p>从左侧文件树选择一个文件开始编辑，或创建新文件</p>
              <button 
                className="latex-writer-create-file-btn"
                onClick={() => handleCreateFile('untitled.tex')}
              >
                创建新文件
              </button>
            </div>
          )}
        </div>
        
        {/* 可拖拽分隔条 */}
        {!isRightPanelCollapsed && (
          <div 
            className={`latex-writer-resizer ${isResizing ? 'active' : ''}`}
            onMouseDown={handleResizeStart}
          />
        )}
        
        {/* 右侧：PDF 预览 */}
        {!isRightPanelCollapsed && (
          <div className="latex-writer-right-panel">
            <PdfPreview 
              pdfUrl={pdfUrl}
              lastSuccessfulPdf={lastSuccessfulPdf}
              isCompiling={isCompiling}
              error={compileError}
              onCompile={handleCompile}
              engineStatus={engineStatus}
              onAiFixError={handleAiFixError}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default LaTeXWriterPage;
