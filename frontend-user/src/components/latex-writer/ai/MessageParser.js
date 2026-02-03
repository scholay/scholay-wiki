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
 * 实时解析流式输出（用于流式显示）
 * @param {string} partialContent - 部分内容
 * @returns {Object} 当前可显示的各部分
 */
export function parseStreamingMessage(partialContent) {
  if (!partialContent) {
    return { displayText: '', hasCode: false, isComplete: false };
  }

  const result = {
    displayText: '',
    thinkText: '',
    replyText: '',
    codeText: '',
    hasCode: false,
    isComplete: false,
  };

  // 检查是否有未闭合的标签
  const hasUnclosedThink = /<think>/i.test(partialContent) && !/<\/think>/i.test(partialContent);
  const hasUnclosedReply = /<reply>/i.test(partialContent) && !/<\/reply>/i.test(partialContent);
  const hasUnclosedCode = /<code>/i.test(partialContent) && !/<\/code>/i.test(partialContent);

  // 提取已完成的部分
  const parsed = parseAiMessage(partialContent);
  
  // 处理未闭合的 think
  if (hasUnclosedThink) {
    const thinkStart = partialContent.indexOf('<think>') + 7;
    result.thinkText = partialContent.substring(thinkStart).trim();
  } else if (parsed.think) {
    result.thinkText = parsed.think;
  }

  // 处理未闭合的 reply
  if (hasUnclosedReply) {
    const replyStart = partialContent.indexOf('<reply>') + 7;
    const replyEnd = partialContent.indexOf('<code>');
    result.replyText = partialContent.substring(
      replyStart,
      replyEnd > -1 ? replyEnd : undefined
    ).trim();
  } else if (parsed.reply) {
    result.replyText = parsed.reply;
  }

  // 处理未闭合的 code
  if (hasUnclosedCode) {
    const codeStart = partialContent.indexOf('<code>') + 6;
    result.codeText = partialContent.substring(codeStart).trim();
    result.hasCode = true;
  } else if (parsed.code) {
    result.codeText = parsed.code;
    result.hasCode = true;
  }

  // 构建显示文本
  if (result.thinkText) {
    result.displayText += `💭 思考中...\n${result.thinkText}\n\n`;
  }
  if (result.replyText) {
    result.displayText += result.replyText;
  }

  result.isComplete = !hasUnclosedThink && !hasUnclosedReply && !hasUnclosedCode;

  return result;
}

export default {
  parseAiMessage,
  parseStreamingMessage,
  isLatexCode,
  cleanLatexCode,
  formatThinking,
};
