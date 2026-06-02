# Scholar agent egress 网关 —— 唯一允许 agent 出公网的出口。
# 用 tinyproxy(纯用户态 forward-proxy,对 CONNECT 是按目标 host 过滤的纯隧道,
# 零 TLS 解密 / 零 CA 注入),比 squid ssl_bump 简单且无 ESNI/编译依赖坑。
# 自 build alpine 而非拉第三方镜像,避免供应链信任问题。
# 外联范围由 entrypoint.sh 按 EGRESS_FILTER_MODE 切换(open 默认 / allowlist 收紧)。
FROM alpine:3.20
RUN apk add --no-cache tinyproxy
COPY tinyproxy.base.conf /etc/tinyproxy/tinyproxy.base.conf
COPY filter /etc/tinyproxy/filter
COPY entrypoint.sh /entrypoint.sh
EXPOSE 3128
# 非 root 运行(端口 >1024 无需 cap;conf 在 /tmp 由 nobody 生成;基础配置/filter world-readable)。
USER nobody
CMD ["sh", "/entrypoint.sh"]
