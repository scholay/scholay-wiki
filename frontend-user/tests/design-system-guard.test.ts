/**
 * 设计系统护栏 —— 防止 2026-07 Figma 换真源的成果回潮。
 *
 * 这些规则在 CLAUDE.md §5「禁止」里都有文字说明,但文字管不住人(和 AI)。
 * 本文件把它们变成构建期硬失败 —— `npm run build` 的 prebuild 钩子会跑本文件
 * (见 package.json `test:design`)。**改这里之前先想清楚:放宽一条 = 放弃一块阵地。**
 *
 * 每条规则都记录了【为什么】—— 不是教条,是这次改造里真实付出过代价的东西。
 * 需要豁免时在对应的 ALLOW 列表里加,并写清理由。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 2026-07-27 审计后重写。上一版有五类缺陷,每一类都被实测证明会漏放违规:
 *   1. hits() 没有 /g —— **一行只记首个匹配**。讽刺的是该文件当时还自夸
 *      「写成测试就没有 grep 的盲区」,而它犯的正是 BSD grep -o 的同款错误。
 *      实测 hex 规则因此漏计 18 处,「往已经违规的行上再追加一个违规」完全免费。
 *   2. hex 正则只认 6 位 —— 3 位简写 `#111` 与 8 位带 alpha `#1111111f` 畅通。
 *   3. 旧标度正则要求带档位后缀 —— **放行裸 `rounded`**,已造成 Prism diff 块
 *      三处 `rounded-r` 在 `--radius-*: initial` 之后静默编译不出任何 CSS。
 *   4. 三条 ALLOW 各豁免 0 处 —— 名义上的白名单,实为三个目录的永久后门。
 *   5. 棘轮基线从设立起一格未走,且「故意提交 text-[13px] 看 CI fail」实测不会 fail。
 * ────────────────────────────────────────────────────────────────────────────
 * 2026-07-28 第二轮。上一版**自己又犯了它点名批评过的每一类错**,逐条实测:
 *   1. stripComments 不认正则字面量 —— `.replace(/'/g, '"')` 之后引号配对全体错位,
 *      注释被当代码、或反过来把半行代码当注释吃掉。实测影响 16 个文件(见函数头)。
 *   2. 正则口径仍有系统性盲区:hex 漏 4 位 `#RGBA`;字号只认「纯数字+单位」,
 *      对 `clamp()` 全盲(实测漏 6 处 landing 展示级字号);inline style 只认裸数字,
 *      `fontSize: '12px'` 这种**加个引号就免罚**。
 *   3. rgba 规则仍是黑名单制 —— 列了 7 个已知三元组,等于公告「别的随便写」。
 *      本轮改白名单:只放行 `rgb(var(--token) …)`,其余一律计数。
 *   4. 死 token 的 registered 提取用 `^\s*--color-x:` **行首锚**,而 globals.css 是
 *      一行两声明 —— cat-2/4/6/8、cat-*-soft、chart-2/4/6/8 共 12 个 token
 *      **从未进入过检测**(实测其中 4 个是死的)。
 *   5. KNOWN_DEAD 37 项里有 14 项早已被接线复活,规则自己写着「收口一个就删一个」却没删 ——
 *      于是它们将来再次失去消费者时不会报警。
 *   6. 「零命中死豁免」原样复发:rgba 规则的 figure/ 与 share/ 两条 ALLOW **各豁免 0 处**,
 *      而 share/ 的理由(「html-to-image 离屏克隆丢 CSS 变量」)正是同一个文件在
 *      hex 规则的 ALLOW 注释里亲手证伪过的那条。已删。
 *   新增五条防线(见各自的【为什么】):退休品牌色零容忍 / JS 字符串里的裸 CSS /
 *   arbitrary px 尺寸 / leading·shadow 非 token 档 / framer-motion duration 字面量。
 * ────────────────────────────────────────────────────────────────────────────
 * 2026-07-28 第三轮。只做一件事:把「两份拷贝必须一致」这一族规则从**值出现过**
 * 加固到**值绑在哪个名字上**。两处同病,一起治:
 *   1. 跨包镜像 —— 旧口径问「`: #882828` 出现过吗」。实测:把 app.wxss 的
 *      `--red` 改成 #993333 规则照样绿,因为三行后的 `--brand: #882828` 兜着。
 *      现在按 **globals token → 该镜像里的具体变量名**逐个绑定、逐个比值,
 *      一对多必须列全(`--brand-red` → `--red` + `--brand`)。顺带把覆盖面从
 *      5 个 token 扩到表面/文字/边框/品牌/状态软底/logo 全套(值逐条实测对齐)。
 *   2. 动效对齐 —— 旧的两条只查**集合归属**(「0.42 是四档之一吗」),
 *      而 motion.ts 每个预设的 JSDoc 都声明了绑哪一档。实测:把 FADE 的 0.16
 *      换成 0.42(另一个合法档)两条规则全绿,蒙层淡入却从 160ms 变 420ms。
 *   新增两条:CSS 镜像的「同值却未登记」自维护检查(补上 pptxNative 早就有、
 *   两份 CSS 镜像一直没有的「新变量必须登记」防线)、预设绑定核对。
 *   BRAND 字段快照也从手写名单改成**由矩阵算出**(手写的第二份名单迟早分叉)。
 * ────────────────────────────────────────────────────────────────────────────
 * 2026-07-28 第四轮。对抗验证的结论是「正面打不穿,侧面有洞」—— 本轮只堵侧面,
 * 一条规则的**覆盖范围**都没动。每个洞都先用实际扰动实验证明「改前绿 / 改后红」:
 *   1. **别名链只解一层**(resolveAll)。`--x: var(--red)` + `--x: #993333` 两处声明,
 *      上一版 `decls.get(name)?.[0]` 只看第一处 → 全绿,而 CSS 里后声明胜出,
 *      小程序主 CTA 实际已是 #993333。现在穷尽展开每条分支,每条都要对(带防环)。
 *   2. **写错值反而安静**(颜色声明对账)。上一版的反查判据是「值恰好等于某个 token」,
 *      于是未登记变量**只在写对时**才被追究 —— `--accent-2: #993333` 实测全绿,
 *      约 59 个变量共享这条免检通道。现在改成对账:文件里**每一个**颜色声明
 *      要么 bind 要么 derived(带理由),漏一个红、死条目也红。
 *   3. **非声明位置全盲**(新增一条)。上一版只解析 `--x: value`,而直接写进
 *      background / border / gradient / 三元表达式的字面色**一处也看不见** ——
 *      pptxNative 文件头自陈的那次真实回归(内联 2A7A2A + 体系外 C0392B)正是这形态,
 *      当时被发现纯属侥幸(2A7A2A 恰在退休名单上)。实测:换成没进过退休名单的
 *      `'2F7A2F'`,改前 41 条用例一条不红。
 *   4. **正则字符集**(CSS_VAR / TS_KEY)。CSS 自定义属性大小写敏感且允许 `_`,
 *      `--Primary` / `--brand_alt` 对上一版的 `(--[a-z0-9-]+)` **完全隐身**;
 *      TS 侧带引号的键 `'x-tint': '993333'` 同时逃过 mirrorDecls 与 BRAND 字段对账
 *      (两条规则都靠 `([A-Za-z][A-Za-z0-9]*)` 枚举字段)。两处实测均为改前全绿。
 *   5. **修一处误报**(sameValue)。`--tracking-brand` 从 `-0.03em` 写成 CSS 完全等价的
 *      `-.03em` 被判红 —— 非颜色值退化成了「压空白逐字相等」。现在中间加一级
 *      「数值 + 单位」归一(覆盖 1.6↔1.60 / -.03↔-0.03 / 0↔0px)。
 *      **误报比漏报更危险**:漏报少抓一个,误报会让下一个人来放宽规则。
 *   6. **空转下限挂到矩阵规模上**。上一版是 `MIRROR_PRESENT.length * 2`(实际下限 6),
 *      而矩阵有 51 条 bind / 52 个绑定变量 —— 实测删掉 10 条(42 个绑定)那条空转
 *      断言照样绿。现在下限 = MIN_BOUND_VARS,「矩阵被精简」这件事本身即报警。
 *
 * ⚠️ 本轮**已知未动**的:跨包矩阵的覆盖范围(同包里 app.json / icons.ts / wxml /
 *    _shared/convert.js / favicon.svg / email_template.go 等约 23 个持有品牌字面值的
 *    文件仍无人看管)、长度族(圆角 / 字号)的三单位换算。那是下一棒的事,
 *    本轮只改判定机制,不改覆盖范围 —— 两件事混在一次改动里会让「哪条规则在保护什么」
 *    重新变得说不清。
 * ────────────────────────────────────────────────────────────────────────────
 * 2026-07-28 第五轮。上一轮结尾那句「约 23 个文件仍无人看管」就是本轮的全部内容
 * (漏洞 E)。它是所有洞里**危害最大**的一个,因为它不需要任何技巧就能绕过 ——
 * 不是绕过规则,而是**站在规则的射程之外**:实测把 miniprogram/lib/icons.ts 的
 * 红/绿/文字色全改坏,41 条用例全绿;哪怕改成的 #111111 就在退休名单上,
 * 「退休色残留」也不响,因为它只扫 frontend-user/src + 矩阵里那三份文件。
 *
 * 新增一族「全仓资产」规则(见文件末尾同名 describe),四条:
 *   1. **退休品牌色零容忍 —— 全仓口径**。射程从「src + 三份镜像」扩到整个仓库
 *      (排除 node_modules / 构建产物 / docs 与 .md / .pen 旧真源 / 采集素材,
 *       每条排除都写了理由)。这是最自维护的一条:靶子是 8 个具体的值,
 *      不需要任何人登记任何东西,任何包里写下退休色都会红。
 *   2. **反向扫描**:拿 globals.css 的**当前值**去全仓反查,持有品牌真值却不在
 *      矩阵里的文件一律报「无人看管」。判据自维护 —— token 改值,靶子跟着改。
 *   3. **字面值镜像的值断言**:上一条登记进来的 26 个文件,逐个要求
 *      「文件里每一个颜色都能追溯到 globals 的当前值,否则具名豁免并写理由」。
 *   4. **副本必须与源逐字节一致**:scholay-minitools 的 build.sh 把 _shared/ cp 进
 *      7 个工具目录,那 14 份副本此前也无人看管。
 *
 * 顺带补了两个**退休的蓝**(#1A56DB / #1E5FA8)—— 两份 CSS 镜像的文件头自己
 * 把 #1a56db 列在「落后两代」的清单里,而没有任何规则拦它。
 *
 * ⚠️ 本轮**已知且刻意不做**的:长度族(圆角 / 字号 / 间距)的跨包对齐。
 *    globals 用 rem、brand.css 用 px、app.wxss 用 rpx,三种单位;而 `--radius-pill`
 *    是 `9999px` ↔ `9999rpx`,**不服从**任何换算系数。硬套一个系数造出来的是一条
 *    注定误报的规则,而误报的下场从来是规则被放宽 —— 宁可把缺口明说。
 *    要补请单独立一条**带单位换算表**的规则,别混进颜色族。(已写进 blockers。)
 * ────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT_TOKENS, stripCssComments, tokenValue } from './lib/design-tokens';

const SRC = join(__dirname, '..', 'src');
const GLOBALS = join(SRC, 'styles', 'globals.css');
/** 仓库根 —— 「跨包镜像」那条规则要读 frontend-user/ 之外的三个兄弟包。 */
const REPO = join(__dirname, '..', '..');

/**
 * ⚠️ `walk` / `stripComments` / `hits` 三个函数**导出**是有意的。
 * CLAUDE.md 曾写「要拿到与 guard 一致的剥注释口径,照抄这三个函数跑一遍即可」——
 * 而「照抄」正是本轮反复付出代价的那类做法(计数口径一分叉,文档里的数就开始
 * 和 CI 里的数各说各话:半档间距同时存在 1293 / 1401 / 1423 三个数就是这么来的)。
 * 导出之后,盘点脚本 `import` 它们即可,口径永远只有一份。
 */
export function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * 把注释内容抹成空格(保留换行与列位置,行号不变)。
 *
 * 为什么必须做: 本文件的规则全是「找类名字面量」,而注释里【必然】会出现这些词 ——
 * 解释「为什么这里的 outline-none 是合法的」「白字在 #E5A800 上只有 2.11:1」的注释,
 * 会被原样计成违规。上一版没做这件事,直接后果是**写解释性注释会让 CI 变红**,
 * 而这恰恰惩罚了唯一能让后人看懂决策的行为。
 *
 * 顺带取代了旧版的 DOC_ONLY 白名单(card.tsx / utils.ts 因为注释里提到旧类名而被豁免整个文件)。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 2026-07-28: 补上第六个状态 —— **正则字面量**。上一版只认 `'` `"` `` ` `` 三种引号,
 * 于是【正则内部的引号】会被当成字符串的开引号,其后整个文件的引号配对全体错位。
 * 两种方向的伤害都实测到了:
 *   ① 注释被当代码 —— DimensionCell.tsx:213 的 `.replace(/'/g, '"')` 之后,
 *      :225-238 的整段块注释原样进入计数,注释里举例的两个 #2F4D29 被算进 hex 棘轮。
 *   ② 代码被当注释 —— `/^https?:\/\//` 这类正则里的 `\/` + `/` 被识别成行注释起始,
 *      **该行剩余部分被整段抹掉**(MenuCarousel / RouteSEO / ShareSheet / crossref …)。
 *      被抹掉的地方要是写了违规类名,护栏永远看不见。
 * 修完实测:16 个文件的剥离结果改变,hex 棘轮 9 → 7(那 2 处本来就是注释)。
 *
 * 判定方法:在 code 态遇到 `/`,看**前一个非空 token**决定它是除号还是正则起始。
 * ⚠️ `<` `}` `)` `]` 刻意**不算**「正则起始前驱」:
 *    - `<` → JSX 闭合标签 `</div>`;
 *    - `}` → JSX 自闭合 `<Foo bar={x} />`,若判成正则会把后面半行当正则体吞掉。
 *    这两个是本函数最容易写错的地方,改之前先想清楚 JSX。
 */
/** `/` 之前出现这些收尾时,它是正则字面量的起始而不是除号。 */
const RE_LITERAL_BEFORE =
  /(?:[(,;:=!&|?+\-*%~^[{]|=>|\b(?:return|typeof|instanceof|in|of|new|delete|void|do|else|case|yield|await))$/;

export function stripComments(src: string): string {
  let out = '';
  let tail = ''; // 最近产出的若干个代码字符(判 `/` 用)。截断是为了避免 O(n²)。
  let i = 0;
  let state: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' = 'code';
  const push = (s: string) => { out += s; tail = (tail + s).slice(-24); };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (state === 'code') {
      // 排除 URL 里的 `//`(https://…):前一个非空字符是 `:` 就不当注释
      if (c === '/' && n === '/' && src[i - 1] !== ':') { state = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { state = 'block'; out += '  '; i += 2; continue; }
      if (c === '/' && RE_LITERAL_BEFORE.test(tail.replace(/\s+$/, ''))) {
        // 正则字面量:整体原样搬运,内部的引号不参与字符串配对
        let j = i + 1;
        let inClass = false;
        for (; j < src.length; j++) {
          const d = src[j];
          if (d === '\\') { j++; continue; }
          if (d === '\n') { j = -1; break; } // 同行未闭合 → 判定失败,退回当除号处理
          if (inClass) { if (d === ']') inClass = false; continue; }
          if (d === '[') inClass = true;
          else if (d === '/') break;
        }
        if (j > 0 && j < src.length) {
          let k = j + 1;
          while (k < src.length && /[dgimsuvy]/.test(src[k])) k++; // 标志位
          push(src.slice(i, k));
          i = k;
          continue;
        }
      }
      if (c === "'") state = 'sq';
      else if (c === '"') state = 'dq';
      else if (c === '`') state = 'tpl';
      push(c); i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; } else out += ' ';
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? c : ' '; i++; continue;
    }
    // 字符串内:原样保留,遇到转义跳两个字符
    if (c === '\\') { push(src.slice(i, i + 2)); i += 2; continue; }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) state = 'code';
    push(c); i++;
  }
  return out;
}

const FILES = walk(SRC).map((p) => {
  const raw = readFileSync(p, 'utf8');
  return { path: relative(SRC, p), text: stripComments(raw), raw };
});
const ALL_SRC = FILES.map((f) => f.text).join('\n');
const CSS = readFileSync(GLOBALS, 'utf8');

/**
 * CSS 剥注释 + `:root` token 表 + **穿透 var() 的取值**。
 *
 * 🔴 三者都从 [tests/lib/design-tokens.ts](lib/design-tokens.ts) 导入,**本文件不再自持一份**。
 *    2026-07-28 收尾时这份实现一度存在两处(本文件一份带解引用、
 *    design-tokens-compiled.test.ts 一份纯文本正则),后者因为看不穿
 *    `--brand-red: var(--red-5)` 当场变红 —— 那正是「口径分叉」的即时代价。
 *    现在只有一份,两个测试文件同时 import。
 * ⚠️ 那个模块**没有 .test. 中缀**,vitest 不会把它当测试文件收走
 *    (若把公共逻辑留在本文件里让别的测试文件 import,本文件的 38 条用例
 *     会被重复注册进对方的 suite —— 这是不能直接 import 测试文件的原因)。
 */
export { stripCssComments, tokenValue };

/**
 * 退休品牌色 —— **三条规则共用同一份**(src 侧的零容忍 + 跨包镜像的反向断言 +
 * 2026-07-28 第五轮新增的**全仓**零容忍)。
 *
 * 提成模块级常量是有意的:这份名单一旦分叉,「src 里禁了、镜像里没禁」就会重演
 * 2026-07-28 之前的实况(三个镜像同时落后两代,而 51 条护栏全绿)。
 */
const RETIRED_BRAND: [string, string][] = [
  ['CC2222', '一代品牌红(现 --brand-red #882828)'],
  ['CD2323', '海报里漂移出来的第二个红'],
  ['2A7A2A', '两代前的品牌绿(现 --brand-green #2F4D29)'],
  ['D4A017', '一代品牌琥珀(现 --brand-amber #E5A800)'],
  ['DD9D13', '琥珀的另一个变体'],
  ['111111', '旧「纯黑」(现玄墨 --foreground #1F1F23)'],
  // ── 2026-07-28 第五轮补两个**蓝**。它们此前不在名单里,而蓝系早已整族退休
  //    (Figma 四色阶完全没有蓝,期刊线改用琥珀 —— 见 docs/design-migration-ledger)。
  //    证据不是推测:两份 CSS 镜像的文件头**自己**把 #1a56db 列在「落后两代」的清单里,
  //    却没有任何一条规则拦它。实测新增后全仓只多出 1 处命中(见 RETIRED_DEBT)。
  ['1A56DB', '退休的品牌蓝(期刊线已改琥珀;现存的蓝只有 --cat-blue / --status-info #2E5AA8)'],
  ['1E5FA8', '海报/分享者头像里漂移出来的第二个蓝(与 CD2323 同一类:体系里从来没有过这个值)'],
];

/**
 * 退休色的可搜形态 —— 也**只能有这一份**。全部**不含 `#`**,由调用方按语境加前缀。
 *   forms   : 全部 hex 位数变体(6 / 8 带 alpha / 3 位简写 / 4 位带 alpha)。
 *             ⚠️ 只能配 `#` 前缀使用。3 位简写去掉 `#` 之后就是「三个数字」,
 *                裸着匹配会把 `z-index: 1110` 这种无辜数字判成 #111 —— 误报比漏报更贵,
 *                因为它会逼下一个人去放宽规则。
 *   sixOnly : 只有 6 / 8 位变体。给「引号包裹的裸六位」用(pptxgenjs 的口径)。
 *   triples : `rgb()` 整数三元组 —— 它对类名规则与 hex 规则**同时隐身**,
 *             是实测抓到过的真实逃逸路径(`rgba(42, 122, 42, 0.12)` = #2A7A2A)。
 */
/**
 * 科研绘图素材区 —— 退休色规则的**唯一**豁免,src 侧那条与全仓那条**共用这一个常量**。
 * (路径相对 `src/`;全仓那条自己加 `frontend-user/src/` 前缀。)
 *
 * 🔴 不许各写各的:这正是「src 里禁了、镜像里没禁」那类事故的机制 ——
 *    同一个豁免写成两份,总有一份先被人改。
 */
const SCI_FIGURE_DIR = 'features/claw/components/figure/';

function retiredForms(): { forms: string[]; sixOnly: string[]; triples: string[] } {
  const forms: string[] = [];
  const sixOnly: string[] = [];
  const triples: string[] = [];
  for (const [hex] of RETIRED_BRAND) {
    const six = String.raw`${hex}(?:[0-9a-f]{2})?`;
    forms.push(six);
    sixOnly.push(six);
    if (hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5])
      forms.push(String.raw`${hex[0]}${hex[2]}${hex[4]}[0-9a-f]?`);
    const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
    triples.push(String.raw`${r}\s*[,\s]\s*${g}\s*[,\s]\s*${b}`);
  }
  return { forms, sixOnly, triples };
}

/**
 * 命中项格式化成可定位的 file:line。
 * ⚠️ 强制全局匹配 —— 一行上的**每一处**违规都要计数。
 *    上一版漏了 /g,导致同一行的第二个违规永远免费。
 */
export function hits(re: RegExp, filter?: (f: { path: string }) => boolean) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const out: string[] = [];
  for (const f of FILES) {
    if (filter && !filter(f)) continue;
    f.text.split('\n').forEach((line, i) => {
      g.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = g.exec(line))) {
        out.push(`${f.path}:${i + 1}  «${m[0]}»`);
        if (m[0] === '') g.lastIndex++;
      }
    });
  }
  return out;
}

const notIn = (allow: string[]) => (h: string) => !allow.some((a) => h.startsWith(a));

/**
 * 棘轮断言:只减不增。附带把「现在实际是多少」打进失败信息,方便收紧基线。
 *
 * 🔴 **基线必须永远等于实测值,不留余量。** 2026-07-28 收尾时实测:五条棘轮合计
 *    有 **121 格**未压实的余量(hex 40/实测 7、inline style 41/实测 1、
 *    半档 1357/实测 1293、outline-none 28/实测 22、arbitrary 字号 19/实测 12)。
 *    余量不是「缓冲」而是**免费违规额度** —— 有 33 格余量的 hex 规则,意味着
 *    任何人可以再硬编码 33 个颜色而 CI 全绿,而这条规则的存在意义正是拦第 1 个。
 *    这也解释了为什么上一版的棘轮「设立后一格未走」:它们从设立那天起就没顶着债。
 *
 *    **收口了就当场压基线**。重新测量所有棘轮的当前值:
 *        RATCHET_REPORT=1 npx vitest run tests/design-system-guard.test.ts
 *    (只在设了环境变量时打印,免得每次 prebuild 都刷屏。)
 */
