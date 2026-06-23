# 部署核对清单 · 每日额度计数器的 Redis 持久性(R3)

> 背景:每日 token 额度的计数器(`quota:tokens:<uid>:<日>`)是 **correctness 键**,绝不能被 LRU
> 静默逐出 —— 一旦被逐出,用户已耗额度归零 = 免费续杯。它必须落在 **noeviction** 的专用 Redis 实例
> (`scholar_redis_persist`),而不是主实例(`scholar_redis`,`allkeys-lru`,会逐出)。
>
> 代码行为(`backend/internal/common/cache/redis.go:89`):配了专用实例就用它,**没配则静默回落主
> allkeys-lru 池**。所以「是否安全」完全取决于部署时 `REDIS_PERSIST_HOST` 有没有设。

## 现状(本仓库)

- `docker-compose.yml` 已带 `redis-persist` 服务:`--maxmemory-policy noeviction` + `--appendonly yes`(✅ 策略正确)。
- 线上 `docker compose ps` 可见 `scholar_redis_persist ... Up (healthy)`(✅ 实例在跑)。
- 但 `REDIS_PERSIST_HOST` 在 compose 注释里标的是「可选」—— **backend 是否真的连到它,取决于 `.env`**。

## 必须核对的 3 件事(线上 root@server 执行)

**① backend 是否真的连上了专用实例(最关键)**

```bash
# 启动日志里应有 "Redis persist instance connected";若是 "falling back to main Redis"
# 或根本没这行 → 说明没配,额度计数器正落在会被逐出的主池上。
docker logs scholar_backend 2>&1 | grep -i "persist"
# 期望: Redis persist instance connected  addr=scholar_redis_persist:6379
```

```bash
# 直接验:发生过用量后,额度 key 应出现在 persist 实例,而不是主实例。
docker exec scholar_redis_persist redis-cli KEYS 'quota:tokens:*'   # 期望:有键
docker exec scholar_redis        redis-cli KEYS 'quota:tokens:*'    # 期望:空
```

若 backend 没连上,在 `.env` 补:
```
REDIS_PERSIST_HOST=scholar_redis_persist
REDIS_PERSIST_PORT=6379
# REDIS_PERSIST_PASSWORD=...   # 如设了密码
# REDIS_PERSIST_DB=0
```
然后 `docker compose up -d backend`,再跑上面的 grep 确认。

**② 专用实例策略确实是 noeviction**

```bash
docker exec scholar_redis_persist redis-cli CONFIG GET maxmemory-policy
# 期望: maxmemory-policy  noeviction
docker exec scholar_redis_persist redis-cli CONFIG GET appendonly
# 期望: appendonly  yes
```

**③ 容量水位(noeviction 写满会返回 OOM 而非逐出 —— 宁可写失败也不静默丢)**

```bash
docker exec scholar_redis_persist redis-cli INFO memory | grep -E "used_memory_human|maxmemory_human"
# used 接近 maxmemory(128mb)时:调大 compose 里 redis-persist 的 --maxmemory,或排查键膨胀。
```

## 代码侧已做(本次)

`backend/internal/vip/quota.go`:当额度计数器所在 Redis 不可用(实例没配 / 连不上 / INCR 失败)时,
打一条**限流 WARN**(每分钟至多一条,避免刷屏):

```
billing: 每日额度计数器 Redis 不可用,配额暂时 fail-open(不强制)— ...
```

监控/排查:
```bash
docker logs scholar_backend 2>&1 | grep "额度计数器 Redis 不可用"
```
出现这条 = 此刻配额**不强制**(所有 AI 功能实质放行),账本(MySQL `llm_token_usage`)仍在记、可事后核账。
偶发(Redis 重启瞬间)可忽略;**持续出现**说明 persist 实例挂了或没配,按上面 ①②③ 排查。

## 残余取舍(刻意保留)

- Redis **完全宕机**期间,`CheckDailyQuota` 与 `AddUsage` 仍 **fail-open**(放行,不阻塞用户)。这是
  既定的「可用性优先」取舍 —— 不因配额设施故障而拒绝服务。现在这个窗口有 WARN 可见,不再是 DEBUG 静默。
  若未来要改成 fail-closed(Redis 挂就拒绝付费功能),是单独的产品决策,不在本次范围。
