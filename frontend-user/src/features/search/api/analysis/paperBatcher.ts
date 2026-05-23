import { http, toApiError } from '@/shared/lib/http';
import type { PaperAnalysisItem } from './matrix';

/**
 * Paper 分析批处理器 —— DataLoader 风格的微任务级请求合并。
 *
 * 用 useQueries 时,N 篇论文会在同一渲染周期各自触发 queryFn。如果每个 queryFn
 * 都直接发 HTTP,就是 N 次请求。这里把所有 queryFn 的入参收进队列,
 * 用 `queueMicrotask` 推迟一拍,在同步执行栈耗尽前一次性切成 ≤10 的块批量 POST,
 * 把结果按 paperId 分发回每个 promise。
 *
 * 收益:
 *   - 新增 1 篇论文 → 1 个 query 触发 → 1 个 batch(1 个 HTTP)
 *   - 维度变化 → N 个 query 同时失效 → 1 个微任务里收齐 → ceil(N/10) 个 HTTP
 *   - 中途追加的入参也能被同一批吃掉(只要还在同一 microtask)
 *
 * 端点 binding:"max=10",这里 BATCH_SIZE 与之对齐。
 */

const BATCH_SIZE = 10;

export interface BatchInput {
  paperId: string;
  title?: string;
  abstract?: string;
}

interface BatchAnalyzeResponse {
  results: PaperAnalysisItem[];
}

interface PendingRequest {
  input: BatchInput;
  resolve: (item: PaperAnalysisItem) => void;
  reject: (err: unknown) => void;
}

let pending: PendingRequest[] = [];
let scheduled = false;

export function batchLoad(input: BatchInput): Promise<PaperAnalysisItem> {
  return new Promise((resolve, reject) => {
    pending.push({ input, resolve, reject });
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });
}

async function postBatch(inputs: BatchInput[]): Promise<PaperAnalysisItem[]> {
  if (inputs.length === 0) return [];
  try {
    const { data } = await http.post<{ data: BatchAnalyzeResponse }>(
      '/analysis/papers/batch',
      { papers: inputs }
    );
    return data.data?.results ?? [];
  } catch (err) {
    throw toApiError(err);
  }
}

async function flush() {
  scheduled = false;
  const queue = pending;
  pending = [];

  // 按 paperId 去重 —— 同一渲染周期同一篇论文不该发两次
  // (useQueries 不会,但保险一下,且把多个 promise 关联到同一结果)
  const byId = new Map<string, PendingRequest[]>();
  for (const r of queue) {
    const list = byId.get(r.input.paperId);
    if (list) {
      list.push(r);
    } else {
      byId.set(r.input.paperId, [r]);
    }
  }

  const uniqueInputs = [...byId.values()].map((arr) => arr[0].input);
  const chunks: BatchInput[][] = [];
  for (let i = 0; i < uniqueInputs.length; i += BATCH_SIZE) {
    chunks.push(uniqueInputs.slice(i, i + BATCH_SIZE));
  }

  // 各 chunk 并行;某一 chunk 失败只 reject 它内部的 promise,不连累其它
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const results = await postBatch(chunk);
        const byPaperId = new Map<string, PaperAnalysisItem>();
        for (const item of results) byPaperId.set(item.paperId, item);
        for (const input of chunk) {
          const reqs = byId.get(input.paperId) ?? [];
          const item = byPaperId.get(input.paperId);
          if (item) {
            for (const r of reqs) r.resolve(item);
          } else {
            // 接口成功但没返该 paperId —— 兜底 error 占位,避免 promise 永挂
            for (const r of reqs) {
              r.resolve({
                paperId: input.paperId,
                success: false,
                from_cache: false,
                error: '分析结果缺失',
              });
            }
          }
        }
      } catch (err) {
        for (const input of chunk) {
          const reqs = byId.get(input.paperId) ?? [];
          for (const r of reqs) r.reject(err);
        }
      }
    })
  );
}