function ratchet(label: string, found: string[], baseline: number) {
  if (process.env.RATCHET_REPORT) {
    console.log(`RATCHET\t${label}\t${found.length}\t(基线 ${baseline})`);
    // RATCHET_REPORT=full 连命中清单一起打 —— 压基线时要看的就是「剩下这几处到底是什么」。
    if (process.env.RATCHET_REPORT === 'full') for (const h of found) console.log(`        ${h}`);
  }
  expect(
    found.length,
    `${label}: 当前 ${found.length} 处 > 基线 ${baseline}。新增的:\n${found.slice(0, 25).join('\n')}` +
      (found.length < baseline ? '' : '\n(若确属必要,先在 PR 里说明理由再调基线)')
  ).toBeLessThanOrEqual(baseline);
}

/* ────────────────────────────────────────────────────────────── 颜色 ── */

/**
 * 颜色类名的前缀表 —— 两条色板规则**必须共用同一份**。
 *
 * 2026-07-28: 上一版两条规则各写各的,white/black 那条比默认色板那条少了
 * `decoration|accent|caret|placeholder` 四个前缀(于是 `caret-white` 免罚),
 * 而两条**都**漏了方向性 border 变体(`border-t-red-500` / `border-b-white`)——
 * Tailwind 的 `border-{x,y,t,r,b,l,s,e}-<color>` 是完全合法的写法,只是没人想到。
 * 提成常量就是为了让「补一个前缀」这件事不可能只补一半。
 */
const COLOR_PREFIX =
  '(?:text|bg|border(?:-[xytrbles])?|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|placeholder|shadow)';

