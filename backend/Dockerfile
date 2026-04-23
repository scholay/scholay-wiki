# Build stage
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

# Runtime stage — pin Alpine version for reproducible builds
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata pandoc && \
    adduser -D -u 1001 appuser
ENV TZ=Asia/Shanghai
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

COPY --from=builder /build/main .

# 上传目录需在 appuser 启动前创建并授权；审稿与其他上传场景均写入此路径
RUN mkdir -p /app/uploads && \
    chown -R appuser:appuser /app/main /app/uploads

USER appuser

EXPOSE 8080

CMD ["/app/main"]
