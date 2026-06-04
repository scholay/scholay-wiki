FROM oven/bun:1.2 AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml tsconfig.json preload.ts ./
COPY stubs ./stubs
RUN bun install

FROM oven/bun:1.2
WORKDIR /app

ENV NODE_ENV=production \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=3456

USER root
# apt 镜像按环境可覆盖(默认官方 deb.debian.org;同 prism_tex 说明)。纯国内直连可用
# --build-arg APT_MIRROR=mirrors.aliyun.com;clash fake-ip 环境治本是对该域名走 DIRECT。
ARG APT_MIRROR=deb.debian.org
RUN set -eux; \
    if [ "$APT_MIRROR" != "deb.debian.org" ]; then \
      for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
        [ -f "$f" ] && sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" "$f" || true; \
      done; \
    fi

# ca-certificates 必装 ——
#   1) curl / openssl 走系统 CA bundle, 没这个 HTTPS 一律失败
#   2) Bun 自带 bundled CA, 但代理 (Clash / mihomo fake-ip) 改签证书时
#      会被 Bun 报 "unknown certificate verification error";
#      装上 ca-certificates 后, NODE_EXTRA_CA_CERTS 可以指向自定义 CA pem,
#      Bun 会把它合并进 trust store 解决代理签名问题
# poppler-utils: PDF→文本 (pdftotext); ripgrep: 快搜
# bubblewrap/socat: 预装供生产 (真·Linux 主机) 启用 Bash sandbox; 本地 Docker Desktop
#   内核跑不了非特权 userns, 本地不启用沙箱 (见 conversationService.ts 注释)。
# pandoc + python3 + openpyxl: 让 agent 用 Bash 把 docx/odt/rtf / xlsx 转成可读文本
#   (大模型像 Claude Code 一样自己调工具读 office 文件)。
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    poppler-utils \
    ripgrep \
    bubblewrap \
    socat \
    pandoc \
    python3 \
    python3-openpyxl \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock bunfig.toml tsconfig.json preload.ts ./
COPY stubs ./stubs
COPY src ./src
COPY bin ./bin
COPY adapters ./adapters
COPY runtime ./runtime

RUN mkdir -p /home/bun/.claude && chown -R bun:bun /home/bun/.claude /app

# 预装 MCP server (学术检索) — 落在用户级全局配置 ~/.claude.json
# 文件里的 ${MINICOD_API_KEY} 在加载时由 agent runtime 用容器 env 展开
COPY --chown=bun:bun preinstalled-mcp.json /home/bun/.claude.json

USER bun

EXPOSE 3456

CMD ["bun", "run", "src/server/index.ts"]
