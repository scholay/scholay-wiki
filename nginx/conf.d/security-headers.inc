# 安全响应头片段 —— 在任何「自带 add_header(因而不再继承 http 级安全头)」的 location 里 include。
#
# nginx 语义:一个 location 一旦声明任意 add_header,就【不再继承】http 块(nginx.conf)里的
# add_header。location / 、静态资源、/uploads/ 都因为各自声明了 Cache-Control 而丢光了安全头,
# 导致 SPA HTML 文档无 X-Frame-Options/nosniff,可被任意源 iframe 点击劫持(支付/充值页尤危)。
# 本片段把那 5 个头补回,与 nginx.conf 及 /api/ location 保持一致。
#
# 文件名用 .inc 而非 .conf,避免被 `include /etc/nginx/conf.d/*.conf` 当成 server 块自动加载。
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
