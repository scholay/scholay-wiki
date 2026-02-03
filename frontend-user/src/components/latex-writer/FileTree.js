/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 文件树组件 - Prism 风格
 * 适配后端数据结构：title, is_folder, parent_id, children
 */

import React, { useState, useCallback } from 'react';
import './FileTree.css';

// 文件图标
const FileIcon = ({ isFolder, title, isExpanded }) => {
  if (isFolder) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {isExpanded ? (
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/>
        ) : (
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        )}
      </svg>
    );
  }
  
  // 根据文件扩展名显示不同图标
  const ext = title?.split('.').pop()?.toLowerCase();
  if (ext === 'tex') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    );
  }
  if (ext === 'bib') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    );
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    );
  }
  
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
};

// 单个文件/文件夹项
function FileTreeItem({ item, level = 0, selectedFile, onSelect, onDelete, onRename }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.title || '');
  const [showContextMenu, setShowContextMenu] = useState(false);

  const isSelected = selectedFile?.id === item.id;
  const isFolder = item.is_folder;

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    if (isFolder) {
      setIsExpanded(!isExpanded);
    } else {
      onSelect?.(item);
    }
  }, [item, isFolder, isExpanded, onSelect]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(true);
  }, []);

  const handleRename = useCallback(() => {
    setIsEditing(true);
    setShowContextMenu(false);
  }, []);

  const handleRenameSubmit = useCallback((e) => {
    e.preventDefault();
    if (editName.trim()) {
      onRename?.(item.id, editName.trim());
    }
    setIsEditing(false);
  }, [item.id, editName, onRename]);

  const handleDelete = useCallback(() => {
    if (window.confirm(`确定要删除 "${item.title}" 吗？`)) {
      onDelete?.(item.id);
    }
    setShowContextMenu(false);
  }, [item, onDelete]);

  return (
    <div className="file-tree-item-wrapper">
      <div
        className={`file-tree-item ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 12 + 12}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* 展开/折叠箭头 */}
        <span className={`file-tree-arrow ${isFolder ? 'visible' : ''} ${isExpanded ? 'expanded' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        
        {/* 图标 */}
        <span className="file-tree-icon">
          <FileIcon isFolder={isFolder} title={item.title} isExpanded={isExpanded} />
        </span>
        
        {/* 名称 */}
        {isEditing ? (
          <form onSubmit={handleRenameSubmit} className="file-tree-edit-form">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              autoFocus
              className="file-tree-edit-input"
            />
          </form>
        ) : (
          <span className="file-tree-name">{item.title}</span>
        )}
      </div>

      {/* 右键菜单 */}
      {showContextMenu && (
        <>
          <div className="file-tree-context-overlay" onClick={() => setShowContextMenu(false)} />
          <div className="file-tree-context-menu">
            <button onClick={handleRename}>重命名</button>
            <button onClick={handleDelete} className="danger">删除</button>
          </div>
        </>
      )}

      {/* 子项 */}
      {isFolder && isExpanded && item.children?.map(child => (
        <FileTreeItem
          key={child.id}
          item={child}
          level={level + 1}
          selectedFile={selectedFile}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}

function FileTree({ 
  files, 
  selectedFile, 
  onSelect, 
  onCreateFile, 
  onCreateFolder, 
  onDelete, 
  onRename,
  projectName,
  onBackToProjects,
  isAuthenticated = true,
  onLoginClick,
  // 新增：项目列表和切换
  projects = [],
  currentProjectId,
  onSelectProject,
}) {
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState(null);
  const [activeTab, setActiveTab] = useState('files'); // 'files' | 'chats'
  const [showLoginCard, setShowLoginCard] = useState(true);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const projectMenuRef = React.useRef(null);
  
  // 点击外部关闭项目菜单
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(event.target)) {
        setShowProjectMenu(false);
      }
    };
    
    if (showProjectMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showProjectMenu]);
  
  // 切换项目
  const handleProjectSelect = useCallback((project) => {
    setShowProjectMenu(false);
    if (project.id !== currentProjectId && onSelectProject) {
      onSelectProject(project);
    }
  }, [currentProjectId, onSelectProject]);

  const handleCreateNew = useCallback((type) => {
    setNewItemType(type);
    setNewItemName(type === 'file' ? 'new.tex' : 'new-folder');
    setShowNewMenu(false);
  }, []);

  const handleCreateSubmit = useCallback((e) => {
    e.preventDefault();
    if (newItemName.trim()) {
      if (newItemType === 'file') {
        onCreateFile?.(newItemName.trim());
      } else {
        onCreateFolder?.(newItemName.trim());
      }
    }
    setNewItemType(null);
    setNewItemName('');
  }, [newItemName, newItemType, onCreateFile, onCreateFolder]);

  // 构建树形结构
  const buildTree = useCallback((items) => {
    if (!items || items.length === 0) return [];
    
    const idSet = new Set(items.map(item => item.id));
    const roots = items.filter(item => !item.parent_id || !idSet.has(item.parent_id));
    
    const getChildren = (parentId) => {
      return items
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          ...item,
          children: item.is_folder ? getChildren(item.id) : undefined
        }));
    };
    
    return roots.map(item => ({
      ...item,
      children: item.is_folder ? getChildren(item.id) : undefined
    }));
  }, []);

  const treeData = buildTree(files);

  return (
    <div className="file-tree">
      {/* 项目头部 - 可下拉切换项目 */}
      <div className="file-tree-project-header" ref={projectMenuRef}>
        <button 
          className={`file-tree-project-btn ${showProjectMenu ? 'active' : ''}`}
          onClick={() => setShowProjectMenu(!showProjectMenu)}
          title="切换项目"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="file-tree-project-name">{projectName || '新建项目'}</span>
          <svg 
            className={`file-tree-project-arrow ${showProjectMenu ? 'rotated' : ''}`}
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        
        {/* 项目下拉菜单 */}
        {showProjectMenu && (
          <div className="file-tree-project-menu">
            <div className="file-tree-project-menu-header">
              <span>切换项目</span>
              <button 
                className="file-tree-project-menu-back"
                onClick={() => { setShowProjectMenu(false); onBackToProjects?.(); }}
                title="管理所有项目"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </div>
            <div className="file-tree-project-menu-list">
              {projects.length > 0 ? (
                projects.map(project => (
                  <button
                    key={project.id}
                    className={`file-tree-project-menu-item ${project.id === currentProjectId ? 'active' : ''}`}
                    onClick={() => handleProjectSelect(project)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span className="file-tree-project-menu-item-name">{project.title}</span>
                    {project.id === currentProjectId && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                ))
              ) : (
                <div className="file-tree-project-menu-empty">暂无其他项目</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 标签页切换 */}
      <div className="file-tree-tabs">
        <button 
          className={`file-tree-tab-btn ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          文件
        </button>
        <button 
          className={`file-tree-tab-btn ${activeTab === 'chats' ? 'active' : ''}`}
          onClick={() => setActiveTab('chats')}
        >
          Chats
        </button>
      </div>

      {/* 搜索和操作栏 */}
      <div className="file-tree-actions-bar">
        <button className="file-tree-search-btn" title="搜索">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <div className="file-tree-actions">
          <button
            className="file-tree-action-btn"
            onClick={() => setShowNewMenu(!showNewMenu)}
            title="新建"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          {showNewMenu && (
            <>
              <div className="file-tree-context-overlay" onClick={() => setShowNewMenu(false)} />
              <div className="file-tree-new-menu">
                <button onClick={() => handleCreateNew('file')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  新建文件
                </button>
                <button onClick={() => handleCreateNew('folder')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  新建文件夹
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 登录提示卡片 */}
      {!isAuthenticated && showLoginCard && (
        <div className="file-tree-login-card">
          <button 
            className="file-tree-login-card-close"
            onClick={() => setShowLoginCard(false)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div className="file-tree-login-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div className="file-tree-login-card-content">
            <p className="file-tree-login-card-title">不要失去访问权限</p>
            <p className="file-tree-login-card-desc">
              你尚未登录。登录后即可避免丢失项目，并可在其他设备上编辑与预览。
            </p>
          </div>
          <button className="file-tree-login-card-btn" onClick={onLoginClick}>
            登录或注册
          </button>
        </div>
      )}

      {/* 新建输入框 */}
      {newItemType && (
        <form onSubmit={handleCreateSubmit} className="file-tree-new-form">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onBlur={() => { setNewItemType(null); setNewItemName(''); }}
            placeholder={newItemType === 'file' ? '文件名.tex' : '文件夹名'}
            autoFocus
          />
        </form>
      )}

      {/* 文件列表 */}
      {activeTab === 'files' && (
        <div className="file-tree-content">
          {treeData.map(item => (
            <FileTreeItem
              key={item.id}
              item={item}
              selectedFile={selectedFile}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
          
          {treeData.length === 0 && (
            <div className="file-tree-empty">
              <p>暂无文件</p>
              <button onClick={() => handleCreateNew('file')}>
                创建第一个文件
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chats 占位 */}
      {activeTab === 'chats' && (
        <div className="file-tree-content">
          <div className="file-tree-empty">
            <p>暂无对话记录</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileTree;
