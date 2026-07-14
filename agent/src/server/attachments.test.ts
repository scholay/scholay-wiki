// stripImageBlocks 单测:无视觉模型的请求侧图块过滤(history 本体不动)。
import { describe, expect, test } from "bun:test";
import { limitLiveImages, stripImageBlocks } from "./attachments.ts";
import type Anthropic from "@anthropic-ai/sdk";

describe("limitLiveImages", () => {
  const img = { type: "image", source: { type: "base64", media_type: "image/png", data: "AA" } };
  const uimg = (n: number) =>
    ({
      role: "user",
      content: [...([...Array(n)].map(() => ({ ...img })) as unknown[]), { type: "text", text: "t" }],
    }) as never;

  test("超出上限的最老图块换占位;最近 max 张保留;history 原对象不动", () => {
    const msgs = [uimg(2), { role: "assistant", content: "ok" }, uimg(2)] as never[];
    const out = limitLiveImages(msgs as never, 3);
    const first = (out[0] as { content: { type: string; text?: string }[] }).content;
    // 全局共 4 张,max=3 → 只有最老 1 张(第一条消息的第 0 块)被换
    expect(first[0].type).toBe("text");
    expect(first[0].text).toContain("历史图片已省略");
    expect(first[1].type).toBe("image");
    expect(out[1]).toBe(msgs[1]); // 未触碰引用相等
    expect(out[2]).toBe(msgs[2]);
    expect((msgs[0] as { content: { type: string }[] }).content[0].type).toBe("image"); // 原体不动
  });

  test("未超限 / max=0 → 原数组引用返回", () => {
    const msgs = [uimg(2)] as never[];
    expect(limitLiveImages(msgs as never, 3)).toBe(msgs);
    expect(limitLiveImages(msgs as never, 0)).toBe(msgs);
  });
});

describe("stripImageBlocks", () => {
  test("user 含图 → 占位文本;assistant/纯文本消息零拷贝原样引用", () => {
    const img = { type: "image", source: { type: "base64", media_type: "image/png", data: "AA" } };
    const msgs = [
      { role: "user", content: [img, { type: "text", text: "看图" }] },
      { role: "assistant", content: [{ type: "text", text: "好的" }] },
      { role: "user", content: "纯文本" },
    ] as unknown as Anthropic.MessageParam[];
    const out = stripImageBlocks(msgs);
    const first = out[0].content as { type: string; text?: string }[];
    expect(first[0].type).toBe("text");
    expect(first[0].text).toContain("不支持识图");
    expect(out[1]).toBe(msgs[1]); // 未触碰的消息保持引用相等
    expect(out[2]).toBe(msgs[2]);
    // 原 history 不被改写
    expect((msgs[0].content as { type: string }[])[0].type).toBe("image");
  });

  test("全程无图 → 原数组引用返回", () => {
    const msgs = [{ role: "user", content: "hi" }] as unknown as Anthropic.MessageParam[];
    expect(stripImageBlocks(msgs)).toBe(msgs);
  });
});
