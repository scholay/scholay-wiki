# .githooks —— 跟着仓库走的 git 钩子

## 🔴 装一次才生效

```bash
./scripts/install-git-hooks.sh      # = git config core.hooksPath .githooks
```

git 默认只认 `.git/hooks/`,而 `.git/` **不进版本库** —— 钩子放那儿只有写它的人有,
等于没有。本目录进版本库,但必须显式把 `core.hooksPath` 指过来。

⚠️ 本仓库 `.git/config` 里 `core.hooksPath` 此前已被显式设成绝对路径的 `.git/hooks`
(里面只有 `.sample`,一个生效的钩子都没有)。所以「不配置也是默认值、跑一次 install
只是走个形式」的假设**不成立**:不执行上面那条命令,本目录里的钩子一次都不会被调用。

校验(不会真推):

```bash
git push --dry-run
```

## 现有钩子

| 钩子 | 做什么 | 失败会怎样 |
|---|---|---|
| `pre-push` | 依次跑 **GATES 清单**里的每个闸(见下表),不短路,跑完汇总 | 任一闸判失败 → 阻止 push |

### `pre-push` 的闸清单(真源 = `pre-push` 里的 `GATES` 数组)

| 闸 | 脚本 | 覆盖 | 需要 |
|---|---|---|---|
| 设计系统护栏 | [`scripts/check-design-system.sh`](../scripts/check-design-system.sh) | 设计 token 全仓口径,**含两份设计镜像**(小程序 / pptx 导出 vs `globals.css`) | `node` + `frontend-user/node_modules` |
| 证据账本跨包镜像 | [`scripts/check-evidence-mirror.sh`](../scripts/check-evidence-mirror.sh) | **独立解析器镜像**:`agent/src/evidence/parse.ts` ←→ `frontend-user/src/shared/lib/minicod-papers.ts`(只跑 `parse.mirror.test.ts` 一个文件,实测 43ms) | `bun` |

两个闸**刻意分开**:环境前置不同(node/npm vs bun)。合成一个的话,「只改后端、没装
前端依赖」时前一个 `exit 2` 提前返回,会把后一个一起连坐掉且没人知道 ——
那正是要消灭的「静默不检查」。

为什么是 pre-push 而不是 pre-commit、以及三档退出码的语义,写在 `pre-push` 的文件头里。

## 绕过

```bash
SKIP_DESIGN_GUARD=1 git push     # 放行(所有闸一起),但留痕到 .git/design-guard-bypass.log
git push --no-verify             # git 层面根本不调用钩子 —— 无痕,别用
```

## 加新闸 / 加新钩子

**加闸**(最常见):往 `pre-push` 的 `GATES` 数组加一行 `"显示名|$ROOT/scripts/xxx.sh"`,
并在上表登记。三档退出码的处理只写了一份,新闸自动继承。

**加钩子**:放一个同名可执行文件进本目录(`chmod +x`),并在上表登记。

无论哪种,保持三档语义:**0 = 检查通过 / 1 = 检查失败 / 2 = 没能检查**;
「没能检查」不要当成通过、也不要阻断 —— 要吵、要留痕、要放行。

⚠️ 还有一条闸脚本自己的责任:**测试框架默认把 skip 算成绿**(vitest 和 bun 都是,
实测 bun 1.3.14 整个 describe 被 skipIf 跳过时输出 `1 pass / 2 skip / 0 fail`、退出码 0)。
新闸必须自己读结构化报告判「有没有规则被跳过」并逐条打出名字 ——
按本仓库自己的话:**一条永远绿的规则和一条不存在的规则等价**。
