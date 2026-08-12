/**
 * 字体契约(2026-08-11 用户两段指令的混合态)。
 *
 *   指令一:全站字体走系统字体,不能拖慢渲染 → Google Sans / Playfair Display
 *          webfont 已移除,--font-sans(UI/正文/控件)是纯系统栈,零下载。
 *   指令二:标题层中文必须用 Noto Serif SC → 它是【唯一保留的 webfont】,
 *          只挂在 --font-serif / --font-display 的 CJK 段,swap 分片按需加载。
 *
 * 因此本文件同时是两种契约:
 *   A. Noto Serif SC 的资产完整性(分片/manifest/哈希/preload/nginx 映射)——
 *      防静默退化:忘记 import、字重范围改窄、CSS 引用未提交的分片。
 *   B. 其余 webfont 的反向契约 —— 防 Google Sans / Playfair / 字体 CDN /
 *      FontFace API / base64 内联等任何形态的回流。
 *
 * 栈本体的两条铁律(见 globals.css 文件头「字体策略」)也在这里钉死:
 *   1. UI 栈(--font-sans)由 system-ui 领头 —— 系统级联接管 CJK(苹方/雅黑)。
 *   2. 衬线栈里 system-ui/-apple-system 绝不能排在 Noto/宋体前面,
 *      否则系统级联把 CJK 吃掉,衬线中文永远轮不上。
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { ROOT_TOKENS, stripCssComments, tokenValue } from './lib/design-tokens';

const ROOT = join(__dirname, '..');
const REPO_ROOT = join(ROOT, '..');
const PUBLIC = join(ROOT, 'public');
const GLOBALS = readFileSync(join(ROOT, 'src', 'styles', 'globals.css'), 'utf8');
const NOTO_CSS = readFileSync(
  join(ROOT, 'src', 'styles', 'fonts', 'noto-serif-sc.css'),
  'utf8',
);
// HTML 注释不是功能面(里面允许出现「不要加 as="font"」这类警示文字),剥掉再断言
const INDEX_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(
  /<!--[\s\S]*?-->/g,
  '',
);
const FRONTEND_NGINX = readFileSync(join(ROOT, 'nginx.conf'), 'utf8');
const EDGE_NGINX_PATH = join(REPO_ROOT, 'nginx', 'conf.d', 'user.conf');
// frontend-user 镜像的 build context 只有本目录,外层 Nginx 不在物理上下文中;
// 完整仓库(pre-push)校验两层,镜像内则以【可见的 skip】收场(见下)。
const EDGE_NGINX = existsSync(EDGE_NGINX_PATH)
  ? readFileSync(EDGE_NGINX_PATH, 'utf8')
  : null;

/** 逗号栈 → 家族名数组(剥引号)。用**精确相等**比对家族,
 *  不用 substring('Noto Serif CJK SC' 会误命中 'Noto Serif SC')。 */
function families(token: string): string[] {
  return tokenValue(token)
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''));
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function fontFaces(css: string, family: string): string[] {
  return [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)]
    .map((match) => match[1])
    .filter((block) =>
      new RegExp(String.raw`font-family:\s*['"]${family}['"]\s*;`).test(block),
    );
}

function woff2Urls(css: string): string[] {
  return [
    ...new Set(
      [...css.matchAll(/url\(\s*['"]?([^'"\s)]+\.woff2)['"]?\s*\)/g)].map(
        (match) => match[1],
      ),
    ),
  ];
}

