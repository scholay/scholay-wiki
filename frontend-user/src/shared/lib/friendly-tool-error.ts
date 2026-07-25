/**
 * 工具/轮级错误的「用户轨道」文案 + 运维细节脱敏兜底(claw 修复计划 2026-07 · W5 P0-B)。
 *
 * 三道防线里的第二道(前端兜底):
 *   1. agent 工具层双轨(tool_result 帧可选 `userMessage`,仅 isError 时)是源头;
 *   2. **本文件**接管 agent 层漏网 / 旧历史事件(无 user_message 字段)/ MCP 透传错误 ——
 *      `friendlyToolError` 把运维原文分类映射成一句用户文案,`sanitizeOpsText` 把「技术详情」
 *      里的容器路径 / env 名 / 沙箱词汇 / JS 堆栈打码;
 *   3. `friendlyTurnError` 给 error 终帧的 code → 文案映射(未知 code 用后端已净化的 message)。
 *
 * 纯 TS 叶子(shared/lib 无依赖),三个 feature(claw / smart-search / prism)共用。
 * 文案口径:中文、克制、不吓用户 —— 「哪步没成 + AI 接下来怎么办」,不出现内部实现词汇。
 */

// ─── 工具错误分类映射(命中即整体替换摘要)────────────────────────────────
// 对照 2026-07 审计 P1-12 真实泄漏样本;顺序即优先级(沙箱类最具体,放最前)。
const CLASSIFIERS: Array<{ re: RegExp; summary: string }> = [
  {
    re: /bwrap|bubblewrap|seccomp|apparmor|sandbox|secure-by-default|unshare|Failed to make .* slave|沙箱/i,
    summary: '执行环境暂不可用,该步骤已跳过。',
  },
  { re: /bash disabled|command not found|\bexit \d+|spawn .*ENOENT/i, summary: '命令执行未成功。' },
  { re: /pandoc|pdftotext|pdf.?engine|导出/i, summary: '文档转换未成功。' },
  { re: /permission denied|not permitted/i, summary: '该操作未获授权,已跳过。' },
  { re: /timeout|timed out|ETIMEDOUT|超时/i, summary: '该步骤等待超时。' },
  { re: /circuit|breaker|熔断|ECONNREFUSED|fetch failed|network/i, summary: '上游服务暂时不可用。' },
];

/** 分类 miss 时按工具名兜底(与 agent runTools.genericToolUserMessage 同一张表,口径一致)。 */
function genericToolUserMessage(name: string): string {
  if (name.startsWith('mcp__minicod__')) return '文献检索暂时失败,AI 会调整检索方式重试。';
  if (name === 'Bash') return '命令执行未成功。';
  if (name === 'Read' || name === 'ReadDocument' || name === 'Grep' || name === 'Glob') {
    return '读取内容未成功。';
  }
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') return '写入内容未成功。';
  if (name === 'ExportDocument') return '文档导出未成功。';
  return '该步骤未成功,AI 会尝试其它方式。';
}

/**
 * 失败工具卡的默认摘要:运维关键词分类 → 用户文案;都 miss → 按工具名兜底。
 * 仅在 tool_result 帧没带 `userMessage`(旧事件 / agent 层漏网)时被 ToolCallBlock 调用。
 */
export function friendlyToolError(toolName: string, raw: string): string {
  for (const c of CLASSIFIERS) {
    if (c.re.test(raw)) return c.summary;
  }
  return genericToolUserMessage(toolName);
}

// ─── 运维细节打码(「技术详情」折叠也必须过这里)──────────────────────────

/** 已知内部 env 前缀(显式列出,泛化 SCREAMING_SNAKE 正则的第一道)。 */
const KNOWN_ENV_PREFIX = /\b(EXECUTOR|SANDBOX|MINICOD|NODE_ENV|BOLT_SLIDES)[A-Z0-9_]*\b(\s*=\s*\S+)?/g;
/** 泛化 SCREAMING_SNAKE env 名(至少一个下划线段,防误伤普通全大写缩写如 DOI/HTTP)。 */
const GENERIC_ENV = /\b[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+){1,}\b/g;
/** 容器内部绝对路径(与 strip-container-paths 的根集合对齐,另含 /etc /proc /sys /opt)。 */
const CONTAINER_PATH = /\/(?:home|workspace|app|root|srv|mnt|data|opt|etc|proc|sys)\/[^\s`"')）]+/g;
/** JS 堆栈行:`    at fn (file:1:2)` / `    at file:1:2`。 */
const JS_STACK_LINE = /^\s*at .+(?:\(.+:\d+:\d+\)|:\d+:\d+)\s*$/gm;
/** 沙箱实现词汇。 */
const SANDBOX_WORDS = /\bbwrap\b|\bbubblewrap\b|\bseccomp\b|\bapparmor\b/gi;

/**
 * 兜底打码:即使摘要没接管、用户点开「技术详情」,原文也先过这里。
 * 双轨 + 兜底叠加 —— agent 层全漏(旧历史事件)也不裸奔。
 */
export function sanitizeOpsText(s: string): string {
  if (!s) return s;
  return s
    .replace(JS_STACK_LINE, '')
    .replace(CONTAINER_PATH, '[内部路径]')
    .replace(KNOWN_ENV_PREFIX, '[内部配置]')
    .replace(GENERIC_ENV, '[内部配置]')
    .replace(SANDBOX_WORDS, '[沙箱]');
}

// ─── 轮级错误(error 终帧)code → 文案 + 可重试判定 ───────────────────────

/** code → 用户文案(与 backend ws.go agentErrorFriendly 口径对齐;这里是展示层再兜一道)。 */
const TURN_ERROR_TEXT: Record<string, string> = {
  empty_turn: '模型没有返回任何内容,本轮未完成,可点击重试。',
  turn_timeout: '本轮处理超时,已自动停止,可点击重试。',
  model_protocol_error: '模型输出出现协议异常,本轮已终止,可重试或更换模型。',
};

/**
 * 可重试的轮级错误码白名单(W5 P0-C3;`turn_timeout`/`empty_turn`/`model_protocol_error`
 * 对接 W3 的轮生命周期新码)。仅最后一轮 + 命中白名单才显示「重试」。
 */
const RETRYABLE_TURN_ERROR_CODES = new Set([
  'upstream_lost',
  'agent_unavailable',
  'connection_interrupted',
  'busy',
  'turn_timeout',
  'empty_turn',
  'model_protocol_error',
]);

export function isRetryableTurnError(code: string | undefined): boolean {
  return !!code && RETRYABLE_TURN_ERROR_CODES.has(code);
}

/**
 * 轮级错误展示文案:已知 code 用映射;未知 code 用 backend 下发的 message(调用方渲染前
 * 仍会过 sanitizeOpsText 双保险)。message 为空时兜底通用文案。
 */
export function friendlyTurnError(code: string | undefined, message: string): string {
  if (code && TURN_ERROR_TEXT[code]) return TURN_ERROR_TEXT[code];
  return message || '本轮回答未完成,请重试。';
}
