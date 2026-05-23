/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * AI 消息解析器
 * 解析结构化的 AI 输出，分离思考过程、回复内容和代码
 */

/**
 * 解析后的消息结构
 * @typedef {Object} ParsedMessage
 * @property {string|null} think - 思考过程（多轮合并）
 * @property {string|null} reply - 给用户的回复（多轮合并）
 * @property {string|null} code - LaTeX 代码（取最后一个，通常是最终版本）
 * @property {string} raw - 原始内容
 * @property {Array} sections - 按顺序排列的所有段落
 */

/**
 * 解析 AI 的结构化输出（支持多轮 think/reply/code）
 * @param {string} content - AI 输出的原始内容
 * @returns {ParsedMessage}
 */
export function parseAiMessage(content) {
  if (!content) {
    return { think: null, reply: null, code: null, raw: '', sections: [] };
  }

  const result = {
    think: null,
    reply: null,
    code: null,
    raw: content,
    sections: [], // 按顺序存储所有段落
  };

  // 提取所有 <think>...</think>（支持多个）
  const thinkMatches = content.matchAll(/<think>([\s\S]*?)<\/think>/gi);
  const thinkParts = [];
  for (const match of thinkMatches) {
    const text = match[1].trim();
    if (text) {
      thinkParts.push(text);
      result.sections.push({ type: 'think', content: text });
    }
  }
  if (thinkParts.length > 0) {
    result.think = thinkParts.join('\n\n---\n\n'); // 用分隔线连接多轮思考
  }

  // 提取所有 <reply>...</reply>（支持多个）
  const replyMatches = content.matchAll(/<reply>([\s\S]*?)<\/reply>/gi);
  const replyParts = [];
  for (const match of replyMatches) {
    const text = match[1].trim();
    if (text) {
      replyParts.push(text);
      result.sections.push({ type: 'reply', content: text });
    }
  }
  if (replyParts.length > 0) {
    result.reply = replyParts.join('\n\n'); // 合并多轮回复
  }

  // 提取所有 <code>...</code>（取最后一个作为最终代码）
  const codeMatches = [...content.matchAll(/<code>([\s\S]*?)<\/code>/gi)];
  if (codeMatches.length > 0) {
    // 取最后一个 code 作为最终代码
    const lastCode = codeMatches[codeMatches.length - 1][1].trim();
    result.code = lastCode.replace(/<\/?(?:think|reply)>/gi, '').trim();
    
    // 记录所有代码段
    for (const match of codeMatches) {
      const text = match[1].trim().replace(/<\/?(?:think|reply)>/gi, '').trim();
      if (text) {
        result.sections.push({ type: 'code', content: text });
      }
    }
  }

  // 如果没有找到结构化标记，尝试提取 markdown 代码块
  if (!result.code) {
    const markdownCodeMatch = content.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (markdownCodeMatch) {
      result.code = markdownCodeMatch[1].trim();
    }
  }

  // 如果没有 reply 标记，但有内容，把非代码部分作为 reply
  if (!result.reply && !result.think) {
    // 移除所有标记和代码块后的内容
    let cleanContent = content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<reply>[\s\S]*?<\/reply>/gi, '')
      .replace(/<code>[\s\S]*?<\/code>/gi, '')
      .replace(/```(?:latex|tex)?\n?[\s\S]*?```/g, '')
      .trim();
    
    if (cleanContent) {
      result.reply = cleanContent;
    }
  }

  // 按在原文中出现的顺序重新排序 sections
  result.sections = reorderSectionsByPosition(content, result.sections);

  return result;
}

/**
 * 根据标签在原文中的位置重新排序 sections
 */
function reorderSectionsByPosition(content, sections) {
  // 找到每个标签在原文中的位置
  const positions = [];
  
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  const replyRegex = /<reply>([\s\S]*?)<\/reply>/gi;
  const codeRegex = /<code>([\s\S]*?)<\/code>/gi;
  
  let match;
  while ((match = thinkRegex.exec(content)) !== null) {
    positions.push({ type: 'think', content: match[1].trim(), index: match.index });
  }
  while ((match = replyRegex.exec(content)) !== null) {
    positions.push({ type: 'reply', content: match[1].trim(), index: match.index });
  }
  while ((match = codeRegex.exec(content)) !== null) {
    const text = match[1].trim().replace(/<\/?(?:think|reply)>/gi, '').trim();
    positions.push({ type: 'code', content: text, index: match.index });
  }
  
  // 按位置排序
  positions.sort((a, b) => a.index - b.index);
  
  // 返回排序后的 sections（不包含 index）
  return positions.map(({ type, content }) => ({ type, content }));
}

/**
 * 检查内容是否包含 LaTeX 代码特征
 * @param {string} content 
 * @returns {boolean}
 */
