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
import DiffViewer from '../../components/latex-writer/DiffViewer';
import LatexToolbar from '../../components/latex-writer/LatexToolbar';
import LatexCompiler from '../../components/latex-writer/LatexCompiler';
import { userAPI } from '../../services/api';
import './LaTeXWriterPage.css';

// 默认 LaTeX 模板
const DEFAULT_LATEX_TEMPLATE = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
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
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState(null);
  
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

  // 处理 AI 建议应用
  const handleApplySuggestion = useCallback((suggestion) => {
    setDiffOldContent(selectedText || content);
    setDiffNewContent(suggestion);
    setShowDiff(true);
  }, [selectedText, content]);

  // 确认应用 diff
  const handleAcceptDiff = useCallback(() => {
    if (selectedText) {
      const newContent = content.replace(selectedText, diffNewContent);
      handleContentChange(newContent);
    } else {
      handleContentChange(diffNewContent);
    }
    setShowDiff(false);
    setDiffOldContent('');
    setDiffNewContent('');
  }, [content, selectedText, diffNewContent, handleContentChange]);

  // 拒绝 diff
  const handleRejectDiff = useCallback(() => {
    setShowDiff(false);
    setDiffOldContent('');
    setDiffNewContent('');
  }, []);

  // 编译引擎状态
  const [engineStatus, setEngineStatus] = useState('unloaded');
  
  // 监听编译引擎状态
  useEffect(() => {
    const unsubscribe = LatexCompiler.addStatusListener(setEngineStatus);
    // 初始化时获取当前状态
    setEngineStatus(LatexCompiler.getStatus());
    return unsubscribe;
  }, []);
  
  // 预加载编译引擎
  useEffect(() => {
    if (selectedFile && content) {
      // 延迟加载引擎，避免阻塞渲染
      const timer = setTimeout(() => {
        LatexCompiler.initializeEngine();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [selectedFile, content]);
  
  // 编译 PDF（使用 SwiftLaTeX WASM）
  const handleCompile = useCallback(async () => {
    if (!content.trim()) {
      setCompileError('请先编写 LaTeX 内容');
      return;
    }
    
    // 释放之前的 PDF URL
    if (pdfUrl) {
      LatexCompiler.revokePdfUrl(pdfUrl);
    }
    
    setIsCompiling(true);
    setCompileError(null);
    
    try {
      const result = await LatexCompiler.compileLaTeX(content, selectedFile?.title || 'main.tex');
      
      if (result.success) {
        setPdfUrl(result.pdfUrl);
      } else {
        setCompileError(result.error || '编译失败，请检查 LaTeX 语法');
      }
    } catch (error) {
      console.error('编译失败:', error);
      setCompileError(error.message || '编译过程中发生错误');
    } finally {
      setIsCompiling(false);
    }
  }, [content, selectedFile, pdfUrl]);

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
              {/* 代码编辑器 */}
              <div className="latex-writer-editor-area">
                <LatexEditor
                  ref={editorRef}
                  value={content}
                  onChange={handleContentChange}
                  onTextSelect={handleTextSelect}
                />
              </div>
              
              {/* AI 对话面板 */}
              <div className="latex-writer-chat-area">
                <AiChatPanel
                  selectedText={selectedText}
                  fullContent={content}
                  onApplySuggestion={handleApplySuggestion}
                  cursorPosition={cursorPosition}
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
            />
          </div>
        )}
      </div>
      
      {/* Diff 对比弹窗 */}
      {showDiff && (
        <DiffViewer
          oldContent={diffOldContent}
          newContent={diffNewContent}
          onAccept={handleAcceptDiff}
          onReject={handleRejectDiff}
          title="AI 修改建议"
        />
      )}
    </div>
  );
}

export default LaTeXWriterPage;
