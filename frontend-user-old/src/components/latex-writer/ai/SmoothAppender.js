/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 平滑文本追加器
 * 参考 AiEditor 的 SmoothAppender 实现
 * 用于实现打字机效果的流式文本显示
 */

export class SmoothAppender {
  constructor(delay = 30, onUpdate) {
    this.delay = delay;
    this.onUpdate = onUpdate;
    this.appending = false;
    this.isFinished = false;
    this.textQueue = [];
    this.currentText = '';
    this.intervalId = null;
  }

  /**
   * 追加文本到队列
   * @param {string} text 
   */
  appendText(text) {
    if (!text) return;
    this.textQueue.push(text);
    this.processQueue();
  }

  /**
   * 标记流结束
   */
  finish() {
    this.isFinished = true;
    this.processQueue();
  }

  /**
   * 获取当前已显示的文本
   */
  getText() {
    return this.currentText;
  }

  /**
   * 停止并清理
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.appending = false;
    this.textQueue = [];
  }

  /**
   * 重置状态
   */
  reset() {
    this.stop();
    this.currentText = '';
    this.isFinished = false;
  }

  /**
   * 处理队列中的文本
   */
  processQueue() {
    if (this.appending || this.textQueue.length === 0) {
      return;
    }

    // 如果已结束，直接追加所有剩余文本
    if (this.isFinished) {
      const remainingText = this.textQueue.join('');
      this.currentText += remainingText;
      this.textQueue = [];
      this.onUpdate?.(this.currentText, true);
      return;
    }

    const currentChunk = this.textQueue.shift();
    this.appending = true;
    let index = 0;

    this.intervalId = setInterval(() => {
      if (index < currentChunk.length) {
        this.currentText += currentChunk[index];
        this.onUpdate?.(this.currentText, false);
        index++;
      } else {
        clearInterval(this.intervalId);
        this.intervalId = null;
        this.appending = false;
        this.processQueue();
      }
    }, this.delay);
  }
}

/**
 * 创建一个 SmoothAppender 实例
 * @param {number} delay - 字符间隔（毫秒）
 * @param {function} onUpdate - 更新回调 (text, isComplete) => void
 * @returns {SmoothAppender}
 */
export function createSmoothAppender(delay = 30, onUpdate) {
  return new SmoothAppender(delay, onUpdate);
}

export default SmoothAppender;
