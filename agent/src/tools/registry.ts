// Clean-room built-in 工具(详细设计 §2.1 tools/)。全部 cwd-confined。
// 这些是 Scholay 自有实现,**非** cc-haha 工具移植。smart_search 不用(MCP-only);
// claw(+bash)/prism(file-edit)在 step 7 全面启用 + sandbox 加固(step 8 bwrap)。

import { resolve, relative, dirname, join, basename, extname } from "node:path";
import { readFile, writeFile, appendFile, mkdir, readdir, stat, realpath, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { wrapBash, buildBwrapArgv, sandboxMode } from "../sandbox/bwrap.ts";
import { ANALYSIS_DIR, BUNDLE_SUFFIX } from "../sandbox/reserved.ts";
import { childEnv } from "../sandbox/childEnv.ts";
import { profileFor, unsandboxedBashGate, type SandboxProfile } from "../sandbox/profile.ts";
import { confinePath } from "../sandbox/confine.ts";
import { localNow } from "./clock.ts";
import { log } from "../obs/log.ts";
// 2026-08 证据账本 P1:交付边界 resolve 闸(展开器唯一实现在 evidence/render.ts)。
import { resolveFileForDelivery } from "../evidence/deliver.ts";
import { markRead, resolveEidForPath } from "../evidence/ledger.ts";
import { citationFailureText } from "../evidence/render.ts";
import { MCP_PREFIX, callMcpTool } from "../mcp/mcpTools.ts";

/**
 * 「读过原文」留痕(2026-08-01 Phase 0)。Read / ReadDocument 成功后调用。
 *
 * 🔴 它补的是账本上一个**结构性的空洞**:`markRead` 此前**全仓零生产调用点**,
 *    于是 read_marks 恒为空、has_fulltext 恒 false,render.ts 的三档里有两档
 *    (「有全文未读」「已读全文」)是**永远不会出现的话**,而没有一条测试会红。
 *    Run 引擎的 step 完成判据要读它 —— 分母是空集就会静默无限重排队。
 *
 * 反查保守到宁可漏不可错(见 resolveEidForPath):认不出就什么都不做,**不猜、不报错**。
 * 失败一律吞掉:留痕是审计增益,绝不能让一次账本写失败把用户的文件读操作也搞挂。
 */
async function noteEvidenceRead(workDir: string, absPath: string, tool: string, chars: number, turn: number): Promise<void> {
  try {
    const eid = resolveEidForPath(workDir, absPath);
    if (!eid) return;
    await markRead(workDir, eid, { turn, tool, chars });
  } catch {
    // 静默:见上。
  }
}

export interface ToolCtx {
  workDir: string;
  allowBash: boolean;
  net: "open" | "none";
  // --add-dir 目录:Skill 工具据此定位 <dir>/guides/<name>/SKILL.md(按需技能正文)。
  // 其它工具不用;可空(无按需技能的会话)。
  addDirs?: string[];
  /** 本轮序号(runTools 的 turnOf 已经为账本算过一份,这里复用同一个值,不另算)。
   *  只用于 read_mark 的展示字段;账本的顺序真源仍是 id 追加序,别当主键。 */
  turn?: number;
  /** 本轮生效的 model id(turnLoop 解析,runTools 透传)。
   *  唯一消费者是 StatRun —— 交付物的 ICMJE 披露句要写明「借助大语言模型(<model>)辅助完成」。
   *  ICMJE 要求分析用 AI 必须写进 Methods 含工具与版本,而此前只披露了 statkit
   *  这个**不是 AI** 的部件(2026-08-06 审计 G-04)。 */
  model?: string;
  /** 本轮**延迟披露**的 MCP 工具(允许调用但不在 tools[] 里;见 mcp/deferred.ts)。
   *  唯一消费者是 ToolSearch / ToolInvoke —— 前者据此检索定义、后者据此校验可调性。
   *  空/缺省 = 渐进披露关闭或本 feature 无延迟工具 → 两个工具都如实回「无」。 */
  deferredTools?: Array<{ name: string; description?: string; input_schema: unknown }>;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
  /** 面向用户的一句话摘要(中文、脱敏,不含 env/容器路径/运维指引;P1-12 双轨制)。
   *  仅失败时有意义;缺省时 runTools 按工具名兜底。**绝不回喂模型**(runTools 消息体不含它)。 */
  userMessage?: string;
}

export interface BuiltinTool {
  name: string;
  description: string;
  input_schema: { type: "object"; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown };
  parallelSafe: boolean;
  run(input: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult>;
}

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: false };
}
function fail(text: string, userMessage?: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true, ...(userMessage ? { userMessage } : {}) };
}

// 乱码探测(P1-6 机械支撑):NUL 探测漏网的二进制(如无 NUL 前缀的 PDF 流)按 utf8 强解后
// 会产生大量替换符/控制符。>10% 即判乱码,前置横幅 —— 给模型现场警示(不可据此宣称已读),
// 同时是 verifyClaims 通读核验的确定性锚点(PARTIAL_MARKERS)。正常文本控制字符占比≈0,误伤极小。
function looksGarbled(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (sample.length < 200) return false;
  let bad = 0;
  for (const ch of sample) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd || (c < 32 && c !== 9 && c !== 10 && c !== 13)) bad++;
  }
  return bad / sample.length > 0.1;
}
const GARBLED_BANNER =
  "[系统提示: 该文件内容疑似为二进制/乱码 (解析失败)。不可据此内容作答或宣称已阅读原文;" +
  "请改用 ReadDocument 提取文本, 或如实告知用户无法解析。]\n\n";

// Read 返回文本上限:超出截断,避免单次 Read 把整个大文件塞进上下文烧 token。
const MAX_READ_BYTES = Number(process.env.EXECUTOR_MAX_READ_BYTES || 256_000);

// 二进制探测:前 8KB 内出现 NUL(0x00)即判定二进制。清一色文本文件不含 NUL。
function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

// 路径限制走 sandbox/confine.ts 的 realpath 版(C5:防符号链接逃逸)。

// bashEnv:bash 子进程只继承白名单 env —— **绝不** {...process.env}(C4:否则模型 echo $MINICOD_API_KEY /
// $EXECUTOR_AUTH_TOKEN 即窃取账户级密钥与内部 bearer)。只放跑命令必需的非密变量 + 出网代理。
//
// 🔴 2026-08-06:实现搬进了 `sandbox/childEnv.ts`。搬家的理由不是整洁,是这条规则**只以私有函数存在时,
//    第二个调用点看不见它** —— `turn/deliveryGate.ts` 的探针因此自己写了 `{ ...process.env }`,
//    成了全仓唯一的破例(而它 spawn 的还是不进 jail 的 python)。规则要挡住下一个人,就得让下一个人 import 得到。
const bashEnv = childEnv;

// 参数名沿用 Claude Code 约定 file_path:① 模型对该 schema 最熟悉,工具调用更稳;
// ② 前端 claw 认领产物卡片靠 tool.input.file_path(MessageTurn.extractTurnArtifacts)。
const readTool: BuiltinTool = {
  name: "Read",
  description:
    "Read a UTF-8 text file within the session working directory. Binary documents (PDF, .docx, .odt, etc.) are NOT supported here — use the ReadDocument tool for those. For large files, pass offset/limit (1-based line number + line count) to read a narrower section.",
  input_schema: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      offset: { type: "number", description: "1-based line number to start reading from (optional)" },
      limit: { type: "number", description: "max lines to read (optional)" },
    },
    required: ["file_path"],
  },
  parallelSafe: true,
  async run(input, ctx) {
    try {
      const p = await confinePath(ctx.workDir, String(input.file_path));
      // 先读为字节,判二进制 → 立即回可操作错误,绝不把 PDF/图片强解码成 mojibake 全量入上下文
      // (这是历史上审稿向导单轮 10-17M token 的元凶之一)。
      const buf = await readFile(p);
      if (looksBinary(buf)) {
        const lower = String(input.file_path).toLowerCase();
        // 按扩展名给**准确**的下一步指引(2026-07 文件上传调研:旧版通用 hint 把 xlsx/pptx 也导流到
        // 当时不支持它们的 ReadDocument,两跳皆败 = 假引导;legacy doc/xls/ppt 则任何工具都读不了,
        // 必须直接教模型如实告知,别再空转)。
        let hint: string;
        let userMsg = "该文件需要转换后阅读,AI 正在换用文档读取方式。";
        if (lower.endsWith(".pdf")) {
          hint = " This is a PDF — use the ReadDocument tool (pass first_pages to limit scope for long PDFs).";
        } else if (/\.(docx|odt|rtf|epub|xlsx|pptx)$/.test(lower)) {
          hint = " This is an Office/rich document — use the ReadDocument tool to extract its text (xlsx: one table per sheet; pptx: text per slide).";
        } else if (/\.(doc|xls|ppt|ods|odp)$/.test(lower)) {
          hint =
            " This legacy/unsupported Office format cannot be parsed by any available tool. Do NOT retry with ReadDocument. " +
            "Tell the user honestly that this format is not supported and suggest re-saving it as .docx/.xlsx/.pptx and re-uploading. Never fabricate its content.";
          userMsg = "该文件为旧版 Office 格式,暂无法解析。";
        } else {
          hint = " This is a binary file; Read only supports UTF-8 text. If it is a document, try ReadDocument; otherwise tell the user honestly this file type cannot be read.";
          userMsg = "该文件类型暂无法直接读取。"; // 审查修正:泛化分支别虚假承诺「正在换用文档读取方式」
        }
        return fail("read failed: binary file not supported." + hint, userMsg);
      }
      let text = buf.toString("utf8");
      if (looksGarbled(text)) text = GARBLED_BANNER + text;
      // V3-4.1-2 前置:offset/limit 局部读(1-based 行号),供 microcompaction 存根「重读窄段」与大文档定点读。
      const offset = Number(input.offset) > 0 ? Math.floor(Number(input.offset)) : 0;
      const limit = Number(input.limit) > 0 ? Math.floor(Number(input.limit)) : 0;
      if (offset > 0 || limit > 0) {
        const lines = text.split("\n");
        const start = offset > 0 ? offset - 1 : 0;
        if (start >= lines.length) {
          return fail(`read failed: offset ${offset} is beyond end of file (${lines.length} lines).`);
        }
        const end = limit > 0 ? Math.min(start + limit, lines.length) : lines.length;
        const slice = lines.slice(start, end).join("\n");
        const head = `[lines ${start + 1}-${end} of ${lines.length}]\n`;
        text = head + slice;
        if (text.length > MAX_READ_BYTES) {
          text = text.slice(0, MAX_READ_BYTES) + `\n\n[... truncated at ${MAX_READ_BYTES} bytes. Use a smaller limit.]`;
        }
        await noteEvidenceRead(ctx.workDir, p, "Read", text.length, ctx.turn ?? 0);
        return ok(text);
      }
      if (buf.length > MAX_READ_BYTES) {
        text =
          text.slice(0, MAX_READ_BYTES) +
          `\n\n[... truncated: file is ${buf.length} bytes, showing first ${MAX_READ_BYTES}. Use Grep or Read with offset/limit to read a narrower section.]`;
      }
      await noteEvidenceRead(ctx.workDir, p, "Read", text.length, ctx.turn ?? 0);
      return ok(text);
    } catch (e) {
      return fail("read failed: " + String((e as Error)?.message ?? e));
    }
  },
};

const writeTool: BuiltinTool = {
  name: "Write",
  description: "Write (create or overwrite) a UTF-8 text file within the session working directory. To deliver a file to the user, write it under ./out/ .",
  input_schema: {
    type: "object",
    properties: { file_path: { type: "string" }, content: { type: "string" } },
    required: ["file_path", "content"],
  },
  parallelSafe: false,
  async run(input, ctx) {
    try {
      const p = await confinePath(ctx.workDir, String(input.file_path), true);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, String(input.content ?? ""), "utf8");
      return ok("wrote " + String(input.file_path));
    } catch (e) {
      return fail("write failed: " + String((e as Error)?.message ?? e));
    }
  },
};

