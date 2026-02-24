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

import React, { useState, useCallback, useEffect, useRef, lazy, Suspense, useMemo } from 'react';
import { useSidebar } from '../../contexts/SidebarContext';
import { useAuth } from '../../utils/AuthContext';
import FileTree from '../../components/latex-writer/FileTree';
import LatexEditor from '../../components/latex-writer/LatexEditor';
import AiChatPanel from '../../components/latex-writer/AiChatPanel';
import PdfPreview from '../../components/latex-writer/PdfPreview';
import LatexCompiler from '../../components/latex-writer/LatexCompiler';
import { userAPI } from '../../services/api';
import SEO from '../../components/SEO';
import './LaTeXWriterPage.css';

// 懒加载 AuthModal
const AuthModal = lazy(() => import('../../components/AuthModal'));

// 默认 LaTeX 模板（兼容在线编译器的标准学术论文格式）
const DEFAULT_LATEX_TEMPLATE = `\\documentclass[12pt,a4paper]{article}

% 基础宏包
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[hidelinks]{hyperref}
\\usepackage[margin=1in]{geometry}
\\usepackage{setspace}

% 设置行距
\\onehalfspacing

\\title{My Paper Title}
\\author{Author Name\\\\
\\small Institution Name\\\\
\\small \\texttt{email@example.com}}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract goes here. This should be a concise summary of your research, including the background, methods, results, and conclusions. Typically 150-300 words.
\\end{abstract}

\\textbf{Keywords:} keyword1, keyword2, keyword3

\\section{Introduction}
Start writing your introduction here. Introduce the background, motivation, and objectives of your research.

\\section{Related Work}
Review relevant literature and previous studies in this area.

\\section{Methods}
Describe your methodology in detail. Include any mathematical formulations if necessary:

\\begin{equation}
E = mc^2
\\end{equation}

\\section{Results}
Present your experimental or theoretical results. You can use tables like this:

\\begin{table}[h]
\\centering
\\caption{Sample Results}
\\begin{tabular}{lcc}
\\toprule
Method & Accuracy & Time (s) \\\\
\\midrule
Method A & 0.85 & 1.2 \\\\
Method B & 0.92 & 2.5 \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\section{Discussion}
Discuss the implications of your results and compare with previous work.

\\section{Conclusion}
Summarize your findings and suggest future research directions.

\\section*{Acknowledgments}
Thank those who contributed to this work.

\\begin{thebibliography}{9}
\\bibitem{ref1}
Author A, Author B.
\\textit{Title of the Paper}.
Journal Name, Vol. X, No. Y, pp. 1-10, 2024.
\\end{thebibliography}

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
  const { isAuthenticated } = useAuth();
  
  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // 项目/文档状态
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // 删除项目状态
  const [deleteConfirmProject, setDeleteConfirmProject] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // 编辑器状态
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [files, setFiles] = useState([]);
  
  // PDF 预览状态
  const [pdfUrl, setPdfUrl] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState(null);
  const [compileLog, setCompileLog] = useState(null); // 完整编译日志（用于 AI 修复）
  const [hasCompiledOnce, setHasCompiledOnce] = useState(false); // 是否已经编译过（用于显示初始化状态）
  
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
  
  // 打开的文件标签页
  const [openTabs, setOpenTabs] = useState([]);
  
  // 编辑器和聊天区域高度比例（编辑器占比，默认 66.67% 即 2:1）
  const [editorHeightRatio, setEditorHeightRatio] = useState(66.67);
  const [isVerticalResizing, setIsVerticalResizing] = useState(false);
  const centerPanelRef = useRef(null);
  
  // AI 聊天面板折叠状态
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  
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

  // 删除项目
  const handleDeleteProject = async (project) => {
    if (!project) return;
    
    try {
      setIsDeleting(true);
      // 删除项目文件夹（后端会级联删除子文件和相关对话）
      await userAPI.deleteLatexDocument(project.id);
      
      // 从列表中移除
      setProjects(prev => prev.filter(p => p.id !== project.id));
      setDeleteConfirmProject(null);
      
      // 如果删除的是当前选中的项目，清空选中状态
      if (selectedProject?.id === project.id) {
        setSelectedProject(null);
        setSelectedFile(null);
        setContent('');
        setFiles([]);
      }
    } catch (error) {
      console.error('删除项目失败:', error);
      alert('删除项目失败，请重试');
    } finally {
      setIsDeleting(false);
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

  // 当选择文件时，添加到标签页
  useEffect(() => {
    if (selectedFile && !openTabs.find(tab => tab.id === selectedFile.id)) {
      setOpenTabs(prev => [...prev, selectedFile]);
    }
  }, [selectedFile, openTabs]);

  // 关闭标签页
  const handleCloseTab = useCallback((e, tabId) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(tab => tab.id !== tabId);
    setOpenTabs(newTabs);
    
    // 如果关闭的是当前选中的文件
    if (selectedFile?.id === tabId) {
      if (newTabs.length > 0) {
        // 选择最后一个标签页
        const lastTab = newTabs[newTabs.length - 1];
        handleFileSelect(lastTab);
      } else {
        setSelectedFile(null);
        setContent('');
      }
    }
  }, [openTabs, selectedFile, handleFileSelect]);

  // 切换标签页
  const handleTabClick = useCallback((tab) => {
    handleFileSelect(tab);
  }, [handleFileSelect]);

  // 从 LaTeX 内容中提取大纲
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
  
  // 让 AI 修复编译错误（通过普通对话方式）
  const handleAiFixError = useCallback((errorMessage) => {
    if (!errorMessage) return;
    
    // 使用完整的编译日志（如果有），否则使用错误消息
    const logToSend = compileLog || errorMessage;
    
    // 截取错误日志的关键部分（避免太长）
    const truncatedLog = logToSend.length > 1500 
      ? logToSend.substring(0, 1500) + '\n... (日志已截断)'
      : logToSend;
    
    // 构造修复请求消息
    const fixPrompt = `我的 LaTeX 代码编译出错了，请帮我分析并修复。

