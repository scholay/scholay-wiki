// 会话标题生成(首轮后)。发 session_title_updated{title,aiGenerated} —— Go 侧 OnTitleResult 落库。
// (prism 项目名走另一条 autoname 链路,不在此。)

import { fastCompletion } from "./completion.ts";
import type { CallUsage } from "./turnLoop.ts";

const TITLE_SYSTEM =
  "你给学术助手对话起一个简短中文标题(不超过 14 个字,不带引号、书名号或结尾标点)。只输出标题本身,不要任何解释。";

// fallbackTitle:标题模型失败/空时的**确定性兜底** —— 用首条用户消息截断(业界标准:ChatGPT/Claude 等
// 标题模型失败都回落到首条消息摘要,绝不留永久 spinner)。去空白、取前 16 字;为空再回落到稳定标签。
// 铁律:返回值**绝不能**等于前端 PLACEHOLDER_TITLES(''/'Untitled Session'/'新会话'),否则前端仍判 loading。
export function fallbackTitle(userText: string): string {
  const t = (userText || "").replace(/\s+/g, " ").trim().slice(0, 16);
  // 铁律:结果不得等于前端占位串(空 / 'Untitled Session' / '新会话')——否则前端仍判 loading。
  // 极罕见:用户首条消息恰好就是这些字面 → 回落稳定标签。
  if (!t || t === "Untitled Session" || t === "新会话") return "未命名对话";
  return t;
}

// 返回 {title, usage}:标题生成是 billable 调用,usage 回传给 WS 层发 token_usage{kind:title_gen}(C1)。
// **title 永不为空**:模型空返回 / 异常一律回落 fallbackTitle(首条消息截断)—— 从源头杜绝「空标题」态,
// 前端便不会永久卡在「生成标题中…」(根因见 docs 调研:单次机会 + 静默失败出口 + 无兜底)。
export async function generateTitle(
  userText: string,
  assistantText: string,
): Promise<{ title: string; usage: CallUsage | null }> {
  try {
    // max_tokens 要足够大:DeepSeek 会先产 thinking(可达数百 token),预算太小会被思考吃光导致空文本。
    const { text: raw, usage } = await fastCompletion(
      TITLE_SYSTEM,
      `用户:${userText.slice(0, 240)}\n\n助手:${assistantText.slice(0, 360)}\n\n请给这段对话起标题。`,
      1024,
    );
    const t = raw.replace(/^["「『《]+|["」』》]+$/g, "").replace(/[。.!！?？]+$/g, "").trim().slice(0, 40);
    return { title: t || fallbackTitle(userText), usage }; // 模型空 → 首条消息兜底
  } catch {
    return { title: fallbackTitle(userText), usage: null }; // 异常 → 首条消息兜底
  }
}
