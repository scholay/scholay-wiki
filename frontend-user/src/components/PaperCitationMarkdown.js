import React from 'react';
import ReactMarkdown from 'react-markdown';
import logger from '../utils/logger';
import './PaperCitationMarkdown.css';

/**
 * 自定义 Markdown 组件，用于渲染带有论文引用的内容
 * 识别 【引用n：引用内容】 或 【引用n:引用内容】 格式，并添加交互效果
 * 同时支持中文冒号（：）和英文冒号（:）
 */
const PaperCitationMarkdown = ({ content, onCitationHover, onCitationLeave, onCitationClick }) => {
  // 预处理内容：将 【引用n：文本】 转换为特殊的临时标记
  const processedContent = preprocessCitations(content);

  // 自定义渲染器来处理文本节点
  const components = {
    // 处理段落中的文本
    p: ({ node, children, ...props }) => {
      const processedChildren = processTextWithCitations(children, onCitationHover, onCitationLeave, onCitationClick);
      return <p {...props}>{processedChildren}</p>;
    },
    // 处理列表项中的文本
    li: ({ node, children, ...props }) => {
      const processedChildren = processTextWithCitations(children, onCitationHover, onCitationLeave, onCitationClick);
      return <li {...props}>{processedChildren}</li>;
    },
    // 处理标题中的文本
    h1: ({ node, children, ...props }) => {
      const processedChildren = processTextWithCitations(children, onCitationHover, onCitationLeave, onCitationClick);
      return <h1 {...props}>{processedChildren}</h1>;
    },
    h2: ({ node, children, ...props }) => {
      const processedChildren = processTextWithCitations(children, onCitationHover, onCitationLeave, onCitationClick);
      return <h2 {...props}>{processedChildren}</h2>;
    },
    h3: ({ node, children, ...props }) => {
      const processedChildren = processTextWithCitations(children, onCitationHover, onCitationLeave, onCitationClick);
      return <h3 {...props}>{processedChildren}</h3>;
    },
    h4: ({ node, children, ...props }) => {
      const processedChildren = processTextWithCitations(children, onCitationHover, onCitationLeave, onCitationClick);
      return <h4 {...props}>{processedChildren}</h4>;
    },
    // 处理强调文本
    strong: ({ node, children, ...props }) => {
      const processedChildren = processTextWithCitations(children, onCitationHover, onCitationLeave, onCitationClick);
      return <strong {...props}>{processedChildren}</strong>;
    },
    em: ({ node, children, ...props }) => {
      const processedChildren = processTextWithCitations(children, onCitationHover, onCitationLeave, onCitationClick);
      return <em {...props}>{processedChildren}</em>;
    },
  };

  return <ReactMarkdown components={components}>{processedContent}</ReactMarkdown>;
};

/**
 * 预处理：将引用格式转换为临时标记
 * 支持两种格式：
 * 1. 【引用n：文本】 或 【引用n:文本】 -> {{CITE:n:text}}
 * 2. 【引用n】 -> {{CITE:n}}
 * 使用特殊标记避免被 Markdown 解析器处理
 */
function preprocessCitations(content) {
  if (!content) return content;

  // 先处理带内容的格式：【引用数字：内容】 或 【引用数字:内容】
  const citeWithTextRegex = /【引用(\d+)[：:]([^】]+)】/g;
  
  // 再处理简单格式：【引用数字】（不带冒号和内容）
  const citeSimpleRegex = /【引用(\d+)】/g;

  const matchesWithText = content.match(citeWithTextRegex);
  const matchesSimple = content.match(citeSimpleRegex);
  
  if ((matchesWithText && matchesWithText.length > 0) || (matchesSimple && matchesSimple.length > 0)) {
    logger.log('🔗 找到引用标记:', 
      (matchesWithText?.length || 0) + (matchesSimple?.length || 0), '个',
      { withText: matchesWithText, simple: matchesSimple });
  }

  // 先替换带内容的格式
  let result = content.replace(citeWithTextRegex, (match, paperNum, text) => {
    logger.log('📝 转换引用(带内容):', match, '->', `{{CITE:${paperNum}:${text}}}`);
    return `{{CITE:${paperNum}:${text}}}`;
  });

  // 再替换简单格式
  result = result.replace(citeSimpleRegex, (match, paperNum) => {
    logger.log('📝 转换引用(简单):', match, '->', `{{CITE:${paperNum}}}`);
    return `{{CITE:${paperNum}}}`;
  });

  return result;
}

/**
 * 处理文本内容，将临时标记转换为可交互的组件
 */
function processTextWithCitations(children, onCitationHover, onCitationLeave, onCitationClick) {
  if (!children) return children;

  return React.Children.map(children, (child) => {
    // 如果是字符串，处理其中的引用
    if (typeof child === 'string') {
      return processSingleText(child, onCitationHover, onCitationLeave, onCitationClick);
    }

    // 如果是 React 元素，递归处理其子元素
    if (React.isValidElement(child) && child.props.children) {
      return React.cloneElement(child, {
        children: processTextWithCitations(child.props.children, onCitationHover, onCitationLeave, onCitationClick),
      });
    }

    return child;
  });
}

/**
 * 处理单个文本字符串，识别并替换引用标记
 * 支持两种格式：
 * 1. {{CITE:n:text}} - 带内容的引用，显示引用文本
 * 2. {{CITE:n}} - 简单引用，显示为上标数字角标
 */
function processSingleText(text, onCitationHover, onCitationLeave, onCitationClick) {
  // 正则表达式匹配两种格式：
  // 1. {{CITE:数字:文本}} - 带内容
  // 2. {{CITE:数字}} - 简单格式
  const citationRegex = /\{\{CITE:(\d+)(?::([^}]+))?\}\}/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = citationRegex.exec(text)) !== null) {
    // 添加引用前的文本
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // 提取论文编号和引用文本（可能为空）
    const paperNumber = parseInt(match[1]);
    const citationText = match[2]; // 可能为 undefined
    const paperIndex = paperNumber - 1; // 转换为 0-based 索引

    if (citationText) {
      // 带内容的引用：显示引用文本，带下划线样式
      parts.push(
        <span
          key={`citation-${match.index}`}
          className="paper-citation-text"
          onMouseEnter={() => onCitationHover && onCitationHover(paperIndex)}
          onMouseLeave={() => onCitationLeave && onCitationLeave()}
          onClick={() => onCitationClick && onCitationClick(paperIndex)}
        >
          {citationText}
        </span>
      );
    } else {
      // 简单引用：显示为上标数字角标
      parts.push(
        <sup
          key={`citation-${match.index}`}
          className="paper-citation-badge"
          onMouseEnter={() => onCitationHover && onCitationHover(paperIndex)}
          onMouseLeave={() => onCitationLeave && onCitationLeave()}
          onClick={() => onCitationClick && onCitationClick(paperIndex)}
        >
          [{paperNumber}]
        </sup>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // 添加最后剩余的文本
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  // 如果没有找到引用，返回原始文本
  return parts.length > 0 ? parts : text;
}

export default PaperCitationMarkdown;
