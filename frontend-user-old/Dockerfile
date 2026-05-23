# Build stage - use slim (glibc) to avoid musl native binding issues with rollup
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files and install with deterministic lockfile
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build arguments — Vite 在 build 阶段把这些 process.env.REACT_APP_* 替换进 bundle,
# 详见 vite.config.mjs 的 define 段和 src/config/site.ts。
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ARG REACT_APP_SITE_URL
ENV REACT_APP_SITE_URL=$REACT_APP_SITE_URL
ARG REACT_APP_SITE_NAME
ENV REACT_APP_SITE_NAME=$REACT_APP_SITE_NAME
ARG REACT_APP_SUPPORT_EMAIL
ENV REACT_APP_SUPPORT_EMAIL=$REACT_APP_SUPPORT_EMAIL
ARG REACT_APP_PDF_PREVIEW_ENDPOINT
ENV REACT_APP_PDF_PREVIEW_ENDPOINT=$REACT_APP_PDF_PREVIEW_ENDPOINT

# Build the application
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
