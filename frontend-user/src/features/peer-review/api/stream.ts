/**
 * 智能审稿 · 流式输出订阅 hook。
 *
 * 后端 SSE 协议见 [[backend/internal/peerreview/handler.go]] StreamPartial:
 *   event: snapshot   {phase, text}
 *   event: delta      {phase, text}
 *   event: done       {phase, text}
 *   event: error      {phase, error}
 *
 * 用 fetch + ReadableStream 手撸 SSE 解析,**不用 EventSource** —
 * EventSource 不支持自定义 header,无法带 Bearer JWT 鉴权。
 *
 * 重入兼容性:
 *   - 进入页面时 submission.computeState='computing_*' → 调用 enable=true 开订阅
 *     - 后端先发当前累积 snapshot,再陆续发 delta;UI 会"瞬移到最新点 + 继续流"
 *   - submission.computeState='idle' → 不开订阅,UI 直接显示 DB 里的最终值
 *   - 用户在流中途刷新 → 重新订阅,broker 还有这条 submission,继续推
 *   - 流刚结束用户刷新 → broker 保留 30s,SSE 返 done + text;前端 polling
 *     useSubmission 也能拿到 DB 持久化的最终值
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthToken, notifyAuthLost } from '@/shared/lib/auth-token';
import { useAuthStore } from '@/stores/auth.store';

export type StreamPhase = 'computing' | 'done' | 'error';

export interface StreamState {
  /** 当前已累积的全部文本 (snapshot + 所有 delta 拼接) */
  text: string;
  phase: StreamPhase;
  error?: string;
  /**
   * 最近一条瞬时进度提示 ("正在读取稿件…/检索文献…")。agent 用工具的静默期(无正文 delta)
   * 靠它给反馈。不进 text, 只是 loading 文案。
   */
  status?: string;
}

export interface UseStreamingPartialOptions {
  submissionId: number | undefined;
  /** 调用方在 computeState='computing_*' 时传 true, 否则 false → hook 不开 SSE */
  enabled: boolean;
  /**
   * Stream slot — 后端 broker 用复合 key (submissionID, slot) 隔离多条并存流:
   *   'meta'             — wizard Step1→2 抽 meta (默认, 兼容老调用)
   *   'letter'           — wizard Step2→3 起草信件
   *   'reviewer:alpha'   — 审稿人 A 写报告
   *   'reviewer:beta'    — 审稿人 B
   *   'reviewer:gamma'   — 审稿人 C
   *   'reviewer:chief'   — 主审决议
   */
  slot?: string;
}

/**
 * 调用方拿 { text, phase } 自行渲染:
 *   - letter 步骤直接把 text 写进 textarea 本地 state
 *   - meta 步骤用 regex 边匹配边填表单字段
 *   - 审稿人 panel 用 text 实时显示 agent 正在写的 JSON / markdown,
 *     done 后切到结构化 panel (从 reports API 拿)
 */
