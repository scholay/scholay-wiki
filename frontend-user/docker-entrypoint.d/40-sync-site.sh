#!/bin/sh
# 发版灰度 / stale-chunk 防护 —— 把本次构建产物合并进 nginx web root。
#
# 背景:Vite 每次 build 给所有分包重算 content-hash。直接整包替换 web root 时,
# 已打开的旧标签页去拉【旧 hash】的 chunk → 新容器里已不存在 → 404 →「页面加载失败」。
#
# 为什么值得为此留旧文件(2026-07-27 重新论证过,不是想当然):
#   本项目的自愈手段是 window.location.reload()(见 shared/lib/stale-chunk.ts),**硬刷新**。
#   而刷新并非无损 ——
#     · Composer 的对话草稿是纯 useState(Composer.tsx),刷了就没,全站无草稿持久化
#     · 审稿 wizard 的 Step2/3 只在「下一步」时 PATCH(JournalWizardPage.tsx goNext),
#       中途刷新退回上一次落库的内容
#     · 全站零 beforeunload,刷新前不打招呼
#   且有 16 个**页内** lazy 边界(ClawArtifactPreview / 登录弹窗 / SmartSearchPanel …),
#   撞旧 chunk **不需要用户导航**,可能就发生在他正打字的当下。
#   所以这里保留旧 chunk 的意义是让它**根本不触发刷新**,而不是刷得更优雅。
#
# 做法:
#   - 非 hash 文件(index.html / favicon / 字体 / pdfjs-cmaps / 50x.html)→ 覆盖为最新
#   - /assets 下 hash 分包 → 增量并入持久目录(生产挂宿主 ./data/frontend-assets)
#   - 回收:**保留最近 ASSET_KEEP_GENERATIONS 代构建**,删掉不属于任何一代的孤儿文件
#
# ── 2026-07-27:回收判据从 mtime 换成 manifest 可达性 ─────────────────────────
# 旧实现用 `find -mtime +RETAIN_DAYS -delete`。这个判据选错了维度,代价有两个:
#   1. 体积 = 保留天数 × **构建频率**。开发机一天 6 次构建 → 稳态 848MB;
#      生产一周 3 次 → 约 25MB。同一份配置在两种环境差 30 倍,不可预期也不可控。
#   2. mtime 根本不表达"第几代"。`cp -a` 保留的是**镜像构建时**的 mtime,
#      于是旧脚本必须再跑一轮 695 次 fork 的 touch 把 mtime 伪造成部署时刻 ——
#      那段循环存在的唯一理由,就是给一个错判据打补丁。
#      而它一旦失手(touch 被 `|| true` 吞掉、时钟漂移、镜像躺得比窗口久),
#      就会把**本次仍在服役**的整代 chunk 判为超龄删光 → 全站 JS/CSS 404 白屏(性能审计 P0)。
#
# 换成「最近 N 代」之后:
#   - 体积 = N × 单次构建体积,与构建频率**解耦**(开发机也不再无限涨)
#   - **回收**判据是可达性、不看时间 → 不需要 touch,上述 P0 从根上消失。
#     ⚠️ 但**淘汰**顺序仍按 GEN(epoch)排序,所以时钟并非完全无关 ——
#        宿主时钟一旦落后于在册 manifest,本代就会排在最前而被当成"最老的"删掉,
#        随即本代全部 chunk 变孤儿被清空(审查实测复现过)。
#        故淘汰名单里**显式排除本代**,见下方 grep -vFx。
#   - 语义也更贴需求:用户要的本来就是"往前几个版本还能用",是代数不是天数
#   - 旧的 ASSET_RETAIN_DAYS 已失效;新旋钮是 ASSET_KEEP_GENERATIONS(默认 5)
#
# nginx:alpine 的 entrypoint 会在启动 nginx 前依次执行 /docker-entrypoint.d/*.sh。
set -e

SRC=/opt/dist
DST=/usr/share/nginx/html
ASSETS="$DST/assets"
# manifest 必须落在**挂载内**才能跨容器重建存活 —— 卷只挂了 assets,所以只能放这里。
# 它对外可读会泄露 chunk 文件名(这些本就公开),nginx.conf 已加 `location ~ /\.` deny 兜底。
MANIFESTS="$ASSETS/.manifests"
KEEP="${ASSET_KEEP_GENERATIONS:-5}"

