/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX AI Agent
 * 核心 Agent 类，协调提示词、命令和流式处理
 */

import { LatexPrompts, SYSTEM_PROMPTS, TASK_PROMPTS, SECTION_PROMPTS } from './LatexPrompts';
import { LatexCommands } from './LatexCommands';
import { StreamHandler } from './StreamHandler';
import { SmoothAppender } from './SmoothAppender';

/**
 * LaTeX AI Agent 配置
 * @typedef {Object} AgentConfig
 * @property {string} apiEndpoint - API 端点
 * @property {string} token - 认证 token
 * @property {string} defaultModelLevel - 默认模型级别
 * @property {number} smoothDelay - 平滑显示延迟
 */

/**
 * 聊天消息
 * @typedef {Object} ChatMessage
 * @property {string} role - 角色 (system/user/assistant)
 * @property {string} content - 内容
 */

/**
 * LaTeX AI Agent 类
 * 参考 AiEditor 的 AiModel 架构
 */
export class LatexAiAgent {
  /**
   * @param {AgentConfig} config 
   */
  constructor(config = {}) {
    this.config = {
      apiEndpoint: '/api/v1/user/latex-writer/chat/stream',
      defaultModelLevel: 'mid',
      smoothDelay: 20,
      ...config
    };

    this.streamHandler = new StreamHandler();
    this.smoothAppender = null;
    this.isRunning = false;
    this.listeners = {
      onStart: [],
      onMessage: [],
      onComplete: [],
      onError: [],
    };
  }

  /**
   * 添加事件监听器
   * @param {string} event - 事件名称
   * @param {function} callback - 回调函数
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  /**
   * 移除事件监听器
   * @param {string} event 
   * @param {function} callback 
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    return this;
  }

  /**
   * 触发事件
   * @param {string} event 
   * @param  {...any} args 
   */
  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(...args));
    }
  }

  /**
   * 执行命令
   * @param {string} commandId - 命令 ID
   * @param {string} content - 内容（选中文本或输入）
   * @param {object} options - 额外选项
   */
  async executeCommand(commandId, content, options = {}) {
    const command = LatexCommands.getCommand(commandId);
    if (!command) {
      this.emit('onError', new Error(`未知命令: ${commandId}`));
      return;
    }

    // 检查是否需要选中文本
    if (command.requiresSelection && !content) {
      this.emit('onError', new Error('此操作需要先选中文本'));
      return;
    }

    // 构建提示词
    let prompt;
    if (command.taskType) {
      const variables = { content, ...command.variables };
      prompt = LatexPrompts.getTaskPrompt(command.taskType, variables);
    } else if (command.sectionType) {
      prompt = LatexPrompts.getSectionPrompt(command.sectionType, content);
    } else {
      this.emit('onError', new Error('命令配置错误'));
      return;
    }

    // 执行 AI 调用
    const modelLevel = options.modelLevel || command.modelLevel || this.config.defaultModelLevel;
    await this.chat(prompt, { modelLevel, ...options });
  }

  /**
   * 直接发送聊天请求
   * @param {string} prompt - 用户提示词
   * @param {object} options - 选项
   */
  async chat(prompt, options = {}) {
    if (this.isRunning) {
      console.warn('Agent 正在运行中');
      return;
    }

    const {
      systemPrompt = SYSTEM_PROMPTS.base,
      modelLevel = this.config.defaultModelLevel,
      context = '',
      fullContent = '',
      enableSmooth = true,
    } = options;

    this.isRunning = true;
    let fullResponse = '';

    // 创建平滑追加器
    if (enableSmooth) {
      this.smoothAppender = new SmoothAppender(this.config.smoothDelay, (text, isComplete) => {
        this.emit('onMessage', text, isComplete);
      });
    }

    // 构建请求
    const payload = {
      prompt,
      context,
      full_content: fullContent,
      model_level: modelLevel,
    };

    try {
      await this.streamHandler.stream(
        this.config.apiEndpoint,
        payload,
        {
          onStart: () => {
            this.emit('onStart');
          },
          onMessage: (content, status) => {
            fullResponse += content;
            if (enableSmooth && this.smoothAppender) {
              this.smoothAppender.appendText(content);
            } else {
              this.emit('onMessage', fullResponse, status === 2);
            }
          },
          onStop: () => {
            if (enableSmooth && this.smoothAppender) {
              this.smoothAppender.finish();
            }
            this.emit('onComplete', fullResponse);
            this.isRunning = false;
          },
          onError: (error) => {
            this.emit('onError', error);
            this.isRunning = false;
          },
        },
        {
          token: this.config.token || localStorage.getItem('user_token'),
        }
      );
    } catch (error) {
      this.emit('onError', error);
      this.isRunning = false;
    }
  }

  /**
   * 带上下文的聊天
   * @param {string} selectedText - 选中的文本
   * @param {string} userPrompt - 用户提示词
   * @param {object} options - 选项
   */
  async chatWithContext(selectedText, userPrompt, options = {}) {
    let finalPrompt = userPrompt;
    
    if (selectedText) {
      finalPrompt = `以下是当前选中的 LaTeX 代码：

\`\`\`latex
${selectedText}
\`\`\`

用户请求：${userPrompt}`;
    }

    await this.chat(finalPrompt, {
      context: selectedText,
      ...options,
    });
  }

  /**
   * 停止当前操作
   */
  stop() {
    if (this.streamHandler) {
      this.streamHandler.abort();
    }
    if (this.smoothAppender) {
      this.smoothAppender.stop();
    }
    this.isRunning = false;
    this.emit('onComplete', '');
  }

  /**
   * 检查是否正在运行
   */
  getIsRunning() {
    return this.isRunning;
  }

  /**
   * 更新配置
   * @param {Partial<AgentConfig>} config 
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取可用命令列表
   */
  getAvailableCommands() {
    return {
      quick: LatexCommands.getQuickCommands(),
      advanced: LatexCommands.getAdvancedCommands(),
      sections: LatexCommands.getSectionCommands(),
    };
  }

  /**
   * 获取可用任务列表
   */
  getAvailableTasks() {
    return LatexPrompts.getAvailableTasks();
  }

  /**
   * 获取可用章节列表
   */
  getAvailableSections() {
    return LatexPrompts.getAvailableSections();
  }

  /**
   * 销毁实例
   */
  destroy() {
    this.stop();
    this.listeners = {
      onStart: [],
      onMessage: [],
      onComplete: [],
      onError: [],
    };
  }
}

/**
 * 创建 LaTeX AI Agent 实例
 * @param {AgentConfig} config 
 * @returns {LatexAiAgent}
 */
export function createLatexAiAgent(config) {
  return new LatexAiAgent(config);
}

export default LatexAiAgent;
