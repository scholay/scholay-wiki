// HTTP 路由(镜像 agent.Client 的契约,详细设计 §5.2)。
//
// 错误信封统一 { error, message } —— 保 backend 的 HTTPError 解析器(client.go)。
// 404 → ErrSessionNotFound 形状。
//
// P3 step 3 范围:/health + /api/providers* + /api/models(provider 管道,无 loop)。
// session / workspace / chat / ws 路由 step 4-7 落地,当前返 501 not_implemented。

import { authOK } from "../auth.ts";
import { log } from "../obs/log.ts";
import { localISO } from "../tools/clock.ts";
import { validSessionId, confinePath } from "../sandbox/confine.ts";
import {
  listProviders,
  findByName,
  createProvider,
  updateProvider,
  activateProvider,
} from "../config/providerStore.ts";
import { listModels } from "../config/models.ts";
import { invalidateClient } from "../anthropic/client.ts";
import {
  createSession,
  deleteSession,
  getOrCreateEphemeral,
  getSession,
  setTitle,
  listSessions,
  sessionFlatMessages,
} from "./sessions.ts";
import { runShadowTurn, type ShadowTurnRequest } from "./shadowTurn.ts";
import {
  readWorkspaceFile,
  listWorkspaceTree,
  putWorkspaceFile,
  deleteWorkspaceFile,
  pushSessionFile,
} from "./workspace.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function err(status: number, error: string, message: string): Response {
  return json({ error, message }, status);
}

