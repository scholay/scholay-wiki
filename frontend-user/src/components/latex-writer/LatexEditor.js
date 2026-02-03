/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX 代码编辑器组件
 * 基于 CodeMirror 6，支持 LaTeX 语法高亮
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import './LatexEditor.css';

const LatexEditor = forwardRef(({ value, onChange, onTextSelect }, ref) => {
  const editorContainerRef = useRef(null);
  const editorViewRef = useRef(null);
  const isInternalChange = useRef(false);

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
    if (!editorContainerRef.current) return;

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
  }, []); // 只在挂载时创建

  // 同步外部 value 变化
  useEffect(() => {
    if (editorViewRef.current && value !== undefined) {
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
  }, [value]);

  return (
    <div className="latex-editor" ref={editorContainerRef} />
  );
});

LatexEditor.displayName = 'LatexEditor';

export default LatexEditor;
