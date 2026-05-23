/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * Agent Core - 事件驱动的 AI Agent 核心
 * 
 * 参考 OpenHands 的设计理念：
 * 1. 无状态、事件驱动架构
 * 2. Reasoning-Action 循环
 * 3. 支持 Function Calling / Tool Use
 * 4. 上下文管理
 */

import { userAPI } from '../../../services/user.api';
import logger from '../../../utils/logger';

/**
 * Agent 状态
 */
export const AgentState = {
  IDLE: 'idle',
  THINKING: 'thinking',
  CALLING_TOOL: 'calling_tool',
  WAITING_CONFIRMATION: 'waiting_confirmation',
  COMPLETED: 'completed',
  ERROR: 'error',
};

/**
 * 事件类型
 */
export const AgentEvent = {
  STATE_CHANGE: 'stateChange',
  THINKING: 'thinking',
  TOOL_CALL: 'toolCall',
  TOOL_RESULT: 'toolResult',
  MESSAGE: 'message',
  CODE_GENERATED: 'codeGenerated',
  COMPLETE: 'complete',
  ERROR: 'error',
};

/**
 * Agent Core 类
 * 实现事件驱动的 Reasoning-Action 循环
 */
export class AgentCore {
  constructor(config = {}) {
    this.config = {
      maxIterations: 5,          // 最大推理循环次数
      autoExecuteTools: true,    // 是否自动执行工具
      modelLevel: 'mid',
      streamingEnabled: true,
      ...config,
    };

    this.state = AgentState.IDLE;
    this.listeners = new Map();
    this.tools = new Map();
    this.history = [];
    this.currentIteration = 0;
    this.abortController = null;
  }

  // ============================================================================
  // 事件系统
  // ============================================================================

  /**
   * 注册事件监听器
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
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error(`[AgentCore] Event handler error:`, e);
        }
      });
    }
  }

  /**
   * 设置状态并触发事件
   */
  setState(newState, data = {}) {
    const oldState = this.state;
    this.state = newState;
    this.emit(AgentEvent.STATE_CHANGE, { oldState, newState, ...data });
  }

  // ============================================================================
  // 工具管理
  // ============================================================================

  /**
   * 注册工具
   */
  registerTool(name, definition, executor) {
    this.tools.set(name, { definition, executor });
  }

  /**
   * 批量注册工具
   */
  registerTools(tools) {
    tools.forEach(({ name, definition, executor }) => {
      this.registerTool(name, definition, executor);
    });
  }

  /**
   * 从后端加载工具
   */
  async loadToolsFromBackend() {
    try {
      const response = await userAPI.getMCPTools();
      if (response.data?.tools) {
        // 将后端工具转换为本地工具定义
        response.data.tools.forEach(tool => {
          this.tools.set(tool.name, {
            definition: tool,
            executor: async (args) => {
              // 调用后端 MCP 工具
              const result = await userAPI.callMCPTool(tool.name, args);
              return result.data;
            },
          });
        });
        logger.log(`[AgentCore] Loaded ${response.data.tools.length} tools from backend`);
      }
    } catch (error) {
      console.error('[AgentCore] Failed to load tools:', error);
    }
  }

  /**
   * 获取工具列表（LLM 格式）
   */
  getToolsForLLM() {
    const tools = [];
    this.tools.forEach((tool, name) => {
      tools.push({
        type: 'function',
        function: {
          name,
          description: tool.definition.description,
          parameters: tool.definition.inputSchema || tool.definition.parameters,
        },
      });
    });
    return tools;
  }

  /**
   * 执行工具
   */
  async executeTool(name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    this.emit(AgentEvent.TOOL_CALL, { name, args });
    
    try {
      const result = await tool.executor(args);
      this.emit(AgentEvent.TOOL_RESULT, { name, args, result, success: true });
      return result;
    } catch (error) {
      this.emit(AgentEvent.TOOL_RESULT, { name, args, error: error.message, success: false });
      throw error;
    }
  }

  // ============================================================================
  // 核心推理循环
  // ============================================================================

