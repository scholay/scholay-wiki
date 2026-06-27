#!/usr/bin/env bash
# ============================================================================
# 后端编码约定回归闸(ratchet)—— 防止新增违反 CONVENTIONS.md 的代码。
#
# 不强制把存量违规一次性清零(风险大、收益低),只锁住「不再增长」:
# 当前计数 > 基线 → 失败(说明这次改动新增了违规),= 或 < → 通过(并提示可下调基线)。
#
# 用法:
#   scripts/check-backend-conventions.sh         # 检查,超基线则 exit 1
#   清理掉一些存量后,把下面的 BASELINE_* 调低,使闸越收越紧。
#
# 覆盖两条约定(见 backend/CONVENTIONS.md):
#   §1 JSON 字段默认 snake_case —— camelCase tag 计数(已知历史例外:peerreview/feedback/ai)
#   §2 错误码集中 errcode —— handler 里禁止裸 4 位业务码(HTTP 状态码是 3 位,不计)
# ============================================================================
set -euo pipefail

# 基线:2026-06-26 现状。清理存量后请同步调低(只许降不许升)。
BASELINE_BARE_CODES=218
BASELINE_CAMEL_TAGS=210

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERNAL="$ROOT/backend/internal"

bare_codes=$(grep -rEn 'utils\.(Error|ErrorWithData|InternalError|BadRequestWithCode)\(c, [0-9]{4}' "$INTERNAL" \
  | grep -v '_test.go' | wc -l | tr -d ' ')
camel_tags=$(grep -rEn 'json:"[a-z]+[A-Z][a-zA-Z]*"' "$INTERNAL" \
  | grep -v '_test.go' | wc -l | tr -d ' ')

fail=0
echo "裸 4 位业务码 (应改用 internal/common/errcode 常量): $bare_codes  (基线 $BASELINE_BARE_CODES)"
if [ "$bare_codes" -gt "$BASELINE_BARE_CODES" ]; then
  echo "  ✗ 新增了裸业务码!请改用 errcode 常量(或登记不冲突的码段)。"
  fail=1
elif [ "$bare_codes" -lt "$BASELINE_BARE_CODES" ]; then
  echo "  ✓ 已减少,可把 BASELINE_BARE_CODES 调到 $bare_codes 收紧闸门。"
fi

echo "camelCase JSON tag (新 REST DTO 应 snake_case): $camel_tags  (基线 $BASELINE_CAMEL_TAGS)"
if [ "$camel_tags" -gt "$BASELINE_CAMEL_TAGS" ]; then
  echo "  ✗ 新增了 camelCase JSON tag!新 REST DTO 用 snake_case(见 CONVENTIONS §1)。"
  fail=1
elif [ "$camel_tags" -lt "$BASELINE_CAMEL_TAGS" ]; then
  echo "  ✓ 已减少,可把 BASELINE_CAMEL_TAGS 调到 $camel_tags 收紧闸门。"
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "约定回归闸失败。"
  exit 1
fi
echo "约定回归闸通过。"
