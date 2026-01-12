/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * CodeSnippetInjector - 代码片段注入组件
 * 从后端获取配置的 SEO/广告/统计代码，注入到页面中
 */

import { useEffect, useState, useRef } from 'react';
import { configAPI } from '../services/api';

/**
 * 代码片段注入组件
 * 自动从后端获取启用的代码片段，并注入到页面对应位置
 */
const CodeSnippetInjector = () => {
  const [snippets, setSnippets] = useState(null);
  const injectedRef = useRef(false);
  const headContainerRef = useRef(null);
  const bodyStartContainerRef = useRef(null);
  const bodyEndContainerRef = useRef(null);

  useEffect(() => {
    // 只在首次加载时获取代码片段
    const fetchSnippets = async () => {
      try {
        const response = await configAPI.getCodeSnippets();
        if (response.data?.code === 0 && response.data?.data) {
          setSnippets(response.data.data);
        }
      } catch (error) {
        // 静默失败，不影响用户体验
        console.warn('Failed to load code snippets:', error);
      }
    };

    fetchSnippets();
  }, []);

  useEffect(() => {
    if (!snippets || injectedRef.current) return;

    // 注入 head 代码片段
    if (snippets.head && snippets.head.length > 0) {
      snippets.head.forEach((snippet, index) => {
        injectToHead(snippet.code_content, `snippet-head-${index}`);
      });
    }

    // 注入 body_start 代码片段（在 body 开始处）
    if (snippets.body_start && snippets.body_start.length > 0) {
      const container = document.createElement('div');
      container.id = 'code-snippets-body-start';
      container.style.display = 'none'; // 隐藏容器本身
      snippets.body_start.forEach((snippet) => {
        const div = document.createElement('div');
        div.innerHTML = snippet.code_content;
        // 执行脚本
        executeScripts(div);
        container.appendChild(div);
      });
      // 插入到 body 的第一个子元素之前
      if (document.body.firstChild) {
        document.body.insertBefore(container, document.body.firstChild);
      } else {
        document.body.appendChild(container);
      }
      bodyStartContainerRef.current = container;
    }

    // 注入 body_end 代码片段（在 body 结束处）
    if (snippets.body_end && snippets.body_end.length > 0) {
      const container = document.createElement('div');
      container.id = 'code-snippets-body-end';
      container.style.display = 'none'; // 隐藏容器本身
      snippets.body_end.forEach((snippet) => {
        const div = document.createElement('div');
        div.innerHTML = snippet.code_content;
        // 执行脚本
        executeScripts(div);
        container.appendChild(div);
      });
      document.body.appendChild(container);
      bodyEndContainerRef.current = container;
    }

    injectedRef.current = true;

    // 清理函数
    return () => {
      // 移除注入的元素
      if (headContainerRef.current) {
        headContainerRef.current.forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      }
      if (bodyStartContainerRef.current && bodyStartContainerRef.current.parentNode) {
        bodyStartContainerRef.current.parentNode.removeChild(bodyStartContainerRef.current);
      }
      if (bodyEndContainerRef.current && bodyEndContainerRef.current.parentNode) {
        bodyEndContainerRef.current.parentNode.removeChild(bodyEndContainerRef.current);
      }
    };
  }, [snippets]);

  return null; // 不渲染任何可见内容
};

/**
 * 注入代码到 head
 */
function injectToHead(htmlContent, id) {
  // 创建临时容器解析 HTML
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;

  // 将所有子节点添加到 head
  Array.from(temp.childNodes).forEach((node, index) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const clone = node.cloneNode(true);
      clone.setAttribute('data-snippet-id', `${id}-${index}`);

      // 如果是 script 标签，需要特殊处理
      if (node.tagName === 'SCRIPT') {
        const script = document.createElement('script');
        // 复制所有属性
        Array.from(node.attributes).forEach(attr => {
          script.setAttribute(attr.name, attr.value);
        });
        script.setAttribute('data-snippet-id', `${id}-${index}`);
        // 复制内联脚本内容
        if (node.textContent) {
          script.textContent = node.textContent;
        }
        document.head.appendChild(script);
      } else {
        document.head.appendChild(clone);
      }
    }
  });
}

/**
 * 执行容器内的脚本
 */
function executeScripts(container) {
  const scripts = container.querySelectorAll('script');
  scripts.forEach(originalScript => {
    const newScript = document.createElement('script');
    // 复制所有属性
    Array.from(originalScript.attributes).forEach(attr => {
      newScript.setAttribute(attr.name, attr.value);
    });
    // 复制脚本内容
    newScript.textContent = originalScript.textContent;
    // 替换原脚本（这会触发执行）
    originalScript.parentNode.replaceChild(newScript, originalScript);
  });
}

export default CodeSnippetInjector;
