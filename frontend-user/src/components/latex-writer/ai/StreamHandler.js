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

    // 创建中止控制器
    this.abortController = new AbortController();

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
          listener.onStop?.();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // 保留最后一个可能不完整的行
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              listener.onStop?.();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              const finishReason = parsed.choices?.[0]?.finish_reason;
              
              if (content) {
                listener.onMessage?.(content, finishReason === 'stop' ? 2 : 1);
              }

              if (finishReason === 'stop') {
                listener.onStop?.();
                return;
              }
            } catch (e) {
              // 解析失败，可能是非标准格式，尝试直接使用
              if (data && data !== '[DONE]') {
                listener.onMessage?.(data, 1);
              }
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        listener.onStop?.();
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
