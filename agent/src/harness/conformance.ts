// step 4 一致性 harness:在执行器进程内跑一整轮(无 WS),对真 DeepSeek + Minicod MCP,
// 验证 clean-room turnLoop 产出正确中性帧 + 真实搜索结果 + 连贯回答。
//
// 跑法(executor 容器内,带 DeepSeek + Minicod 凭证):
//   docker exec -e PROBE_BASE_URL=.. -e PROBE_TOKEN=.. -e PROBE_MODEL=.. -e MINICOD_API_KEY=.. \
//     scholar_agent_executor bun run src/harness/conformance.ts

import { createProvider, activateProvider } from "../config/providerStore.ts";
import { invalidateClient } from "../anthropic/client.ts";
import { prewarm } from "../mcp/minicodClient.ts";
import { runTurn } from "../turn/turnLoop.ts";
import type { EventSink, TurnInput } from "../turn/types.ts";

const BASE = process.env.PROBE_BASE_URL || "";
const TOKEN = process.env.PROBE_TOKEN || "";
const MODEL = process.env.PROBE_MODEL || "deepseek-v4-pro";

if (!BASE || !TOKEN) {
  console.log("HARNESS " + JSON.stringify({ error: "missing PROBE_BASE_URL/PROBE_TOKEN" }));
  process.exit(1);
}

const p = createProvider({
  presetId: "custom",
  name: "scholay-managed",
  apiKey: TOKEN,
  baseUrl: BASE,
  apiFormat: "anthropic",
  authStrategy: "auth_token",
  models: { main: MODEL, haiku: MODEL, sonnet: MODEL, opus: MODEL },
});
activateProvider(p.id);
invalidateClient();

await prewarm();

const frames: Record<string, number> = {};
const toolNames: string[] = [];
let text = "";
let searchHadItems = false;

const sink: EventSink = {
  frame(f) {
    const t = String(f.type);
    frames[t] = (frames[t] || 0) + 1;
    if (t === "tool_use_complete") toolNames.push(String((f as Record<string, unknown>).toolName));
    if (t === "content_delta" && typeof (f as Record<string, unknown>).text === "string") {
      text += (f as Record<string, unknown>).text as string;
    }
    if (t === "tool_result") {
      const c = JSON.stringify((f as Record<string, unknown>).content ?? "");
      if (c.includes("title") || c.includes("items") || c.includes("abstract")) searchHadItems = true;
    }
  },
  error(message, code) {
    frames["error"] = (frames["error"] || 0) + 1;
    console.log("SINK_ERROR " + (code ?? "") + " " + message);
  },
  async requestPermission() {
    return true; // 控制面模拟:自动批
  },
};

const input: TurnInput = {
  sessionId: "conformance-" + process.pid,
  messages: [{ role: "user", content: "搜索一篇 transformer 注意力机制的代表性论文,简要说明它的贡献" }],
  tier: "main",
  disallowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"], // MCP-only(smart_search 画像)
  workDir: "/tmp",
  allowBash: false,
  net: "open",
};

const t0 = Date.now();
try {
  await runTurn(input, sink);
} catch (e) {
  console.log("HARNESS " + JSON.stringify({ error: String((e as Error)?.message ?? e), frames }));
  process.exit(1);
}
console.log(
  "HARNESS " +
    JSON.stringify({
      elapsedMs: Date.now() - t0,
      frames,
      toolNames,
      searchHadItems,
      textSample: text.slice(0, 220),
    }),
);
process.exit(0);
