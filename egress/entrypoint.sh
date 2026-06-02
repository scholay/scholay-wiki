#!/bin/sh
# egress 代理启动:按 EGRESS_FILTER_MODE 决定外联范围,再起 tinyproxy。
#   open(默认)     —— 放行一切外部 HTTPS(仍经代理 → 统一记日志;内网由网络拓扑 + ConnectPort 443 挡住)。
#                       适合"agent 需要请求任意互联网资源"的场景(不一刀切)。
#   allowlist       —— deny-by-default,只放行 egress/filter 里列的域名。最严,适合生产收紧外泄面。
set -e
MODE="${EGRESS_FILTER_MODE:-open}"
CONF=/tmp/tinyproxy.conf
cp /etc/tinyproxy/tinyproxy.base.conf "$CONF"

if [ "$MODE" = "allowlist" ]; then
  printf 'Filter "/etc/tinyproxy/filter"\nFilterDefaultDeny Yes\nFilterType ere\nFilterCaseSensitive Off\n' >> "$CONF"
  echo "[egress] EGRESS_FILTER_MODE=allowlist — deny-by-default,仅放行 egress/filter 内域名。"
else
  echo "[egress] EGRESS_FILTER_MODE=open — 放行一切外部 HTTPS(经代理记日志;内网被拓扑+ConnectPort 挡住)。要锁紧设 EGRESS_FILTER_MODE=allowlist。"
fi

exec tinyproxy -d -c "$CONF"
