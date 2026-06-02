# Agent egress 隔离(P0①b)

让 scholar_agent 的**所有出网都经过一个代理**:统一可观测、可随时收紧,且内网(mysql/redis/minio)不可达。
配合 P0①a(agent 已断开内网)构成两道闸。**不一刀切**:默认放行一切外部 HTTPS,只是都走代理。

## 两种模式(`EGRESS_FILTER_MODE`)

| 模式 | 行为 | 适用 |
|---|---|---|
| **open**(默认) | 放行**一切外部 HTTPS**(仍经代理 → 全量记日志);内网由网络拓扑 + `ConnectPort 443` 挡住 | agent 需请求任意互联网资源(WebFetch / 下载论文 / 数据集…)。capability-first,保留可观测 + 可随时锁紧 |
| **allowlist** | deny-by-default,只放行 `egress/filter` 里的域名(当前:deepseek、minicod) | 生产收紧外泄面。security-first |

切换:`EGRESS_FILTER_MODE=allowlist docker compose -f ... -f docker-compose.egress.yml up -d`。

## 组成

- `Dockerfile` / `tinyproxy.base.conf` / `entrypoint.sh` / `filter` —— 自 build 的 tinyproxy(CONNECT 隧道按 host 过滤,
  **不解密 TLS、不注入 CA**;`ConnectPort 443` 挡内网端口;`entrypoint.sh` 按 `EGRESS_FILTER_MODE` 决定 open/allowlist)。
- **直接写进 `docker-compose.yml` 和 `docker-compose.prod.yml`**(不是单独的 overlay 文件):两边都定义了 `egress-proxy` 服务、
  把 `scholar-agent-net` 设为 `internal: true`、给 agent 注入 `HTTPS_PROXY`。egress 是常开的(open 模式默认不影响能力)。

## 用法矩阵

egress 已是常开,正常 `up` 即生效;只用 `EGRESS_FILTER_MODE` 调松紧:

| 场景 | 命令 |
|---|---|
| 本地(open,默认) | `docker compose up -d` |
| 本地(严格 allowlist) | `EGRESS_FILTER_MODE=allowlist docker compose up -d` |
| 生产(open) | `docker compose -f docker-compose.prod.yml up -d` |
| 生产(严格 allowlist) | `EGRESS_FILTER_MODE=allowlist docker compose -f docker-compose.prod.yml up -d` |

> 想完全去掉这层(让 agent 直连 NAT)需编辑 compose(去掉 `scholar-agent-net` 的 `internal: true` 即可),
> 但 open 模式已等价于"全互联网可达",一般不需要。

## 已验证(本机,2026-06)

- ✅ proxy open/allowlist 两模式行为正确(open 放行 example.com;allowlist 只放 deepseek/minicod、拒 example.com 与内网端口)。
- ✅ **Bun 原生 fetch 自动尊重 `HTTPS_PROXY`**(实测:example.com 经代理被 allowlist 拒返 403,而非直连 200)。
- ✅ **minicod 改为直跑预装二进制**(`bun /app/node_modules/@minicod/mcp-server/dist/index.js`,见 `agent/preinstalled-mcp.json`),
  **不再用 `bunx`**——消除了运行时打 `registry.npmjs.org` 的依赖(实测 bunx 即便包已预装仍会打 registry)。
- ✅ **端到端**:在真实运行的 `scholar_agent` 容器内(`internal: true` + open 模式),minicod `search_papers` 经 egress 代理
  (proxy 日志 `Established connection to www.minicod.com:443`)返回**真实论文数据**(6009 字符,含 title/abstract)。
- ✅ 真实拓扑下:agent 直连公网失败(无 NAT)、经代理成功、`mysql:3306` 不可达。

> 关于 minicod 子进程是否走代理的"生死线"——**已解决**:minicod 用 Bun 原生 fetch,Bun 自动读 `HTTPS_PROXY`,
> 子进程继承该 env,故经代理出网。allowlist 模式下需保证 `egress/filter` 含 `minicod.com`(已含)。

## 切换上游模型 provider 的 SOP(仅 allowlist 模式需要,顺序不能反)

admin 改 `agent_config` base_url 会让 agent 立刻用新域名。**allowlist 模式下必须先改 `egress/filter` 再 push**,
否则新 provider 第一波请求被代理拒(而 `push_status` 仍显示成功,易误判):
1. 新域名加进 `egress/filter`;2. 重启/`kill -HUP` egress-proxy 重载;3. 再 push 新 provider 配置。
(open 模式无此问题,任意外部域名都放行。)
