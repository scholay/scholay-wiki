// 预检索检索式抽取的规则契约(2026-08 证据账本 P1)。
//
// 这里钉的第一件事不是「抽得准」,而是**抽得诚实**:
//   `每个送上游的词块都是用户原文的连续子串` —— 引擎从不翻译、不造同义词、不改字。
// 这条不变量是整个模块的安全边界:违反它,引擎就可能把一批真实但离题的论文钉进账本,
// 而账本的全部价值就是「上面每一条都是某个工具真的返回过的」。所以它有独立一条测试,
// 且用一组真实形态的中文提问跑一遍(不是随手举两例)。
//
// 第二件是**抽不出就不搜**:纯寒暄 / 纯指代 / 纯 meta 措辞一律 null。宁可少探一枪,
// 也不拿垃圾去搜 —— 垃圾检索的代价不是「白花 2 秒」,是往账本里灌离题题录。

import { describe, test, expect } from "bun:test";
import { buildPrefetchQuery } from "./prefetchQuery.ts";

const q = (s: string) => buildPrefetchQuery(s);

describe("预检索检索式抽取", () => {
  test("🔴 不变量:每个词块都是用户原文的连续子串(引擎绝不改用户的字)", () => {
    const samples = [
      "帮我找几篇关于水稻耐盐性分子机制的最新论文",
      "CRISPR 脱靶效应的研究进展如何?",
      "近五年关于肠道菌群与抑郁的研究有哪些重要发现",
      "请问 Transformer 在医学影像分割上的应用有哪些代表性工作,谢谢",
      "写一篇关于深度学习在蛋白质结构预测中的应用的综述",
      "single-cell RNA-seq 在肿瘤微环境研究里的最新进展",
    ];
    for (const s of samples) {
      const r = q(s);
      expect(r).not.toBeNull();
      for (const t of r!.terms) {
        // 连续子串:原文里能原样找到。任何翻译/拼接/同义替换都会让这条断言当场变红。
        expect(s.includes(t)).toBe(true);
      }
    }
  });

  test("中文提问剥掉请求框架后只剩主题", () => {
    expect(q("帮我找几篇关于水稻耐盐性分子机制的最新论文")!.query).toBe("水稻耐盐性分子机制");
    expect(q("近五年关于肠道菌群与抑郁的研究有哪些重要发现")!.query).toBe("肠道菌群与抑郁");
    expect(q("请问这个方向的研究现状是怎样的?我在做水稻基因组编辑")!.query).toContain("水稻基因组编辑");
    expect(q("对比一下光合作用效率的两种测定方法")!.query).toBe("光合作用效率的两种测定方法");
  });

  test("🔴 锚定 ≠ 安全:单字动词/代词绝不进前缀表,否则会把术语的第一个字吃掉", () => {
    // 这几条全是「剥错就产出中文碎片」的真实形态。碎片比噪声坏得多:噪声只是排序差,
    // 碎片会搜回一批离题论文并钉进账本 —— 而账本的全部价值是「上面每条都是工具真返回过的」。
    const cases: Array<[string, string]> = [
      ["我国水稻育种的研究现状", "我国水稻育种"],     // 剥掉单字「我」→「国水稻育种」
      ["推荐系统的最新进展如何", "推荐系统"],         // 剥掉「推荐」→「系统」
      ["搜索引擎排序算法的研究", "搜索引擎排序算法"], // 剥掉「搜索」→「引擎排序算法」
      ["检索增强生成的评测方法", "检索增强生成的评测方法"], // 剥掉「检索」→「增强生成…」
      ["分析化学中的手性分离", "分析化学中的手性分离"],     // 剥掉「分析」→「化学…」
    ];
    for (const [input, expected] of cases) expect(q(input)!.query).toBe(expected);
  });

  test("拉丁术语原样保留(含连字符/数字形态),并排在中文块之前", () => {
    const r = q("CRISPR-Cas9 脱靶效应的研究进展如何?")!;
    expect(r.terms[0]).toBe("CRISPR-Cas9"); // 连字符术语不能被切碎
    expect(r.query).toBe("CRISPR-Cas9 脱靶效应");
    expect(r.kind).toBe("mixed");
    expect(q("PD-1 抑制剂在非小细胞肺癌里的疗效")!.terms).toContain("PD-1");
  });

  test("纯英文提问:功能词与请求元词丢弃,术语保留", () => {
    const r = q("Please find recent papers about protein folding prediction")!;
    expect(r.kind).toBe("latin");
    expect(r.query).toBe("protein folding prediction");
  });

  test("抽不出主题 → null(不预检索,而不是拿垃圾去搜)", () => {
    for (const s of [
      "你好",
      "谢谢!",
      "还有哪些论文呢",          // 纯指代追问:没有可检索的主题
      "你应该使用查询论文的工具来找", // 线上用户 467 原话:全是 meta 措辞,零主题
      "帮我查一下相关文献,谢谢",
      "",
    ]) {
      expect(q(s)).toBeNull();
    }
  });

  test("平台生成的块不是用户的字:引用文献块 / 附件标记 / 代码块 / URL / 裸 DOI 一律剥掉", () => {
    // 引用文献块的格式真源在 frontend-user/src/shared/lib/agent-references.ts
    const withRefs =
      "帮我对比一下光合作用效率的两种测定方法\n\n【引用文献】\n(以下文献已放入工作目录 ./references/)\n- 📄 Chlorophyll fluorescence imaging\n【/引用文献】";
    const r = withRefs && q(withRefs)!;
    expect(r.query).toBe("光合作用效率的两种测定方法");
    expect(r.query).not.toContain("Chlorophyll");

    expect(q('@"/work/session/a.pdf" 帮我看看肿瘤免疫治疗耐药机制')!.query).toBe("肿瘤免疫治疗耐药机制");
    expect(q("参考 https://example.com/x?a=b 讲讲量子纠错码的进展")!.query).toBe("量子纠错码");
    // 裸 DOI 刻意不拿去关键词搜:那是解引用任务(get_paper_by_doi),不是「凭记忆 vs 有证据」
    expect(q("10.1093/jxb/erab076 这篇讲了什么")).toBeNull();
  });

  test("超长粘贴稿只看前 400 字符 —— 正文不该左右检索式(与 Router 同姿态)", () => {
    const paste = "小麦是我国主要口粮作物。".repeat(40); // > 400 字符
    const r = q(paste + "帮我查一下水稻纹枯病抗性基因");
    // 窗口外的请求不参与抽取:检索式只来自前 400 字符
    expect(r === null || !r.query.includes("水稻纹枯病")).toBe(true);
  });

  test("重复字符占位 / 超长串不是术语,整条丢弃(不切成几段)", () => {
    expect(q("x".repeat(500))).toBeNull();
    expect(q("----------- ========")).toBeNull();
    const hash = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"; // 40 字符,超 token 帽
    expect(q(hash)).toBeNull();
  });

  test("整条检索式有长度帽,超出丢**整块**(绝不截断块内文字)", () => {
    const long = "帮我查一下" + ["超长中文主题块一二三四五六七八九十甲乙丙丁戊己庚辛", "另一个同样很长的中文主题块甲乙丙丁戊己庚辛壬癸子丑寅卯", "第三个中文主题块子丑寅卯辰巳午未申酉戌亥"].join(",");
    const r = q(long)!;
    expect(r.query.length).toBeLessThanOrEqual(60);
    for (const t of r.terms) expect(long.includes(t)).toBe(true); // 帽只丢块,不切字
  });

  test("hasCjk 正确 —— 零命中时的解释分支靠它选(平台三源是国际英文库)", () => {
    expect(q("Please find recent papers about protein folding prediction")!.hasCjk).toBe(false);
    expect(q("帮我找几篇关于水稻耐盐性分子机制的最新论文")!.hasCjk).toBe(true);
  });

  test("零 LLM / 零 I/O:纯同步函数,同输入恒同输出", () => {
    const s = "近五年关于肠道菌群与抑郁的研究有哪些重要发现";
    expect(q(s)).toEqual(q(s));
  });
});
