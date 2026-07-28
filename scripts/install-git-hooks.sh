#!/usr/bin/env bash
# ============================================================================
# 启用仓库自带的 git 钩子(幂等,重复跑无副作用)。
#
# 每个开发者、每台机器、每份 clone 各执行**一次**:
#   ./scripts/install-git-hooks.sh
#
# 它只做一件事:git config core.hooksPath .githooks
# 为什么需要这一步:git 默认只认 .git/hooks/,而 .git/ 不进版本库 —— 钩子放那儿
# 就只有写它的人有。.githooks/ 跟着仓库走,但必须显式指过去才生效。
#
# 当前装的钩子:
#   pre-push —— 跑 scripts/check-design-system.sh(设计系统护栏,含跨包镜像)
#
# 卸载:git config --unset core.hooksPath
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d .githooks ]; then
  echo "✗ 找不到 $ROOT/.githooks —— 这不像是 scholar 仓库根。"
  exit 1
fi

# 钩子文件必须可执行,否则 git 会静默不调用(最难查的一类「装了但没生效」)。
chmod +x .githooks/* 2>/dev/null || true

git config core.hooksPath .githooks

echo "✓ 已启用仓库钩子: core.hooksPath = $(git config core.hooksPath)"
echo ""
echo "已装的钩子:"
for h in .githooks/*; do
  [ -f "$h" ] || continue
  [ -x "$h" ] && mark="✓" || mark="✗ 不可执行"
  echo "  $mark $(basename "$h")"
done
echo ""
echo "校验(不会真的推):  git push --dry-run"
echo "绕过一次(会留痕到 .git/design-guard-bypass.log):  SKIP_DESIGN_GUARD=1 git push"
