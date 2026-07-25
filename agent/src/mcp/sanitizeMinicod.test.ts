import { test, expect, describe } from "bun:test";
import { sanitizeMinicodResult, COVERAGE_NOTE } from "./sanitizeMinicod.ts";

function wrap(data: unknown): unknown {
  return [{ type: "text", text: JSON.stringify(data, null, 2) }];
}
function unwrap(content: unknown): Record<string, unknown> {
  const arr = content as Array<{ type: string; text: string }>;
  return JSON.parse(arr[0].text);
}

describe("sanitizeMinicodResult", () => {
  test("70k 字符 abstract 被截断并带标注", () => {
    const data = { items: [{ title: "Normal paper", abstract: "字".repeat(70_000) }], total: 1 };
    const out = unwrap(sanitizeMinicodResult("search_papers", { query: "quantum control" }, wrap(data)));
    const items = out.items as Array<{ abstract: string }>;
    expect(items[0].abstract.length).toBeLessThan(2100);
    expect(items[0].abstract).toContain("[truncated");
    expect((out._sanitizer as Record<string, unknown>).truncated_fields).toBe(1);
  });

  test("spam 标题(超长+乱码占比)整条剔除", () => {
    const spamTitle = "B3 常春藤計畫™®☭" + "!@#$%^&*()".repeat(60) + "宣言";
    const data = {
      items: [
        { title: spamTitle, abstract: "junk" },
        { title: "Legit adversarial attack survey", abstract: "ok" },
      ],
      total: 2,
    };
    const out = unwrap(sanitizeMinicodResult("search_papers", { query: "adversarial attack" }, wrap(data)));
    const items = out.items as Array<{ title: string }>;
    expect(items.length).toBe(1);
    expect(items[0].title).toContain("Legit");
    expect((out._sanitizer as Record<string, unknown>).spam_dropped).toBe(1);
  });

  test("中文 query 注入 coverage_note;英文 query 不注入", () => {
    const data = { items: [{ title: "T", abstract: "A" }], total: 1 };
    const zh = unwrap(sanitizeMinicodResult("search_papers", { query: "乡村振兴 文献" }, wrap(data)));
    expect((zh._sanitizer as Record<string, unknown>).coverage_note).toBe(COVERAGE_NOTE);
    const en = sanitizeMinicodResult("search_papers", { query: "rural development" }, wrap(data));
    const enOut = unwrap(en);
    expect(enOut._sanitizer === undefined || (enOut._sanitizer as Record<string, unknown>).coverage_note === undefined).toBe(true);
  });

  test("低相关标注:零词重叠条目进 low_relevance_ids", () => {
    const data = {
      items: [
        { paperId: "p1", title: "Brunei-China economic cooperation", abstract: "trade" },
        { paperId: "p2", title: "Wavelet transform traffic analysis", abstract: "network traffic wavelet" },
      ],
      total: 2,
    };
    const out = unwrap(sanitizeMinicodResult("search_papers", { query: "wavelet traffic analysis" }, wrap(data)));
    expect(out._sanitizer).toBeDefined();
    expect((out._sanitizer as Record<string, unknown>).low_relevance_ids).toEqual(["p1"]);
  });

  test("JATS/HTML 标签剥离,数学表达不误伤", () => {
    const data = { items: [{ title: "T", abstract: "<jats:p>Result: P < 0.05 and a<b> effect</jats:p>" }], total: 1 };
    const out = unwrap(sanitizeMinicodResult("search_papers", { query: "effect size" }, wrap(data)));
    const abs = (out.items as Array<{ abstract: string }>)[0].abstract;
    expect(abs).not.toContain("<jats:p>");
    expect(abs).toContain("P < 0.05");
  });

  test("非 JSON / 未知形状原样返回", () => {
    const raw = [{ type: "text", text: "plain error text" }];
    expect(sanitizeMinicodResult("x", {}, raw)).toBe(raw);
    const arr = [{ type: "text", text: "[1,2,3]" }];
    expect(sanitizeMinicodResult("x", {}, arr)).toBe(arr);
  });

  test("单篇详情用更宽的 8000 cap 且不剔除", () => {
    const data = { title: "Very long single paper", abstract: "y".repeat(9000) };
    const out = unwrap(sanitizeMinicodResult("get_paper", { paper_id: "x" }, wrap(data)));
    expect((out.abstract as string).length).toBeLessThan(8100);
  });

  test("总量超 50KB 时从列表尾部丢弃并计数", () => {
    const data = { items: Array.from({ length: 40 }, (_, i) => ({ title: `P${i}`, abstract: "z".repeat(1900) })), total: 40 };
    const out = unwrap(sanitizeMinicodResult("search_papers", { query: "zzz repeated data" }, wrap(data)));
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(52_000);
    expect(((out._sanitizer as Record<string, unknown>).dropped_for_size as number) > 0).toBe(true);
  });
});
