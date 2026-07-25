import { describe, expect, it } from 'vitest';
import {
  friendlyToolError,
  friendlyTurnError,
  isRetryableTurnError,
  sanitizeOpsText,
} from './friendly-tool-error';

// fixture 全部取自 2026-07 审计 P1-12 的真实泄漏样本(design_W5 B1)。
const LEAK_BASH_GATE = 'bash disabled: bwrap 自探失败: Failed to make / slave';
const LEAK_EXPORT_GATE =
  '导出沙箱不可用,已按 secure-by-default 拒绝(EXECUTOR_ALLOW_UNSANDBOXED_BASH 未设置,' +
  'EXECUTOR_SANDBOX_MODE=bwrap 探测失败)';
const LEAK_PATH_ERROR =
  "ENOENT: no such file or directory, open '/home/bun/sessions/ab12cd34/out/综述.docx'";
const LEAK_STACK = [
  'TypeError: fetch failed',
  '    at node:internal/deps/undici/undici:12618:11',
  '    at async runOne (/home/bun/app/src/turn/runTools.ts:80:5)',
].join('\n');

describe('friendlyToolError — 运维原文分类映射', () => {
  it('Bash gate 泄漏样本 → 沙箱类摘要', () => {
    expect(friendlyToolError('Bash', LEAK_BASH_GATE)).toBe('执行环境暂不可用,该步骤已跳过。');
  });

  it('导出沙箱 fail-closed 样本 → 沙箱类摘要(优先于「导出」类)', () => {
    expect(friendlyToolError('ExportDocument', LEAK_EXPORT_GATE)).toBe(
      '执行环境暂不可用,该步骤已跳过。',
    );
  });

  it('pandoc 失败 → 文档转换未成功', () => {
    expect(friendlyToolError('ExportDocument', 'pandoc: Could not find data file')).toBe(
      '文档转换未成功。',
    );
  });

  it('非零退出码 → 命令执行未成功', () => {
    expect(friendlyToolError('Bash', 'exit 127\nsh: pdflatex: not found')).toBe('命令执行未成功。');
  });

  it('超时 → 等待超时', () => {
    expect(friendlyToolError('WebFetch', 'request timed out after 30000ms')).toBe(
      '该步骤等待超时。',
    );
  });

  it('熔断/网络 → 上游服务暂时不可用', () => {
    expect(friendlyToolError('mcp__minicod__search_papers', 'circuit breaker open')).toBe(
      '上游服务暂时不可用。',
    );
  });

  it('分类 miss → 按工具名兜底(minicod)', () => {
    expect(friendlyToolError('mcp__minicod__search_papers', 'oops ???')).toBe(
      '文献检索暂时失败,AI 会调整检索方式重试。',
    );
  });

  it('分类 miss + 未知工具 → 通用兜底', () => {
    expect(friendlyToolError('SomeTool', 'oops ???')).toBe('该步骤未成功,AI 会尝试其它方式。');
  });
});

describe('sanitizeOpsText — 技术详情打码', () => {
  it('bwrap / 沙箱词汇被打码', () => {
    const out = sanitizeOpsText(LEAK_BASH_GATE);
    expect(out).not.toMatch(/bwrap|bubblewrap|seccomp|apparmor/i);
    expect(out).toContain('[沙箱]');
  });

  it('EXECUTOR_* env 名被打码(含 =值)', () => {
    const out = sanitizeOpsText(LEAK_EXPORT_GATE);
    expect(out).not.toContain('EXECUTOR');
    expect(out).not.toMatch(/bwrap/i);
    expect(out).toContain('[内部配置]');
  });

  it('容器路径被打码', () => {
    const out = sanitizeOpsText(LEAK_PATH_ERROR);
    expect(out).not.toContain('/home/');
    expect(out).toContain('[内部路径]');
  });

  it('JS 堆栈行被移除', () => {
    const out = sanitizeOpsText(LEAK_STACK);
    expect(out).not.toMatch(/^\s*at /m);
    expect(out).not.toContain('/home/');
    expect(out).toContain('TypeError: fetch failed');
  });

  it('泛化 SCREAMING_SNAKE env 名被打码', () => {
    expect(sanitizeOpsText('missing env APP_SECRET_TOKEN')).not.toContain('APP_SECRET_TOKEN');
    // 首段 <3 字符(如 MY_)刻意不匹配 —— 泛化正则保守设计,降低误伤合法缩写的概率。
    expect(sanitizeOpsText('df = N_TOTAL - 1')).toBe('df = N_TOTAL - 1');
  });

  it('普通中文/英文正文不受影响', () => {
    const s = '检索返回 0 条结果,建议更换关键词后重试。keyword: transformer';
    expect(sanitizeOpsText(s)).toBe(s);
  });
});

describe('friendlyTurnError / isRetryableTurnError — 轮级错误', () => {
  it('已知 code 用映射文案', () => {
    expect(friendlyTurnError('turn_timeout', 'raw backend message')).toBe(
      '本轮处理超时,已自动停止,可点击重试。',
    );
    expect(friendlyTurnError('empty_turn', '')).toBe(
      '模型没有返回任何内容,本轮未完成,可点击重试。',
    );
    expect(friendlyTurnError('model_protocol_error', '')).toBe(
      '模型输出出现协议异常,本轮已终止,可重试或更换模型。',
    );
  });

  it('未知 code 用后端 message;message 空则通用兜底', () => {
    expect(friendlyTurnError('weird_code', '服务响应异常,请稍后重试')).toBe(
      '服务响应异常,请稍后重试',
    );
    expect(friendlyTurnError(undefined, '')).toBe('本轮回答未完成,请重试。');
  });

  it('可重试白名单', () => {
    for (const code of [
      'upstream_lost',
      'agent_unavailable',
      'connection_interrupted',
      'busy',
      'turn_timeout',
      'empty_turn',
      'model_protocol_error',
    ]) {
      expect(isRetryableTurnError(code)).toBe(true);
    }
    expect(isRetryableTurnError('quota_exceeded')).toBe(false);
    expect(isRetryableTurnError(undefined)).toBe(false);
  });
});
