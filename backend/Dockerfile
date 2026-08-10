# Build stage 1: Go binary
# 2026-08-10 基础镜像升级(CVE 清理):go 1.21→1.24。go.mod 仍声明 go 1.21(模块语言
# 版本不动,新工具链向后兼容);全量 go build+test 已在 1.24-alpine + CGO 下验证通过。
FROM golang:1.24-alpine AS builder

WORKDIR /build

RUN apk add --no-cache git gcc musl-dev

ENV GOPROXY=https://goproxy.cn,https://mirrors.aliyun.com/goproxy/,https://proxy.golang.org,direct
ENV GO111MODULE=on
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Copy dependency files first for better layer caching
# --mount=type=cache 把 Go module 缓存放进 BuildKit 持久缓存卷:go.sum 变化时只增量
# 下载新模块,不再全量重拉(跨构建、跨层失效存活;buildx 与 docker build 均支持)。
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy source code (changes more frequently, cached layer above stays)
COPY . .

# Ensure go.sum is up to date with any new dependencies
# (本机无 Go 工具链,新增依赖靠这里补 go.sum —— 刻意保留;module 缓存在上,增量极快)
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod tidy

# 注意不要加 -a:它强制无视编译缓存重编全部依赖,配合下面的 go-build 缓存挂载,
# 增量构建只重编改动过的包(此前每次构建都是全量编译)。-installsuffix 是 go1.10 前的遗留。
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 GOOS=linux go build -o main ./cmd/server

# Build stage 2: pdf-extract node_modules (pdfjs-dist)
# 单独的 Node stage 只跑 npm ci → 把 node_modules 拷到运行时,避免运行时还需要 npm
# (pdfjs-dist 纯 JS 无 native 依赖,builder node 22 与运行时 alpine 的 node 24 差一档无害;
#  package.json engines 要求 node>=20,两者均满足)
FROM node:22-alpine AS pdf-extract-builder
WORKDIR /pdf-extract
COPY pdf-extract/package.json ./
# 用 npm install(没 lock file 时) —— ci 模式需要 package-lock.json
# npm 下载缓存进 BuildKit 缓存卷,重建该层时走本地缓存不全量拉包
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --no-audit --no-fund --no-progress --prefer-offline

# Runtime stage — pin Alpine version for reproducible builds
# 3.19→3.24(CVE 清理)。已实测 3.24:apk 的 pandoc(=pandoc-cli 3.10)/nodejs(24 LTS)/
# tzdata/ca-certificates 均可装;musl ABI 稳定,builder(同为 musl)产物直接可跑。
FROM alpine:3.24

# pandoc: 仍用于其他 doc 转换;nodejs: pdfjs-dist 抽取 PDF 元数据
# 注:不再装 poppler-utils,PDF 文本提取统一改走 pdfjs (内含字体/位置元数据)
RUN apk --no-cache add ca-certificates tzdata pandoc nodejs && \
    adduser -D -u 1001 appuser
ENV TZ=Asia/Shanghai
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

COPY --from=builder /build/main .
# pdf-extract 脚本 + 它的 node_modules —— Go backend 通过 exec.Command("node", ...) 调用
# 用 .mjs 扩展名,Node 不需要 package.json 的 "type": "module" 标记
COPY pdf-extract/extract.mjs /app/pdf-extract/extract.mjs
COPY --from=pdf-extract-builder /pdf-extract/node_modules /app/pdf-extract/node_modules

# Backend Go 端通过环境变量找脚本位置;Dockerfile 内固定 /app 路径,不需要本地 .env 配
ENV PDF_EXTRACT_SCRIPT=/app/pdf-extract/extract.mjs

# 上传目录需在 appuser 启动前创建并授权；审稿与其他上传场景均写入此路径
RUN mkdir -p /app/uploads && \
    chown -R appuser:appuser /app/main /app/uploads /app/pdf-extract

USER appuser

EXPOSE 8080

CMD ["/app/main"]
