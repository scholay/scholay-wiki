#!/bin/sh
set -e

# ─── 自愈挂载卷属主 (一劳永逸解决 EACCES) ─────────────────────────────────────
# /home/bun/.claude 在生产是 bind mount 到宿主 ./data/agent。宿主目录默认 root 属主,
# 而 agent 进程以 bun (uid 1000) 跑 → 写不进去 → mkdir '/home/bun/.claude/...' EACCES
# → 建会话 / 推 provider 配置 / 注册 skill 全 500。
#
# 这里以 root 启动时【幂等】把该目录属主修成 bun, 不论宿主目录是谁建的 / 哪种部署方式,
# 容器每次启动都能自愈, 然后用 gosu 降权到 bun 跑真正的进程 (保持与原 `USER bun` 一致)。
if [ "$(id -u)" = "0" ]; then
  mkdir -p /home/bun/.claude
  chown -R bun:bun /home/bun/.claude
  exec gosu bun "$@"
fi

# 已经是非 root (理论上不会走到) —— 直接执行
exec "$@"