export function useStreamingPartial({
  submissionId,
  enabled,
  slot,
}: UseStreamingPartialOptions): StreamState {
  const [state, setState] = useState<StreamState>({ text: '', phase: 'done' });
  // storeToken 只作 reactivity 依赖(登录/登出时重订阅);真实 token 在 effect 里取 localStorage。
  const storeToken = useAuthStore((s) => s.token);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    abortRef.current?.abort();
    // 真实 token 取 localStorage.auth_token —— 与 axios(shared/lib/http.ts)、sse-post 同源。
    // 之前用 useAuthStore.token:一旦 store 与 localStorage 不同步(走 axios 的请求仍 200,
    // 而 SSE 拿到 store 里的旧 token → 401),流订阅就会失败 → 前端退化成轮询最终结果 →
    // 第2/3步表单与三审稿人/主审决议全部"一口气出"而非流式渲染。
    const token = getAuthToken() || storeToken;
    if (!enabled || !submissionId || !token) {
      // 关流时直接清 buffer — 不保留上一轮的文本。
      // 之前留着是想"UI 看最后一帧", 但跨阶段 (computing_meta → computing_letter)
      // 会让上一阶段的内容污染下一阶段 (e.g. JSON 漏进 Cover Letter textarea)。
      // 父组件应该根据 submission 数据 (DB 持久化) 决定渲染什么, 不依赖 stream cache。
      setState({ text: '', phase: 'done' });
      return;
    }

    // 同样,新订阅立刻把 text 清空, 等 snapshot 帧或第一条 delta 重新填。
    setState({ text: '', phase: 'computing' });

    // 控制帧 → 查询失效(2026-08-12 推送化):后端在 computeState 翻转时广播 state 帧、
    // 报告落库后广播 report_ready 帧;done/error 同样意味着状态已推进(meta/letter 完成 →
    // idle + 字段回填,reviewer 完成 → 报告可读)。收帧即 invalidate,轮询从 2s/5s 降级为
    // 慢兜底(见 submissions.ts/reports.ts)后,推进的即时性由这里保证。
    const onFrameEvent = (event: string) => {
      if (event === 'state' || event === 'done' || event === 'error') {
        void qc.invalidateQueries({
          queryKey: ['peer-review', 'submissions', 'detail', submissionId],
        });
      }
      if (event === 'report_ready' || event === 'done' || event === 'error') {
        void qc.invalidateQueries({ queryKey: ['peer-review', 'reports', submissionId] });
      }
    };

    // 断流韧性(2026-08-12 审计):
    //   · 看门狗 —— TCP 半死(后端不再投递但连接未断)时 reader.read() 会永远挂起,
    //     面板停在「computing」;45s 无帧视为 stall,abort 后重订阅(对齐 useAgentSocket 的 45s)。
    //   · 有限重订阅 —— fetch 异常/5xx(部署/代理闪断)此前直接置 error 终态;
    //     broker 支持重入 snapshot(见文件头),带退避最多再试 2 次,不会形成风暴。
    //   · 4xx 是确定性失败不重试(401 已汇入 notifyAuthLost)。
    const STALL_MS = 45_000;
    const MAX_RESUBSCRIBES = 2;
    let stopped = false;
    let resubscribes = 0;

    async function subscribe(): Promise<void> {
      const ac = new AbortController();
      abortRef.current = ac;
      let stalled = false;
      let fatal = false;
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      const armStall = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          stalled = true;
          ac.abort();
        }, STALL_MS);
      };
      try {
        const qs = slot ? `?slot=${encodeURIComponent(slot)}` : '';
        const url = `/api/v1/user/peer-review/submissions/${submissionId}/stream${qs}`;
        armStall(); // 建连/响应头阶段也在看门狗内 —— TCP 半死若发生在(重)建连时同样会永久挂起
        const resp = await fetch(url, {
          // Accept: text/event-stream 让后端 APITimeoutMiddleware 识别为 SSE → 15min 超时,
          // 否则 GET 默认 15s 会把流式审稿/识别中途掐断 (尤其 meta 工具阶段就 >15s)。
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: ac.signal,
        });
        if (!resp.ok || !resp.body) {
          // SSE 绕过 axios,认证失效要手动汇入统一出口(清 token + 弹登录框),否则审稿流 401 静默失败。
          if (resp.status === 401) notifyAuthLost();
          if (resp.status >= 400 && resp.status < 500) fatal = true;
          throw new Error(`stream http ${resp.status}`);
        }
        armStall();
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let sawTerminal = false; // 收到 done/error 帧才算后端有意关流
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          armStall();
          buf += decoder.decode(value, { stream: true });
          // SSE 帧以 \n\n 分隔
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (isTerminalFrame(frame)) sawTerminal = true;
            handleFrame(frame, setState, onFrameEvent);
            // 活帧到达 = 本轮断连已恢复,重置重订阅预算(预算是"每次断连最多试 2 次",
            // 不是整场流的终身配额 —— 否则长审稿流累计 2 次瞬断后第三次直接终态 error)。
            resubscribes = 0;
          }
        }
        // 干净 EOF 但没有 done/error 帧 = 代理/后端半途掐断(后端协议保证终止帧),按断连重试。
        if (!sawTerminal) throw new Error('stream ended without terminal frame');
      } catch (err) {
        if (stopped) return;
        if ((err as Error).name === 'AbortError' && !stalled) return; // 外部 cleanup 的 abort
        if (!fatal && resubscribes < MAX_RESUBSCRIBES) {
          resubscribes += 1;
          await new Promise((r) => setTimeout(r, 1_000 * resubscribes));
          if (stopped) return;
          return subscribe(); // broker 重入发 snapshot,text 整体覆盖不会重复
        }
        // 前端网络/解析异常 message 可能为空或晦涩 —— 兜一个友好默认, 避免空白错误。
        setState((s) => ({ ...s, phase: 'error', error: (err as Error).message || '连接中断,请稍后重试' }));
      } finally {
        if (stallTimer) clearTimeout(stallTimer);
      }
    }

    void subscribe();

    return () => {
      stopped = true;
      abortRef.current?.abort();
    };
  }, [submissionId, enabled, storeToken, slot, qc]);

  return state;
}

