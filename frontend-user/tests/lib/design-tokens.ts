/**
 * globals.css 的 token 解析 —— **全仓唯一一份**。
 *
 * 为什么单独成文件(而不是各测试文件各写一份):
 *   2026-07-28 品牌三色接线到色阶原语之后,`--brand-red` 的字面文本变成 `var(--red-5)`。
 *   当时 `design-tokens-compiled.test.ts` 的 `rootValue()` 是「正则按文本读 :root」,
 *   看不穿这一层间接,当场变红;而 `design-system-guard.test.ts` 恰好新写了一份**带
 *   解引用**的实现。两份解析口径一分叉,就是下一个漂移源 ——
 *   半档间距同时存在 1293 / 1401 / 1423 三个数,正是「照抄口径」的产物。
 *
 * ⚠️ 本文件**不是**测试文件(没有 .test. 中缀),vitest 的默认 include 不会收它,
 *    它只被 import。放在 tests/lib/ 下是为了不进 tsconfig.app.json 的 `include: ["src"]`。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const GLOBALS_PATH = join(__dirname, '..', '..', 'src', 'styles', 'globals.css');
export const GLOBALS_CSS = readFileSync(GLOBALS_PATH, 'utf8');

/** CSS/wxss 的注释剔除(两者都只有块注释一种形态)。保留换行,行号不变。 */
export function stripCssComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * globals.css 主 `:root` 块的 token 表(**已剥注释**)。
 *
 * ⚠️ 只取第一个 `:root { … }`,不含两个 `@theme inline` ——
 *    后者是「注册成 Tailwind 命名空间」的桥接层,值一律是 `var(--x)` 转发,
 *    把它们混进来会让同名 key 互相覆盖(`--ease-out: var(--ease-out)` 自指成环)。
 */
export const ROOT_TOKENS: ReadonlyMap<string, string> = (() => {
  const g = stripCssComments(GLOBALS_CSS);
  const start = g.search(/^:root\s*\{/m);
  const end = g.indexOf('\n}', start);
  const block = start < 0 || end < 0 ? '' : g.slice(start, end);
  const m = new Map<string, string>();
  for (const d of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) m.set(d[1], d[2].trim());
  return m;
})();

/**
 * 读一个 token 的**最终字面值**,穿透 `var()` 间接层。
 *
 * 🔴 必须解引用。品牌三色接线到色阶原语之后,`--brand-red` 的字面文本是 `var(--red-5)`
 *    而不是 `#882828` —— 任何「按文本读 :root 再 match /#882828/」的规则都会当场失效。
 * 🚫 反过来也不要为了迁就正则,去 globals.css 写 `var(--red-5, #882828)`:
 *    那样 `--red-5` 被改坏时契约仍因 fallback 文本显绿,比不接线更坏。
 */
export function tokenValue(name: string): string {
  let v = ROOT_TOKENS.get(name);
  for (let i = 0; v !== undefined && /^var\(\s*--[a-z0-9-]+\s*\)$/.test(v); i++) {
    if (i > 8) throw new Error(`${name}: var() 解引用超过 8 层,疑似成环`);
    v = ROOT_TOKENS.get(v.replace(/^var\(\s*|\s*\)$/g, ''));
  }
  if (v === undefined) throw new Error(`globals.css 主 :root 里找不到 ${name}(或它指向一个不存在的变量)`);
  return v;
}
