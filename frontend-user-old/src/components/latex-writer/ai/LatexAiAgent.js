/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX AI Agent - 基于 AiEditor 设计模式
 * 
 * 功能：
 * 1. 与 AI 进行对话，支持流式响应
 * 2. 维护对话上下文
 * 3. 生成 LaTeX 代码修改建议
 * 4. 支持多种预设操作（优化、翻译、解释等）
 */

import { TASK_PROMPTS, SECTION_PROMPTS, SYSTEM_PROMPTS } from './LatexPrompts';
import StreamHandler from './StreamHandler';
import SmoothAppender from './SmoothAppender';

// LaTeX 专用提示词模板
export const LATEX_PROMPTS = {
  improveWriting: {
    id: 'improve-writing',
    title: '优化内容',
    icon: '',
    prompt: `请帮我优化以下 LaTeX 内容，使其更加专业和流畅。只返回优化后的 LaTeX 代码，不要添加任何解释。\n\n原始内容：\n{content}`,
  },
  checkGrammar: {
    id: 'check-grammar',
    title: '检查语法',
    icon: '',
    prompt: `请检查以下 LaTeX 内容中的拼写和语法错误，并返回修正后的版本。如果没有错误，返回原文。只返回 LaTeX 代码。\n\n原始内容：\n{content}`,
  },
  makeShorter: {
    id: 'make-shorter',
    title: '简化内容',
    icon: '',
    prompt: `请帮我简化以下 LaTeX 内容，使其更加简洁。保持学术风格，只返回简化后的 LaTeX 代码。\n\n原始内容：\n{content}`,
  },
  makeLonger: {
    id: 'make-longer',
    title: '扩展内容',
    icon: '',
    prompt: `请帮我适当扩展以下 LaTeX 内容，增加更多细节和论述。保持学术风格，扩展后的内容不超过原内容的2倍。只返回 LaTeX 代码。\n\n原始内容：\n{content}`,
  },
  translate: {
    id: 'translate',
    title: '中英互译',
    icon: '',
    prompt: `请翻译以下 LaTeX 内容。如果是中文则翻译成英文，如果是英文则翻译成中文。保留所有 LaTeX 命令和结构，只翻译文本内容。只返回翻译后的 LaTeX 代码。\n\n原始内容：\n{content}`,
  },
  addEquation: {
    id: 'add-equation',
    title: '添加公式',
    icon: '',
    prompt: `请根据上下文，在合适的位置添加相关的数学公式来增强论述。使用标准 LaTeX 数学环境（equation, align 等）。只返回修改后的 LaTeX 代码。\n\n原始内容：\n{content}`,
  },
  addCitation: {
    id: 'add-citation',
    title: '建议引用',
    icon: '',
    prompt: `请分析以下内容，建议可能需要添加引用的地方，并以注释的形式标注（% TODO: add citation for ...）。只返回修改后的 LaTeX 代码。\n\n原始内容：\n{content}`,
  },
  fixLatex: {
    id: 'fix-latex',
    title: '修复错误',
    icon: '',
    prompt: `请检查并修复以下 LaTeX 代码中的语法错误和常见问题（如未闭合的括号、错误的命令等）。只返回修复后的 LaTeX 代码。\n\n原始内容：\n{content}`,
  },
  formatCode: {
    id: 'format-code',
    title: '格式化',
    icon: '',
    prompt: `请格式化以下 LaTeX 代码，使其更加整洁易读。正确缩进、合理换行。只返回格式化后的 LaTeX 代码。\n\n原始内容：\n{content}`,
  },
};

/**
 * LaTeX AI Agent 类
 * 使用事件驱动模式，支持流式响应
 */
export class LatexAiAgent {
  constructor(config = {}) {
    this.config = {
      defaultModelId: null, // 使用后端默认模型
      apiEndpoint: '/api/v1/user/latex-writer/chat/stream',
      ...config
    };
    
    this.listeners = new Map();
    this.streamHandler = new StreamHandler();
    this.smoothAppender = null;
    this.conversationHistory = [];
    this.fullResponse = '';
    this.isRunning = false;
  }

