// Clean-room built-in 工具(详细设计 §2.1 tools/)。全部 cwd-confined。
// 这些是 Scholay 自有实现,**非** cc-haha 工具移植。smart_search 不用(MCP-only);
// claw(+bash)/prism(file-edit)在 step 7 全面启用 + sandbox 加固(step 8 bwrap)。

import { resolve, relative, dirname, join } from "node:path";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { wrapBash } from "../sandbox/bwrap.ts";
import { profileFor, unsandboxedBashGate } from "../sandbox/profile.ts";
import { confinePath } from "../sandbox/confine.ts";
import { beijingNow } from "./clock.ts";
import { log } from "../obs/log.ts";

export interface ToolCtx {
  workDir: string;
  allowBash: boolean;
  net: "open" | "none";
  // --add-dir 目录:Skill 工具据此定位 <dir>/guides/<name>/SKILL.md(按需技能正文)。
  // 其它工具不用;可空(无按需技能的会话)。
  addDirs?: string[];
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
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
function fail(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

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
function bashEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const pass = ["PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TERM", "TZ", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy"];
  for (const k of pass) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  if (!out.PATH) out.PATH = "/usr/local/bin:/usr/bin:/bin";
  return out;
}

// 参数名沿用 Claude Code 约定 file_path:① 模型对该 schema 最熟悉,工具调用更稳;
// ② 前端 claw 认领产物卡片靠 tool.input.file_path(MessageTurn.extractTurnArtifacts)。
const readTool: BuiltinTool = {
  name: "Read",
  description:
    "Read a UTF-8 text file within the session working directory. Binary files (PDF, Office docs, etc.) are NOT supported directly — convert them to text first via Bash (e.g. `pdftotext`, or python-docx/openpyxl), then Read the output. For large files, pass offset/limit (1-based line number + line count) to read a narrower section.",
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
        const hint = lower.endsWith(".pdf")
          ? " This is a PDF — extract its text with `pdftotext '<file>' -` via Bash, then Read the output (or redirect to a .txt)."
          : /\.(docx|pptx|xlsx|odt|rtf)$/.test(lower)
            ? " This is an Office document — convert it to text via Bash (python-docx / python-pptx / openpyxl), then Read the output."
            : " This is a binary file; Read only supports UTF-8 text. Convert it to text via Bash first.";
        return fail("read failed: binary file not supported." + hint);
      }
      let text = buf.toString("utf8");
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
        return ok(text);
      }
      if (buf.length > MAX_READ_BYTES) {
        text =
          text.slice(0, MAX_READ_BYTES) +
          `\n\n[... truncated: file is ${buf.length} bytes, showing first ${MAX_READ_BYTES}. Use Grep or Read with offset/limit to read a narrower section.]`;
      }
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
  description: "Replace the first occurrence of old_string with new_string in a file (exact match).",
  input_schema: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  parallelSafe: false,
  async run(input, ctx) {
    try {
      const p = await confinePath(ctx.workDir, String(input.file_path), true);
      const cur = await readFile(p, "utf8");
      const oldS = String(input.old_string);
      const idx = cur.indexOf(oldS);
      if (idx < 0) return fail("edit failed: old_string not found");
      const next = cur.slice(0, idx) + String(input.new_string) + cur.slice(idx + oldS.length);
      await writeFile(p, next, "utf8");
      return ok("edited " + String(input.file_path));
    } catch (e) {
      return fail("edit failed: " + String((e as Error)?.message ?? e));
    }
  },
};

const globTool: BuiltinTool = {
  name: "Glob",
  description: "List files matching a glob pattern within the session working directory.",
  input_schema: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] },
  parallelSafe: true,
  async run(input, ctx) {
    try {
      const glob = new Bun.Glob(String(input.pattern));
      const out: string[] = [];
      for await (const f of glob.scan({ cwd: ctx.workDir, onlyFiles: true, dot: false })) {
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
            try {
              const st = await stat(full);
              if (st.size > 2_000_000) continue;
              const text = await readFile(full, "utf8");
              text.split("\n").forEach((line, i) => {
                if (matches.length < 200 && re.test(line)) {
                  matches.push(relative(ctx.workDir, full) + ":" + (i + 1) + ": " + line.trim().slice(0, 200));
                }
              });
            } catch {
              /* skip binary/unreadable */
            }
          }
        }
      };
      await walk(root);
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
    if (!ctx.allowBash) return fail("bash not permitted for this feature");
    // 生产 secure-by-default:未沙箱化的 Bash 在多租户下会跨会话读文件 / 经 /proc 偷密钥,拒绝执行。
    // 能力本身保留 —— 开 bwrap(EXECUTOR_SANDBOX_MODE=bwrap)或显式放行(EXECUTOR_ALLOW_UNSANDBOXED_BASH=1)即恢复。
    const gate = unsandboxedBashGate();
    if (!gate.ok) return fail("bash disabled: " + gate.reason);
    try {
      // SANDBOX_MODE=bwrap(仅生产真内核)→ 包进 bubblewrap jail;none(本机/默认)→ 直跑。
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
      const [out, errOut, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      clearTimeout(killer);
      const body = (out + (errOut ? "\n[stderr]\n" + errOut : "")).slice(0, 60_000);
      return code === 0 ? ok(body || "(no output)") : fail("exit " + code + "\n" + body);
    } catch (e) {
      return fail("bash failed: " + String((e as Error)?.message ?? e));
    }
  },
};

// TodayDate:查当前日期/时间(Asia/Shanghai)。零参数、只读、parallelSafe,对所有 feature 开放
// (不进任何 denylist)。system 里已有天粒度 dateLine 锚点;此工具补精确时刻 + 给模型一个
// 「主动核实时间」的确定性通道(治时间线幻觉:模型对"今年是哪年"拿不准时可自查,而非按训练截止猜)。
const todayDateTool: BuiltinTool = {
  name: "TodayDate",
  description:
    "Get today's date and the current time (Asia/Shanghai, UTC+8). The returned value is the authoritative current date — trust it over your training knowledge, e.g. when judging whether a publication year is plausible, converting \"recent N years\" into an absolute year range, or dating a document.",
  input_schema: { type: "object", properties: {} },
  parallelSafe: true,
  async run() {
    const d = beijingNow();
    return ok(
      `今天是 ${d.dateCN}(${d.weekday}),当前时间 ${d.time}(Asia/Shanghai,UTC+8)\nISO 日期: ${d.isoDate}`,
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

const all: BuiltinTool[] = [readTool, writeTool, editTool, globTool, grepTool, bashTool, todayDateTool, skillTool];

export const builtinRegistry: Map<string, BuiltinTool> = new Map(all.map((t) => [t.name, t]));

export function isBuiltinTool(name: string): boolean {
  return builtinRegistry.has(name);
}
