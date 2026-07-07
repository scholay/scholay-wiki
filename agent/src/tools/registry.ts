// Clean-room built-in 工具(详细设计 §2.1 tools/)。全部 cwd-confined。
// 这些是 Scholay 自有实现,**非** cc-haha 工具移植。smart_search 不用(MCP-only);
// claw(+bash)/prism(file-edit)在 step 7 全面启用 + sandbox 加固(step 8 bwrap)。

import { resolve, relative, dirname } from "node:path";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { wrapBash } from "../sandbox/bwrap.ts";
import { profileFor } from "../sandbox/profile.ts";
import { confinePath } from "../sandbox/confine.ts";

export interface ToolCtx {
  workDir: string;
  allowBash: boolean;
  net: "open" | "none";
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
    "Read a UTF-8 text file within the session working directory. Binary files (PDF, Office docs, etc.) are NOT supported directly — convert them to text first via Bash (e.g. `pdftotext`, or python-docx/openpyxl), then Read the output.",
  input_schema: { type: "object", properties: { file_path: { type: "string" } }, required: ["file_path"] },
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
      if (buf.length > MAX_READ_BYTES) {
        text =
          text.slice(0, MAX_READ_BYTES) +
          `\n\n[... truncated: file is ${buf.length} bytes, showing first ${MAX_READ_BYTES}. Use Grep or read a narrower section.]`;
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

const all: BuiltinTool[] = [readTool, writeTool, editTool, globTool, grepTool, bashTool];

export const builtinRegistry: Map<string, BuiltinTool> = new Map(all.map((t) => [t.name, t]));

export function isBuiltinTool(name: string): boolean {
  return builtinRegistry.has(name);
}
