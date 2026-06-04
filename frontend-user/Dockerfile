# Build stage — slim (glibc) 避免 musl 下 rollup native binding 问题
FROM node:22-slim AS builder

WORKDIR /app

# 先装依赖,利用 Docker 层缓存
# .npmrc 指向 npmmirror(中国镜像),解决 docker 内网络 ECONNRESET
COPY package*.json .npmrc ./
RUN npm ci

COPY . .

# Vite build-time env(VITE_ 前缀会被自动注入)
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_SITE_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
ARG VITE_SITE_NAME
ENV VITE_SITE_NAME=$VITE_SITE_NAME
# 临时:智能写作「即将推出」门(见 src/shared/lib/feature-flags.ts)。'true' = 入口角标 + 页面蒙层。
ARG VITE_PRISM_COMING_SOON
ENV VITE_PRISM_COMING_SOON=$VITE_PRISM_COMING_SOON
# Umami 接入完全运行时化:index.html 加载后 fetch /api/v1/public/umami-config 拿
# website_id 再动态插入 tracker 脚本 —— 不再需要 build-time 注入 website id。
# 见 frontend-user/index.html 顶部注释 + backend internal/umami/client.go EnsureWebsiteID。

RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