const editTool: BuiltinTool = {
  name: "Edit",
  description:
    "Replace old_string with new_string in a file (exact, literal match — not a regex). " +
    "old_string MUST be unique in the file: include enough surrounding context to make it so. " +
    "If it matches more than once the edit is REJECTED (nothing is written) unless you pass replace_all:true. " +
    "Prefer reading the file first so old_string is copied verbatim, including indentation.",
  input_schema: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: {
        type: "boolean",
        description: "Replace every occurrence instead of requiring uniqueness. Default false.",
      },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  parallelSafe: false,
  async run(input, ctx) {
    const rel = String(input.file_path); // 回执一律用**模型给的相对路径**,不回显宿主绝对路径
    try {
      const p = await confinePath(ctx.workDir, rel, true);
      const cur = await readFile(p, "utf8");
      const oldS = String(input.old_string);
      const newS = String(input.new_string);
      const replaceAll = input.replace_all === true;

      if (oldS === "") return fail("edit failed: old_string 不能为空。要整体重写文件请用 Write。");
      if (oldS === newS) {
        return fail("edit failed: old_string 与 new_string 完全相同,这次编辑没有任何效果。");
      }

      const hits = countOccurrences(cur, oldS);

      // ── 0 处命中:给足四要素,让模型能自救而不是原样重试 ──────────────────────
      if (hits === 0) {
        // 幂等终止条件:改动**看起来已经生效**了。没有这一条,模型会反复重试同一个 Edit,
        // 每次都拿到同一句「not found」,直到烧完轮次上限(aider 把这条列为回执四要素之一)。
        if (newS !== "" && cur.includes(newS)) {
          return fail(
            `edit failed: 在 ${rel} 里找不到 old_string,但 new_string 已经在文件里了 —— ` +
              "这次改动**多半已经生效**(可能是上一次调用成功了,或平台在交付前改写过该文件)。" +
              "请先 Read 确认当前内容,不要重复提交同一个编辑。",
          );
        }
        return fail(
          `edit failed: 在 ${rel} 里找不到 old_string(逐字符精确匹配,不是正则)。\n` +
            `文件当前 ${cur.length} 字符 / ${cur.split("\n").length} 行。\n` +
            nearestHint(cur, oldS) +
            "常见原因:① 缩进或空白与文件里的不一致;② 记忆里的内容与盘上的已经不同" +
            "(长对话里早先的文件内容可能已被压缩掉);③ 平台在交付前改写过该文件。\n" +
            "建议:先 Read 该文件,把要替换的片段**原样复制**进 old_string。",
        );
      }

      // ── 多处命中且未显式 replace_all:拒绝并说清楚 ────────────────────────────
      //
      // 🔴 旧实现是 `indexOf` 静默改第一处并返回成功。那是本工具**唯一会静默产生错误结果**
      //    的缺陷:模型(尤其是 Claude 系)的先验来自「多处命中会报错」,「成功」在它的世界里
      //    蕴含「唯一」。我们把「成功」的含义悄悄换掉了,于是它改错地方却毫不知情。
      if (hits > 1 && !replaceAll) {
        return fail(
          `edit failed: old_string 在 ${rel} 里出现了 ${hits} 次,不唯一,**未做任何修改**。\n` +
            occurrenceLines(cur, oldS) +
            "请任选其一:① 在 old_string 里补上足以区分的上下文(前后多带几行),使它唯一;" +
            "② 确实要全部替换,就传 replace_all: true。",
        );
      }

      // 🔴 一律走 split/join,**不能**用 String.replace:后者会把 new_string 里的
      //    `$&` / `$1` / `` $` `` / `$'` 当成替换模式解释 —— 模型编辑含这些字面量的
      //    代码(shell、正则、模板)时会被静默改坏。单测 `$& 这类替换模式…` 钉住这条。
      const parts = cur.split(oldS);
      const next = replaceAll ? parts.join(newS) : parts[0] + newS + parts.slice(1).join(oldS);
      await writeFile(p, next, "utf8");
      const delta = next.length - cur.length;
      return ok(
        `edited ${rel} — 替换 ${replaceAll ? hits : 1} 处,` +
          `文件 ${cur.length} → ${next.length} 字符(${delta >= 0 ? "+" : ""}${delta})。`,
      );
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      // ENOENT 等系统错误会把**宿主绝对路径**灌进上下文,与「绝不暴露内部路径」直接冲突;
      // 且那条路径对模型没有任何用处(它只能用相对路径)。只回相对路径 + 原因类别。
      if (/ENOENT|no such file/i.test(msg)) {
        return fail(`edit failed: 文件 ${rel} 不存在。先用 Glob 或 Read 确认它的位置与名字。`);
      }
      return fail(`edit failed (${rel}): ` + msg.replace(ctx.workDir, "").trim());
    }
  },
};

/** 字面量出现次数(不建正则,old_string 里的元字符必须按字面处理)。 */
function countOccurrences(hay: string, needle: string): number {
  if (needle === "") return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** 多处命中时列出各自所在行号,让模型知道该往哪个方向补上下文。 */
function occurrenceLines(hay: string, needle: string, cap = 6): string {
  const lines: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0 && lines.length < cap; i = hay.indexOf(needle, i + needle.length)) {
    lines.push(hay.slice(0, i).split("\n").length);
  }
  if (lines.length === 0) return "";
  const more = countOccurrences(hay, needle) > lines.length ? " …" : "";
  return `出现在第 ${lines.join("、")} 行${more}。\n`;
}

/**
 * 0 命中时找一段**最像**的现有内容,把行号告诉模型。
 *
 * 只做一件很便宜的事:按 old_string 的首行去找。绝大多数失配是「缩进/尾随空白/中间某行变了」,
 * 首行往往还在 —— 指出它在第几行,模型就能定向去 Read 那一段,而不是把整个文件重读一遍。
 * 刻意**不做**全局模糊匹配:那需要一个阈值,而无阈值的模糊匹配不可控(aider 自己也把
 * 编辑距离那层关掉了)。
 */
function nearestHint(hay: string, needle: string): string {
  const firstLine = needle.split("\n")[0]?.trim();
  if (!firstLine || firstLine.length < 4) return "";
  const lines = hay.split("\n");
  const at: number[] = [];
  for (let i = 0; i < lines.length && at.length < 3; i++) {
    if (lines[i].trim() === firstLine) at.push(i + 1);
  }
  if (at.length === 0) return "";
  return `提示:old_string 的第一行在文件的第 ${at.join("、")} 行出现过(后续内容对不上)。\n`;
}

const globTool: BuiltinTool = {
  name: "Glob",
  description: "List files matching a glob pattern within the session working directory.",
  input_schema: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] },
  parallelSafe: true,
  async run(input, ctx) {
    try {
      const pattern = String(input.pattern);
      // 安全评审 2026-07-15(HIGH):Bun.Glob 的 cwd **不做 confine** —— honor 绝对路径与 `..`,
      // 且 Glob 跑在执行器里(不进 bwrap jail),故裸用可跨会话枚举他人 cwd/out/ 里的稿件文件名 +
      // 泄活跃 sessionId。双层防线:① 拒绝绝对/含 .. 的 pattern;② 逐命中 realpath 落在会话 cwd 内
      //(挡 cwd 内符号链接逃逸,与 Grep 的 skip-symlink 同源)。
      if (pattern.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(pattern)) {
        return fail("glob failed: pattern must be relative and stay within the session directory (no absolute paths or '..').");
      }
      const glob = new Bun.Glob(pattern);
      const realRoot = await realpath(ctx.workDir);
      const out: string[] = [];
      for await (const f of glob.scan({ cwd: ctx.workDir, onlyFiles: true, dot: false })) {
        let real: string;
        try {
          real = await realpath(resolve(ctx.workDir, f));
        } catch {
          continue;
        }
        if (real !== realRoot && !real.startsWith(realRoot + "/")) continue;
        out.push(f);
        if (out.length >= 1000) break;
      }
      return ok(out.length ? out.join("\n") : "(no matches)");
    } catch (e) {
      return fail("glob failed: " + String((e as Error)?.message ?? e));
    }
  },
};

const grepTool: BuiltinTool = {
  name: "Grep",
  description: "Search file contents for a regex within the session working directory.",
  input_schema: {
    type: "object",
    properties: { pattern: { type: "string" }, path: { type: "string" } },
    required: ["pattern"],
  },
  parallelSafe: true,
  async run(input, ctx) {
    try {
      const re = new RegExp(String(input.pattern));
      const root = input.path ? await confinePath(ctx.workDir, String(input.path)) : ctx.workDir;
      const matches: string[] = [];
      const grepFile = async (full: string) => {
        try {
          const st = await stat(full);
          if (st.size > 2_000_000) return;
          const text = await readFile(full, "utf8");
          text.split("\n").forEach((line, i) => {
            if (matches.length < 200 && re.test(line)) {
              matches.push(relative(ctx.workDir, full) + ":" + (i + 1) + ": " + line.trim().slice(0, 200));
            }
          });
        } catch {
          /* skip binary/unreadable */
        }
      };
      const walk = async (dir: string) => {
        if (matches.length >= 200) return;
        const entries = await readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
          if (matches.length >= 200) return;
          if (ent.isSymbolicLink()) continue; // C5:遍历不跟符号链接,防逃出 cwd
          const full = resolve(dir, ent.name);
          if (ent.isDirectory()) {
            if (ent.name === "node_modules" || ent.name === ".git") continue;
            await walk(full);
          } else if (ent.isFile()) {
            await grepFile(full);
          }
        }
      };
      // path 指向**文件**时直接搜该文件(以前无脑 readdir → ENOTDIR;模型常把单文件当 path 传)。
      const rootStat = await stat(root).catch(() => null);
      if (rootStat?.isFile()) await grepFile(root);
      else await walk(root);
      return ok(matches.length ? matches.join("\n") : "(no matches)");
    } catch (e) {
      return fail("grep failed: " + String((e as Error)?.message ?? e));
    }
  },
};

const bashTool: BuiltinTool = {
  name: "Bash",
  description: "Run a shell command in the session working directory. Only available when allowBash is set (claw).",
  input_schema: {
    type: "object",
    properties: { command: { type: "string" }, timeout_ms: { type: "number" } },
    required: ["command"],
  },
  parallelSafe: false,
  async run(input, ctx) {
    if (!ctx.allowBash) return fail("bash not permitted for this feature", "该操作暂不可用,已跳过。");
    // 生产 secure-by-default:未沙箱化的 Bash 在多租户下会跨会话读文件 / 经 /proc 偷密钥,拒绝执行。
    // 能力本身保留 —— 沙箱自探成功即自动恢复(修容器 seccomp);或显式放行(EXECUTOR_ALLOW_UNSANDBOXED_BASH=1,生产被硬锁)。
    // P1-12:gate.reason 含 env 名/沙箱细节等运维词,只进日志;给模型的是失败点带内指令(紧贴生成点,
    // 比全局 prompt 可靠 —— flash 对远距离规则失效已被审计证明),给用户的是脱敏摘要。
    const gate = unsandboxedBashGate();
    if (!gate.ok) {
      log.error("bash disabled by sandbox gate", { reason: gate.reason });
      return fail(
        "Bash 暂不可用(执行环境维护中,运维已在处理)。对用户只能如实说明:『命令执行/文件转换功能暂时维护中』。" +
          "禁止:编造替代操作步骤、宣称已用其它方式完成、把本条报错或任何内部报错原文转述给用户。" +
          "你仍可用 Read/Write/Edit/ReadDocument 完成不依赖 shell 的部分,并把已完成内容写入 out/ 供用户下载。",
        "命令执行环境暂不可用,本步骤已跳过。",
      );
    }
    try {
      // 沙箱自探成功 → 包进 bubblewrap jail(强制,无开关);自探失败 → 直跑(此时已过 gate:仅非生产)。
      const profile = profileFor({ workDir: ctx.workDir, net: ctx.net, allowBash: ctx.allowBash });
      const argv = wrapBash(profile, String(input.command));
      const proc = Bun.spawn(argv, {
        cwd: ctx.workDir,
        stdout: "pipe",
        stderr: "pipe",
        env: bashEnv(), // C4:白名单 env,绝不泄漏 MINICOD_API_KEY / EXECUTOR_AUTH_TOKEN 给模型生成的命令
      });
      const timeoutMs = Math.min(Number(input.timeout_ms) || 120_000, 300_000);
      const killer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          /* noop */
        }
      }, timeoutMs);
      // stdout/stderr 有界读(评审 2026-07 性能审计 P0):`new Response(stream).text()` 会把无上限的
      // 输出全量灌进 JS 堆 —— 一条 `yes` / `cat 大文件` 就能在多租户共享容器里 OOM 拖垮所有会话。
      // 到帽即 kill 子进程(让 proc.exited 解析),复用同文件已投产的 readCapped(与 runConverter 同款)。
      const outP = readCapped(proc.stdout, BASH_STDOUT_MAX_BYTES).then((r) => {
        if (r.truncated) {
          try {
            proc.kill();
          } catch {
            /* noop */
          }
        }
        return r;
      });
      const errP = readCapped(proc.stderr, BASH_STDERR_MAX_BYTES);
      const [outR, errR, code] = await Promise.all([outP, errP, proc.exited]);
      clearTimeout(killer);
      const out = outR.text + (outR.truncated ? "\n[stdout 已达上限截断]" : "");
      const errOut = errR.text + (errR.truncated ? "\n[stderr 已达上限截断]" : "");
      const body = (out + (errOut ? "\n[stderr]\n" + errOut : "")).slice(0, 60_000);
      return code === 0
        ? ok(body || "(no output)")
        : fail("exit " + code + "\n" + body, "命令执行未成功,AI 会尝试其它方式。");
    } catch (e) {
      return fail("bash failed: " + String((e as Error)?.message ?? e), "命令执行未成功,AI 会尝试其它方式。");
    }
  },
};

// runConverter:跑一个**固定 argv** 的文档转换器(无 shell)。与 Bash 的本质区别 —— argv 由工具
// 代码构造,模型只提供已 confine 的 file_path,无命令注入面。白名单 env(不泄密钥)、超时、无网络需求。
// 转换器 stdout 硬上限(评审 2026-07-15):`new Response(stream).text()` 会把整个 stdout 全量
// 拉进内存 —— 大 PDF(pdftotext 无 first_pages)可吐几百 MB,在多租户共享容器里 OOM 拖垮所有会话。
// 有界流式读到 8MB 即停并 kill 子进程(远高于 MAX_DOC_CHARS,正常文档不受影响,只兜病态大文件)。
const CONVERTER_MAX_BYTES = Number(process.env.EXECUTOR_CONVERTER_MAX_BYTES || 8 * 1024 * 1024);

// Bash 工具输出内存上限(评审 2026-07 性能审计 P0):stdout 默认 4MB、stderr 64KB。远高于给模型的
// 60_000 字符可读上限(两者正交:这是内存帽,防病态大输出 OOM 多租户容器;那是可读截断)。
const BASH_STDOUT_MAX_BYTES = Number(process.env.EXECUTOR_BASH_STDOUT_MAX_BYTES || 4 * 1024 * 1024);
const BASH_STDERR_MAX_BYTES = Number(process.env.EXECUTOR_BASH_STDERR_MAX_BYTES || 64 * 1024);

