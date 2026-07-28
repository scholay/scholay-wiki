#!/bin/sh
# 40-sync-site.sh 的回归用例 —— 在【真实运行时镜像 nginx:alpine】里跑。
#
# 为什么必须有这个文件:那个脚本负责删除生产 web root 里的文件,已经出过两次
# 「删掉正在服役的 chunk → 全站 JS 404 白屏」的 P0,而它此前零测试。
# 下面每一组用例都对应一个**真实发生过或被审查复现过**的故障,不是凑数的。
#
# 为什么必须在容器里跑:macOS 的 sort/comm/sed/grep 与 busybox 语义不同
# (排序规则、-vFx、正则方言),在本机跑等于没跑。
#
# 用法:
#   ./scripts/test-sync-site.sh
#
set -e
cd "$(dirname "$0")/.."
exec docker run --rm \
  -v "$PWD/frontend-user/docker-entrypoint.d/40-sync-site.sh:/script/40-sync-site.sh:ro" \
  -v "$PWD/scripts/lib/sync-site-cases.sh:/t.sh:ro" \
  nginx:alpine sh /t.sh
