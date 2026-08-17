import { ws } from "msw";
import { mockPapers } from "./fixtures";
import { getMockScenario } from "./config";
import { updateMockDatabase } from "./database";

const MINICOD_SEARCH_TOOL = "mcp__minicod__search_papers";

const appSockets = ws.link(/\/api\/v1\/(?:ws(?:\?|$)|user\/.+\/ws(?:\/|$))/);

type MockClient = { send: (data: string) => void };

function sendJson(client: MockClient, value: unknown) {
  try {
    client.send(JSON.stringify(value));
  } catch {
    // 连接已关时忽略 —— 独立 timer 尾巴不应打崩 mock。
  }
}

function schedule(client: MockClient, delayMs: number, value: unknown) {
  globalThis.setTimeout(() => sendJson(client, value), delayMs);
}

/**
 * Agent 与通知共用一个浏览器内 WS 服务。协议仍走真实 useAgentSocket 状态机，
 * 因此产品设计时可以调试连接态、流式气泡、工具结果与终态，而不是绕过 UI 逻辑。
 *
 * 实现要点:
 * - 用独立 setTimeout 排程(不要 await 长链):断连后旧 timer 只是 send 失败,不会把
 *   「整段流」用 epoch 一把掐死;否则懒新建后若短暂重连,UI 会永远停在「AI 思考中」。
 * - 建连同步发 resync_end{inFlight:false}:重连后收口「终帧丢失」的卡死轮。
 *   前端在 pendingSend / ackWait 未清时会跳过该信号,不误伤首条即将发出的消息。
 */
export const mockWebSocketHandler = appSockets.addEventListener(
  "connection",
  ({ client }) => {
    const url = new URL(client.url);
    const notificationSocket = url.pathname === "/api/v1/ws";
    const sessionId =
      url.pathname.split("/").filter(Boolean).at(-1) ?? "mock-session";

    if (notificationSocket) {
      client.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string };
          if (message.type === "ping") sendJson(client, { type: "pong" });
        } catch {
          // 非 JSON 心跳忽略。
        }
      });
      schedule(client, 80, { type: "unread_count", data: { count: 2 } });
      return;
    }

    // 仅用于 stop / 新一轮 user_message 作废尚未发出的 timer 回调。
    let generation = 0;
    const stillCurrent = (gen: number) => gen === generation;

    sendJson(client, { type: "connected", sessionId });
    // 重连收口:无在途回放 → inFlight=false。必须同步发在首条 client 消息之前。
    sendJson(client, { type: "resync_end", inFlight: false });
    schedule(client, 40, {
      type: "runtime_config_updated",
      modelId: "scholay-reasoner",
      isDefault: true,
    });

    client.addEventListener("message", (event) => {
      let message: {
        type?: string;
        content?: string;
        clientTurnId?: string;
        modelId?: string;
        useDefault?: boolean;
      };
      try {
        message = JSON.parse(String(event.data)) as typeof message;
      } catch {
        return;
      }

      if (message.type === "ping") {
        sendJson(client, { type: "pong" });
        return;
      }
      if (message.type === "set_runtime_config") {
        sendJson(client, {
          type: "runtime_config_updated",
          modelId: message.modelId ?? "scholay-reasoner",
          isDefault: message.useDefault === true,
        });
        return;
      }
      if (message.type === "stop_generation") {
        generation += 1;
        sendJson(client, {
          type: "error",
          code: "interrupted",
          message: "已停止本轮生成",
        });
        return;
      }
      if (message.type !== "user_message") return;

      const content = message.content?.trim() || "请基于当前材料继续分析";
      const turnId = message.clientTurnId ?? `mock-turn-${Date.now()}`;
      sendJson(client, { type: "user_ack", clientTurnId: turnId });

      if (getMockScenario() === "quota") {
        schedule(client, 50, {
          type: "error",
          code: "quota_exceeded",
          message: "Mock 场景：本周期 AI 额度已用完",
        });
        return;
      }

      generation += 1;
      const gen = generation;
      runAgentStream({
        client,
        pathname: url.pathname,
        sessionId,
        content,
        turnId,
        emit: (delayMs, value) => {
          globalThis.setTimeout(() => {
            if (!stillCurrent(gen)) return;
            sendJson(client, value);
          }, delayMs);
        },
      });
    });
  },
);

