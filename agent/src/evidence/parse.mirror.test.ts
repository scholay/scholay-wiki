// 跨包镜像守卫:agent/src/evidence/parse.ts ←→ frontend-user/src/shared/lib/minicod-papers.ts
// (2026-08 证据账本 P0)。
//
// 🔴 为什么必须有这个文件:本仓库的已知伤口模式就是「镜像悄悄落后两代而护栏全绿」
//    (frontend-user/CLAUDE.md §五:51 条护栏全绿掩盖三份镜像同时落后两代)。
//    parse.ts 是**第四份**跨包镜像,不加守卫就是在重复那个模式 —— 而这次的后果不是配色不一致,
//    是「前端能把 tool_result 解析成论文卡、账本却解析不出来」= 检索了但没入账 = 病灶原样复现。
//
// 🔴 覆盖面的诚实声明(与设计护栏同款语义,别把跳过当通过):
//    · 完整 checkout 里跑 `bun test src` → 真的执行(前端包在场,两侧同 fixture 逐字段比对);
//    · agent 的 Docker 构建 context 只有 ./agent → 前端包物理上不在 → **吵闹地 skip**;
//    · 仓库根的 pre-push 钩子经 `scripts/check-evidence-mirror.sh` **会跑本文件**(只跑这一个文件,
//      ~90ms,不跑 agent 全量);该闸自己读 bun 的 junit 报告判「有没有规则被跳过」——
//      **跳过 = 判失败**,因为 bun 与 vitest 一样会把 `describe.skipIf` 整族跳过算成绿(退出码 0)。
//      前置:装过一次 `./scripts/install-git-hooks.sh`,且 PATH 里有 bun(没有则吵闹留痕后放行)。
//      (2026-08 收尾批之前,本守卫的唯一执行点确实只有本地 `bun test src`;那条限制已解除。)

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ENVELOPE_KEYS,
  PAPER_SIGNAL_KEYS,
  SOURCE_BRAND,
  parsePapersFromToolResult as parseAgent,
} from "./parse.ts";

