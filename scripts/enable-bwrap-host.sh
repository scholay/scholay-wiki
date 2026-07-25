#!/usr/bin/env bash
# ============================================================
# 生产宿主(Ubuntu 24.04+)启用 agent 容器内 bwrap 沙箱的前置步骤。
#
# 背景(2026-07-23 线上实测,修复审计 P0-4):Ubuntu 24.04 起
# kernel.apparmor_restrict_unprivileged_userns=1 会把 unconfined 进程创建
# user namespace 的行为转入 unprivileged_userns 桩 profile(拒 capability),
# bwrap 报 "setting up uid map: Permission denied"。
#
# 本脚本把该 sysctl 持久化为 0(回到 Ubuntu 23.10 及以前所有发行版的内核默认)。
# 必须与 docker-compose*.yml agent 服务的 `apparmor=unconfined` 配套——
# 两层缺一,bwrap 都起不来(另一层是 docker-default profile 无 mount 规则)。
#
# 回滚:rm /etc/sysctl.d/99-scholar-agent-userns.conf && sysctl -w kernel.apparmor_restrict_unprivileged_userns=1
# ============================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "必须以 root 运行" >&2
  exit 1
fi

echo "kernel.apparmor_restrict_unprivileged_userns = 0" > /etc/sysctl.d/99-scholar-agent-userns.conf
sysctl --system >/dev/null
echo -n "当前值:"
sysctl kernel.apparmor_restrict_unprivileged_userns

echo "OK。接着执行(security_opt 变更必须重建容器,restart 无效):"
echo "  docker compose -f docker-compose.prod.yml up -d agent"
