// 设计护栏运行器 —— 薄薄一层包在 vitest 外面,只做一件 vitest 自己不会做的事:
// 把「本次运行有规则被【跳过】」从摘要行里一个不起眼的小数字,变成日志里躲不开的横幅。
//
// 【为什么需要它】
// `tests/design-system-guard.test.ts` 的「跨包镜像」一族规则要读 frontend-user/ 之外的三个
// 兄弟包(miniprogram / scholay-minitools / agent)。而 frontend-user 的 Docker 构建
// `context: ./frontend-user`(见 docker-compose.yml)—— 那个环境里三个包**物理上不存在**,
// 于是这几条规则走 `ctx.skip()`,vitest 打印
//     Tests  36 passed | 4 skipped (40)
// 和一行 console.warn 就过去了。构建日志里几百行输出中,这行小字没人会看见。
//
// 这正是本仓库付过代价的那个模式:**「一条永远绿的规则」和「一条不存在的规则」等价**,
// 而「51 条护栏全绿」曾掩盖三份镜像同时落后两代。所以:跳过必须吵。
//
// 【刻意不做的事】
// 在 Docker 构建里跳过**不会**让构建失败 —— 跨包镜像在那个 context 里客观上无法校验,
// 为此红灯会直接堵死部署。要的是**可见**,不是阻断。
// 真正的强制在另一个执行点:仓库根的 `scripts/check-design-system.sh`(git pre-push 调用),
// 那里三个兄弟包在场,且 DESIGN_GUARD_STRICT=1 会把「有规则被跳过」直接判失败。
//
// 【用法】
//   node scripts/design-guard.mjs <vitest 文件…>        // 跳过 = 横幅 + 放行
//   DESIGN_GUARD_STRICT=1 node scripts/design-guard.mjs …  // 跳过 = 失败(exit 1)
// 退出码透传 vitest;strict 模式下若 vitest 通过但有跳过,改判 1。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STRICT = !!process.env.DESIGN_GUARD_STRICT;
const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('[design-guard] 用法:node scripts/design-guard.mjs <vitest 文件…>');
  process.exit(2);
}

// JSON 报告写到临时目录 —— 不落进仓库,不需要 .gitignore 配合。
const workdir = mkdtempSync(join(tmpdir(), 'design-guard-'));
const reportPath = join(workdir, 'report.json');

// 双 reporter:default 保留人读的正常输出,json 供本脚本判「跳过」。
// 用 numPendingTests / assertionResults[].status 判定,而不是去 grep 摘要行的文案
// —— 文案会随 vitest 版本变,字段不会(实测 vitest 2.1.9:skipped 计入 numPendingTests,
//    assertionResults[].status === 'skipped')。
// 优先直接跑本包装的 vitest(node node_modules/vitest/vitest.mjs),不经 npx:
// Docker 构建里 npx 会去做包解析、离线时还可能尝试联网,而这里要的只是「跑本地那个」。
const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const localVitest = join(PKG, 'node_modules', 'vitest', 'vitest.mjs');
const vitestArgs = [
  'run',
  ...targets,
  '--reporter=default',
  '--reporter=json',
  `--outputFile.json=${reportPath}`,
];
const [cmd, args] = existsSync(localVitest)
  ? [process.execPath, [localVitest, ...vitestArgs]]
  : ['npx', ['vitest', ...vitestArgs]];

const run = spawnSync(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const vitestCode = run.status ?? 1;

const skipped = [];
let reportOk = true;
try {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  for (const file of report.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (a.status !== 'passed' && a.status !== 'failed') {
        skipped.push(`${a.fullName || a.title}${a.status === 'skipped' ? '' : ` (${a.status})`}`);
      }
    }
  }
} catch {
  reportOk = false;
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

const line = '═'.repeat(78);
const banner = (lines) => {
  console.log('');
  console.log(line);
  for (const l of lines) console.log(l);
  console.log(line);
  console.log('');
};

if (!reportOk) {
  // 读不到报告 = **不知道有没有规则被跳过**。这本身就是要说出来的事。
  banner([
    ' ⚠️  设计护栏:拿不到 vitest 的 JSON 报告,本次运行【无法判断是否有规则被跳过】。',
    '     绿灯请按「不确定」对待。',
  ]);
  if (STRICT) process.exit(1);
  process.exit(vitestCode);
}

if (skipped.length > 0) {
  banner([
    ` ⚠️  设计护栏:本次运行有 ${skipped.length} 条规则被【跳过】—— 绿灯 ≠ 全部校验通过`,
    '',
    '   被跳过的规则:',
    ...skipped.map((s) => `     ↓ ${s}`),
    '',
    '   最常见的原因:frontend-user 的 Docker 构建 context 只有 ./frontend-user,',
    '   miniprogram / scholay-minitools / agent 三个兄弟包物理上不在 → 跨包镜像规则无从执行。',
    '',
    '   ⇒ 本次构建【没有】校验小程序 / 小工具 / pptx 导出三份镜像是否与 globals.css 同步。',
    '   ⇒ 要真正校验,在完整仓库里跑:  scripts/check-design-system.sh',
    '      (它是 git pre-push 钩子的执行点;先 `git config core.hooksPath .githooks` 装一次)',
  ]);
  if (STRICT) {
    console.error(
      '[design-guard] DESIGN_GUARD_STRICT=1:在完整仓库里仍有规则被跳过,判失败。\n' +
        '  三个兄弟包应当都在场 —— 检查是否有人移动/删除了镜像文件,或护栏的在场判定逻辑被改坏。'
    );
    process.exit(1);
  }
}

process.exit(vitestCode);