// readCapped:有界读一个 ReadableStream,到 maxBytes 即停(标记 truncated),不把无上限的流灌进内存。
async function readCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.byteLength > maxBytes) {
        const keep = maxBytes - total;
        if (keep > 0) chunks.push(value.subarray(0, keep));
        truncated = true;
        break;
      }
      total += value.byteLength;
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* noop */
    }
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

async function runConverter(argv: string[], cwd?: string): Promise<{ ok: boolean; text: string; err: string }> {
  const proc = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe", env: bashEnv() });
  const killer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* noop */
    }
  }, 60_000);
  // stdout 有界读(超上限即 kill,让 proc.exited 解析);stderr 小上限即可。
  const outP = readCapped(proc.stdout, CONVERTER_MAX_BYTES).then((r) => {
    if (r.truncated) {
      try {
        proc.kill();
      } catch {
        /* noop */
      }
    }
    return r;
  });
  const errP = new Response(proc.stderr)
    .text()
    .then((t) => t.slice(0, 4000))
    .catch(() => "");
  const [outRes, errOut] = await Promise.all([outP, errP]);
  const code = await proc.exited;
  clearTimeout(killer);
  if (outRes.truncated) {
    return {
      ok: true,
      text: outRes.text + `\n\n[... truncated at ${CONVERTER_MAX_BYTES} bytes — document is very large; extract a narrower range (PDF: first_pages).]`,
      err: "",
    };
  }
  // 成功也带回 stderr(err):pandoc 对断网丢弃的远程图片只发 [WARNING] 到 stderr 且 exit 0,
  // 调用方(ExportDocument)据此提示用户「远程图片未内嵌」。ReadDocument 成功时忽略 err,不受影响。
  if (code === 0) return { ok: true, text: outRes.text, err: errOut };
  return { ok: false, text: "", err: (errOut || `exit ${code}`).slice(0, 2000) };
}

// runConverterConfined:在 bwrap jail 内跑转换器(ExportDocument 导出方向用)。
// 关掉「模型在源文件里嵌入已知绝对路径的图片 → pandoc 解引用 → 把跨会话/宿主文件嵌进交付产物」这条
// 窄向量(registry 注释里承认、但此前无执行器级沙箱兜底):jail 只把本会话 cwd bind 到 /work,别的会话
// 目录 / /etc 等物理不在 mount 命名空间里,pandoc 读不到 → 缺图即不嵌,不外泄。argv 里落在 cwd 内的
// 绝对路径(源 src / 产物 out)须翻译成 /work 视图(jail --chdir /work + cwd→/work)。net:none:导出不
// 需出网,顺带挡掉 `![](https://…)` 远程图片 SSRF。
// 沙箱自探失败时**与 Bash 同款生产 fail-closed**(unsandboxedBashGate):生产未放行沙箱则拒绝导出,
// 不裸跑 pandoc —— 否则跨会话图片嵌入向量在最该防的时候敞开;仅非生产/显式放行才退化直跑。
// 代价:源里用**绝对 cwd 路径**引用的本地图片在 jail 内解析不到(模型应改用相对路径);合法相对图片不受影响。
async function runConverterConfined(
  workDir: string,
  argv: string[],
): Promise<{ ok: boolean; text: string; err: string; gated?: boolean }> {
  if (sandboxMode() !== "bwrap") {
    const gate = unsandboxedBashGate();
    if (!gate.ok) {
      log.error("export refused by sandbox gate", { reason: gate.reason });
      return {
        ok: false,
        text: "",
        // gated:true 让 ExportDocument 区分「沙箱闸关闭(整个导出子系统不可用)」与「pandoc 跑了但缺 PDF 引擎」。
        // 前者对**所有**格式都失败,绝不能建议用户改用 docx(docx 会撞同一道闸;审计 [17])。
        gated: true,
        err:
          "导出功能暂时不可用(执行环境维护中)。请先确认完整内容已用 Write 落盘为 out/<名称>.md," +
          "再如实告知用户:『文档导出暂时维护中,我已把完整内容保存为 Markdown 文件,可直接下载查看;" +
          "导出恢复后可再生成 docx/pdf。』禁止:声称 Word/WPS 能直接打开 .md 并自动保留格式(不成立);" +
          "声称文件已导出;编造其它补救步骤。",
      };
    }
    // 退化直跑也让转换器以会话 cwd 运行,与 jail 的 --chdir /work 对齐,相对资源(./figures/x.png)解析基准一致。
    return runConverter(argv, workDir);
  }
  // confinePath 返回的 src/outAbs 已 canonicalize(realpath,解符号链接),故翻译前缀 + bind 源都必须用
  // realpath(workDir):否则 SESSIONS_ROOT 含符号链接时 src 不以裸 workDir 开头 → toJail 不翻译 → 导出全失败。
  const root = await realpath(workDir).catch(() => workDir);
  const prefix = root.endsWith("/") ? root : root + "/";
  const toJail = (a: string): string =>
    a === root ? "/work" : a.startsWith(prefix) ? "/work/" + a.slice(prefix.length) : a;
  const inner = argv.map(toJail);
  const profile = profileFor({ workDir: root, net: "none", allowBash: false });
  return runConverter(buildBwrapArgv(profile, inner));
}

const MAX_DOC_CHARS = Number(process.env.EXECUTOR_MAX_DOC_CHARS || 400_000);

// xlsx 转换脚本(与本文件同目录随 COPY src 进镜像):按 import.meta.url 解析绝对路径,
// 不依赖进程 cwd。选型理由见脚本头注释(pandoc 3.10 xlsx reader 实测不可用)。
const XLSX2TEXT_SCRIPT = new URL("./xlsx2text.py", import.meta.url).pathname;

// ReadDocument:从二进制文档(PDF / .docx / .xlsx / .pptx / .odt / .rtf / .epub / .html …)抽取纯文本。
// 用**已装好的顶级开源转换器**(pandoc = 文档转换标杆;poppler pdftotext = PDF 抽取事实标准),
// 但把它们关进一个安全受限的门:路径 confine 在会话 cwd、固定 argv、无 shell —— 取代过去"让模型
// 用 Bash 调 pandoc"的路径。因安全性由构造保证(模型控不了命令、读不到跨租户文件 / proc),
// **不需要 allowBash / 沙箱闸**,对所有 feature 开放(claw/prism/smart_search/peerreview 上传的稿件都能读)。
// xlsx/pptx 依赖镜像内 /usr/local 的上游 pandoc ≥3.8.3(Dockerfile vendor 层;apt 版 3.1 无此 reader)。
const readDocumentTool: BuiltinTool = {
  name: "ReadDocument",
  description:
    "Extract plain text from a binary document (PDF, .docx, .xlsx, .pptx, .odt, .rtf, .epub, .html) in the session working directory. " +
    "Use this INSTEAD of Read for non-plain-text documents — Read only handles UTF-8 text and will fail on binaries. " +
    "xlsx is rendered as one table per worksheet; pptx as text per slide. Legacy formats (.doc/.xls/.ppt/.ods/.odp) are NOT supported. " +
    "For long PDFs, pass first_pages to extract only the opening pages (e.g. first_pages=2 for title/abstract). Returns UTF-8 text.",
  input_schema: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      first_pages: {
        type: "number",
        description: "PDF only: extract just the first N pages (optional; omit to extract the whole document).",
      },
    },
    required: ["file_path"],
  },
  parallelSafe: true,
  async run(input, ctx) {
    try {
      const p = await confinePath(ctx.workDir, String(input.file_path));
      const lower = p.toLowerCase();
      const firstPages = Number(input.first_pages) > 0 ? Math.floor(Number(input.first_pages)) : 0;
      let argv: string[];
      if (lower.endsWith(".pdf")) {
        // poppler pdftotext:-layout 保留版式;-l N 限制到前 N 页;结尾 "-" = 输出到 stdout。
        argv = ["pdftotext", "-layout", ...(firstPages ? ["-l", String(firstPages)] : []), p, "-"];
      } else if (lower.endsWith(".xlsx")) {
        // xlsx 走 python3+openpyxl(实测选型):pandoc 3.10 的 xlsx reader 读不了 openpyxl 系
        // 文件(绝对 Target rels 报 Entry not found)且丢表头/整数变 1.0。固定脚本 + confined
        // 路径,安全外壳同 pandoc(runConverter:无 shell、白名单 env、8MB 闸、60s 超时)。
        argv = ["python3", XLSX2TEXT_SCRIPT, p];
      } else if (/\.(docx|pptx|odt|rtf|epub|html?|md|markdown|tex|latex)$/.test(lower)) {
        // pandoc:-t plain 纯文本;--wrap=none 不硬折行;--sandbox 禁止 pandoc 处理时读输入里引用的
        // 任意本地文件(crafted docx/html 的 XXE 式外泄防护,confinePath 之外的第二层)。
        // pptx(按幻灯片分节)是上游 pandoc 3.8.3+ 的 reader(镜像 /usr/local vendor 层;
        // 2026-07 文件上传调研落地,此前 xlsx/pptx 在工具层是空洞)。
        argv = ["pandoc", "--sandbox", p, "-t", "plain", "--wrap=none"];
      } else if (/\.(doc|xls|ppt|ods|odp)$/.test(lower)) {
        return fail(
          "ReadDocument: legacy format not supported (no parser available). Do NOT retry. " +
            "Tell the user honestly and suggest re-saving as .docx/.xlsx/.pptx and re-uploading. Never fabricate its content.",
          "该文件为旧版 Office 格式,暂无法解析。",
        );
      } else {
        return fail(
          "ReadDocument: unsupported extension. Supported: .pdf, .docx, .xlsx, .pptx, .odt, .rtf, .epub, .html. " +
            "For plain-text files (.txt/.md/.csv/code) use Read instead.",
        );
      }
      const res = await runConverter(argv);
      if (!res.ok) return fail("ReadDocument: extraction failed (" + argv[0] + "): " + res.err);
      let text = res.text.trim();
      if (!text) {
        return fail(
          "ReadDocument: extractor produced no text — the document may be scanned images with no embedded text layer (OCR is not available).",
        );
      }
      if (text.length > MAX_DOC_CHARS) {
        text =
          text.slice(0, MAX_DOC_CHARS) +
          `\n\n[... truncated at ${MAX_DOC_CHARS} chars. PDF: pass first_pages to narrow the range; ` +
          `xlsx: use Bash+python(openpyxl) to target a sheet/range if available, otherwise work with the extracted part and tell the user coverage is partial.]`;
      }
      await noteEvidenceRead(ctx.workDir, p, "ReadDocument", text.length, ctx.turn ?? 0);
      return ok(text);
    } catch (e) {
      return fail("ReadDocument failed: " + String((e as Error)?.message ?? e));
    }
  },
};

// DOC_HEAD_*:「文档头」有界抽取的上界(预识别 / 元数据抽取用)。与 ReadDocument(读全文)正交 ——
// 这里对**所有格式**强制小上界,让「只看开头 N 页」由**构造**保证,而不是靠提示词请求模型传 first_pages
// (pandoc 根本没有页参数,docx 靠提示词永远抽全文)。可经 env 覆盖。
const DOC_HEAD_MAX_CHARS = Number(process.env.EXECUTOR_DOC_HEAD_MAX_CHARS || 8_000);
const DOC_HEAD_PDF_PAGES = Number(process.env.EXECUTOR_DOC_HEAD_PDF_PAGES || 3);

// extractDocHead:从二进制文档抽取「开头一小段」纯文本,输出对所有格式硬性有界。
// - PDF:pdftotext -l N 只抽前 N 页,再硬截到 maxChars(单页也可能很大)。
// - 其它(docx/odt/rtf/epub/html…):pandoc 抽全文(无页限)后**硬截**到 maxChars。
// absPath 必须由调用方 confinePath 过(本函数不做路径校验,单一职责)。复用 runConverter 的安全外壳
// (固定 argv、无 shell、白名单 env、8MB OOM 闸、60s 超时);读方向无需 bwrap(与 ReadDocument 同)。
export async function extractDocHead(
  absPath: string,
  opts?: { pdfPages?: number; maxChars?: number },
): Promise<{ ok: boolean; text: string; truncated: boolean; err: string }> {
  const maxChars = opts?.maxChars && opts.maxChars > 0 ? Math.floor(opts.maxChars) : DOC_HEAD_MAX_CHARS;
  // pdfPages:省略 → 默认前 DOC_HEAD_PDF_PAGES 页(预识别);>0 → 前 N 页;<=0(如 0)→ 全部页
  // (审稿"只读一次全文"用,仍受 maxChars 上界)。用 typeof 判定以便 0 也生效(0 是 falsy,不能用 && 短路)。
  const rawPages = opts?.pdfPages;
  const pdfPages = typeof rawPages === "number" ? Math.floor(rawPages) : DOC_HEAD_PDF_PAGES;
  const lower = absPath.toLowerCase();
  let argv: string[];
  if (lower.endsWith(".pdf")) {
    argv = ["pdftotext", "-layout", ...(pdfPages > 0 ? ["-l", String(pdfPages)] : []), absPath, "-"];
  } else if (lower.endsWith(".xlsx")) {
    argv = ["python3", XLSX2TEXT_SCRIPT, absPath]; // 同 ReadDocument:openpyxl 兼容面 > pandoc reader
  } else if (/\.(docx|pptx|odt|rtf|epub|html?|md|markdown|tex|latex)$/.test(lower)) {
    argv = ["pandoc", "--sandbox", absPath, "-t", "plain", "--wrap=none"];
  } else {
    return {
      ok: false,
      text: "",
      truncated: false,
      err: "unsupported extension (supported: .pdf, .docx, .xlsx, .pptx, .odt, .rtf, .epub, .html)",
    };
  }
  const res = await runConverter(argv);
  if (!res.ok) return { ok: false, text: "", truncated: false, err: res.err };
  let text = res.text.trim();
  if (!text) {
    return {
      ok: false,
      text: "",
      truncated: false,
      err: "extractor produced no text — the document may be scanned images with no embedded text layer (OCR not available)",
    };
  }
  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }
  return { ok: true, text, truncated, err: "" };
}

