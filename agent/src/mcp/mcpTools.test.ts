// 上游真名遮蔽 —— 商务硬约束的回归护栏。
// 背景:上游 minicod MCP 的 tool description / input_schema 里成段解释「`semantic` = Semantic
// Scholar …」,这些文本原样进模型上下文,模型解释换源时会逐句转述给用户 → 真名泄漏。
// 关键陷阱:遮蔽绝不能碰 enum 字面量(小写 semantic/openalex/pubmed),否则模型会发出
// source:"Medicine" 让上游 400,全部检索报废。
import { describe, test, expect } from "bun:test";
import { maskUpstreamBrands } from "./mcpTools.ts";

const FORBIDDEN = /Semantic\s*Scholar|OpenAlex|PubMed|NCBI/;

describe("maskUpstreamBrands", () => {
  test("散文里的品牌名被换成对外品牌名", () => {
    const src =
      "Which data source to query. `semantic` = Semantic Scholar (best citation graph). " +
      "`openalex` = OpenAlex (richest metadata, ~250M works). `pubmed` = PubMed/NCBI (biomedical only).";
    const out = maskUpstreamBrands(src);
    expect(out).not.toMatch(FORBIDDEN);
    expect(out).toContain("Graph");
    expect(out).toContain("Discovery");
    expect(out).toContain("Medicine");
  });

  test("【关键】enum 小写字面量绝不被改写(否则工具调用全废)", () => {
    const schema = {
      type: "object",
      properties: {
        source: {
          type: "string",
          enum: ["semantic", "openalex", "pubmed"],
          description: "`semantic` = Semantic Scholar. `openalex` = OpenAlex. `pubmed` = PubMed.",
        },
      },
    };
    const out = maskUpstreamBrands(schema) as typeof schema;
    expect(out.properties.source.enum).toEqual(["semantic", "openalex", "pubmed"]);
    expect(out.properties.source.description).not.toMatch(FORBIDDEN);
  });

  test("const / default 字面量同样保持原样", () => {
    const out = maskUpstreamBrands({ const: "pubmed", default: "openalex", note: "uses PubMed" }) as Record<
      string,
      unknown
    >;
    expect(out.const).toBe("pubmed");
    expect(out.default).toBe("openalex");
    expect(out.note).toBe("uses Medicine");
  });

  test("深层嵌套的 description 也被清洗", () => {
    const out = maskUpstreamBrands({
      properties: { ids: { items: { description: "Examples: OpenAlex Work ID, PubMed PMID" } } },
    });
    expect(JSON.stringify(out)).not.toMatch(FORBIDDEN);
  });

  test("不误伤无关文本与非字符串值", () => {
    expect(maskUpstreamBrands("semantic web in medicine")).toBe("semantic web in medicine");
    expect(maskUpstreamBrands(42)).toBe(42);
    expect(maskUpstreamBrands(null)).toBe(null);
  });
});
