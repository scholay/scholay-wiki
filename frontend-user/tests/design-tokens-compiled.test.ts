/**
 * 编译期契约 —— 断言 globals.css 的【声明】与 Tailwind 的【实际产出】一致。
 *
 * 为什么需要这一层(design-system-guard 管不到的盲区):
 *   guard 扫的是源码里有没有写违规类名。但本次审计里最贵的几个 bug 属于另一类 ——
 *   **源码完全合规,是 token 层自己的声明与编译结果对不上**,grep 永远查不出来:
 *
 *   1. `--container-max` 在 Tailwind v4 里生成的类名就是 `w-max` / `max-w-max`,
 *      与内建的 max-content 同名且覆盖它 —— 两处线上 `w-max` 被静默压成 1440px 定宽。
 *   2. `--radius-*: initial` 之后裸 `rounded` / `rounded-r` **编译不出任何 CSS**,
 *      Prism 的 diff 块因此静默变直角。
 *   3. globals.css 注释写「封闭后 rounded-full 编译不出类」—— 实际封不住
 *      (它是 static utility,不读 --radius-* 命名空间)。注释与事实相反。
 *   4. CSS 侧 `--duration-*` 根本没有对应的 Tailwind 命名空间,
 *      `duration-base` **编译不出类**,而 globals.css 声称「CSS 与 framer 共用同一组数值」。
 *   5. 字号 token 一旦配上 `--text-14--line-height`,`text-14` 会同时输出 line-height,
 *      **字号档会盖掉字族层行高,整套排印设计当场作废**(globals.css 自己警告过)。
 *
 * 这些都只有把 CSS 真编一遍才能发现。本文件用仓库自己的 tailwindcss 版本编译,
 * 逐类断言产出 —— 是比读注释可靠得多的真相来源。
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compile } from 'tailwindcss';
import { ROOT_TOKENS, tokenValue } from './lib/design-tokens';

const ROOT = join(__dirname, '..');
const GLOBALS = join(ROOT, 'src', 'styles', 'globals.css');

let build: (candidates: string[]) => string;

beforeAll(async () => {
  const css = readFileSync(GLOBALS, 'utf8');
  const compiled = await compile(css, {
    base: ROOT,
    loadStylesheet: async (id: string) => {
      // 相对路径(如 ./fonts/noto-serif-sc.css)按 globals.css 所在目录解析
      if (id.startsWith('.')) {
        const p = resolve(dirname(GLOBALS), id);
        return { base: dirname(p), content: readFileSync(p, 'utf8') };
      }
      // 裸包名:tailwindcss / tw-animate-css
      const candidates = [
        join(ROOT, 'node_modules', id, 'index.css'),
        join(ROOT, 'node_modules', id, 'dist', 'tw-animate.css'),
        join(ROOT, 'node_modules', `${id}.css`),
      ];
      for (const p of candidates) {
        try {
          return { base: dirname(p), content: readFileSync(p, 'utf8') };
        } catch {
          /* 试下一个 */
        }
      }
      // 兜底给空,避免整个测试因为一个可选样式包挂掉
      return { base: ROOT, content: '' };
    },
  });
  build = (c: string[]) => compiled.build(c);
});

/** 取某个工具类编译出的声明块(可能有多条同名规则,全部返回)。 */
function rulesFor(cls: string): string[] {
  const out = build([cls]);
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...out.matchAll(new RegExp(String.raw`\.${esc}\s*\{([^}]*)\}`, 'g'))].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  );
}

const emits = (cls: string) => rulesFor(cls).length > 0;

