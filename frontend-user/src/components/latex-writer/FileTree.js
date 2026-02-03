/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 文件树组件
 * 适配后端数据结构：title, is_folder, parent_id, children
 */

import React, { useState, useCallback } from 'react';
import './FileTree.css';

// 文件图标
const FileIcon = ({ isFolder, title }) => {
  if (isFolder) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
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
        <text x="7" y="17" fontSize="7" fill="currentColor" stroke="none">TeX</text>
      </svg>
    );
  }
  if (ext === 'bib') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <text x="6" y="17" fontSize="6" fill="currentColor" stroke="none">BIB</text>
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
  const hasChildren = isFolder && item.children?.length > 0;

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
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* 展开/折叠箭头 */}
        {isFolder && (
          <span className={`file-tree-arrow ${isExpanded ? 'expanded' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </span>
        )}
        
        {/* 图标 */}
        <span className="file-tree-icon">
          <FileIcon isFolder={isFolder} title={item.title} />
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

function FileTree({ files, selectedFile, onSelect, onCreateFile, onCreateFolder, onDelete, onRename }) {
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState(null);

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

  // 构建树形结构（适配后端数据：parent_id, is_folder）
  // 注意：files 可能是某个项目文件夹的直接子项，所以需要特殊处理
  const buildTree = useCallback((items) => {
    if (!items || items.length === 0) return [];
    
    // 创建 ID 集合，用于判断 parent_id 是否在当前列表中
    const idSet = new Set(items.map(item => item.id));
    
    // 找出"根"节点：没有 parent_id，或者 parent_id 不在当前列表中
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
      {/* 头部 */}
      <div className="file-tree-header">
        <span className="file-tree-title">文件</span>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                  </svg>
                  新建文件夹
                </button>
              </div>
            </>
          )}
        </div>
      </div>

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
    </div>
  );
}

export default FileTree;