// ExportDocument:与 ReadDocument 对称的**产出**方向 —— 把会话里的 Markdown/HTML/文本源文件
// 导出成交付文档(docx/pptx/odt/rtf/epub/html/pdf)。固定 argv 的 pandoc、路径 confine 在会话 cwd、
// 输出强制落 ./out/(claw 交付目录约定,后端据此出下载卡片)。无 shell → 无注入面、不需要沙箱闸,
// 取代 claw"用 Bash 调 pandoc 生成 docx"的路径。
// PDF 需外部引擎(pandoc 默认 pdflatex);容器未装引擎时对 .pdf 优雅降级,由 EXECUTOR_PDF_ENGINE
// 指定已装引擎(如 weasyprint)后启用。
const PDF_ENGINE = (process.env.EXECUTOR_PDF_ENGINE || "").trim();
const EXPORT_FORMATS: Record<string, { pandocTo: string; needsEngine?: boolean }> = {
  docx: { pandocTo: "docx" },
  pptx: { pandocTo: "pptx" },
  odt: { pandocTo: "odt" },
  rtf: { pandocTo: "rtf" },
  epub: { pandocTo: "epub" },
  html: { pandocTo: "html" },
  pdf: { pandocTo: "pdf", needsEngine: true },
};
const exportDocumentTool: BuiltinTool = {
  name: "ExportDocument",
  description:
    "Convert a source file (Markdown, HTML, or plain text) in the session working directory into a deliverable document. " +
    "target_format: docx | pptx | odt | rtf | epub | html (pdf requires a PDF engine; falls back with a message if unavailable). " +
    "The output is written under ./out/ (the user-delivery directory) and its relative path is returned. " +
    "Use this to produce downloadable files for the user — do NOT shell out to pandoc.",
  input_schema: {
    type: "object",
    properties: {
      source_path: { type: "string", description: "source file in the session cwd (.md / .markdown / .html / .txt)" },
      target_format: { type: "string", enum: ["docx", "pptx", "odt", "rtf", "epub", "html", "pdf"] },
      output_name: { type: "string", description: "optional base name for the output file (no extension); defaults to the source name" },
    },
    required: ["source_path", "target_format"],
  },
  parallelSafe: false,
  async run(input, ctx) {
    try {
      const fmtKey = String(input.target_format || "").toLowerCase();
      const fmt = EXPORT_FORMATS[fmtKey];
      if (!fmt) {
        return fail("ExportDocument: unsupported target_format. Use one of: " + Object.keys(EXPORT_FORMATS).join(", "));
      }
      const src = await confinePath(ctx.workDir, String(input.source_path));
      // 2026-08 证据账本 P1 · 交付边界 resolve 闸。展不开 = 不生成文件(终稿 §3.1 第 ③ 段)。
      // 放在 pandoc **之前**:未入账引用不该先变成一个 docx 再被追认。
      const cited = await resolveFileForDelivery(ctx.workDir, src);
      if (cited && cited.missing.length > 0) {
        return fail(
          citationFailureText(cited.missing, cited.ledgerTotal, "ExportDocument(文档导出)"),
          "文档里有对不上来源的引用编号,已阻止导出;AI 会修正后重试。",
        );
      }
      // 输出名:output_name 或源文件名(去扩展名)。清洗成安全 basename(保中英文数字 . _ -),防路径/注入。
      const rawBase = String(input.output_name || "").trim() || basename(String(input.source_path)).replace(/\.[^.]+$/, "");
      const base = rawBase.replace(/[^A-Za-z0-9._一-龥-]/g, "_").replace(/^\.+/, "").slice(0, 120) || "document";
      const outRel = `out/${base}.${fmtKey}`;
      // confinePath(create=true):产物只能落会话 cwd 内的 out/(与 claw artifactRelPath 白名单一致)。
      const outAbs = await confinePath(ctx.workDir, outRel, true);
      await mkdir(dirname(outAbs), { recursive: true });
      // 注:写方向不能用 --sandbox(它会连 pandoc 自己的 docx/pptx 模板数据一起挡掉 → 无法生成)。
      // 文本外泄向量已实测关闭(pandoc 只嵌合法图片,不把 /etc/passwd 之类文本文件读进产物);残余的窄
      // 向量(恶意模型嵌入已知绝对路径的**图片**跨会话读)此前只在注释里说"靠执行器级沙箱兜"、实则没有 ——
      // 现经 runConverterConfined 把 pandoc 关进 bwrap jail(只 bind 本会话 cwd),该向量物理关闭。生产环境
      // 若 bwrap 自探失败则 fail-closed 拒绝导出(与 Bash 对称),故生产恒为「jail 或拒绝」,不会未 jail 裸跑。
      // 句柄已全部命中 → 展开后的正文落一份**隐藏**同级副本喂给 pandoc(不改模型的源文件:
      // 它下一轮还要按句柄改稿)。隐藏名以 "." 开头,artifacts 的 out/ 扫描与根扫描都跳过点开头
      // 条目,故不会多出一张产物卡。扩展名保持在末位,pandoc 的 reader 推断不受影响。
      let pandocSrc = src;
      if (cited && cited.changed) {
        const cext = extname(src);
        pandocSrc = join(dirname(src), `.${basename(src, cext)}.cited${cext}`);
        await writeFile(pandocSrc, cited.text, "utf8");
      }
      const argv = ["pandoc", pandocSrc, "-o", outAbs, "-t", fmt.pandocTo];
      if (fmt.needsEngine && PDF_ENGINE) argv.push(`--pdf-engine=${PDF_ENGINE}`);
      const res = await runConverterConfined(ctx.workDir, argv);
      if (!res.ok) {
        // 先判沙箱闸关闭(整个导出子系统维护中):对 pdf/docx/所有格式一视同仁,给中性维护话术,
        // 绝不建议「改用 Word」(docx 会撞同一道闸,只会再失败一轮 + 一开始就误导用户;审计 [17])。
        // res.err 本身已是诚实的「先 Write 落 Markdown」维护指引,原样交给模型。
        if (res.gated) {
          return fail(res.err, "文档导出暂时维护中,已建议 AI 把内容保存为 Markdown 供下载。");
        }
        if (fmt.needsEngine) {
          return fail(
            "ExportDocument: PDF engine unavailable. 请改为导出 docx(target_format=docx),并告知用户:" +
              "『PDF 暂不可用,已生成 docx,可在 Word/WPS 中打开后另存为 PDF。』这是唯一允许的替代说法,禁止编造其它方法。Detail: " +
              res.err,
            "暂不支持导出 PDF,已建议 AI 改用 Word(docx)格式。",
          );
        }
        return fail(
          "ExportDocument: conversion failed (pandoc): " + res.err,
          "文档导出未成功,AI 会重试或改用其它格式。",
        );
      }
      const st = await stat(outAbs).catch(() => null);
      if (!st || st.size === 0)
        return fail("ExportDocument: pandoc produced an empty file.", "文档导出未成功,AI 会重试或改用其它格式。");
      // 导出 jail 断网(net:none)→ 源里的远程图片 `![](https://…)` 被 pandoc 跳过(仅 stderr WARNING、仍 exit 0)。
      // 静默丢图会让用户以为图片都在,故命中时明确提示改用会话内本地图片。
      const droppedRemote = /Could not fetch resource/i.test(res.err || "");
      const note = droppedRemote
        ? " 注意:部分远程图片(网址引用)因导出沙箱断网未内嵌,请先把图片下载到会话目录再以相对路径引用。"
        : "";
      return ok(`exported ${outRel} (${st.size} bytes) — delivered to the user's download area.${note}`);
    } catch (e) {
      return fail("ExportDocument failed: " + String((e as Error)?.message ?? e));
    }
  },
};

// BuildDeck:「制作PPT」feature(boltslides)专用 —— 把会话 cwd 里预置的 bolt-slides 脚手架
// (src/App.tsx + tokens.css + index.html 由 agent 编辑)编译成**一个自包含单文件 HTML** 落 ./out/,
// 走 claw 产物管线(srcDoc 沙箱预览 + 下载)。
// 关键:此工具的 run 在**执行器进程内**跑(非 Bash,不进 bwrap jail)—— 故能访问 cwd 里
// node_modules 这个指向 /opt/bolt-slides/node_modules(镜像预装,jail 外)的 symlink;而模型自己用 Bash
// 跑 `npm run build:deck` 会因 jail 看不见 /opt 导致 node_modules 悬空而失败,所以构建必须走这个工具。
// 自守卫:cwd 无 vite.config.singlefile.ts(= 非演示稿工作区)直接拒,避免其它 feature 误用。
const DECK_BUILD_TIMEOUT_MS = Math.max(30_000, Number(process.env.BOLT_SLIDES_BUILD_TIMEOUT_MS || 180_000));
const DECK_BUILD_LOG_CAP = 8000;

function runBuildDeck(workDir: string): Promise<{ code: number | null; out: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "build:deck"], {
      cwd: workDir,
      env: {
        ...bashEnv(),
        HOME: workDir, // npm 写 .npm 日志需可写 HOME;会话 cwd 归 bun 用户可写
        npm_config_cache: join(workDir, ".npm-cache"),
        npm_config_update_notifier: "false",
        NO_UPDATE_NOTIFIER: "1",
        CI: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const cap = (buf: Buffer) => {
      if (out.length < DECK_BUILD_LOG_CAP * 4) out += buf.toString("utf8");
    };
    child.stdout?.on("data", cap);
    child.stderr?.on("data", cap);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, DECK_BUILD_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out: out + "\n[spawn error] " + String(e?.message ?? e), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, timedOut });
    });
  });
}

const buildDeckTool: BuiltinTool = {
  name: "BuildDeck",
  description:
    "Build the current bolt-slides presentation into ONE self-contained HTML file delivered to the user. " +
    "Call this AFTER you have authored the deck (edited src/App.tsx, themed src/styles/tokens.css, set index.html title/favicon). " +
    "It compiles the Vite/React deck and writes a single inlined .html into ./out/ (the user's download/preview area) — " +
    "you do NOT run npm/vite yourself; this tool does it. If the build fails, the compiler output is returned so you can fix the code and call BuildDeck again. " +
    "Input: { name? } — optional base name for the output file (no extension), defaults to \"deck\".",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "optional base name for the output .html (no extension); defaults to \"deck\"" },
    },
  },
  parallelSafe: false,
  async run(input, ctx) {
    try {
      // 自守卫:仅演示稿工作区(有 singlefile 构建配置)可用。
      let cfg = await stat(join(ctx.workDir, "vite.config.singlefile.ts")).catch(() => null);
      if (!cfg) {
        // 自愈(审查发现):workdir 被磁盘 GC 回收 / dev 容器重建后脚手架丢失,而 templateKind
        // 只在 CreateSession 铺一次 → 老 PPT 会话重连后 BuildDeck 永久失效。凭 <workDir>.template
        // 侧车确认这确实是 bolt-slides 工作区后按需重铺(幂等);非 PPT 会话不受影响照旧拒。
        const { ensureBoltSlidesScaffold } = await import("../server/sessions.ts");
        if (await ensureBoltSlidesScaffold(ctx.workDir)) {
          cfg = await stat(join(ctx.workDir, "vite.config.singlefile.ts")).catch(() => null);
        }
      }
      if (!cfg) {
        return fail("BuildDeck is only available in a slides workspace (no bolt-slides scaffold found). This tool is for the 制作PPT feature.");
      }
      const rawBase = String(input.name || "").trim() || "deck";
      const base = rawBase.replace(/[^A-Za-z0-9._一-龥-]/g, "_").replace(/^\.+/, "").slice(0, 120) || "deck";
      const outRel = `out/${base}.html`;
      const outAbs = await confinePath(ctx.workDir, outRel, true); // 只允许落会话 cwd 的 out/

      const { code, out, timedOut } = await runBuildDeck(ctx.workDir);
      const tail = out.length > DECK_BUILD_LOG_CAP ? out.slice(-DECK_BUILD_LOG_CAP) : out;
      if (timedOut) {
        return fail(`BuildDeck: build timed out after ${Math.round(DECK_BUILD_TIMEOUT_MS / 1000)}s. Simplify the deck (fewer/lighter slides) and retry.\n\n${tail}`);
      }
      if (code !== 0) {
        return fail(`BuildDeck: build failed (exit ${code}). Fix the reported errors in src/App.tsx (or the file named below) and call BuildDeck again.\n\n${tail}`);
      }
      // vite singlefile 产物固定为 dist-single/index.html(见 vite.config.singlefile.ts)。
      const built = join(ctx.workDir, "dist-single", "index.html");
      const st = await stat(built).catch(() => null);
      if (!st || st.size === 0) {
        return fail("BuildDeck: build reported success but produced no output. Check the compiler log:\n\n" + tail);
      }
      // 12MB = claw maxArtifactBytes(backend/internal/claw/artifact.go);超限收割会被拒 → 提前挡。
      const MAX = 12 * 1024 * 1024;
      if (st.size > MAX) {
        return fail(`BuildDeck: the built deck is ${(st.size / 1024 / 1024).toFixed(1)}MB, over the ${MAX / 1024 / 1024}MB delivery cap. Reduce inlined image sizes (use smaller/compressed images or fewer full-bleed photos) and rebuild.`);
      }
      // 2026-08 证据账本 P1 · 交付边界 resolve 闸。演示稿正文在 src/App.tsx 里,编译后成为 bundle 里的
      // 字符串字面量 —— 故闸开在**构建产物**上(唯一能保证覆盖到所有幻灯片文案的位置),展不开就不交付。
      // 替换文本经 inlineSafe 剔掉了引号/反斜杠/尖括号/花括号,插进 JS 字符串字面量不会破坏 bundle。
      const cited = await resolveFileForDelivery(ctx.workDir, built);
      if (cited && cited.missing.length > 0) {
        return fail(
          citationFailureText(cited.missing, cited.ledgerTotal, "BuildDeck(演示稿构建)") +
            "\n(幻灯片文案在 src/App.tsx 里改,改完再调一次 BuildDeck。)",
          "演示稿里有对不上来源的引用编号,已阻止交付;AI 会修正后重试。",
        );
      }
      await mkdir(dirname(outAbs), { recursive: true });
      if (cited && cited.changed) await writeFile(outAbs, cited.text, "utf8");
      else await copyFile(built, outAbs);
      return ok(`Deck built and delivered: ${outRel} (${st.size} bytes). The user can now preview it in the panel and download it. Opening the downloaded file in a browser enables presenter mode, annotations and deep-links.`);
    } catch (e) {
      return fail("BuildDeck failed: " + String((e as Error)?.message ?? e));
    }
  },
};

