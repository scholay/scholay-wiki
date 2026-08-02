// 跨包接线守卫:agent 的 builtin 工具 ←→ backend `permissionAllowed` 的放行面
// (2026-08 证据账本 P1 收尾)。
//
// 🔴 为什么必须有这个文件 —— 这是本仓库**咬了五次**的同一个失效模式:
//    ReadDocument / ExportDocument / BuildDeck / EvidenceGet / SubmitAnswer+DeclareInsufficient,
//    每一次都是「agent 侧工具造好了、backend 侧忘了放行」。症状完全一致且**极难发现**:
//    backend 的 permissionAllowed 是 default-deny,新工具命中 default 分支 → 模型收到
//    「不存在名为 X 的工具」→ **静默回落到没有该工具的行为**,没有崩溃、没有红灯、没有报错。
//    造好的能力就这么躺在代码里不生效,直到有人肉眼比对两个包才发现。
//
//    这个测试把「靠人读代码发现」变成「机械咬」:注册了新 builtin 却没在 backend 登记 → 当场红。
//
// 判据刻意用**出现即可**(而不是解析 Go 的控制流):permissionAllowed 里凡是显式提到过的工具名,
// 说明作者至少**想过**它;完全没提到的必然落进 `default: return false`。解析控制流会把这个守卫
// 变成一个需要跟着 Go 代码结构演进的脆弱解析器 —— 那种守卫迟早会被改坏或注释掉。
//
// 覆盖面的诚实声明(与 parse.mirror.test.ts / 设计护栏同款语义):
//   · 完整 checkout 里跑 `bun test src` → 真的执行;
//   · agent 的 Docker 构建 context 只有 ./agent → backend 源码物理上不在 → **吵闹地 skip**。
//   · 跳过 = 没校验,不是通过。

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { builtinRegistry } from "./registry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const WS_GO = join(here, "../../../backend/internal/agentbridge/ws.go");
const backendPresent = existsSync(WS_GO);

/**
 * 刻意**不**在 backend 放行、且这是正确行为的工具。
 * 每一条都必须写清「为什么它不需要放行」—— 没有理由的豁免 = 把守卫掏空。
 */
const INTENTIONALLY_UNLISTED: Record<string, string> = {
  // 目前为空。将来若真有这样的工具,在这里登记 + 写明理由,而不是把它从 builtinRegistry 里藏起来。
};

describe("跨包接线守卫 · builtin 工具 ↔ backend permissionAllowed", () => {
  test.skipIf(!backendPresent)(
    "每个 builtin 工具都必须在 backend permissionAllowed 里被显式提到(否则 default-deny → DOA)",
    () => {
      const src = readFileSync(WS_GO, "utf8");
      // 只截 permissionAllowed 函数体:别让「文件别处碰巧提过这个名字」变成假绿。
      const start = src.indexOf("func permissionAllowed(");
      expect(start).toBeGreaterThan(-1);
      // 函数体到下一个顶层 func 为止(Go 顶层 func 恒在行首)。
      const after = src.slice(start + 1);
      const nextFunc = after.indexOf("\nfunc ");
      const body = nextFunc === -1 ? after : after.slice(0, nextFunc);

      const missing: string[] = [];
      for (const name of builtinRegistry.keys()) {
        if (name in INTENTIONALLY_UNLISTED) continue;
        // 带引号匹配:避免 "Read" 命中注释里的「Read 工具」这类散文。
        if (!body.includes(`"${name}"`)) missing.push(name);
      }

      expect(
        missing,
        missing.length === 0
          ? ""
          : `\n以下 builtin 工具在 backend permissionAllowed 里没有任何登记 —— 上线即 DOA` +
              `(命中 default: return false,模型收到「不存在该工具」后静默回落,无任何红灯):\n` +
              missing.map((m) => `  · ${m}`).join("\n") +
              `\n\n修法:在 backend/internal/agentbridge/ws.go 的 permissionAllowed 里加一条显式分支` +
              `(照抄 EvidenceGet 那段的形态,并写清放行面为何安全);` +
              `\n若确属「刻意不放行」,登记进本文件的 INTENTIONALLY_UNLISTED 并写明理由。\n`,
      ).toEqual([]);
    },
  );

  test.skipIf(!backendPresent)(
    "守卫自证:注册一个假工具必须让上面那条红(防止判据本身失效)",
    () => {
      const src = readFileSync(WS_GO, "utf8");
      const start = src.indexOf("func permissionAllowed(");
      const after = src.slice(start + 1);
      const nextFunc = after.indexOf("\nfunc ");
      const body = nextFunc === -1 ? after : after.slice(0, nextFunc);
      // 一个绝不可能出现在 backend 里的名字 —— 判据若失效(如 body 截空、includes 恒真),这条会挂。
      expect(body.includes(`"__NeverRegisteredTool__"`)).toBe(false);
      // 同时确认 body 真的截到了东西(截空会让上一条测试全绿 = 最坏的假绿)。
      expect(body.length).toBeGreaterThan(500);
      expect(body).toContain(`"EvidenceGet"`);
    },
  );

  test("backend 源码缺席时必须吵闹地 skip,而不是静默绿灯", () => {
    if (backendPresent) {
      expect(backendPresent).toBe(true);
      return;
    }
    console.warn(
      "\n⚠️  跨包接线守卫【已跳过】—— backend 源码不在 checkout 里(如 agent 的 Docker 构建 context)。\n" +
        "   被跳过的规则:builtin 工具 ↔ backend permissionAllowed 放行面比对。\n" +
        "   跳过 = 没校验,不是通过。完整 checkout 里跑 `bun test src` 才真的校验。\n",
    );
    expect(backendPresent).toBe(false);
  });
});