describe('命名空间封闭 —— 声明为「封闭集合」的必须真的编译不出', () => {
  it('字号 = dev.pen 八档 UI 阶梯 + 64px 展示档', () => {
    for (const ok of ['text-12', 'text-14', 'text-16', 'text-18', 'text-20', 'text-24', 'text-28', 'text-32', 'text-display-64']) {
      expect(emits(ok), `${ok} 应该编译得出`).toBe(true);
    }
    // Tailwind 默认档必须被 --text-*: initial 关掉 —— 否则是「编译得出 + CI 放行」的双重后门
    for (const bad of ['text-10', 'text-11', 'text-display-36', 'text-display-56', 'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-5xl', 'text-9xl']) {
      expect(emits(bad), `${bad} 不该编译得出(命名空间未封闭)`).toBe(false);
    }
  });

  it('圆角只有 4/8/12/16/20 + pill', () => {
    for (const ok of ['rounded-4', 'rounded-8', 'rounded-12', 'rounded-16', 'rounded-20', 'rounded-pill']) {
      expect(emits(ok), `${ok} 应该编译得出`).toBe(true);
    }
    for (const bad of ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl']) {
      expect(emits(bad), `${bad} 不该编译得出`).toBe(false);
    }
  });

  it('裸 rounded / rounded-r 编译不出 —— 写了等于没有圆角(必须靠 guard 类名规则拦)', () => {
    // 这不是「应该修的缺陷」,是必须被记录的既成事实:--radius-*: initial 之后
    // 无档位后缀的 rounded 家族拿不到默认值。Prism diff 块曾因此静默变直角。
    expect(emits('rounded')).toBe(false);
    expect(emits('rounded-r')).toBe(false);
  });

  it('rounded-full / rounded-none 是 static utility —— initial 封不住', () => {
    // globals.css 曾写「封闭后 rounded-full 编译不出类」,与事实相反。
    // 它们硬编码 calc(infinity*1px) / 0,不读 --radius-* 命名空间。
    // 记录在此,提醒:这两个只能靠 design-system-guard 的类名规则拦,不能指望编译器。
    expect(emits('rounded-full')).toBe(true);
    expect(emits('rounded-none')).toBe(true);
  });
});

describe('排印实现陷阱', () => {
  it('字号 token 绝不能附带 line-height', () => {
    // globals.css 自己的警告:「一旦定义 --text-14--line-height,text-14 会同时输出
    // font-size 和 line-height,字号档会盖掉字族层行高,整套设计当场作废」。
    // 行高是按【字族】绑定的(sans 1.25 / display 1.333 / serif 1.437)。
    for (const t of ['text-12', 'text-14', 'text-16', 'text-18', 'text-20', 'text-24', 'text-28', 'text-32', 'text-display-64']) {
      for (const decl of rulesFor(t)) {
        expect(decl, `${t} 输出了 line-height,会盖掉字族层行高`).not.toMatch(/line-height/);
        expect(decl).toMatch(/font-size/);
      }
    }
  });

  it('按字族绑定的行高档位可用', () => {
    for (const l of ['leading-sans', 'leading-display', 'leading-serif', 'leading-paragraph', 'leading-display-tight']) {
      expect(emits(l), `${l} 应该编译得出`).toBe(true);
    }
  });
});

describe('token 命名不得劫持 Tailwind 内建工具类', () => {
  it('w-max / max-w-max / min-w-max 仍然是 max-content', () => {
    // 🔴 本次迁移引入过的真回归:token 曾叫 --container-max,而 Tailwind v4 的
    //    --container-* 命名空间【用后缀直接生成类名】→ 生成的就是 w-max/max-w-max/min-w-max,
    //    与内建同名且排在后面胜出,把 max-content 变成 1440px 定宽。
    //    两处线上代码(SpreadsheetPreview 的表格、MenuDock 的功能坞)被静默压成定宽。
    for (const cls of ['w-max', 'max-w-max', 'min-w-max']) {
      const decls = rulesFor(cls);
      expect(decls.length, `${cls} 应该只有内建那一条规则`).toBe(1);
      expect(decls[0], `${cls} 被 theme token 劫持了`).toMatch(/max-content/);
    }
  });

  it('容器宽 token 走的是不冲突的后缀', () => {
    expect(emits('max-w-page'), 'max-w-page 应该编译得出(Figma §5 的 1440)').toBe(true);
    expect(emits('max-w-reading')).toBe(true);
  });
});