log() { echo "[40-sync-site] $*"; }

mkdir -p "$ASSETS" "$MANIFESTS"

# 互斥:两个容器同时起(误操作 / 编排重试)会各自算一份可达集合、互删对方那一代。
# .lock 不以 .txt 结尾,不会被上面任何一处清单过滤误当成 manifest。
# flock 缺失或拿不到锁时不阻断启动(|| true)—— 宁可退化成无锁,也不能让 nginx 起不来。
exec 9>"$MANIFESTS/.lock" 2>/dev/null || true
flock 9 2>/dev/null || true

# ── 迁移兜底 ────────────────────────────────────────────────────────────────
# 从 mtime 判据切过来的第一次:目录里躺着几万个历史 chunk,却一份 manifest 都没有。
# 若直接按"只保留本代"回收,会把它们**一次性删光** —— 正是我们要根除的那类 P0 的形态。
# 所以先把现存全部文件登记成"第 0 代",本轮一个都不删;之后随新代累积自然老化淘汰。
# ⚠️ 判据必须是「有没有 .txt 清单」,不能是「目录空不空」——
#    卷里混进一个 .DS_Store / .lock 就会让 ls -A 非空、守卫被跳过,
#    而后面的计数只数 .txt=0 → 首轮直接把全部历史 chunk 删光(审查实测)。
if [ -z "$(ls -1A "$MANIFESTS" 2>/dev/null | grep '\.txt$')" ]; then
    find "$ASSETS" -type f -not -path "$MANIFESTS/*" \
        | sed "s|^$ASSETS/||" | sort > "$MANIFESTS/0000000000-legacy.txt"
    log "首次运行:已把现存 $(wc -l < "$MANIFESTS/0000000000-legacy.txt" | tr -d ' ') 个文件登记为第 0 代,本轮不回收"
fi

# 非 hash 文件覆盖为最新;assets 增量并入(同名 hash 内容相同,旧文件原样保留)
cp -a "$SRC"/. "$DST"/

# ── 登记本代 ────────────────────────────────────────────────────────────────
# ⚠️「一代」必须等于**一次构建**,不能等于一次容器启动。
#    scripts/deploy.sh 每次 down 整栈 —— 发一个纯后端 hotfix 也会重启前端容器,
#    若每次启动都记一代,5 次后端热修就把灰度窗口整个清零,
#    而这个卷存在的唯一理由就是那个窗口(OOM 重启循环几秒就能烧完)。
#    做法:先算出本次清单,与在册最新一代逐字节比对,内容相同就**复用**它的代号。
# 先写到 .pending 再 mv:mv 在同一文件系统内是原子的,
# 中途被 SIGKILL 不会在卷里留下一份截断的清单被下次当权威。
NEW="$MANIFESTS/.pending"
find "$SRC/assets" -type f | sed "s|^$SRC/assets/||" | sort > "$NEW"

# 清单为空 = 构建产物异常。此时任何"可达性"判断都不可信,直接放弃回收。
if [ ! -s "$NEW" ]; then
    rm -f "$NEW"
    log "WARN: 本次构建 /opt/dist/assets 为空,跳过回收(不做任何删除)"
    exit 0
fi

LATEST="$(ls -1A "$MANIFESTS" | grep '\.txt$' | sort -n | tail -n 1)"
if [ -n "$LATEST" ] && cmp -s "$NEW" "$MANIFESTS/$LATEST"; then
    rm -f "$NEW"
    GEN="${LATEST%.txt}"          # 产物与上一代逐字节相同 ⇒ 只是重启,不新增一代
else
    GEN="$(date +%s)"
    mv "$NEW" "$MANIFESTS/$GEN.txt"
fi

# ── 淘汰超出 KEEP 的旧代 ────────────────────────────────────────────────────
# 不用 `head -n -N`(GNU 扩展,busybox 未必支持),改成先算差值。
# KEEP 校验:非数字在 busybox 算术里当 0,会把全部 manifest 淘汰光(靠闸 1 兜住但白忙一场);
# 而含 `;` 之类算术非法字符会让脚本 rc=2 —— entrypoint 自带 set -e,nginx 直接起不来。
case "$KEEP" in ''|*[!0-9]*) KEEP=5 ;; esac
# KEEP=1 时首轮 TOTAL=2(legacy + 本代)→ DROP=1 会把 legacy 淘汰、历史全清,
# 与「迁移那一轮一个都不删」的承诺矛盾。下限钉在 2。
[ "$KEEP" -lt 2 ] && KEEP=2