export async function handleHTTP(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // 健康检查不鉴权(与 fork 一致,供 docker healthcheck 用)
  if (path === "/health" && method === "GET") {
    return json({ status: "ok", timestamp: localISO() });
  }

  if (!authOK(req)) {
    return err(401, "unauthorized", "invalid or missing bearer token");
  }

  // ── 数学公式渲染(TeX → PNG;小程序 rich-text 跑不了 KaTeX,后端代理到这)──
  // 懒加载 MathJax/resvg-wasm:只在首次渲染时载入,不拖慢 agent 冷启动,也隔离加载失败。
  if (path === "/render/math" && method === "POST") {
    const body = (await req.json().catch(() => null)) as { tex?: string; display?: boolean } | null;
    if (!body || typeof body.tex !== "string" || !body.tex.trim()) {
      return err(400, "bad_request", "tex required");
    }
    try {
      const { renderMath } = await import("../render/math.ts");
      const out = await renderMath(body.tex, body.display !== false);
      return json(out);
    } catch (e) {
      log.error("math render failed", { err: String((e as Error)?.message ?? e) });
      return err(422, "render_failed", "failed to render formula");
    }
  }

  // ── mermaid 图表渲染(headless Chromium → PNG;小程序无 DOM 跑不了 mermaid)──
  // 解析失败回 422(前端回退成源码卡);渲染纯函数,后端 Redis 长缓存。
  if (path === "/render/mermaid" && method === "POST") {
    const body = (await req.json().catch(() => null)) as { code?: string } | null;
    if (!body || typeof body.code !== "string" || !body.code.trim()) {
      return err(400, "bad_request", "code required");
    }
    try {
      const { renderMermaid } = await import("../render/mermaid.ts");
      const out = await renderMermaid(body.code);
      return json(out);
    } catch (e) {
      const status = (e as Error & { status?: number })?.status;
      log.error("mermaid render failed", { err: String((e as Error)?.message ?? e) });
      if (status === 422) return err(422, "render_failed", "invalid mermaid code");
      return err(500, "render_failed", "failed to render diagram");
    }
  }

  // ── provider 管道(PushConfig 注入点)──
  if (path === "/api/providers" && method === "GET") {
    const { providers, activeId } = listProviders();
    // H5:绝不回吐明文 apiKey(此端点暴露面广;Go 控制面持有真源,无需读回)。
    const safe = providers.map((p) => ({ ...p, apiKey: p.apiKey ? "***redacted***" : "" }));
    return json({ providers: safe, activeId });
  }

  if (path === "/api/providers" && method === "POST") {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return err(400, "bad_request", "invalid json body");
    const p = createProvider({
      presetId: String(body.presetId ?? "custom"),
      name: String(body.name ?? ""),
      apiKey: String(body.apiKey ?? ""),
      baseUrl: String(body.baseUrl ?? ""),
      apiFormat: String(body.apiFormat ?? "anthropic"),
      reasoningReplay: body.reasoningReplay === true,
      authStrategy: String(body.authStrategy ?? "auth_token"),
      models: normalizeModels(body.models),
      notes: body.notes ? String(body.notes) : undefined,
    });
    invalidateClient();
    log.info("provider created", { provider_id: p.id, name: p.name, base_url: p.baseUrl });
    return json({ provider: p });
  }

  const provMatch = path.match(/^\/api\/providers\/([^/]+)$/);
  if (provMatch && method === "PUT") {
    const id = decodeURIComponent(provMatch[1]);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return err(400, "bad_request", "invalid json body");
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = String(body.name);
    if (body.apiKey !== undefined) patch.apiKey = String(body.apiKey);
    if (body.baseUrl !== undefined) patch.baseUrl = String(body.baseUrl);
    if (body.apiFormat !== undefined) patch.apiFormat = String(body.apiFormat);
    if (body.reasoningReplay !== undefined) patch.reasoningReplay = body.reasoningReplay === true;
    if (body.authStrategy !== undefined) patch.authStrategy = String(body.authStrategy);
    if (body.models !== undefined) patch.models = normalizeModels(body.models);
    if (body.notes !== undefined) patch.notes = String(body.notes);
    const p = updateProvider(id, patch);
    if (!p) return err(404, "not_found", "provider not found");
    invalidateClient();
    log.info("provider updated", { provider_id: p.id, name: p.name, base_url: p.baseUrl });
    return json({ provider: p });
  }

  const actMatch = path.match(/^\/api\/providers\/([^/]+)\/activate$/);
  if (actMatch && method === "POST") {
    const id = decodeURIComponent(actMatch[1]);
    if (!activateProvider(id)) return err(404, "not_found", "provider not found");
    invalidateClient();
    log.info("provider activated", { provider_id: id });
    return json({ ok: true });
  }

  if (path === "/api/models" && method === "GET") {
    return json(listModels());
  }

  // ── session lifecycle(step 5)──
  if (path === "/api/sessions" && method === "POST") {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const meta = await createSession({
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
      workDir: body.workDir ? String(body.workDir) : undefined,
      disallowedTools: Array.isArray(body.disallowedTools) ? (body.disallowedTools as string[]) : undefined,
      addDirs: Array.isArray(body.addDirs) ? (body.addDirs as string[]) : undefined,
      appendSystemPrompt: body.appendSystemPrompt ? String(body.appendSystemPrompt) : undefined,
      // 用户市场 skill(内联内容),executor 物化到 <workDir>.skills/guides/ 并并入 addDirs。
      skills: Array.isArray(body.skills) ? (body.skills as { name: string; skillMd: string }[]) : undefined,
    });
    log.info("session created", { session_id: meta.sessionId, work_dir: meta.workDir, deny: meta.disallowedTools.length });
    return json({ sessionId: meta.sessionId, workDir: meta.workDir });
  }

  // ── 无状态一次性 turn(step 6 shadow 对账 / 未来 cutover「后端喂 history」)──
  if (path === "/api/turn" && method === "POST") {
    const body = (await req.json().catch(() => null)) as ShadowTurnRequest | null;
    if (!body || typeof body.content !== "string") return err(400, "bad_request", "content required");
    const result = await runShadowTurn(body);
    return json(result);
  }

  // GET /api/sessions(列会话,migration-compat)
  if (path === "/api/sessions" && method === "GET") {
    const idsParam = url.searchParams.get("ids");
    const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const metas = listSessions(ids);
    return json({ sessions: metas.map((m) => ({ sessionId: m.sessionId, title: m.title || "" })) });
  }

  const sessMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessMatch && !validSessionId(decodeURIComponent(sessMatch[1]))) {
    return err(404, "not_found", "session not found"); // H4:挡 ..%2f 之类穿越
  }
  if (sessMatch && method === "DELETE") {
    const id = decodeURIComponent(sessMatch[1]);
    const okDel = await deleteSession(id);
    if (!okDel) return err(404, "not_found", "session not found");
    return json({ ok: true });
  }
  if (sessMatch && method === "PATCH") {
    const id = decodeURIComponent(sessMatch[1]);
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    setTitle(id, String(body.title ?? ""));
    return json({ ok: true });
  }

  // GET /api/sessions/:id/messages — 执行器不拥有 transcript(耐久真源=后端 journal)。
  // 返回会话内内存视图(扁平形);主要供记忆抽取 transcript。AGENT_JOURNAL_READ 开后后端读 journal。
  const msgMatch = path.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (msgMatch && method === "GET") {
    const id = decodeURIComponent(msgMatch[1]);
    if (!validSessionId(id)) return json({ messages: [], totalTurns: 0 }); // H4
    const meta = getSession(id);
    if (!meta) return json({ messages: [], totalTurns: 0 });
    return json(sessionFlatMessages(meta));
  }

  // ── 会话作用域:workspace 文件 op + inspection(step 7a)──
  const wsMatch = path.match(/^\/api\/sessions\/([^/]+)\/(files|workspace\/file|workspace\/tree|inspection|extract-head)$/);
  if (wsMatch) {
    const sid = decodeURIComponent(wsMatch[1]);
    if (!validSessionId(sid)) return err(404, "not_found", "session not found"); // H4:挡 ..%2f 穿越
    const sub = wsMatch[2];
    const meta = await getOrCreateEphemeral(sid);
    const rel = url.searchParams.get("path") || "";

    if (sub === "files" && method === "POST") {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) return err(400, "bad_request", "multipart field 'file' required");
      const pushed = await pushSessionFile(meta.workDir, file);
      return json(pushed);
    }
    if (sub === "workspace/file" && method === "GET") {
      const out = await readWorkspaceFile(meta.workDir, rel, {
        full: url.searchParams.get("full") === "1",
        raw: url.searchParams.get("raw") === "1",
      });
      return json(out);
    }
    if (sub === "workspace/file" && method === "PUT") {
      const bytes = new Uint8Array(await req.arrayBuffer());
      try {
        await putWorkspaceFile(meta.workDir, rel, bytes);
      } catch (e) {
        return err(400, "bad_request", String((e as Error)?.message ?? e));
      }
      return json({ ok: true });
    }
    if (sub === "workspace/file" && method === "DELETE") {
      try {
        await deleteWorkspaceFile(meta.workDir, rel);
      } catch (e) {
        return err(400, "bad_request", String((e as Error)?.message ?? e));
      }
      return json({ ok: true });
    }
    if (sub === "workspace/tree" && method === "GET") {
      return json(await listWorkspaceTree(meta.workDir, url.searchParams.get("path") || "."));
    }
    if (sub === "inspection" && method === "GET") {
      const u = meta.lastUsage;
      const total = u ? u.input_tokens + u.output_tokens : 0;
      const max = Number(process.env.EXECUTOR_CONTEXT_WINDOW || 128000);
      return json({
        totalTokens: total,
        maxTokens: max,
        percentage: max > 0 ? Math.round((total / max) * 100) : 0,
        model: u?.model || "",
      });
    }
    // 文档头有界抽取(审稿「预识别」用):对已推进 cwd 的稿件做 pdftotext -l N / pandoc+硬截,
    // 返回小段头文本。后端把它内联进 meta prompt,agent 那轮不再自己 ReadDocument 读全文 → token 由构造钳死。
    // 无状态、无 LLM,纯转换器;auth 已由上方 authOK 守卫,路径经 confinePath 限制在会话 cwd。
    if (sub === "extract-head" && method === "POST") {
      const body = (await req.json().catch(() => null)) as
        | { path?: string; pdfPages?: number; maxChars?: number }
        | null;
      if (!body || typeof body.path !== "string" || !body.path.trim()) {
        return err(400, "bad_request", "path required");
      }
      let abs: string;
      try {
        abs = await confinePath(meta.workDir, body.path);
      } catch (e) {
        return err(400, "bad_request", "invalid path: " + String((e as Error)?.message ?? e));
      }
      const { extractDocHead } = await import("../tools/registry.ts");
      const r = await extractDocHead(abs, {
        pdfPages: typeof body.pdfPages === "number" ? body.pdfPages : undefined,
        maxChars: typeof body.maxChars === "number" ? body.maxChars : undefined,
      });
      if (!r.ok) return err(422, "extract_failed", r.err);
      return json({ text: r.text, truncated: r.truncated });
    }
    return err(405, "method_not_allowed", method + " " + path);
  }

  // ── 尚未实现(step 7b):chat / chat/status(peerreview server-side)、messages / patch / list ──
  if (path.startsWith("/api/")) {
    return err(501, "not_implemented", "endpoint not implemented yet: " + method + " " + path);
  }

  return err(404, "not_found", "unknown route: " + method + " " + path);
}

function normalizeModels(raw: unknown): { main: string; haiku: string; sonnet: string; opus: string } {
  const m = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const main = String(m.main ?? "");
  return {
    main,
    haiku: String(m.haiku ?? main),
    sonnet: String(m.sonnet ?? main),
    opus: String(m.opus ?? main),
  };
}