describe('声称「已注册」的 token 必须真的产出工具类', () => {
  // 反面教材:CSS 侧的 --duration-* 从来就没有对应的 Tailwind 命名空间,
  // `duration-base` 编译不出任何东西,而 globals.css 声称「CSS 侧与 framer 共用同一组数值」。
  // 凡是写进 CLAUDE.md「以下是全部可用」的,都必须在这里过一遍。
  it.each([
    ['颜色 · surface', ['bg-background', 'bg-surface-card', 'bg-surface-1', 'bg-surface-2', 'bg-amber-soft']],
    ['颜色 · 文字', ['text-foreground', 'text-subtle', 'text-muted-foreground', 'text-faint', 'text-on-brand', 'text-on-dark']],
    ['颜色 · 边框', ['border-border', 'border-border-hairline', 'border-border-strong', 'border-border-control']],
    ['颜色 · 品牌', ['bg-brand-red', 'bg-brand-green', 'bg-brand-amber']],
    ['颜色 · 状态', ['bg-status-success', 'bg-status-error', 'bg-status-warning', 'text-status-info']],
    ['颜色 · 分类与图表', ['bg-cat-1', 'bg-cat-8', 'text-chart-1', 'stroke-chart-grid']],
    ['控件高度阶梯', ['h-control-xs', 'h-control-sm', 'h-control-md', 'h-control-lg', 'h-control-xl']],
    ['尺寸', ['size-avatar', 'size-icon', 'size-icon-inline']],
    ['层级', ['z-raised', 'z-sticky', 'z-nav', 'z-chrome', 'z-scrim', 'z-overlay', 'z-modal', 'z-popover', 'z-tooltip', 'z-toast', 'z-fx']],
    ['阴影', ['shadow-overlay', 'shadow-raised']],
    ['字间距', ['tracking-code', 'tracking-brand']],
    ['字族', ['font-sans', 'font-serif', 'font-display', 'font-brand', 'font-mono']],
  ])('%s', (_label, classes) => {
    const dead = (classes as string[]).filter((c) => !emits(c));
    expect(dead, `这些 token 写进了文档但编译不出类:\n${dead.join(', ')}`).toEqual([]);
  });

  it('duration-* 四档必须真能编译出 transition-duration(曾是本文件最贵的一处缺口)', () => {
    // ⏪ 这条曾是**反向**断言(`expect(broken.length).toBe(4)`)—— 把「四个类一个都编译不出」
    //    的既成事实钉住,免得下一轮审计再花一遍力气重新发现。2026-07-28 缺口已修,
    //    按它自己的注释翻成正向。
    //
    // 根因(留档,因为它是一类**静默失效**,肉眼只会觉得「动画有点生硬」):
    //    Tailwind v4 的 `duration-*` 工具类读的是 **`--transition-duration-*`** 命名空间
    //    (tailwindcss@4.3.0 源码 `valueThemeKeys: ['--transition-duration']`),
    //    而 globals.css 把值声明成 `--duration-*` —— **名字差一截前缀,一个类都生成不出来**。
    //    修法是在 `@theme inline` 里补一层别名:`--transition-duration-base: var(--duration-base)`。
    //
    // 🔴 断言到**声明内容**而不止「编译得出」:光看 emits() 的话,将来有人把别名指错
    //    (比如 `--transition-duration-base: var(--duration-slow)`)照样绿。
    for (const name of ['fast', 'base', 'slow', 'deliberate']) {
      const decls = rulesFor(`duration-${name}`);
      expect(decls.length, `duration-${name} 编译不出类 —— @theme 的 --transition-duration-${name} 别名没了?`)
        .toBeGreaterThan(0);
      expect(decls.join(' '), `duration-${name} 没有指向 --duration-${name}`).toMatch(
        new RegExp(String.raw`transition-duration:\s*var\(--duration-${name}\)`)
      );
    }
    // ease 一直是好的 —— 它走 --ease-* 命名空间,Tailwind v4 认
    for (const e of ['ease-out', 'ease-in-out', 'ease-emphasized']) expect(emits(e)).toBe(true);
  });

  it('本轮新增的 token 必须真能编译出类(blur-2 / leading-code)', () => {
    // 建 token 的同时在这里加一条断言 —— 本文件顶部的约定。
    // ⚠️ `blur-2` 与 `backdrop-blur-2` 是**两个**命名空间的消费者,分别断言:
    //    dialog / sheet / ai-overlay / dialog-chrome 四处遮罩用的是后者。
    for (const c of ['blur-2', 'backdrop-blur-2', 'leading-code']) {
      expect(emits(c), `${c} 编译不出类`).toBe(true);
    }
    expect(rulesFor('backdrop-blur-2').join(' ')).toMatch(/var\(--blur-2\)/);
    expect(rulesFor('leading-code').join(' ')).toMatch(/var\(--leading-code\)/);
    // 起名不得劫持内建:`blur-2` 落地前 8 个内建 blur 档必须原样还在
    // (--container-max 劫持 w-max 是本仓库付过学费的真回归)。
    for (const b of ['blur-xs', 'blur-sm', 'blur-md', 'blur-lg', 'blur-xl', 'blur-2xl', 'blur-3xl']) {
      expect(emits(b), `${b} 被 --blur-2 的注册连带影响了`).toBe(true);
    }
  });
});

