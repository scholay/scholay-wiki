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
 * @property {string|null} think - 思考过程
 * @property {string|null} reply - 给用户的回复
 * @property {string|null} code - LaTeX 代码
 * @property {string} raw - 原始内容
 */

/**
 * 解析 AI 的结构化输出
 * @param {string} content - AI 输出的原始内容
 * @returns {ParsedMessage}
 */
export function parseAiMessage(content) {
  if (!content) {
    return { think: null, reply: null, code: null, raw: '' };
  }

  const result = {
    think: null,
    reply: null,
    code: null,
    raw: content,
  };

  // 提取 <think>...</think>
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    result.think = thinkMatch[1].trim();
  }

  // 提取 <reply>...</reply>
  const replyMatch = content.match(/<reply>([\s\S]*?)<\/reply>/i);
  if (replyMatch) {
    result.reply = replyMatch[1].trim();
  }

  // 提取 <code>...</code>
  const codeMatch = content.match(/<code>([\s\S]*?)<\/code>/i);
  if (codeMatch) {
    result.code = codeMatch[1].trim();
    // 清理可能混入的标签
    result.code = result.code.replace(/<\/?(?:think|reply)>/gi, '').trim();
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

  return result;
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
  
  let cleaned = code;
  
  // 移除可能混入的 XML 标签（如 </think>, </reply>, <code>, </code> 等）
  cleaned = cleaned.replace(/<\/?(?:think|reply|code)>/gi, '');
  
  return cleaned.trim();
}

/**
 * 实时解析流式输出（用于流式显示）
 * 采用增量式解析，不等待标签闭合就开始显示内容
 * 关键：在标签不完整时也要显示原始内容，避免"突然"出现
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
    };
  }

  const result = {
    displayText: '',
    thinkText: '',
    replyText: '',
    codeText: '',
    rawText: partialContent, // 始终保留原始内容用于显示
    hasCode: false,
    isComplete: false,
    currentSection: 'none',
  };

  // 检测标签位置
  const thinkOpenIdx = partialContent.indexOf('<think>');
  const thinkCloseIdx = partialContent.indexOf('</think>');
  const replyOpenIdx = partialContent.indexOf('<reply>');
  const replyCloseIdx = partialContent.indexOf('</reply>');
  const codeOpenIdx = partialContent.indexOf('<code>');
  const codeCloseIdx = partialContent.indexOf('</code>');

  // 检测是否正在输入标签（部分标签，如 "<th" 或 "<thi"）
  const possiblePartialTag = /<[a-z]*$/i.test(partialContent);
  
  // 判断当前正在输出的部分
  if (codeOpenIdx !== -1 && codeCloseIdx === -1) {
    result.currentSection = 'code';
  } else if (replyOpenIdx !== -1 && replyCloseIdx === -1) {
    result.currentSection = 'reply';
  } else if (thinkOpenIdx !== -1 && thinkCloseIdx === -1) {
    result.currentSection = 'think';
  } else if (codeCloseIdx !== -1) {
    result.currentSection = 'done';
  } else if (possiblePartialTag) {
    // 正在输入标签，显示为等待状态
    result.currentSection = 'waiting';
  } else {
    // 没有检测到任何标签，显示原始内容
    result.currentSection = 'raw';
  }

  // 提取 think 内容（实时显示，不等闭合）
  if (thinkOpenIdx !== -1) {
    const thinkStart = thinkOpenIdx + 7;
    const thinkEnd = thinkCloseIdx !== -1 ? thinkCloseIdx : partialContent.length;
    let thinkContent = partialContent.substring(thinkStart, thinkEnd);
    // 如果还没闭合，移除可能的部分标签
    thinkContent = thinkContent.replace(/<\/?[a-z]*$/i, '').trim();
    result.thinkText = thinkContent;
  }

  // 提取 reply 内容（实时显示，不等闭合）
  if (replyOpenIdx !== -1) {
    const replyStart = replyOpenIdx + 7;
    let replyEnd;
    if (replyCloseIdx !== -1) {
      replyEnd = replyCloseIdx;
    } else if (codeOpenIdx !== -1 && codeOpenIdx > replyOpenIdx) {
      replyEnd = codeOpenIdx;
    } else {
      replyEnd = partialContent.length;
    }
    let replyContent = partialContent.substring(replyStart, replyEnd);
    // 移除可能的部分标签
    replyContent = replyContent.replace(/<\/?[a-z]*$/i, '').trim();
    result.replyText = replyContent;
  }

  // 提取 code 内容（实时显示，不等闭合）
  if (codeOpenIdx !== -1) {
    const codeStart = codeOpenIdx + 6;
    const codeEnd = codeCloseIdx !== -1 ? codeCloseIdx : partialContent.length;
    let codeContent = partialContent.substring(codeStart, codeEnd);
    // 清理内容
    codeContent = cleanCodeContent(codeContent);
    result.codeText = codeContent;
    result.hasCode = true;
  }

  // 构建显示文本（移除 XML 标签后的纯文本）
  let displayText = partialContent;
  displayText = displayText.replace(/<\/?(?:think|reply|code)>/gi, '');
  displayText = displayText.replace(/<\/?[a-z]*$/i, ''); // 移除末尾不完整的标签
  result.displayText = displayText.trim();

  // 判断是否完成
  const hasUnclosedThink = thinkOpenIdx !== -1 && thinkCloseIdx === -1;
  const hasUnclosedReply = replyOpenIdx !== -1 && replyCloseIdx === -1;
  const hasUnclosedCode = codeOpenIdx !== -1 && codeCloseIdx === -1;
  result.isComplete = !hasUnclosedThink && !hasUnclosedReply && !hasUnclosedCode;

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