// fileURLToPath 而非 .pathname:仓库路径含非 ASCII,pathname 是百分号编码的,fs 读不了。
const here = fileURLToPath(new URL(".", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const MIRROR_SRC = REPO + "frontend-user/src/shared/lib/minicod-papers.ts";
const BRAND_SRC = REPO + "frontend-user/src/shared/lib/data-source-brand.ts";
const MASK_SRC = REPO + "frontend-user/src/shared/lib/mask-tool-source.ts";

const IN_FULL_REPO = existsSync(REPO + "docker-compose.yml");
const MIRROR_PRESENT = existsSync(MIRROR_SRC) && existsSync(BRAND_SRC) && existsSync(MASK_SRC);

if (!MIRROR_PRESENT) {
  console.warn(
    "[evidence-mirror] 跨包镜像规则已跳过:当前不在完整仓库里(agent 的 Docker 构建 context " +
      `只有 ./agent,frontend-user 物理上不在)。here=${here}。完整仓库里跑 \`bun test src\` 时它会执行。`,
  );
}

// 在完整仓库里镜像源却不见了 = 有人移动/删除了它,那正是最该报警的时刻(不连坐到 skip)。
test("完整仓库里镜像源必须在场(移动/重命名它必须同时改本文件)", () => {
  if (!IN_FULL_REPO) return;
  expect([MIRROR_SRC, BRAND_SRC, MASK_SRC].filter((p) => !existsSync(p))).toEqual([]);
});

// ── fixture 语料:覆盖前端注释里点名的全部实战形态 ────────────────────────────
const author = (over: Record<string, unknown> = {}) => ({ id: "A1", source: "olx", name: "Zhang Y", ...over });
const paper = (over: Record<string, unknown> = {}) => ({
  id: "W1",
  source: "olx",
  title: "WRKY under drought",
  abstract: "abs",
  year: 2021,
  publication_date: "2021-03-01",
  doi: "10.1093/jxb/erab076",
  pmid: "33712833",
  venue: "J Exp Bot",
  url: "https://example.org/p/1",
  citation_count: 12,
  reference_count: 40,
  is_open_access: true,
  pdf_url: "https://example.org/p/1.pdf",
  fields_of_study: ["Biology"],
  authors: [{ id: "A1", source: "olx", name: "Zhang Y", affiliations: ["X Univ"] }, { name: "Li M" }],
  ...over,
});

const FIXTURES: Array<[string, unknown]> = [
  ["MCP 文本块信封 + items[]", [{ type: "text", text: JSON.stringify({ items: [paper(), paper({ id: "W2" })], total: 9 }) }]],
  ["裸数组(get_papers_batch)", [paper({ id: "W3" }), paper({ id: "W4" })]],
  ["recommended_papers(recommend_paper)", { recommended_papers: [paper({ id: "W5" })] }],
  ["results", { results: [paper({ id: "W6" })] }],
  ["data", { data: [paper({ id: "W7" })] }],
  ["papers", { papers: [paper({ id: "W8" })] }],
  ["snippets(search_snippets:paper_title/paper_id)", { snippets: [{ paper_id: "W9", source: "stc", paper_title: "Snippet paper", text: "…" }] }],
  ["JSON 字符串", JSON.stringify({ items: [paper({ id: "W10" })] })],
  ["嵌套信封", { data: { items: [paper({ id: "W11" })] } }],
  ["作者实体(必须 0 条)", { items: [author(), author({ id: "A2", display_name: "Li M" })] }],
  ["高校实体 school_code(必须 0 条)", { items: [{ id: "S1", source: "olx", name: "X 大学", school_code: "10001" }] }],
  // ⚠️ 这条是 isNonPaperEntity 的**唯一**判别性 fixture:带 title 的高校实体只有 school_code 分支拦得住
  //   (无标题的作者/机构会先被 title 检查丢掉)。删了它,拆掉 isNonPaperEntity 也能全绿。
  [
    "高校实体但带标题(必须 0 条 —— 只有 school_code 分支拦得住)",
    { items: [{ id: "S2", source: "olx", name: "X 大学", school_code: "10002", title: "X University Annual Report", year: 2021 }] },
  ],
  ["无标题 → 丢弃", { items: [{ id: "W12", source: "olx", year: 2020 }] }],
  ["无 id → 丢弃", { items: [{ source: "olx", title: "no id" }] }],
  ["作者是字符串数组", { items: [paper({ id: "W13", authors: ["Zhang Y", " ", "Li M"] })] }],
  ["source 非法 → 当 stc(不补前缀)", { items: [paper({ id: "W14", source: "weird" })] }],
  ["source 缺失", { items: [paper({ id: "W15", source: undefined })] }],
  ["id 已带前缀不重复补", { items: [paper({ id: "olx:W16" })] }],
  ["year 是字符串", { items: [paper({ id: "W17", year: "2019" })] }],
  ["带论文体征的作者式对象(有 name 又有 citation_count,无 title → 仍丢弃)", { items: [author({ citation_count: 5 })] }],
  ["空信封", { items: [] }],
  ["完全不认识的形状", { foo: "bar" }],
  ["null", null],
];

describe.skipIf(!MIRROR_PRESENT)("跨包镜像:与 frontend-user 的 minicod 解析器行为一致", () => {
  test("同一批 fixture 两侧解析结果逐字段一致", async () => {
    const fe = (await import(MIRROR_SRC)) as {
      parsePapersFromToolResult: (c: unknown) => Array<Record<string, unknown>>;
    };

    let compared = 0;
    for (const [name, fx] of FIXTURES) {
      const a = parseAgent(fx);
      const f = fe.parsePapersFromToolResult(fx);
      expect(a.length, `【${name}】解析条数不一致 —— 一侧认得的论文另一侧不认得`).toBe(f.length);
      for (let i = 0; i < f.length; i++) {
        const F = f[i]!;
        const A = a[i]!;
        const ext = (F.externalIds ?? {}) as Record<string, unknown>;
        expect(
          {
            paperId: A.paperId,
            source: A.sourceCode as string,
            title: A.title,
            abstract: A.abstract,
            year: A.year,
            publicationDate: A.publicationDate,
            venue: A.venue,
            url: A.url,
            doi: A.doi,
            pmid: A.pmid,
            citationCount: A.citationCount,
            referenceCount: A.referenceCount,
            isOpenAccess: A.isOpenAccess,
            authors: A.authors,
          },
          `【${name}】第 ${i} 条字段映射漂移`,
        ).toEqual({
          paperId: F.paperId as string,
          source: F.source as string,
          title: F.title as string,
          abstract: F.abstract as string | undefined,
          year: F.year as number | undefined,
          publicationDate: F.publicationDate as string | undefined,
          venue: F.venue as string | undefined,
          url: F.url as string | undefined,
          doi: ext.DOI as string | undefined,
          pmid: ext.PMID as string | undefined,
          citationCount: F.citationCount as number | undefined,
          referenceCount: F.referenceCount as number | undefined,
          isOpenAccess: F.isOpenAccess as boolean | undefined,
          authors: Array.isArray(F.authors)
            ? (F.authors as Array<{ name: string }>).map((x) => x.name)
            : undefined,
        });
        compared++;
      }
    }
    // 空转防线:fixture 全被判 0 条时上面的循环一条都不比 —— 那等于规则不存在。
    expect(compared, "一条记录都没比对上,先修 fixture 或解析器,别当绿灯").toBeGreaterThanOrEqual(15);
  });

  test("信封键列表与真源逐项一致(顺序也算:它决定 recommended_papers 与 items 谁先命中)", () => {
    const text = readFileSync(MIRROR_SRC, "utf8");
    const m = text.match(/for \(const key of \[([^\]]+)\]\)/);
    expect(m, "真源里的信封键循环没解析出来 —— 先修本正则,别让规则空转").toBeTruthy();
    const feKeys = [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(feKeys.length).toBeGreaterThanOrEqual(6);
    expect([...ENVELOPE_KEYS] as string[]).toEqual(feKeys as string[]);
  });

  test("论文体征字段表与真源一致(它决定作者实体会不会被当成论文入账)", () => {
    const text = readFileSync(MIRROR_SRC, "utf8");
    const m = text.match(/const PAPER_SIGNAL_KEYS = \[([\s\S]*?)\];/);
    expect(m, "真源里的 PAPER_SIGNAL_KEYS 没解析出来 —— 先修本正则").toBeTruthy();
    const feKeys = [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(feKeys.length).toBeGreaterThanOrEqual(20);
    expect(PAPER_SIGNAL_KEYS).toEqual(feKeys as string[]);
  });

  test("源码→对外品牌名映射与真源一致(泄漏面:账本的 source 会被模型转述给用户)", async () => {
    const brand = (await import(BRAND_SRC)) as { normalizeSourceBrand: (s: string) => string | undefined };
    for (const [code, name] of Object.entries(SOURCE_BRAND)) {
      expect(brand.normalizeSourceBrand(code), `源码 ${code} 的品牌名与前端真源不一致`).toBe(name);
    }
    // 反向:真源里的键一个都不能少(前端加了新源码而账本不认 → 该源的题录会丢 source 字段)。
    const maskText = readFileSync(MASK_SRC, "utf8");
    const m = maskText.match(/const SOURCE_BRAND: Record<string, string> = \{([\s\S]*?)\};/);
    expect(m, "真源里的 SOURCE_BRAND 没解析出来 —— 先修本正则").toBeTruthy();
    const feKeys = [...m![1]!.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((x) => x[1]!);
    expect(feKeys.length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(SOURCE_BRAND).sort()).toEqual(feKeys.sort());
  });

  test("账本侧不得输出上游真名(brandOfSource 命中不到时**不回落**成原码)", async () => {
    const { brandOfSource } = await import("./parse.ts");
    expect(brandOfSource("olx")).toBe("Discovery");
    expect(brandOfSource("openalex")).toBe("Discovery");
    expect(brandOfSource("unknown_source")).toBeUndefined(); // 回落成原码 = 泄漏路径
    for (const v of Object.values(SOURCE_BRAND)) {
      expect(["Graph", "Discovery", "Medicine", "Journal"]).toContain(v);
    }
  });
});