  /**
   * 注册事件监听器
   * @param {string} event - 事件名称 ('onStart', 'onMessage', 'onComplete', 'onError')
   * @param {function} callback - 回调函数
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return this;
  }

  /**
   * 移除事件监听器
   * @param {string} event 
   * @param {function} callback 
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * 触发事件
   * @param {string} event 
   * @param  {...any} args 
   */
  emit(event, ...args) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(...args);
        } catch (e) {
          console.error(`[LatexAiAgent] Event handler error:`, e);
        }
      });
    }
  }

  /**
   * 更新配置
   * @param {object} newConfig 
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 重置对话历史
   */
  resetConversation() {
    this.conversationHistory = [];
  }

  /**
   * 获取对话历史
   */
  getHistory() {
    return [...this.conversationHistory];
  }

  /**
   * 停止当前请求
   */
  stop() {
    if (this.streamHandler) {
      this.streamHandler.abort();
    }
    this.isRunning = false;
  }

  /**
   * 销毁 Agent
   */
  destroy() {
    this.stop();
    this.listeners.clear();
    this.conversationHistory = [];
  }

  /**
   * 带上下文的对话
   * @param {string} selectedText - 选中的文本
   * @param {string} userPrompt - 用户提示
   * @param {object} options - 选项
   */
  async chatWithContext(selectedText, userPrompt, options = {}) {
    const { fullContent, modelId } = options;
    
    // 构建完整的 prompt
    let finalPrompt = userPrompt;
    if (selectedText) {
      finalPrompt = `当前选中的 LaTeX 内容：\n\`\`\`latex\n${selectedText}\n\`\`\`\n\n用户请求：${userPrompt}\n\n请根据用户请求处理选中的内容，并返回修改后的 LaTeX 代码。如果返回代码，请用 \`\`\`latex 代码块包裹。`;
    }

    await this.chat(finalPrompt, {
      fullContent,
      modelId: modelId || this.config.defaultModelId,
      saveToHistory: true,
    });
  }

  /**
   * 执行预设命令
   * @param {string} commandId - 命令 ID
   * @param {string} selectedText - 选中的文本
   * @param {object} options - 选项
   */
  async executeCommand(commandId, selectedText, options = {}) {
    const { fullContent, modelId } = options;
    
    // 获取命令配置
    const command = this.getCommandConfig(commandId);
    if (!command) {
      this.emit('onError', new Error(`未知命令: ${commandId}`));
      return;
    }

    // 构建 prompt
    let prompt = '';
    
    if (command.taskType && TASK_PROMPTS[command.taskType]) {
      prompt = TASK_PROMPTS[command.taskType].prompt;
      // 替换变量
      if (command.variables) {
        Object.entries(command.variables).forEach(([key, value]) => {
          prompt = prompt.replace(new RegExp(`{${key}}`, 'g'), value);
        });
      }
      prompt = prompt.replace('{content}', selectedText || '');
    } else if (command.sectionType && SECTION_PROMPTS[command.sectionType]) {
      prompt = SECTION_PROMPTS[command.sectionType].prompt;
      if (fullContent) {
        prompt = prompt.replace('{outline}', fullContent);
      }
    }

    if (!prompt) {
      this.emit('onError', new Error(`命令配置错误: ${commandId}`));
      return;
    }

    await this.chat(prompt, {
      fullContent,
      modelId: modelId || this.config.defaultModelId,
      saveToHistory: false,
    });
  }

  /**
   * 获取命令配置
   * @param {string} commandId 
   */
  getCommandConfig(commandId) {
    const { QUICK_COMMANDS, ADVANCED_COMMANDS, SECTION_COMMANDS } = require('./LatexCommands');
    const allCommands = [...QUICK_COMMANDS, ...ADVANCED_COMMANDS, ...SECTION_COMMANDS];
    return allCommands.find(cmd => cmd.id === commandId);
  }

  /**
   * 核心对话方法
   * @param {string} prompt - 提示词
   * @param {object} options - 选项
   */
  async chat(prompt, options = {}) {
    if (this.isRunning) {
      this.emit('onError', new Error('正在处理中，请稍候'));
      return;
    }

    const { fullContent, modelId, saveToHistory, context } = options;
    
    this.isRunning = true;
    this.fullResponse = '';

    // 构建上下文（包含历史对话）
    let contextStr = context || '';
    if (this.conversationHistory.length > 0) {
      const historyStr = this.conversationHistory
        .slice(-10)
        .map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`)
        .join('\n\n');
      contextStr = contextStr ? `${contextStr}\n\n历史对话：\n${historyStr}` : `历史对话：\n${historyStr}`;
    }

    // 保存用户消息到历史
    if (saveToHistory) {
      this.conversationHistory.push({ role: 'user', content: prompt });
    }

    const token = localStorage.getItem('user_token');
    
    // 使用后端期望的请求格式
    const requestData = {
      prompt: prompt,
      context: contextStr,
      full_content: fullContent || '',
    };
    
    // 只有当 modelId 有效时才添加
    if (modelId && modelId > 0) {
      requestData.model_id = modelId;
    }
    
    await this.streamHandler.stream(
      this.config.apiEndpoint,
      requestData,
      {
        onStart: () => {
          this.emit('onStart');
        },
        onMessage: (content, status) => {
          this.fullResponse += content;
          this.emit('onMessage', this.fullResponse, status === 2);
        },
        onStop: () => {
          this.isRunning = false;
          // 保存助手回复到历史
          if (saveToHistory && this.fullResponse) {
            this.conversationHistory.push({ role: 'assistant', content: this.fullResponse });
            // 限制历史长度
            if (this.conversationHistory.length > 20) {
              this.conversationHistory = this.conversationHistory.slice(-20);
            }
          }
          this.emit('onComplete', this.fullResponse);
        },
        onError: (error) => {
          this.isRunning = false;
          this.emit('onError', error);
        },
      },
      { token }
    );
  }

  /**
   * 提取 LaTeX 代码块
   * @param {string} text 
   */
  static extractLatexCode(text) {
    if (!text) return null;
    
    // 尝试提取 ```latex ... ``` 或 ```tex ... ``` 代码块
    const latexMatch = text.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (latexMatch) {
      return latexMatch[1].trim();
    }

    // 如果内容本身看起来像 LaTeX 代码
    if (text.includes('\\') && (
      text.includes('\\begin') ||
      text.includes('\\section') ||
      text.includes('\\documentclass') ||
      text.includes('\\usepackage') ||
      text.includes('\\textbf') ||
      text.includes('\\item')
    )) {
      return text.trim();
    }

    return null;
  }
}

// 导出单例
export const latexAiAgent = new LatexAiAgent();

// 默认导出类
export default LatexAiAgent;
