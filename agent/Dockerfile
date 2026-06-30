# Scholay clean-room agent executor —— raw @anthropic-ai/sdk tool-runner,provider-agnostic。
# 零 Claude Code CLI / cc-haha / Codex 血统。bun:1 slim,non-root,cap_drop(compose)。
FROM oven/bun:1-slim AS base
WORKDIR /app

# bubblewrap:P4b sandbox(SANDBOX_MODE=bwrap,仅生产真内核生效;none 模式不用但装着无害)。
# 用阿里云 Debian 镜像,规避生产 clash fake-ip 导致 deb.debian.org 解析成假 IP 的构建超时
# (见 memory prod-apt-mirror-clash-fakeip)。
RUN { sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; } \
    && apt-get update && apt-get install -y --no-install-recommends bubblewrap ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# deps(独立缓存层)
COPY package.json ./
RUN bun install

# source
COPY tsconfig.json ./
COPY src ./src

ENV PORT=3456
ENV NODE_ENV=production
EXPOSE 3456

# non-root(oven/bun 镜像自带 bun 用户)
USER bun

CMD ["bun", "run", "src/index.ts"]