**编译错误：**
\`\`\`
${truncatedLog}
\`\`\`

请分析错误原因，并提供修复后的完整代码。`;
    
    // 通过正常对话方式发送
    if (aiChatRef.current && aiChatRef.current.sendMessage) {
      aiChatRef.current.sendMessage(fixPrompt);
    } else {
      setAiPendingMessage(fixPrompt);
    }
  }, [compileLog]);

  // AI 待发送消息（用于 AI 修复功能）
  const [aiPendingMessage, setAiPendingMessage] = useState(null);

  // 编译引擎状态
  const [engineStatus, setEngineStatus] = useState('unloaded');
  
  // 监听编译引擎状态
  useEffect(() => {
    const unsubscribe = LatexCompiler.addStatusListener(setEngineStatus);
    // 初始化时获取当前状态
    setEngineStatus(LatexCompiler.getStatus());
    return unsubscribe;
  }, []);
  
  // 页面加载时初始化编译引擎（不进行预热编译，宏包在首次编译时自动加载）
  useEffect(() => {
    let isMounted = true;
    
    const initEngine = async () => {
      // 延迟 300ms 避免阻塞初始渲染
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (!isMounted) return;
      
      console.log('[LaTeX] 开始初始化编译引擎...');
      
      try {
        // 只初始化引擎，不进行预热编译
        // 宏包会在首次实际编译时由引擎自动从 TexLive 服务器并行获取
        await LatexCompiler.initializeEngine();
        console.log('[LaTeX] 引擎初始化完成，宏包将在首次编译时自动加载');
      } catch (error) {
        console.error('[LaTeX] 引擎初始化失败:', error);
      }
    };
    
    initEngine();
    
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
    setCompileLog(null);
    setHasCompiledOnce(true); // 标记已经开始编译过
    
    try {
      const result = await LatexCompiler.compileLaTeX(content, selectedFile?.title || 'main.tex');
      
      if (result.success) {
        // 编译成功：更新 PDF URL，清除错误
        setPdfUrl(result.pdfUrl);
        setCompileError(null);
        setCompileLog(null);
      } else {
        // 编译失败：保存完整日志用于 AI 修复
        setCompileError(result.error || '编译失败，请检查 LaTeX 语法');
        setCompileLog(result.log || result.error || '编译失败'); // 保存完整日志
      }
    } catch (error) {
      console.error('编译失败:', error);
      setCompileError(error.message || '编译过程中发生错误');
      setCompileLog(error.message || '编译过程中发生错误');
    } finally {
      setIsCompiling(false);
    }
  }, [content, selectedFile]);

  // 选择新文件时重置编译状态
  useEffect(() => {
    if (!selectedFile) {
      setHasCompiledOnce(false);
      setPdfUrl(null);
      setCompileError(null);
    }
  }, [selectedFile]);

  // 首次加载时自动编译
  // 使用 ref 追踪当前文件 ID，避免重复编译
  const lastAutoCompiledFileIdRef = useRef(null);
  
  // 选择新文件时，立即显示"正在编译"状态
  useEffect(() => {
    if (!selectedFile) {
      return;
    }
    
    // 同一个文件已经处理过，不再触发
    if (lastAutoCompiledFileIdRef.current === selectedFile.id) {
      return;
    }
    
    // 内容为空或太短，不处理
    const trimmedContent = content.trim();
    if (!trimmedContent || trimmedContent.length < 30) {
      return;
    }
    
    // 立即设置编译状态，让 UI 显示"正在编译"
    setIsCompiling(true);
    
  }, [selectedFile, content]);
  
  // 引擎就绪后执行实际编译
  useEffect(() => {
    // 没有选择文件或不在编译状态，不处理
    if (!selectedFile || !isCompiling) {
      return;
    }
    
    // 同一个文件已经自动编译过，不再触发
    if (lastAutoCompiledFileIdRef.current === selectedFile.id) {
      return;
    }
    
    // 内容为空或太短，取消编译状态
    const trimmedContent = content.trim();
    if (!trimmedContent || trimmedContent.length < 30) {
      setIsCompiling(false);
      return;
    }
    
    // 引擎还没就绪，继续等待
    if (engineStatus !== 'ready') {
      return;
    }
    
    // 标记当前文件已自动编译
    lastAutoCompiledFileIdRef.current = selectedFile.id;
    
    // 执行实际编译（handleCompile 内部会再次设置 isCompiling，但这没关系）
    console.log('[LaTeX] 首次加载自动编译，文件:', selectedFile.title);
    
    // 使用一个小延迟确保状态稳定
    const timer = setTimeout(() => {
      handleCompile();
    }, 100);
    
    return () => clearTimeout(timer);
    
  }, [selectedFile, content, engineStatus, isCompiling, handleCompile]);

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
    const containerWidth = rect.width;
    
    // 鼠标相对于容器左边缘的位置
    const mouseX = e.clientX - rect.left;
    
    // center-panel 的宽度应该是：mouseX - leftPanelWidth
    // center-panel 的百分比是相对于整个容器的，所以：
    // centerWidth% * containerWidth = mouseX - leftPanelWidth
    // centerWidth = ((mouseX - leftPanelWidth) / containerWidth) * 100
    let newWidthPercent = ((mouseX - leftPanelWidth) / containerWidth) * 100;
    
    // 限制范围：最小 20%, 最大 60%（相对于整个容器）
    newWidthPercent = Math.max(20, Math.min(60, newWidthPercent));
    
    setCenterWidth(newWidthPercent);
  }, [isResizing, isLeftPanelCollapsed]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // 监听鼠标事件（水平拖拽）
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

  // 垂直拖拽调整编辑器和聊天区域高度
  const handleVerticalResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsVerticalResizing(true);
  }, []);

  const handleVerticalResizeMove = useCallback((e) => {
    if (!isVerticalResizing || !centerPanelRef.current) return;
    
    const container = centerPanelRef.current;
    const rect = container.getBoundingClientRect();
    const toolbarHeight = 40; // 顶部工具栏高度
    const availableHeight = rect.height - toolbarHeight;
    
    // 鼠标相对于可用区域顶部的位置
    const mouseY = e.clientY - rect.top - toolbarHeight;
    
    // 计算编辑器高度百分比
    let newHeightPercent = (mouseY / availableHeight) * 100;
    
    // 限制范围：编辑器最小 30%, 最大 85%
    newHeightPercent = Math.max(30, Math.min(85, newHeightPercent));
    
    setEditorHeightRatio(newHeightPercent);
  }, [isVerticalResizing]);

  const handleVerticalResizeEnd = useCallback(() => {
    setIsVerticalResizing(false);
  }, []);

  // 监听鼠标事件（垂直拖拽）
  useEffect(() => {
    if (isVerticalResizing) {
      window.addEventListener('mousemove', handleVerticalResizeMove);
      window.addEventListener('mouseup', handleVerticalResizeEnd);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        window.removeEventListener('mousemove', handleVerticalResizeMove);
        window.removeEventListener('mouseup', handleVerticalResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isVerticalResizing, handleVerticalResizeMove, handleVerticalResizeEnd]);

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
          <h2>ScholayPrism</h2>
          <p style={{ marginBottom: 8 }}>专为学术写作打造的在线 LaTeX 编辑器，支持实时编译预览和 AI 辅助写作。登录即可免费使用。</p>
          <button 
            className="latex-writer-login-btn"
            onClick={() => setShowAuthModal(true)}
          >
            立即登录
          </button>
          <p className="latex-writer-auth-hint">
            还没有账号？
            <button 
              className="latex-writer-register-link"
              onClick={() => setShowAuthModal(true)}
            >
              免费注册
            </button>
          </p>
          <a
            href="/features/latex-writer"
            style={{
              display: 'inline-block',
              marginTop: 12,
              fontSize: 13,
              color: 'var(--text-tertiary)',
              textDecoration: 'none',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#E74C3C'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
          >
            了解 ScholayPrism 全部功能 →
          </a>
        </div>
        
        {/* 登录/注册弹窗 */}
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
          <h1>ScholayPrism</h1>
          <p>全新推出原生支持 LaTeX 的免费工作空间，将 GPT‑5.2 无缝融入你的科研写作与协作流程</p>
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
                      {/* 删除按钮 - hover 时显示 */}
                      <button
                        className="latex-writer-project-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmProject(project);
                        }}
                        title="删除项目"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          <line x1="10" y1="11" x2="10" y2="17"/>
                          <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                      </button>
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

        {/* 删除确认弹窗 */}
        {deleteConfirmProject && (
          <div className="latex-writer-delete-modal-overlay" onClick={() => setDeleteConfirmProject(null)}>
            <div className="latex-writer-delete-modal" onClick={(e) => e.stopPropagation()}>
              <div className="latex-writer-delete-modal-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h3>确认删除项目</h3>
              <p>
                确定要删除项目 <strong>"{deleteConfirmProject.title}"</strong> 吗？
              </p>
              <p className="latex-writer-delete-warning">
                此操作将永久删除该项目下的所有文件和 AI 对话记录，且无法恢复。
              </p>
              <div className="latex-writer-delete-modal-actions">
                <button 
                  className="latex-writer-delete-cancel-btn"
                  onClick={() => setDeleteConfirmProject(null)}
                  disabled={isDeleting}
                >
                  取消
                </button>
                <button 
                  className="latex-writer-delete-confirm-btn"
                  onClick={() => handleDeleteProject(deleteConfirmProject)}
                  disabled={isDeleting}
                >
                  {isDeleting ? '删除中...' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 主编辑界面
  return (
    <div className="latex-writer-page">
      <SEO
        title="ScholayPrism - 在线LaTeX编辑器 | AI辅助科研写作"
        description="ScholayPrism 是 Scholay 推出的在线 LaTeX 编辑器，原生支持 LaTeX 编译，集成AI辅助写作，帮助研究者高效撰写学术论文。"
        keywords="LaTeX编辑器,在线LaTeX,学术写作,AI写作助手,论文编辑器,ScholayPrism"
        canonical="/latex-writer"
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
              projectName={selectedProject?.title}
              onBackToProjects={() => setSelectedProject(null)}
              isAuthenticated={isAuthenticated}
              onLoginClick={() => setShowAuthModal(true)}
              projects={projects}
              currentProjectId={selectedProject?.id}
              onSelectProject={(project) => {
                setSelectedProject(project);
                setSelectedFile(null);
                setContent('');
              }}
            />
          </div>
        )}
        
        {/* 中间：编辑区 + AI对话 */}
        <div 
          ref={centerPanelRef}
          className="latex-writer-center-panel"
          style={{ 
            width: isRightPanelCollapsed ? '100%' : `${centerWidth}%`,
            flex: isRightPanelCollapsed ? 1 : 'none'
          }}
        >
          {selectedFile ? (
            <>
              {/* 文件标签页 */}
              <div className="latex-writer-tabs">
                {openTabs.map(tab => (
                  <button
                    key={tab.id}
                    className={`latex-writer-tab ${selectedFile?.id === tab.id ? 'active' : ''}`}
                    onClick={() => handleTabClick(tab)}
                  >
                    <span className="latex-writer-tab-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </span>
                    <span>{tab.title}</span>
                    <button 
                      className="latex-writer-tab-close"
                      onClick={(e) => handleCloseTab(e, tab.id)}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </button>
                ))}
                <div className="latex-writer-tabs-spacer" />
                <div className="latex-writer-tabs-tools">
                  <button 
                    className="latex-writer-tabs-btn"
                    onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
                    title={isLeftPanelCollapsed ? '显示侧边栏' : '隐藏侧边栏'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <line x1="9" y1="3" x2="9" y2="21"/>
                    </svg>
                  </button>
                  <button 
                    className="latex-writer-tabs-btn"
                    onClick={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)}
                    title={isRightPanelCollapsed ? '显示 PDF 预览' : '隐藏 PDF 预览'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <line x1="15" y1="3" x2="15" y2="21"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* 代码编辑器 - 支持 inline diff 模式 */}
              <div 
                className="latex-writer-editor-area"
                style={{ 
                  flex: isChatCollapsed ? 1 : 'none',
                  height: isChatCollapsed ? '100%' : `${editorHeightRatio}%`
                }}
              >
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
              
              {/* 垂直分割线 - 可拖拽调整编辑器和聊天区域高度 */}
              {!isChatCollapsed && (
                <div 
                  className={`latex-writer-vertical-resizer ${isVerticalResizing ? 'active' : ''}`}
                  onMouseDown={handleVerticalResizeStart}
                />
              )}
              
              {/* AI 对话面板 */}
              <div 
                className={`latex-writer-chat-area ${isChatCollapsed ? 'collapsed' : ''}`}
                style={!isChatCollapsed ? { 
                  flex: 'none',
                  height: `calc(${100 - editorHeightRatio}% - 4px)` // 4px 是分割线高度
                } : undefined}
              >
                <AiChatPanel
                  ref={aiChatRef}
                  documentId={selectedFile?.id}
                  selectedText={selectedText}
                  fullContent={content}
                  onApplySuggestion={handleApplySuggestion}
                  cursorPosition={cursorPosition}
                  pendingMessage={aiPendingMessage}
                  onPendingMessageSent={() => setAiPendingMessage(null)}
                  isCollapsed={isChatCollapsed}
                  onToggleCollapse={() => setIsChatCollapsed(!isChatCollapsed)}
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
              isCompiling={isCompiling}
              error={compileError}
              onCompile={handleCompile}
              engineStatus={engineStatus}
              onAiFixError={handleAiFixError}
              latexContent={content}
              fileName={selectedFile?.title?.replace(/\.tex$/, '') || 'document'}
            />
          </div>
        )}
      </div>
      
      {/* 登录弹窗 - 确保在主编辑界面也可以显示 */}
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

export default LaTeXWriterPage;
