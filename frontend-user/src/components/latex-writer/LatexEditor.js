/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX 代码编辑器组件
 * 基于 CodeMirror 6，支持 LaTeX 语法高亮和 Inline Diff 模式
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import './LatexEditor.css';

/**
 * 简单的 diff 算法，计算行级别的差异
 */
function computeLineDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result = [];
  
  // 使用 LCS (Longest Common Subsequence) 的简化版本
  let oldIdx = 0;
  let newIdx = 0;
  
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      // 剩余的新行都是添加的
      result.push({ type: 'add', content: newLines[newIdx], newLineNum: newIdx + 1 });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // 剩余的旧行都是删除的
      result.push({ type: 'remove', content: oldLines[oldIdx], oldLineNum: oldIdx + 1 });
      oldIdx++;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      // 相同的行
      result.push({ type: 'same', content: oldLines[oldIdx], oldLineNum: oldIdx + 1, newLineNum: newIdx + 1 });
      oldIdx++;
      newIdx++;
    } else {
      // 不同的行 - 尝试向前查找匹配
      let foundInOld = -1;
      let foundInNew = -1;
      
      // 在旧行中查找当前新行
      for (let i = oldIdx + 1; i < Math.min(oldIdx + 5, oldLines.length); i++) {
        if (oldLines[i] === newLines[newIdx]) {
          foundInOld = i;
          break;
        }
      }
      
      // 在新行中查找当前旧行
      for (let i = newIdx + 1; i < Math.min(newIdx + 5, newLines.length); i++) {
        if (newLines[i] === oldLines[oldIdx]) {
          foundInNew = i;
          break;
        }
      }
      
      if (foundInOld !== -1 && (foundInNew === -1 || foundInOld - oldIdx <= foundInNew - newIdx)) {
        // 旧行被删除
        while (oldIdx < foundInOld) {
          result.push({ type: 'remove', content: oldLines[oldIdx], oldLineNum: oldIdx + 1 });
          oldIdx++;
        }
      } else if (foundInNew !== -1) {
        // 新行被添加
        while (newIdx < foundInNew) {
          result.push({ type: 'add', content: newLines[newIdx], newLineNum: newIdx + 1 });
          newIdx++;
        }
      } else {
        // 都没找到，视为修改
        result.push({ type: 'remove', content: oldLines[oldIdx], oldLineNum: oldIdx + 1 });
        result.push({ type: 'add', content: newLines[newIdx], newLineNum: newIdx + 1 });
        oldIdx++;
        newIdx++;
      }
    }
  }
  
  return result;
}

