#!/bin/sh
# 在 nginx:alpine 里跑,验证 40-sync-site.sh 的回收逻辑。
# 每个 case 独立起一套 /opt/dist + /usr/share/nginx/html。
set -e
S=/script/40-sync-site.sh
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "    ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "    ❌ $1"; }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1: 期望 $3,实际 $2"; fi; }

reset() { rm -rf /opt/dist /usr/share/nginx/html; mkdir -p /opt/dist/assets /usr/share/nginx/html; }
# 造一代构建产物:$1=代号,产出 shared.js(每代同名同内容)+ gen$1.js(每代独有)
mkgen() {
  rm -rf /opt/dist; mkdir -p /opt/dist/assets
  echo "index v$1" > /opt/dist/index.html
  echo "shared"    > /opt/dist/assets/shared-AAA.js      # 内容不变 → 每代都在册
  echo "g$1"       > /opt/dist/assets/page-$1.js          # 每代独有 hash
}
n_assets() { find /usr/share/nginx/html/assets -type f -not -path '*/.manifests/*' | wc -l | tr -d ' '; }
n_manifest() { ls -1 /usr/share/nginx/html/assets/.manifests 2>/dev/null | wc -l | tr -d ' '; }

echo "── case 1:迁移兜底(有历史文件、无 manifest)不应删任何东西"
reset
mkdir -p /usr/share/nginx/html/assets
for i in 1 2 3 4 5 6 7 8 9 10; do echo old > /usr/share/nginx/html/assets/legacy-$i.js; done
mkgen 1
ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null
# 10 个历史 + 本代 2 个 = 12
chk "历史文件全保留" "$(n_assets)" "12"
chk "manifest 份数(legacy + gen1)" "$(n_manifest)" "2"

echo "── case 2:连发 6 代,KEEP=5 → 最老的一代被淘汰"
for g in 2 3 4 5 6; do mkgen $g; ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null; sleep 1; done
chk "manifest 只剩 5 份" "$(n_manifest)" "5"
chk "第 0 代 legacy 已出局" "$(ls /usr/share/nginx/html/assets/.manifests | grep -c legacy || true)" "0"
chk "10 个历史孤儿已回收" "$(find /usr/share/nginx/html/assets -name 'legacy-*.js' | wc -l | tr -d ' ')" "0"
chk "本代 page-6.js 在" "$(test -f /usr/share/nginx/html/assets/page-6.js && echo 1 || echo 0)" "1"
chk "5 代内的 page-2.js 仍在(灰度生效)" "$(test -f /usr/share/nginx/html/assets/page-2.js && echo 1 || echo 0)" "1"
chk "跨代同名 shared-AAA.js 在" "$(test -f /usr/share/nginx/html/assets/shared-AAA.js && echo 1 || echo 0)" "1"

echo "── case 3:再发一代 → page-2 出局,page-3 仍在"
mkgen 7; ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null
chk "page-2.js 已淘汰" "$(test -f /usr/share/nginx/html/assets/page-2.js && echo 1 || echo 0)" "0"
chk "page-3.js 仍在" "$(test -f /usr/share/nginx/html/assets/page-3.js && echo 1 || echo 0)" "1"
chk "manifest 仍 5 份" "$(n_manifest)" "5"

echo "── case 4:构建产物为空 → 必须跳过回收,一个都不能删"
BEFORE="$(n_assets)"
rm -rf /opt/dist; mkdir -p /opt/dist/assets; echo x > /opt/dist/index.html
OUT="$(ASSET_KEEP_GENERATIONS=5 sh $S 2>&1)"
chk "文件数不变" "$(n_assets)" "$BEFORE"
echo "$OUT" | grep -q "为空,跳过回收" && ok "打出了跳过日志" || bad "没打跳过日志: $OUT"

echo "── case 5:KEEP=1 被钉到下限 2(否则首轮 TOTAL=2 会淘汰 legacy、把历史清光)"
reset
for g in 1 2 3; do mkgen $g; ASSET_KEEP_GENERATIONS=1 sh $S >/dev/null; sleep 1; done
chk "manifest 留 2 份(下限生效)" "$(n_manifest)" "2"
chk "本代 + 上一代 = 3 个文件" "$(n_assets)" "3"
chk "page-3.js(本代)在" "$(test -f /usr/share/nginx/html/assets/page-3.js && echo 1 || echo 0)" "1"
chk "page-2.js(上一代)也在" "$(test -f /usr/share/nginx/html/assets/page-2.js && echo 1 || echo 0)" "1"

echo "── case 6:index.html 每代覆盖为最新(非 hash 文件不做灰度)"
chk "index.html 是最新一代" "$(cat /usr/share/nginx/html/index.html)" "index v3"

echo "── case 7:子目录里的 chunk 也被正确处理(路径口径)"
reset
mkgen 1; mkdir -p /opt/dist/assets/sub; echo deep > /opt/dist/assets/sub/deep-AAA.js
ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null
chk "子目录文件保留" "$(test -f /usr/share/nginx/html/assets/sub/deep-AAA.js && echo 1 || echo 0)" "1"
mkgen 2; ASSET_KEEP_GENERATIONS=1 sh $S >/dev/null
chk "KEEP=1 下子目录孤儿被回收" "$(test -f /usr/share/nginx/html/assets/sub/deep-AAA.js && echo 1 || echo 0)" "0"



