#!/usr/bin/env bash
# ============================================================================
# 设计系统护栏 —— 全仓执行点(唯一一处「跨包镜像规则真的会跑」的地方)。
#
# 护栏本体是 frontend-user/tests/design-system-guard.test.ts +
# design-tokens-compiled.test.ts,真源是 frontend-user/src/styles/globals.css。
# 它有两个执行点,覆盖面**不一样**:
#
#   ① Docker 构建(`prebuild` → `npm run test:design`)
#      构建 context 是 ./frontend-user,miniprogram / scholay-minitools / agent
#      三个兄弟包物理上不在 → 「跨包镜像」一族规则整条 skip。
#      **那里的绿灯不代表三份镜像与 globals.css 同步。** 跳过会打横幅但不阻断构建
#      (堵死部署换不来任何校验)。
#
#   ② 本脚本(git pre-push 钩子调用,也可手跑)
#      从仓库根出发,三个兄弟包在场 → 跨包镜像规则**真的执行**;
#      并且带 DESIGN_GUARD_STRICT=1:此时还有规则被跳过 = 判失败(在完整仓库里跳过
#      只可能是镜像被移走或在场判定被改坏,那正是最该报警的时刻)。
#
# 用法:
#   scripts/check-design-system.sh          # 检查,失败 exit 1
#
# 退出码(pre-push 钩子按这三档区别对待,别随便改语义):
#   0 = 全部规则都执行了,且全部通过
#   1 = 护栏失败(有违规,或在完整仓库里仍有规则被跳过)
#   2 = 环境未就绪(缺 node / 缺 node_modules / 缺兄弟包)—— **没能检查**,不是「通过」
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$ROOT/frontend-user"

# 跨包镜像规则要读的三个兄弟包。少任何一个,那族规则就会退化成 skip。
SIBLINGS=(miniprogram scholay-minitools agent)

echo "设计系统护栏(全仓口径)"
echo "  仓库根: $ROOT"

# ── 环境前置检查:宁可明说「没能检查」,也不要给一个含义不明的绿灯 ──────────────
if ! command -v node >/dev/null 2>&1; then
  echo "  ✗ 找不到 node —— 无法运行护栏。"
  echo "    装 Node 20+(仓库 Docker 构建用 node:22)后重试。"
  exit 2
fi

if [ ! -d "$FRONTEND" ]; then
  echo "  ✗ 找不到 $FRONTEND —— 这不像是 scholar 仓库根。"
  exit 2
fi

if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "  ✗ frontend-user/node_modules 不存在 —— 护栏跑不了(vitest 装在里面)。"
  echo "    先装依赖:  cd \"$FRONTEND\" && npm install"
  echo "    (只改后端、不想装前端依赖 → 本次护栏就是没跑,别当成通过。)"
  exit 2
fi

missing=()
for pkg in "${SIBLINGS[@]}"; do
  [ -d "$ROOT/$pkg" ] || missing+=("$pkg")
done
if [ ${#missing[@]} -ne 0 ]; then
  echo "  ✗ 缺少兄弟包: ${missing[*]}"
  echo "    「跨包镜像」一族规则会因此整条跳过 —— 那正是本脚本存在的理由,不能当没事。"
  echo "    在完整仓库根上跑本脚本;若这些目录真被删了,请同步改护栏的镜像矩阵。"
  exit 2
fi
echo "  ✓ 兄弟包在场: ${SIBLINGS[*]}(跨包镜像规则会真的执行)"
echo ""

# ── 跑护栏 ────────────────────────────────────────────────────────────────────
# DESIGN_GUARD_STRICT=1 见 frontend-user/scripts/design-guard.mjs:
# 完整仓库里若仍有规则被 skip,直接判失败,而不是打个横幅放过去。
(cd "$FRONTEND" && DESIGN_GUARD_STRICT=1 npm run --silent test:design)
rc=$?

echo ""
if [ "$rc" -ne 0 ]; then
  echo "✗ 设计系统护栏失败。"
  echo "  token 真源 = frontend-user/src/styles/globals.css;规则与【为什么】见"
  echo "  frontend-user/tests/design-system-guard.test.ts 的文件头与各条注释。"
  echo "  ⚠️ 放宽一条规则 = 放弃一块阵地。先判断是「现状错」还是「规则错」,别为了绿灯改规则。"
  exit 1
fi
echo "✓ 设计系统护栏通过(含跨包镜像:小程序 / 小工具 / pptx 导出)。"