const LatexEditor = forwardRef(({ 
  value, 
  onChange, 
  onTextSelect,
  // Diff 模式属性
  diffMode = false,
  diffNewContent = '',
  onAcceptDiff,
  onRejectDiff
}, ref) => {
  const editorContainerRef = useRef(null);
  const editorViewRef = useRef(null);
  const isInternalChange = useRef(false);
  
  // Diff 计算
  const diffLines = useMemo(() => {
    if (!diffMode || !diffNewContent) return null;
    return computeLineDiff(value || '', diffNewContent);
  }, [diffMode, value, diffNewContent]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    insertText: (text) => {
      if (editorViewRef.current) {
        const { state } = editorViewRef.current;
        const { from, to } = state.selection.main;
        
        editorViewRef.current.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length }
        });
      }
    },
    getSelection: () => {
      if (editorViewRef.current) {
        const { state } = editorViewRef.current;
        const { from, to } = state.selection.main;
        return state.doc.sliceString(from, to);
      }
      return '';
    },
    getCursorPosition: () => {
      if (editorViewRef.current) {
        const { state } = editorViewRef.current;
        const pos = state.selection.main.head;
        const line = state.doc.lineAt(pos);
        return {
          line: line.number - 1,
          ch: pos - line.from
        };
      }
      return { line: 0, ch: 0 };
    },
    focus: () => {
      if (editorViewRef.current) {
        editorViewRef.current.focus();
      }
    }
  }));

  // 处理选择变化
  const handleSelectionChange = useCallback((update) => {
    if (update.selectionSet && onTextSelect) {
      const { state } = update;
      const { from, to } = state.selection.main;
      const selectedText = state.doc.sliceString(from, to);
      const line = state.doc.lineAt(from);
      
      onTextSelect(selectedText, {
        line: line.number - 1,
        ch: from - line.from
      });
    }
  }, [onTextSelect]);

  // 初始化编辑器
  useEffect(() => {
    if (!editorContainerRef.current || diffMode) return;

    // 创建更新监听器
    const updateListener = EditorView.updateListener.of((update) => {
      // 处理文档变化
      if (update.docChanged && !isInternalChange.current) {
        const newValue = update.state.doc.toString();
        onChange?.(newValue);
      }
      
      // 处理选择变化
      handleSelectionChange(update);
    });

    // 创建编辑器状态
    const state = EditorState.create({
      doc: value || '',
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        StreamLanguage.define(stex),
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px'
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: '"Fira Code", "Source Code Pro", "Consolas", monospace'
          },
          '.cm-content': {
            minHeight: '100%'
          },
          '.cm-gutters': {
            backgroundColor: 'var(--bg-tertiary, #f5f5f5)',
            borderRight: '1px solid var(--border-color, #e0e0e0)'
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'var(--bg-hover, #e8e8e8)'
          }
        })
      ]
    });

    // 创建编辑器视图
    const view = new EditorView({
      state,
      parent: editorContainerRef.current
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffMode]);

  // 同步外部 value 变化
  useEffect(() => {
    if (editorViewRef.current && value !== undefined && !diffMode) {
      const currentValue = editorViewRef.current.state.doc.toString();
      if (currentValue !== value) {
        isInternalChange.current = true;
        editorViewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentValue.length,
            insert: value
          }
        });
        isInternalChange.current = false;
      }
    }
  }, [value, diffMode]);

  // Diff 模式渲染
  if (diffMode && diffLines) {
    const stats = diffLines.reduce((acc, line) => {
      if (line.type === 'add') acc.additions++;
      if (line.type === 'remove') acc.deletions++;
      return acc;
    }, { additions: 0, deletions: 0 });

    return (
      <div className="latex-editor latex-editor-diff-mode">
        {/* Diff 头部信息 */}
        <div className="latex-diff-header">
          <div className="latex-diff-stats">
            <span className="latex-diff-title">AI 建议的修改</span>
            <span className="latex-diff-additions">+{stats.additions}</span>
            <span className="latex-diff-deletions">-{stats.deletions}</span>
          </div>
        </div>
        
        {/* Diff 内容 */}
        <div className="latex-diff-content">
          {diffLines.map((line, index) => (
            <div 
              key={index} 
              className={`latex-diff-line latex-diff-line-${line.type}`}
            >
              <span className="latex-diff-line-gutter">
                {line.type === 'remove' && <span className="latex-diff-old-num">{line.oldLineNum}</span>}
                {line.type === 'add' && <span className="latex-diff-new-num">{line.newLineNum}</span>}
                {line.type === 'same' && <span className="latex-diff-same-num">{line.newLineNum}</span>}
              </span>
              <span className="latex-diff-line-marker">
                {line.type === 'add' && '+'}
                {line.type === 'remove' && '-'}
                {line.type === 'same' && ' '}
              </span>
              <span className="latex-diff-line-content">
                {line.content || ' '}
              </span>
            </div>
          ))}
        </div>
        
        {/* Diff 操作按钮 */}
        <div className="latex-diff-actions">
          <button 
            className="latex-diff-btn latex-diff-btn-reject"
            onClick={onRejectDiff}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            放弃修改
          </button>
          <button 
            className="latex-diff-btn latex-diff-btn-accept"
            onClick={onAcceptDiff}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            应用修改
          </button>
        </div>
      </div>
    );
  }

  // 正常编辑器模式
  return (
    <div className="latex-editor" ref={editorContainerRef} />
  );
});

LatexEditor.displayName = 'LatexEditor';

export default LatexEditor;