// TodayDate:查当前日期/时间(跟随容器本地时区)。零参数、只读、parallelSafe,对所有 feature 开放
// (不进任何 denylist)。system 里已有天粒度 dateLine 锚点;此工具补精确时刻 + 给模型一个
// 「主动核实时间」的确定性通道(治时间线幻觉:模型对"今年是哪年"拿不准时可自查,而非按训练截止猜)。
const todayDateTool: BuiltinTool = {
  name: "TodayDate",
  description:
    "Get today's date and the current time in the platform's local timezone. The returned value is the authoritative current date — trust it over your training knowledge, e.g. when judging whether a publication year is plausible, converting \"recent N years\" into an absolute year range, or dating a document.",
  input_schema: { type: "object", properties: {} },
  parallelSafe: true,
  async run() {
    const d = localNow();
    const tzHint = d.tz ? `(${d.tz})` : "";
    return ok(
      `今天是 ${d.dateCN}(${d.weekday}),当前时间 ${d.time}${tzHint}\nISO 日期: ${d.isoDate}`,
    );
  },
};

// ── Skill:按需加载一份深度技能指南(guides/<name>/SKILL.md)────────────────────
// 与文件工具不同,它读的是**挂载的只读技能目录**(addDirs 下的 guides/),刻意不走 cwd confine ——
// 这是可信的平台内容(随镜像/挂载分发,非用户可控路径);name 按 slug 白名单校验防路径穿越。
// 可选技能名 + 何时用,已由 loader 注入 system 的「技能菜单」里,模型据此按名字加载。
// 后端 permissionAllowed 早已放行 Skill(inline 执行,skill 正文里再调的工具仍逐个回后端裁决)。
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
// guides 通常 2-4KB;设帽防有人提交超大 guide 时 Skill 静默把整份灌进上下文烧 token(评审 low)。
const MAX_SKILL_BODY = 16000;

function stripFrontmatter(md: string): string {
  const m = md.match(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return (m ? md.slice(m[0].length) : md).trim();
}

function capSkillBody(s: string): string {
  return s.length > MAX_SKILL_BODY ? s.slice(0, MAX_SKILL_BODY) + "\n\n[... 指南过长,已截断]" : s;
}

async function listGuideNames(addDirs: string[]): Promise<string[]> {
  const names: string[] = [];
  for (const dir of addDirs) {
    try {
      for (const e of await readdir(join(dir, "guides"), { withFileTypes: true })) {
        if (e.isDirectory()) names.push(e.name);
      }
    } catch {
      /* 该 addDir 无 guides/ */
    }
  }
  return names.sort();
}

const skillTool: BuiltinTool = {
  name: "Skill",
  description:
    "Load the full step-by-step guide for a named skill BEFORE doing that kind of task. The available skill names and when to use each are listed in the \"技能菜单 / Skill menu\" section of your system context. Call this first for topic-selection / rebuttal writing / data analysis & figures / methodology & statistics requests, then follow the returned guide. Input: { name }.",
  input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  parallelSafe: true,
  async run(input, ctx) {
    const name = String(input.name ?? "").trim();
    if (!SKILL_NAME_RE.test(name)) {
      return fail("skill load failed: invalid skill name. Pick one exactly from the skill menu in your system context.");
    }
    for (const dir of ctx.addDirs ?? []) {
      try {
        const body = await readFile(join(dir, "guides", name, "SKILL.md"), "utf8");
        // C1 命中率计量:每次按需加载记一行(docker logs 可 grep skill_loaded 聚合命中率;
        // 零命中的 lens = 纯 token 负债,归档候选)。workDir 尾段即 sessionID。
        log.info("skill_loaded", { skill: name, session: ctx.workDir.split("/").pop() ?? "" });
        return ok(capSkillBody(stripFrontmatter(body)));
      } catch {
        /* 换下一个 addDir 试 */
      }
    }
    const avail = await listGuideNames(ctx.addDirs ?? []);
    return fail(`skill "${name}" not found. Available skills: ${avail.length ? avail.join(", ") : "(none for this session)"}.`);
  },
};

// ── 渐进披露:ToolSearch / ToolInvoke(2026-08-14)────────────────────────────
// 与 Skill 工具同一手法(菜单常驻、正文按需),对象换成 minicod 的冷门工具。
// 设计取舍与「为什么不把发现到的工具加进 tools[]」见 mcp/deferred.ts 文件头。

/** 延迟工具的一行菜单项(给 ToolSearch 的无参列表与检索结果头部用)。 */
function deferredMenuLine(t: { name: string; description?: string }): string {
  const first = String(t.description ?? "").split("\n")[0] ?? "";
  return `- ${t.name}: ${first.slice(0, 160)}`;
}

const toolSearchTool: BuiltinTool = {
  name: "ToolSearch",
  description:
    "Discover additional research tools that are available but not listed in your tools. " +
    "Use this when the resident tools cannot do what you need (e.g. journal submission guidelines, " +
    "university lookup, OpenAlex entities, recommendation pools). Input: { query } — a few keywords " +
    "describing what you need; omit query to list everything available. " +
    "The result gives each tool's full name, description and JSON input schema; call it afterwards with ToolInvoke.",
  input_schema: { type: "object", properties: { query: { type: "string" } } },
  parallelSafe: true,
  async run(input, ctx) {
    const pool = ctx.deferredTools ?? [];
    if (pool.length === 0) {
      return ok("No additional tools are available for this session; everything you can use is already in your tools list.");
    }
    const q = String(input.query ?? "").trim().toLowerCase();
    const terms = q.split(/[\s,]+/).filter(Boolean);
    const hits = terms.length === 0
      ? pool
      : pool.filter((t) => {
          const hay = (t.name + " " + (t.description ?? "")).toLowerCase();
          return terms.some((w) => hay.includes(w));
        });
    log.info("tool_search", { query: q, hits: hits.length, pool: pool.length, session: ctx.workDir.split("/").pop() ?? "" });
    if (hits.length === 0) {
      // 零命中回完整菜单而不是空手:模型的检索词与工具名往往对不上(它并不知道这批工具叫什么),
      // 回空会让它转而编造工具名或放弃。菜单只有一行一条,比全量 schema 便宜一个量级。
      return ok(
        `No tool matched "${q}". Available additional tools (${pool.length}):\n` +
          pool.map(deferredMenuLine).join("\n") +
          "\n\nRe-run ToolSearch with one of these names to get its full input schema.",
      );
    }
    // 命中面过大时只回菜单 —— 全量 schema 一次几千 token,与常驻它们没有区别。
    if (hits.length > 4) {
      return ok(
        `${hits.length} tools matched "${q}":\n` +
          hits.map(deferredMenuLine).join("\n") +
          "\n\nRe-run ToolSearch with a more specific name to get its full input schema.",
      );
    }
    return ok(
      hits
        .map((t) => `${t.name}\n${t.description ?? ""}\ninput_schema: ${JSON.stringify(t.input_schema)}`)
        .join("\n\n---\n\n") +
        "\n\nCall these with ToolInvoke: { tool: \"<name>\", input: { ... } }.",
    );
  },
};

const toolInvokeTool: BuiltinTool = {
  name: "ToolInvoke",
  description:
    "Call a tool discovered via ToolSearch (one that is not in your tools list). " +
    "Input: { tool: exact tool name from ToolSearch, input: the arguments object for that tool }. " +
    "For tools that ARE in your tools list, call them directly instead — do not route them through here.",
  input_schema: {
    type: "object",
    properties: { tool: { type: "string" }, input: { type: "object" } },
    required: ["tool"],
  },
  parallelSafe: true,
  async run(input, ctx) {
    const pool = ctx.deferredTools ?? [];
    const name = String(input.tool ?? "").trim();
    if (!name) return fail("ToolInvoke failed: missing `tool`. Run ToolSearch first to get exact tool names.");
    // 只放行**本轮延迟池**里的工具。刻意不回落到「常驻工具也能经此调用」:
    // 那会让同一个工具有两条调用路径,而其中一条绕过 tool_use 的原生 schema 校验 ——
    // 模型会开始用它来「重试」参数不合法的常驻调用,失败模式从此变得不可归因。
    const found = pool.find((t) => t.name === name || t.name === MCP_PREFIX + name);
    if (!found) {
      return fail(
        `ToolInvoke failed: "${name}" is not an additional tool for this session. ` +
          (pool.length
            ? `Run ToolSearch to see what is available. If the tool is already in your tools list, call it directly.`
            : `No additional tools exist for this session.`),
      );
    }
    const args = (input.input ?? {}) as Record<string, unknown>;
    log.info("tool_invoke", { tool: found.name, session: ctx.workDir.split("/").pop() ?? "" });
    const r = await callMcpTool(found.name, args);
    const text = Array.isArray(r.content)
      ? r.content.map((b) => (typeof b === "string" ? b : ((b as { text?: string }).text ?? JSON.stringify(b)))).join("\n")
      : String(r.content ?? "");
    return r.isError ? fail(text) : ok(text);
  },
};

// AskUserQuestion(2026-07,交互提问):当模型被「只有用户能拍板的决策」卡住时,把问题做成
// 选项卡片让用户点选,而不是用纯文本反问。本工具是**哑的**:真正的问题卡片由前端读
// tool_use.input.questions 渲染(见 shared/components/chat/QuestionCard);run() 只回一个占位
// tool_result 满足 Anthropic 的 tool_use↔tool_result 配对,turnLoop 随后强制收尾结束本轮
// (askFired wind-down),用户的选择作为下一条 user 消息开新轮。故无 I/O、parallelSafe。
// 供给面由各 feature 的 DisallowedTools 控制(P0 仅 claw 放开;peerreview/server-side 等禁用);
// backend permissionAllowed 亦需对本工具名放行(default-deny)。
const askUserQuestionTool: BuiltinTool = {
  name: "AskUserQuestion",
  description:
    "当你被一个只有用户能拍板的决策卡住时(需求二选一、方案偏好、风险取舍等,且无法从已有信息、上下文或合理默认值推断),用本工具把问题做成选项卡片让用户点选,而不是用纯文本反问。用户点选后,其选择会作为下一条消息发给你。使用规则:① 仅在真正需要用户定夺时用 —— 有常规默认值的选择,直接选默认并在回复中说明,不要问;② 一次尽量把相关问题问全(最多 4 题),不要挤牙膏式连问;③ 每题给 2-4 个具体、点即可用的选项,把最推荐的放第一位并在其 label 末尾标注「(推荐)」;④ 不要用它来问「计划可以吗 / 要不要继续 / 这样对吗」这类确认;⑤ 发出问题后用一句话简短收尾并停下等待,不要重复罗列选项。输入:{ questions: [ { question: 完整问题文本, header: ≤12字的短标签, multiSelect?: 是否允许多选, options: [ { label: 选项文本, description: 该选项的说明 } ] } ] }。",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        description: "1-4 个需要用户拍板的问题",
        items: {
          type: "object",
          properties: {
            question: { type: "string", description: "完整的问题文本" },
            header: { type: "string", description: "≤12 字的短标签(如「部署方式」),用于卡片标题" },
            multiSelect: { type: "boolean", description: "是否允许多选(默认单选)" },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              description: "2-4 个候选答案;推荐项放第一位并在 label 末尾标注「(推荐)」",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "选项文本(简短、点即可用)" },
                  description: { type: "string", description: "该选项的含义 / 代价说明" },
                },
                required: ["label"],
              },
            },
          },
          required: ["question", "header", "options"],
        },
      },
    },
    required: ["questions"],
  },
  parallelSafe: true,
  async run() {
    // 哑实现:问题卡片在前端渲染,答案走下一条 user 消息回来。此处只回占位,让本轮 tool_use 有配对
    // 的 tool_result;turnLoop 检测到本工具被调用后会强制收尾(去工具 + 收尾指令),不阻塞等待。
    return ok(
      "已把问题以选项卡片的形式呈现给用户,正在等待其选择。请用一句话简短收尾并停下,等待用户回答后再继续 —— 不要重复罗列选项,也不要继续调用其它工具。",
    );
  },
};

