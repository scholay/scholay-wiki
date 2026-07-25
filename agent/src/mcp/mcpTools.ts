// MCP tools → Anthropic tool def(详细设计 §2.5)。
//
// 命名保留 mcp__minicod__<tool> —— 前端已按它渲卡片(claw-paper-cards / 智能搜索),零前端改动。
// tool_use name 以 mcp__minicod__ 开头 → 路由 callTool;其余 → built-in。

import { listTools as listMcpTools, callTool as callMcp } from "./minicodClient.ts";
import type { AnthropicTool } from "../turn/types.ts";

export const MCP_PREFIX = "mcp__minicod__";

export function isMcpTool(name: string): boolean {
  return name.startsWith(MCP_PREFIX);
}

// ── 上游真名遮蔽(商务硬约束)───────────────────────────────────────────────
// 上游 minicod MCP server 的 tool description 与 input_schema 里,source 参数的说明是成段散文:
//   "`semantic` = Semantic Scholar (best citation graph…). `openalex` = OpenAlex (…~250M works).
//    `pubmed` = PubMed/NCBI (biomedical only)."
// 这些文本**原样进模型上下文**(Anthropic tools 全文可见),模型在向用户解释"为什么换源"时会逐句
// 转述 → 真名泄漏。工具结果侧的 note 早已在 sanitizeMinicod 清洗,但工具定义侧此前是裸的。
// 这里在唯一的透传口做出口清洗:enum 值本身(semantic/openalex/pubmed)必须保留(要发给上游),
// 只把**散文里的品牌名**换成对外品牌名。
// ⚠️ 正则**必须大小写敏感**:上游用 CamelCase 写品牌(Semantic Scholar / OpenAlex / PubMed),
// 用小写写 enum 标识(`semantic` / `openalex` / `pubmed`)。若用 /i,enum 值也会被替换成品牌名 →
// 模型据此发出 source:"Medicine" → 上游 400,全部检索工具报废。大小写敏感正是二者的天然分界。
const BRAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Semantic\s*Scholar/g, "Graph"],
  [/OpenAlex/g, "Discovery"],
  [/PubMed\s*\/\s*NCBI/g, "Medicine"],
  [/NCBI\s+E-?utilities/g, "Medicine"],
  [/PubMed/g, "Medicine"],
  [/NCBI/g, "Medicine"],
];

/**
 * 把面向模型的文本里的上游真名换成对外品牌名。
 * 双保险:①大小写敏感只命中品牌词形;②`enum` / `const` / `default` 三个 schema 键的值整棵跳过
 * (它们承载必须原样发给上游的字面量)。
 */
export function maskUpstreamBrands<T>(value: T): T {
  if (typeof value === "string") {
    // 显式 string:此分支里 value 被收窄成 T & string,String.replace 返回 string 无法回赋 T & string。
    let out: string = value;
    for (const [re, brand] of BRAND_REPLACEMENTS) out = out.replace(re, brand);
    return out as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => maskUpstreamBrands(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // 字面量键原样保留:enum 候选值 / const / default 都会被模型照抄进 tool_use 入参。
      out[k] = k === "enum" || k === "const" || k === "default" ? v : maskUpstreamBrands(v);
    }
    return out as unknown as T;
  }
  return value;
}

export async function mcpAnthropicTools(): Promise<AnthropicTool[]> {
  const tools = await listMcpTools();
  return tools.map((t) => ({
    name: MCP_PREFIX + t.name,
    description: maskUpstreamBrands(t.description),
    // 确保 type:"object" 在场(Anthropic Tool.input_schema 要求);MCP schema 一般已含,合并兜底。
    input_schema: {
      type: "object" as const,
      ...maskUpstreamBrands(t.inputSchema as Record<string, unknown>),
    },
  }));
}

// 调用一个 mcp__minicod__* 工具。
export async function callMcpTool(
  prefixedName: string,
  input: Record<string, unknown>,
): Promise<{ content: unknown; isError: boolean }> {
  const raw = prefixedName.slice(MCP_PREFIX.length);
  return callMcp(raw, input);
}
