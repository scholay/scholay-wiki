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
      snippets.head.forEach((snippet) => {
        injectToHead(snippet.code_content);
      });
    }

    // 注入 body_start 代码片段（在 body 开始处）
    if (snippets.body_start && snippets.body_start.length > 0) {
      const injectedElements = [];
      snippets.body_start.forEach((snippet) => {
        const elements = injectToBody(snippet.code_content, 'start');
        injectedElements.push(...elements);
      });
      bodyStartContainerRef.current = injectedElements;
    }

    // 注入 body_end 代码片段（在 body 结束处）
    if (snippets.body_end && snippets.body_end.length > 0) {
      const injectedElements = [];
      snippets.body_end.forEach((snippet) => {
        const elements = injectToBody(snippet.code_content, 'end');
        injectedElements.push(...elements);
      });
      bodyEndContainerRef.current = injectedElements;
    }

    injectedRef.current = true;

    // 保存当前 ref 值供清理函数使用
    const headElements = headContainerRef.current;
    const bodyStartEl = bodyStartContainerRef.current;
    const bodyEndEl = bodyEndContainerRef.current;

    // 清理函数
    return () => {
      // 移除注入的元素
      if (headElements) {
        headElements.forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      }
      if (bodyStartEl && Array.isArray(bodyStartEl)) {
        bodyStartEl.forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      }
      if (bodyEndEl && Array.isArray(bodyEndEl)) {
        bodyEndEl.forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      }
    };
  }, [snippets]);

  return null; // 不渲染任何可见内容
};

/**
 * 注入代码到 head
 */
function injectToHead(htmlContent) {
  // 创建临时容器解析 HTML
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;

  // 将所有子节点添加到 head
  Array.from(temp.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // 如果是 script 标签，需要特殊处理
      if (node.tagName === 'SCRIPT') {
        const script = document.createElement('script');
        // 复制所有属性
        Array.from(node.attributes).forEach(attr => {
          script.setAttribute(attr.name, attr.value);
        });
        // 复制内联脚本内容
        if (node.textContent) {
          script.textContent = node.textContent;
        }
        document.head.appendChild(script);
      } else {
        const clone = node.cloneNode(true);
        document.head.appendChild(clone);
      }
    }
  });
}

/**
 * 注入代码到 body（开始或结束位置）
 * @returns {Array} 注入的元素数组，用于清理
 */
function injectToBody(htmlContent, position) {
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;
  const injectedElements = [];

  Array.from(temp.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      let elementToInsert;

      if (node.tagName === 'SCRIPT') {
        // script 标签需要特殊处理才能执行
        const script = document.createElement('script');
        Array.from(node.attributes).forEach(attr => {
          script.setAttribute(attr.name, attr.value);
        });
        if (node.textContent) {
          script.textContent = node.textContent;
        }
        elementToInsert = script;
      } else {
        elementToInsert = node.cloneNode(true);
      }

      if (position === 'start' && document.body.firstChild) {
        document.body.insertBefore(elementToInsert, document.body.firstChild);
      } else {
        document.body.appendChild(elementToInsert);
      }
      injectedElements.push(elementToInsert);
    }
  });

  return injectedElements;
}

export default CodeSnippetInjector;
