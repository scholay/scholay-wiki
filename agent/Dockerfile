# Scholay clean-room agent executor —— raw @anthropic-ai/sdk tool-runner,provider-agnostic。
# 零 Claude Code CLI / cc-haha / Codex 血统。bun:1 slim,non-root,cap_drop(compose)。
FROM oven/bun:1-slim AS base
WORKDIR /app

# bubblewrap:P4b sandbox(SANDBOX_MODE=bwrap,仅生产真内核生效;none 模式不用但装着无害)。
# 文档转文本工具链:agent(claw / peerreview)用 Bash 把用户上传的**任意格式**转成文本自行分析
#   (设计原则:能力交给 agent 自控 tool,后端不预处理 —— 格式太多无法预判)。
#   poppler-utils=pdftotext(PDF);pandoc=通用转换(docx/odt/rtf/epub/html/latex…);
#   python3-docx=Word(pandoc 缺时兜底);python3-openpyxl=Excel。
#   注:python3-pptx 不在此 Debian 镜像的包库(定位失败),pptx 走 pandoc。
# ⚠️ pandoc ~150MB+Haskell,在 clash fake-ip 网络下 apt fetch 可能超时;生产构建网络能连阿里云镜像即可。
# 用阿里云 Debian 镜像,规避生产 clash fake-ip 导致 deb.debian.org 解析成假 IP 的构建超时
# (见 memory prod-apt-mirror-clash-fakeip)。
# chromium + fonts-noto-cjk:mermaid 图表服务端渲染(/render/mermaid,mermaid 必须真浏览器;
# CJK 字体缺失会渲成豆腐块)。~450MB,owner 已拍板要小程序内嵌真图。
RUN { sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; } \
    && apt-get update && apt-get install -y --no-install-recommends \
        bubblewrap ca-certificates poppler-utils pandoc python3 python3-docx python3-openpyxl \
        chromium fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
# emoji 字体单独一层:上面的大层(~1.1GB)已缓存,10MB 小层低内存增量构建
# (Docker Desktop 内存紧张时整层重装会 OOM Killed,别合并回去)。
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium

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