// ─── SSE 帧解析 ─────────────────────────────────────────────────────────

/** done/error 是后端的有意关流信号;EOF 前没见到它们 = 半途掐断,值得重订阅。 */
function isTerminalFrame(frame: string): boolean {
  return frame
    .split('\n')
    .some((line) => line.startsWith('event:') && ['done', 'error'].includes(line.slice(6).trim()));
}

function handleFrame(
  frame: string,
  setState: (u: (s: StreamState) => StreamState) => void,
  onEvent?: (event: string) => void
) {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  // 控制帧(state/report_ready)与终止帧的查询失效回调 —— 在 payload 解析前调,
  // 失效只依赖事件名;state/report_ready 不进下面的渲染 switch(无 UI 载荷)。
  onEvent?.(event);
  if (!data) return;

  let payload: { phase: StreamPhase; text?: string; error?: string; note?: string };
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }

  switch (event) {
    case 'status':
      // 瞬时进度提示 — 只更新 status 文案, 不动 phase/text。
      setState((s) => ({ ...s, status: payload.note }));
      break;
    case 'snapshot':
      // 后端首帧, 直接覆盖
      setState(() => ({
        text: payload.text ?? '',
        phase: payload.phase,
        error: payload.error,
      }));
      break;
    case 'delta':
      // 增量片段拼接
      setState((s) => ({
        ...s,
        phase: 'computing',
        text: s.text + (payload.text ?? ''),
      }));
      break;
    case 'done':
      // 后端把最终全文本一并发, 直接覆盖以免漏帧 (broker 满了丢帧时关键的兜底)
      setState(() => ({
        text: payload.text ?? '',
        phase: 'done',
      }));
      break;
    case 'error':
      setState((s) => ({ ...s, phase: 'error', error: payload.error }));
      break;
  }
}

// ─── 增量 JSON 字段抽取 (Step2 meta 边流边填) ──────────────────────────
//
// agent 输出是流式 JSON, 用 regex 边到边抽:
//   - "title":"..."        完整字符串
//   - "title":"..."(尾巴未闭合)  部分字符串
//   - "keywords":[...]     完整数组
//
// 不是严格 JSON parser, 只识别 5 个固定字段。

export interface PartialMeta {
  title?: string;
  abstract?: string;
  keywords?: string[];
  subjects?: string[];
  manuscriptType?: 'research' | 'review' | 'short_communication';
}

export function extractPartialMeta(text: string): PartialMeta {
  return {
    title: extractStringField(text, 'title'),
    abstract: extractStringField(text, 'abstract'),
    keywords: extractArrayField(text, 'keywords'),
    subjects: extractArrayField(text, 'subjects'),
    manuscriptType: extractTypeField(text),
  };
}

/** 匹配 "field":"完整或不完整字符串" — 没找到返 undefined */
function extractStringField(text: string, field: string): string | undefined {
  // 完整闭合:"field":"value" — 用 lazy 匹配 + 处理转义引号粗糙版
  const closed = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
  if (closed) {
    return unescapeJsonString(closed[1]);
  }
  // 流式未闭合:"field":"已有的前缀
  const open = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$`).exec(text);
  if (open) {
    return unescapeJsonString(open[1]);
  }
  return undefined;
}

function extractArrayField(text: string, field: string): string[] | undefined {
  // 完整闭合:"field":[...]
  const closed = new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]*)\\]`).exec(text);
  if (closed) {
    return splitArrayContent(closed[1]);
  }
  // 流式未闭合:"field":["a","b",
  const open = new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]*)$`).exec(text);
  if (open) {
    const parts = splitArrayContent(open[1]);
    // 最后一项可能没闭合引号 —— 如果不是以 " 结尾, 去掉它(不完整)
    if (parts.length > 0 && !open[1].trimEnd().endsWith('"')) {
      return parts.slice(0, -1);
    }
    return parts;
  }
  return undefined;
}

function extractTypeField(text: string): PartialMeta['manuscriptType'] {
  const m = /"manuscriptType"\s*:\s*"(research|review|short_communication)"/.exec(text);
  return m ? (m[1] as PartialMeta['manuscriptType']) : undefined;
}

function splitArrayContent(inner: string): string[] {
  // 简单分割带引号的字符串数组 "a","b","c"
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    out.push(unescapeJsonString(m[1]));
  }
  return out;
}

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
