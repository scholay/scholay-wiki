# Build stage — slim (glibc) 避免 musl 下 rollup native binding 问题
FROM node:22-slim AS builder

WORKDIR /app

# 先装依赖,利用 Docker 层缓存
# .npmrc 指向 npmmirror(中国镜像),解决 docker 内网络 ECONNRESET
COPY package*.json .npmrc ./
# npm 下载缓存挂进 BuildKit 缓存卷:package.json 变化导致该层重建时,
# 依赖包走本地缓存增量补齐,不再全量重拉(node_modules 本身仍由 npm ci 全新生成,可复现性不变)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline

COPY . .

# Vite build-time env(VITE_ 前缀会被自动注入)
#
# 🔴 这里【只能】有与部署环境无关的东西。任何「每套环境不同」的值都不许走 build-arg ——
# Vite 在编译期把 import.meta.env.VITE_* 字面替换进 bundle,走 build-arg 就等于
# 「换域名 = 换镜像」,与「一套镜像 + 一份 .env 区分环境」的目标直接冲突。
#
# 站点身份(SITE_URL / Clarity ID / ICP / 标题前缀)全部走**运行时注入**:
# index.html 里留占位符,容器启动时由 docker-entrypoint.d/50-inject-site.sh 按 env 替换。
# Umami website id 同理(更早就运行时化了,走 /api/v1/public/umami-config)。
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# Runtime stage
FROM nginx:alpine

# 构建产物**暂存**在镜像里(不直接作 web root)。容器启动时由 40-sync-site.sh 合并进
# web root:index.html 等覆盖最新;/assets 下 hash 分包增量并入持久目录(挂
# ./data/frontend-assets)→ 发版后老标签页仍能拉到旧 chunk,避免「页面加载失败」。
COPY --from=builder /app/build /opt/dist
COPY nginx.conf /etc/nginx/conf.d/default.conf
# 编号即执行顺序(nginx entrypoint 按字典序跑 /docker-entrypoint.d/*.sh):
#   40 把 /opt/dist 同步进 web root(index.html 每次回到「带占位符」的原始态)
#   50 再按 env 把占位符替换成本环境的站点身份 —— 顺序反了会被 40 覆盖掉且不报错
COPY docker-entrypoint.d/40-sync-site.sh /docker-entrypoint.d/40-sync-site.sh
COPY docker-entrypoint.d/50-inject-site.sh /docker-entrypoint.d/50-inject-site.sh
RUN chmod +x /docker-entrypoint.d/40-sync-site.sh /docker-entrypoint.d/50-inject-site.sh

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
