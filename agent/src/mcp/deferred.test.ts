// MCP 工具渐进披露(2026-08-14)。
//
// 背景数字(线上 2026-07-15 ~ 08-13):minicod 定义 76 个工具 ≈ 49,767 tokens;featurePolicy 的
// allowedMcpTools 已收敛到每 feature 12~17 个,但那仍是 9.4k~14.5k tokens —— 占 prism 常驻前缀
// (实测下限 19,073)的一半、占 claw/smart_search 的七成,**每一次 LLM call 都在为它付钱**。
// 而真实调用是极端长尾:prism top4=99.1%,claw top9=98.1%,smart_search top9=98.4%。
//
// 这组测试守的是这个机制不会静默退化成「没省到」或「省过头把主力路径打成两跳」。

import { describe, test, expect } from "bun:test";
import { RESIDENT_CORE, isResidentMcpTool, bareMcpName, deferralEnabled } from "./deferred.ts";
import { MCP_PREFIX } from "./mcpTools.ts";

/** 线上真实调用分布(次数)。改 RESIDENT_CORE 时请连同这份数据一起更新 —— 重算 SQL 见 deferred.ts。 */
const USAGE: Record<string, Record<string, number>> = {
  prism: { search_papers: 904, get_paper_by_doi: 291, match_paper: 91, get_paper: 61, get_papers_batch: 7, search_authors: 3, get_author_papers: 1, group_works: 1 },
  claw: { search_papers: 1880, get_paper_by_doi: 199, get_paper: 181, match_paper: 161, search_journals: 95, search_authors: 28, get_journal: 27, get_papers_batch: 25, suggest_journals: 13, get_author_papers: 12, get_paper_references: 12, group_works: 10, get_paper_citations: 8, get_paper_authors: 7, compare_journals: 2 },
  smart_search: { search_papers: 1882, get_paper: 106, match_paper: 81, get_paper_by_doi: 80, search_authors: 61, get_paper_citations: 51, get_author_papers: 37, get_paper_references: 22, search_snippets: 17, recommend_paper: 11, get_related_works: 8, get_author: 8, get_papers_batch: 5, recommend_from_pool: 3, get_paper_authors: 2, group_works: 1 },
};

describe("MCP 渐进披露", () => {
  test("常驻核心对每个 feature 的原生覆盖率 ≥98%", () => {
    for (const [feature, hist] of Object.entries(USAGE)) {
      const total = Object.values(hist).reduce((a, b) => a + b, 0);
      const covered = Object.entries(hist)
        .filter(([name]) => RESIDENT_CORE.has(name))
        .reduce((a, [, n]) => a + n, 0);
      const pct = (100 * covered) / total;
      expect(
        pct,
        `\n${feature} 的常驻覆盖率跌到 ${pct.toFixed(1)}%(要求 ≥98%)。\n` +
          `低于这条线意味着相当一部分主力调用要多走一次 ToolSearch —— 两跳的延迟与 token\n` +
          `会把渐进披露省下来的钱吃回去。请按 deferred.ts 里的 SQL 重算分布再调名单。\n`,
      ).toBeGreaterThanOrEqual(98);
    }
  });

  test("常驻名单不得无限膨胀:每一项都必须有真实调用支撑", () => {
    // 全部 feature 合并后调用次数为 0 的常驻工具 = 纯 token 负债(它就是我们要治的病)。
    const merged = new Map<string, number>();
    for (const hist of Object.values(USAGE)) {
      for (const [k, v] of Object.entries(hist)) merged.set(k, (merged.get(k) ?? 0) + v);
    }
    const dead = [...RESIDENT_CORE].filter((n) => !(merged.get(n) ?? 0));
    expect(
      dead,
      `\n这些工具常驻但线上零调用:${dead.join(", ")}\n` +
        `常驻一个工具 = 给每一次 LLM call 的账单加钱。零调用的应当延迟披露。\n`,
    ).toEqual([]);
  });

  test("isResidentMcpTool:认前缀名与裸名,非 MCP 工具恒常驻", () => {
    expect(isResidentMcpTool(MCP_PREFIX + "search_papers")).toBe(true);
    expect(isResidentMcpTool(MCP_PREFIX + "search_universities")).toBe(false);
    // 非 MCP(built-in)不归本机制管 —— 误判成「延迟」会让 Read/Write 从 tools[] 里消失。
    expect(isResidentMcpTool("Read")).toBe(true);
    expect(isResidentMcpTool("ToolSearch")).toBe(true);
  });

  test("bareMcpName 去前缀,非 MCP 名原样", () => {
    expect(bareMcpName(MCP_PREFIX + "get_paper")).toBe("get_paper");
    expect(bareMcpName("Read")).toBe("Read");
  });

  test("总开关默认开,置 0 可整体回滚", () => {
    const saved = process.env.EXECUTOR_DEFER_MCP_TOOLS;
    try {
      delete process.env.EXECUTOR_DEFER_MCP_TOOLS;
      expect(deferralEnabled()).toBe(true);
      process.env.EXECUTOR_DEFER_MCP_TOOLS = "0";
      expect(
        deferralEnabled(),
        "\n关不掉了。这个开关是出事时不重建镜像就能回到旧行为的唯一手段。\n",
      ).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.EXECUTOR_DEFER_MCP_TOOLS;
      else process.env.EXECUTOR_DEFER_MCP_TOOLS = saved;
    }
  });
});
