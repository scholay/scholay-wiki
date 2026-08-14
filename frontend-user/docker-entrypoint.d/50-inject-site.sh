#!/bin/sh
# 站点身份运行时注入 —— 把 index.html 里的占位符换成本环境 env 的值。
#
# ── 为什么需要这个脚本 ────────────────────────────────────────────────────────
# 目标是「一套代码 + 一份配置文件」:生产与测试跑**同一个镜像 tag**,唯一差别是 .env。
# 但前端是 Vite 静态产物 —— `import.meta.env.VITE_*` 在**编译期**就被字面替换进 bundle,
# 所以任何走 build-arg 的方案都等价于「换域名 = 换镜像」,与目标直接冲突。
#
# (顺带说明历史:scripts/build-and-push.sh 曾传 --build-arg VITE_SITE_URL/VITE_SITE_NAME,
#  但 Dockerfile 从没声明过对应的 ARG、源码也没有任何消费点 —— 那两个参数被 docker
#  静默丢弃,只在构建日志留一行 unused build-arg warning,而脚本却先打印了「已注入」。
#  也就是说那条路不仅是错的,还是**看起来生效了**的错。已一并删除。)
#
# 于是把这几个值留成占位符,在容器启动时替换。三条路径同时受益:
#   1. 浏览器直连 SPA        → 读的就是本文件写出的 index.html
#   2. backend SSR           → 它是 HTTP fetch 本容器的 `/` 拿 index.html
#                              (backend/internal/config/handler_ssr.go 的 getPageHTML),
#                              所以 SSR 页面自动带上同一套值,不需要第二处配置
#   3. `npm run dev`          → 没有容器,由 vite.config.ts 的 siteConfigPlaceholders 插件
#                              用本地默认值替换,开发时不会看到裸占位符
#
# ── 执行顺序 ────────────────────────────────────────────────────────────────
# nginx:alpine 的 entrypoint 按**字典序**依次执行 /docker-entrypoint.d/*.sh。
# 40-sync-site.sh 先跑,它把 /opt/dist 整体 `cp -a` 到 web root(每次启动都覆盖,
# 于是 index.html 每次都回到「带占位符」的原始状态)。本脚本编号 50,跑在它之后,
# 对 web root 里那份做替换 —— 因此**幂等**:重启多少次都是「还原 → 重新替换」。
#
# 🔴 顺序反了会静默失效:若本脚本排在 40 之前,替换完的文件会被 40 的 cp 覆盖回去,
#    页面上就是裸占位符,而两个脚本都不会报错。改编号前请先想清楚这一点。
set -e

DST=/usr/share/nginx/html
INDEX="$DST/index.html"

log() { echo "[50-inject-site] $*"; }

[ -f "$INDEX" ] || { log "WARN: $INDEX 不存在,跳过注入"; exit 0; }

# ── 取值 ────────────────────────────────────────────────────────────────────
# SITE_URL 是唯一必需项。去掉尾斜杠 —— 占位符在模板里都是 `__SITE_URL__/xxx` 形态,
# 传进来带尾斜杠会拼出 `https://host//xxx`(双斜杠在 canonical/@id 里算不同 URL)。
SITE_URL="$(printf '%s' "${SITE_URL:-}" | sed 's:/*$::')"
CLARITY_ID="${CLARITY_PROJECT_ID:-}"
ICP_BEIAN="${ICP_BEIAN:-}"
TITLE_PREFIX="${SITE_TITLE_PREFIX:-}"

if [ -z "$SITE_URL" ]; then
    # 刻意**不**回落到任何真实域名。回落值会流进 og:url、og:image、JSON-LD 的
    # @id/url 图谱 —— 一个漏配的环境会就此宣称自己是那个站点,并把这份结构化数据
    # 交给搜索引擎。空值的后果只是这些标签失效(SSR 仍会为公开页补 og:url/canonical),
    # 比冒名顶替轻得多。
    log "WARN: SITE_URL 未设置 —— og:url / og:image / JSON-LD 的绝对 URL 将为空。"
    log "      compose 应给 frontend-user 服务透传 SITE_URL(与 backend 同一个值)。"
fi

# ── 替换 ────────────────────────────────────────────────────────────────────
# 分隔符用 `|`:URL 里必然有 `/`,用 `s/.../.../` 会当场语法错误。
# 值里若含 `|` 或 `&` 会破坏 sed —— 先转义。`&` 在替换串里表示「整个匹配」。
esc() { printf '%s' "$1" | sed -e 's:[|&\\]:\\&:g'; }

TMP="$INDEX.tmp.$$"

