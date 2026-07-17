#!/usr/bin/env bash
# =============================================================================
# Scholay 小工具 · 打包脚本
# 把 _shared 同步进每个工具的 ./shared/,按小红书小工具规范打包成可上传 zip:
#   - index.html 位于 zip 根目录
#   - cd 进目录再压缩「目录内容」(不多套一层)
#   - 仅含 .html/.css/.js(+ svg 内联,无外链)
# 并做打包前合规自检(禁 fetch / 内联脚本 / onclick / eval / 外链 / iframe ...)
# 用法: bash build.sh          打包全部
#       bash build.sh check    仅跑合规自检
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

TOOLS=(checkrate status predatory stats diff formula sandbox)
DIST="dist"

# 禁用模式(命中即判不合规)。允许 getUserMedia / input file / touch / localStorage 等。
BANNED='fetch\(|XMLHttpRequest|new WebSocket|new EventSource|new RTCPeerConnection|navigator\.geolocation|navigator\.clipboard|document\.execCommand|new Worker\(|new SharedWorker|navigator\.serviceWorker|\beval\(|new Function\(|WebAssembly\.|window\.open\(|window\.prompt\(|<iframe|<object|target="_blank"|href="https?://|src="https?://|url\(https?://| onclick=| onload=| onerror=|javascript:'

check_one() {
  local dir="$1" bad=0
  # 入口必须存在
  [[ -f "$dir/index.html" ]] || { echo "    ✗ 缺少 index.html"; return 1; }
  # 扫描全部 html/js/css
  local hits
  hits=$(grep -REn "$BANNED" "$dir" --include='*.html' --include='*.js' --include='*.css' 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    echo "    ✗ 命中禁用模式:"
    echo "$hits" | sed 's/^/        /'
    bad=1
  fi
  # 必须用 addEventListener 绑事件(存在即视为合规信号)
  grep -Rq "addEventListener" "$dir" --include='*.js' || echo "    ⚠ 未发现 addEventListener(确认事件绑定方式)"
  return $bad
}

do_check() {
  echo "== 合规自检 =="
  local fail=0
  for t in "${TOOLS[@]}"; do
    echo "  [$t]"
    check_one "$t" && echo "    ✓ 通过" || fail=1
  done
  return $fail
}

do_build() {
  command -v zip >/dev/null || { echo "需要 zip 命令"; exit 1; }
  mkdir -p "$DIST"
  for t in "${TOOLS[@]}"; do
    echo "  [$t] 同步 shared → 打包"
    rm -rf "$t/shared"
    mkdir -p "$t/shared"
    cp _shared/brand.css _shared/convert.js _shared/playfair-display-700.woff2 _shared/reward-qr.png "$t/shared/"   # 站点 QR 已内联进 convert.js;reward-qr 是通关奖励联系二维码(可替换)
    rm -f "$DIST/$t.zip"
    ( cd "$t" && zip -rq "../$DIST/$t.zip" . -x '*.DS_Store' -x '__MACOSX*' )
    local sz; sz=$(du -h "$DIST/$t.zip" | cut -f1)
    echo "    ✓ $DIST/$t.zip ($sz)"
  done
}

if [[ "${1:-}" == "check" ]]; then
  do_check
else
  do_check || { echo; echo "‼ 合规自检未通过,已中止打包。修复后重试。"; exit 1; }
  echo
  do_build
  echo
  echo "完成。上传 dist/*.zip 到小红书小工具后台即可。"
fi
