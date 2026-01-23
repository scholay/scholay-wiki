/**
 * 智能矩阵分析请求队列管理器
 * 控制并发数量，避免触发 429 错误
 */

class AnalysisQueue {
  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.running = 0;
    this.results = new Map(); // paperId -> result
    this.callbacks = new Map(); // paperId -> [callbacks]
  }

  /**
   * 添加分析任务到队列
   * @param {string} paperId - 论文ID
   * @param {Function} analyzeFunc - 分析函数，返回 Promise
   * @param {Function} onComplete - 完成回调
   * @returns {Function} - 取消函数
   */
  enqueue(paperId, analyzeFunc, onComplete) {
    // 如果已有结果，直接返回
    if (this.results.has(paperId)) {
      setTimeout(() => onComplete?.(this.results.get(paperId)), 0);
      return () => {};
    }

    // 如果已在队列中，添加回调
    if (this.callbacks.has(paperId)) {
      this.callbacks.get(paperId).push(onComplete);
      return () => {
        const cbs = this.callbacks.get(paperId);
        if (cbs) {
          const idx = cbs.indexOf(onComplete);
          if (idx > -1) cbs.splice(idx, 1);
        }
      };
    }

    // 创建新任务
    const task = {
      paperId,
      analyzeFunc,
      cancelled: false,
    };

    this.callbacks.set(paperId, [onComplete]);
    this.queue.push(task);
    this.processQueue();

    // 返回取消函数
    return () => {
      task.cancelled = true;
      const cbs = this.callbacks.get(paperId);
      if (cbs) {
        const idx = cbs.indexOf(onComplete);
        if (idx > -1) cbs.splice(idx, 1);
      }
    };
  }

  /**
   * 处理队列
   */
  async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task || task.cancelled) {
      this.processQueue();
      return;
    }

    this.running++;

    try {
      const result = await task.analyzeFunc();
      
      if (!task.cancelled) {
        this.results.set(task.paperId, result);
        const callbacks = this.callbacks.get(task.paperId) || [];
        callbacks.forEach(cb => cb?.(result));
      }
    } catch (error) {
      console.error(`Analysis failed for paper ${task.paperId}:`, error);
      const callbacks = this.callbacks.get(task.paperId) || [];
      callbacks.forEach(cb => cb?.({ success: false, error }));
    } finally {
      this.callbacks.delete(task.paperId);
      this.running--;
      // 添加小延迟，避免请求过于密集
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * 清空队列和结果缓存
   */
  clear() {
    this.queue.forEach(task => task.cancelled = true);
    this.queue = [];
    this.results.clear();
    this.callbacks.clear();
  }

  /**
   * 检查论文是否已有结果
   */
  hasResult(paperId) {
    return this.results.has(paperId);
  }

  /**
   * 获取论文分析结果
   */
  getResult(paperId) {
    return this.results.get(paperId);
  }

  /**
   * 检查论文是否在队列中
   */
  isInQueue(paperId) {
    return this.callbacks.has(paperId);
  }
}

// 单例实例
const analysisQueue = new AnalysisQueue(2);

export default analysisQueue;
