// Clean-room built-in 工具(详细设计 §2.1 tools/)。全部 cwd-confined。
// 这些是 Scholay 自有实现,**非** cc-haha 工具移植。smart_search 不用(MCP-only);
// claw(+bash)/prism(file-edit)在 step 7 全面启用 + sandbox 加固(step 8 bwrap)。

import { resolve, relative, dirname, join, basename } from "node:path";
import { readFile, writeFile, mkdir, readdir, stat, realpath } from "node:fs/promises";
import { wrapBash, buildBwrapArgv, sandboxMode } from "../sandbox/bwrap.ts";
import { profileFor, unsandboxedBashGate } from "../sandbox/profile.ts";
import { confinePath } from "../sandbox/confine.ts";
import { localNow } from "./clock.ts";
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
        const hint = lower.endsWith(".pdf")
          ? " This is a PDF — use the ReadDocument tool (pass first_pages to limit scope for long PDFs)."
          : /\.(docx|odt|rtf|epub)$/.test(lower)
            ? " This is an Office/rich document — use the ReadDocument tool to extract its text."
            : " This is a binary file; Read only supports UTF-8 text. If it is a document, try ReadDocument.";
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
    // 能力本身保留 —— 沙箱自探成功即自动恢复(修容器 seccomp);或显式放行(EXECUTOR_ALLOW_UNSANDBOXED_BASH=1,生产被硬锁)。
    const gate = unsandboxedBashGate();
    if (!gate.ok) return fail("bash disabled: " + gate.reason);
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
      return code === 0 ? ok(body || "(no output)") : fail("exit " + code + "\n" + body);
    } catch (e) {
      return fail("bash failed: " + String((e as Error)?.message ?? e));
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
): Promise<{ ok: boolean; text: string; err: string }> {
  if (sandboxMode() !== "bwrap") {
    const gate = unsandboxedBashGate();
    if (!gate.ok) {
      return { ok: false, text: "", err: "导出沙箱不可用,已按 secure-by-default 拒绝(" + gate.reason + ")" };
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

// ReadDocument:从二进制文档(PDF / .docx / .odt / .rtf / .epub / .html …)抽取纯文本。
// 用**已装好的顶级开源转换器**(pandoc = 文档转换标杆;poppler pdftotext = PDF 抽取事实标准),
// 但把它们关进一个安全受限的门:路径 confine 在会话 cwd、固定 argv、无 shell —— 取代过去"让模型
// 用 Bash 调 pandoc"的路径。因安全性由构造保证(模型控不了命令、读不到跨租户文件 / proc),
// **不需要 allowBash / 沙箱闸**,对所有 feature 开放(claw/prism/smart_search/peerreview 上传的稿件都能读)。
const readDocumentTool: BuiltinTool = {
  name: "ReadDocument",
  description:
    "Extract plain text from a binary document (PDF, .docx, .odt, .rtf, .epub, .html) in the session working directory. " +
    "Use this INSTEAD of Read for non-plain-text documents — Read only handles UTF-8 text and will fail on binaries. " +
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
      } else if (/\.(docx|odt|rtf|epub|html?|md|markdown|tex|latex)$/.test(lower)) {
        // pandoc:-t plain 纯文本;--wrap=none 不硬折行;--sandbox 禁止 pandoc 处理时读输入里引用的
        // 任意本地文件(crafted docx/html 的 XXE 式外泄防护,confinePath 之外的第二层)。
        argv = ["pandoc", "--sandbox", p, "-t", "plain", "--wrap=none"];
      } else {
        return fail(
          "ReadDocument: unsupported extension. Supported: .pdf, .docx, .odt, .rtf, .epub, .html. " +
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
          `\n\n[... truncated at ${MAX_DOC_CHARS} chars. For PDFs pass first_pages to narrow the range.]`;
      }
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
  } else if (/\.(docx|odt|rtf|epub|html?|md|markdown|tex|latex)$/.test(lower)) {
    argv = ["pandoc", "--sandbox", absPath, "-t", "plain", "--wrap=none"];
  } else {
    return {
      ok: false,
      text: "",
      truncated: false,
      err: "unsupported extension (supported: .pdf, .docx, .odt, .rtf, .epub, .html)",
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
      const argv = ["pandoc", src, "-o", outAbs, "-t", fmt.pandocTo];
      if (fmt.needsEngine && PDF_ENGINE) argv.push(`--pdf-engine=${PDF_ENGINE}`);
      const res = await runConverterConfined(ctx.workDir, argv);
      if (!res.ok) {
        if (fmt.needsEngine) {
          return fail(
            "ExportDocument: PDF export is unavailable (no PDF engine installed). " +
              "Export to docx / odt / html instead, or ask the operator to enable a PDF engine. Detail: " + res.err,
          );
        }
        return fail("ExportDocument: conversion failed (pandoc): " + res.err);
      }
      const st = await stat(outAbs).catch(() => null);
      if (!st || st.size === 0) return fail("ExportDocument: pandoc produced an empty file.");
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

const all: BuiltinTool[] = [readTool, readDocumentTool, exportDocumentTool, writeTool, editTool, globTool, grepTool, bashTool, todayDateTool, skillTool];

export const builtinRegistry: Map<string, BuiltinTool> = new Map(all.map((t) => [t.name, t]));

export function isBuiltinTool(name: string): boolean {
  return builtinRegistry.has(name);
}