// ── EvidenceGet(2026-08 证据账本 P0)────────────────────────────────────────
// 证据账本的**唯一读回路**。为什么必须是一个工具而不是"再多注入点上下文":
//   · smart_search 的 denylist 禁掉了 Write/Glob/Grep/Skill(spec.go),模型没有任何别的方式
//     回看已检索到的东西 —— 它连自救式外置都物理做不到;
//   · 会话闲置 30 分钟或容器重启后,重灌把 100% 的 tool_result 丢弃(shadowTurn.ts:50),
//     此时账本是**唯一**还活着的证据介质(会话 cwd,TTL 30 天,扛驱逐与重启)。
// 描述里刻意写足「什么时候必须用我」—— 终稿实测 18 个 MCP 工具里义务语 0/18,模型因此从不知道
// 自己**该**回看;这条属工具可供性(affordance),不是纠偏文本。
const MAX_EVIDENCE_IDS = 20;
/** EvidenceGet fields=passages 单次最多回多少段:段落是拿来支撑论断的,不是拿来灌满上下文的。 */
const MAX_PASSAGE_ROWS = Number(process.env.EVIDENCE_PASSAGE_ROWS_MAX || 20);

function parseIdList(raw: unknown): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    for (const tok of s.split(/[\s,;、]+/)) {
      const t = tok.trim();
      if (t) out.push(t);
    }
  };
  if (Array.isArray(raw)) for (const v of raw) push(String(v ?? ""));
  else if (typeof raw === "string") push(raw);
  return out.slice(0, MAX_EVIDENCE_IDS);
}

const evidenceGetTool: BuiltinTool = {
  name: "EvidenceGet",
  description:
    "Look up the session's evidence ledger — the engine-written record of every paper any retrieval tool has actually returned in this conversation (id, title, authors, year, venue, DOI, source, abstract). " +
    "The ledger lives on disk and survives context loss; the raw tool results do NOT. " +
    "You MUST call this before writing anything that cites, lists, counts or characterises literature in this session when you cannot see the original tool results in your current context — " +
    "for example after the conversation has been going on for a while, when the user follows up with \"what else\", \"summarise those\", \"which ones were about X\", or when you are about to say how many papers you found. " +
    "Do NOT reconstruct bibliographic facts (titles, authors, years, journals, DOIs) from memory or from your own earlier prose: your earlier prose is kept in context but the evidence behind it may not be. " +
    "Input: { ids?: [\"E3\",\"E7\"], fields?: \"meta\" | \"full\" | \"passages\", q?: \"keyword\" }. Omit ids to list the whole ledger (ids + one-line records). fields=\"full\" (default when ids are given) also returns abstracts. " +
    "fields=\"passages\" returns the VERBATIM excerpts the retrieval tools actually returned for those papers (method/result sentences, numbers) — use it whenever you are about to state a specific figure (sample size, effect size, p-value, follow-up length) so you quote a real sentence instead of reconstructing one. Add q to filter excerpts by keyword.",
  input_schema: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        items: { type: "string" },
        description: `evidence ids such as ["E3","E7"] (max ${MAX_EVIDENCE_IDS}); omit to list the whole ledger`,
      },
      fields: {
        type: "string",
        enum: ["meta", "full", "passages"],
        description: "meta = one line each; full = with abstract; passages = verbatim excerpts returned by the retrieval tools",
      },
      q: { type: "string", description: "only with fields=passages: case-insensitive substring filter over excerpts" },
    },
  },
  parallelSafe: true,
  async run(input, ctx) {
    try {
      const { loadLedger, getByIds, buildDigest, materialize, normalizeId } = await import("../evidence/ledger.ts");
      const ids = parseIdList(input.ids);
      if (ids.length === 0) {
        // 无参 = 列全账(模型在失忆纪元里重新定位自己的唯一手段)。
        const digest = await buildDigest(ctx.workDir);
        return ok(
          digest ||
            "证据账本为空:本会话还没有任何工具返回过文献题录。若需要文献,先调用检索工具;不要凭记忆写题录。",
        );
      }
      // fields=passages:把上游真的返回过的**原句**还回去。
      // 🔴 它存在的理由:模型要写"随访 6.2 个月""效应量 0.31"这类具体数值时,手上若只有标题+摘要,
      //    除了编没有第二条路(账本注释里那句"31 条效应量凭空出现的那条缝")。有原句可引,
      //    "引真的"才第一次比"编假的"便宜 —— 这是让正确的路更便宜,不是加一道罚则。
      if (input.fields === "passages") {
        const { getPassages } = await import("../evidence/passages.ts");
        const q = typeof input.q === "string" ? input.q : undefined;
        const rows = await getPassages(ctx.workDir, ids, { q, max: MAX_PASSAGE_ROWS });
        if (rows.length === 0) {
          return ok(
            "这些编号在账本里没有可引原文段落(检索结果只带了题录/摘要)。" +
              "不要据此编造具体数值 —— 要么改用摘要里确有的表述,要么如实说明该数据需要读原文才能确认。",
          );
        }
        const body = rows
          .map((r) => `[${r.eid}]${r.section ? " (" + r.section + ")" : ""} ${r.text}`)
          .join("\n\n");
        return ok(`以下是检索工具**原样返回**的段落,可直接引用;引用时标注对应编号。\n\n${body}`);
      }
      const fields = input.fields === "meta" ? "meta" : "full";
      const found = await getByIds(ctx.workDir, ids);
      const gotten = new Set(found.map((r) => r.id));
      const missing = ids.map(normalizeId).filter((i) => i && !gotten.has(i));
      const total = (await loadLedger(ctx.workDir)).length;
      const { renderRecordsForModel } = await import("../evidence/render.ts");
      let text = renderRecordsForModel(found, missing, total, fields);
      // 懒物化:只有真被取用过的记录才落 evidence/E<n>.md(全量物化会撞会话文件数帽 +
      // 让 assertSessionQuota 的全目录递归变贵,见 ledger.ts 文件头硬约束 2)。
      if (fields === "full" && found.length > 0) {
        const paths = await materialize(ctx.workDir, found);
        if (paths.length > 0) text += `\n\n[也已落盘,可随时 Read:${paths.join(" ")}]`;
      }
      return ok(text);
    } catch (e) {
      return fail(
        "EvidenceGet failed: " + String((e as Error)?.message ?? e),
        "读取证据记录未成功,AI 会尝试其它方式。",
      );
    }
  },
};

// ── SubmitAnswer / DeclareInsufficient(2026-08 证据账本 P1)──────────────────
// 「收工」从一个**免费的采样动作**(end_turn)变成一次工具调用。
//
// 为什么不用 tool_choice:探针实测(docs/tool-choice-probe-2026-08.md)线上主力
// deepseek-v4-pro/flash 对 tool_choice **HTTP 200 + 静默无视**,glm-5.2 同,支持度是 per-model
// 不是 per-provider。⇒ 这里只用**所有 provider 都支持的普通工具调用**,不依赖任何强制参数。
// 相应地:模型硬 end_turn 不调本工具时,降级为可观测(research_state 帧照实印「本轮检索 0 次」),
// **绝不做软形态强制**(吞掉 end_turn 再重发)—— 探针报告 §六已写死否决,那是最坏的一种 guard。
//
// 闸的判据是**引擎算数**:`ledger.count > 0`,零 LLM、零内容判断(终稿否决清单 #5)。
// 不过闸时给的是精确差额 + 可执行的下一步(与仓内既有的工具失败双轨制同范式),不是一句「请检索」。
// 轮次形态(取证型 / 闲聊型)由 policy/researchTurn.ts 的有序规则 Router 判定,并通过
// **工具可见性**(turnLoop 只在取证轮把这两个工具放进 tools[])落地 —— 闲聊轮里它们根本不在场。

/** 已执行检索的精确清单(闸的「差额」那一半)。空 = 本会话一次检索都没发生过。 */
function renderQueryLedger(queries: Array<{ q: string; tool: string; args: unknown; delivered?: number; new_ids?: string[] }>): string {
  if (queries.length === 0) return "本会话至今**一次检索都没有发生过**(已执行检索:0 次)。";
  const lines = queries.slice(-12).map((r) => {
    const tool = r.tool.replace(/^mcp__[a-z0-9]+__/i, "");
    let args = "";
    try {
      args = JSON.stringify(r.args ?? {});
    } catch {
      args = "";
    }
    if (args.length > 120) args = args.slice(0, 120) + "…";
    return `  · ${r.q} ${tool} ${args} → 送达 ${r.delivered ?? 0} 条、新增入账 ${r.new_ids?.length ?? 0} 条`;
  });
  return `本会话已执行的检索(${queries.length} 次,列最近 ${lines.length} 条):\n${lines.join("\n")}`;
}

const submitAnswerTool: BuiltinTool = {
  name: "SubmitAnswer",
  description:
    "Deliver your final answer for this turn. In a retrieval-shaped turn this is how you finish: put the complete answer text in `answer` and call this tool — the platform renders that text to the user as your reply, so do NOT also write it out as a normal message. " +
    "The call is REJECTED when this session's evidence ledger is empty, i.e. when no retrieval tool has actually returned anything yet. That rejection is arithmetic on the ledger, not a judgement about your answer: it means the answer would rest on recalled facts rather than on retrieved evidence. " +
    "When rejected you get the exact shortfall (ledger size, the queries already run) and two ways forward: run a retrieval tool (any tool whose name starts with mcp__ — everything it returns is written to the ledger automatically), or, if the question genuinely cannot be grounded in the platform's literature, call DeclareInsufficient and then answer in plain text. " +
    "Never invent bibliographic details (titles, authors, years, journals, DOIs) or statistics to get past this tool. " +
    "Input: { answer: the full final reply, in the user's language, markdown allowed }.",
  input_schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description: "The complete final reply to show the user. Markdown allowed. Do not repeat it outside this tool.",
      },
    },
    required: ["answer"],
  },
  parallelSafe: true,
  async run(input, ctx) {
    const answer = typeof input.answer === "string" ? input.answer.trim() : "";
    if (!answer) {
      return fail(
        "SubmitAnswer 未执行:缺少 answer 参数(或为空)。answer 必须是要展示给用户的**完整最终回答正文**。",
        "本次回答未能提交,AI 会重试。",
      );
    }
    try {
      const { stats, loadQueries } = await import("../evidence/ledger.ts");
      const st = await stats(ctx.workDir);
      // ── 闸:引擎算数,零 LLM、零内容判断 ────────────────────────────────────
      if (st.total > 0) {
        // 放行。正文由 turnLoop 直接发给用户并当场收轮 —— 这条回执只在冷回放里被看到。
        return ok(`已交付(账本 ${st.total} 条)。回答已展示给用户,本轮到此结束,不要再重复输出正文。`);
      }
      const queries = await loadQueries(ctx.workDir);
      return fail(
        "SubmitAnswer 被拒绝:**本会话证据账本为 0 条**。\n" +
          renderQueryLedger(queries) +
          "\n\n判据是引擎对账本的计数,与你答案的写法无关 —— 现在交付的任何文献题录、数量、统计值都只能来自你的记忆。\n" +
          "接下来二选一(不要原样重发本次调用):\n" +
          "  1)调用检索工具(名字以 mcp__ 开头的任一个)真正取证 —— 它返回的每一条题录会被引擎自动记入账本;拿到结果后再调 SubmitAnswer。\n" +
          "  2)如果这个问题确实无法用平台文献接地(例如纯方法解释、纯写作润色、用户只是闲聊),调用 DeclareInsufficient 说明缺什么,然后把答案作为**普通回复正文**写出来即可,不必再调 SubmitAnswer。\n" +
          "严禁为了通过本工具而编造标题 / 作者 / 年份 / 期刊 / DOI / 统计数值。",
        "本次回答尚未取得检索证据,AI 正在补充检索。",
      );
    } catch (e) {
      // 账本读失败不该堵死交付面:放行 + 留痕(fail-soft,与 turnLoop 的账本读失败同口径)。
      log.warn("SubmitAnswer gate degraded (ledger read failed)", { err: String((e as Error)?.message ?? e) });
      return ok("已交付。回答已展示给用户,本轮到此结束,不要再重复输出正文。");
    }
  },
};

