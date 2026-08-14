import { describe, expect, it } from "bun:test";
import { stripStatReportPaths } from "./registry.ts";

// A2 回归:StatReport 的成功回执不许把路径喂给模型。
//
// 生产实测(2026-08-07):221 个「正文出现 out/」的轮里 201 轮来自 stat_lab,
// 燃料就是这份回执里的三个路径键。模型手里没有别的名字可用时,禁令是无效的 ——
// 所以这一族测的是「有没有给出可用的替代品」,不只是「有没有删掉路径」。

const OKJSON = JSON.stringify({
  ok: true,
  system: "cn-core",
  system_name_zh: "中文核心期刊 / 学位论文",
  table_docx: "out/三线表_独立样本 t 检验_中文核心期刊·学位论文.docx",
  results_md: "out/Results段_独立样本 t 检验_中文核心期刊·学位论文.md",
  analysis_py: "out/复现脚本_独立样本 t 检验_中文核心期刊·学位论文.py",
  methods_zh: "采用独立样本 t 检验……",
  results_zh: "治疗组高于对照组……",
  authoring_notes_zh: ["⚠️ 缺失计数只覆盖喂给引擎的那个文件。"],
});

describe("stripStatReportPaths", () => {
  it("摘掉三个路径键,且回执里不再出现 out/", () => {
    const outStr = stripStatReportPaths(OKJSON);
    const j = JSON.parse(outStr);
    expect(j.table_docx).toBeUndefined();
    expect(j.results_md).toBeUndefined();
    expect(j.analysis_py).toBeUndefined();
    // 这条是真正的判据:整份回执里不许再有 out/ —— 模型看到什么就可能说什么。
    expect(outStr).not.toContain("out/");
  });

  it("给出可用的替代品:delivered[].title 是用户在卡片上看到的同一个中文名", () => {
    const j = JSON.parse(stripStatReportPaths(OKJSON));
    expect(j.delivered).toHaveLength(3);
    expect(j.delivered[0]).toEqual({
      title: "三线表_独立样本 t 检验_中文核心期刊·学位论文",
      format: "docx",
    });
    expect(j.delivered.map((d: { format: string }) => d.format)).toEqual(["docx", "md", "py"]);
    // 标题里不能带扩展名(那是文件系统概念)也不能带目录。
    for (const d of j.delivered) {
      expect(d.title).not.toContain("/");
      expect(d.title).not.toMatch(/\.(docx|md|py)$/);
    }
    expect(typeof j.delivery_note_zh).toBe("string");
  });

  it("保留统计内容:methods/results/authoring_notes 一个都不能丢", () => {
    const j = JSON.parse(stripStatReportPaths(OKJSON));
    expect(j.methods_zh).toContain("独立样本 t 检验");
    expect(j.results_zh).toContain("治疗组");
    expect(j.authoring_notes_zh).toHaveLength(1);
    expect(j.system_name_zh).toBe("中文核心期刊 / 学位论文");
  });

  it("analysis_py 缺席时(方法无复现脚本)只交付两件,不报错", () => {
    const src = JSON.parse(OKJSON);
    delete src.analysis_py;
    const j = JSON.parse(stripStatReportPaths(JSON.stringify(src)));
    expect(j.delivered).toHaveLength(2);
  });

  // 🔴 下面三条钉的是「宁可漏脱敏也不弄坏回执」这条取舍。
  //    回执是 stat_lab 唯一的取数入口,把它改坏等于整个 feature 当场哑掉。
  it("非 JSON 原样返回", () => {
    expect(stripStatReportPaths("boom not json")).toBe("boom not json");
  });

  it("ok:false 的拒绝回执原样返回(它要引用模型自己传的路径来解释哪里错了)", () => {
    const rej = JSON.stringify({ ok: false, reason: "bundle_not_from_engine", got: "cooked.json" });
    expect(stripStatReportPaths(rej)).toBe(rej);
  });

  it("一个路径键都没有时原样返回,不自作主张加字段", () => {
    const plain = JSON.stringify({ ok: true, methods_zh: "x" });
    expect(stripStatReportPaths(plain)).toBe(plain);
  });
});