function publicPath(url: string): string {
  expect(url, `字体 URL 必须是 public 根路径: ${url}`).toMatch(/^\/fonts\//);
  return join(PUBLIC, url.slice(1));
}

function rangeContains(raw: string, point: number): boolean {
  return raw.split(/,\s*/).some((token) => {
    const match = /^U\+([\da-f]+)(?:-([\da-f]+))?$/i.exec(token);
    if (!match) return false;
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    return point >= start && point <= end;
  });
}

function faceRange(face: string): string {
  return /unicode-range:\s*([^;]+);/i.exec(face)?.[1] ?? '';
}

/* ───────────────────────────── A. Noto Serif SC 资产完整性 ── */

describe('唯一保留的 webfont:Noto Serif SC 资产', () => {
  it('globals.css 只导入 Noto 一份字体生成物', () => {
    const css = stripCssComments(GLOBALS);
    expect(css).toMatch(/@import\s+['"]\.\/fonts\/noto-serif-sc\.css['"]\s*;/);
    expect(css).not.toMatch(/@import\s+['"]\.\/fonts\/google-sans/);
    expect(css).not.toMatch(/@import\s+['"]\.\/fonts\/playfair/);
    // globals 自身零 @font-face、零远程 @import
    expect(css).not.toMatch(/@font-face/);
    expect(css).not.toMatch(/@import\s+url\(\s*['"]?https?:/i);
  });

  it('首屏常用字子集 + 101 个完整兜底分片均存在', () => {
    const faces = fontFaces(NOTO_CSS, 'Noto Serif SC');
    expect(faces).toHaveLength(102);
    for (const face of faces)
      expect(face).toMatch(/font-weight:\s*300\s+900\s*;/);

    const urls = woff2Urls(NOTO_CSS);
    expect(urls).toHaveLength(102);
    for (const url of urls)
      expect(existsSync(publicPath(url)), `缺少字体分片: ${url}`).toBe(true);

    const manifest = JSON.parse(
      // manifest 在 scripts/(工具状态文件,2026-08-12 移出 public/ 免进发布产物)。
      readFileSync(join(process.cwd(), 'scripts', 'noto-serif-sc.manifest.json'), 'utf8'),
    );
    expect(manifest.sourceVersion).toBe('v35');
    expect(manifest.fallbackDirectory).toBe(manifest.sourceVersion);

    const fallbackUrls = urls.filter((url) => !url.includes('/noto-serif-sc-ui-'));
    expect(fallbackUrls).toHaveLength(101);
    for (const url of fallbackUrls) {
      expect(url).toMatch(
        new RegExp(`^/fonts/noto-serif-sc/${manifest.sourceVersion}/noto-serif-sc-\\d{3}\\.woff2$`),
      );
    }

    const files = readdirSync(
      join(PUBLIC, 'fonts', 'noto-serif-sc', manifest.fallbackDirectory),
    )
      .filter((name) => name.endsWith('.woff2'))
      .sort();
    expect(files).toEqual(fallbackUrls.map((url) => basename(url)).sort());

    const rootFiles = readdirSync(join(PUBLIC, 'fonts', 'noto-serif-sc'))
      .filter((name) => name.endsWith('.woff2'))
      .sort();
    expect(rootFiles).toContain(manifest.critical.file);
    for (const file of rootFiles) {
      expect(file).toMatch(/^noto-serif-sc-ui-[a-f\d]{12}\.woff2$/);
      const bytes = readFileSync(join(PUBLIC, 'fonts', 'noto-serif-sc', file));
      expect(file).toBe(`noto-serif-sc-ui-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.woff2`);
    }
  });

  it('全局 UI 常用字收敛为一个可控的关键请求,与兜底范围无重叠', () => {
    const manifest = JSON.parse(
      // manifest 在 scripts/(工具状态文件,2026-08-12 移出 public/ 免进发布产物)。
      readFileSync(join(process.cwd(), 'scripts', 'noto-serif-sc.manifest.json'), 'utf8'),
    );
    expect(manifest.schemaVersion).toBe(4);
    expect(manifest.critical.file).toMatch(/^noto-serif-sc-ui-[a-f\d]{12}\.woff2$/);
    expect(manifest.critical.file).toBe(
      `noto-serif-sc-ui-${manifest.critical.sha256.slice(0, 12)}.woff2`,
    );
    // 包含首页固定文案后仍小于 64KiB;这个预算防止未来把动态新闻
    // 或大字库误塞进关键子集。
    expect(manifest.critical.bytes).toBeLessThan(64 * 1024);
    const criticalBytes = readFileSync(
      join(PUBLIC, 'fonts', 'noto-serif-sc', manifest.critical.file),
    );
    expect(createHash('sha256').update(criticalBytes).digest('hex')).toBe(
      manifest.critical.sha256,
    );
    expect(manifest.files).toHaveLength(101);

    const criticalFace = fontFaces(NOTO_CSS, 'Noto Serif SC').find((face) =>
      face.includes(`/${manifest.critical.file}`),
    );
    expect(criticalFace).toBeDefined();
    const criticalRange = faceRange(criticalFace!);
    const fallbackFaces = fontFaces(NOTO_CSS, 'Noto Serif SC').filter(
      (face) => !face.includes(`/${manifest.critical.file}`),
    );

    const points = [...manifest.critical.text].map((char: string) => char.codePointAt(0)!);
    for (const point of points) {
      expect(rangeContains(criticalRange, point), `常用字子集缺 U+${point.toString(16)}`).toBe(true);
      expect(
        fallbackFaces.some((face) => rangeContains(faceRange(face), point)),
        `常用字 U+${point.toString(16)} 仍与兜底分片重叠`,
      ).toBe(false);
    }
  });

  it('1y immutable 字体只使用版本目录或内容哈希 URL', () => {
    const urls = woff2Urls(NOTO_CSS);
    expect(urls).toHaveLength(102);
    for (const url of urls) {
      expect(
        /\/v\d+\/noto-serif-sc-\d{3}\.woff2$/.test(url) ||
          /\/noto-serif-sc-ui-[a-f\d]{12}\.woff2$/.test(url),
        `immutable URL 未版本化: ${url}`,
      ).toBe(true);
    }
  });

  it('index 只 preload Noto 的首屏 UI 子集', () => {
    const manifest = JSON.parse(
      // manifest 在 scripts/(工具状态文件,2026-08-12 移出 public/ 免进发布产物)。
      readFileSync(join(process.cwd(), 'scripts', 'noto-serif-sc.manifest.json'), 'utf8'),
    );
    expect(INDEX_HTML).toContain(`/fonts/noto-serif-sc/${manifest.critical.file}`);
    // preload 有且只有这一个字体
    const preloads = [...INDEX_HTML.matchAll(/rel=["']preload["'][^>]*as=["']font["']/g)];
    const asFont = [...INDEX_HTML.matchAll(/as=["']font["']/g)];
    expect(asFont.length, 'as="font" 的 preload 只允许 Noto UI 子集一个').toBe(1);
    expect(preloads.length).toBeLessThanOrEqual(1);
  });
});

/* ───────────────────────────── B. 其余 webfont 禁回流 ── */

describe('已移除的 webfont 不得回流', () => {
  it('字体文件与字体 CSS 只允许 Noto Serif SC 一族', () => {
    expect(existsSync(join(PUBLIC, 'fonts', 'google-sans'))).toBe(false);
    expect(existsSync(join(PUBLIC, 'fonts', 'playfair-display'))).toBe(false);
    expect(
      readdirSync(join(ROOT, 'src', 'styles', 'fonts')).sort(),
    ).toEqual(['noto-serif-sc.css']);

    // 字体二进制:public 侧只允许出现在 fonts/noto-serif-sc/ 下;src 侧零个
    // (src/assets/x.woff2 经 Vite ?url import 一样能供源,必须一起封)。
    const publicFonts = walkFiles(PUBLIC)
      .filter((p) => /\.(woff2?|ttf|otf|eot)$/i.test(p))
      .map((p) => relative(ROOT, p))
      .filter((p) => !p.startsWith(join('public', 'fonts', 'noto-serif-sc')));
    expect(publicFonts, 'public/ 出现 Noto 之外的字体文件 = webfont 回流').toEqual([]);
    expect(
      walkFiles(join(ROOT, 'src'))
        .filter((p) => /\.(woff2?|ttf|otf|eot)$/i.test(p))
        .map((p) => relative(ROOT, p)),
    ).toEqual([]);

    // public/ 下不允许出现样式表:design-system-guard 的「唯一样式表」规则
    // 只遍历 src/,public/*.css + index.html <link> 是它射程外的 @font-face 通道。
    expect(
      walkFiles(PUBLIC)
        .filter((p) => /\.css$/i.test(p))
        .map((p) => relative(ROOT, p)),
    ).toEqual([]);

    // @font-face 全量清点:只允许 Noto 清单里的 102 个
    expect(fontFaces(NOTO_CSS, 'Google Sans')).toEqual([]);
    expect(fontFaces(NOTO_CSS, 'Playfair Display')).toEqual([]);
  });

  it('同步脚本只剩 Noto 一个', () => {
    expect(existsSync(join(ROOT, 'scripts', 'sync-noto-serif-sc.mjs'))).toBe(true);
    for (const script of ['sync-google-sans.mjs', 'sync-playfair-brand.mjs']) {
      expect(existsSync(join(ROOT, 'scripts', script)), script).toBe(false);
    }
    const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
    expect(pkg).toContain('sync-noto-serif-sc.mjs');
    expect(pkg).not.toContain('sync-google-sans');
    expect(pkg).not.toContain('sync-playfair-brand');
    // KaTeX 瘦身是构建产物处理,与 webfont 无关,必须还在
    expect(pkg).toContain('strip-katex-legacy-fonts.mjs');
  });

  it('index.html 没有已移除家族与字体 CDN 的引用', () => {
    expect(INDEX_HTML).not.toContain('google-sans');
    expect(INDEX_HTML).not.toContain('playfair');
    expect(INDEX_HTML).not.toMatch(/@font-face/i);
    expect(INDEX_HTML).not.toMatch(/data:font\//i);
    // 不只封 googleapis:国内部署惯用的镜像域是同一条回流通道
    for (const cdn of [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'fonts.loli.net',
      'gstatic.loli.net',
      'fonts.bunny.net',
      'fonts.font.im',
      'fonts.geekzu.org',
    ]) {
      expect(INDEX_HTML).not.toContain(cdn);
    }
  });

  it('JS 侧不得用 FontFace API / data: URI 加载字体', () => {
    // FontFace API 可在纯 TS 里凭 data: URI 恢复 webfont,任何 CSS 口径的
    // 规则都看不见它 —— 这里直接封死构造点。
    // (document.fonts.ready 之类的只读消费不受影响。)
    const tsSources = walkFiles(join(ROOT, 'src')).filter((p) => /\.(ts|tsx)$/.test(p));
    for (const p of tsSources) {
      const text = readFileSync(p, 'utf8');
      expect(text, `${relative(ROOT, p)}: 禁止用 FontFace API 加载字体`).not.toMatch(
        /new\s+FontFace\s*\(/,
      );
      expect(text, `${relative(ROOT, p)}: 禁止向 document.fonts 注入字体`).not.toMatch(
        /\.fonts\.add\s*\(/,
      );
      expect(text, `${relative(ROOT, p)}: 禁止内联 data: 字体`).not.toMatch(/data:font\//);
    }
  });
});

/* ───────────────────────────── 字体栈契约 ── */

describe('字体栈契约', () => {
  it('--font-sans 是 system-ui 领头的系统 UI 栈(CJK 走苹方/雅黑,不吃 webfont)', () => {
    const sans = families('--font-sans');
    expect(sans[0]).toBe('system-ui');
    expect(sans.at(-1)).toBe('sans-serif');
    expect(sans).toContain('PingFang SC');
    expect(sans).toContain('Microsoft YaHei');
    // UI/正文/控件不碰 webfont —— 指令一的性能承诺就落在这一条
    expect(sans).not.toContain('Noto Serif SC');
    expect(sans).not.toContain('Google Sans');
    expect(sans).not.toContain('Songti SC');
    expect(sans).not.toContain('SimSun');
  });

  it('衬线/展示栈:具名 Latin 在前,Noto Serif SC 承接 CJK,宋体只作离线兜底', () => {
    for (const token of ['--font-serif', '--font-display']) {
      const stack = families(token);
      expect(stack, token).not.toContain('Google Sans');

      // 指令二:标题中文必须命中 Noto Serif SC —— 它必须是栈里第一个 CJK 家族
      const firstCjk = stack.findIndex((f) =>
        ['Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', 'Source Han Serif SC', 'Noto Serif CJK SC'].includes(f),
      );
      expect(stack[firstCjk], `${token}: 第一个 CJK 家族必须是 Noto Serif SC`).toBe(
        'Noto Serif SC',
      );
      // 离线兜底链仍在
      expect(stack, token).toContain('Songti SC');
      expect(stack, token).toContain('SimSun');

      // 铁律 2:system-ui/-apple-system 的系统级联会截获 CJK,
      // 必须排在最后一个 CJK 家族之后,否则 Noto/宋体永远轮不上。
      const lastCjk = Math.max(
        ...['Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', 'Source Han Serif SC', 'Noto Serif CJK SC']
          .map((f) => stack.indexOf(f)),
      );
      for (const eater of ['system-ui', '-apple-system', 'BlinkMacSystemFont']) {
        const at = stack.indexOf(eater);
        if (at >= 0) {
          expect(at, `${token}: ${eater} 排在 CJK 家族前,系统级联会吃掉中文`).toBeGreaterThan(
            lastCjk,
          );
        }
      }

      // 铁律 2 的另一半:整条栈只允许「无 CJK 字形的具名 Latin 字体 + Noto/宋体系 +
      // 垫底 generic」。任何自带 CJK 的黑体家族插进来都会在某个平台截获中文。
      const LATIN_ONLY = ['Helvetica Neue', 'Segoe UI', 'Arial', 'Georgia', 'Times New Roman'];
      const CJK_SERIF = ['Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', 'Source Han Serif SC', 'Noto Serif CJK SC'];
      const TAIL = ['system-ui', 'serif'];
      for (const f of stack) {
        expect(
          [...LATIN_ONLY, ...CJK_SERIF, ...TAIL],
          `${token}: 栈里出现白名单外的家族 ${f}`,
        ).toContain(f);
      }
    }
  });

  it('--font-brand 是系统高对比衬线;Playfair 只作 local 匹配、无供源', () => {
    const brand = families('--font-brand');
    expect(brand).toContain('Didot');
    expect(brand).toContain('Georgia');
    expect(brand).not.toContain('Google Sans');
    // 'Playfair Display' 允许留在首位:零 @font-face 供源下它只可能命中本机字体,
    // 绝不触发下载(零供源由「不得回流」一节保证)。
    if (brand.includes('Playfair Display')) {
      expect(brand[0]).toBe('Playfair Display');
    }
  });

  it('--font-mono 保持系统等宽栈', () => {
    expect(families('--font-mono')[0]).toBe('ui-monospace');
  });

  it('五个字族 token 都还在(design-tokens-compiled 依赖它们编译出类)', () => {
    for (const t of ['--font-sans', '--font-serif', '--font-display', '--font-brand', '--font-mono']) {
      expect(ROOT_TOKENS.get(t), t).toBeDefined();
    }
  });

  it('BrandName 仍走 font-brand,品牌不借用通用 display 角色', () => {
    const source = readFileSync(
      join(ROOT, 'src', 'shared', 'components', 'BrandName.tsx'),
      'utf8',
    );
    expect(source).toContain('font-brand');
    expect(source).not.toContain("'font-display");
  });
});

/* ───────────────────────────── Nginx 契约 ── */

describe('Nginx 字体路由契约', () => {
  it('woff2 缓存规则 + CORS 保留,旧 Noto 根 URL 兼容映射仍在', () => {
    // Noto 分片与 KaTeX 的 /assets/KaTeX_*.woff2 都命中这条;删掉会落到
    // SPA fallback 变 no-cache。
    // ⚠️ 界符必须是 [^}](块内),不能写 [\s\S]*?:后者会懒惰跨过块边界,
    //    借道后面 .mjs/静态/wasm 任何一处的 immutable 字符串照绿,断言等于空转。
    expect(FRONTEND_NGINX).toMatch(
      /location\s+~\*\s+\\\.\(woff\|woff2\|ttf\|eot\|otf\)\$[^}]*max-age=31536000, immutable/,
    );
    expect(FRONTEND_NGINX).toMatch(
      /location\s+~\*\s+\\\.\(woff\|woff2\|ttf\|eot\|otf\)\$[^}]*Access-Control-Allow-Origin/,
    );
    // 迁移前的根分片 URL 永久兼容到其原始 v35 bytes
    expect(FRONTEND_NGINX).toMatch(
      /\^\/fonts\/noto-serif-sc\/\(noto-serif-sc-\[0-9\]\{3\}\\\.woff2\)\$/,
    );
    expect(FRONTEND_NGINX).toContain('try_files /fonts/noto-serif-sc/v35/$1 =404;');
  });

  it('边缘层静态正则含字体后缀且 1y immutable', (ctx) => {
    // Docker 构建 context 只有 frontend-user,外层 nginx 物理缺席 —— 必须以
    // 「可见的 skip」收场而不是静默通过(仓库约定:一条永远绿的规则和一条
    // 不存在的规则等价);design-guard.mjs 的跳过横幅靠 vitest 的 skipped 计数。
    if (!EDGE_NGINX) return ctx.skip();
    expect(EDGE_NGINX).toMatch(
      /location\s+~\*\s+\\\.\(jpg\|jpeg\|png\|gif\|ico\|svg\|webp\|woff\|woff2[^}]*max-age=31536000, immutable/,
    );
  });
});

describe('边缘 Nginx 静态路由契约', () => {
  it('/uploads 使用 ^~ 并位于扩展名正则之前,图片不得被误送前端', (ctx) => {
    if (!EDGE_NGINX) return ctx.skip();

    const uploadsLocation = 'location ^~ /uploads/ {';
    const staticAssetLocation =
      'location ~* \\.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot|css|js|mjs|wasm)$ {';
    expect(EDGE_NGINX).toContain(uploadsLocation);
    expect(EDGE_NGINX).toContain(staticAssetLocation);
    expect(EDGE_NGINX.indexOf(uploadsLocation)).toBeLessThan(
      EDGE_NGINX.indexOf(staticAssetLocation),
    );
  });
});
