// 会话标题生成(首轮后)。发 session_title_updated{title,aiGenerated} —— Go 侧 OnTitleResult 落库。
// (prism 项目名走另一条 autoname 链路,不在此。)

import { fastCompletion } from "./completion.ts";
import type { CallUsage } from "./turnLoop.ts";

const TITLE_SYSTEM =
  "你给学术助手对话起一个简短中文标题(不超过 14 个字,不带引号、书名号或结尾标点)。只输出标题本身,不要任何解释。";

// 返回 {title, usage}:标题生成是 billable 调用,usage 回传给 WS 层发 token_usage{kind:title_gen}(C1)。
export async function generateTitle(
  userText: string,
  assistantText: string,
): Promise<{ title: string | null; usage: CallUsage | null }> {
  try {
    // max_tokens 要足够大:DeepSeek 会先产 thinking(可达数百 token),预算太小会被思考吃光导致空文本。
    const { text: raw, usage } = await fastCompletion(
      TITLE_SYSTEM,
      `用户:${userText.slice(0, 240)}\n\n助手:${assistantText.slice(0, 360)}\n\n请给这段对话起标题。`,
      1024,
    );
    const t = raw.replace(/^["「『《]+|["」』》]+$/g, "").replace(/[。.!！?？]+$/g, "").trim().slice(0, 40);
    return { title: t || null, usage };
  } catch {
    return { title: null, usage: null };
  }
}
