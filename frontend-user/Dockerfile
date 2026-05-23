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
# Umami 网站 ID —— 注入 index.html 的 data-website-id;留空时 tracker 不上报。
# admin /analytics 不再用 iframe (改成 backend HTTP API),所以没有 VITE_UMAMI_URL。
ARG VITE_UMAMI_WEBSITE_ID=""
ENV VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID

RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