function runAgentStream(opts: {
  client: MockClient;
  pathname: string;
  sessionId: string;
  content: string;
  turnId: string;
  emit: (delayMs: number, value: unknown) => void;
}) {
  const { pathname, sessionId, content, turnId, emit } = opts;

  emit(30, {
    type: "status",
    state: "thinking",
    verb: "正在梳理研究问题",
  });

  const thinking = thinkingFor(pathname, content);
  const thinkChunks = chunkText(thinking, 28);
  thinkChunks.forEach((text, index) => {
    emit(70 + index * 22, { type: "thinking", text });
  });

  const afterThink = 90 + thinkChunks.length * 22;
  emit(afterThink, { type: "status", state: "streaming", verb: "正在回复" });
  emit(afterThink + 20, { type: "content_start", blockType: "text" });

  const response = responseFor(pathname, content);
  const chunks = chunkText(response, 22);
  chunks.forEach((text, index) => {
    emit(afterThink + 50 + index * 36, { type: "content_delta", text });
  });

  const afterText = afterThink + 70 + chunks.length * 36;

  if (pathname.includes("/smart-search/")) {
    const toolUseId = `mock-tool-${turnId}`;
    const papers = papersForQuery(content);
    emit(afterText, {
      type: "status",
      state: "tool_executing",
      verb: "正在检索相关论文",
    });
    emit(afterText + 30, {
      type: "content_start",
      blockType: "tool_use",
      toolName: MINICOD_SEARCH_TOOL,
      toolUseId,
    });
    emit(afterText + 45, {
      type: "tool_use_complete",
      toolName: MINICOD_SEARCH_TOOL,
      toolUseId,
      input: { query: content, limit: 4 },
    });
    emit(afterText + 90, {
      type: "tool_result",
      toolUseId,
      content: {
        items: papers,
        total: papers.length,
        offset: 0,
        limit: 4,
        sources_queried: ["stc"],
      },
      isError: false,
    });
    emit(afterText + 130, { type: "message_complete" });
    globalThis.setTimeout(
      () => persistTurn(sessionId, content, response),
      afterText + 130,
    );
    return;
  }

  if (pathname.includes("/boltslides/")) {
    emit(afterText, {
      type: "artifact",
      name: "trustworthy-agents-deck.html",
      path: "out/trustworthy-agents-deck.html",
      kind: "file",
      mime: "text/html",
      size: 28640,
    });
  } else if (pathname.includes("/sci-draw") || pathname.includes("/sci_draw")) {
    emit(afterText, {
      type: "artifact",
      name: "transformer-encoder.svg",
      path: "out/transformer-encoder.svg",
      kind: "file",
      mime: "image/svg+xml",
      size: 12840,
    });
  } else if (pathname.includes("/claw/")) {
    emit(afterText, {
      type: "artifact",
      name: "research-brief.md",
      path: "out/research-brief.md",
      kind: "file",
      mime: "text/markdown",
      size: 8420,
    });
  }

  emit(afterText + 40, { type: "message_complete" });
  globalThis.setTimeout(
    () => persistTurn(sessionId, content, response),
    afterText + 40,
  );
}

function persistTurn(sessionId: string, userText: string, assistantText: string) {
  const now = new Date().toISOString();
  updateMockDatabase((database) => {
    const session = database.agentSessions.find(
      (candidate) => candidate.sessionId === sessionId,
    );
    if (!session) return;
    const stamp = Date.now().toString(36);
    session.messages.push(
      {
        id: `${sessionId}-u-${stamp}`,
        type: "user",
        content: [{ type: "text", text: userText }],
        timestamp: now,
      },
      {
        id: `${sessionId}-a-${stamp}`,
        type: "assistant",
        content: [{ type: "text", text: assistantText }],
        timestamp: now,
        model: "scholay-reasoner",
      },
    );
    if (session.title === "新对话") {
      session.title = userText.slice(0, 28) || session.title;
    }
    session.updatedAt = now;
    session.active = true;
  });
}

function thinkingFor(pathname: string, prompt: string): string {
  if (pathname.includes("/smart-search/")) {
    return `先理解「${prompt.slice(0, 20)}」的检索意图,再决定数据源与筛选维度。`;
  }
  if (pathname.includes("/boltslides/")) {
    return `把「${prompt.slice(0, 20)}」拆成叙事主线:问题 → 证据 → 设计启示 → 下一步。`;
  }
  if (pathname.includes("/sci-draw") || pathname.includes("/sci_draw")) {
    return `确定图类型与视觉语法,保证双栏缩放下标签仍可读。`;
  }
  return `围绕「${prompt.slice(0, 24)}」整理论点、证据与可执行建议,先给结论再展开。`;
}

function responseFor(pathname: string, prompt: string): string {
  if (pathname.includes("/smart-search/")) {
    return `我先围绕「${prompt.slice(0, 28)}」做一轮文献检索，整理出高相关论文，再帮你归纳方法、证据和局限三个比较维度。`;
  }
  if (pathname.includes("/boltslides/")) {
    return `已将“${prompt.slice(0, 28)}”整理为一份 8 页演示结构：问题背景、研究缺口、方法框架、关键证据、案例、风险、设计原则与下一步。演示稿产物已在右侧面板准备好。`;
  }
  if (pathname.includes("/sci-draw") || pathname.includes("/sci_draw")) {
    return `我会用“输入材料 → 检索与分析 → 人工校验 → 可追溯输出”的四段式结构绘制科研工作流，并用虚线表示反馈与错误恢复路径。矢量图已生成，可在对话中预览或下载 SVG/PNG。`;
  }
  if (pathname.includes("/prism/")) {
    return `已阅读当前主文件。建议先强化引言中的研究缺口，再把三条设计原则改写成可检验的研究问题；我可以将修改以 diff 形式放入待应用区。`;
  }
  return `基于「${prompt.slice(0, 32)}」，我建议先明确研究问题和证据标准，再按主题聚类文献。\n\n**三条主线**\n1. **可追溯**：结论旁就地呈现来源谱系\n2. **可逆**：高影响操作提供预览与撤销\n3. **可校准**：把不确定性说成「该核对什么」\n\n右侧已附上一份研究简报草稿，你可以继续追问或让我改成投稿大纲。`;
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

/** Pick a small, stable paper slice; lightly bias toward query token overlap when present. */
function papersForQuery(query: string) {
  const tokens = query
    .toLowerCase()
    .split(/[\s,，。；;、]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return mockPapers.slice(0, 4);
  const scored = mockPapers
    .map((paper) => {
      const haystack = `${paper.title} ${paper.abstract ?? ""}`.toLowerCase();
      const score = tokens.reduce(
        (sum, token) => sum + (haystack.includes(token) ? 1 : 0),
        0,
      );
      return { paper, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score || b.paper.citationCount - a.paper.citationCount,
    );
  const matched = scored
    .filter((entry) => entry.score > 0)
    .map((entry) => entry.paper);
  return (matched.length > 0 ? matched : mockPapers).slice(0, 4);
}