  /**
   * 运行 Agent
   * 实现 Reasoning-Action 循环
   */
  async run(userMessage, context = {}) {
    if (this.state !== AgentState.IDLE) {
      throw new Error('Agent is already running');
    }

    this.currentIteration = 0;
    this.abortController = new AbortController();

    // 构建初始消息
    const messages = this.buildMessages(userMessage, context);

    try {
      this.setState(AgentState.THINKING);

      // 主循环：Reasoning-Action
      while (this.currentIteration < this.config.maxIterations) {
        this.currentIteration++;

        // 检查是否被中止
        if (this.abortController.signal.aborted) {
          throw new Error('Agent aborted');
        }

        // 调用 LLM
        const response = await this.callLLM(messages, context);

        // 解析响应
        const { content, toolCalls, finished } = this.parseResponse(response);

        // 发送消息事件
        if (content) {
          this.emit(AgentEvent.MESSAGE, { content, iteration: this.currentIteration });
          
          // 检查是否有代码生成
          const code = this.extractCode(content);
          if (code) {
            this.emit(AgentEvent.CODE_GENERATED, { code, content });
          }
        }

        // 如果没有工具调用或已完成，退出循环
        if (!toolCalls || toolCalls.length === 0 || finished) {
          break;
        }

        // 执行工具调用
        this.setState(AgentState.CALLING_TOOL);
        
        for (const toolCall of toolCalls) {
          try {
            const result = await this.executeTool(toolCall.name, toolCall.arguments);
            
            // 将工具结果添加到消息中
            messages.push({
              role: 'assistant',
              content: null,
              tool_calls: [toolCall],
            });
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error: ${error.message}`,
            });
          }
        }

        this.setState(AgentState.THINKING);
      }

      // 完成
      this.setState(AgentState.COMPLETED);
      this.emit(AgentEvent.COMPLETE, { iterations: this.currentIteration });

    } catch (error) {
      this.setState(AgentState.ERROR, { error: error.message });
      this.emit(AgentEvent.ERROR, { error });
      throw error;
    } finally {
      this.setState(AgentState.IDLE);
    }
  }

  /**
   * 流式运行（用于实时输出）
   */
  async streamRun(userMessage, context = {}) {
    if (this.state !== AgentState.IDLE) {
      throw new Error('Agent is already running');
    }

    this.currentIteration = 0;
    this.abortController = new AbortController();

    try {
      this.setState(AgentState.THINKING);

      // 使用后端的流式 API
      const apiEndpoint = context.documentId 
        ? `/api/v1/user/latex-writer/documents/${context.documentId}/chat/stream`
        : '/api/v1/user/latex-writer/chat/stream';

      const token = localStorage.getItem('user_token');
      let fullResponse = '';

      await this.fetchStream(apiEndpoint, {
        prompt: userMessage,
        context: context.contextStr || '',
        full_content: context.fullContent || '',
        model_level: context.modelLevel || this.config.modelLevel,
        tools: this.getToolsForLLM(), // 传递工具定义
      }, {
        onStart: () => {
          this.emit(AgentEvent.STATE_CHANGE, { newState: AgentState.THINKING });
        },
        onMessage: (content) => {
          fullResponse += content;
          this.emit(AgentEvent.MESSAGE, { content: fullResponse, streaming: true });
        },
        onToolCall: async (toolCall) => {
          this.setState(AgentState.CALLING_TOOL);
          this.emit(AgentEvent.TOOL_CALL, toolCall);
          
          try {
            const result = await this.executeTool(toolCall.name, toolCall.arguments);
            this.emit(AgentEvent.TOOL_RESULT, { ...toolCall, result, success: true });
            return result;
          } catch (error) {
            this.emit(AgentEvent.TOOL_RESULT, { ...toolCall, error: error.message, success: false });
            throw error;
          }
        },
        onComplete: () => {
          const code = this.extractCode(fullResponse);
          if (code) {
            this.emit(AgentEvent.CODE_GENERATED, { code, content: fullResponse });
          }
          this.setState(AgentState.COMPLETED);
          this.emit(AgentEvent.COMPLETE, { content: fullResponse });
        },
        onError: (error) => {
          this.setState(AgentState.ERROR, { error: error.message });
          this.emit(AgentEvent.ERROR, { error });
        },
      }, token);

    } catch (error) {
      this.setState(AgentState.ERROR, { error: error.message });
      this.emit(AgentEvent.ERROR, { error });
      throw error;
    } finally {
      this.setState(AgentState.IDLE);
    }
  }

  /**
   * 停止运行
   */
  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.setState(AgentState.IDLE);
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 构建消息列表
   */
  buildMessages(userMessage, context) {
    const messages = [];

    // 系统消息
    const systemPrompt = this.buildSystemPrompt(context);
    messages.push({ role: 'system', content: systemPrompt });

    // 添加历史消息
    if (context.history && context.history.length > 0) {
      messages.push(...context.history.slice(-10));
    }

    // 用户消息
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * 构建系统提示词
   */
  buildSystemPrompt(context) {
    let prompt = `你是一个专业的 LaTeX 论文写作助手，具备以下能力：

1. 精通 LaTeX 排版系统
2. 熟悉学术论文写作规范
3. 可以调用工具来完成各种任务

【可用工具】
你可以调用以下工具来辅助完成任务：
`;

    // 添加工具描述
    this.tools.forEach((tool, name) => {
      prompt += `- ${name}: ${tool.definition.description}\n`;
    });

    prompt += `
【输出格式】
使用以下结构化格式回复：

<think>
思考过程（分析用户需求）
</think>

<reply>
给用户的回复说明
</reply>

<code>
纯 LaTeX 代码（如果需要）
</code>

【重要规则】
1. 代码中不要使用中文字符（除非明确要求中文）
2. 确保 LaTeX 语法正确
3. 如果需要验证代码，请调用 validate_latex 工具
4. 如果需要搜索论文，请调用相应的搜索工具
`;

    if (context.fullContent) {
      prompt += `\n【当前文档内容】\n${context.fullContent}\n`;
    }

    return prompt;
  }

  /**
   * 调用 LLM
   */
  async callLLM(messages, context) {
    // 这里应该调用实际的 LLM API
    // 暂时返回模拟响应
    throw new Error('callLLM not implemented - use streamRun instead');
  }

  /**
   * 解析 LLM 响应
   */
  parseResponse(response) {
    // 解析工具调用
    const toolCalls = response.tool_calls || [];
    
    // 检查是否有结束标记
    const finished = response.finish_reason === 'stop' || 
                    !toolCalls || 
                    toolCalls.length === 0;

    return {
      content: response.content || response.message?.content,
      toolCalls: toolCalls.map(tc => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: JSON.parse(tc.function?.arguments || '{}'),
      })),
      finished,
    };
  }

  /**
   * 提取代码
   */
  extractCode(content) {
    if (!content) return null;

    // 尝试提取 <code> 标签
    const codeTagMatch = content.match(/<code>([\s\S]*?)<\/code>/);
    if (codeTagMatch) {
      return codeTagMatch[1].trim();
    }

    // 尝试提取 ```latex 代码块
    const latexMatch = content.match(/```(?:latex|tex)?\n?([\s\S]*?)```/);
    if (latexMatch) {
      return latexMatch[1].trim();
    }

    return null;
  }

  /**
   * 流式请求
   */
  async fetchStream(url, body, callbacks, token) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    callbacks.onStart?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              callbacks.onComplete?.();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                callbacks.onMessage?.(parsed.content);
              }
              if (parsed.tool_call) {
                await callbacks.onToolCall?.(parsed.tool_call);
              }
            } catch {
              // 非 JSON 数据，直接作为文本处理
              callbacks.onMessage?.(data);
            }
          }
        }
      }

      callbacks.onComplete?.();
    } catch (error) {
      if (error.name !== 'AbortError') {
        callbacks.onError?.(error);
      }
    }
  }

  /**
   * 重置 Agent
   */
  reset() {
    this.stop();
    this.history = [];
    this.currentIteration = 0;
    this.state = AgentState.IDLE;
  }

  /**
   * 销毁 Agent
   */
  destroy() {
    this.reset();
    this.listeners.clear();
    this.tools.clear();
  }
}

/**
 * 创建 Agent 实例
 */
export function createAgent(config = {}) {
  return new AgentCore(config);
}

export default AgentCore;
