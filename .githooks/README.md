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
| `pre-push` | 跑 [`scripts/check-design-system.sh`](../scripts/check-design-system.sh) —— 设计系统护栏全仓口径,**含跨包镜像**(小程序 / 小工具 / pptx 导出 vs `globals.css`) | 阻止 push |

为什么是 pre-push 而不是 pre-commit、以及三档退出码的语义,写在 `pre-push` 的文件头里。

## 绕过

```bash
SKIP_DESIGN_GUARD=1 git push     # 放行,但留痕到 .git/design-guard-bypass.log
git push --no-verify             # git 层面根本不调用钩子 —— 无痕,别用
```

## 加新钩子

放一个同名可执行文件进本目录(`chmod +x`),并在上表登记。
保持 `pre-push` 的三档语义:**0 = 检查通过 / 1 = 检查失败 / 2 = 没能检查**;
「没能检查」不要当成通过、也不要阻断 —— 要吵、要留痕、要放行。