describe('关键 token 的取值', () => {
  // ⚠️ `@theme inline` 产出的工具类里是 `var(--x)` 引用,不是字面值
  //    (globals.css:「值被内联进工具类,不重复发一份变量」指的是不重复发 --color-* 那层)。
  //    所以取值断言要分两段:① 工具类指向正确的变量 ② :root 里那个变量是正确的值。
  //    只断言其中一段都会漏 —— 只查工具类查不出值改错,只查 :root 查不出接线接错。
  //
  // 🔴 2026-07-28:这里曾经是一份**按文本读 :root 的正则**,看不穿一层 `var()` ——
  //    品牌三色接线到色阶原语(`--brand-red: var(--red-5)`)当天,本用例就红了,
  //    报的是 `expected 'var(--red-5)' to match /#882828/`。那不是接线接错,是断言瞎了。
  //    现在改用 tests/lib/design-tokens.ts 的 `tokenValue()`,它**递归解引用 var()**。
  // 🚫 当时另一条「更省事」的路是去 globals.css 写 `var(--red-5, #882828)` 骗过正则 ——
  //    绝不能那么做:那样 `--red-5` 被改坏时本契约仍会因为 fallback 文本而显绿,
  //    比根本不接线更坏(护栏显绿 = 没人再看)。
  // ⚠️ 解析逻辑**只有那一份**,design-system-guard.test.ts 的跨包镜像规则用的是同一个函数。
  const rootValue = (name: string): string => tokenValue(`--${name}`);

  it('页面底是米白、卡片底是纯白 —— 分层全靠这 3.5% 明度差', () => {
    expect(rulesFor('bg-background').join()).toMatch(/var\(--background\)/);
    expect(rootValue('background')).toMatch(/#F6F4EE/i);
    expect(rulesFor('bg-surface-card').join()).toMatch(/var\(--surface-card\)/);
    expect(rootValue('surface-card')).toMatch(/#FFFFFF/i);
  });

  it('品牌三色 = dev.pen 色板基准色', () => {
    expect(rulesFor('bg-brand-red').join()).toMatch(/var\(--brand-red\)/);
    expect(rootValue('brand-red')).toMatch(/#882828/i);
    expect(rootValue('brand-green')).toMatch(/#2F4D29/i);
    expect(rootValue('brand-amber')).toMatch(/#B4880E/i);
  });

  it('品牌三色是**接在色阶原语上**的,不是又抄了一份字面 hex', () => {
    // 上一条查的是「值对不对」,这条查「怎么来的」。两者不等价:
    // 把 `--brand-red` 改回字面 `#882828` 上一条照样绿,而那正是 2026-07-28 之前的状态 ——
    // 色阶原语与语义 token 各存一份同样的 hex,改色阶时语义层不会跟着动(静默漂移)。
    // ⚠️ 断言的是**未解引用的原始声明**,所以这里直接读 ROOT_TOKENS 而不是 tokenValue()。
    expect(ROOT_TOKENS.get('--brand-red'), '--brand-red 应当接 --red-5').toBe('var(--red-5)');
    expect(ROOT_TOKENS.get('--brand-green'), '--brand-green 应当接 --green-3').toBe('var(--green-3)');
    expect(ROOT_TOKENS.get('--brand-amber'), '--brand-amber 应当接 --amber-4').toBe('var(--amber-4)');
    // 并且原语那一端的值必须仍是基准色 —— 否则「接线」只是把漂移挪了个位置
    expect(ROOT_TOKENS.get('--red-5')).toMatch(/#882828/i);
    expect(ROOT_TOKENS.get('--green-3')).toMatch(/#2F4D29/i);
    expect(ROOT_TOKENS.get('--amber-4')).toMatch(/#B4880E/i);
  });

  it('Neutral 使用实际色块 #1F1F23，Primary 映射到朱砂', () => {
    // dev.pen 的 Neutral 标题文本写 #141414，但基准色块与组件实际填充均为 #1F1F23。
    expect(rootValue('foreground')).toMatch(/#1F1F23/i);
    expect(ROOT_TOKENS.get('--primary')).toBe('var(--brand-red)');
    expect(rootValue('primary')).toMatch(/#882828/i);
  });

  it('Logo / Scholay 字标专用色冻结，不跟随主题琥珀变色', () => {
    // 用原始声明断言，保证四色仍是独立字面量，不会被改成 var(--brand-*) 联动。
    expect(ROOT_TOKENS.get('--logo-red')).toBe('#882828');
    expect(ROOT_TOKENS.get('--logo-amber')).toBe('#F1BF45');
    expect(ROOT_TOKENS.get('--logo-green')).toBe('#427935');
    expect(ROOT_TOKENS.get('--logo-ink')).toBe('#000000');

    expect(rootValue('brand-amber')).toBe('#B4880E');
    expect(rootValue('brand-amber').toUpperCase()).not.toBe(rootValue('logo-amber').toUpperCase());
  });

  it('正文基准 = 14px(Figma 点名要干掉 13)', () => {
    expect(rulesFor('text-14').join()).toMatch(/var\(--text-14\)/);
    expect(rootValue('text-14')).toBe('0.875rem');
    // body 的隐式继承源头也必须是它 —— B6 迁了 2792 处类名却漏了 body,
    // 导致所有没写字号类的元素长期停在规范外的 13px(既不在六档内,又恰是 Figma 点名要删的值)。
    // 注意 globals.css 里有两个含 body 的规则(`html, body {…}` 与 `body {…}`),
    // 取全部再看有没有任何一个声明了 font-size —— 只匹第一个会撞上前者。
    const css = readFileSync(GLOBALS, 'utf8');
    const bodyBlocks = [...css.matchAll(/(?:^|\n)\s*(?:html,\s*)?body\s*\{([\s\S]*?)\n\s*\}/g)].map((m) => m[1]);
    const withFontSize = bodyBlocks.filter((b) => /font-size:/.test(b));
    expect(withFontSize.length, 'body 应当且只当声明一次 font-size').toBe(1);
    expect(withFontSize[0], 'body 的 font-size 必须指向 --text-14').toMatch(/font-size:\s*var\(--text-14\)/);
  });

  it('主力容器圆角 = 16(Figma 设计稿唯一实测到的容器圆角)', () => {
    expect(rulesFor('rounded-16').join()).toMatch(/var\(--radius-16\)/);
    expect(readFileSync(GLOBALS, 'utf8')).toMatch(/--radius-16:\s*1rem/);
  });
});
