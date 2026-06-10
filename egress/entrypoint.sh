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
  # deny-by-default:只放行 egress/filter 内域名,内网 / 云元数据天然被拒。
  printf 'Filter "/etc/tinyproxy/filter"\nFilterDefaultDeny Yes\nFilterType ere\nFilterCaseSensitive Off\n' >> "$CONF"
  echo "[egress] EGRESS_FILTER_MODE=allowlist — deny-by-default,仅放行 egress/filter 内域名。"
else
  # open 模式也必须加载内网/元数据基线 deny-list(FilterDefaultDeny No = 命中即拒、其余放行),
  # 否则明文 GET http://100.100.100.200/...(元数据)/ http://10.x/... 直通 → SSRF / 凭证窃取。
  printf 'Filter "/etc/tinyproxy/filter-deny-internal"\nFilterDefaultDeny No\nFilterType ere\nFilterCaseSensitive Off\n' >> "$CONF"
  echo "[egress] EGRESS_FILTER_MODE=open — 放行外部 HTTPS,但内网/云元数据网段已基线 deny。生产建议 EGRESS_FILTER_MODE=allowlist 彻底闭合。"
fi

exec tinyproxy -d -c "$CONF"