export function isLatexCode(content) {
  if (!content) return false;
  
  const latexPatterns = [
    /\\documentclass/,
    /\\begin\{/,
    /\\end\{/,
    /\\section\{/,
    /\\subsection\{/,
    /\\usepackage/,
    /\\textbf\{/,
    /\\textit\{/,
    /\\cite\{/,
    /\\ref\{/,
    /\\label\{/,
    /\\\\/,  // 换行
    /\\item/,
    /\\maketitle/,
    /\\title\{/,
    /\\author\{/,
  ];

  return latexPatterns.some(pattern => pattern.test(content));
}

/**
 * 清理 LaTeX 代码，移除可能的非代码内容
 * @param {string} code 
 * @returns {string}
 */
export function cleanLatexCode(code) {
  if (!code) return '';
  
  let cleaned = code.trim();
  
  // 移除开头的解释性文字（如果有的话）
  // 查找第一个 LaTeX 命令的位置
  const firstCommandMatch = cleaned.match(/\\[a-zA-Z]+/);
  if (firstCommandMatch && firstCommandMatch.index > 0) {
    // 检查命令之前是否有非空白字符
    const beforeCommand = cleaned.substring(0, firstCommandMatch.index).trim();
    // 如果之前的内容不包含 LaTeX 命令，可能是解释文字
    if (!isLatexCode(beforeCommand)) {
      // 找到第一个换行后的 LaTeX 命令
      const lines = cleaned.split('\n');
      let startLine = 0;
      for (let i = 0; i < lines.length; i++) {
        if (isLatexCode(lines[i])) {
          startLine = i;
          break;
        }
      }
      cleaned = lines.slice(startLine).join('\n');
    }
  }
  
  return cleaned.trim();
}

/**
 * 格式化思考过程为可读文本
 * @param {string} think 
 * @returns {string}
 */
export function formatThinking(think) {
  if (!think) return '';
  
  // 添加缩进和格式化
  return think
    .split('\n')
    .map(line => line.trim())
    .filter(line => line)
    .join('\n');
}

/**
 * 清理代码内容，移除可能混入的非代码内容
 * @param {string} code - 原始代码内容
 * @returns {string} 清理后的代码
 */
function cleanCodeContent(code) {
  if (!code) return '';
  
  let cleaned = code.trim();
  
  // 1. 移除可能混入的 XML 标签
  cleaned = cleaned.replace(/<\/?(?:think|reply|code)>/gi, '');
  
  // 2. 如果代码不是以 LaTeX 命令开头，尝试找到第一个有效的 LaTeX 行
  const trimmed = cleaned.trim();
  const startsWithLatex = /^[\\%]/.test(trimmed);
  
  if (!startsWithLatex && trimmed.length > 0) {
    // 按行查找第一个以 \ 或 % 开头的行
    const lines = cleaned.split('\n');
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('\\') || line.startsWith('%')) {
        startIndex = i;
        break;
      }
    }
    if (startIndex > 0) {
      cleaned = lines.slice(startIndex).join('\n');
    }
  }
  
  return cleaned.trim();
}

/**
 * 实时解析流式输出（用于流式显示）
 * 支持多轮 think/reply/code 标签
 * @param {string} partialContent - 部分内容
 * @returns {Object} 当前可显示的各部分
 */
export function parseStreamingMessage(partialContent) {
  if (!partialContent) {
    return { 
      displayText: '', 
      thinkText: '', 
      replyText: '', 
      codeText: '',
      rawText: '',
      hasCode: false, 
      isComplete: false,
      currentSection: 'none',
      sections: [], // 多轮内容
    };
  }

  const result = {
    displayText: '',
    thinkText: '',
    replyText: '',
    codeText: '',
    rawText: partialContent,
    hasCode: false,
    isComplete: false,
    currentSection: 'none',
    sections: [], // 存储所有已完成的段落
  };

  // 提取所有已完成的标签内容（按顺序）
  const tagRegex = /<(think|reply|code)>([\s\S]*?)<\/\1>/gi;
  let match;
  const completedTags = [];
  while ((match = tagRegex.exec(partialContent)) !== null) {
    completedTags.push({
      type: match[1].toLowerCase(),
      content: match[2].trim(),
      endIndex: match.index + match[0].length
    });
  }
  
  // 存储已完成的段落
  result.sections = completedTags.map(t => ({ type: t.type, content: t.content }));

  // 合并所有 think 内容
  const thinkParts = completedTags.filter(t => t.type === 'think').map(t => t.content);
  if (thinkParts.length > 0) {
    result.thinkText = thinkParts.join('\n\n---\n\n');
  }

  // 合并所有 reply 内容
  const replyParts = completedTags.filter(t => t.type === 'reply').map(t => t.content);
  if (replyParts.length > 0) {
    result.replyText = replyParts.join('\n\n');
  }

  // 取最后一个 code 作为当前代码
  const codeParts = completedTags.filter(t => t.type === 'code');
  if (codeParts.length > 0) {
    result.codeText = cleanCodeContent(codeParts[codeParts.length - 1].content);
    result.hasCode = true;
  }

  // 检测当前正在输出的部分（未闭合的标签）
  const lastCompletedIdx = completedTags.length > 0 
    ? Math.max(...completedTags.map(t => t.endIndex))
    : 0;
  const remainingContent = partialContent.substring(lastCompletedIdx);

  // 检测未闭合的标签
  const unclosedThinkMatch = remainingContent.match(/<think>([^]*?)$/i);
  const unclosedReplyMatch = remainingContent.match(/<reply>([^]*?)$/i);
  const unclosedCodeMatch = remainingContent.match(/<code>([^]*?)$/i);
  
  // 检测部分标签
  const possiblePartialTag = /<[a-z]*$/i.test(remainingContent);

  if (unclosedCodeMatch) {
    result.currentSection = 'code';
    // 追加正在输出的代码
    const currentCode = cleanCodeContent(unclosedCodeMatch[1].replace(/<\/?[a-z]*$/i, ''));
    if (currentCode) {
      result.codeText = result.codeText 
        ? result.codeText + '\n' + currentCode 
        : currentCode;
      result.hasCode = true;
    }
  } else if (unclosedReplyMatch) {
    result.currentSection = 'reply';
    // 追加正在输出的回复
    const currentReply = unclosedReplyMatch[1].replace(/<\/?[a-z]*$/i, '').trim();
    if (currentReply) {
      result.replyText = result.replyText 
        ? result.replyText + '\n\n' + currentReply 
        : currentReply;
    }
  } else if (unclosedThinkMatch) {
    result.currentSection = 'think';
    // 追加正在输出的思考
    const currentThink = unclosedThinkMatch[1].replace(/<\/?[a-z]*$/i, '').trim();
    if (currentThink) {
      result.thinkText = result.thinkText 
        ? result.thinkText + '\n\n---\n\n' + currentThink 
        : currentThink;
    }
  } else if (result.hasCode || codeParts.length > 0) {
    result.currentSection = 'done';
  } else if (possiblePartialTag) {
    result.currentSection = 'waiting';
  } else if (completedTags.length === 0) {
    result.currentSection = 'raw';
  } else {
    // 有已完成的标签，判断当前状态
    const lastTag = completedTags[completedTags.length - 1];
    if (lastTag.type === 'code') {
      result.currentSection = 'done';
    } else {
      result.currentSection = lastTag.type;
    }
  }

  // 构建显示文本
  let displayText = partialContent;
  displayText = displayText.replace(/<\/?(?:think|reply|code)>/gi, '');
  displayText = displayText.replace(/<\/?[a-z]*$/i, '');
  result.displayText = displayText.trim();

  // 判断是否完成（没有未闭合的标签）
  result.isComplete = !unclosedThinkMatch && !unclosedReplyMatch && !unclosedCodeMatch && !possiblePartialTag;

  return result;
}

/**
 * 计算两段代码之间的 diff 统计
 * 使用简化的 LCS（最长公共子序列）算法来计算新增和删除的行数
 * @param {string} originalCode - 原始代码
 * @param {string} newCode - 新代码
 * @returns {Object} { added: number, removed: number, total: number }
 */
export function calculateCodeDiff(originalCode, newCode) {
  const originalLines = (originalCode || '').split('\n').filter(line => line.trim() !== '');
  const newLines = (newCode || '').split('\n').filter(line => line.trim() !== '');

  // 如果原始代码为空，所有新行都是新增的
  if (originalLines.length === 0) {
    return {
      added: newLines.length,
      removed: 0,
      total: newLines.length,
    };
  }

  // 如果新代码为空，所有原始行都是删除的
  if (newLines.length === 0) {
    return {
      added: 0,
      removed: originalLines.length,
      total: 0,
    };
  }

  // 使用简化的 diff 算法
  // 创建原始行的 Set 用于快速查找
  const originalSet = new Set(originalLines.map(line => line.trim()));
  const newSet = new Set(newLines.map(line => line.trim()));

  // 计算新增行（在新代码中但不在原始代码中）
  let added = 0;
  for (const line of newLines) {
    if (!originalSet.has(line.trim())) {
      added++;
    }
  }

  // 计算删除行（在原始代码中但不在新代码中）
  let removed = 0;
  for (const line of originalLines) {
    if (!newSet.has(line.trim())) {
      removed++;
    }
  }

  return {
    added,
    removed,
    total: newLines.length,
  };
}

/**
 * 使用更精确的 LCS 算法计算 diff
 * 适用于需要精确行级别比较的场景
 * @param {string} originalCode - 原始代码
 * @param {string} newCode - 新代码
 * @returns {Object} { added: number, removed: number, unchanged: number, total: number }
 */
export function calculatePreciseDiff(originalCode, newCode) {
  const originalLines = (originalCode || '').split('\n');
  const newLines = (newCode || '').split('\n');

  const m = originalLines.length;
  const n = newLines.length;

  // 创建 LCS 矩阵
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // 填充 LCS 矩阵
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (originalLines[i - 1].trim() === newLines[j - 1].trim()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcsLength = dp[m][n];
  const unchanged = lcsLength;
  const removed = m - lcsLength;
  const added = n - lcsLength;

  return {
    added,
    removed,
    unchanged,
    total: n,
  };
}

export default {
  parseAiMessage,
  parseStreamingMessage,
  isLatexCode,
  cleanLatexCode,
  formatThinking,
  calculateCodeDiff,
  calculatePreciseDiff,
};
