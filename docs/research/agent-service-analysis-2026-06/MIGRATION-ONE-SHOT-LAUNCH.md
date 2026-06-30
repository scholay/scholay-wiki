# 一次性上线 · 历史数据迁移方案(4 feature 全切 executor)

> 结论先行:**不做批量数据搬迁、不在上线时删 fork。** 上线 = 部署新代码 + 一次性把 4 个 feature
> 全路由到 clean-room executor + **保留 fork 容器作只读回退**。老数据原地由 fork 服务,新数据走
> executor + 事件日志。fork 留到 soak 通过后再单独删(P6,不可逆)。

## 为什么不用批量搬迁(按 feature 的数据归属)

| feature | 用户可见数据的真源 | 切流后 |
|---|---|---|
| smart_search | 会话 transcript 在 **agent jsonl**(历史)/ 事件日志(新) | 新→journal;老→**fork 回退**(readHistoryFromJournal journal 空时读 fork)|
| claw | 同上(transcript agent-owned)+ 成果文件 ./out | transcript 同上;成果 turn 结束 harvest 落 **MinIO**(已持久,与 fork/executor 无关)|
| prism | 文件 + 文档 **真源在 DB**(latex_*);每轮 materializeProject 从 DB 物化进 cwd | **切流安全**(DB 真源;cwd 物化到 executor)|
| peerreview | 审稿报告 **真源在 DB**(peer_review_*) | **切流安全**(DB 真源;server-side 轮路由到 executor)|

→ prism / peerreview 的用户数据本就在后端 DB,切流不丢。只有 smart_search/claw 的**对话 transcript**
历史上是 agent-owned(jsonl),靠**保留 fork + 回退读**解决,无需搬迁。

## 已就位的迁移机制(全是惰性 / 原地,无停机)

1. **历史 transcript 回退**:`readHistoryFromJournal` / `seedHistoryFromJournal` 对 executor-routed
   feature,journal 无该会话事件(=切流前的老会话)→ 回退读 `b.client`(fork)jsonl。实测 user 57
   老会话 9fe5683f → 33 条(日志「served history from fork」)。**fork 在 = 老对话可读、可续聊。**
2. **标题后端拥有**(migration 0050:`agent_sessions.title`):hub 收 `session_title_updated`
   first-wins 落 DB;`ListSessions` DB 优先,DB 空则从 fork backfill 老 jsonl 标题进 DB(自愈)。
3. **思考过程**:新会话 thinking 已落 journal(batcher 合并);老会话 thinking 在 fork jsonl,
   经回退读返回 → 老/新都有思考过程。
4. **成果文件**:harvest 落 MinIO(持久),与执行后端无关。
5. **executor 配置自愈**:backend SyncOnce + 启动补推 + 60s resync,executor 重建 ≤60s 自恢复 active provider。

## 上线步骤(一次性,可秒回退)

1. 跑 migration(含 0050)→ `docker compose up -d --build backend agent-executor frontend-user`。
   **保留 `agent`(fork)容器不动。**
2. `.env`:`AGENT_TURN_JOURNAL=shadow`(必须,journal 是新历史源)、`AGENT_JOURNAL_VALIDATE=on`(可选)、
   `AGENT_EXECUTOR_BASE_URL=http://scholar_agent_executor:3456`、`AGENT_EXECUTOR_FEATURES=smart_search,claw,prism,peerreview`。
3. `nginx -s reload`(backend 换 IP 必做,否则 502)。
4. 验收 4 feature:新会话(标题/思考/工具/文件/历史)+ 点开老会话(回退读 fork)。
5. **soak 期**:新数据 executor+journal,老数据 fork 回退。观察 `journal_validate_mismatch`、
   executor 日志、parity。
6. **回退(任何异常)**:`AGENT_EXECUTOR_FEATURES=` 清空 → 4 feature 秒回 fork(executor 仍并存,零损)。

## 删 fork(P6,上线后、soak 通过、你点头才做,不可逆)

前置全满足才删:① 4 feature soak 无回归;② 老会话或已全部 aged-out 或已批量 backfill 进 journal;
③ 你确认。删法:compose 去 `agent` 服务 + 删 `agent/` 源 + 去 executor 临时 host 端口 3460。
**建议**:先停 `agent` 观察一周(老会话回退会失败=暴露依赖),无碍再删源。

## 可选增强(非必须)

- **预热标题 backfill**:上线后跑一次性脚本,对所有 user 调 ListSessions,把老 jsonl 标题一次性迁进 DB
  (否则首次列出该用户会话时才惰性 backfill)。
- **批量 transcript 搬迁**:若想上线即删 fork,需把 fork jsonl 全量折叠进 agent_turn_events(重活,
  且 fork 已 GC 的会话无法恢复)。**不推荐**——惰性回退 + 留 fork 更省、更稳。