A=/usr/share/nginx/html/assets
M=$A/.manifests
reset() { rm -rf /opt/dist /usr/share/nginx/html; mkdir -p /opt/dist/assets /usr/share/nginx/html; }
mkgen() {
  rm -rf /opt/dist; mkdir -p /opt/dist/assets
  echo "index v$1" > /opt/dist/index.html
  echo "shared"    > /opt/dist/assets/shared-AAA.js
  echo "g$1"       > /opt/dist/assets/page-$1.js
}
nass() { find $A -type f -not -path "$M/*" | wc -l | tr -d ' '; }
nman() { ls -1A $M 2>/dev/null | grep -c '\.txt$' | tr -d ' '; }

echo "── P0-1:宿主时钟落后于在册 manifest → 本代绝不能被自己淘汰"
reset
mkgen 1; ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null      # 建立 legacy + gen1
# 伪造 5 份【未来】时间戳的 manifest(等价于宿主时钟回拨)
FUTURE=$(( $(date +%s) + 999999 ))
i=0; while [ $i -lt 5 ]; do echo "ghost-$i.js" > "$M/$((FUTURE+i)).txt"; i=$((i+1)); done
mkgen 2                                                  # 新构建:本代 GEN=now,比上面 5 份都小
OUT="$(ASSET_KEEP_GENERATIONS=5 sh $S 2>&1)"; RC=$?
chk "脚本正常退出" "$RC" "0"
chk "本代 page-2.js 存活(修复前这里会被删光→白屏)" "$(test -f $A/page-2.js && echo 1 || echo 0)" "1"
chk "本代 shared-AAA.js 存活" "$(test -f $A/shared-AAA.js && echo 1 || echo 0)" "1"
chk "本代 manifest 仍在册" "$(ls -1A $M | grep -c "^$(ls -1A $M | grep '\.txt$' | sort -n | tail -1)$")" "1"

echo "── P1-5:.manifests 混进非 .txt 文件 → 迁移兜底必须仍然生效"
reset
mkdir -p $A $M; touch "$M/.DS_Store"
i=0; while [ $i -lt 8 ]; do echo old > $A/legacy-$i.js; i=$((i+1)); done
mkgen 1
OUT="$(ASSET_KEEP_GENERATIONS=5 sh $S 2>&1)"
echo "$OUT" | grep -q "首次运行" && ok "迁移兜底已触发(修复前会被 .DS_Store 跳过)" || bad "迁移兜底未触发: $OUT"
chk "8 个历史文件全保留" "$(find $A -name 'legacy-*.js' | wc -l | tr -d ' ')" "8"

echo "── P1-4:「代」= 构建而非容器启动 —— 同一构建重启 5 次不许烧掉 5 代"
reset
mkgen 1; ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null
BEFORE=$(nman)
i=0; while [ $i -lt 5 ]; do ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null; sleep 1; i=$((i+1)); done
chk "manifest 份数不变(修复前会 +5)" "$(nman)" "$BEFORE"
# 换真构建才增代
mkgen 2; ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null
chk "真的换了构建才 +1 代" "$(nman)" "$((BEFORE + 1))"

echo "── P1-7:ASSET_KEEP_GENERATIONS 非法值不许让 nginx 起不来 / 不许删光"
reset; mkgen 1; ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null
for K in "abc" "" " " "3; echo PWNED" "0" "-1"; do
  mkgen 9
  OUT="$(ASSET_KEEP_GENERATIONS="$K" sh $S 2>&1)"; RC=$?
  if [ "$RC" = "0" ] && [ "$(test -f $A/page-9.js && echo 1 || echo 0)" = "1" ]; then
    ok "KEEP='$K' → rc=0 且本代存活"
  else bad "KEEP='$K' → rc=$RC,本代存活=$(test -f $A/page-9.js && echo 1 || echo 0)"; fi
  echo "$OUT" | grep -q PWNED && bad "KEEP='$K' 发生命令注入!" || true
done

echo "── P2-10:KEEP=1 首轮不许把 legacy 连同历史一起清掉"
reset
mkdir -p $A; i=0; while [ $i -lt 6 ]; do echo old > $A/legacy-$i.js; i=$((i+1)); done
mkgen 1; ASSET_KEEP_GENERATIONS=1 sh $S >/dev/null
chk "历史文件仍在(KEEP 被钉到下限 2)" "$(find $A -name 'legacy-*.js' | wc -l | tr -d ' ')" "6"

echo "── 闸门:可达集合为空时绝不删,且不能让脚本非零退出"
reset; mkgen 1; ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null
rm -f $M/*.txt                                            # 抹掉全部清单
BEFORE=$(nass)
mkgen 1                                                    # 同一构建
OUT="$(ASSET_KEEP_GENERATIONS=5 sh $S 2>&1)"; RC=$?
chk "rc=0(不拖着 nginx 起不来)" "$RC" "0"
chk "文件数不减" "$(nass)" "$BEFORE"

echo "── 常规灰度仍然work:连发 7 代 KEEP=5,第 2 代应出局、第 3 代仍在"
reset
g=1; while [ $g -le 7 ]; do mkgen $g; ASSET_KEEP_GENERATIONS=5 sh $S >/dev/null; sleep 1; g=$((g+1)); done
chk "manifest 恰好 5 份" "$(nman)" "5"
chk "page-2.js 已淘汰" "$(test -f $A/page-2.js && echo 1 || echo 0)" "0"
chk "page-3.js 仍在(灰度窗口生效)" "$(test -f $A/page-3.js && echo 1 || echo 0)" "1"
chk "page-7.js(本代)在" "$(test -f $A/page-7.js && echo 1 || echo 0)" "1"

echo
echo "════ 结果: $PASS 通过 / $FAIL 失败 ════"
[ "$FAIL" -eq 0 ]