// DeclareInsufficient —— 诚实出口。这条路**必须留着**,但它与今天「标注即可」的关键区别是:
// 今天是模型自己写一句话、写了没人管(smartsearch/spec.go 的逃生门正是这么把病灶合法化的);
// 这里是**结构化记录** —— 落账本(ledger.jsonl 的 op 行)+ 进 research_state 帧 + 用户屏幕上
// 由**引擎**打横幅(模型写什么都盖不掉它)。声明的是事实,不是免责声明。
const declareInsufficientTool: BuiltinTool = {
  name: "DeclareInsufficient",
  description:
    "Declare, on the record, that you cannot ground this answer in retrieved evidence and will answer from your own knowledge instead. " +
    "Call this INSTEAD of quietly answering anyway whenever SubmitAnswer has told you the evidence ledger is empty and retrieval is not the right move (pure methodology explanation, writing/polishing, small talk, or retrieval that returned nothing usable). " +
    "The platform records the declaration in this session's ledger and stamps a visible notice above your reply, so you do not need to write your own disclaimer — but you must still avoid inventing specific bibliographic details or statistics. " +
    "After calling this, simply write your answer as a normal reply and end the turn (do not call SubmitAnswer). " +
    "Input: { missing: what evidence is missing or why retrieval cannot ground this, attempted?: what you already tried }.",
  input_schema: {
    type: "object",
    properties: {
      missing: {
        type: "string",
        description: "What could not be grounded in retrieved evidence, and why (one or two sentences).",
      },
      attempted: {
        type: "string",
        description: "Optional: retrieval you already tried and why it did not help.",
      },
    },
    required: ["missing"],
  },
  parallelSafe: true,
  async run(input, ctx) {
    const missing = typeof input.missing === "string" ? input.missing.trim().slice(0, 2000) : "";
    if (!missing) {
      return fail(
        "DeclareInsufficient 未执行:缺少 missing 参数。请一句话说明「哪一部分无法用检索证据支撑、为什么」。",
        "记录声明未成功,AI 会重试。",
      );
    }
    const attempted = typeof input.attempted === "string" ? input.attempted.trim().slice(0, 2000) : "";
    // 落账:与题录同一本账(evidence/ledger.jsonl),用 op 行 —— ledger.loadLedger 对没有
    // id/key 的行直接跳过,故不污染题录读侧;终稿否决清单 #13「不许各写各的台账」。
    // 追加式单行写入,不需要 ledger 的 id 分配锁(不分配 id、不改 INDEX)。
    try {
      const dir = join(ctx.workDir, "evidence"); // 与 evidence/ledger.ts 的 DIR/LEDGER 同布局
      await mkdir(dir, { recursive: true });
      await appendFile(
        join(dir, "ledger.jsonl"),
        JSON.stringify({ op: "insufficient", ts: new Date().toISOString(), missing, ...(attempted ? { attempted } : {}) }) + "\n",
        "utf8",
      );
    } catch (e) {
      // 记不上不该堵死诚实出口:横幅仍会打、research_state 帧仍会带 insufficient。
      log.warn("DeclareInsufficient: ledger append failed", { err: String((e as Error)?.message ?? e) });
    }
    return ok(
      "已记录「证据不足」声明,平台会在你的回答上方打出用户可见的提示横幅。\n" +
        "现在直接把答案作为**普通回复正文**写出来并结束本轮 —— 不要再调用 SubmitAnswer,也不要自己再写一遍免责声明。\n" +
        "仍然禁止编造具体文献题录(标题 / 作者 / 年份 / 期刊 / DOI)与统计数值;讲清楚哪些是通行认识、哪些需要用户自行核验即可。",
    );
  },
};


// ── StatRun:数据分析引擎的**唯一** bundle 写入通道 ───────────────────────────
//
// ## 为什么需要一个 executor 工具(而不是让模型自己跑 statkit)
//
// 数据分析有一对看似矛盾的约束:
//   ① 用户数据受 PHI 约束,**不能出 jail** ⇒ 引擎必须在 jail 内跑;
//   ② `analysis/` 里的 bundle 是报告里每个数字的真源,**模型不能写** ⇒ 它是保留区。
// 若让模型用 Bash 跑 `python3 -m statkit run`,它就在自己的 jail profile 里,
// 而那个 profile 对 `analysis/` 是只读的 —— 引擎写不出 bundle。
//
// 解法不是把数据搬出 jail,而是**给引擎单独一次可写该保留区的 spawn**:
// 本工具构造 `writableReserved: [ANALYSIS_DIR]` 的 profile,是全仓唯一带这个字段的地方。
// 模型自己的 Bash 永远拿只读覆盖层 ⇒ 它可以**调用**本工具,但不能**绕过**它伪造 bundle。
//
// ## 与 BuildDeck 的对照(方向正好相反)
//
// BuildDeck 必须在 jail 外跑,因为 node_modules 不进 jail;
// StatRun 必须在 jail **内**跑,因为用户数据不能出 jail。两者都是 executor 工具,理由相反。
//
// ⚠️ 新 executor 工具必须同步在 backend `agentbridge/ws.go` 的 `permissionAllowed` 显式放行
//    (default-deny,已咬过 4 次),并由 `permissionParity.test.ts` 机械核对。
// 🔴 StatRun 信号量 = 1。
//
// `server/admission.ts` 的注释里用「StatRun 信号量 = 1」来论证 4G 容器够用:
//   预算 = 2×765MiB(两条 turn) + 1×800MB(一个 statkit 子进程) + 头。
// 2026-08-05 盘点查证:**这个信号量当时并不存在**,StatRun 是裸 spawn。
// 也就是说那道算术题的依据是一个没有实现的约束 —— 两条 turn 同时跑统计就是
// 2×800MB 统计 + 2×765MiB turn ≈ 3.1G,贴着上限,而且没有任何东西拦第三个。
//
// 这里把它补成真的。刻意用**排队**而不是像 turn 准入那样即刻拒:
// turn 准入拒掉是让用户重试(用户在等,拒了他知道);而 StatRun 是模型的一次工具调用,
// 拒掉只会让模型以为工具坏了去重试或绕路(实测 AD-04 里它连试 3 次)。
// 统计计算是秒级的,排一下队比让模型自己找路便宜得多。
let statRunChain: Promise<unknown> = Promise.resolve();
function withStatRunSlot<T>(fn: () => Promise<T>): Promise<T> {
  const run = statRunChain.then(fn, fn);
  // 链上不保留结果值,只保留「排队」这件事;失败也要放行下一个,否则一次异常锁死整条链。
  statRunChain = run.then(() => undefined, () => undefined);
  return run;
}

const statRunTool: BuiltinTool = {
  name: "StatRun",
  description:
    "Run a statistical analysis on an uploaded data file using the statkit engine. " +
    "The engine MEASURES assumptions (normality, homogeneity of variance) itself, then picks the test " +
    "from a vetted decision table — you do NOT choose the test by reasoning about it. " +
    "It writes a result bundle that the report step reads; you never write those numbers yourself. " +
    "If you pass `requested` and it is not in the allowed set, the call is REJECTED with the allowed list and the reason. " +
    "WHEN THE ENGINE PUSHES BACK, read `severity`: " +
    "`blocking` = arithmetically impossible (zero variance, n<3, unreadable file) — fix the data; " +
    "`capability` = the engine does not implement that method family — say so honestly and give the " +
    "user an alternative path (SPSS/R), do NOT substitute a wrong method or split the data into pairs; " +
    "`advisory` = **YOUR CALL**. The engine hands you the evidence, the consequence and what happens " +
    "if you proceed; you decide. To proceed, pass the parameter named in `accept_key`. " +
    "Your decision is recorded in the bundle and DISCLOSED in the Methods section the user will publish. " +
    "Run `python3 -P -m statkit situations --json` via Bash for the full catalogue of every situation " +
    "the engine can report, with its detection rule, consequence and next step. " +
    "The outcome column may be CONTINUOUS (means: t / Welch / Mann-Whitney / ANOVA / Kruskal-Wallis) " +
    "or CATEGORICAL (rates: chi-square / Fisher exact / McNemar / Cochran-Armitage trend). " +
    "The engine infers which from the data — pass the raw column either way, do NOT recode " +
    "有效/无效 into 1/0 and do NOT compute rates yourself. " +
    "Input: { data (path to .csv/.xlsx), dv (outcome column), group (grouping column), " +
    "paired? (true for repeated measures), subject? (id column, required when paired), requested? (method id), " +
    "plus the per-situation accept flags and the categorical knobs below }.",
  input_schema: {
    type: "object",
    properties: {
      data: { type: "string", description: "path to the data file, relative to the session directory" },
      dv: { type: "string", description: "dependent/outcome variable column name" },
      group: { type: "string", description: "grouping column name" },
      paired: { type: "boolean", description: "true when the two measurements come from the same units" },
      subject: { type: "string", description: "subject/pair id column; required when paired=true" },
      requested: { type: "string", description: "optional method id; must be inside the engine's allowed set" },
      // 🔴 两个逃生开关必须暴露在工具面上(2026-08-06 补)。
      //
      // 它们此前**只存在于 statkit 的命令行**,而 SKILL.md 白纸黑字教模型
      // 「只有用户明确说是真实测量值,才带 --sentinel-ok 重跑」—— 教的是一个模型
      // 根本表达不出来的动作。引擎拒绝 → 模型照 SKILL 去做 → 做不到 → 要么放弃、
      // 要么改数据文件绕过闸门(后者更糟:它把一道闸变成了一次静默的数据篡改)。
      //
      // 「闸门有逃生开关而调用方够不着」= 那道闸在真实链路上只有拒绝、没有放行,
      // 而用户的真实场景里 999 确实可能是真值、25% 缺失确实可能是真的。
      sentinel_ok: {
        type: "boolean",
        description:
          "Set true ONLY after the user has explicitly confirmed that sentinel-looking values " +
          "(999 / 9999 / 888 …) are genuine measurements rather than missing-data codes. " +
          "Never set this to silence the engine's warning on your own.",
      },
      missing_ok: {
        type: "boolean",
        description:
          "Set true ONLY after the user has confirmed that a large listwise exclusion is real " +
          "(not an Excel merged-cell artefact). The confirmation is recorded in the bundle and " +
          "disclosed in the Methods section.",
      },
      labels_ok: {
        type: "boolean",
        description:
          "Set true when two group labels that differ only in whitespace/case/width really are " +
          "two different groups. Recorded and disclosed.",
      },
      duplicates_ok: {
        type: "boolean",
        description:
          "Set true to proceed when a subject has several differing values at the same level. " +
          "The engine will take the FIRST row in file order — i.e. the result depends on row " +
          "order. Recorded and disclosed.",
      },
      independent_study: {
        type: "boolean",
        description:
          "Set true when two comparisons on the same outcome really are separate research " +
          "questions (different populations/experiments), not a multi-group design split into " +
          "pairs. Recorded and disclosed.",
      },
      sheet: {
        type: "string",
        description:
          "Which Excel worksheet to analyse. REQUIRED when the workbook has more than one " +
          "non-empty sheet — the engine refuses rather than silently taking the first one. " +
          "Tell the user which sheet you picked and why. Recorded and disclosed.",
      },
      // ── 分类结局的两个口径旋钮(2026-08-07,分类资料族 D-10~D-14)────────────
      //
      // 🔴 这两个**不是** accept 开关:它们不放行任何东西,只决定「怎么算、怎么写」。
      //    但两者都能改变结论,所以都必须能被调用方表达出来 ——
      //    `sheet` 那条踩过一模一样的坑:参数只活在 statkit 的命令行上,
      //    SKILL 教模型去做一个它在工具面上根本表达不出来的动作。
      positive: {
        type: "string",
        description:
          "Which outcome level counts as the EVENT (e.g. 有效 / 阳性 / 发生). This decides the " +
          "SIGN of the risk difference and whether RR/OR are >1 or <1. If omitted the engine " +
          "picks one (negation prefix 无/未/不 → positive-word list → last sorted level) and " +
          "DISCLOSES which and why in the Methods section. Pass it explicitly whenever the user " +
          "has told you which outcome is the event.",
      },
      group_order: {
        type: "string",
        description:
          "Comma-separated ordering of the grouping levels, low to high (e.g. \"低,中,高\" or " +
          "\"0mg,5mg,10mg\"). Pass this ONLY when the groups are genuinely ORDERED (dose, severity, " +
          "stage) — it unlocks the Cochran-Armitage trend test, which uses the order as a score. " +
          "The engine CANNOT infer this: 轻/中/重 and A/B/C look identical in the data, and a wrong " +
          "order changes χ² several-fold while both results run cleanly and report no error. " +
          "Never invent an order to make the trend test available.",
      },
    },
    required: ["data", "dv"],
  },
  parallelSafe: false,
  async run(input, ctx) {
    const gate = unsandboxedBashGate();
    if (!gate.ok) {
      return fail(
        "统计引擎需要沙箱环境,当前不可用。" + gate.reason,
        "统计分析环境暂不可用,本步骤已跳过。",
      );
    }
    // 🔴 全仓唯一带 writableReserved 的 profile:引擎可写 analysis/,模型的 Bash 不可。
    const profile: SandboxProfile = {
      ...profileFor({ workDir: ctx.workDir, net: "none", allowBash: true }),
      writableReserved: [ANALYSIS_DIR],
    };
    // 🔴 `-P`(PYTHONSAFEPATH)不可省:`python3 -m pkg` 会把 **cwd 放进 sys.path[0]**,
    //    而 cwd 就是会话工作目录、`statkit/` 又不在 RESERVED_DIRS 里 ⇒ 模型 Write 两个文件
    //    (`statkit/__init__.py` + `statkit/__main__.py`)就能顶替掉真引擎。
    //    这一处尤其致命:它是全仓唯一带 `writableReserved: [analysis]` 的 spawn,
    //    劫持后的「引擎」可以直接写 bundle ⇒ D1 数字锁被完全架空。
    //    `tools/statkitPaths.test.ts` 有跨文件不变量钉住「出现 -m statkit 处必须有 -P」。
    const args = ["python3", "-P", "-m", "statkit", "run",
      "--data", String(input.data), "--dv", String(input.dv), "--workdir", "."];
    if (input.group) args.push("--group", String(input.group));
    if (input.paired) args.push("--paired");
    if (input.subject) args.push("--subject", String(input.subject));
    if (input.requested) args.push("--requested", String(input.requested));
    // 两个逃生开关(见 input_schema 上的长注释)。透传到 CLI,否则 SKILL 教的动作模型做不到。
    // advisory 档的逐项接受。刻意**不做一个 force 开关** —— 一个开关关掉所有警告,
    // 等于把性质完全不同的情况压成一个「我知道了」,而每个决定都要各自留痕、各自披露。
    if (input.sentinel_ok) args.push("--sentinel-ok");
    if (input.missing_ok) args.push("--missing-ok");
    if (input.labels_ok) args.push("--labels-ok");
    if (input.duplicates_ok) args.push("--duplicates-ok");
    if (input.independent_study) args.push("--independent-study");
    if (input.sheet) args.push("--sheet", String(input.sheet));
    // 口径旋钮(非 accept 开关):不放行任何东西,但都能改变结论,故必须能被表达。
    if (input.positive) args.push("--positive", String(input.positive));
    if (input.group_order) args.push("--group-order", String(input.group_order));
    // 模型标识进 bundle 的 software 段 → ICMJE 披露句带出版本。拿不到就不传(披露句会优雅降级)。
    if (ctx.model) args.push("--llm-model", ctx.model);

    const argv = sandboxMode() === "bwrap" ? buildBwrapArgv(profile, args) : args;
    // 🔴 排队:同一时刻只允许一个 statkit 子进程(~800MB)。见文件上方信号量的说明。
    const { out, err, code } = await withStatRunSlot(async () => {
      const proc = Bun.spawn(argv, { cwd: ctx.workDir, stdout: "pipe", stderr: "pipe", env: bashEnv() });
      // 统计计算按 verb 拆分后单次都在 240s 软预算内;这里给 300s 硬顶(与 Bash 同口径)。
      const killer = setTimeout(() => { try { proc.kill(); } catch { /* noop */ } }, 300_000);
      const o = await new Response(proc.stdout).text();
      const e = await new Response(proc.stderr).text();
      const c = await proc.exited;
      clearTimeout(killer);
      return { out: o, err: e, code: c };
    });

    if (code === 2) {
      // 守门拒绝 —— 把引擎的可行动理由**原样**回喂给模型(候选是什么、为什么、下一步该问什么)。
      // 刻意不改写成「失败了」:打哑谜会让模型重试到 24 轮上限耗尽。
      // 守门拒绝**不是** isError:它是引擎按设计给出的、带可行动理由的答复。
      // 标成错误会让模型以为「工具坏了」而重试(实测 AD-04 里它连试 3 次),
      // 而正确反应是把理由讲给用户、或回去补问诊。
      return ok(out.trim() || err.trim() || "statkit gate rejected the request");
    }
    if (code !== 0) {
      return fail(
        "统计引擎执行失败(exit " + code + "):\n" + (err.trim() || out.trim()).slice(0, 4000),
      );
    }
    return ok(out.trim());
  },
};

