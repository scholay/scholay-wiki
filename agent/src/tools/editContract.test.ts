import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { builtinRegistry } from "./registry.ts";

// Edit 契约手术的回归(2026-08-07 · A5)。
//
// 生产实测:Edit 调用 51 次,tool_result 里 `old_string not found` **0 次** ——
// 所以「改不到」的主因不是匹配失败(那条已由 relocateStrays 的身份映射修掉)。
// 但旧实现有一个**唯一会静默产生错误结果**的缺陷:`indexOf` 多处命中时静默改第一处
// 并返回成功。模型(尤其 Claude 系)的先验是「多处命中会报错」,「成功」蕴含「唯一」——
// 我们把「成功」的含义换掉了,于是它改错地方且毫不知情。本族钉的就是新契约。

const edit = builtinRegistry.get("Edit")!;
let wd = "";
const ctx = () => ({ workDir: wd }) as any;
const run = (input: Record<string, unknown>) => edit.run(input, ctx());
/** 回执文本:ToolResult.content 是 [{type:'text',text}] 数组,不是字符串。 */
const textOf = (r: any) => (r?.content ?? []).map((c: any) => c?.text ?? "").join("");

beforeEach(async () => { wd = await mkdtemp(join(tmpdir(), "edit-")); });
afterEach(async () => { await rm(wd, { recursive: true, force: true }); });

async function seed(name: string, content: string) {
  await writeFile(join(wd, name), content, "utf8");
}
const read = (name: string) => readFile(join(wd, name), "utf8");

describe("Edit 契约", () => {
  test("唯一命中 → 改,且回执带规模变化(成功也要可核对)", async () => {
    await seed("a.md", "hello world\nbye\n");
    const r: any = await run({ file_path: "a.md", old_string: "hello", new_string: "HI" });
    expect(r.isError).toBeFalsy();
    expect(await read("a.md")).toBe("HI world\nbye\n");
    expect(textOf(r)).toContain("替换 1 处");
  });

  test("🔴 多处命中 → 硬失败且**一个字节都不写**(旧实现在这里静默改第一处)", async () => {
    const src = "TODO: a\nTODO: b\nTODO: c\n";
    await seed("b.md", src);
    const r: any = await run({ file_path: "b.md", old_string: "TODO", new_string: "DONE" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("3 次");
    expect(await read("b.md")).toBe(src); // 原封不动
  });

  test("多处命中的回执告诉模型每一处在第几行(它才知道往哪补上下文)", async () => {
    await seed("c.md", "x\nTODO\ny\nTODO\n");
    const r: any = await run({ file_path: "c.md", old_string: "TODO", new_string: "D" });
    expect(textOf(r)).toContain("第 2、4 行");
  });

  test("replace_all:true → 全替换", async () => {
    await seed("d.md", "TODO a\nTODO b\n");
    const r: any = await run({ file_path: "d.md", old_string: "TODO", new_string: "DONE", replace_all: true });
    expect(r.isError).toBeFalsy();
    expect(await read("d.md")).toBe("DONE a\nDONE b\n");
    expect(textOf(r)).toContain("替换 2 处");
  });

  test("🔴 幂等终止条件:new_string 已在文件里 → 明说「多半已生效,别重复提交」", async () => {
    // 没有这一条,模型会拿着同一句 not found 反复重试,直到烧完轮次上限。
    await seed("e.md", "已经是新内容了\n");
    const r: any = await run({ file_path: "e.md", old_string: "旧内容", new_string: "已经是新内容了" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("多半已经生效");
    expect(textOf(r)).toContain("不要重复提交");
  });

  test("0 命中 → 回执带文件规模 + 可能原因 + 下一步(而不是光一句 not found)", async () => {
    await seed("f.md", "line1\nline2\n");
    const r: any = await run({ file_path: "f.md", old_string: "不存在的片段", new_string: "x" });
    expect(r.isError).toBe(true);
    const msg = textOf(r);
    expect(msg).toContain("字符");
    expect(msg).toContain("行");
    expect(msg).toContain("先 Read");
  });

  test("0 命中但首行还在 → 指出它在第几行(定向重读,不必整文件重看)", async () => {
    await seed("g.md", "aaa\nfunction foo() {\n  old body\n}\n");
    const r: any = await run({
      file_path: "g.md",
      old_string: "function foo() {\n  完全不同的内容\n}",
      new_string: "x",
    });
    expect(textOf(r)).toContain("第 2 行");
  });

  // 🔴 与 prompts 的【绝不暴露内部路径】直接相关:错误回执不许把宿主绝对路径灌进上下文。
  test("文件不存在 → 只回相对路径,不回显宿主绝对路径", async () => {
    const r: any = await run({ file_path: "nope.md", old_string: "a", new_string: "b" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("nope.md");
    expect(textOf(r)).not.toContain(wd); // 绝不出现 /tmp/edit-xxxx 这种宿主路径
    expect(textOf(r)).not.toContain("/private");
  });

  test("空 old_string / 与 new_string 相同 → 直接拒,不做无效写入", async () => {
    await seed("h.md", "x");
    expect(((await run({ file_path: "h.md", old_string: "", new_string: "y" })) as any).isError).toBe(true);
    expect(((await run({ file_path: "h.md", old_string: "x", new_string: "x" })) as any).isError).toBe(true);
    expect(await read("h.md")).toBe("x");
  });

  test("old_string 里的正则元字符按字面处理(不是正则)", async () => {
    await seed("i.md", "a.*b 和 aXXb\n");
    const r: any = await run({ file_path: "i.md", old_string: "a.*b", new_string: "OK" });
    expect(r.isError).toBeFalsy();
    expect(await read("i.md")).toBe("OK 和 aXXb\n"); // 只换字面量那处
  });

  test("$& 这类替换模式在 new_string 里也按字面处理", async () => {
    await seed("j.md", "hello\n");
    const r: any = await run({ file_path: "j.md", old_string: "hello", new_string: "$& world" });
    expect(r.isError).toBeFalsy();
    expect(await read("j.md")).toBe("$& world\n");
  });
});
