/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 流式响应处理器
 * 处理 SSE 流式响应
 */

/**
 * 消息监听器接口
 * @typedef {Object} MessageListener
 * @property {function} onStart - 开始回调
 * @property {function} onMessage - 消息回调 (content, status)
 * @property {function} onStop - 结束回调
 * @property {function} onError - 错误回调
 */

/**
 * 流式响应处理器
 */
export class StreamHandler {
  constructor() {
    this.abortController = null;
    this.reader = null;
    this.stopped = false; // 防止重复调用 onStop
  }

  /**
   * 发起流式请求
   * @param {string} url - API 地址
   * @param {object} payload - 请求体
   * @param {MessageListener} listener - 消息监听器
   * @param {object} options - 额外选项
   */
  async stream(url, payload, listener, options = {}) {
    const { headers = {}, token } = options;

    // 重置状态
    this.stopped = false;
    
    // 创建中止控制器
    this.abortController = new AbortController();

    // 安全的 onStop 调用（只调用一次）
    const safeOnStop = () => {
      if (!this.stopped) {
        this.stopped = true;
        listener.onStop?.();
      }
    };

    try {
      listener.onStart?.();

      const requestHeaders = {
        'Content-Type': 'application/json',
        ...headers
      };

      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`请求失败 (${response.status}): ${errorText}`);
      }

      this.reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await this.reader.read();
        
        if (done) {
          safeOnStop();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        // SSE 消息以 \n\n 分隔，按此分割
        const messages = buffer.split('\n\n');
        
        // 保留最后一个可能不完整的消息
        buffer = messages.pop() || '';

        for (const message of messages) {
          if (!message.trim()) continue;
          
          // 处理可能的多行 data 消息
          // SSE 规范：多行数据每行以 data: 开头
          const lines = message.split('\n');
          const dataLines = [];
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              dataLines.push(line.slice(6));
            } else if (line.startsWith('data:')) {
              // 处理 "data:" 后面没有空格的情况
              dataLines.push(line.slice(5));
            }
          }
          
          // 如果没有 data: 行，跳过
          if (dataLines.length === 0) continue;
          
          // 合并所有 data 行（用换行连接，保留原始换行）
          const data = dataLines.join('\n');
            
          if (data === '[DONE]') {
            safeOnStop();
            return;
          }

          // 尝试解析为 JSON（OpenAI 格式）
          let handled = false;
          try {
            const parsed = JSON.parse(data);
            // 必须是对象且有 choices 字段才认为是有效的 JSON 响应
            if (parsed && typeof parsed === 'object' && parsed.choices) {
              const content = parsed.choices?.[0]?.delta?.content || '';
              const finishReason = parsed.choices?.[0]?.finish_reason;
              
              if (content) {
                // 解码转义的换行符：<br> -> \n
                const decoded = content.replace(/<br>/g, '\n');
                listener.onMessage?.(decoded, finishReason === 'stop' ? 2 : 1);
              }

              if (finishReason === 'stop') {
                safeOnStop();
                return;
              }
              handled = true;
            }
          } catch (e) {
            // JSON 解析失败，将在下面作为纯文本处理
          }
          
          // 非 JSON 格式或不是有效的 OpenAI 格式，作为纯文本处理
          if (!handled && data && data !== '[DONE]') {
            // 解码转义的换行符：<br> -> \n
            const decoded = data.replace(/<br>/g, '\n');
            listener.onMessage?.(decoded, 1);
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        safeOnStop();
      } else {
        listener.onError?.(error);
      }
    } finally {
      this.cleanup();
    }
  }

  /**
   * 中止请求
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.reader) {
      this.reader.cancel().catch(() => {});
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.abortController = null;
    this.reader = null;
  }

  /**
   * 检查是否正在运行
   */
  isRunning() {
    return this.abortController !== null;
  }
}

/**
 * 创建流处理器实例
 */
export function createStreamHandler() {
  return new StreamHandler();
}

export default StreamHandler;