// ── StatReport:把 bundle 渲染成交付物 ───────────────────────────────────────
//
// 🔴 2026-08-05 之前**这个工具不存在**,而 `StatRun` 的描述里写着
//    "It writes a result bundle that the report step reads",skill 里写着
//    「调引擎的报告功能生成三线表 docx + Methods/Results 段」「再定 `--system`」——
//    指的都是一个模型根本调不到的东西。
//
//    实测后果(43 条用例批跑中发现):模型做不到,于是退而**自己手写** markdown 报告
//    再用 ExportDocument 转 docx。整个 `statkit/report/` 层(三线表边框、体系感知格式化、
//    Methods/Results 模板、ICMJE 披露、多重比较披露、可复现脚本)**产品里从未被调用过**。
//    随之失效的保证包括:`fmt_p` 的「绝不输出 p=.000」、APA 的 p 不带前导零、
//    Welch 的分数自由度不取整、非参报中位数而非均数 —— 这些全变回「模型自己格式化」。
//
//    与 StatRun 同一个 spawn 形态:report 要写 `out/`(模型可写区)而**读** `analysis/`,
//    所以其实不需要 writableReserved;但仍走 executor 工具而不是让模型用 Bash 跑,
//    理由是一致性 —— 引擎的调用面收在工具里,模型不需要知道 statkit 的命令行。
//
// ── 🔴 bundle 路径闸(2026-08-06 补,端到端复现过的 P0)──────────────────────────
//
// 本工具此前把模型给的 `bundle` **原样**拼进 argv,零校验。而 D1 数字锁锁的是 bundle 的
// **生产者**(`analysis/` 是保留区,confinePath 与 bwrap 两道闸让模型写不进去)——
// **没有人约束消费者**。于是攻击者根本不碰保留区:
//
//     Write("cooked.json", <照抄 bundle 结构、数字随便填>)     ← 会话根,模型完全可写
//     StatReport(bundle="cooked.json", system="cn-core")
//     ⇒ exit 0,产出真三线表 docx +「t(67.31)=4.106,p<0.001」的 Results 段
//       + ICMJE 披露 +「固定种子以保证可复现」。**一次 StatRun 都不用跑。**
//
// 产出的交付物带着全部「引擎产出」的特征,而 backend 的 `ListWorkspaceFiles(out/)` 照常收割。
// 这条路比模型自己手写 markdown **严格更好**(registry.ts 上方注释记着 StatReport 存在之前
// 模型就是那么干的),所以它一定会被走。
//
// ⚠️ 不能用「重算 spec_hash」来堵:那是无密钥 sha256,模型自己算得出来;而且 report 只把它
//    当文件名词干用,连存不存在都不要求。这里选**路径闸** —— 保留区的物理边界已经在那儿了,
//    复用它比新引入一份密钥便宜、且不会过期。
// ⚠️ 用 `confinePath`(canonical)而不是字符串前缀:`analysis/../cooked.json` 与
//    `ln -s .. analysis/x` 两种绕法只有解完符号链接才拦得住。
// ⚠️ statkit 侧 `verbs/report.py:_assert_engine_bundle` 有同一道闸(纵深):命令行直跑、
//    以及将来任何新调用方都过得了这一关。两处缺一都不该省 —— 这里给模型可行动的回执,
//    那里保证「绕过工具层也没用」。
const statReportTool: BuiltinTool = {
  name: "StatReport",
  description:
    "Render the deliverables from a result bundle produced by StatRun: a Word three-line table (.docx), " +
    "a Markdown Results/Methods section, and a standalone reproduction script (analysis.py). " +
    "ALL numbers come from the bundle — you must NOT retype or reformat them yourself. " +
    "`system` is REQUIRED and has no default: p-value leading zeros, dispersion notation and decimals " +
    "conflict between publication systems, so picking one silently would be wrong for the others. " +
    "Ask the user which journal they are targeting first. " +
    "Switching systems later is just re-running this tool on the same bundle — no recomputation. " +
    "Input: { bundle (path under analysis/, from StatRun's bundle_path), system ('cn-core' | 'apa') }.",
  input_schema: {
    type: "object",
    properties: {
      bundle: { type: "string", description: "path to the bundle json, as returned by StatRun in bundle_path" },
      system: { type: "string", description: "'cn-core' for Chinese core journals / theses, 'apa' for APA 7" },
    },
    required: ["bundle", "system"],
  },
  parallelSafe: false,
  async run(input, ctx) {
    const gate = unsandboxedBashGate();
    if (!gate.ok) {
      return fail(
        "统计引擎需要沙箱环境,当前不可用。" + gate.reason,
        "统计分析环境暂不可用,本步骤已跳过。",
      );
    }
    // 🔴 bundle 只能来自引擎保留区。见本工具上方的长注释(端到端复现过的 P0)。
    let bundleRel: string;
    try {
      const canonRoot = await realpath(ctx.workDir);
      const canonBundle = await confinePath(ctx.workDir, String(input.bundle));
      const rel = relative(canonRoot, canonBundle);
      if (!rel.startsWith(ANALYSIS_DIR + "/") || !rel.endsWith(BUNDLE_SUFFIX)) {
        // 刻意用 ok() 而不是 fail():这是「引擎按设计给出的、带可行动理由的答复」,
        // 与守门拒绝同一档。标成错误会让模型以为工具坏了去重试(实测 AD-04 里它连试 3 次),
        // 而正确反应是回去调 StatRun。
        return ok(JSON.stringify({
          ok: false,
          reason: "bundle_not_from_engine",
          got: String(input.bundle),
          why_zh: `bundle 必须是引擎产出的那一份:落在 ${ANALYSIS_DIR}/ 下、以 ${BUNDLE_SUFFIX} 结尾。` +
            "StatReport 只负责把 StatRun 的结果**格式化**,它不接受在引擎之外拼出来的数字 —— " +
            "否则「交付物里的每个数字都由确定性引擎算出」这句话就不成立。",
          hint_zh: "先调 StatRun,把它回的 bundle_path **原样**传进来。" +
            "不要自己拼 bundle,也不要把它复制到别的目录。",
        }, null, 2));
      }
      bundleRel = rel;
    } catch (e) {
      // confinePath 抛错 = 路径逃出会话目录(含 symlink 逃逸)。同样是可行动答复,不是故障。
      return ok(JSON.stringify({
        ok: false, reason: "bundle_path_rejected", got: String(input.bundle),
        why_zh: "该路径不在本次会话的工作目录内:" + String((e as Error)?.message ?? e),
        hint_zh: "用 StatRun 回的 bundle_path(形如 `analysis/<hash>.bundle.json`)。",
      }, null, 2));
    }

    const profile: SandboxProfile = profileFor({ workDir: ctx.workDir, net: "none", allowBash: true });
    const args = ["python3", "-P", "-m", "statkit", "report",
      "--bundle", bundleRel, "--system", String(input.system), "--workdir", "."];
    const argv = sandboxMode() === "bwrap" ? buildBwrapArgv(profile, args) : args;
    const proc = Bun.spawn(argv, { cwd: ctx.workDir, stdout: "pipe", stderr: "pipe", env: bashEnv() });
    const killer = setTimeout(() => { try { proc.kill(); } catch { /* noop */ } }, 300_000);
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    const code = await proc.exited;
    clearTimeout(killer);

    // 与 StatRun 同口径:退出码 2 是「引擎按设计给出的带理由的答复」(例如未知体系),
    // 不是工具故障。标成 isError 会让模型以为坏了而反复重试。
    if (code === 2) return ok(out.trim() || err.trim() || "statkit report rejected the request");
    if (code !== 0) {
      return fail("报告渲染失败(exit " + code + "):\n" + (err.trim() || out.trim()).slice(0, 4000));
    }
    return ok(stripStatReportPaths(out.trim()));
  },
};

/**
 * 把 statkit report 的成功回执里的**路径键**换成不含路径的交付清单(2026-08-07 · A2)。
 *
 * 🔴 为什么必须在这里做:生产实测 221 个「正文出现 out/」的轮里 **201 轮来自 stat_lab**,
 *    而它们的直接燃料就是这份回执 —— 它原样回给模型
 *      {"table_docx":"out/table1_cn-core_7227ab2adcf1.docx", "results_md":"out/...", "analysis_py":"out/..."}
 *    模型要向用户交代成果时,手里**除了这三个路径没有别的名字可用**,于是照抄。
 *    这不是模型不听话:提示词一边禁止它说路径,一边只给它路径,是个无解约束。
 *    正确的修法是**给它一个合法的替代品**:文件的中文标题(与用户在产物卡上看到的同一个词)。
 *
 * 🔴 为什么不在 runTools 的 tool_result 咽喉点统一做:那里是**全部工具**(含 Read/Glob/Grep/Bash/MCP)
 *    的唯一出口,在那儿做正则改写等于篡改模型的读盘结果 —— 下一次 Edit 的 old_string 会对不上,
 *    sci_draw 的 Bash 车道也拼不出 `python3 out/x.py`。脱敏只在**产出交付物的那几个工具**自己的
 *    回执组装处做,是白名单不是黑名单。
 *
 * 解析失败一律原样返回:这条链路上「少脱敏一次」远好于「把回执搞坏让整个 stat_lab 哑掉」。
 */
export function stripStatReportPaths(raw: string): string {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw; // 不是 JSON(理论上不会) → 原样,宁可漏脱敏也不弄坏回执
  }
  if (!j || typeof j !== "object" || Array.isArray(j) || j.ok === false) return raw;

  const delivered: Array<{ title: string; format: string }> = [];
  const take = (key: string, format: string) => {
    const v = j[key];
    if (typeof v === "string" && v) {
      const base = v.split("/").pop() || v;
      const dot = base.lastIndexOf(".");
      delivered.push({ title: dot > 0 ? base.slice(0, dot) : base, format });
    }
    delete j[key];
  };
  take("table_docx", "docx");
  take("results_md", "md");
  take("analysis_py", "py");
  if (delivered.length === 0) return raw; // 没识别出任何交付物 → 别自作主张改结构

  j.delivered = delivered;
  // 明确告诉模型「这些已经交给用户了、该怎么称呼它们」——正面替代品,不是又一条禁令。
  j.delivery_note_zh =
    "以上交付物已自动呈现为用户可下载的卡片。向用户交代时**用 delivered[].title 里的中文名**" +
    "(那正是用户在卡片上看到的字),不要提任何目录、路径或文件系统位置。";
  return JSON.stringify(j, null, 2);
}

const all: BuiltinTool[] = [statRunTool, statReportTool, readTool, readDocumentTool, exportDocumentTool, buildDeckTool, writeTool, editTool, globTool, grepTool, bashTool, todayDateTool, skillTool, toolSearchTool, toolInvokeTool, askUserQuestionTool, evidenceGetTool, submitAnswerTool, declareInsufficientTool];

export const builtinRegistry: Map<string, BuiltinTool> = new Map(all.map((t) => [t.name, t]));

export function isBuiltinTool(name: string): boolean {
  return builtinRegistry.has(name);
}
