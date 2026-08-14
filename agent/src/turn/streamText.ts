// 逐 token 流式明文预览(P1-1)——从**流式中、可能不完整**的工具入参 JSON 里,增量抽出 Write.content
// 的明文值,让前端右侧文档面在 agent 生成时就逐字长出,而不是等 tool_use_complete 才一次性出现
// (诉求③「工具调用→一直等→一次性出现」的病灶)。
//
// 难点:partial_json 是**转义 + 不完整**的 JSON 片段(如 `{"file_path":"document.md","content":"\\sec`)。
// 不能裸推,必须容错解出「到目前为止已闭合的明文」(不含尾部未完成的转义/未闭合的 \uXXXX)。

// 哪些工具的哪个字段做流式明文预览。
//   - Write.content:prism 右侧文档面逐字长出 + 各 feature 工具 chip 构建态预览。
//   - Edit.new_string(2026-07 放开):早期排除理由是「前端从不消费 → 死帧」(P1-1 review #5),
//     该前提已失效 —— 前端 ToolCallBlock 构建态现在通用消费任意 toolInput(文件名 + 已写入字数
//     + 尾部预览,不需要定位到文档);prism 的文档预览仍只认 Write(currentStreamingWrite 按
//     toolName 门控),Edit 增量不会污染它。
//   - MultiEdit 刻意不开:edits 数组含多个 new_string,FieldStreamer 只会咬住第一个,进度失真。
export function streamFieldFor(toolName: string): string | null {
  if (toolName === "Write") return "content";
  if (toolName === "Edit") return "new_string";
  return null;
}

// 超大入参保护:JSON 超过此长度不再做流式抽取,直接等 tool_use_complete 一次性出。正常论文正文远在此之下。
const MAX_STREAM_JSON = 512 * 1024;

const ESC: Record<string, string> = {
  n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/",
};

/**
 * FieldStreamer:**有状态、O(N)** 增量抽取(P1-1 review #1:旧的无状态版每 push 全量重扫 = O(N²),
 * 大 Write 在单线程事件循环上会造成秒级阻塞 + 海量临时字符串)。每个 content_block index 一个实例,
 * push(累积到当前的完整 json) 返回**自上次以来新解出的明文增量**(可能为 "")。用游标 pos 只解新字节;
 * 尾部未完成的转义(半个 `\` / 半个 `\uXXXX`)停在原地,下次带更多字节再续,故前缀稳定、绝不吐半个转义。
 */
export class FieldStreamer {
  private started = false; // 是否已定位到字符串值起点
  private done = false; // 值是否已闭合(遇未转义闭引号)
  private pos = 0; // json 已消费到的偏移(不含未完成的尾部转义)
  constructor(private readonly field: string) {}

  push(json: string): string {
    if (this.done || json.length > MAX_STREAM_JSON) return "";
    if (!this.started) {
      const marker = `"${this.field}":`; // 紧凑 JSON;此模式避免误匹配子串键
      const ki = json.indexOf(marker);
      if (ki < 0) return "";
      let i = ki + marker.length;
      while (i < json.length && (json[i] === " " || json[i] === "\t" || json[i] === "\n" || json[i] === "\r")) i++;
      if (i >= json.length || json[i] !== '"') return ""; // 值不是字符串 或 还没到开引号
      this.started = true;
      this.pos = i + 1; // 值第一个字符
    }
    let out = "";
    let i = this.pos;
    while (i < json.length) {
      const ch = json[i];
      if (ch === '"') {
        this.done = true;
        this.pos = i;
        return out;
      }
      if (ch === "\\") {
        if (i + 1 >= json.length) break; // 不完整转义:停(pos 不越过反斜杠,下次续)
        const e = json[i + 1];
        if (e === "u") {
          if (i + 6 > json.length) break; // 不完整 \uXXXX:停
          const cp = parseInt(json.slice(i + 2, i + 6), 16);
          if (!Number.isNaN(cp)) out += String.fromCharCode(cp);
          i += 6;
          continue;
        }
        out += ESC[e] ?? e;
        i += 2;
        continue;
      }
      out += ch;
      i++;
    }
    this.pos = i;
    return out;
  }
}

/**
 * 一次性抽出目标字符串字段的当前明文(用于 file_path 这类**短、早于 content 完成**的字段)。
 * 找不到 / 值还没到 → null。仅在流式期间调少数几次(file_path 定位后即缓存),不在 O(N²) 热路径上。
 */
export function extractStreamingFieldValue(json: string, field: string): string | null {
  if (json.length > MAX_STREAM_JSON) return null;
  const marker = `"${field}":`;
  const ki = json.indexOf(marker);
  if (ki < 0) return null;
  let i = ki + marker.length;
  while (i < json.length && (json[i] === " " || json[i] === "\t" || json[i] === "\n" || json[i] === "\r")) i++;
  if (i >= json.length || json[i] !== '"') return null;
  i++;
  let out = "";
  while (i < json.length) {
    const ch = json[i];
    if (ch === '"') break;
    if (ch === "\\") {
      if (i + 1 >= json.length) break;
      const e = json[i + 1];
      if (e === "u") {
        if (i + 6 > json.length) return out;
        const cp = parseInt(json.slice(i + 2, i + 6), 16);
        if (!Number.isNaN(cp)) out += String.fromCharCode(cp);
        i += 6;
        continue;
      }
      out += ESC[e] ?? e;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