describe('颜色', () => {
  it('禁止 Tailwind 默认色板类名', () => {
    // 为什么: 不在 token 里就是没有。改造前这条守住了(0 命中),要保持。
    const re = new RegExp(
      String.raw`\b${COLOR_PREFIX}-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|\d{2,3}|950)\b`
    );
    expect(hits(re)).toEqual([]);
  });

  it('禁止 white / black 默认色', () => {
    // 为什么: 它们不符合「色名-数字」形态,是 grep 查不出的后门。
    // 改造前有 127 处从这里溜进来,而当时的审计报告写着「默认色板 0 处」。
    //
    // 2026-07-27: 上一版的三条 ALLOW(landing / share / prism-Latex)实测【各豁免 0 处】,
    // 是纯粹的后门,已删除。深底上的白请用 --on-dark / --on-brand。
    const re = new RegExp(String.raw`\b${COLOR_PREFIX}-(?:white|black)\b`);
    expect(hits(re)).toEqual([]);
  });

  it('rgb()/rgba() 只放行 var(--token) 形态(白名单制)', () => {
    // 为什么: rgba(15,23,42,.08) 就是 slate-900。改造前 7 处阴影从这个后门进来,
    // 类名层的规则完全查不到。裸 rgba(0,0,0,*) 同理 —— 阴影颜色必须锚到玄墨。
    //
    // 🔴 2026-07-28 从**黑名单**改成**白名单**。上一版列了 7 个已知三元组
    //    (slate-900 / gray-900 / zinc-900 / 泛灰 / 裸黑 / 裸白),等于公告
    //    「这 7 个之外随便写」—— 而颜色空间有 1600 万个值。同一轮审计里就抓到
    //    `rgba(42,122,42,0.12)`(= 两代前的品牌绿 #2A7A2A)对**当时全部两条颜色规则
    //    同时隐身**:类名规则看不见 rgba,黑名单里没有这个三元组。
    //
    // 白名单口径: 只有「把 token 拆成通道再叠 alpha」这一种合法用法,形如
    //    `rgb(var(--ink-rgb) / 12%)`。其余一律计数 —— 包括 hsl()。
    //    真要写字面值(第三方库主题 / 导出素材),去 shared/lib/theme-bridge.ts,
    //    那里是设计系统里**唯一**允许 token → 字面值的落点。
    //
    // ⚠️ 上一版的两条 ALLOW(figure/ 与 share/)**各豁免 0 处**,已于 2026-07-28 删除。
    //    share/ 那条的理由(「html-to-image 离屏克隆丢 CSS 变量」)更是下面 hex 规则的
    //    ALLOW 注释里亲手证伪过的 —— 零命中的豁免不是保险,是留给下一个人的后门。
    const re = /\b(?:rgba?|hsla?)\(\s*(?!var\(\s*--)/;
    expect(hits(re)).toEqual([]);
  });

  it('退休品牌色零容忍 —— hex 与 rgb() 两种形态', () => {
    // 为什么: 这不是「风格偏好」而是**换代残留**。品牌色在 2026-07 换到 Figma 真源之前
    // 走过两代,老值散落在各处;它们与现行值只差几个色阶,肉眼分辨不出,
    // 却会让同一个语义在两个页面上是两种颜色(海报的 #CD2323 就是这么漂的)。
    // 所以这条**不设棘轮**:退休色一处都不许有,不存在「先钉住再慢慢收」。
    //
    // 🔴 两种形态一起匹配,缺一不可:
    //   ① hex —— 3/4/6/8 位、大小写不敏感(`#c22` 展开就是 `#CC2222`);
    //   ② rgb() 整数三元组 —— `rgba(42, 122, 42, 0.12)` 就是 #2A7A2A,
    //      它对类名规则和 hex 规则**同时隐身**,是本轮实测抓到的真实逃逸路径。
    //
    // 2026-07-28: 名单与形态构造提到模块级 RETIRED_BRAND / retiredForms() ——
    //   「跨包镜像」那条规则用的必须是**同一份**。名单一旦分叉,就会重演
    //   「src 里禁了、三个镜像里没禁」的实况。
    const { forms, triples } = retiredForms();
    // 科研绘图素材区(bioicons CC0 + 自绘)里的 #d4a017 / #111 是**配色巧合**:
    // 它们表达的是分子/细胞器的科研语义,不是品牌色,与本规则要防的换代残留无关。
    // 实测该目录命中 3 处,是真豁免不是死豁免。
    // ⚠️ 常量提到模块级 —— 全仓那条退休色规则用的必须是**同一个**豁免。
    const ALLOW = [SCI_FIGURE_DIR];
    const asHex = hits(new RegExp(String.raw`#(?:${forms.join('|')})\b`, 'i')).filter(notIn(ALLOW));
    const asRgb = hits(new RegExp(String.raw`\brgba?\(\s*(?:${triples.join('|')})\b`, 'i')).filter(notIn(ALLOW));
    expect({ asHex, asRgb }).toEqual({ asHex: [], asRgb: [] });
  });

  // ⚠️ 棘轮(ratchet)而非硬失败 —— 颜色收口尚未完成。
  // 让它永久红没有意义(人会停止看红灯),所以断言「只能减少不能增加」。
  it('UI 代码里的硬编码 hex 色只减不增', () => {
    // 为什么: 唯一真源是 globals.css。
    // 豁免的是「必须给具体 CSS 值、不能给类名」或「素材资产」的地方。
    //
    // 2026-07-27: 正则从「只认 6 位」放宽到 3/6/8 位 —— 旧口径放行了 `bg-[#111]`
    // 这类简写。基线因此(以及因为补上 /g)从 72 抬到实测值,不是债务变多了,
    // 是**原来就没数准**。
    const ALLOW = [
      'features/claw/components/figure/', // 科研绘图素材(bioicons CC0 + 自绘),碱基/细胞器配色是科研语义
      'shared/components/ProviderLogo', // 第三方品牌 logo
      'shared/components/brand/', // Scholay 标志与文字标 —— 从 Figma 导出的 SVG,颜色是品牌资产
      'shared/lib/theme-bridge', // token → 第三方主题的唯一适配层
    ];
    // ⚠️ `shared/components/share/` 的整目录豁免已于 2026-07-27 **删除**。
    //    它当初的理由是「html-to-image 离屏克隆丢 CSS 变量,必须字面值」——
    //    **该理由不成立**:html-to-image@1.11.13 走 getComputedStyle 再 setProperty,
    //    而 getComputedStyle 返回的是计算值,var() 在那一步已被替换成 rgb() 字面量。
    //    海报因此改用普通 design token,46 处硬编码 hex(含 34 处两代前的废弃品牌色)清零,
    //    并顺手消掉了一份手搓的 Scholay 文字标副本(字母配色与 Figma 完全不同)。
    //    唯一保留的是 ShareSheet 里 tokenValue() 的 fallback,它计入下面的基线。
    //
    // 2026-07-28: 补 4 位 `#RGBA`(合法的 CSS alpha 简写,`#f00c` = `#FF0000CC`)。
    // 当前在册 0 处,是**纯预防** —— 上一版从 6 位放宽到 3/8 位时正好跳过了它,
    // 而「三种写法拦两种」在实践中等于给第三种发通行证。
    //
    // 2026-07-28 收尾:基线 40 → **7**(实测值,零余量)。40 是上一版设立时的口径产物
    //   —— 其中一部分下降来自 stripComments() 修好正则字面量(注释里举例的 hex 不再计数),
    //   另一部分来自 share/ 海报 46 处硬编码清零。**基线留余量 = 免费违规额度**:
    //   40 的基线意味着任何人可以再塞 33 个硬编码 hex 而 CI 全绿,这正是本轮之前
    //   五条棘轮「设立后一格未走」的机制原因。压到实测值后,新增一处即红。
    const re = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b/;
    ratchet('硬编码 hex', hits(re).filter(notIn(ALLOW)), 7);
  });

  it('禁止 text-background —— 它已不再等价于「白字」', () => {
    // 为什么: 改造前 --background 是 #FFFFFF,text-background 恰好是白字,被大量用作
    // 深底上的前景色。改成米白 #F6F4EE 后这些调用点【静默变成米白前景】——
    // B4b 的迁移只判定了 bg-background 一种形态,漏掉了它,造成同一个红底徽标
    // 在 NotificationBell 与 MobileSearchOverlay 里是两种不同的白。
    //
    // 深底上的前景色: text-on-dark(玄墨底) / text-on-brand(朱砂·松青实底) /
    //                text-foreground(**琥珀实底** —— 白字在 #E5A800 上只有 2.11:1)
    expect(hits(/\btext-background(?:\/\d+)?\b/)).toEqual([]);
  });

  it('@theme 注册的 color token 必须有人用(死 token 只减不增)', () => {
    // 为什么: 这是本轮审计的头号根因 ——「建了 token,没接线」。
    // globals.css 用完成时态描述自己,而实测 130+ 个 token 零消费:
    // --status-* / --cat-* / --chart-* / 色阶原语 / §11 布局尺寸 …
    // 后果不只是死代码: CLAUDE.md §5 把它们当作「以下是全部可用」教给开发者,
    // 新人照着写会成为全站第一个用户。
    //
    // 本断言让这笔债在 CI 里【显形且只能变小】。收口一个就从下面的名单里删一个。
    // 🔴 registered 的提取**必须全行扫描,不能加行首锚**。
    //    2026-07-28 实测:上一版的 `^\s*--color-x:` 漏掉了 globals.css 里
    //    「一行两声明」的写法(`--color-cat-1: var(--cat-1);  --color-cat-2: var(--cat-2);`),
    //    共 **12 个 token 从未进入过检测** —— cat-2/4/6/8、cat-2/4/6/8-soft、chart-2/4/6/8。
    //    补扫之后立刻查出其中 4 个(cat-2/4/6/8-soft)是死的。
    //    也就是说这条规则曾**漏报 4 个死 token,同时把「我在看全部 token」写进注释**。
    const PREFIX =
      'bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|placeholder|shadow';
    const registered = [...new Set([...CSS.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]))];
    // ④ **globals.css 自身的终端消费** —— 2026-07-28 补。
    //    此前这条规则只扫 src/**/*.tsx?,于是「只被 globals.css 用掉的 token」会被误报成死的。
    //    实测代价:搜索框焦点语言收敛掉最后两个 `ring-ring` 之后,`ring` 立刻被报为新增死 token
    //    —— 而 `--ring` 恰恰是全站**最重要**的消费点之一:§13 的全局
    //    `:focus-visible { outline: 2px solid var(--ring) }`。按名单加进 KNOWN_DEAD 等于
    //    把「唯一实现的全站焦点环」登记成死代码,下一个人照名单清理就会把焦点环删掉。
    //
    //    🔴 只认**终端消费**,不认别名转发。判据:`var(--x)` 所在的那一行
    //    不是自定义属性声明(`--y: …`)。理由是这两种形态的含义完全不同:
    //      · `outline: 2px solid var(--ring)`        → 真的画到屏幕上了 = 消费
    //      · `--color-status-error: var(--status-error)` → @theme 注册,是它自己
    //      · `--error-border: var(--status-error)`   → sonner 桥接层又起了个别名,
    //                                                   别名本身可能同样零消费
    //    若把别名也算消费,`--status-*` 整族会因为 §16 的 sonner 桥接块被判"活",
    //    而它们在渲染层的真实状态仍是零采用(审计 Q2)。实测:本判据对现存 27 个
    //    死 token **一个都没有复活**,只把 `ring` 从误报里摘出来。
    const CSS_TERMINAL = stripCssComments(CSS)
      .split('\n')
      .filter((l) => !/^\s*--[A-Za-z0-9_-]+\s*:/.test(l))
      .join('\n');
    const dead = registered.filter((n) => {
      const esc = n.replace(/-/g, '\\-');
      const asClass = new RegExp(`\\b(?:${PREFIX})-${esc}(?=$|[\\s"'\`\\]/])`);
      const asVar = new RegExp(`var\\(\\s*--(?:color-)?${esc}\\s*[,)]`);
      // ③ resolved 形态 —— theme-bridge.ts 用 tokenValue('--chart-1') 把 token 解析成
      //    字面值喂给第三方库(recharts / mermaid 不吃类名)。这是**真消费**,
      //    上一版不认它,只是恰好 chart-* 同时还有 var() 消费点才没误报。
      const asResolved = new RegExp(`tokenValue\\(\\s*['"\`]--(?:color-)?${esc}['"\`]`);
      return (
        !asClass.test(ALL_SRC) &&
        !asVar.test(ALL_SRC) &&
        !asResolved.test(ALL_SRC) &&
        !asVar.test(CSS_TERMINAL)
      );
    });
    // 2026-07-28 快照。**只能删,不能加** —— 加 token 就必须同时接线。
    const KNOWN_DEAD = [
      // shadcn 语义别名:被原子层间接消费或预留,暂不清理
      'accent', 'accent-foreground', 'card', 'card-foreground', 'muted',
      // 分类色板 —— 五份硬编码色板一份未收口(见审计报告 RC2)。
      // ⚠️ 偶数档的 soft 是 2026-07-28 补上全行扫描后**才第一次被看见**的,
      //    不是新增的债,是一直存在、一直没进检测集合的债。
      'cat-1-soft', 'cat-2-soft', 'cat-3-soft', 'cat-4-soft',
      'cat-5-soft', 'cat-6-soft', 'cat-7-soft', 'cat-8-soft',
      // 文字/边框族的零消费档
      'disabled', 'on-dark-muted', 'placeholder', 'ring-selected',
      // 🔴 状态色 —— 阻塞于 Q2(待设计师确认),整族除 info 外零消费
      'status-error', 'status-error-soft', 'status-neutral', 'status-neutral-soft',
      'status-running', 'status-running-soft', 'status-success', 'status-success-soft',
      'status-warning', 'status-warning-soft',
      // ── 2026-07-28 从本名单**删除**(已被接线复活,再次失去消费者时应当重新报警)──
      //   amber-soft / amber-soft-fg  → 琥珀软底高亮块(MobileToolsHomePage / MobilePcOnlyPage /
      //                                 SharedReceivePage;amber-soft-fg 另经 theme-bridge 喂 mermaid)
      //   brand-green-soft            → 投递前自检「通过」圆点(Step4Rail)
      //   cat-1 / cat-3 / cat-5 / cat-7 → 分类色板收口(CollectFolderPicker 书脊 /
      //                                 JournalPickerStep 分区 / pick-avatar-color)
      //   chart-1/3/5/7 / chart-axis-fg / chart-grid → recharts + mermaid 主题收口(theme-bridge)
      //   divider                     → Nav/Toolbar 组间竖线(BrowserTabsBar / TopNav / MenuCarousel)
      // 规则自己写着「收口一个就从名单里删一个」,上一版却把这 14 项留在名单里 ——
      // 名单一旦滞后,这些 token 将来再次变成孤儿时**不会有任何人被通知**。
    ];
    const surprises = dead.filter((n) => !KNOWN_DEAD.includes(n));
    expect(surprises, `新增了零消费的 color token —— 建 token 必须同时接线:\n${surprises.join(', ')}`).toEqual([]);
    ratchet('死 color token', dead, KNOWN_DEAD.length);
  });
});

/* ──────────────────────────────────────────────────────────── 排印 ── */

describe('排印', () => {
  it('arbitrary 字号只减不增', () => {
    // 为什么: Figma 规定 6 档 12/14/16/20/24/28,新代码用 text-12 这类数值名。
    // ⚠️ 上一版把 share/ 计入同一个基线,26/46 的额度被海报占用,
    //    等于给正常代码留了 2 格免费额度。现在拆开:海报单独豁免,主基线收紧。
    //
    // 🔴 2026-07-28: 正则补上 `clamp() / min() / max() / calc()`。上一版只认
    //    「纯数字 + px/rem/em」,而 landing 的 6 处展示级字号全是 `text-[clamp(40px,6vw,72px)]`
    //    ——**对护栏完全隐身**。同一轮审计里「读数系统性失真 16%」说的就是它:
    //    报出来的 6 处是实际 12 处的一半,而报告把 6 当成了全部。
    //    响应式字号本身可以是合规决策(landing 6 处都补了 Figma 依据注释),
    //    但「合规」必须先经过计数,不能靠正则看不见来实现。
    const POSTER = ['shared/components/share/']; // 固定 390px 导出画布,构图参数非 UI 档位
    //
    // 2026-07-28 收尾:基线 19 → **12**(实测值,零余量)。
    const re = /\btext-\[(?:[0-9.]+(?:px|rem|em)|(?:clamp|min|max|calc)\([^\]]*\))\]/;
    ratchet('arbitrary 字号', hits(re).filter(notIn(POSTER)), 12);
  });

  it('leading-* 非 token 档只减不增', () => {
    // 为什么: 行高按【字族】绑定 —— leading-sans(1.25) / leading-display(1.333) /
    // leading-serif(1.437) / leading-paragraph(1.7) / leading-display-tight(1.15)。
    // Tailwind 默认档(leading-none/tight/snug/relaxed/loose 与数值档)不在设计体系里,
    // 它们与字族档混用时,同一个字族在不同组件里会有不同行高。
    //
    // ⚠️ **不要试图用 `--leading-*: initial` 封掉命名空间来解决**。实测:那样会让
    //    在用的 `leading-none`(55 处里的绝大多数)**编译不出任何 CSS** ——
    //    元素行高静默回落到继承值,是真回归。同类事故已经发生过一次
    //    (`--radius-*: initial` 之后裸 `rounded` / `rounded-r` 变直角)。
    //    正确做法就是这条棘轮:钉住数字,收口靠人不靠编译器。
    //
    // ⚠️ `code\b` 是 2026-07-28 新增的第六档 token(`--leading-code: 1.65`,CodeMirror 编辑器),
    //    **不是放宽规则**:它和 sans/display/serif/paragraph 一样是项目 token,
    //    出现在白名单里的理由与它们完全相同。不加的话,`var(--leading-code)` 里的
    //    `leading-code` 会被计成违规 —— 与本文件踩过的「`drop-shadow-lg` 里匹到
    //    `shadow-lg`」是同一类误报(`-` 是 \b 词边界)。
    const re = /\bleading-(?!sans\b|display\b|display-tight\b|serif\b|paragraph\b|code\b|\[)[a-z0-9.]+/;
    ratchet('leading 非 token 档', hits(re), 55);
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
    expect(hits(/\bleading-\[[0-9.]+\]/).filter(notIn(ALLOW))).toEqual([]);
  });

  it('font-bold 只允许出现在衬线/等宽字族上(只减不增)', () => {
    // 为什么: Figma §2.3 —— Google Sans 只有 400/500,**无衬线 UI 上不存在 600/700**。
    // Noto Serif SC(300/500/700)与 Playfair(400/500/700)才有 700。
    // 上一版只禁了 font-semibold,font-bold 完全没管。
    const bad = hits(/\bfont-bold\b/).filter((h) => {
      const [loc] = h.split('  «');
      const [path, ln] = loc.split(':');
      const f = FILES.find((x) => x.path === path);
      const line = f?.text.split('\n')[Number(ln) - 1] ?? '';
      // 同行出现衬线/展示/等宽字族 → 合规(粗略但够用;跨行的父级字族由 review 兜)
      return !/\bfont-(?:serif|display|mono)\b/.test(line);
    });
    ratchet('sans 上的 font-bold', bad, 13);
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
        // (share/ 的豁免已删除 —— 海报的 3 处 rounded-[6px] 已按 B5 的既定目标迁到 rounded-8)
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

  it('shadow-* 非 token 档只减不增', () => {
    // 为什么: 上一条只拦 `shadow-[...]`(arbitrary),而 Tailwind 的**具名默认档**
    // (shadow-sm/md/lg/xl/2xl/inner)一个都没拦 —— 「禁止 arbitrary 阴影」绿灯的同时
    // `shadow-lg` 可以随便写。Figma 里 0 个 DROP_SHADOW,分层靠描边 + 米白底明度差,
    // 全站只该有 shadow-overlay(浮层)/ shadow-raised(滑块 thumb)两档。
    // `shadow-none`(显式取消)不计。颜色形态(shadow-white / shadow-slate-900)
    // 由上面两条色板规则负责,这里排除掉避免重复计数。
    const re = /\bshadow-(?!overlay\b|raised\b|none\b|\[|white\b|black\b)[a-z0-9]+(?:-[a-z0-9]+)?\b/;
    ratchet('shadow 非 token 档', hits(re), 1);
  });

  it('禁止已退休的旧标度名(含裸 rounded 与 static utility)', () => {
    // 圆角与字号都改成了数值命名(rounded-4/8/12/16/20, text-12/14/16/20/24/28),
    // 语义名是过渡期的旧标度,B5/B6 迁完后已全部退休,token 定义也已从 globals.css 删除。
    //
    // 🔴 本规则专门补两个盲区:
    // (1) 非 UTF-8 文件:本仓库有 83 个 .tsx 含非 UTF-8 字节,BSD grep 默认【静默跳过】。
    //     B5 的迁移正因此漏掉 OAuthConfigPage.tsx 的 4 处。readFileSync 读全文件,天然没这问题。
    // (2) **裸 `rounded` 与 `rounded-r` 这类无档位后缀的形态** —— 上一版的正则要求带
    //     (sm|md|lg|…) 后缀,把它们全放行了。而 --radius-*: initial 之后它们
    //     【编译不出任何 CSS】,Prism 的 diff 块因此静默变成直角。
    // (3) `rounded-full` / `rounded-none` 是 Tailwind 的 **static utility**,
    //     硬编码 calc(infinity*1px) / 0,不读 --radius-* 命名空间 —— initial 封不住,
    //     只能靠这条类名规则拦。用 rounded-pill 代替 rounded-full。
    // (旧版的 DOC_ONLY 白名单已删除 —— 注释现在由 stripComments() 统一剔除,
    //  不再需要给「注释里提到旧类名」的文件整体开豁免。)
    const dir = '(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee)';
    const radius = hits(
      new RegExp(String.raw`\brounded(?:-${dir})?(?:-(?:sm|md|lg|xl|2xl|3xl|4xl|full|none))?(?=$|[\s"'\`\]/}])`)
    );
    const size = hits(/\btext-(?:2xs|xs|sm|base|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|15|badge)\b/);
    const weight = hits(/\bfont-semibold\b/);
    expect({ radius, size, weight }).toEqual({ radius: [], size: [], weight: [] });
  });

  it('@theme 的 token 后缀不得撞 Tailwind 保留字', () => {
    // 为什么: Tailwind v4 的 --container-* / --spacing-* 命名空间【用 token 后缀
    // 直接生成类名】。曾经的 --container-max 生成的就是 w-max / max-w-max / min-w-max,
    // 与内建的 max-content 同名且排在后面胜出 —— 两处 w-max 被静默压成 1440px 定宽,
    // 是本次迁移引入的真回归,CI 与类型系统都查不出。
    const RESERVED = ['max', 'min', 'fit', 'full', 'none', 'px', 'screen', 'auto', 'dvh', 'dvw'];
    const bad: string[] = [];
    for (const m of CSS.matchAll(/^\s*--(container|spacing)-([a-z0-9-]+):/gm)) {
      const suffix = m[2];
      if (RESERVED.includes(suffix)) bad.push(`--${m[1]}-${suffix}  (会生成与内建同名的 ${suffix} 工具类)`);
    }
    expect(bad).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────── 交互 ── */

describe('交互', () => {
  it('焦点环必须用 focus-visible 而非 focus', () => {
    // 为什么: focus: 在鼠标点击时也出环。改造前 136 处 focus: vs 67 处 focus-visible:。
    // 只有 focus:text-* (配合 Radix data-[highlighted] 的文字色) 是合法例外。
    expect(hits(/\bfocus:(?!text-)[a-z-]+/)).toEqual([]);
  });

  it('ring-ring 不叠透明度修饰符', () => {
    // 为什么: --ring 本身已含 50% alpha(米白底上要达到 WCAG 2.1 SC 1.4.11 的
    // 非文本对比 ≥3:1 —— 实测 3.14:1,是能同时过关米白与白卡的最低档)。
    // 再叠 /20 /30 会掉到 1.6:1 不合格。改造前有 4 种透明度变体并存。
    expect(hits(/\bring-ring\/\d+/)).toEqual([]);
  });

  it('组件层不得自建焦点环', () => {
    // 为什么: 焦点指示全站【只有一处实现】—— globals.css 的 :focus-visible outline。
    // 改造前是两套并存(21 个文件用 Tailwind ring 的 box-shadow、其余吃全局 outline),
    // 同一个界面上会出现两种长得不一样的焦点环。已删 72 处重复实现。
    //
    // 组件层仍可以加【非环类】的聚焦可供性(focus-visible:border-* / focus-visible:bg-*),
    // 那些是额外提示不是替代实现,不冲突。
    expect(hits(/\bfocus-visible:(?:ring|outline)/)).toEqual([]);
  });

  it('无前缀 outline-none 只减不增', () => {
    // 为什么: 它会把全站唯一的 :focus-visible outline 【硬关掉】,键盘用户看不到焦点
    // (WCAG 2.4.7)。合法场景只有两类:
    //   (1) Radix 的 Content/Item 容器(Radix 自管焦点,画环是噪音)
    //   (2) 裸 input 放在带 focus-within 可供性的外层容器里
    // 除此之外都是 bug —— 已修 JournalPickerStep / TemplateCards 等可聚焦卡片。
    //
    // 2026-07-28 收尾:基线 28 → **22**(实测值,零余量)。
    ratchet('无前缀 outline-none', hits(/(?:^|[\s'"`{])outline-none\b/), 22);
  });
});

/* ──────────────────────────────────────────────────────── 尺寸与间距 ── */

describe('尺寸与间距', () => {
  it('半档间距只减不增', () => {
    // 为什么: Figma §5 观测集合 {4,8,10,12,16,24,32,40},**没有 6px**。
    // ⚠️ gap-2.5(10px)是**合规的** —— Figma 按钮/Badge 的 gap 就是 10,故排除在外。
    // 🔴 这条阻塞于遗留决策 Q8:gap-1.5(6px)已写进 shared/ui/{dialog,sheet,dropdown-menu}
    //    三个原子的基线,是既成事实而非散落误用。在设计师答复前**先钉住数字不许涨**,
    //    不要擅自批量改 —— 叠加正文 13→14 的上浮,同时 6→8 会让全站纵向密度明显变松。
    const HALF = '(?:0\\.5|1\\.5|3\\.5|5|7|9|11)';
    const PROP = 'gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space-x|space-y';
    //
    // 2026-07-28 收尾:基线 1357 → **1293**(实测值,零余量)。原来的 64 格余量
    //   在「阻塞于设计师答复」的规则上尤其危险 —— 它让这条棘轮在等待期里可以静默倒退。
    ratchet('半档间距', hits(new RegExp(`\\b(?:${PROP})-${HALF}\\b`)), 1293);
  });

  it('禁止裸 vh(移动 Safari 地址栏会改变 vh)', () => {
    // 为什么: iOS 地址栏收起/展开会改 vh,导致弹窗底部按钮被盖住 ——
    // subscribe-dialog 的付费入口踩过。dialog.tsx 早已单独改成 90dvh,
    // 其余 15 处一直是同一个 bug 没有收口。用 dvh,或 --overlay-max-h / --overlay-max-h-sheet。
    //
    // ⚠️ 正则必须匹配【任意 arbitrary value 内部】的 vh,而不是 `\[[0-9.]+vh\]` ——
    //    后者要求 `[` 紧跟数字,`max-h-[min(70vh,640px)]` 这种嵌在 min()/calc() 里的
    //    会完全逃逸。本轮就漏过 QuickOpenPaperDialog(命令面板 Popover,恰恰是最容易
    //    被地址栏顶掉底部的形态),而当时护栏是 26/26 全绿 —— **绿灯不等于清零**。
    //    `[0-9.]vh` 的前置数字要求天然排除 dvh / svh / lvh。
    expect(hits(/\[[^\]]*[0-9.]vh[^\]]*\]/)).toEqual([]);
  });

  it('inline style 里的魔法数字只减不增', () => {
    // 为什么: B4/B5/B6 的 codemod 与本护栏都只认 Tailwind 类名,
    // **inline style 对象是双盲区** —— 既没被迁移,也不被发现。
    // 实测漏网: 5 处 borderRadius: 6(Figma 点名要干掉的值)、2 处 boxShadow、
    // 35 处 fontSize: 9/10/11、2 处裸 zIndex。已修圆角与阴影,字号待办。
    //
    // theme-bridge 豁免: 它【就是】设计系统里唯一允许把 token 落成具体值的地方
    // (第三方库不吃类名)。把它算成违规等于禁止收口本身。
    //
    // 🔴 2026-07-28: 补上**字符串值形态**。上一版要求冒号后紧跟裸数字,于是
    //    `fontSize: 12` 违规、`fontSize: '12px'` 合规 —— 加一个引号就免罚,
    //    而这两者渲染结果完全一样。该形态在本轮之前是有活体的
    //    (LatexEditor.tsx 的 CodeMirror 主题 `fontSize: '12px'`,已收口成 var(--text-12))。
    //    同时把 lineHeight / letterSpacing 纳入:它们与 fontSize 同属排印阶梯,
    //    都有对应 token(--leading-* / --tracking-*),没有理由只拦一个。
    //    ⚠️ 值以 `var(` 开头的不计 —— 那正是收口后的正确形态。
    const ALLOW = ['shared/lib/theme-bridge'];
    //
    // 2026-07-28 收尾:基线 41 → 1 → **0**(实测值,零余量)。41 是「35 处 fontSize: 9/10/11」
    //   那一批未收口时的数,那批已经清掉,基线不跟着降就等于把已还的债重新挂回额度上。
    //   最后那 1 处是 LatexEditor 的 `lineHeight: '1.65'`,本轮接线成 `var(--leading-code)`
    //   之后归零 —— **这条现在是硬失败**,再出现一处 inline 魔法数字就红。
    const re = /\b(?:borderRadius|fontSize|zIndex|lineHeight|letterSpacing):\s*['"`]?\s*[0-9.]/;
    ratchet('inline style 魔法数字', hits(re).filter(notIn(ALLOW)), 0);
  });

  it('arbitrary px 尺寸只减不增', () => {
    // 为什么: 尺寸 token(h-control-* / size-avatar / size-icon / max-w-page / --dialog-* /
    // --overlay-* )已经建好并且**能编译出类**,但 2026-07-28 实测采用率近乎 0,
    // 而 `w-[420px]` `max-h-[480px]` `px-[18px]` 这类精确像素有 191 处。
    // 这是「建了 token 没接线」的头号根因在**尺寸维度**的投影 ——
    // 上一轮 P2 清单承诺过要给它设棘轮,没兑现,于是它一格没走。
    //
    // ⚠️ 先分拣:含 `calc()` / `var()` 的形态是**合法的布局联动**,不是硬编码
    //    (`max-w-[calc(100vw-32px)]`、`pb-[calc(var(--chat-area-h)*0.3)]`、
    //     `h-[calc(var(--leading-sans)*1em)]` —— 实测 11 处)。正则要求
    //    `[` 后紧跟数字,天然把它们排除在外,不要改成宽松匹配。
    //
    // ⚠️ 这条**不**替代「必须注明 Figma 依据」的人工约定:很多命中已经写了 KEEP 理由
    //    (badge 的 h-[18px]、书脊的 border-[1.5px]、海报的固定画布…)。棘轮只保证
    //    「总量不涨」,判断某一处该不该留仍然是 review 的事。
    const PROP = 'w|h|min-w|min-h|max-w|max-h|size|p[xytrbl]?|m[xytrbl]?|gap|gap-x|gap-y|border(?:-[ltrb])?';
    const re = new RegExp(String.raw`\b(?:${PROP})-\[[0-9.]+px\]`);
    ratchet('arbitrary px 尺寸', hits(re), 191);
  });
});

/* ──────────────────────────────────────────────────────────── 动效 ── */

describe('动效', () => {
  it('framer-motion duration 字面量只减不增', () => {
    // 为什么: 动效时长是设计 token 的一部分(--duration-fast/base/slow/deliberate =
    // 160/280/420/700ms),shared/lib/motion.ts 是 TS 侧与它们的**唯一对齐点**。
    // 组件里手搓 `transition={{ duration: 0.35 }}` 会让同一类交互在不同页面快慢不一,
    // 而且改 token 时这些点**不会跟着变**(globals.css §15 自述「两侧共用同一组数值」
    // 描述的是目标不是现状,实测 23 处在集合之外)。
    //
    // 口径两条:
    //   ① 只看**秒级**数值 —— framer-motion 的单位是秒。≥10 的是毫秒,属于
    //      sonner toast(duration: 6000)/ auto-animate(duration: 180)等别的库,
    //      与 motion token 无关,计进来只会稀释信号。
    //   ② `duration: 0` 不计 —— 那是 prefers-reduced-motion 分支的「不做动画」,
    //      是无障碍要求而不是一个时长档。
    const OK = new Set(['0', '0.16', '0.28', '0.42', '0.7']); // 0 + 四档 token 的秒表示
    const bad = hits(/\bduration:\s*[0-9.]+/).filter((h) => {
      const v = h.match(/duration:\s*([0-9.]+)/)?.[1] ?? '';
      return Number(v) < 10 && !OK.has(v);
    });
    ratchet('framer-motion duration 字面量', bad, 23);
  });
});

/* ────────────────────────────────────────────────────── 样式系统逃逸 ── */

describe('样式系统逃逸', () => {
  it('globals.css 之外没有手写样式表', () => {
    // walk() 只收 .tsx/.ts,这里要单独遍历 —— 用它会永远返回空数组(假通过)
    //
    // 例外:styles/fonts/*.css 是【机器生成的 @font-face 清单】(见 scripts/sync-*.mjs)。
    // 本规则的本意是「禁止手写组件 CSS,样式只能来自 token + Tailwind 类」——
    // 字体分片清单不是样式,是资产声明,且 Noto Serif SC 有 101 个 unicode-range 分片、
    // 920 行,塞进 globals.css 会把真正需要人读的 token 定义淹掉。
    // 它们【不得手改】,改动只能来自重跑同步脚本。
    const css: string[] = [];
    (function scan(dir: string) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) scan(p);
        else if (/\.(css|scss|sass|less)$/.test(p)) css.push(relative(SRC, p));
      }
    })(SRC);
    const handwritten = css.filter((p) => !p.startsWith('styles/fonts/'));
    expect(handwritten.sort()).toEqual(['styles/globals.css']);

    // 生成物必须带「请勿手改」抬头 —— 防止有人把它当普通样式表用
    for (const f of css.filter((p) => p.startsWith('styles/fonts/'))) {
      expect(readFileSync(join(SRC, f), 'utf8').slice(0, 400), `${f} 缺少生成物抬头`).toContain('请勿手改');
    }
  });

  it('禁止 styled-components / emotion', () => {
    expect(hits(/from\s+['"](?:styled-components|@emotion)/)).toEqual([]);
  });

  it('JS 字符串里的原生 CSS 必须走 token', () => {
    // 🔴 本轮暴露的**最大机制洞**。上面那条「globals.css 之外没有手写样式表」只看
    // `.css` 文件后缀,于是 `shared/components/chat/styles.tsx` —— 一整张
    // 通过 <style> 注入的真样式表 —— 完全在护栏之外:它写的是**原生 CSS 声明**
    // (`font-size: 0.7rem`),而本文件其余 51 条规则找的全是 **Tailwind 类名**。
    // 两套语法互不相交 = 一份全站生效的样式表对整个护栏隐身。
    // 代价是真实发生过的:那张表在两代品牌绿之后停在 #2A7A2A,没有任何东西报警。
    //
    // 判定依据: kebab-case 属性名在 JS 里**只可能出现在字符串/模板串中**
    // (标识符不允许连字符),所以命中即「有人在字符串里写 CSS」。
    // 它与 <style> 注入的 CSS 在同一个 document,`var(--…)` / `color-mix()` 能正常解析,
    // 因此没有任何理由写字面值。
    //
    // 科研绘图素材区豁免: figure/ 下是导出成独立 SVG 的素材(bioicons CC0 + 自绘),
    // 脱离页面 CSS 上下文,var() 解析不到 —— 与 hex 规则同一条理由。
    const ALLOW = ['features/claw/components/figure/'];

    // ① 颜色形态 —— 硬失败。当前 0 处,别开这个头。
    const color = hits(
      /\b(?:color|background|background-color|border|border-color|outline-color|fill|stroke|box-shadow|text-shadow)\s*:[^;\n'"`]*?(?:#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()/
    ).filter(notIn(ALLOW));
    expect(color, '字符串里的 CSS 颜色必须写 var(--token) / color-mix()').toEqual([]);

    // ② 排印与形状形态 —— 棘轮。2026-07-28 收尾:基线 3 → **2**(实测值,零余量)。
    //    退休的那一处是 styles.tsx 的 `font-weight: 500` —— 本轮 §10 补了 `--weight-medium`
    //    (刻意不进 @theme:这一族只服务「JS 字符串里的裸 CSS」,注入式样式表拿不到工具类),
    //    接线后它从计数里消失。**收口了就当场压基线**,否则等于把已还的债重新挂回额度上。
    //    剩下的 2 处都有说明:styles.tsx 的 line-height:1(序号 chip 单行居中)、
    //    ios-keyboard.ts 的 font-size:16px(iOS 聚焦缩放阈值,是设备行为常量而非排印档)。
    //    它们该不该留由 review 定,棘轮只保证不会**再多一处**。
    const typo = hits(
      /\b(?:font-size|font-weight|line-height|letter-spacing|border-radius)\s*:(?!\s*(?:var\(|color-mix\(|inherit|initial|unset))\s*[^;\n'"`]+/
    ).filter(notIn(ALLOW));
    ratchet('JS 字符串里的裸 CSS 排印/形状值', typo, 2);
  });

  it('禁止 dark: 前缀', () => {
    // 为什么: 暗色态已于 2026-07 移除(setTheme 零调用点,.dark 从未生效)。
    expect(hits(/\bdark:[a-z-]+/)).toEqual([]);
  });

  it('组件层不得自己解析 CSS 变量', () => {
    // 为什么: 台账 §2.14 的铁律 1 —— token → 具体值的解析只能有一个入口
    // (shared/lib/theme-bridge.ts)。散落的 getComputedStyle 会在主题/token 变更时
    // 各自失效,且改 token 忘了改消费方是静默漂移(海报的 #CD2323 就是这么漂的)。
    const ALLOW = ['shared/lib/theme-bridge'];
    expect(hits(/getComputedStyle\s*\([^)]*\)\s*\.\s*getPropertyValue/).filter(notIn(ALLOW))).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────── 跨包镜像 ── */

/**
 * globals.css 在 **frontend-user 之外**还有三份人工镜像。
 *
 * 🔴 这是「资产统一管理」最后一个纯靠人自觉的缺口:上面 50+ 条规则全部只 walk
 *    `frontend-user/src`,三个镜像**物理上在护栏射程之外**。代价已经付过 ——
 *    它们曾**同时**停在两代前的品牌色(#CC2222 / #2A7A2A / #D4A017),
 *    而当时 51 条护栏全绿,三个文件的文件头还都写着「对齐 globals.css」。
 *    契约注释拦不住漂移,只有断言能。
 *
 * 为什么必须是人工镜像(不能 import 真源):
 *   - `miniprogram/app.wxss`            wxss 既不能 @import Web CSS,也没有构建期注入
 *   - `scholay-minitools/_shared/brand.css`  小红书离线 H5,禁外链 → 必须自带样式
 *   - `agent/src/render/pptxNative.ts`  pptxgenjs 只认**不带 `#` 的六位十六进制**
 *
 * ⚠️ 三份镜像的 token 集合**不一样,而且这是对的**:
 *    前两份是完整设计系统的镜像(表面/文字/边框/品牌全套);
 *    pptxNative 只是一张导出用调色板,`BRAND` 里**只有渲染器真正画得出来的那几个色**
 *    —— 没有 amber / foreground,页底还刻意是纯白 `FFFFFF` 而非米白
 *    (投影与打印场景不用米白,这是有意决策,写在该文件的注释里)。
 *    所以本矩阵按文件登记「它到底镜像了哪几个 token」,**不是**统一要求全部都在。
 *    「pptxNative 少几个 token」不是同步缺口 —— 缺口是「它声称镜像了某个 token
 *    却拿着旧值」,那正是下面几条断言要抓的。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 2026-07-28 第三轮:从**文件级包含**加固为**变量级绑定**。
 *
 * 🔴 上一版问的是「`: #882828` 这个形态在文件里出现过吗」,不问「#882828 绑在哪个
 *    变量上」。实测复现过:把 app.wxss 的 `--red: #882828` 改成 `#993333`,规则**照样绿**
 *    —— 因为三行之后的 `--brand: #882828` 兜着。也就是说它能抓「整体落后」
 *    (历史上真实发生的那次),抓不住「单个变量漂移」;而镜像里同一个色被抄进
 *    2~3 个变量是常态,等于每个 token 都自带 1~2 个免罚名额。
 *
 * 现在的口径:每个 globals token 明确登记它在该镜像里**具体绑到哪几个变量/字段**,
 * 逐个解析、逐个比值。一对多必须**全部**列出 —— 少列一个就是给它留一个后门。
 *
 * 顺带扩了覆盖面(值已逐条实测对齐,不是猜的):从「品牌三色 + 前景 + 页底」5 个
 * 扩到表面/文字/边框/品牌/状态软底/logo 全套。理由很简单:漏登记的变量与
 * 「登记了但不检查」在漂移面前是同一件事。
 *
 * ⚠️ 不能 bind 的颜色**不等于可以不管** —— 它们现在全部落在各镜像的 `derived` 里,
 *    带理由、且被「每一个颜色声明都必须有交代」那条逐个对账(写了却不存在 = 死条目,红):
 *   · 镜像自派生 —— `--red-line` / `--green-line` / `--amber-line`(品牌色 25% 叠白,
 *     globals 里没有对应 token,实测与任何 token 都不同值);
 *   · `--red-soft` / `--danger-soft`(#F3E9E9)—— 真源 `--brand-red-soft` 是
 *     `color-mix(in srgb, …)`,不是可比的字面色。要纳入 bind 得先在 globals 落成实色。
 *     ⏪ 2026-07-28 第五轮补记:文件末尾「全仓资产」那一族里已经有一个 color-mix 解析器
 *        (`COLOR_ACCEPT`),实测 `#F3E9E9` = `--brand-red-soft` 的**截断**变体、
 *        `#F3EAEA`(design/remotion 那边写的)= **进位**变体。所以这两条 derived 现在
 *        **技术上可以升级成 bind** —— 只是 `sameValue()` 还没接 color-mix,而且 bind 是
 *        逐位相等口径,升级前得先拍板「差 1/255 的舍入算不算漂移」。留给下一棒。
 *
 * ⚠️ 本 describe **已知的剩余缺口**(不是遗漏,是明说的边界):
 *   · 长度族(圆角 / 字号)—— 三种单位并存(globals 用 rem、brand.css 用 px、
 *     app.wxss 用 rpx),且 `--radius-pill` 是 `9999px` ↔ `9999rpx`,**不服从**
 *     任何统一换算系数。硬套系数会造出一条注定误报的规则,而误报的下场是被放宽。
 *     要补请单独立一条带单位换算的规则,别混进本条。
 *   · 本 describe 的射程**只有这三份文件**,这是有意的分工:它做的是**变量级绑定**
 *     (「globals 的 X 绑在该镜像的哪几个变量上」),而那要求镜像本身是一份
 *     结构化的 token 表。同包里另外那二十来个持有品牌字面值的文件
 *     (app.json / .wxml / favicon.svg / Go 邮件模板 …)结构上给不出变量名,
 *     它们由文件末尾的 **「全仓资产」** 一族负责(2026-07-28 第五轮新增),
 *     判据弱一档但覆盖面是全仓。⚠️ 那一族的口径见它自己的文件头,
 *     **不要**把两者混为一谈:这里绿 ≠ 那里绿。
 */
type MirrorBinding = {
  /** globals.css 里的真源 token */
  token: string;
  /**
   * 该镜像里承载这个 token 的**全部**变量名(CSS)/ 字段名(TS)。
   * 🔴 一对多必须列全:app.wxss 的 `--red` 与 `--brand` 同色,只断言其一 = 另一个可以随便漂。
   */
  vars: string[];
};

const MIRRORS: {
  path: string;
  kind: 'css' | 'ts';
  bind: MirrorBinding[];
  /** 仅 TS 镜像用:BRAND 里**刻意不镜像** globals 的字段 → 理由。见下面的「字段对账」用例。 */
  unbound?: Record<string, string>;
  /**
   * 仅 CSS 镜像用:**镜像自派生**的颜色变量 → 理由(globals 里没有可比对的真源)。
   *
   * 🔴 这不是豁免名单,是**对账名单**。下面「每一个颜色声明都必须有交代」那条会枚举文件里
   *    全部颜色声明,逐个要求「在 bind 里」或「在 derived 里」——
   *    漏一个就红,写了却不存在的死条目也红。
   *    上一版的判据是「值恰好等于某个 globals token 才追究」,于是把变量**写错**反而安静
   *    (实测:约 59 个未登记变量拿着任意值都不会有人看见)。
   */
  derived?: Record<string, string>;
  /**
   * 「非声明位置」允许出现的颜色字面量 → 理由。key 是**压掉空白与引号后的小写形态**
   * (`rgba(31,31,35,0.05)` / `e69f00`)。
   *
   * 🔴 同样是对账名单:凡是与任何 globals token 当前值都不相等的字面量,必须在这里具名。
   *    死条目(写了但文件里已经没有)一样红 —— 本文件里每一张零命中豁免名单最后都成了后门。
   */
  literals?: Record<string, string>;
}[] = [
  {
    path: 'miniprogram/app.wxss',
    kind: 'css',
    bind: [
      // —— 表面层 ——
      { token: '--background', vars: ['--bg'] },
      { token: '--surface-card', vars: ['--card'] },
      { token: '--surface-1', vars: ['--surface-1'] },
      { token: '--surface-2', vars: ['--surface-2'] },
      // —— 文字层 ——
      { token: '--foreground', vars: ['--text'] },
      { token: '--subtle-foreground', vars: ['--text-subtle'] },
      { token: '--muted-foreground', vars: ['--text-weak'] },
      { token: '--faint-foreground', vars: ['--text-faint'] },
      { token: '--disabled-foreground', vars: ['--text-disabled'] },
      { token: '--on-brand', vars: ['--on-brand'] },
      // —— 边框层 —— 两侧写法不同(globals `rgb(31 31 35 / 0.12)` ↔ 镜像 `rgba(31, 31, 35, 0.12)`),
      //    靠 canonicalColor() 归一后比,而不是靠文本相同。
      { token: '--border-hairline', vars: ['--border-soft'] },
      { token: '--border', vars: ['--border'] },
      { token: '--border-strong', vars: ['--border-strong'] },
      // —— 品牌 ——
      // 🔴 一对多的样板:`--brand` 是 `--red` 的同色副本。旧规则下改坏任一个都不会红。
      { token: '--brand-red', vars: ['--red', '--brand'] },
      { token: '--brand-green', vars: ['--green'] },
      { token: '--brand-amber', vars: ['--amber'] },
      // 镜像自陈「= red-4」。登记原语是对的:它就是这个变量的真源,
      // 原语改名(amber-11 → amber-12 那类)会让本条当场红,那正是需要报警的时刻。
      { token: '--red-4', vars: ['--red-deep'] },
      { token: '--cat-blue', vars: ['--cat-blue'] },
      // —— 状态软底 / 琥珀高亮块 ——
      { token: '--status-success-soft', vars: ['--green-soft'] },
      { token: '--status-warning-soft', vars: ['--amber-soft'] },
      { token: '--status-warning', vars: ['--amber-ink'] },
      { token: '--amber-soft-bg', vars: ['--amber-block'] },
      { token: '--amber-soft-fg', vars: ['--amber-block-ink'] },
    ],
    derived: {
      '--red-soft':
        '文件自陈「= globals --brand-red-soft」,但真源那边是 color-mix(in srgb, …) 不是可比的字面色 —— 要纳入 bind 得先在 globals 落成实色(见 blockers)',
      '--red-line': '镜像自派生:品牌红 25% 叠白的软描边,globals 里没有对应 token(实测与任何 token 都不同值)',
      '--green-line': '同上,松青 25% 叠白',
      '--amber-line': '同上,琥珀 25% 叠白',
    },
    literals: {
      // 这两处是同一个值的两次出现(.hover-bg 与列表行 :active)。
      'rgba(31,31,35,0.05)':
        '按压压深叠色:玄墨 5%。globals 的边框族最低档是 8%(--border-hairline),5% 这一档只存在于小程序的按压反馈里,无真源可绑',
    },
  },
  {
    path: 'scholay-minitools/_shared/brand.css',
    kind: 'css',
    bind: [
      // —— 表面层 ——
      { token: '--background', vars: ['--background'] },
      { token: '--surface-card', vars: ['--card'] },
      { token: '--surface-1', vars: ['--surface-1'] },
      { token: '--surface-2', vars: ['--surface-2'] },
      // —— 文字层 ——
      { token: '--foreground', vars: ['--ink'] },
      { token: '--subtle-foreground', vars: ['--ink-dim'] },
      { token: '--muted-foreground', vars: ['--ink-mut'] },
      { token: '--on-brand', vars: ['--on-brand'] },
      // —— 边框层 ——
      { token: '--border-hairline', vars: ['--line-soft'] },
      { token: '--border', vars: ['--line'] },
      { token: '--border-strong', vars: ['--line-strong'] },
      // —— 品牌 ——(`--danger` / `--line-btn` 是纯 var() 别名,跟着被指向的变量走,不单列)
      { token: '--brand-red', vars: ['--brand'] },
      { token: '--red-4', vars: ['--brand-2'] },
      { token: '--brand-green', vars: ['--brand-3'] },
      { token: '--brand-amber', vars: ['--amber'] },
      { token: '--cat-blue', vars: ['--cat-blue'] },
      // —— 状态软底 ——
      { token: '--status-success-soft', vars: ['--green-soft'] },
      { token: '--status-warning-soft', vars: ['--amber-soft'] },
      { token: '--status-warning', vars: ['--amber-ink'] },
      // —— Logo 专用配色 —— globals §五 明确「与语义品牌色分开,不要合并」,
      //    所以它们的真源是 --logo-*,**不是** --brand-*(--logo-red 恰好等于 --brand-red
      //    是巧合;绑错真源会让「为可读性调品牌色」连带把标志判成漂移)。
      { token: '--logo-red', vars: ['--logo-red'] },
      { token: '--logo-amber', vars: ['--logo-amber'] },
      { token: '--logo-green', vars: ['--logo-green'] },
      { token: '--logo-ink', vars: ['--logo-ink'] },
      // 唯一一个非颜色绑定 —— 走 sameValue 的「数值 + 单位」归一(`-.03em` = `-0.03em`)。
      { token: '--tracking-brand', vars: ['--tracking-brand'] },
    ],
    derived: {
      '--danger-soft':
        '文件自陈「= globals --brand-red-soft」,但真源那边是 color-mix(in srgb, …) 不是可比的字面色 —— 与 app.wxss 的 --red-soft 同一件事(见 blockers)',
      '--danger-line': '镜像自派生:品牌红 25% 叠白的软描边,globals 里没有对应 token',
      '--green-line': '同上,松青 25% 叠白',
      '--amber-line': '同上,琥珀 25% 叠白',
    },
  },
  {
    // ⚠️ hair=D6D6D8 自称「--border-strong 玄墨 22% 叠白」,而 --border-strong 现值
    //    rgb(31 31 35 / 0.22) 叠白实算是 **CECECF**(D6D6D8 反解只有 ~18.3% alpha)。
    //    这是一处**待人拍板的偏差**,故意不绑定 —— 规则不迁就现状,但改它会让
    //    导出到站外的 pptx 表格描边变深,是视觉变化,不该由护栏顺手决定。见本轮 blockers。
    path: 'agent/src/render/pptxNative.ts',
    kind: 'ts',
    bind: [
      { token: '--brand-red', vars: ['red'] },
      { token: '--brand-green', vars: ['green'] },
      // 这两个上一版注释里写着「也是精确镜像,但不是品牌三色,不进本矩阵」——
      // 变量级绑定之后那个理由不成立了:精确镜像就该被断言,与它是不是品牌色无关。
      { token: '--on-brand', vars: ['onBrand'] },
      { token: '--surface-2', vars: ['track'] },
    ],
    unbound: {
      hair: '自称 --border-strong 叠白,实算 CECECF ≠ D6D6D8(~18.3% alpha)—— 待拍板的偏差,见 blockers',
      slideBg: '刻意不镜像 --background:投影/打印页底保持纯白 FFFFFF 而非米白(该文件注释里写了理由)',
    },
    literals: {
      // 🔴 这一族正是「非声明位置」规则的立身之本:该文件头部自陈的那次真实回归
      //    (emitComparison 内联两代前的品牌绿 2A7A2A + 体系外的红 C0392B)就长这样 ——
      //    不在 BRAND 里,不是任何变量的声明,当时能被发现纯属侥幸(2A7A2A 恰在退休名单上)。
      '000000': 'toHex() 解析失败时的兜底黑,是**解析器的错误分支**不是设计色(输入非法时不能返回空串,pptxgenjs 会崩)',
      e69f00: 'Okabe-Ito 色盲友好序列色 #1(与 SciCharts 对齐)—— 学术图表的序列色板,刻意在品牌色体系之外',
      '56b4e9': 'Okabe-Ito 序列色 #2',
      '009e73': 'Okabe-Ito 序列色 #3',
      cc79a7: 'Okabe-Ito 序列色 #4',
      d55e00: 'Okabe-Ito 序列色 #5',
      '0072b2': 'Okabe-Ito 序列色 #6',
    },
  },
];

/**
 * 颜色值归一成 `r,g,b,a` —— 三份镜像与真源的**写法不一样**,只有归一后才能比:
 *   globals `rgb(31 31 35 / 0.12)` ↔ 镜像 `rgba(31, 31, 35, 0.12)` ↔ pptx `882828`(无 #)。
 * 🔴 不能退化成「文本相等」:那会把「写法不同但同色」判成漂移,而误报的下场从来都是规则被放宽。
 *
 * 2026-07-28 第四轮:补 4 位 `#RGBA` 与 8 位 `#RRGGBBAA`。上一版只认 3/6 位,
 *   于是带 alpha 的合法简写会**解析失败 → 返回 null → 被当成「不是颜色」**,
 *   在下面新增的两条规则里意味着「不进颜色账本」= 隐身。src 侧的 hex 规则早就认 3/4/6/8 位了,
 *   这里的口径不该比它窄。位数非法(5/7)一律返回 null,**不猜**。
 */
function canonicalColor(v: string): string | null {
  const s = v.trim();
  const round = (x: number) => Number(x.toFixed(4));
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    const h = hex[1];
    if (h.length === 5 || h.length === 7) return null;
    const short = h.length <= 4;
    const at = (k: number) => (short ? parseInt(h[k] + h[k], 16) : parseInt(h.slice(k * 2, k * 2 + 2), 16));
    const hasAlpha = h.length === 4 || h.length === 8;
    return `${[0, 1, 2].map(at).join(',')},${hasAlpha ? round(at(3) / 255) : 1}`;
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (!fn) return null;
  const a = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
  return `${Number(fn[1])},${Number(fn[2])},${Number(fn[3])},${round(a)}`;
}

/**
 * 「数值 + 单位」归一 —— **专治误报**。
 *
 * 🔴 2026-07-28 第四轮修的是一处**实测误报**:把 `--tracking-brand` 从 `-0.03em` 写成
 *    CSS 完全等价的 `-.03em`,上一版的 sameValue 对非颜色值退化成「压空白逐字相等」,
 *    当场判红。同类的还有 `1.6` ↔ `1.60`、`0` ↔ `0px`。
 *    **误报比漏报更危险**:漏报只是少抓一个,误报会让下一个人来放宽规则
 *    (本文件里每一条被放宽过的规则,起点都是「它冤枉过我」)。
 *
 * ⚠️ 只归一「单个数值 + 可选单位」。多值(`0 0 0 1px`)/ 函数(`cubic-bezier(…)`)
 *    一律返回 null 退回文本比 —— 那类值的等价判定需要真正的 CSS 解析器,
 *    在这里硬猜会造出新的误报,得不偿失。
 */
function canonicalNumber(v: string): string | null {
  const m = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z%]*)$/i.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  // 0 与 0px / 0em 在 CSS 里等价(长度的零值不需要单位),归到同一个 key。
  return n === 0 ? '0' : `${n}${m[2].toLowerCase()}`;
}

/**
 * 值相等。三级判定,**从严到宽**:
 *   ① 任一边能当颜色解析 → 按颜色比(写法不同但同色 = 相等);
 *   ② 任一边能当「数值+单位」解析 → 按数值比(`-.03em` = `-0.03em`,`1.60` = `1.6`,`0` = `0px`);
 *   ③ 都不是 → 压掉空白逐字比。
 * 「任一边能解析」而不是「两边都能」是有意的:一边是颜色另一边不是 = 漂了,必须红。
 */
function sameValue(want: string, got: string): boolean {
  const a = canonicalColor(want);
  const b = canonicalColor(got);
  if (a !== null || b !== null) return a !== null && a === b;
  const na = canonicalNumber(want);
  const nb = canonicalNumber(got);
  if (na !== null || nb !== null) return na !== null && na === nb;
  return want.replace(/\s+/g, '') === got.replace(/\s+/g, '');
}

/** pptxNative 的 `const BRAND = { … } as const;` 内容体(已剥注释的源码传进来)。 */
const brandBlock = (text: string): string | null =>
  text.match(/const BRAND\s*=\s*\{([\s\S]*?)\n\}\s*as const;/)?.[1] ?? null;

/**
 * 解析口径的**字符集** —— 三处正则共用,不许各写各的。
 *
 * 🔴 2026-07-28 第四轮堵的是一类「合法但没人想到」的逃逸:
 *   · CSS 自定义属性**大小写敏感**,且 `_` 是合法标识符字符 —— `--Primary` / `--brand_alt`
 *     都是完全合法的属性名,而上一版的 `(--[a-z0-9-]+)` **一个都匹配不到**。
 *     匹配不到 = 不进任何账本 = 那个变量拿着什么值都没人看见(实测确认)。
 *   · TS 对象字面量的键可以带引号,于是 `'x-tint': '993333'` 对上一版的
 *     `^\s*([A-Za-z][A-Za-z0-9]*)\s*:` 同样隐身 —— 而 BRAND 的字段对账正是靠它枚举字段的,
 *     隐身字段既不进 bind 也不进 unbound,两条规则一起放行。
 * ⚠️ CSS_VAR 刻意**不**加 `i` 标志的等价物(不是 `[a-z]` + i,而是显式 `[A-Za-z]`):
 *    自定义属性大小写敏感,`--Red` 与 `--red` 是两个不同的属性,归一大小写会把它们混成一个。
 */
const CSS_VAR = String.raw`--[A-Za-z0-9_-]+`;
/** 「整个值就是一个 var(--x) 别名」。⚠️ 带 fallback 的 `var(--x, #fff)` 刻意**不**算别名 —— 它内含一个字面色。 */
const PURE_ALIAS = new RegExp(String.raw`^var\(\s*(${CSS_VAR})\s*\)$`);
/** TS 对象字面量的键:裸标识符 / 单引号 / 双引号,允许 `_` `$` `-`。 */
const TS_KEY = String.raw`(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))`;

/**
 * 镜像文件 → 「变量名/字段名 → 该文件里的**全部**声明值」。
 *
 * ⚠️ 值收成数组而不是「最后一次赢」:同名声明两次(一处新值、一处旧值)是真实存在的
 *    漏改形态,每一处都要单独比 —— 「有一处对」不等于「对」,那正是上一版的病根。
 */
function mirrorDecls(text: string, kind: 'css' | 'ts'): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const put = (k: string, v: string) => out.set(k, [...(out.get(k) ?? []), v.trim()]);
  if (kind === 'css') {
    // css/wxss 里自定义属性只有 `--name: value;`(或块尾直接 `}` 收尾)一种形态。
    // `[^;{}]` 而不是 `[^;}]`:值里出现 `{` 只可能是解析已经跑飞了,别让它吞掉整个规则块。
    for (const d of text.matchAll(new RegExp(String.raw`(${CSS_VAR})\s*:\s*([^;{}]+)[;}]`, 'g'))) put(d[1], d[2]);
  } else {
    const block = brandBlock(text);
    // 只认引号包裹的字符串字面量 —— pptxgenjs 的口径就是字符串,别的形态先报 miss 再说。
    if (block)
      for (const d of block.matchAll(new RegExp(String.raw`^\s*${TS_KEY}\s*:\s*['"\`]([^'"\`]*)['"\`]`, 'gm')))
        put(d[1] ?? d[2] ?? d[3], d[4]);
  }
  return out;
}

/**
 * 穿透镜像**内部**的 var() 别名链,返回**全部可能的最终值**。
 *
 * 🔴 2026-07-28 第四轮:从「解一层、取首个声明」改成**穷尽展开**。上一版
 *    `decls.get(name)?.[0]` 只看链上每一环的**第一处**声明,实测可被绕过:
 *        --x-mid: var(--red);      <- 第一处:值是对的,上一版只看它
 *        --x-mid: #993333;         <- 第二处:CSS 里后声明胜出,真正生效的是它
 *        --brand: var(--x-mid);
 *    规则全绿,而小程序的主 CTA 实际已经变成 #993333。上一版对「同名重复声明」
 *    在**直接绑定**上是严的(found.forEach 每处都比),一进别名链就退化成只看第一处 ——
 *    等于给每条别名链发了一张免罚券。
 *
 * 现在:每一环的每一处声明都展开成一条分支,调用方要求**所有分支**都等于真源值。
 * 防环用「本条路径已访问过的变量名」集合(不是全局计数):`a→b→a` 直接停在环上,
 * 把没解开的 `var(--a)` 原样返回,交给比对去报漂移 —— 不在这里抛异常。
 */
function resolveAll(decls: Map<string, string[]>, value: string, seen: ReadonlySet<string> = new Set()): string[] {
  const v = value.trim();
  const m = PURE_ALIAS.exec(v);
  if (!m) return [v];
  const name = m[1];
  if (seen.has(name)) return [v]; // 成环
  const next = decls.get(name);
  if (!next?.length) return [v]; // 指向不存在的变量
  const seen2 = new Set(seen).add(name);
  return [...new Set(next.flatMap((n) => resolveAll(decls, n, seen2)))];
}

/**
 * globals.css 全部 token 的**当前值** → 归一颜色 → token 名。
 * 两条规则共用(「颜色声明对账」拿它给出「你多半该 bind 哪个 token」的提示,
 * 「非声明位置字面量」拿它当放行判据),所以只能有一份。
 */
const TOKEN_BY_COLOR: ReadonlyMap<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const name of ROOT_TOKENS.keys()) {
    let v: string;
    try {
      v = tokenValue(name);
    } catch {
      continue; // 指向不存在变量的 token 由别的规则管,这里不连坐
    }
    const c = canonicalColor(v);
    if (c) m.set(c, [...(m.get(c) ?? []), name]);
  }
  return m;
})();

/** 一处颜色字面量。`text` 是原样片段(进错误信息),`color` 是可比对的 CSS 颜色写法。 */
type Literal = { line: number; where: string; text: string; color: string };

/** 豁免表的 key:压掉空白与引号、转小写。`rgba(31, 31, 35, .05)` 与 `RGBA(31,31,35,.05)` 是同一条。 */
const litKey = (s: string) => s.replace(/\s+/g, '').replace(/['"`]/g, '').toLowerCase();

/**
 * CSS/wxss 的「属性: 值」声明(**含**普通属性,不只是自定义属性),带行号。
 *
 * ⚠️ 用 `(^|[;{}])` 锚在声明起点,是为了不把选择器里的伪类(`.acc-item:last-child`)
 *    当成声明 —— 那类误匹配的「值」里不会有颜色字面量,不影响结论,但会让调试信息变脏。
 * ⚠️ 只走声明值、**不裸扫全文**:`#confetti` 这种 ID 选择器长得就像 hex,
 *    裸扫会把它算成颜色字面量 —— 又一处误报,而误报会让规则被放宽。
 */
function cssDeclarations(text: string): { prop: string; value: string; at: number }[] {
  const out: { prop: string; value: string; at: number }[] = [];
  const re = /(?:^|[;{}])\s*(-{0,2}[A-Za-z][A-Za-z0-9_-]*)\s*:\s*([^;{}]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ prop: m[1], value: m[2], at: m.index + m[0].length - m[2].length });
  return out;
}

/** 绝对偏移 → 1-based 行号。 */
const lineAt = (text: string, at: number) => text.slice(0, at).split('\n').length;

/**
 * 镜像里**非声明位置**的颜色字面量。
 *
 * 「非声明位置」= 不是「某个自定义属性的整个值」—— 也就是直接写进 background / border /
 * box-shadow / gradient / 三元表达式的那些。它们对上面两条规则**完全隐身**:
 * 那两条问的都是「变量 X 的值对不对」,而这里根本没有变量。
 *
 * ⚠️ 排除口径只排「自定义属性 + 整值就是颜色或纯别名」这一种(那正好是前两条管的范围)。
 *    `--glow: 0 0 0 1px #CC2222` 这类**藏在复合值里的**字面色仍然要扫 ——
 *    它既不是可比对的颜色声明,也不是别名,前两条都够不着。
 * ⚠️ 含 `var(` 的函数式颜色(`rgb(var(--ink-rgb) / 12%)`)不算字面量:那是收口后的正确形态。
 */
function mirrorLiterals(text: string, kind: 'css' | 'ts'): Literal[] {
  const out: Literal[] = [];
  if (kind === 'css') {
    const RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;
    for (const d of cssDeclarations(text)) {
      const v = d.value.trim();
      if (d.prop.startsWith('--') && (canonicalColor(v) !== null || PURE_ALIAS.test(v))) continue;
      for (const m of d.value.matchAll(RE)) {
        if (/var\(/.test(m[0])) continue;
        const at = d.at + (m.index ?? 0);
        out.push({ line: lineAt(text, at), where: d.prop, text: m[0], color: m[0] });
      }
    }
    return out;
  }
  // TS:把 BRAND 整块抹掉(它归上面两条管),其余部分扫「引号包裹的 6/8 位裸 hex」与 `#hex`。
  // 🔴 3 位裸 hex 刻意不扫:去掉引号后 `'abc'` `'fed'` 这类普通短字符串就是三个十六进制字符,
  //    扫它必然误报;而 pptxgenjs 的口径本来就是六位。
  const masked = text.replace(/const BRAND\s*=\s*\{[\s\S]*?\n\}\s*as const;/, (m) => m.replace(/[^\n]/g, ' '));
  const RE = /['"`]#?(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})['"`]|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
  for (const m of masked.matchAll(RE)) {
    const at = m.index ?? 0;
    const bare = m[0].replace(/['"`]/g, '');
    out.push({
      line: lineAt(masked, at),
      where: (masked.split('\n')[lineAt(masked, at) - 1] ?? '').trim().slice(0, 60),
      text: m[0],
      color: bare.startsWith('#') ? bare : `#${bare}`,
    });
  }
  return out;
}

/**
 * 镜像文件在不在。
 *
 * ⚠️ frontend-user 的 Docker 构建 `context: ./frontend-user`,而 `prebuild` 会跑
 *    `npm run test:design` —— 那个环境里三个兄弟包**物理上不存在**。所以:
 *      · 三个都不在 且 仓库根标志物(docker-compose.yml)也不在 → 判定为「构建上下文」,
 *        整条规则跳过并打印原因(**不是静默 skip**);
 *      · 其余任何组合(哪怕只少一个)→ 硬失败。少一个通常意味着有人移动/删除了镜像,
 *        那正是最需要报警的时刻。
 */
const MIRROR_PRESENT = MIRRORS.filter((m) => existsSync(join(REPO, m.path)));
const IN_FULL_REPO = existsSync(join(REPO, 'docker-compose.yml'));
const ALL_MIRRORS_PRESENT = MIRROR_PRESENT.length === MIRRORS.length;

/**
 * 矩阵规模的**反向棘轮** —— 「矩阵被精简」这件事本身就要报警。
 *
 * 🔴 上一版的空转下限是 `checked >= MIRROR_PRESENT.length * 2`(实际下限 6),
 *    而矩阵有 51 条 bind / 52 个绑定变量 —— **删掉 88% 的矩阵仍然全绿**。
 *    空转防线的作用是「规则还活着吗」,下限贴着 6 就等于只证明了「三个文件都能打开」。
 *    现在下限直接挂在矩阵规模上:少一个绑定就红,要真的下线某个绑定必须同时压这个数,
 *    而压它是一个显式动作 —— 这正是「删规则」应有的成本。
 * 只在三份镜像齐全时校验(缺文件另有断言负责,不连坐)。
 */
const MIN_BOUND_VARS = 52; // 2026-07-28 实测:24(app.wxss)+ 24(brand.css)+ 4(pptxNative)
/** 两份 CSS 镜像里颜色声明的总数下限 —— 同上,防「解析器坏了 / 文件被掏空」时静默全绿。 */
const MIN_CSS_COLOR_DECLS = 55; // 2026-07-28 实测:28(app.wxss)+ 27(brand.css)

let warnedOnce = false;
/**
 * 不在完整仓库里时把用例标成 **skipped**,而不是 `return` 假装通过。
 * 「跳过」和「通过」在报告里必须长得不一样 —— 一条永远绿的规则和一条不存在的规则等价,
 * 而本文件的历史教训正是「51 条护栏全绿」掩盖了三个镜像同时落后两代。
 */
function skipOutsideRepo(ctx: { skip: () => void }) {
  if (MIRROR_PRESENT.length > 0 || IN_FULL_REPO) return;
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      '[design-guard] 跨包镜像规则已跳过:当前不在完整仓库里(frontend-user 的 Docker ' +
        '构建 context 只有 ./frontend-user,三个兄弟包物理上不在)。全仓跑时它会执行。'
    );
  }
  ctx.skip();
}

describe('跨包镜像(globals.css → 小程序 / 小工具 / pptx 导出)', () => {
  it('镜像里的**每一个**登记变量都必须绑住 globals.css 的当前真值', (ctx) => {
    skipOutsideRepo(ctx);
    expect(
      MIRRORS.filter((m) => !MIRROR_PRESENT.includes(m)).map((m) => m.path),
      '镜像文件找不到了。移动/重命名镜像必须同时改本矩阵,否则规则会静默失效'
    ).toEqual([]);

    // 矩阵体检:derived / literals / unbound 三张对账表的「理由」必须真的是理由。
    // 它们是本 describe 里仅有的三处「可以不比对」的出口,而一条 `'x'` 敷衍过去的理由
    // 与没有理由等价 —— 下一个人看到它只会照抄,于是出口变后门。
    const thinReasons = MIRRORS.flatMap((m) =>
      Object.entries({ ...(m.derived ?? {}), ...(m.literals ?? {}), ...(m.unbound ?? {}) })
        .filter(([, why]) => why.trim().length < 8)
        .map(([k]) => `${m.path}  «${k}» 的理由太短,写清楚「为什么它没有可比对的真源」`)
    );
    expect(thinReasons, thinReasons.join('\n')).toEqual([]);

    const drift: string[] = [];
    let checked = 0;
    for (const m of MIRROR_PRESENT) {
      const raw = readFileSync(join(REPO, m.path), 'utf8');
      // 🔴 必须剥注释再查。三份镜像的注释里都写着「(旧 #cc2222)」这类沿革说明,
      //    也都复述过当前值 —— 不剥注释的话,「注释里提到过」就能冒充「值已同步」。
      const text = m.kind === 'css' ? stripCssComments(raw) : stripComments(raw);
      const decls = mirrorDecls(text, m.kind);
      if (decls.size === 0) {
        drift.push(`${m.path}  一个变量声明都没解析出来 —— 规则空转了,先修 mirrorDecls() 的正则再说`);
        continue;
      }
      for (const { token, vars } of m.bind) {
        expect(vars.length, `矩阵有误:${m.path} 的 ${token} 登记了空变量列表 —— 零断言 = 后门`).toBeGreaterThan(0);
        let want: string;
        try {
          want = tokenValue(token); // 穿透 var(--red-5) 拿到 #882828
        } catch {
          drift.push(
            `${m.path}  登记了 ${token},但 globals.css 主 :root 里没有它(被改名/删了?)—— 先对齐矩阵与真源`
          );
          continue;
        }
        for (const v of vars) {
          const found = decls.get(v);
          if (!found?.length) {
            drift.push(
              `${m.path}  找不到变量 ${v} —— 它本该镜像 globals 的 ${token}(${want})。改名/删除必须同步本矩阵`
            );
            continue;
          }
          found.forEach((rawVal, i) => {
            const at = `${m.path}  ${v}${found.length > 1 ? `(第 ${i + 1}/${found.length} 处声明)` : ''}`;
            // 🔴 别名链**穷尽展开**:每一环的每一处声明都是一条分支,**每条**都得对。
            //    只看第一条 = 给别名链发免罚券(见 resolveAll 的注释)。
            const branches = resolveAll(decls, rawVal);
            branches.forEach((actual, bi) => {
              checked++;
              const via =
                actual !== rawVal.trim()
                  ? ` → 解引用后 «${actual}»${branches.length > 1 ? `(别名链第 ${bi + 1}/${branches.length} 条分支)` : ''}`
                  : '';
              // TS 侧还要卡**形态**:pptxgenjs 只认不带 `#` 的六位 hex,
              // 写成 '#882828' 颜色虽对但导出会坏 —— 所以形态错也算漂。
              if (m.kind === 'ts' && !/^[0-9a-f]{6}$/i.test(actual)) {
                drift.push(
                  `${at}  «${rawVal}»${via} 不是 pptxgenjs 要的「不带 # 的六位 hex」` +
                    `(应为 ${want.replace('#', '')} = globals ${token})`
                );
                return;
              }
              const got = m.kind === 'ts' ? `#${actual}` : actual;
              if (!sameValue(want, got))
                drift.push(`${at}  漂了:期望 ${want}(= globals ${token}),实际 «${rawVal}»${via}`);
            });
          });
        }
      }
    }
    expect(
      drift,
      '镜像与 globals.css 对不上。改真源就必须同步这三份人工镜像(每份文件头都有「上次同步」一行,一并更新):\n' +
        drift.join('\n')
    ).toEqual([]);
    // 规则空转防线(与「动效对齐」那几条同款):矩阵被清空 / 解析全 miss 时,
    // 上面的 drift 可能是空的 —— 空数组 toEqual([]) 会绿,而那是最坏的绿。
    // 🔴 下限**挂在矩阵规模上**,不是一个贴地的常数(见 MIN_BOUND_VARS 的注释)。
    const boundVars = MIRROR_PRESENT.reduce((n, m) => n + m.bind.reduce((k, b) => k + b.vars.length, 0), 0);
    if (ALL_MIRRORS_PRESENT)
      expect(
        boundVars,
        `矩阵被精简了:当前只登记 ${boundVars} 个绑定变量,基线 ${MIN_BOUND_VARS}。\n` +
          '删绑定 = 把那个变量交还给「无人看管」,必须在 PR 里说明理由并同时压 MIN_BOUND_VARS。'
      ).toBeGreaterThanOrEqual(MIN_BOUND_VARS);
    // drift 为空 ⇒ 每个登记变量都至少解析出一处声明并比对过,所以这里理应 ≥ 绑定变量数。
    expect(checked, '一个变量都没真的比对到 —— 规则空转了,先修解析或矩阵').toBeGreaterThanOrEqual(boundVars);
  });

  it('CSS 镜像里的**每一个**颜色声明都必须有交代:绑真源 token,或登记成自派生并写理由', (ctx) => {
    skipOutsideRepo(ctx);
    // 为什么单独一条: 上面那条只保证「**登记过的**变量是对的」,管不住镜像**长出新变量**。
    // pptxNative 有「BRAND 字段对账」兜这件事(下面那条),两份 CSS 镜像此前没有对应物。
    //
    // 🔴 2026-07-28 第四轮换判据。上一版问的是「这个未登记变量的值**恰好等于**某个
    //    globals token 吗」—— 于是它只在「值写对了」时才追究,**把值写错反而安静**:
    //        --accent-2: #993333;   ← 上一版实测全绿(不等于任何 token,所以不追究)
    //    也就是说它给约 59 个未登记变量开了一条「随便写什么颜色都行」的免检通道,
    //    而这条通道恰恰通向本 describe 要防的那件事(无人看管的镜像变量下次漂移没人知道)。
    //
    // 现在的判据是**对账**而不是**取样**:枚举文件里**全部**颜色声明,每一个二选一 ——
    //   ① 在 bind 里 → 上一条按真源逐值比对;
    //   ② 在 derived 里 → 明确声明「镜像自派生 / globals 无可比真源」并写清理由。
    // 两边都不在 = 红。这仍然是自维护的:它不是「命中才追究」的取样式白名单,
    // 而是「一个都不能少」的账本 —— 新增变量必须表态,删掉的 derived 条目会被当死豁免报出来。
    //
    // ⚠️ 只有**纯别名**(整值就是 `var(--x)`)的变量跳过:它跟着被指向的变量走,
    //    而那个变量本身也在本账本里(不在就会被这条规则抓)。
    // ⚠️ 「是不是颜色声明」按值解析判定,不按变量名猜 —— 圆角 / 字号 / 字族 / 时长
    //    这些非颜色声明天然不进账本(它们的护栏是另一件事,见文件头的已知缺口)。
    expect(TOKEN_BY_COLOR.size, 'globals.css 一个颜色 token 都没解析到 —— 规则空转').toBeGreaterThan(20);

    const unaccounted: string[] = [];
    const deadEntries: string[] = [];
    let colorDecls = 0;
    for (const m of MIRROR_PRESENT) {
      if (m.kind !== 'css') continue;
      const bound = new Set(m.bind.flatMap((b) => b.vars));
      const derived = m.derived ?? {};
      const decls = mirrorDecls(stripCssComments(readFileSync(join(REPO, m.path), 'utf8')), 'css');
      const liveDerived = new Set<string>();
      for (const [name, values] of decls) {
        // 「颜色声明」= 该变量**任何一处**声明(穿透别名链后)能解析成颜色。
        const colorish = values.filter(
          (v) => !PURE_ALIAS.test(v.trim()) && resolveAll(decls, v).some((r) => canonicalColor(r) !== null)
        );
        if (colorish.length === 0) continue;
        colorDecls++;
        if (bound.has(name)) continue; // 归上一条逐值比对
        if (derived[name]) {
          liveDerived.add(name);
          continue;
        }
        const same = [
          ...new Set(
            colorish
              .flatMap((v) => resolveAll(decls, v))
              .map(canonicalColor)
              .flatMap((c) => (c ? (TOKEN_BY_COLOR.get(c) ?? []) : []))
          ),
        ];
        unaccounted.push(
          `${m.path}  ${name}: ${colorish.join(' / ')}` +
            (same.length ? `  —— 与 globals 的 ${same.join(' / ')} 同值,多半就该 bind 它` : '')
        );
      }
      for (const k of Object.keys(derived))
        if (!liveDerived.has(k))
          deadEntries.push(`${m.path}  derived['${k}'] 在文件里已经不是一处颜色声明了(改名/删除?)`);
    }
    expect(
      deadEntries,
      '死条目:derived 里写着理由,文件里却没有对应的颜色声明。\n' +
        '本文件的历史反复证明「零命中的豁免不是保险,是留给下一个人的后门」——\n' +
        '变量没了就把条目删掉,不要留着:\n' +
        deadEntries.join('\n')
    ).toEqual([]);
    expect(
      unaccounted,
      '这些镜像变量持有颜色却谁也没管 —— 它们不受任何护栏保护(值对不对、下次漂不漂,没有任何东西会说话)。\n' +
        '二选一,不许第三种:\n' +
        '  ① 它镜像某个 globals token → 加进 MIRRORS 的 bind(此后逐值比对);\n' +
        '  ② 它是镜像自派生 / globals 里没有可比真源 → 加进该镜像的 derived 并写清理由。\n' +
        unaccounted.join('\n')
    ).toEqual([]);
    // 空转防线:解析器坏了 / 文件被掏空时,上面两个数组都会是空的 —— 那是最坏的绿。
    if (ALL_MIRRORS_PRESENT)
      expect(
        colorDecls,
        `两份 CSS 镜像里只解析出 ${colorDecls} 个颜色声明(基线 ${MIN_CSS_COLOR_DECLS})—— 先确认是真删了变量还是解析器坏了`
      ).toBeGreaterThanOrEqual(MIN_CSS_COLOR_DECLS);
  });

  it('三份镜像里「非声明位置」的颜色字面量必须等于某个真源 token(或具名豁免)', (ctx) => {
    skipOutsideRepo(ctx);
    // 🔴 为什么必须单独一条: 上面两条问的都是「**变量 X 的值**对不对」,
    //    而颜色可以根本不经过变量 —— 直接写进 background / border / box-shadow /
    //    linear-gradient / 三元表达式。那些地方对前两条**完全隐身**。
    //
    //    这不是假想的形态:pptxNative.ts 文件头自陈的那次真实回归就长这样 ——
    //    emitComparison 内联了两代前的品牌绿 2A7A2A 配一个体系外的红 C0392B,
    //    既不在 BRAND 里也不是任何变量的声明。当时能被发现纯属侥幸(2A7A2A 恰好在
    //    退休名单上);换成任意一个**没进过退休名单**的错色(实测 `'2F7A2F'`),
    //    2026-07-28 第四轮之前的全部规则**一条都不会红**。
    //
    // 判据:
    //   ① 值等于某个 globals token 的**当前值** → 放行(镜像把 token 值写进渐变是正常的);
    //   ② 否则必须在该镜像的 literals 里具名并写理由(Okabe-Ito 序列色 / 解析兜底黑 …)。
    // ⚠️ ① 是「值相等」而不是「绑到名字」,比上面两条弱一档 —— 这是有意的取舍:
    //    非声明位置没有名字可绑。它换来的是「体系外的颜色一个都进不来」,
    //    而漂移仍由 token 值本身的变化驱动(token 一改,这里立刻不等 → 红)。
    const bad: string[] = [];
    const deadEntries: string[] = [];
    for (const m of MIRROR_PRESENT) {
      const raw = readFileSync(join(REPO, m.path), 'utf8');
      // 剥注释:三份镜像的注释里都复述过颜色值、还写着「(旧 #cc2222)」这类沿革。
      // pptxNative 的注释里另有 `#1449` / `#285`(GitHub issue 号)—— 4 位/3 位都是合法
      // hex 形态,不剥注释就是两处纯误报。
      const text = m.kind === 'css' ? stripCssComments(raw) : stripComments(raw);
      const live = new Set<string>();
      for (const lit of mirrorLiterals(text, m.kind)) {
        const key = litKey(lit.text);
        if (m.literals?.[key]) {
          live.add(key);
          continue;
        }
        const c = canonicalColor(lit.color);
        const tokens = c ? TOKEN_BY_COLOR.get(c) : undefined;
        if (tokens?.length) continue; // = 某个 token 的当前值
        bad.push(
          `${m.path}:${lit.line}  «${lit.text}»  (${lit.where})` +
            (c === null ? '  —— 连颜色都解析不出来,写法先修对' : '  —— 不等于任何 globals token 的当前值')
        );
      }
      for (const k of Object.keys(m.literals ?? {}))
        if (!live.has(k)) deadEntries.push(`${m.path}  literals['${k}'] 在文件里已经找不到了`);
    }
    expect(
      deadEntries,
      '死豁免:literals 里写着理由,文件里却没有对应的字面量。收口了就把条目删掉 ——\n' +
        '零命中的豁免不是保险,是留给下一个人的后门(本文件里这句话已经应验过三次):\n' +
        deadEntries.join('\n')
    ).toEqual([]);
    expect(
      bad,
      '镜像里出现了「不属于设计体系」的硬编码颜色(不在任何变量声明里,所以上面两条看不见它)。\n' +
        '两种正确处置:① 它本该是某个 token → 改成引用镜像里对应的变量;\n' +
        '② 它确实与设计体系无关(第三方调色板 / 解析兜底)→ 加进该镜像的 literals 并写清理由:\n' +
        bad.join('\n')
    ).toEqual([]);
    // 空转防线:literals 全部命中即证明 CSS 与 TS 两条扫描链路都真的在跑
    //(app.wxss 有 CSS 侧的活体、pptxNative 有 TS 侧的活体)。brand.css 当前 0 处字面量,
    // 它的解析器由下面这条声明数下限兜。
    if (ALL_MIRRORS_PRESENT)
      for (const m of MIRROR_PRESENT.filter((x) => x.kind === 'css'))
        expect(
          cssDeclarations(stripCssComments(readFileSync(join(REPO, m.path), 'utf8'))).length,
          `${m.path} 只解析出个位数声明 —— 解析器坏了或文件被掏空,别让它静默全绿`
        ).toBeGreaterThan(20);
  });

  it('三份镜像里不得残留退休品牌色(与 src 用同一份名单)', (ctx) => {
    skipOutsideRepo(ctx);
    // 为什么单独一条: 上一条查的是「新值在不在」,这条查「旧值还在不在」。
    // 两者不等价 —— 同一个文件完全可以既有新声明、又在别处留着一个旧值
    // (镜像里同一个色往往被抄进 gradient / 阴影 / 图表序列好几处,漏改一处不影响上一条)。
    const { forms, sixOnly, triples } = retiredForms();
    const found: string[] = [];
    // 三种形态:① 带 `#` 的 hex(两类文件都可能出现);② **引号包裹的裸六位**
    // —— pptxgenjs 只认这一种,`#` 是可选前缀的写法会顺带把无辜数字扫进来,故单列;
    // ③ rgb() 三元组。
    const hexRe = new RegExp(String.raw`#(?:${forms.join('|')})\b`, 'gi');
    const bareRe = new RegExp(String.raw`['"\`](?:${sixOnly.join('|')})['"\`]`, 'gi');
    const rgbRe = new RegExp(String.raw`\brgba?\(\s*(?:${triples.join('|')})\b`, 'gi');
    for (const m of MIRROR_PRESENT) {
      const raw = readFileSync(join(REPO, m.path), 'utf8');
      const text = m.kind === 'css' ? stripCssComments(raw) : stripComments(raw);
      text.split('\n').forEach((line, i) => {
        for (const re of [hexRe, bareRe, rgbRe]) {
          re.lastIndex = 0;
          let x: RegExpExecArray | null;
          while ((x = re.exec(line))) found.push(`${m.path}:${i + 1}  «${x[0]}»`);
        }
      });
    }
    expect(
      found,
      '镜像里出现了退休品牌色。历史实况:三份镜像曾同时停在两代前的 #CC2222 / #2A7A2A / #D4A017,\n' +
        '而当时全部护栏绿灯 —— 就是因为没有这条断言:\n' +
        found.join('\n')
    ).toEqual([]);
  });

  it('pptxNative 的 BRAND 字段必须逐个「有登记 或 有具名豁免」', (ctx) => {
    skipOutsideRepo(ctx);
    // 为什么: 上面第一条只管**登记过的**字段,如果有人往 BRAND 里加了 `amber: 'E5A800'`
    // 却没同步矩阵,那个新字段就回到「无人看管」状态 —— 这条把「加字段」强制变成「必须表态」。
    //
    // 2026-07-28: 期望值从**手写快照**改成**由矩阵算出来**(bind 的字段 + unbound 的字段)。
    // 手写快照是第二份名单,它与矩阵一分叉,就会出现「快照里有、矩阵里没有」的字段
    // —— 那种字段两条规则都放行,恰好是本 describe 要防的东西。
    const p = MIRRORS.find((m) => m.kind === 'ts')!;
    if (!existsSync(join(REPO, p.path))) return; // 缺文件由上面第一条负责报警
    const src = stripComments(readFileSync(join(REPO, p.path), 'utf8'));
    const block = brandBlock(src);
    expect(block, 'pptxNative.ts 里找不到 `const BRAND = { … } as const;` —— 改了结构就要同步本规则').not.toBeNull();
    // 🔴 键的字符集必须与 mirrorDecls 用同一份 TS_KEY(带引号 / `_` / `-` 的键都是合法的)。
    //    上一版这里是自写的 `([A-Za-z][A-Za-z0-9]*)` —— 于是往 BRAND 里塞一个
    //    `'x-tint': '993333'` **两条规则同时看不见**:它既不进本条的字段集合
    //    (于是「与矩阵对不上」不会红),也不进 mirrorDecls(于是逐值比对够不着它)。
    //    实测确认过:加了这个字段之后 41 条用例全绿。
    const keys = [...block!.matchAll(new RegExp(String.raw`^\s*${TS_KEY}\s*:`, 'gm'))]
      .map((m) => m[1] ?? m[2] ?? m[3])
      .sort();
    const accounted = [...p.bind.flatMap((b) => b.vars), ...Object.keys(p.unbound ?? {})].sort();
    expect(
      keys,
      'BRAND 字段集合与矩阵对不上。每个字段二选一:\n' +
        '  ① 它镜像某个 globals token → 加进 MIRRORS 的 bind(会被逐字段比值);\n' +
        '  ② 它刻意不镜像(如 slideBg 的纯白页底)→ 加进 unbound 并写清理由。\n' +
        '两边都不在 = 不受任何护栏保护,这正是本规则要拦的:\n' +
        `  BRAND 实际字段:${keys.join(', ')}\n  矩阵已交代的:${accounted.join(', ')}`
    ).toEqual(accounted);
  });
});

/* ──────────────────────────────────────── 全仓资产(矩阵之外的品牌字面值)── */

/**
 * 🔴 漏洞 E ——「矩阵是手工名单,名单之外的文件谁也没在看」。
 *
 * 上面每一条规则的射程都是 `frontend-user/src` 或矩阵里那三份镜像。而设计资产
 * **不止在这两个地方**:小程序的 app.json / .wxml / lib/icons.ts、小工具的
 * `_shared/convert.js` 与各 app.js、`frontend-user/public/favicon.svg`(在 src 之外)、
 * 后端的对外邮件模板与 SSR 首屏内联样式、`design/remotion` 的宣传片素材 ……
 * 实测:把 `miniprogram/lib/icons.ts` 的红/绿/文字色全改坏 —— **41 条用例全绿**,
 * 而那个文件的文件头自己写着「改 globals → 改 app.wxss → 也要改这里,三处必须一起动」;
 * 它改坏后的文字色 #111111 就在退休名单上,「退休色残留」那条也没响 ——
 * 因为它只扫 src + 矩阵里那三份文件。**契约注释拦不住漂移,断言只能拦它够得着的地方。**
 *
 * 本族四条规则,按「越靠前越自维护」排:
 *   ① 退休色零容忍(**全仓**)—— 靶子是 RETIRED_BRAND 里 8 个具体的值,零登记成本。
 *      任何人在任何包里写下退休色都会红,不需要谁先把那个文件登记进来。
 *   ② 反向扫描 —— 靶子是 globals.css 的**当前值**,同样零登记成本;
 *      它只回答一个问题:「这个文件持有品牌真值,它登记过吗?」
 *   ③ 字面值镜像的值断言 —— ② 登记进来的文件,逐个颜色对账。
 *   ④ 副本逐字节一致 —— minitools 的 build.sh 把 `_shared/` cp 进 7 个工具目录。
 *
 * ⚠️ **三条刻意的口径差**(写在这儿,免得下一个人当成漏洞去「修」):
 *   1. ③ 的判据是「能追溯到某个 token 的当前值」,**不是**「绑到某个 token 名上」。
 *      字面值镜像里没有名字可绑(`navigationBarBackgroundColor` 是微信的 JSON 键,
 *      `fill=` 是 SVG 属性,Go 的邮件模板里是一串常量)。它保证「体系外的颜色一个
 *      都进不来」+「真源改了这里必须跟着改」,但**不保证角色没搞反** ——
 *      把红写成绿仍然全绿。要收紧就得给每个字面量登记它镜像的 token 名,那是下一棒的事。
 *   2. **派生值带 ±1 的舍入容差**(只对派生值;精确 token 值仍要求逐位相等)。
 *      alpha token 叠底、`color-mix()` 都会算出小数通道,而落到 8 位整数时
 *      「截断」与「进位」两种实现在本仓库**同时存在**:
 *        `--brand-red-soft = color-mix(in srgb, #882828 10%, #FFFFFF)` = (243.1, 233.5, 233.5)
 *        app.wxss 写 `#F3E9E9`(截断)· design/remotion 写 `#F3EAEA`(进位)—— 两个都对。
 *      所以每个通道接受 floor / ceil 两个值。窗口是 8 种颜色 / 1677 万,可以忽略;
 *      而不做这件事会制造一整批必然误报,那才是真正的代价(误报 → 规则被放宽)。
 *   3. ②/③ 只管**颜色**。长度族(圆角 / 字号 / 间距)本轮完全不做 —— 见文件头的理由。
 *
 * ⚠️ 关于 `readFileSync`:它读全字节,含非 UTF-8 字节的文件会得到 U+FFFD 而不是被跳过。
 *    这是刻意用它而不是 `grep` 的原因 —— BSD grep 默认**静默跳过**非 UTF-8 文件,
 *    本仓库有 83 个 .tsx 属于这一类,B5 迁移就是这么漏掉 OAuthConfigPage 的 4 处。
 */

/** frontend-user/ 自身 —— Docker 构建上下文里唯一存在的扫描根。 */
const FRONTEND_ROOT = join(__dirname, '..');

/**
 * 走查边界 —— **这三张表就是「规则射程」的定义**,改它们等于改射程。
 * 每一条都必须写清「为什么这里可以不看」,不写理由的排除等于一个匿名后门。
 */
/** 目录名级别:遇到就不进去(名字匹配,任意层级)。 */
const WALK_SKIP_DIRS: Record<string, string> = {
  node_modules: '第三方依赖,不是我们的设计资产',
  '.git': '版本库内部对象',
  dist: '构建产物(minitools 打包出的 zip 目录)',
  build: '构建产物',
  out: '构建产物(remotion 导出的 gif)',
  coverage: '测试覆盖率产物',
  '.next': '构建产物',
  '.cache': '缓存',
  '.turbo': '缓存',
  '.go-cache': 'Go 构建缓存(gitignore;里面的 .a 归档含整段 HTML 字面量,扫它纯噪音)',
  '.gomodcache-verify': 'Go 模块缓存副本(gitignore,本机 2.7GB)',
  '.gocache-verify': '同上',
  vendor: '第三方 vendored 依赖',
  data: '容器运行时数据卷(gitignore)',
  backups: '数据库备份',
  __pycache__: 'Python 字节码',
  '.venv': 'Python 虚拟环境',
  venv: 'Python 虚拟环境',
  miniprogram_npm: '小程序的 npm 构建产物',
  '.claude': '工具配置,非产品资产',
  '.idea': 'IDE 配置',
  '.vscode': 'IDE 配置',
};
/** 路径前缀级别(相对仓库根)。 */
const WALK_SKIP_PATHS: [string, string][] = [
  ['docs/', '迁移台账 / 审计报告 / 设计规格:正文**必须**引用旧色做前后对照,那是它们的职责'],
  ['design/pencil/', '已作废的 .pen 旧真源,保留作回滚参照 —— 它就该停在旧值上,跟着改反而是错的'],
  ['feature-tools-academic-5000/', '采集来的第三方工具素材(612MB,含大量第三方 SVG),不是本项目的设计资产'],
  ['feature-tools-coldstart/', '同上,冷启动期采集的第三方内容'],
  ['prism_tex/', 'LaTeX 模板与第三方样例,不进 Web 渲染'],
  ['frontend-user/public/pdfjs-cmaps/', 'pdf.js 的二进制 CMap 表(168 个),按 utf8 读出来是乱码'],
  // 🔴 这两条必须按**完整路径**排除,不能按文件名 —— `backend/cmd/server/` 与
  //    `backend/cmd/seo-backfill/` 是同名的**源码目录**(11 个 .go)。第一版写成了
  //    文件名级别的排除,当场把整个 backend/cmd 从射程里削掉了(实测走查文件数 1765 → 1740)。
  ['backend/server', 'Go 编译产物(.gitignore 里的显式条目,曾误提 ~48MB 进历史),按 utf8 读是乱码'],
  ['backend/seo-backfill', 'Go 编译产物,同上'],
];
/** 后缀级别(小写)。 */
const WALK_SKIP_EXT: Record<string, string> = {
  '.md': '文档:README / CLAUDE.md / 台账正文引用旧色做对照是它们的职责(与 docs/ 同理)',
  '.pen': '已作废的旧真源(二进制加密),见 design/pencil 的理由',
  '.bcmap': 'pdf.js 二进制 CMap',
  '.lock': '依赖锁文件:全是 hash,扫它只会给误报制造机会',
  '.sum': 'Go 校验和文件,同上',
  '.tsbuildinfo': 'tsc 增量状态',
  '.map': 'sourcemap 生成物',
};
/** 文件名级别。 */
/**
 * 文件名级别 —— ⚠️ **只对文件生效,不对目录**(走查里先 stat 再判)。
 * 同名目录是真实存在的陷阱,见 WALK_SKIP_PATHS 里 `backend/server` 那条的注释。
 */
const WALK_SKIP_FILES: Record<string, string> = {
  'package-lock.json': '依赖锁文件(487KB 的 hash),与 .lock 同理',
  '.DS_Store': 'macOS 目录元数据(二进制)',
};
/** 二进制后缀 —— 统一一条理由,单独列表只是为了不把上面那张表撑爆。 */
const BINARY_EXT = new Set(
  ('.png .jpg .jpeg .gif .webp .ico .avif .woff .woff2 .ttf .otf .eot .pdf .zip .gz .tgz ' +
    '.mp4 .mp3 .wav .bin .wasm .so .dylib .exe .db .sqlite .jar .class .pyc')
    .split(' ')
);
/** 单文件字节上限 —— 超过的**不是**默默跳过,会进「跳过清单」被断言(见规则 ①)。 */
const MAX_FILE_BYTES = 1_500_000;

/** HTML/XML/SVG/wxml 的注释。 */
function stripHtmlComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}
/**
 * `#` 注释(py / sh / conf / yml / Dockerfile / 无后缀脚本)。
 *
 * ⚠️ 只有「行首」或「前面是空白」的 `#` 才算注释起始 —— `"#882828"` / `fill="#fff"`
 *    里的 `#` 紧跟引号或等号,是颜色不是注释。这个区分是必须的:
 *    nginx.conf 有一行注释写着「favicon.svg 由旧品牌红 #CC2222 改成朱砂 #882828」,
 *    不剥它就是一处纯误报;而 render_gif.py 里的 `"#F3EAEA"` 必须留下来被检查。
 * ⚠️ 反过来的代价也写明:yml 里 `color: #fff`(不带引号)会被当注释剥掉 = 漏报。
 *    这类写法在本仓库为 0 处,且**漏报只是少抓一个,误报会让规则被放宽**。
 */
function stripHashComments(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, (m, lead: string) => lead + ' '.repeat(m.length - lead.length)))
    .join('\n');
}
/**
 * 按语言剥注释。**剥注释是本族规则成立的前提**:三份镜像、globals.css、
 * nginx.conf、markdown.ts …… 到处都有「(旧 #cc2222)」这类沿革注释,
 * 不剥的话「注释里提到过」就会被判成「代码里还留着」。
 */
function stripByLanguage(path: string, raw: string): string {
  if (/\.(css|wxss|scss|less)$/i.test(path)) return stripCssComments(raw);
  if (/\.(tsx?|jsx?|mjs|cjs|go|java|c|h|cpp)$/i.test(path)) return stripComments(raw);
  if (/\.(html?|wxml|svg|xml|vue)$/i.test(path)) return stripHtmlComments(raw);
  if (/\.(py|sh|bash|zsh|conf|ya?ml|toml|ini|env|example|prod|cnf|mod)$/i.test(path)) return stripHashComments(raw);
  if (/(^|\/)(Dockerfile|Makefile|\.env|\.gitignore|\.dockerignore)[^/]*$/i.test(path)) return stripHashComments(raw);
  if (!/\.[a-z0-9]+$/i.test(path)) return stripHashComments(raw); // 无后缀:按脚本/配置处理
  return raw; // .json / .sql / 其它:没有(或不敢猜)注释语法,原样扫
}

/** 「这一行里可能有颜色吗」的**廉价**预筛。必须是真正命中式正则的**超集**。 */
const COLOR_CANDIDATE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|['"`]#?[0-9a-fA-F]{6}['"`]/;
/**
 * 逐个颜色字面量。与预筛同源,只是把函数式颜色的括号内容一起吃掉。
 *
 * 🔴 `rgba?\(` 后面**必须紧跟数字**。上一版写的是 `\([^)]*\)`,而 `design/remotion` 的
 *    Python 直出脚本里有一个自己的辅助函数就叫 `rgb()`(`rgb(COLORS["text"], alpha)`)——
 *    整族规则当场制造出 100+ 条纯误报,还把它参数里的真实字面色 `rgb("#1D1D1D")`
 *    整个吞掉(**误报与漏报同时发生**)。要求首字符是数字既排掉函数调用,
 *    也顺带排掉 `rgb(var(--ink-rgb) / 12%)` —— 那本来就不是字面量,是收口后的正确形态。
 */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[0-9.]+[^)]*\)|['"`]#?[0-9a-fA-F]{6}['"`]/g;

type ScannedFile = { path: string; text: string };
type RepoScan = { root: string; files: ScannedFile[]; visited: number; oversized: string[] };

/**
 * 全仓语料 —— 走查一次、剥一次注释,四条规则共用(**不许各扫各的**)。
 *
 * 🔴 扫描根的选择是安全要件,不是优化:`REPO` = `frontend-user/..`,在 Docker 构建
 *    上下文里那是 `/`(镜像根目录)。无条件从 REPO 走查会去遍历整个文件系统。
 *    所以:完整仓库(有 docker-compose.yml)→ 从仓库根;否则 → 只走 frontend-user/。
 *    后者仍然比今天强 —— `public/favicon.svg`、`index.html`、`nginx.conf` 都在
 *    `src/` 之外,是**构建期护栏此前一个都够不着**的地方。
 *
 * ⚠️ 预筛(COLOR_CANDIDATE)只作用在**原始文本**上,不是优化投机:
 *    剥注释只会删字符,原文没有颜色形态 ⇒ 剥完更不会有。实测走查到的 1765 个文件里
 *    只有 142 个进入解析(读盘 + 剥注释 + 逐色解析都只发生在这 142 个上),
 *    整族耗时因此稳定在 ~0.6s —— 全仓脚本总时长 2.4s → 2.9s。
 */
const repoScan: () => RepoScan = (() => {
  let cache: RepoScan | null = null;
  return () => {
    if (cache) return cache;
    const root = IN_FULL_REPO ? REPO : FRONTEND_ROOT;
    // 🔴 走查结果的 `path` 必须**恒为仓库根相对**,不管这次是从仓库根走还是只从 frontend-user 走。
    //
    //    本文件所有的路径名单(WALK_SKIP_PATHS / UNMANAGED_EXEMPT / LITERAL_MIRRORS / 待修清单)
    //    写的都是 `frontend-user/tests/` 这种**仓库根相对**路径。而 Docker 构建里
    //    `context: ./frontend-user` → `__dirname` = `/app/tests` → `REPO` 退化成 `/`,
    //    `relative(REPO, p)` 于是产出 `app/tests/...` —— 与名单**一条都对不上**。
    //    后果实测(2026-07-28 线上构建被打断):护栏开始举报**它自己**
    //    (`tests/design-system-guard.test.ts` 里的 RETIRED_BRAND 名单被当成退休色残留),
    //    并把每一个**已登记**的镜像文件都报成「无人看管」。整个 Docker 构建 exit 1。
    //
    //    所以这里补一段前缀,让两种上下文产出同一种路径形态。
    //    ⚠️ 不要改成「让名单用相对路径」—— 名单里有 `docs/` `design/pencil/` `backend/server`
    //    这些 frontend-user **之外**的条目,它们只有在仓库根口径下才有意义。
    const relPrefix = IN_FULL_REPO ? '' : 'frontend-user/';
    const files: ScannedFile[] = [];
    const oversized: string[] = [];
    let visited = 0;
    const skipPath = (rel: string) => WALK_SKIP_PATHS.some(([p]) => rel === p.replace(/\/$/, '') || rel.startsWith(p));
    (function rec(dir: string) {
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of names) {
        if (WALK_SKIP_DIRS[name] !== undefined) continue;
        const p = join(dir, name);
        const rel = relPrefix + relative(root, p).split('\\').join('/');
        if (skipPath(rel)) continue;
        let st;
        try {
          st = statSync(p);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          rec(p);
          continue;
        }
        // 🔴 文件名级排除**放在这里**(已知它是文件),不能提到 stat 之前:
        //    `server` / `seo-backfill` 既是编译产物文件名,又是 backend/cmd 下的源码目录名。
        if (WALK_SKIP_FILES[name] !== undefined) continue;
        const ext = (/\.[a-z0-9]+$/i.exec(name)?.[0] ?? '').toLowerCase();
        if (BINARY_EXT.has(ext) || WALK_SKIP_EXT[ext] !== undefined) continue;
        visited++;
        if (st.size > MAX_FILE_BYTES) {
          oversized.push(rel);
          continue;
        }
        let raw: string;
        try {
          raw = readFileSync(p, 'utf8');
        } catch {
          continue;
        }
        if (!COLOR_CANDIDATE.test(raw)) continue;
        files.push({ path: rel, text: stripByLanguage(rel, raw) });
      }
    })(root);
    cache = { root, files, visited, oversized };
    return cache;
  };
})();

/**
 * globals.css 当前值的**可接受形态表**。三层,从严到宽(见本节文件头的口径差 2):
 *   exact   : token 的字面当前值,逐位相等。
 *   derived : alpha token 叠在两种页底(纯白 / 米白)上的合成值,以及 color-mix() 的解析值。
 *             每通道接受 floor / ceil 两个整数(8 位舍入两种实现在本仓库同时存在)。
 *   alpha   : RGB 与某个 token 相同、只是叠了 alpha(`rgba(136, 40, 40, .12)` = 品牌红 12%)。
 *             小程序 wxss / 小工具 CSS 里这是常态写法,拦它等于要求它们先有一套 -alpha token。
 *
 * 🔴 **刻意不做**的:任意百分比的「token 叠白」。做了的话几乎任何浅色都能被解释成
 *    「某个 token 的 x% 叠白」,这条规则就废了 —— 镜像里真正手工派生的那几个
 *    (`--red-line` = 品牌红 25% 叠白、markdown.ts 的 `--cat-blue 8% 叠白`)
 *    宁可逐个具名登记,也不给一个「万能解释」。
 */
type ColorAccept = { exact: Map<string, string[]>; derived: Map<string, string[]>; alpha: Map<string, string[]> };
const COLOR_ACCEPT: ColorAccept = (() => {
  const exact = new Map<string, string[]>();
  const derived = new Map<string, string[]>();
  const alpha = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
  /** canonicalColor 的**同一份**解析结果拆成通道 —— 不另写一个解析器(口径分叉是本文件的老病)。 */
  const channels = (v: string): number[] | null => canonicalColor(v)?.split(',').map(Number) ?? null;
  /**
   * 登记一个派生值(每通道 floor / ceil 两取,见本节文件头的口径差 2)。
   *
   * 🔴 `base` 不是装饰参数:**与所叠底色几乎相同的派生值必须丢弃**。
   *    实测踩到的坑 —— `--prism-editor-active` / `--ring-on-dark` 是 6% 的白,
   *    叠在米白页底上算出来是 (246.5, 244.5, 238.5),floor/ceil 一展开,
   *    `#F7F5EF` 就成了合法值 —— 而那是把 `--background #F6F4EE` **写歪 1/255** 的结果。
   *    (实测:在 miniprogram/app.json 里把导航栏底改成 #F7F5EF,加这道闸之前全绿。)
   *    这类派生值不承载任何信息,只会把「底色 ±1」变成合法,所以整条不登记。
   *    门槛取「任一通道差 ≥ 2」:低于它的合成色肉眼与算法都无法与底色区分。
   */
  const addDerived = (rgb: number[], label: string, base: number[]) => {
    if (rgb.every((x, i) => Math.abs(x - base[i]) < 2)) return;
    const opts = rgb.map((x) => [...new Set([Math.floor(x), Math.ceil(x)])]);
    for (const r of opts[0])
      for (const g of opts[1])
        for (const b of opts[2]) push(derived, `${r},${g},${b},1`, label);
  };
  const BASES: [string, number[]][] = [
    ['白', [255, 255, 255]],
    ['米白', [246, 244, 238]],
  ];
  for (const name of ROOT_TOKENS.keys()) {
    let v: string;
    try {
      v = tokenValue(name);
    } catch {
      continue;
    }
    const c = channels(v);
    if (c) {
      push(exact, c.join(','), name);
      push(alpha, c.slice(0, 3).join(','), name);
      if (c[3] < 1)
        for (const [bn, bg] of BASES)
          addDerived(
            [0, 1, 2].map((i) => c[i] * c[3] + bg[i] * (1 - c[3])),
            `${name} 叠${bn}`,
            bg
          );
      continue;
    }
    // color-mix(in srgb, var(--x) N%, var(--y)) —— globals 的软底族全是这个形态。
    const mix = /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/i.exec(v.trim());
    if (!mix) continue;
    const side = (s: string): number[] | null => {
      const inner = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/.exec(s.trim());
      if (!inner) return channels(s);
      try {
        return channels(tokenValue(inner[1]));
      } catch {
        return null;
      }
    };
    const a = side(mix[1]);
    const b = side(mix[3]);
    if (!a || !b) continue;
    const p = Number(mix[2]) / 100;
    addDerived(
      [0, 1, 2].map((i) => a[i] * p + b[i] * (1 - p)),
      `${name}(color-mix 解析值)`,
      b // 被混入的底色:混得太少 ⇒ 结果与底色无法区分,不登记(见 addDerived 的注释)
    );
  }
  return { exact, derived, alpha };
})();

/** 一个颜色能不能追溯到 globals 的当前值;能则返回「凭什么」(进错误信息用)。 */
function explainColor(literal: string): string | null {
  const c = canonicalColor(literal);
  if (c === null) return null;
  const ex = COLOR_ACCEPT.exact.get(c);
  if (ex) return ex.join('/');
  const de = COLOR_ACCEPT.derived.get(c);
  if (de) return de.join('/');
  const ch = c.split(',').map(Number);
  if (ch[3] < 1) {
    const al = COLOR_ACCEPT.alpha.get(ch.slice(0, 3).join(','));
    if (al) return `${al.join('/')} 叠 alpha ${ch[3]}`;
  }
  return null;
}

/**
 * 「持有品牌真值」的信号色 —— 反向扫描(规则 ②)的靶子。
 *
 * 口径比 explainColor **严得多**,而且是有意的:这里要回答的是「这个文件是不是一份
 * 没登记的镜像」,靠的必须是**高信噪比**的证据。所以只认「**不透明的、逐位相等的**
 * token 当前值」—— alpha 变体、叠底派生值一律不算信号(它们太容易撞上)。
 *
 * ⚠️ 由此而来的**已知盲点**,写在这儿别让下一个人以为它是全的:一个**只**用
 *    「品牌色叠 alpha」而从不写不透明真值的文件(纯 `rgba(136, 40, 40, .2)` 那种)
 *    不会被判成信号持有者,于是也不会被要求登记。要收紧就得把 alpha 变体也算信号,
 *    代价是把一大批 `rgba(0,0,0,.5)` 之类的通用阴影拉进来 —— 那会淹掉这条规则。
 *    退休色零容忍(规则 ①)对这类文件仍然有效,它不看信号。
 */
const SIGNAL_EXCLUDE: Record<string, string> = {
  '255,255,255,1': '纯白(= --surface-card / --on-brand / --card …)同时是全世界最常见的颜色,拿它当信号会把上百个无关的图标/HTML 拉进来',
  '0,0,0,1': '纯黑(= --logo-ink)同上;真正要防的「旧纯黑 #111111」在退休名单里,由规则 ① 负责',
};
const SIGNAL_COLORS: ReadonlySet<string> = new Set(
  [...COLOR_ACCEPT.exact.keys()].filter((k) => k.endsWith(',1') && SIGNAL_EXCLUDE[k] === undefined)
);

/**
 * **待修清单**,不是豁免清单。
 *
 * 🔴 规则 ① 上线时全仓实测出 5 处退休色残留,全部在**我名下之外的文件**里
 *    (design/remotion 的宣传片素材 + agent 的 deck 模板)。处置方式有三种,
 *    这里选的是第三种,理由写在下面:
 *      (a) 顺手改掉它们 —— 越界改别人的文件,而且 remotion 的阴影色是**视觉变化**;
 *      (b) 让规则一直红 —— pre-push 钩子会拦住所有人的每一次 push,
 *          三天之内所有人都会学会 `SKIP_DESIGN_GUARD=1`,整个护栏当场死亡;
 *      (c) **逐条具名、连出现次数一起钉死**,并写进交接的 blockers。
 *    (c) 与「放宽规则」的区别在于:射程一寸没缩 —— 同一个文件里**多出一处**要红,
 *    换一个退休色要红,换一个文件要红;而修好之后**必须删条目**,否则死条目也红。
 *    它是一张会自己催命的欠条,不是一张通行证。
 */
const RETIRED_DEBT: { path: string; why: string; hits: Record<string, number> }[] = [
  {
    path: 'design/remotion/peer-review-flow/src/PeerReviewFlow.tsx',
    why: '待修:卡片阴影用两代前的纯黑 rgba(17,17,17)(现玄墨 31,31,35),分隔渐变用一代品牌红 rgba(204,34,34)(现 #882828)。该文件顶部的 COLORS 表本身已经是当前值,这几处是漏改的散点 —— 改它是视觉变化(阴影会略偏冷),该由维护宣传片的人拍板',
    hits: { 'rgba(17,17,17': 3, 'rgba(204,34,34': 1 },
  },
  {
    path: 'design/remotion/claw-agent-flow/src/ClawAgentFlow.tsx',
    why: '待修:同上,卡片描边阴影 rgba(17,17,17,0.10) 是两代前的纯黑',
    hits: { 'rgba(17,17,17': 1 },
  },
  {
    path: 'agent/bolt-slides-template/src/deck/exportModel.ts',
    why: "待人判定:`readVar(rootCs, '--fg', '#111111')` 的兜底值。该模板自带一套与 Scholay 无关的调色板(--primary 是 #2f5fb0 蓝),所以这处 #111111 可能是「通用深灰兜底」而非品牌残留 —— 若是,应当具名豁免;若这套 deck 要跟 Scholay 品牌走,应改成 #1F1F23。两条路都不该由护栏顺手决定",
    hits: { '#111111': 1 },
  },
];

/**
 * **字面值镜像** —— 结构上给不出「变量名 → 值」的镜像,只能按值对账。
 *
 * 与上面 MIRRORS(变量级绑定)的分工:
 *   · MIRRORS      : 文件本身就是一张 token 表(app.wxss / brand.css / pptxNative 的 BRAND),
 *                    能登记「globals 的 X 绑在这里的哪几个变量上」,逐值比对。
 *   · LITERAL_MIRRORS: 结构上没有变量位(微信 app.json 的导航栏色、.wxml 属性、
 *                    favicon.svg 的 fill、Go 里拼 HTML 的常量、Python 画 GIF 的字典),
 *                    只能断言「文件里每个颜色都能追溯到 globals 的当前值」。
 *
 * `allow` 是**对账名单不是豁免名单**:写了却不存在的死条目一样红(本文件里
 * 「零命中的豁免 = 留给下一个人的后门」这句话已经应验过三次)。
 * ⚠️ 退休色**不进** allow —— 它们归规则 ①(与 RETIRED_DEBT)管,同一处违规
 *    不该在两张名单里各写一遍(两张名单迟早只改一张)。
 */
const LITERAL_MIRRORS: { path: string; why: string; allow?: Record<string, string> }[] = [
  // ── frontend-user 里 src/ 之外的静态资产(**构建期护栏也够不着 src 外**)──
  { path: 'frontend-user/index.html', why: '<meta name="theme-color"> —— 移动端浏览器地址栏底色,HTML 属性吃不到 CSS 变量' },
  { path: 'frontend-user/public/favicon.svg', why: '站点图标:SVG 的 fill 属性,且它在 src/ 之外(51 条 src 规则一条都够不着)' },
  {
    path: 'frontend-user/public/favicon-v3.svg',
    why:
      '同上 —— favicon 换代时【必须换文件名】(不带内容 hash + nginx 有 TTL,原地改内容对老访客无效),\n'
      + '      所以站点图标会长期存在「当前版 + 同内容的旧名副本」两份,两份都要登记。\n'
      + '      2026-07-28 内容从手搓的 S 字母方块换成 Figma 品牌标本体(ScholayMark / node 1:220)。',
  },
  // ── 小程序:wxss 之外的四类结构性字面值 ──
  { path: 'miniprogram/app.json', why: '微信全局配置:导航栏 / tabBar 颜色。**JSON 结构上不可能**写 CSS 变量,小程序运行时也不解析它们' },
  { path: 'miniprogram/custom-tab-bar/index.ts', why: '自定义 tabBar 的选中/未选中文字色 —— 由 JS 传给 <cover-view>,同样不走 wxss' },
  { path: 'miniprogram/lib/icons.ts', why: '内联 SVG 图标的 fill/stroke(data: URI 里没有 CSS 上下文)。**它就是 E 的实测样本**:改坏它,第五轮之前 41 条用例全绿' },
  {
    path: 'miniprogram/lib/format.ts',
    why:
      '期刊/论文字标封面的哈希色板 COVER_COLORS —— .ts 常量拿不到 wxss 变量,小程序也没有读 CSS ' +
      '变量的 JS 接口,只能写字面值。对应 Web 端 JournalCover.tsx 的 COVER_TONES(bg-cat-1..8)。' +
      '⚠️ **它是「反查规则也够不着」的活样本**:该规则靠「文件里含有当前品牌真值」来发现未登记镜像,' +
      '而本文件在 2026-07-28 之前 8 个值【全是错的】(裸 Tailwind 500 档,含 3 个蓝紫,' +
      '而设计说明明确「无蓝系」)—— 一个真值都没有 = 对反查完全隐形。' +
      '**写错值反而比写对值更安全**,这是本轮护栏最反直觉的一个缺口,只能靠显式登记堵。',
  },
  {
    path: 'miniprogram/lib/markdown.ts',
    why: 'markdown → wxml 的内联 style 串(小程序 rich-text 不吃 class,只能内联)',
    allow: {
      '#d6d6d8':
        '引用块左边线:自称 --border-strong 叠白,实算 CECECF(反解 ~18.3% alpha)—— 与 pptxNative 的 hair 是**同一处**偏差,待人拍板(见 blockers)',
      '#eef2f8': '代码块底色:--cat-blue 8% 叠白的手工派生。globals 的 --cat-blue-soft 是 10%,不是同一个值;wxss 也不能用 color-mix',
      '#cbd6e9': '同上,代码块描边 = --cat-blue 25% 叠白',
      '#008000': 'VSCode 亮色主题的代码高亮四色之一(注释绿)—— 第三方语法配色,刻意在品牌体系之外',
      '#a31515': '同上(字符串红)',
      '#098658': '同上(数字绿)',
      '#0000ff': '同上(关键字蓝)',
    },
  },
  { path: 'miniprogram/pages/search/search.wxml', why: '<icon color="…"> 属性:wxml 属性值不能写 var(),只能字面色' },
  { path: 'miniprogram/pages/claw/claw.wxss', why: '页面 wxss:大量「品牌色叠 alpha」的阴影/描边,小程序没有 color-mix,只能写 rgba() 字面值' },
  // ── 小工具(小红书离线 H5,禁外链 → 每个包必须自带样式)──
  {
    path: 'scholay-minitools/_shared/convert.js',
    why: '底部转化卡的内联样式 + 内联二维码 SVG(离线包禁外链,连图片都得内联)',
    allow: { '#0b1220': '内联二维码 SVG 的像素色 —— QR 码要的是最大对比度的深色,不是 UI 颜色' },
  },
  { path: 'scholay-minitools/checkrate/app.js', why: '查重红线仪表盘的档位配色,JS 里按分数算出来直接塞 style' },
  { path: 'scholay-minitools/diff/app.js', why: '文本 diff 的增/删/改高亮色,同上' },
  { path: 'scholay-minitools/predatory/app.js', why: '风险计的五级配色,同上' },
  { path: 'scholay-minitools/stats/app.js', why: 'Canvas 图表的序列色 —— canvas 上下文只吃字面色,拿不到 CSS 变量' },
  { path: 'scholay-minitools/formula/style.css', why: '公式编辑器的局部样式(mathlive 的 shadow DOM 部分变量透不进去)' },
  {
    path: 'scholay-minitools/sandbox/style.css',
    why: '「落沙实验室」的深色舞台样式',
    allow: {
      'rgba(64,84,150,.18)': '舞台顶部的冷光晕(深色实验视窗的氛围光,不是 UI 色)',
      '#171b26': '舞台底:深空渐变起点',
      '#0d0f16': '舞台底:深空渐变终点',
      'rgba(5,6,10,.5)': '舞台内侧晕影',
      '#d9dee9': '舞台内提示文字(深底上的浅灰,体系里最接近的 --on-dark #E6E6F2 在深空底上偏亮)',
    },
  },
  {
    path: 'scholay-minitools/sandbox/sim.js',
    why: '元胞自动机内核的**材料色板**(沙/水/石/植物/油/岩浆/酸/冰/火/炸药)—— 游戏美术,与品牌体系无关,与 src 侧 figure/ 科研绘图素材同一条理由',
    allow: {
      '#e3c078': '材料色:沙',
      '#3f7fe0': '材料色:水',
      '#7b8494': '材料色:石',
      '#3fa65e': '材料色:植物',
      '#5a4a33': '材料色:油',
      '#ff7a1a': '材料色:岩浆',
      '#a3e635': '材料色:酸',
      '#a5e8ff': '材料色:冰',
      '#ff8a2a': '材料色:火',
      '#e0564b': '材料色:炸药',
    },
  },
  {
    path: 'scholay-minitools/icons/sandbox.html',
    why: '沙盒工具的 1024×1024 图标源(HTML → 截图导出 PNG),里面同时有品牌色和游戏美术色',
    allow: {
      'rgba(90,110,200,.30)': '图标底的冷光晕(深空氛围)',
      '#18203a': '图标底:深空渐变起点',
      '#0b0e18': '图标底:深空渐变终点',
      '#5aa0f0': '「水」像素块渐变亮端(游戏美术)',
      '#2f6fd0': '「水」像素块渐变暗端',
      '#e6c26a': '「沙」像素块渐变亮端',
      '#c99a17': '「沙」像素块渐变暗端',
    },
  },
  // ── 后端:值是**解析后的字面量**,不是 token 原文(换算关系写在各条 allow / 下面注释)──
  {
    path: 'backend/internal/common/utils/email_template.go',
    why: '对外邮件的 HTML 模板:邮件客户端(尤其 Outlook)不吃 CSS 变量,只能内联字面色。⚠️ 其中 #E4E4E5 是 `--border`(玄墨 12%)**叠白之后**的实色,不是 token 原文',
  },
  {
    path: 'backend/internal/config/handler_ssr.go',
    why: 'SSR 首屏注入的内联样式(在 CSS 加载前就要有正确底色,拿不到 globals)。⚠️ #DCDAD6 是 `--border` 叠**米白**页底的实色',
  },
  { path: 'backend/internal/content/render.go', why: '后端渲染内容页的内联样式,同 handler_ssr(#DCDAD6 同样是 --border 叠米白)' },
  // ── 宣传片素材(remotion + 同款 Python 直出 GIF,两份必须同色)──
  {
    path: 'design/remotion/peer-review-flow/src/PeerReviewFlow.tsx',
    why: '审稿流程宣传片:remotion 合成画布,脱离页面 CSS 上下文,颜色只能字面写',
  },
  {
    path: 'design/remotion/claw-agent-flow/src/ClawAgentFlow.tsx',
    why: '智能助手宣传片,同上',
    allow: { '#d8d8d8': '深色卡片上的次要说明文字 —— 体系里最接近的 --on-dark-muted #9A9AA6 在该底色上偏暗,是素材的光学调整' },
  },
  {
    path: 'design/remotion/prism-writing-flow/src/PrismWritingFlow.tsx',
    why: '智能写作宣传片,同上',
    allow: {
      '#d8d0bd': '演示画面里「纸张」的暖色装饰边(素材构图,不是 UI)',
      '#d8c99f': '同上,标签底的暖色描边',
    },
  },
  {
    path: 'design/remotion/peer-review-flow/render_gif.py',
    why: '同一支片子的 Python 直出 GIF 版:必须与上面的 tsx 用同一组颜色',
    allow: {
      '#f0f0f0': '背景网格线的浅灰(tsx 版对应处是 rgba(0,0,0,0.035);PIL 不做 alpha 合成,只能先取一个浅灰再单独传 alpha)',
      '#e7e7e7': '进度条空槽:与 --border 叠白(#E4E4E5)差 3/255 的手调浅灰,是素材侧的光学调整而不是 token',
    },
  },
  {
    path: 'design/remotion/claw-agent-flow/render_gif.py',
    why: '同上',
    allow: {
      '#d8d8d8': '与 tsx 版同一处次要说明文字',
      '#f0f0f0': '背景网格线的浅灰,与 peer-review 版同一处',
    },
  },
  {
    path: 'design/remotion/prism-writing-flow/render_gif.py',
    why: '同上',
    allow: {
      '#ff5f57': 'macOS 窗口红黄绿三点之一 —— 演示画面里模拟的编辑器窗口 chrome,是 macOS 的系统色',
      '#febc2e': '同上',
      '#28c840': '同上',
      '#f0f0f0': '背景网格线的浅灰,与 peer-review 版同一处',
      '#1d1d1d': '深色编辑器的当前行高亮底(在 --prism-editor-bg #09090A 与 chrome-bg #2B2B30 之间的手调值)',
      '#d8d0bd': '与 tsx 版同一处:演示画面里「纸张」的暖色装饰边',
      '#d8c99f': '与 tsx 版同一处:标签底的暖色描边',
    },
  },
];

/**
 * `_shared/` 的副本 —— `scholay-minitools/build.sh` 打包时 `cp` 进每个工具目录。
 * 断言**逐字节一致**而不是逐值比对:副本的正确性判据本来就是「与源相同」,
 * 而且这样能顺带覆盖注释、字体、结构的漂移(源改了没重跑 build.sh = 副本落后)。
 */
const MIRROR_COPIES: { copy: string; source: string }[] = ['checkrate', 'diff', 'formula', 'predatory', 'sandbox', 'stats', 'status'].flatMap(
  (tool) => [
    { copy: `scholay-minitools/${tool}/shared/brand.css`, source: 'scholay-minitools/_shared/brand.css' },
    { copy: `scholay-minitools/${tool}/shared/convert.js`, source: 'scholay-minitools/_shared/convert.js' },
  ]
);

/**
 * 退休色零容忍(规则 ①)的豁免 —— **只有两条,而且都必须是「值撞上了,但它不是品牌色」**。
 * 「这个目录太乱了懒得管」不是理由;那种情况正确的做法是进 RETIRED_DEBT 具名待修。
 */
const RETIRED_SCAN_EXEMPT: [string, string][] = [
  [
    `frontend-user/src/${SCI_FIGURE_DIR}`,
    '科研绘图素材(bioicons CC0 + 自绘):#d4a017 / #111 表达的是分子与细胞器的科研语义,是配色巧合 —— 与 src 侧那条退休色规则**共用 SCI_FIGURE_DIR 常量**,不是第二份名单',
  ],
  [
    'frontend-user/tests/design-system-guard.test.ts',
    '护栏自身:RETIRED_BRAND 名单、错误信息里的示例色、正则自检探针、RETIRED_DEBT 的登记项,**必然**含退休色字面量 —— 它持有这些值正是它的工作',
  ],
];

/** 反向扫描(规则 ②)里**不要求登记**的路径 → 理由。零命中的条目会被报成死豁免。 */
const UNMANAGED_EXEMPT: [string, string][] = [
  ['frontend-user/src/', 'src 侧另有一整套规则在管(硬编码 hex 棘轮 + 两条色板类名规则 + 退休色零容忍 + JS 字符串里的裸 CSS),再登记一遍就是第二份名单,而两份名单必然分叉'],
  ['frontend-user/tests/', '护栏自身:它的工作**就是**持有真源值做断言(RETIRED_BRAND / 期望值 / 错误信息里的示例色)'],
  ['scholay-minitools/formula/mathlive.min.mjs', '第三方 vendored 库(mathlive 压缩产物,内置 400+ 个色板色);它命中信号纯粹是那 400 个里撞上了一个,不是镜像'],
];

/**
 * 规则空转防线的**下限** —— 只在完整仓库里校验(缺文件另有断言负责)。
 *
 * ⚠️ 与本文件上半部分的**棘轮**(`ratchet()`)是两种东西,别套用那边「零余量」的铁律:
 *   · 棘轮是**上限**,余量 = 免费违规额度,所以必须贴着实测值;
 *   · 这里是**下限**,防的是「射程塌了 / 解析器坏了」——
 *     贴着实测值会让每一次正常删文件都变红,那是噪音,而噪音会让人关掉规则。
 *   取实测值的 ~90%:一次误加的 WALK_SKIP 通常砍掉成百上千个文件,这个门槛拦得住。
 *   实测值全部记在下面,**要收紧就照着改**:
 *     RATCHET_REPORT=1 npx vitest run tests/design-system-guard.test.ts
 */
const MIN_REPO_FILES = 1600; // 2026-07-28 实测 1765(排除 .md / .bcmap / 锁文件 / 二进制之后)
const MIN_COLOR_FILES = 128; // 实测 142:预筛判定「可能含颜色」的文件
const MIN_SIGNAL_FILES = 46; // 实测 52:持有 globals **当前值**的文件(白/黑不算信号)
const MIN_LITERAL_CHECKS = 320; // 实测 357:字面值镜像里被成功追溯的颜色总数

describe('全仓资产(矩阵之外的品牌字面值)', () => {
  it('退休品牌色零容忍 —— 全仓口径,不止 frontend-user/src', () => {
    const { forms, sixOnly, triples } = retiredForms();
    const hexRe = new RegExp(String.raw`#(?:${forms.join('|')})\b`, 'gi');
    const bareRe = new RegExp(String.raw`['"\`](?:${sixOnly.join('|')})['"\`]`, 'gi');
    const rgbRe = new RegExp(String.raw`\brgba?\(\s*(?:${triples.join('|')})\b`, 'gi');
    const scanLine = (line: string) => {
      const out: string[] = [];
      for (const re of [hexRe, bareRe, rgbRe]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line))) out.push(m[0]);
      }
      return out;
    };
    // 🔴 自检:靶子必须真的会命中。三种形态各造一个探针 —— 名单/正则被谁改坏时,
    //    「全仓 0 命中」看起来和「全仓干净」一模一样,这是最坏的绿。
    expect(
      scanLine(`a #CC2222 b 'D4A017' c rgba(42, 122, 42, 0.12) d`).length,
      '退休色正则自检失败 —— 三种形态(#hex / 引号裸六位 / rgb 三元组)至少有一种匹配不到了'
    ).toBe(3);

    const scan = repoScan();
    const debtSeen = new Map<string, Map<string, number>>();
    const exemptSeen = new Set<string>();
    const violations: string[] = [];
    for (const f of scan.files) {
      const exempt = RETIRED_SCAN_EXEMPT.find(([p]) => f.path === p || f.path.startsWith(p));
      const debt = RETIRED_DEBT.find((d) => d.path === f.path);
      f.text.split('\n').forEach((line, i) => {
        for (const hit of scanLine(line)) {
          const key = hit.replace(/\s+/g, '').replace(/['"`]/g, '').toLowerCase();
          if (exempt) {
            exemptSeen.add(exempt[0]);
            continue;
          }
          if (debt && debt.hits[key] !== undefined) {
            const per = debtSeen.get(f.path) ?? new Map<string, number>();
            per.set(key, (per.get(key) ?? 0) + 1);
            debtSeen.set(f.path, per);
            continue;
          }
          violations.push(`${f.path}:${i + 1}  «${hit}»`);
        }
      });
    }
    expect(
      violations,
      '出现了退休品牌色。这不是风格偏好而是**换代残留**:它们与现行值只差几个色阶,\n' +
        '肉眼分辨不出,却会让同一个语义在两个页面上是两种颜色(海报的 #CD2323 就是这么漂的)。\n' +
        '⚠️ 本规则**不设棘轮也不设目录豁免**:射程就是整个仓库(排除项见 WALK_SKIP_*,每条都有理由)。\n' +
        '正确处置只有两种:改成对应的当前 token 值;或者它根本不是品牌色(第三方素材 / 科研配色)——\n' +
        '那就说明它不该在射程内,去 WALK_SKIP_PATHS 里加一条**带理由**的排除:\n' +
        violations.join('\n')
    ).toEqual([]);

    // 待修清单必须**逐条对得上**:多一处(有人在同一个文件里又写了一个)、
    // 少一处(修了却没删条目)、整条消失(文件改名/删除),三种情况都红。
    const debtDrift: string[] = [];
    for (const d of RETIRED_DEBT) {
      const present = scan.files.some((f) => f.path === d.path);
      if (!present) {
        if (IN_FULL_REPO) debtDrift.push(`${d.path}  待修清单里有它,但全仓扫不到这个文件了(改名/删除?)—— 请删掉条目`);
        continue;
      }
      const seen = debtSeen.get(d.path) ?? new Map<string, number>();
      for (const [k, n] of Object.entries(d.hits)) {
        const got = seen.get(k) ?? 0;
        if (got !== n)
          debtDrift.push(
            `${d.path}  «${k}» 登记 ${n} 处,实际 ${got} 处 —— ` +
              (got > n ? '**新增了**退休色,这正是本规则要拦的' : '修好了就把条目一起删掉(或改计数),死条目 = 下一个人的后门')
          );
      }
      for (const k of seen.keys())
        if (d.hits[k] === undefined) debtDrift.push(`${d.path}  «${k}» 不在该文件的待修清单里`);
    }
    expect(debtDrift, `退休色待修清单与实际对不上:\n${debtDrift.join('\n')}`).toEqual([]);

    // 死豁免:RETIRED_SCAN_EXEMPT 里零命中的条目。本文件里这句话已经应验过三次 ——
    // 一条豁免 0 命中,说明它要么早已收口(该删),要么路径写错了(等于没写)。
    const deadExempt = RETIRED_SCAN_EXEMPT.filter(([p]) => !exemptSeen.has(p)).map(([p]) => p);
    if (IN_FULL_REPO)
      expect(
        deadExempt,
        `零命中的豁免不是保险,是留给下一个人的后门 —— 这几条豁免下面已经没有退休色了,请删掉:\n${deadExempt.join('\n')}`
      ).toEqual([]);

    // 空转防线:走查到的文件数、以及「超大文件被跳过」的清单必须为空
    //(超大文件不是默默略过 —— 那等于给「往生成物里塞颜色」开一条路)。
    expect(scan.oversized, `这些文件超过 ${MAX_FILE_BYTES} 字节被跳过了,先确认它们该不该进 WALK_SKIP_*`).toEqual([]);
    if (process.env.RATCHET_REPORT)
      console.log(
        `RATCHET\t全仓走查\t文件 ${scan.visited}(基线 ${MIN_REPO_FILES})\t含颜色 ${scan.files.length}(基线 ${MIN_COLOR_FILES})\t根 ${scan.root}`
      );
    if (IN_FULL_REPO)
      expect(
        scan.visited,
        `全仓只走查到 ${scan.visited} 个文件(基线 ${MIN_REPO_FILES})—— 先确认是真删了东西,还是 WALK_SKIP_* 把射程削掉了`
      ).toBeGreaterThanOrEqual(MIN_REPO_FILES);
    expect(scan.files.length, '一个含颜色的文件都没解析到 —— 规则空转了,先修 COLOR_CANDIDATE / 走查根').toBeGreaterThan(0);
  });

  it('矩阵之外不得有「无人看管」的品牌字面值持有者', () => {
    // 判据自维护:靶子是 globals.css 的**当前值**(SIGNAL_COLORS),不是任何手工名单。
    // token 改值,靶子跟着改;新增 token,靶子自动变多。所以这条不会「过期」。
    const scan = repoScan();
    expect(SIGNAL_COLORS.size, 'globals.css 一个不透明颜色 token 都没解析到 —— 规则空转').toBeGreaterThan(20);

    const registered = new Map<string, 'matrix' | 'literal' | 'copy'>();
    for (const m of MIRRORS) registered.set(m.path, 'matrix');
    for (const m of LITERAL_MIRRORS) registered.set(m.path, 'literal');
    for (const c of MIRROR_COPIES) registered.set(c.copy, 'copy');

    const unmanaged: string[] = [];
    const signalOf = new Map<string, string[]>();
    let signalFiles = 0;
    for (const f of scan.files) {
      const found: string[] = [];
      f.text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(COLOR_LITERAL)) {
          const c = canonicalColor(m[0].replace(/['"`]/g, '').replace(/^(?=[0-9a-fA-F]{6}$)/, '#'));
          if (c !== null && SIGNAL_COLORS.has(c)) found.push(`${i + 1}:${m[0]}=${COLOR_ACCEPT.exact.get(c)?.[0] ?? '?'}`);
        }
      });
      if (found.length === 0) continue;
      signalFiles++;
      signalOf.set(f.path, found);
      if (registered.has(f.path)) continue;
      if (UNMANAGED_EXEMPT.some(([p]) => f.path === p || f.path.startsWith(p))) continue;
      unmanaged.push(`${f.path}  持有 ${found.length} 处品牌真值,例:${found.slice(0, 4).join('  ')}`);
    }
    expect(
      unmanaged,
      '这些文件持有 globals.css 的**当前**品牌值,却不在任何矩阵里 —— 也就是说\n' +
        '真源下次改值时,没有任何东西会告诉你它们也得改(而它们现在恰好是对的,\n' +
        '这正是最危险的状态:看起来一切正常,直到某天两处颜色对不上)。三选一:\n' +
        '  ① 它是一份能给出「变量名 → 值」的 token 表 → 进 MIRRORS 做变量级绑定;\n' +
        '  ② 它结构上给不出变量位(JSON / wxml 属性 / SVG fill / Go 常量)→ 进 LITERAL_MIRRORS;\n' +
        '  ③ 它压根不该被管(第三方 vendored / 护栏自身)→ 进 UNMANAGED_EXEMPT 并写清理由。\n' +
        unmanaged.join('\n')
    ).toEqual([]);

    // 死登记:登记了却已经不持有任何可追溯颜色的文件(收口完成 / 文件被删)。
    const dead: string[] = [];
    for (const m of LITERAL_MIRRORS) {
      const f = scan.files.find((x) => x.path === m.path);
      if (!f) {
        if (IN_FULL_REPO) dead.push(`${m.path}  登记为字面值镜像,却在全仓里找不到(改名/删除必须同步本表)`);
        continue;
      }
      const any = [...f.text.matchAll(COLOR_LITERAL)].some((m2) => explainColor(m2[0].replace(/['"`]/g, '').replace(/^(?=[0-9a-fA-F]{6}$)/, '#')) !== null);
      if (!any) dead.push(`${m.path}  已经不含任何能追溯到 globals 的颜色了 —— 收口完成的话请删掉条目`);
    }
    expect(dead, `字面值镜像登记表有死条目:\n${dead.join('\n')}`).toEqual([]);

    if (process.env.RATCHET_REPORT) console.log(`RATCHET\t反向扫描\t持有品牌真值的文件 ${signalFiles}(基线 ${MIN_SIGNAL_FILES})`);
    // 死豁免:UNMANAGED_EXEMPT 里零命中的条目(本文件的老病,已应验三次)。
    if (IN_FULL_REPO) {
      const deadExempt = UNMANAGED_EXEMPT.filter(
        ([p]) => ![...signalOf.keys()].some((k) => k === p || k.startsWith(p))
      ).map(([p, why]) => `${p}  —— 豁免理由「${why.slice(0, 24)}…」,但它下面已经没有任何持有品牌值的文件了`);
      expect(deadExempt, `零命中的豁免不是保险,是留给下一个人的后门:\n${deadExempt.join('\n')}`).toEqual([]);
      expect(
        signalFiles,
        `全仓只找到 ${signalFiles} 个持有品牌真值的文件(基线 ${MIN_SIGNAL_FILES})—— 先确认是真收口了,还是扫描/解析坏了`
      ).toBeGreaterThanOrEqual(MIN_SIGNAL_FILES);
      expect(scan.files.length, `含颜色的文件只有 ${scan.files.length} 个(基线 ${MIN_COLOR_FILES})`).toBeGreaterThanOrEqual(
        MIN_COLOR_FILES
      );
    }
  });

  it('字面值镜像里的每一个颜色都必须能追溯到 globals 的当前值(或具名豁免)', () => {
    // ⚠️ 这条与 MIRRORS 的「逐值绑定」是**两种强度**,不要混:
    //    那边问「--brand-red 绑的那个变量对不对」,这边问「这个文件里的颜色属不属于体系」。
    //    弱一档换来的是覆盖面 —— 见本节文件头的口径差 ①。
    const scan = repoScan();
    const { forms, sixOnly, triples } = retiredForms();
    const retiredRe = new RegExp(
      String.raw`^(?:#(?:${forms.join('|')})|(?:${sixOnly.join('|')})|rgba?\(\s*(?:${triples.join('|')})\b.*)$`,
      'i'
    );
    const bad: string[] = [];
    const deadAllow: string[] = [];
    let checked = 0;
    for (const m of LITERAL_MIRRORS) {
      const f = scan.files.find((x) => x.path === m.path);
      if (!f) continue; // 缺文件由上一条负责报警
      const allow = m.allow ?? {};
      const live = new Set<string>();
      f.text.split('\n').forEach((line, i) => {
        for (const hit of line.matchAll(COLOR_LITERAL)) {
          const bare = hit[0].replace(/['"`]/g, '');
          const literal = /^[0-9a-fA-F]{6}$/.test(bare) ? `#${bare}` : bare;
          const key = literal.replace(/\s+/g, '').toLowerCase();
          if (allow[key] !== undefined) {
            live.add(key);
            continue;
          }
          // 退休色归规则 ①(与 RETIRED_DEBT)管 —— 同一处违规不在两张名单里各写一遍。
          if (retiredRe.test(literal.replace(/\s+/g, ''))) continue;
          if (explainColor(literal) !== null) {
            checked++;
            continue;
          }
          bad.push(`${m.path}:${i + 1}  «${hit[0]}»  —— 追溯不到 globals 的任何当前值`);
        }
      });
      for (const k of Object.keys(allow)) if (!live.has(k)) deadAllow.push(`${m.path}  allow['${k}'] 在文件里已经找不到了`);
    }
    if (process.env.RATCHET_REPORT) console.log(`RATCHET\t字面值镜像\t追溯成功的颜色 ${checked}(基线 ${MIN_LITERAL_CHECKS})`);
    expect(
      deadAllow,
      '死豁免:allow 里写着理由,文件里却没有对应的颜色。收口了就把条目删掉:\n' + deadAllow.join('\n')
    ).toEqual([]);
    expect(
      bad,
      '字面值镜像里出现了追溯不到设计体系的颜色。三种正确处置:\n' +
        '  ① 它本该是某个 token 的值 → 改成 globals 的当前值(这条规则的主要用途:真源改了,这里没跟上);\n' +
        '  ② 它是「token 叠 alpha / 叠底」的派生值,但算错了 → 按 globals 重算;\n' +
        '  ③ 它确实与设计体系无关(第三方色板 / 游戏美术 / 系统色)→ 进该文件的 allow 并写清理由。\n' +
        bad.join('\n')
    ).toEqual([]);
    if (IN_FULL_REPO)
      expect(
        checked,
        `字面值镜像里只追溯成功 ${checked} 个颜色(基线 ${MIN_LITERAL_CHECKS})—— 解析器坏了或登记表被掏空时,上面两个数组都会是空的,那是最坏的绿`
      ).toBeGreaterThanOrEqual(MIN_LITERAL_CHECKS);
  });

  it('scholay-minitools 的 _shared 副本必须与源逐字节一致', () => {
    // 为什么是逐字节: 副本的正确性判据本来就是「与源相同」——
    // build.sh 是 `cp` 而不是「同步几个颜色」。逐值比对反而会放过
    // 「源改了注释/结构、副本没重跑 build.sh」这类漂移,而那正是最常见的形态
    //(有人手改了 _shared/brand.css 就交差,7 份副本还停在旧内容)。
    const drift: string[] = [];
    for (const { copy, source } of MIRROR_COPIES) {
      const cp = join(REPO, copy);
      const sp = join(REPO, source);
      if (!existsSync(sp) || !existsSync(cp)) {
        if (IN_FULL_REPO) drift.push(`${copy}  或它的源 ${source} 不存在 —— 删/改名工具目录时必须同步本表`);
        continue;
      }
      const a = readFileSync(sp);
      const b = readFileSync(cp);
      if (!a.equals(b)) drift.push(`${copy}  与 ${source} 不一致(${a.length} vs ${b.length} 字节)`);
    }
    expect(
      drift,
      '小工具的 shared/ 副本与 _shared/ 对不上。它们由 `scholay-minitools/build.sh` 生成:\n' +
        '  cd scholay-minitools && bash build.sh   # 会重新 cp 并重打 zip\n' +
        '⚠️ 不要手改副本 —— 改了下次 build.sh 就冲掉;真源是 _shared/。\n' +
        drift.join('\n')
    ).toEqual([]);
    if (IN_FULL_REPO)
      expect(MIRROR_COPIES.length, '副本清单被清空了 —— 删登记必须在 PR 里说明').toBeGreaterThanOrEqual(14);
  });
});

/* ───────────────────────────────────────────── 动效 token 的跨语言对齐 ── */

/**
 * `shared/lib/motion.ts` ↔ globals.css `--duration-*` / `--ease-*`。
 *
 * 🔴 为什么需要机制:framer-motion 的 `transition` 只吃**数字/数组**,读不到 CSS 变量。
 *    所以 token 值必须在 motion.ts 里手抄一份 —— 而「手抄的两份」在本轮之前
 *    **完全靠注释对齐,没有任何机械保障**。globals.css §15 自述「CSS 侧与 TS 侧
 *    共用同一组数值」,CLAUDE.md 则一度记着 `0.42 / 0.18 / 0.22`(与实测的
 *    `0.42 / 0.16 / 0.28` 对不上)—— 三份文字互相矛盾了一段时间都没人发现,
 *    正因为没有任何东西在比对它们。
 */
describe('动效 token 跨语言对齐(globals.css ↔ shared/lib/motion.ts)', () => {
  const MOTION_PATH = join(SRC, 'shared', 'lib', 'motion.ts');
  const MOTION_RAW = readFileSync(MOTION_PATH, 'utf8');
  const MOTION_CODE = stripComments(MOTION_RAW);
  const DUR = ['fast', 'base', 'slow', 'deliberate'];
  const EASE = ['out', 'in-out', 'emphasized'];
  /** `160ms` → 0.16。framer 的单位是秒,CSS 侧是毫秒,唯一的换算点在这里。 */
  const seconds = (name: string) => {
    const v = tokenValue(`--duration-${name}`);
    const ms = Number(v.replace(/ms$/, ''));
    if (!/ms$/.test(v) || !Number.isFinite(ms)) throw new Error(`--duration-${name} 不是 ms 形态: ${v}`);
    return ms / 1000;
  };
  /** `cubic-bezier(0, 0, 0.2, 1)` → [0, 0, 0.2, 1]。 */
  const bezier = (name: string) => {
    const v = tokenValue(`--ease-${name}`);
    const nums = (v.match(/-?[0-9.]+/g) ?? []).map(Number);
    if (!v.startsWith('cubic-bezier(') || nums.length !== 4) throw new Error(`--ease-${name} 不是四点 bezier: ${v}`);
    return nums;
  };
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  it('motion.ts 里的每个 duration 都必须落在 --duration-* 四档上', () => {
    // 口径与「framer-motion duration 字面量」那条棘轮一致,但方向相反:
    // 那条防的是**组件里**手搓时长,这条防的是**唯一对齐点自己**漂掉 ——
    // motion.ts 一漂,所有用预设的组件跟着一起漂,而且没有任何一条规则会红。
    const allowed = DUR.map(seconds);
    const used = [...MOTION_CODE.matchAll(/\bduration:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
    expect(used.length, 'motion.ts 里一个 `duration:` 都没匹配到 —— 规则空转了,先修正则').toBeGreaterThanOrEqual(3);
    const bad = used.filter((v) => !allowed.some((a) => eq(a, v)));
    expect(
      bad,
      `motion.ts 出现了不在 --duration-* 四档(${allowed.join(' / ')} 秒)里的时长:${bad.join(', ')}。\n` +
        '改 token 必须两边一起改;要新增第五档请先在 globals.css §15 加,再抄过来。'
    ).toEqual([]);
  });

  it('motion.ts 里的每个 ease 数组都必须等于某个 --ease-*', () => {
    const allowed = EASE.map(bezier);
    const used = [...MOTION_CODE.matchAll(/\bease:\s*\[([^\]]+)\]/g)].map((m) =>
      m[1].split(',').map((s) => Number(s.trim()))
    );
    expect(used.length, 'motion.ts 里一个 `ease: [...]` 都没匹配到 —— 规则空转了,先修正则').toBeGreaterThanOrEqual(2);
    const bad = used
      .filter((a) => !allowed.some((e) => a.length === 4 && e.every((v, i) => eq(v, a[i]))))
      .map((a) => `[${a.join(', ')}]`);
    expect(
      bad,
      `motion.ts 出现了不在 --ease-* 三档里的 bezier:${bad.join(' ')}。\n` +
        `可用的是 ${EASE.map((n, i) => `--ease-${n} [${allowed[i].join(', ')}]`).join(' / ')}`
    ).toEqual([]);
  });

  it('每个预设必须绑住它自己声明的那一档(不只是「落在四档里」)', () => {
    // 🔴 2026-07-28 第三轮补上 —— 它与「跨包镜像」上一版是**同一种病**:
    //    上面两条问的是**集合归属**(「0.42 是四档之一吗」),不问**绑定**
    //    (「FADE 该是哪一档」)。而 motion.ts 的每个预设都在自己的 JSDoc 里
    //    白纸黑字声明了绑哪一档:「0.16 = --duration-fast,ease = --ease-out」。
    //    把 FADE 的 0.16 换成 0.42,两条集合规则照样绿(0.42 也是合法档),
    //    可蒙层淡入会从 160ms 变成 420ms,而**没有任何东西**会红 —— 实测确认。
    //    镜像那边的教训是「别只问值出现过没有,要问值绑在哪个名字上」,这里同理。
    //
    // ⚠️ 解析靠 JSDoc 的固定写法(`0.16 = --duration-fast` / `ease = --ease-out`)。
    //    改注释格式会让绑定数掉下去 → 下面的「空转」断言会红,那是**要的**:
    //    格式一改,声明就不再是机器可核对的,必须同步这里的正则。
    const bad: string[] = [];
    let bound = 0;
    for (const b of MOTION_RAW.matchAll(/\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*export const (\w+)[^=]*=\s*([^;]+);/g)) {
      const [, doc, name, code] = b;
      const durDecl = /([0-9.]+)\s*=\s*--duration-([a-z]+)/.exec(doc);
      const durCode = /\bduration:\s*([0-9.]+)/.exec(code);
      if (durDecl && durCode) {
        bound++;
        const want = seconds(durDecl[2]);
        if (!eq(Number(durCode[1]), want) || !eq(Number(durDecl[1]), want))
          bad.push(
            `${name}: 注释声明「${durDecl[1]} = --duration-${durDecl[2]}」,globals.css 里这一档是 ${want}s,` +
              `而代码里实际写的是 ${durCode[1]}`
          );
      }
      const easeDecl = /ease\s*=\s*--ease-([a-z-]+)/.exec(doc);
      const easeCode = /\bease:\s*\[([^\]]+)\]/.exec(code);
      if (easeDecl && easeCode) {
        bound++;
        const want = bezier(easeDecl[1]);
        const got = easeCode[1].split(',').map((s) => Number(s.trim()));
        if (got.length !== 4 || !want.every((v, i) => eq(v, got[i])))
          bad.push(`${name}: 注释声明 ease = --ease-${easeDecl[1]}([${want.join(', ')}]),代码里是 [${got.join(', ')}]`);
      }
    }
    expect(
      bound,
      'motion.ts 里一条「值 = --token」的绑定声明都没解析到 —— 规则空转了(注释格式改了就同步这里的正则)'
    ).toBeGreaterThanOrEqual(3);
    expect(bad, `motion.ts 的预设与它自己声明的档位对不上:\n${bad.join('\n')}`).toEqual([]);
  });

  it('motion.ts 头部的对照表本身必须与 globals.css 一致', () => {
    // 为什么连注释也要断言: 上面两条只覆盖**被用到的**档位 —— `--duration-deliberate`
    // 与 `--ease-in-out` 在 motion.ts 里目前没有消费者,它们漂了不会有任何红灯。
    // 而那张表正是下一个人「手抄第五个预设」时唯一会看的东西,它一旦失真就会把
    // 错误值批量复制出去。把注释纳入断言 = 让「靠注释对齐」这件事第一次真的成立。
    const dur = [...MOTION_RAW.matchAll(/--duration-([a-z]+)\s+(\d+)ms\s*→\s*([0-9.]+)/g)];
    expect(
      dur.map((m) => m[1]).sort(),
      'motion.ts 头部的 duration 对照表少了行(或格式被改动,匹配不到了)。格式必须是 `--duration-fast        160ms  → 0.16`'
    ).toEqual([...DUR].sort());
    const durBad = dur
      .filter((m) => Number(m[2]) !== seconds(m[1]) * 1000 || !eq(Number(m[3]), seconds(m[1])))
      .map((m) => `--duration-${m[1]}: 表里写 ${m[2]}ms → ${m[3]},globals.css 是 ${seconds(m[1]) * 1000}ms`);
    expect(durBad, `motion.ts 的注释表与 globals.css 对不上:\n${durBad.join('\n')}`).toEqual([]);

    const ez = [...MOTION_RAW.matchAll(/--ease-([a-z-]+)\s+(cubic-bezier\([^)]*\))/g)];
    expect(ez.map((m) => m[1]).sort(), 'motion.ts 头部的 ease 对照表少了行(或格式被改动)').toEqual([...EASE].sort());
    const norm = (s: string) => s.replace(/\s+/g, '');
    const ezBad = ez
      .filter((m) => norm(m[2]) !== norm(tokenValue(`--ease-${m[1]}`)))
      .map((m) => `--ease-${m[1]}: 表里写 ${m[2]},globals.css 是 ${tokenValue(`--ease-${m[1]}`)}`);
    expect(ezBad, `motion.ts 的注释表与 globals.css 对不上:\n${ezBad.join('\n')}`).toEqual([]);
  });
});