TOTAL="$(ls -1A "$MANIFESTS" | grep -c '\.txt$')"
DROP=$((TOTAL - KEEP))
if [ "$DROP" -gt 0 ]; then
    # grep -vFx "$GEN.txt" ★ 本代**永不**参与淘汰。
    # 少了这一句,宿主时钟落后时本代会排在最前被删,随即自己的 chunk 全变孤儿被清空。
    ls -1A "$MANIFESTS" | grep '\.txt$' | grep -vFx "$GEN.txt" \
      | sort -n | head -n "$DROP" | while IFS= read -r f; do
        rm -f "$MANIFESTS/$f"
    done
fi

# ── 回收孤儿文件 ────────────────────────────────────────────────────────────
REACHABLE=/tmp/40-sync-reachable
PRESENT=/tmp/40-sync-present
ORPHAN=/tmp/40-sync-orphan

# 不用 cat "$MANIFESTS"/*.txt:glob 无匹配时 sh 会把字面量传给 cat,cat 失败 + set -e
# ⇒ 脚本非零退出 ⇒ nginx entrypoint 自身的 set -e 让 **nginx 根本不启动**。
# 用 find -exec 并吞掉错误,拿不到就是空集,交给下面的闸 1 处理。
find "$MANIFESTS" -type f -name '*.txt' -exec cat {} + 2>/dev/null | sort -u > "$REACHABLE" || true
find "$ASSETS" -type f -not -path "$MANIFESTS/*" | sed "s|^$ASSETS/||" | sort > "$PRESENT"

# 安全闸 1:可达集合为空 ⇒ 判据失效,绝不删(宁可多占磁盘,不可白屏)
if [ ! -s "$REACHABLE" ]; then
    log "WARN: 可达集合为空,跳过回收"
    exit 0
fi

# ── 安全闸 2 ★ 本次构建的文件必须**确实躺在磁盘上** ─────────────────────────
# ⚠️ 这道闸曾经写反过,而且反着写是**恒真**的:
#      ORPHAN = PRESENT − REACHABLE,且 REACHABLE ⊇ 本代清单
#      ⇒ ORPHAN ∩ 本代 恒为空集 —— 口径写错时两边形状不同,交集**也**是空。
#    也就是说旧写法一次都没生效过,却在注释里自称"让那一类故障不可能再发生"。
#    正确方向是它的对偶:断言「本代清单 ⊆ 磁盘现存」。
#    路径口径一旦写错(find/sed 前缀不一致),本代清单里的名字在 PRESENT 里必然找不到,
#    这个断言当场为真 → 停手。
# ⚠️ 且必须 fail-closed:旧写法在 $GEN.txt 不存在时,comm 报错到 stderr、stdout 为空,
#    [ -n "" ] 为假 → **放行**,而它要防的故障恰好会让这个文件消失。
if [ ! -s "$MANIFESTS/$GEN.txt" ]; then
    log "FATAL: 本代清单丢失或为空 → 中止回收(不删任何东西)"
    exit 0
fi
if [ -n "$(comm -23 "$MANIFESTS/$GEN.txt" "$PRESENT" | head -n 1)" ]; then
    log "FATAL: 本次构建的文件在磁盘上找不到 → 路径口径有误,已中止回收(不删任何东西)"
    exit 0   # 刻意不 exit 1:回收失败不该拖着 nginx 起不来
fi

comm -23 "$PRESENT" "$REACHABLE" > "$ORPHAN"

N_ORPHAN="$(wc -l < "$ORPHAN" | tr -d ' ')"
if [ "$N_ORPHAN" -gt 0 ]; then
    while IFS= read -r rel; do
        [ -n "$rel" ] && rm -f "$ASSETS/$rel"
    done < "$ORPHAN"
fi
rm -f "$REACHABLE" "$PRESENT" "$ORPHAN"

log "web root synced;保留最近 ${KEEP} 代($(ls -1 "$MANIFESTS" | wc -l | tr -d ' ') 份 manifest 在册),本轮回收 ${N_ORPHAN} 个孤儿文件"
