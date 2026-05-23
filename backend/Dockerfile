# Build stage 1: Go binary
FROM golang:1.21-alpine AS builder

WORKDIR /build

RUN apk add --no-cache git gcc musl-dev

ENV GOPROXY=https://goproxy.cn,https://mirrors.aliyun.com/goproxy/,https://proxy.golang.org,direct
ENV GO111MODULE=on
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Copy dependency files first for better layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code (changes more frequently, cached layer above stays)
COPY . .

# Ensure go.sum is up to date with any new dependencies
RUN go mod tidy

RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o main ./cmd/server

# Build stage 2: pdf-extract node_modules (pdfjs-dist)
# 单独的 Node stage 只跑 npm ci → 把 node_modules 拷到运行时,避免运行时还需要 npm
FROM node:20-alpine AS pdf-extract-builder
WORKDIR /pdf-extract
COPY pdf-extract/package.json ./
# 用 npm install(没 lock file 时) —— ci 模式需要 package-lock.json
RUN npm install --omit=dev --no-audit --no-fund --no-progress

# Runtime stage — pin Alpine version for reproducible builds
FROM alpine:3.19

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
