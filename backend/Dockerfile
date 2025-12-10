# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

# Set Go proxy for China (use Aliyun mirror)
ENV GOPROXY=https://goproxy.cn,direct
ENV GO111MODULE=on
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Copy go mod files
COPY go.mod ./

# Copy source code
COPY . .

# Generate go.sum and download dependencies
RUN go mod tidy

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o main ./cmd/server

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates mysql-client tzdata
ENV TZ=Asia/Shanghai
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/main .

# Expose port
EXPOSE 8080

# Run the application
CMD ["/app/main"]
