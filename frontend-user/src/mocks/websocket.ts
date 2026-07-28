import { ws } from "msw";
import { mockPapers } from "./fixtures";
import { getMockScenario } from "./config";

const appSockets = ws.link(/\/api\/v1\/(?:ws(?:\?|$)|user\/.+\/ws(?:\/|$))/);

function sendJson(client: { send: (data: string) => void }, value: unknown) {
  client.send(JSON.stringify(value));
}

function schedule(
  client: { send: (data: string) => void },
  delay: number,
  value: unknown,
) {
  window.setTimeout(() => sendJson(client, value), delay);
}

/**
 * Agent 与通知共用一个浏览器内 WS 服务。协议仍走真实 useAgentSocket 状态机，
 * 因此产品设计时可以调试连接态、流式气泡、工具结果与终态，而不是绕过 UI 逻辑。
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

    schedule(client, 20, { type: "connected", sessionId });
    schedule(client, 35, { type: "resync_end", inFlight: false });
    schedule(client, 50, {
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
      schedule(client, 40, {
        type: "status",
        state: "thinking",
        verb: "正在梳理研究问题",
      });
      schedule(client, 100, { type: "content_start", blockType: "text" });

      const response = responseFor(url.pathname, content);
      const chunks = chunkText(response, 22);
      chunks.forEach((text, index) => {
        schedule(client, 150 + index * 36, { type: "content_delta", text });
      });

      const afterText = 180 + chunks.length * 36;
      if (url.pathname.includes("/smart-search/")) {
        schedule(client, afterText, {
          type: "tool_use_complete",
          toolName: "search_papers",
          toolUseId: `mock-tool-${turnId}`,
          input: { query: content },
        });
        schedule(client, afterText + 45, {
          type: "tool_result",
          toolUseId: `mock-tool-${turnId}`,
          content: {
            total: mockPapers.length,
            data: mockPapers.slice(0, 4),
          },
          isError: false,
        });
        schedule(client, afterText + 80, { type: "message_complete" });
        return;
      }

      schedule(client, afterText + 20, { type: "message_complete" });
    });
  },
);

function responseFor(pathname: string, prompt: string): string {
  if (pathname.includes("/smart-search/")) {
    return `我把“${prompt.slice(0, 28)}”拆成了三个可检索概念：核心技术、人机协作机制与可信评估。下面先给出一组高相关论文，再建议从方法、证据和局限三个维度比较。`;
  }
  if (pathname.includes("/boltslides/")) {
    return `已将“${prompt.slice(0, 28)}”整理为一份 8 页演示结构：问题背景、研究缺口、方法框架、关键证据、案例、风险、设计原则与下一步。演示稿产物已在右侧面板准备好。`;
  }
  if (pathname.includes("/sci-draw/")) {
    return `我会用“输入材料 → 检索与分析 → 人工校验 → 可追溯输出”的四段式结构绘制科研工作流，并用虚线表示反馈与错误恢复路径。`;
  }
  if (pathname.includes("/prism/")) {
    return `已阅读当前主文件。建议先强化引言中的研究缺口，再把三条设计原则改写成可检验的研究问题；我可以将修改以 diff 形式放入待应用区。`;
  }
  return `基于“${prompt.slice(0, 32)}”，我建议先明确研究问题和证据标准，再按主题聚类文献。当前材料显示，可追溯性、可逆操作和不确定性表达是最值得展开的三条主线。`;
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}
