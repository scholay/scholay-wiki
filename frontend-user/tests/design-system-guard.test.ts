/**
 * 设计系统护栏 —— 防止 2026-07 Figma 换真源的成果回潮。
 *
 * 这些规则在 CLAUDE.md §5「禁止」里都有文字说明,但文字管不住人(和 AI)。
 * 本文件把它们变成构建期硬失败。
 *
 * 每条规则都记录了【为什么】—— 不是教条,是这次改造里真实付出过代价的东西。
 * 需要豁免时在下面的 ALLOW 列表里加,并写清理由。
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).map((p) => ({ path: relative(SRC, p), text: readFileSync(p, 'utf8') }));

/** 命中项格式化成可定位的 file:line */
function hits(re: RegExp, filter?: (f: { path: string }) => boolean) {
  const out: string[] = [];
  for (const f of FILES) {
    if (filter && !filter(f)) continue;
    f.text.split('\n').forEach((line, i) => {
      const m = line.match(re);
      if (m) out.push(`${f.path}:${i + 1}  «${m[0]}»`);
    });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────── 颜色 ── */

describe('颜色', () => {
  it('禁止 Tailwind 默认色板类名', () => {
    // 为什么: 不在 token 里就是没有。改造前这条守住了(0 命中),要保持。
    const re =
      /\b(?:text|bg|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|\d00|950)\b/;
    expect(hits(re)).toEqual([]);
  });

  it('禁止 white / black 默认色', () => {
    // 为什么: 它们不符合「色名-数字」形态,是 grep 查不出的后门。
    // 改造前有 127 处从这里溜进来,而当时的审计报告写着「默认色板 0 处」。
    const re = /\b(?:text|bg|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(?:white|black)\b/;
    const ALLOW = [
      // landing 恒暗段 / 海报导出 / Prism 深色编辑器 —— 这些是「深底上的白」,
      // 语义确实是纯白而非 --foreground 的反色。迁到 --on-dark 前暂允许。
      'features/landing/',
      'shared/components/share/',
      'features/prism/components/Latex',
    ];
    const bad = hits(re).filter((h) => !ALLOW.some((a) => h.startsWith(a)));
    expect(bad).toEqual([]);
  });

  it('禁止藏在 rgb()/rgba() 里的 Tailwind 默认色板', () => {
    // 为什么: rgba(15,23,42,.08) 就是 slate-900。改造前 7 处阴影从这个后门进来,
    // 类名层的规则完全查不到。
    const KNOWN = [
      String.raw`15\s*,\s*23\s*,\s*42`, // slate-900
      String.raw`17\s*,\s*24\s*,\s*39`, // gray-900
      String.raw`24\s*,\s*24\s*,\s*27`, // zinc-900
    ];
    const re = new RegExp(String.raw`rgba?\(\s*(?:${KNOWN.join('|')})`);
    expect(hits(re)).toEqual([]);
  });

  // ⚠️ 棘轮(ratchet)而非硬失败 —— B4 颜色拆分尚未完成。
  // 让它永久红没有意义(人会停止看红灯),所以断言「只能减少不能增加」:
  // 既现在绿、又锁住债务不回涨、还能量化进度。B4 做完后把 BASELINE 降到 0 并改回 toEqual([])。
  it('UI 代码里的硬编码 hex 色只减不增', () => {
    // 为什么: 唯一真源是 globals.css。
    // 豁免的是「必须给具体 CSS 值、不能给类名」或「素材资产」的地方。
    const ALLOW = [
      'features/claw/components/figure/', // 科研绘图素材(bioicons CC0 + 自绘),碱基/细胞器配色是科研语义
      'shared/components/share/', // html-to-image 海报: 离屏克隆丢 CSS 变量,必须字面值
      'shared/components/ProviderLogo', // 第三方品牌 logo
      'shared/components/BrandLogo', // 品牌 logo
      'shared/lib/theme-bridge', // token → 第三方主题的唯一适配层
    ];
    const BASELINE = 72; // 2026-07 B4 起始基线
    const bad = hits(/#[0-9a-fA-F]{6}\b/).filter((h) => !ALLOW.some((a) => h.startsWith(a)));
    expect(bad.length, `硬编码 hex 增加了。新增的:\n${bad.slice(0, 20).join('\n')}`).toBeLessThanOrEqual(BASELINE);
  });
});

/* ──────────────────────────────────────────────────────────── 排印 ── */

describe('排印', () => {
  // ⚠️ 棘轮 —— B6 字号迁移尚未开始(1900+ 处,牵连固定高度容器与 line-clamp,风险最高)。
  // B6 做完后把 BASELINE 降到 0 并改回 toEqual([])。
  it('arbitrary 字号只减不增', () => {
    // 为什么: Figma 规定 6 档 12/14/16/20/24/28,新代码用 text-12 这类数值名。
    // 基线随进度收紧: 64(B6 前) → 46(B6 后)。每次降低都是不可逆的棘轮。
    const BASELINE = 46;
    const bad = hits(/\btext-\[[0-9.]+(?:px|rem|em)\]/);
    expect(bad.length, `arbitrary 字号增加了。当前:\n${bad.slice(0, 20).join('\n')}`).toBeLessThanOrEqual(BASELINE);
  });

  it('禁止新增 tracking', () => {
    // 为什么: Figma 中 letterSpacing 恒为 0。改造前 58 处 uppercase 段标用了
    // 11 个不同值做同一件事 —— 只要留一个「专用档」,历史证明它会立刻重新裂变。
    // 只有 tracking-code(验证码) / tracking-brand(wordmark) 两个功能性 token 合法。
    expect(hits(/\btracking-(?!code\b|brand\b)[a-z0-9[\]./-]+/)).toEqual([]);
  });

  it('禁止 arbitrary 行高', () => {
    // 为什么: 行高按【字族】绑定(sans 1.25 / display 1.333 / serif 1.437),
    // 不按字号档。改造前 58 处 arbitrary 行高互相打架。
    const ALLOW = ['features/landing/components/TestimonialsGrid']; // 装饰性巨型引号的光学调整
    const bad = hits(/\bleading-\[[0-9.]+\]/).filter((h) => !ALLOW.some((a) => h.startsWith(a)));
    expect(bad).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────── 形状与层级 ── */

describe('形状与层级', () => {
  it('禁止 arbitrary 圆角', () => {
    // 为什么: Figma 规定 4/8/12/16/20 + 胶囊。--radius-* 命名空间已封闭。
    const bad = hits(/\brounded(?:-[a-z]+)?-\[[^\]]+\]/).filter(
      (h) =>
        // rounded-[inherit] 是「跟随父级圆角」,不是一个新档位
        !/rounded-\[inherit\]/.test(h) &&
        // 海报走 html-to-image,离屏克隆丢 CSS 变量,必须字面值
        !h.startsWith('shared/components/share/') &&
        // 微圆角: 8px 图例色块用 2px / 2.5px 骨架条用 1px。
        // 最低档 4px 放到这个尺度上会变成圆形,是真实的档位缺口而非违规。
        !/rounded-\[[12]px\]/.test(h)
    );
    expect(bad).toEqual([]);
  });

  it('禁止裸 z-index 数值', () => {
    // 为什么: 改造前 8 类语义不同的浮层全部 z-50,谁盖谁由 portal 挂载顺序决定 ——
    // 「Tooltip 挂在 Dialog 内的按钮上能不能盖住 Dialog」是运气。
    expect(hits(/\bz-(?:\[[^\]]+\]|\d+)(?![-\w])/)).toEqual([]);
  });

  it('禁止 arbitrary 阴影', () => {
    // 为什么: Figma 中 0 个 DROP_SHADOW。只有 shadow-overlay / shadow-raised 两档合法。
    expect(hits(/\bshadow-\[[^\]]+\]/)).toEqual([]);
  });

  it('禁止已退休的旧标度名', () => {
    // 圆角与字号都改成了数值命名(rounded-4/8/12/16/20, text-12/14/16/20/24/28),
    // 语义名是过渡期的旧标度,B5/B6 迁完后已全部退休。
    //
    // 🔴 这条规则专门补一个 grep 抓不到的盲区:
    //    本仓库有 83 个 .tsx 含非 UTF-8 字节,BSD grep 默认【静默跳过】它们
    //    (要加 -a 或用 rg --text)。B5 的迁移正是因此漏掉了 OAuthConfigPage.tsx 的 4 处。
    //    本测试用 readFileSync 读全文件,天然没有这个盲区 —— 这也是为什么
    //    护栏要写成测试而不是 shell 脚本。
    // 这两个文件里的旧类名出现在【解释历史的注释】中,是有价值的文档不是残留代码
    const DOC_ONLY = ['shared/ui/card.tsx', 'shared/lib/utils.ts'];
    const radius = hits(/\brounded(?:-(?:t|b|l|r|tl|tr|bl|br))?-(?:sm|md|lg|xl|2xl|3xl|full|none)\b/).filter(
      (h) => !DOC_ONLY.some((d) => h.startsWith(d))
    );
    const size = hits(/\btext-(?:2xs|xs|sm|base|md|lg|xl|2xl|3xl|4xl|5xl|15|badge)\b/);
    const weight = hits(/\bfont-semibold\b/);
    expect({ radius, size, weight }).toEqual({ radius: [], size: [], weight: [] });
  });
});

/* ──────────────────────────────────────────────────────────── 交互 ── */

describe('交互', () => {
  it('焦点环必须用 focus-visible 而非 focus', () => {
    // 为什么: focus: 在鼠标点击时也出环。改造前 136 处 focus: vs 67 处 focus-visible:。
    // 只有 focus:text-* (配合 Radix data-[highlighted] 的文字色) 是合法例外。
    const bad = hits(/\bfocus:(?!text-)[a-z-]+/);
    expect(bad).toEqual([]);
  });

  it('ring-ring 不叠透明度修饰符', () => {
    // 为什么: --ring 本身已含 45% alpha(米白底上要达到 WCAG 2.2 焦点指示 ≥3:1)。
    // 再叠 /20 /30 会掉到 1.6:1 不合格。改造前有 4 种透明度变体并存。
    expect(hits(/\bring-ring\/\d+/)).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────── 样式系统逃逸 ── */

describe('样式系统逃逸', () => {
  it('globals.css 之外没有别的样式表', () => {
    // walk() 只收 .tsx/.ts,这里要单独遍历 —— 用它会永远返回空数组(假通过)
    const css: string[] = [];
    (function scan(dir: string) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) scan(p);
        else if (/\.(css|scss|sass|less)$/.test(p)) css.push(relative(SRC, p));
      }
    })(SRC);
    expect(css.sort()).toEqual(['styles/globals.css']);
  });

  it('禁止 styled-components / emotion', () => {
    expect(hits(/from\s+['"](?:styled-components|@emotion)/)).toEqual([]);
  });

  it('禁止 dark: 前缀', () => {
    // 为什么: 暗色态已于 2026-07 移除(setTheme 零调用点,.dark 从未生效)。
    expect(hits(/\bdark:[a-z-]+/)).toEqual([]);
  });
});
