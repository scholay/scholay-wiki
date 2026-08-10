FROM nginx:alpine

# 把边缘路由配置纳入镜像内容寻址。直接 bind mount 配置时，
# `docker compose up -d --build` 无法感知文件内容变化，旧 Nginx
# 会继续使用未 reload 的路由。配置 COPY 变化会改变 image ID，
# Compose 因此必然重建容器并加载新配置。
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/