# 🔴 fail-open,不是 fail-closed。
#
# 本脚本跑在 nginx entrypoint 里,而那个 entrypoint 自带 set -e ——
# 只要本脚本以非 0 退出,**nginx 根本不会启动**,容器直接 exited;配上
# `restart: unless-stopped` 就是崩溃循环,而 backend SSR 也是 fetch 这个容器拿
# index.html,于是整站 100% 不可用。
#
# 而注入失败的后果只是「页面上多几个难看的占位符字符串」。用整站宕机去换显示不好看,
# 方向是反的。同目录的 40-sync-site.sh 已经把这个道理写明并一律 `exit 0`
# (「回收失败不该拖着 nginx 起不来」),这里保持同一口径。
#
# 触发路径是真实存在的:env 值里含换行会让 sed 报 unmatched '|' 而 rc=1
# (esc() 能转义 | & \ 但转义不了换行);磁盘满会让重定向失败。
if ! sed \
    -e "s|__SITE_URL__|$(esc "$SITE_URL")|g" \
    -e "s|__CLARITY_ID__|$(esc "$CLARITY_ID")|g" \
    -e "s|__ICP_BEIAN__|$(esc "$ICP_BEIAN")|g" \
    -e "s|__TITLE_PREFIX__|$(esc "$TITLE_PREFIX")|g" \
    "$INDEX" > "$TMP" 2>/dev/null
then
    rm -f "$TMP"
    log "FATAL: 注入失败(env 值里可能含换行等 sed 无法处理的字符)。"
    log "       保留未替换的 index.html 并继续启动 —— 页面上会出现 __SITE_URL__ 等占位符,"
    log "       但站点可用。请检查 SITE_URL / SITE_TITLE_PREFIX / ICP_BEIAN 的取值。"
    exit 0
fi

# 先写临时文件再 mv:mv 在同一文件系统内是原子的。直接 `sed -i` 若中途被 SIGKILL,
# web root 里会留下一份截断的 index.html,而 nginx 会照常把它发给用户。
if ! mv "$TMP" "$INDEX"; then
    rm -f "$TMP"
    log "FATAL: 写回 index.html 失败,保留原文件并继续启动。"
    exit 0
fi

# ── 同步重建 index.html.gz ──────────────────────────────────────────────────
#
# 🔴 少了这一步,上面整套替换对**真实用户 100% 无效**,而且本脚本还会照常打印"已注入"。
#
# 链条:postbuild 的 scripts/precompress-assets.mjs 把 index.html 预压成 index.html.gz
# (该文件自己把「有 X 必有同代 X.gz」写成不变式)→ 40-sync-site.sh 用 `cp -a` 把两者
# 一起同步进 web root → frontend-user/nginx.conf 开着 `gzip_static on`。
# nginx 的 gzip_static **不比较 mtime**:只要客户端带 Accept-Encoding: gzip 就直接发 .gz。
# 而所有真实浏览器都带这个头,backend SSR 用的 Go http.Client 也会自动带并透明解压 ——
# 也就是说两条路径拿到的都是**替换前**的原始 HTML。
#
# 症状极具迷惑性:curl 不带 Accept-Encoding 时一切正常(你会以为修好了),
# 浏览器里却是 __SITE_URL__ / __TITLE_PREFIX__ 原样上屏。
if [ -f "$INDEX.gz" ]; then
    if gzip -9 -c "$INDEX" > "$INDEX.gz.tmp" 2>/dev/null && mv "$INDEX.gz.tmp" "$INDEX.gz"; then
        :
    else
        # 压不出来就**删掉**旧 .gz —— nginx 会回落到对 index.html 做动态 gzip
        # (nginx.conf 有 `gzip on`),结果正确,只多花一点 CPU。
        # 留着旧 .gz 才是真正的错误:那等于把注入前的内容继续发给所有人。
        rm -f "$INDEX.gz.tmp" "$INDEX.gz"
        log "WARN: 重建 index.html.gz 失败,已删除旧 .gz(nginx 改用动态 gzip,行为正确)"
    fi
fi

# ── 自检 ────────────────────────────────────────────────────────────────────
# 漏替换的占位符会**原样显示给用户**(标题里的 `__TITLE_PREFIX__`、JSON-LD 里的
# `__SITE_URL__`),而且不报任何错。这里主动查一次,让它至少在日志里可见。
#
# 🔴 只查**本脚本负责的那几个名字**,不能用 `__[A-Z_]+__` 这种通用形状去扫:
#    index.html 里有大量合法的同形 JS 标识符(window.__SITE_CONFIG__ /
#    __SSR_SNIPPETS_INJECTED__ / __afterCriticalLoad 等),通用正则会把它们全报成
#    「未替换」。一条恒定误报的告警,几次之后就等于没有告警 —— 而它要防的恰恰是
#    「有一天真的漏了一个」。新增占位符时把名字加进下面这行。
for ph in __SITE_URL__ __CLARITY_ID__ __ICP_BEIAN__ __TITLE_PREFIX__; do
    if grep -q "$ph" "$INDEX"; then
        log "WARN: index.html 里仍残留占位符 $ph —— 替换未生效,该值会原样显示给用户。"
    fi
done

log "站点身份已注入: SITE_URL='${SITE_URL:-(空)}' CLARITY='${CLARITY_ID:-(关闭)}' ICP='${ICP_BEIAN:-(不显示)}' TITLE_PREFIX='${TITLE_PREFIX:-(无)}'"
