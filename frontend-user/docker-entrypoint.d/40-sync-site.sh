#!/bin/sh
# 发版灰度 / stale-chunk 防护 —— 把本次构建产物合并进 nginx web root。
#
# 背景:Vite 每次 build 给所有分包重算 content-hash。直接整包替换 web root 时,
# 已打开的旧标签页做客户端跳转会去拉【旧 hash】的 chunk → 新容器里已不存在 → 404
# →「页面加载失败」。这里改成:
#   - 非 hash 文件(index.html / favicon / 字体 / pdfjs-cmaps / 50x.html)→ 覆盖为最新
#   - /assets 下 hash 分包 → **增量并入**持久目录(挂宿主 ./data/frontend-assets),
#     旧版本 chunk 保留一段时间 → 老标签页发版后仍能拉到它那一版的 chunk,体验无缝;
#     配合前端 vite:preloadError / RouteErrorBoundary 的自动刷新做双保险。
#   - 回收超过保留窗口(默认 7 天)没再出现的旧 chunk,防目录无限增长。
#
# nginx:alpine 的 entrypoint 会在启动 nginx 前依次执行 /docker-entrypoint.d/*.sh。
set -e

SRC=/opt/dist
DST=/usr/share/nginx/html
RETAIN_DAYS="${ASSET_RETAIN_DAYS:-7}"

mkdir -p "$DST/assets"
# index.html 等覆盖为最新;assets 增量并入持久目录(同名 hash 内容相同,旧文件保留)
cp -a "$SRC"/. "$DST"/
# 关键:cp -a 保留的是【镜像构建时】的 mtime(= npm run build 时刻),不是部署时刻。若镜像龄
# 超过 RETAIN_DAYS(prod 用固定 tag,镜像可能躺很久),下面的 find -mtime 会把本次【仍在服役】的
# 整代 hash chunk 判为超龄删光 → 宿主 bind-mount 被清空 → 全站 JS/CSS 404 白屏(性能审计 P0)。
# 故 cp 后把【本次构建产物】的 mtime 刷成部署时刻(now),令保留窗口锚定「部署时间」而非「构建时间」。
# 只 touch 本次 SRC 内的文件 → 历史遗留、本次不含的旧 chunk 保持旧 mtime,仍按 RETAIN_DAYS 正常回收。
( cd "$SRC" && find . -type f -print ) | while IFS= read -r rel; do
    touch "$DST/$rel" 2>/dev/null || true
done
# 回收旧版本残留 chunk(仅 assets;本次构建文件 mtime 已刷新为 now,不会被删)
find "$DST/assets" -type f -mtime "+$RETAIN_DAYS" -delete 2>/dev/null || true

echo "[40-sync-site] web root synced; /assets retained for ${RETAIN_DAYS}d (stale-chunk grace)"
