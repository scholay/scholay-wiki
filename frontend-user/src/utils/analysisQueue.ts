/**
 * 智能矩阵分析批量请求队列管理器
 * 收集论文，达到批量阈值或超时后统一请求
 *
 * 核心逻辑：
 * - 首篇入队时启动倒计时
 * - 倒计时内达到 batchSize 篇 → 立即发送
 * - 倒计时结束 → 无论多少篇都发送（哪怕只有1篇）
 */

import { analysisDimensionAPI } from '../services/payment.api';
import logger from './logger';

export interface PaperInput {
  paperId: string;
  title: string;
  abstract: string;
}

// Backend response shape for a single paper analysis is variable across
// dimensions; we accept any object as long as it carries paperId/success.
export interface AnalysisResult {
  paperId: string;
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

// Server error payload shape (4020 insufficient balance) is loose JSON.
export type InsufficientBalanceData = Record<string, unknown> | null | undefined;

export type OnComplete = (result: AnalysisResult) => void;
export type OnError = (error: Error) => void;
export type OnBatchComplete = (results: AnalysisResult[], totalDeducted: number) => void;
export type OnInsufficientBalance = (errorData: InsufficientBalanceData) => void;

interface CallbackPair {
  onComplete?: OnComplete;
  onError?: OnError;
}

export interface QueueStatus {
  pending: number;
  cached: number;
  processing: boolean;
  paused: boolean;
}

class BatchAnalysisQueue {
  batchSize: number;
  batchTimeout: number;
  pendingPapers: PaperInput[] = [];
  timeoutId: ReturnType<typeof setTimeout> | null = null;
  processing: boolean = false;
  paused: boolean = false;
  results: Map<string, AnalysisResult> = new Map();
  callbacks: Map<string, CallbackPair[]> = new Map();

  onBatchComplete: OnBatchComplete | null = null;
  onInsufficientBalance: OnInsufficientBalance | null = null;

  constructor(batchSize: number = 5, batchTimeout: number = 300) {
    this.batchSize = batchSize;
    this.batchTimeout = batchTimeout;
  }

  setOnBatchComplete(callback: OnBatchComplete): void {
    this.onBatchComplete = callback;
  }

  setOnInsufficientBalance(callback: OnInsufficientBalance): void {
    this.onInsufficientBalance = callback;
  }

  enqueue(paper: PaperInput, onComplete?: OnComplete, onError?: OnError): void {
    if (this.paused) {
      return;
    }

    if (this.results.has(paper.paperId)) {
      setTimeout(() => onComplete?.(this.results.get(paper.paperId) as AnalysisResult), 0);
      return;
    }

    if (this.callbacks.has(paper.paperId)) {
      this.callbacks.get(paper.paperId)!.push({ onComplete, onError });
      return;
    }

    this.pendingPapers.push(paper);
    this.callbacks.set(paper.paperId, [{ onComplete, onError }]);

    if (this.pendingPapers.length >= this.batchSize) {
      this.clearTimeout();
      this.processBatch();
    } else {
      if (!this.timeoutId && !this.processing) {
        this.timeoutId = setTimeout(() => this.processBatch(), this.batchTimeout);
      }
    }
  }

  clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  async processBatch(): Promise<void> {
    this.clearTimeout();

    const batch = this.pendingPapers.splice(0, this.batchSize);
    if (batch.length === 0) return;

    this.processing = true;

    try {
      const papersData: PaperInput[] = batch.map((p) => ({
        paperId: p.paperId,
        title: p.title,
        abstract: p.abstract,
      }));

      logger.log('[BatchQueue] Sending batch request:', papersData.map((p) => p.paperId));

      const response = await analysisDimensionAPI.batchAnalyzePapers(papersData);

      logger.log('[BatchQueue] Response:', response.data);

      if (response.data.code === 4020) {
        this.handleInsufficientBalance(response.data.data, batch);
        return;
      }

      if (response.data.code === 0 && response.data.data) {
        const { results, total_deducted } = response.data.data as {
          results?: AnalysisResult[];
          total_deducted?: number;
        };

        logger.log('[BatchQueue] Results count:', results?.length, 'Total deducted:', total_deducted);

        if (results && Array.isArray(results)) {
          results.forEach((result) => {
            logger.log('[BatchQueue] Processing result for:', result.paperId, 'success:', result.success);

            this.results.set(result.paperId, result);

            const callbacks = this.callbacks.get(result.paperId) || [];
            logger.log('[BatchQueue] Found callbacks:', callbacks.length, 'for paperId:', result.paperId);

            callbacks.forEach(({ onComplete, onError }) => {
              if (result.success) {
                onComplete?.(result);
              } else {
                onError?.(new Error(result.error || 'Analysis failed'));
              }
            });
            this.callbacks.delete(result.paperId);
          });

          this.onBatchComplete?.(results, total_deducted ?? 0);
        }
      } else {
        console.error('[BatchQueue] Unexpected response:', response.data);
        const errorMessage = response.data.message || 'Analysis failed';
        batch.forEach((paper) => {
          const callbacks = this.callbacks.get(paper.paperId) || [];
          callbacks.forEach(({ onError }) => {
            onError?.(new Error(errorMessage));
          });
          this.callbacks.delete(paper.paperId);
        });
      }
    } catch (error: unknown) {
      // Axios error structure — typed loosely since we only inspect a few fields.
      const err = error as { response?: { data?: { code?: number; data?: InsufficientBalanceData } } } & Error;
      if (err.response?.data?.code === 4020) {
        this.handleInsufficientBalance(err.response.data.data, batch);
        return;
      }

      batch.forEach((paper) => {
        const callbacks = this.callbacks.get(paper.paperId) || [];
        callbacks.forEach(({ onError }) => {
          onError?.(error as Error);
        });
        this.callbacks.delete(paper.paperId);
      });
    } finally {
      this.processing = false;

      if (this.pendingPapers.length > 0 && !this.paused) {
        this.timeoutId = setTimeout(() => this.processBatch(), this.batchTimeout);
      }
    }
  }

  handleInsufficientBalance(errorData: InsufficientBalanceData, batch: PaperInput[]): void {
    this.pause();
    this.pendingPapers = [...batch, ...this.pendingPapers];
    this.onInsufficientBalance?.(errorData);
  }

  pause(): void {
    this.paused = true;
    this.clearTimeout();
  }

  resume(): void {
    this.paused = false;
    if (this.pendingPapers.length > 0) {
      this.timeoutId = setTimeout(() => this.processBatch(), this.batchTimeout);
    }
  }

  clear(): void {
    this.clearTimeout();
    this.pendingPapers = [];
    this.results.clear();
    this.callbacks.clear();
    this.paused = false;
    this.processing = false;
  }

  hasResult(paperId: string): boolean {
    return this.results.has(paperId);
  }

  getResult(paperId: string): AnalysisResult | undefined {
    return this.results.get(paperId);
  }

  isInQueue(paperId: string): boolean {
    return this.callbacks.has(paperId);
  }

  getStatus(): QueueStatus {
    return {
      pending: this.pendingPapers.length,
      cached: this.results.size,
      processing: this.processing,
      paused: this.paused,
    };
  }
}

const analysisQueue = new BatchAnalysisQueue(5, 300);

export default analysisQueue;
