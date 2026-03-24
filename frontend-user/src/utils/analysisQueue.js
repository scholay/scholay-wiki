/**
 * 智能矩阵分析批量请求队列管理器
 * 收集论文，达到批量阈值或超时后统一请求
 * 
 * 核心逻辑：
 * - 首篇入队时启动倒计时
 * - 倒计时内达到 batchSize 篇 → 立即发送
 * - 倒计时结束 → 无论多少篇都发送（哪怕只有1篇）
 */

import { analysisDimensionAPI } from '../services/api';

class BatchAnalysisQueue {
  constructor(batchSize = 5, batchTimeout = 300) {
    this.batchSize = batchSize;       // 批量大小上限
    this.batchTimeout = batchTimeout; // 超时时间(ms)
    this.pendingPapers = [];          // 待处理论文 [{ paper, onComplete, onError }]
    this.timeoutId = null;
    this.processing = false;
    this.results = new Map();         // paperId -> result (缓存已分析的结果)
    this.callbacks = new Map();       // paperId -> [{ onComplete, onError }]
    
    // 批量完成回调
    this.onBatchComplete = null;
  }

  /**
   * 设置批量完成回调
   * @param {Function} callback - (batchResults) => void
   */
  setOnBatchComplete(callback) {
    this.onBatchComplete = callback;
  }

  /**
   * 添加论文到队列
   * @param {Object} paper - { paperId, title, abstract }
   * @param {Function} onComplete - 成功回调 (result) => void
   * @param {Function} onError - 失败回调 (error) => void
   */
  enqueue(paper, onComplete, onError) {
    // 已有结果直接返回
    if (this.results.has(paper.paperId)) {
      setTimeout(() => onComplete?.(this.results.get(paper.paperId)), 0);
      return;
    }

    // 已在待处理队列中，添加回调
    if (this.callbacks.has(paper.paperId)) {
      this.callbacks.get(paper.paperId).push({ onComplete, onError });
      return;
    }

    // 加入待处理队列
    this.pendingPapers.push(paper);
    this.callbacks.set(paper.paperId, [{ onComplete, onError }]);

    // 达到批量大小上限，立即处理
    if (this.pendingPapers.length >= this.batchSize) {
      this.clearTimeout();
      this.processBatch();
    } else {
      // 首次入队时启动倒计时（后续入队不重置）
      if (!this.timeoutId && !this.processing) {
        this.timeoutId = setTimeout(() => this.processBatch(), this.batchTimeout);
      }
    }
  }

  /**
   * 清除超时计时器
   */
  clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * 处理当前批次
   */
  async processBatch() {
    this.clearTimeout();

    // 取出当前所有待处理论文（最多 batchSize 篇）
    const batch = this.pendingPapers.splice(0, this.batchSize);
    if (batch.length === 0) return;

    this.processing = true;

    try {
      // 准备请求数据
      const papersData = batch.map(p => ({
        paperId: p.paperId,
        title: p.title,
        abstract: p.abstract
      }));

      // 调用批量API
      const response = await analysisDimensionAPI.batchAnalyzePapers(papersData);

      // 处理成功响应
      if (response.data.code === 0 && response.data.data) {
        const { results } = response.data.data;

        // 处理每篇论文的结果
        if (results && Array.isArray(results)) {
          results.forEach(result => {
            // 缓存结果
            this.results.set(result.paperId, result);

            // 通知回调
            const callbacks = this.callbacks.get(result.paperId) || [];
            callbacks.forEach(({ onComplete, onError }) => {
              if (result.success) {
                onComplete?.(result);
              } else {
                onError?.(new Error(result.error || 'Analysis failed'));
              }
            });
            this.callbacks.delete(result.paperId);
          });

          // 通知批量完成回调
          this.onBatchComplete?.(results);
        }
      } else {
        // 处理其他错误响应（code !== 0）
        console.error('[BatchQueue] Unexpected response:', response.data);
        const errorMessage = response.data.message || 'Analysis failed';
        batch.forEach(paper => {
          const callbacks = this.callbacks.get(paper.paperId) || [];
          callbacks.forEach(({ onError }) => {
            onError?.(new Error(errorMessage));
          });
          this.callbacks.delete(paper.paperId);
        });
      }
    } catch (error) {
      // 错误，通知所有回调
      batch.forEach(paper => {
        const callbacks = this.callbacks.get(paper.paperId) || [];
        callbacks.forEach(({ onError }) => {
          onError?.(error);
        });
        this.callbacks.delete(paper.paperId);
      });
    } finally {
      this.processing = false;

      // 如果还有剩余论文，继续处理
      if (this.pendingPapers.length > 0) {
        this.timeoutId = setTimeout(() => this.processBatch(), this.batchTimeout);
      }
    }
  }

  /**
   * 清空队列和缓存
   */
  clear() {
    this.clearTimeout();
    this.pendingPapers = [];
    this.results.clear();
    this.callbacks.clear();
    this.processing = false;
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

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      pending: this.pendingPapers.length,
      cached: this.results.size,
      processing: this.processing
    };
  }
}

// 单例实例
const analysisQueue = new BatchAnalysisQueue(5, 300);

export default analysisQueue;
