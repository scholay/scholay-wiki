# 模型目录化 + 用户自由选模型 + 能力绑定 + 7 天限额 —— 完整重构方案

> 2026-07-14 · 基于 10 路并行代码侦察(全链路 file:line 已核实)+ 6 路对抗性评审修订(46 个发现已整合,评审原文见同目录 critique 记录)
> 范围:backend(agentconfig / agentbridge / vip / llmusage / peerreview / prism)+ agent 容器 + frontend-user + 小程序

---

## 0. 需求还原

| # | 需求 | 现状差距 |
|---|------|---------|
| R1 | 模型不限 4 个槽位,后台随便配 N 个(100 个也行) | `agent_config` 单行表硬编码 4 列(main/haiku/sonnet/opus_model),横贯 DB→PushConfig→agent ModelSlots→resolveTier 全链 |
| R2 | 用户使用时自由选模型(Cursor 式) | 只有 claw 有侧边栏下拉,列表=4 槽位去重(常常只剩 2 条);选择存 localStorage,服务端全盲;smart-search/prism 无入口 |
| R3 | 部分能力固定绑定便宜快的模型,用户不可选(如审稿预填自动识别) | 审稿 meta 抽取=`fastModel()` 直读 `agent_config.haiku_model`,空值静默回退主模型(成本暗坑);标题/记忆抽取 hardcode `resolveTier("haiku")`;prism planner 传空 modelID 跑主模型 |
| R4 | 后台按模型配置:上下文大小、输入/输出/缓存价格 | 系统内无任何单价/上下文存放点;`llm_token_usage` 有 model 列但无成本列 |
| R5 | 按价格/限制做额度分配(用户走限额制) | 额度=raw token 统一池,不分模型——用便宜模型和贵模型扣一样的额度,定价信息无处生效 |
| R6 | 每日限额 → 7 天限额(不再有每日) | 日额度机制的物理根=Redis 日 key「跨 0 点换 key 即满血」,前后端 ~15 处「今日/00:00」文案 |

---

## 1. 现状全景(侦察结论摘要)

### 1.1 模型配置三层结构

```
【真源】backend DB agent_config 单行表
   base_url + api_key + 4 槽位(main/haiku/sonnet/opus_model) + enabled + push_status
   (0001_baseline.sql:45-60;agentconfig/model.go:29-43)
        │ PushConfig:upsert name="scholay-managed" provider → activate
        │ (agent/client.go:919-988;启动 SyncOnce + 8s 补推 + 60s 周期重推自愈)
        ▼
【缓存】agent 容器 providerStore(内存 + /home/bun/.executor/providers.json 轻持久化)
   ProviderConfig{baseUrl, apiKey, models: ModelSlots{main,haiku,sonnet,opus}}
        │ resolveTier(tier) = models[tier] || models.main   (models.ts:9-13)
        ▼
【运行时】per-WS-connection:ws.data.tier(默认 main)+ ws.data.modelOverride
   每轮 model = modelOverride || resolveTier(tier)   (turnLoop.ts:58)
```

- `set_runtime_config` 帧双通道:`tier`(白名单 4 值,backend hub 落 `agent_sessions.pinned_tier`)与 `modelId`(**任意字符串、零校验、hub 原样转发**)。
- **关键现状**:所有前端(web claw + 小程序)只发 `modelId` 不发 `tier` → pinned_tier(migration 0052)是**备而未用的半死代码**,生产库该列基本全空,可安全重定义。
- **现存安全洞**:用户可用 devtools 发 `set_runtime_config{modelId:"任意串"}` 直达上游 API(hub.go:844 无校验转发 + agent ws.ts:85 零校验)。目录化+按模型计费后这就是绕过限额的直接通道,**必须堵**。
- **现存计费 bug(评审新发现,P3 前置必修)**:accrueTurnUsage 的会话水位是进程内 sync.Map(bridge.go:65-71),而 agent 侧 session_total 常驻 agent 进程 —— **backend 每次发版重启,活跃会话的整段历史累计会被当成增量再扣一次额度**,残差全部落 "(reconciled)" 行。见 §5.4。

### 1.2 全部固定模型调用点(能力清单,R3 的绑定种子)

| 能力 | 入口 | 现模型来源 | 物理路径 | 要求 |
|------|------|-----------|---------|------|
| 审稿·预填识别(meta 抽取) | peerreview/service.go:1326 | fastModel()=haiku 槽 | agent WS serverside(会话内跑 pdftotext,**需 tool-use**) | 便宜快+JSON 可靠 |
| 审稿·信件起草 letter | service.go:1428 | fastModel()=haiku 槽 | 同上 | 便宜快 |
| 审稿·方法论+选审稿人 | service.go:610 | mainModel()=main 槽 | 同上 | 强推理 |
| 审稿·三审稿人盲评 | service.go:1687 | mainModel() | 同上 | 强推理 |
| 审稿·主审裁决 chief | service.go:1720 | mainModel() | 同上 | 强推理 |
| prism·写作画像 planner | prism/planner.go:117 | 传空→executor 默认 main(**降本点**) | serverside | 便宜 |
| 会话标题生成 | agent completion.ts:14 | hardcode resolveTier("haiku") | agent 容器内带外 | 便宜(正常计费) |
| 记忆抽取 extract_memory | agent ws.ts:124-143 | 同上 | 同上 | 便宜(SkipQuota) |
| 交互对话默认档 | FeatureSpec.DefaultTier | smart_search=haiku / claw=main / prism=main | agent WS 交互 | 用户可换 |
| 翻译 / 矩阵分析 / prism inline review / 公众号回复 | internal/ai(OpenAI 兼容) | third_party_accounts 的 model_low/mid/high | project 直连 | **另一套体系** |

> internal/ai 路径(翻译/矩阵/公众号)与 agent 体系是并行双轨:模型来自 `third_party_accounts` 账户池按档随机轮换,与 agent_config 零耦合。**本方案第一期不合并该轨**(合并需反转 thirdparty 选择逻辑,收益低),仅在目录表预留 `channel` 字段。

注意两处代码注释陷阱(评审核实,改造时顺手订正):
- ws_serverside.go:57 注释称 modelID「按 sessionId 持久」——不实,modelOverride 是 per-WS-connection,serverside 每次调用新开连接,**空 modelID = 跑 executor 默认主模型**而非「沿用上次」。P1 改造后所有 serverside 调用点必须显式传 Resolve 值。
- prism planner「传空跑主模型」正是上面机制的结果。

### 1.3 计费与额度链

- 账本:`llm_token_usage` 每次调用一行,**model + 4 类 token(input/output/cache_read/cache_creation)全齐**,admin 看板 ByModel/DailyByModel 聚合已是一等公民 —— **加权计费的数据基础已存在**。
- 额度扣减唯一路径:`llmusage.Record` → observer(签名只传 raw total,且有三重门:`UserID!=nil && total>0 && !SkipQuota`)→ `vip.AddUsage` → Redis INCRBY。
- 日额度:`quota:tokens:<uid>:<日>`(used,单调)+ `quota:base:<uid>:<日>`(窗口起点),判定 = used−base < DailyCeiling(tier);「每日满血」=跨 0 点自然换 key,无定时任务;TTL 25h。
- 12 个执法点 + 3 个预算盖章点全部收口在 `CheckDailyQuota / CheckDailyQuotaOverdraft / RemainingBudget` 三个函数,**判定口径收敛于 `tokenWindowUsed` + `DailyCeiling` 两个内部函数** —— 改 7 天窗口外部零改动。
- SS#2 预算盖章:hub 每条 user_message 盖 `{budget:{softRemaining,hardRemaining}}`(raw token 口径),agent 侧按 raw 4 类合计自配速+优雅收尾 —— 额度换加权口径后**必须反折算**,否则 agent 自配速与后端扣减错位。

---

## 2. 总体设计

### 2.1 设计原则

1. **目录只放 backend,agent 容器保持哑终端**。executor 已支持 per-connection `modelId` 覆盖且优先于 tier(turnLoop.ts:58),backend 在 hub(唯一咽喉)把「目录模型」解析成具体 modelId 下发即可。PushConfig 协议、providerStore 结构、resolveTier **全部不动**(tier 槽位退化为"系统内部档位",由绑定表喂值)。agent 侧唯一必要小改:接收 `contextWindow` 字段(见 §4.2-5)。
2. **一张目录表 + 一张绑定表**,分离「模型资产」与「谁在用」两个关注点;绑定 key 化(purpose),固定能力全部走绑定,用户可选面走目录的 `user_selectable` 过滤。
3. **额度单位升级为「加权 token」**(点数),单价配置在目录、换算收口在 llmusage.Record 内的 Pricer;raw token 继续完整落账本(统计/审计不失真)。
4. **7 天窗口 = 首次使用开锚周期**(已拍板):per-user anchor + 单桶 used/base,与现状日窗口机制完全同构(见 §6)。
5. **每步可独立上线、可回退**;先铺数据面(无感),再开用户面,最后切计费口径。

### 2.2 目标架构

```
admin 后台
 ├─ 模型目录 CRUD(N 行:model_id/展示名/上下文/四类单价/倍率/可选性/档位门槛)
 ├─ 能力绑定(purpose → 目录模型,含审稿 5 阶段/标题/记忆/planner/各 feature 默认)
 └─ agent 连接配置(保留:base_url + api_key + enabled + push_status)
        │
backend(权威)
 ├─ internal/modelcatalog(新):目录+绑定的 repo/service/cache + Resolve(purpose)
 ├─ PushConfig:据绑定生成 ModelSlots{main=系统主, haiku=系统快, ...} 推送(agent 零改动)
 ├─ agentbridge hub:
 │    ├─ sendInitialModel:校验后下发 pinned_model || Resolve("chat_default."+feature)
 │    ├─ set_runtime_config 帧闸:校验→重新组帧(绝不转发原始字节)→落 pinned_model
 │    └─ runtime_config_updated 广播帧(多端同步)
 ├─ peerreview:fastModel/mainModel → Resolve("peerreview.meta") 等
 ├─ llmusage.Record 内 Pricer:按目录单价算 weighted+cost 写账本行
 ├─ observer → vip.AddUsage(weighted)
 └─ vip:7 天滚动窗口(7 日桶求和)+ 加权口径 ceiling
        │
agent 容器(协议不动,仅 +contextWindow 消费)
 └─ modelOverride 优先 → 上游 API;槽位仅供 title/memory 等内部带外调用
        │
前端
 ├─ GET /api/v1/user/models(shared 层目录 DTO:展示名/上下文/倍率徽标/锁定态)
 ├─ Composer leftActions 统一 ModelSelector(三 feature 共用,Cursor 式)
 └─ 额度 UI 全面换 7 天口径文案
```

---

## 3. 数据模型(迁移 0063~0065)

> 编号与文件组织(评审修订):**每个迁移一个单文件**,内部按 表→索引→种子 顺序书写(先例:0061_skill_market.sql)。绝不能同编号拆 `_fields/_indexes/_defaults` 三文件——runner 按文件名排序,defaults 会先于 fields 执行直接 fatal。0061/0062 是未提交的 skill market 文件,**本方案分支必须在 skill market 合并之后再定稿编号**,否则撞号。

### 3.1 `agent_models` 模型目录(0063_model_catalog.sql)

```sql
CREATE TABLE IF NOT EXISTS agent_models (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  model_id        VARCHAR(200) NOT NULL,            -- 上游真实 model id(唯一;CRUD 层字符白名单 [A-Za-z0-9._:/-])
  display_name    VARCHAR(100) NOT NULL,            -- 用户可见名(录入约束 ≤16 汉字,选择器 trigger 截断考虑)
  description     VARCHAR(500) NOT NULL DEFAULT '',
  channel         VARCHAR(16)  NOT NULL DEFAULT 'agent', -- agent | project(预留 internal/ai 轨)
  context_window  INT NOT NULL DEFAULT 128000,      -- 上下文 token 数(下发 executor 供滑窗裁剪+水位条,见 §4.2-5)
  max_output      INT NOT NULL DEFAULT 0,
  price_in        DECIMAL(12,4) NOT NULL DEFAULT 0, -- 元 / 1M token,输入
  price_out       DECIMAL(12,4) NOT NULL DEFAULT 0, -- 输出
  price_cache_r   DECIMAL(12,4) NOT NULL DEFAULT 0, -- 缓存读
  price_cache_w   DECIMAL(12,4) NOT NULL DEFAULT 0, -- 缓存写
  billing_weight  DECIMAL(8,4)  NOT NULL DEFAULT 1, -- 计费倍率;admin 校验必须 ∈ [0.05, 100](堵除零/免费洞)
  speed_class     VARCHAR(16) NOT NULL DEFAULT 'balanced', -- fast | balanced | powerful(徽标)
  user_selectable TINYINT(1) NOT NULL DEFAULT 0,
  min_tier        VARCHAR(16) NOT NULL DEFAULT '',  -- ''=全员;pro/max=档位门槛(锁定+升级引导)
  enabled         TINYINT(1) NOT NULL DEFAULT 1,
  sort_order      INT NOT NULL DEFAULT 0,
  notes           VARCHAR(500) NOT NULL DEFAULT '', -- 内部备注,用户 DTO 绝不透出
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;   -- COLLATE 显式对齐全库(评审修订)

-- 同文件内:UNIQUE(model_id) + INDEX(enabled, user_selectable, sort_order)

-- 同文件内种子(评审修订,blocker 修复):目录必须先于绑定回填,否则 Resolve 全链失败。
INSERT IGNORE INTO agent_models (model_id, display_name, user_selectable, enabled)
  SELECT DISTINCT m, m, 1, 1 FROM (
    SELECT NULLIF(main_model,'')  AS m FROM agent_config WHERE id=1
    UNION SELECT NULLIF(haiku_model,'')  FROM agent_config WHERE id=1
    UNION SELECT NULLIF(sonnet_model,'') FROM agent_config WHERE id=1
    UNION SELECT NULLIF(opus_model,'')   FROM agent_config WHERE id=1
  ) t WHERE m IS NOT NULL;
```

要点:
- **`billing_weight` 是扣额度的唯一生效值**,四类单价是它的「说明书+换算器输入」。后台「按价格自动换算」= `(0.8×price_in + 0.2×price_out) ÷ 基准价`(**不用简单算术平均** —— 真实负载 input+cache 占 ~90%,平均价会反转贵贱排序,评审反例已核;权重比例可作 billing_config 旋钮),管理员可再手调。判定/扣减热路径只乘一个系数。
  - *为什么不四类分别加权扣减?* 账本层就是四类精算的(见 3.4),但**额度扣减用单系数**:用户心智「这个模型 ×3 消耗」(Cursor 同款);且预算盖章反折算在数学上只有标量权重才闭合(4 类分计无法映射回 agent 的 raw 自配速)。评审已核实:现状 raw 口径本就把 cache_read 按 1× 全额计,单系数是现状的严格保序延伸。残留失真(cache-heavy 功能额度燃烧 vs 真实成本偏离)由 admin 看板加 `weighted/cost 比值`列监控,失真过大手调该模型 weight 兜底。
- **weight 边界(评审修订)**:admin 保存校验 `0.05 ≤ billing_weight ≤ 100`;运行时兜底 `max(weight, 0.05)` —— 杜绝除零(盖章反折算)与「weight=0 完全免费不受窗口约束」。
- `min_tier` 实现「贵模型 Pro/Max 专属」的运营抓手,与加权计费互补。
- 单 provider 约束:第一期目录内所有 `channel='agent'` 模型必须是 `agent_config.base_url` 那一家能解析的 id(admin 页面加提示)。多 provider 后续扩展(`set_runtime_config.providerId` 已预留)。
- **种子 `user_selectable=1`(评审修订)**:老客户端 localStorage 里存的 modelId 恰好=槽位值=种子集,默认 0 会让存量用户 100% 被闸拒。
- 「试连」探测(admin 可选功能):model_id **只进 JSON body 绝不拼 URL**;CRUD 字符白名单同时防路径改写。

### 3.2 `agent_model_bindings` 能力绑定(同 0063 文件)

```sql
CREATE TABLE IF NOT EXISTS agent_model_bindings (
  purpose     VARCHAR(64) PRIMARY KEY,
  model_id    VARCHAR(200) NOT NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 种子(在目录种子之后):便宜档 COALESCE 到主档,全空则不插行(Resolve 走终极回退)
INSERT IGNORE INTO agent_model_bindings (purpose, model_id)
  SELECT p.k, COALESCE(NULLIF(c.haiku_model,''), NULLIF(c.main_model,''))
  FROM agent_config c, (SELECT 'system.fast' k UNION SELECT 'peerreview.meta' ...) p
  WHERE c.id=1 AND COALESCE(NULLIF(c.haiku_model,''), NULLIF(c.main_model,'')) IS NOT NULL;
-- main 档 purpose 同理取 NULLIF(main_model,'')
```

初始 purpose 全集:

| purpose | 消费点(改造后) | 迁移初值 |
|---------|----------------|---------|
| `system.main` | PushConfig 填 agent 槽位 main/sonnet/opus(兜底+带外) | main_model |
| `system.fast` | PushConfig 填 agent 槽位 haiku(标题/记忆抽取) | haiku→main |
| `chat_default.smart_search` | sendInitialModel 默认 | haiku→main |
| `chat_default.claw` | 同上 | main_model |
| `chat_default.prism` | 同上 | main_model |
| `peerreview.meta` | 预填识别(替代 fastModel) | haiku→main |
| `peerreview.letter` | 信件起草 | haiku→main |
| `peerreview.methodology` | 方法论+选审稿人 | main_model |
| `peerreview.scoring` | 三审稿人盲评 | main_model |
| `peerreview.chief` | 主审裁决 | main_model |
| `prism.planner` | 写作画像(现在白烧主模型,**立省**) | haiku→main |

**Resolve 语义(评审修订,回退链必须有终点)**:
1. 绑定存在且目录行存在(**不过滤 enabled——计价与解析用 `Get(modelID)` 含停用行**,enabled 只约束选择器与 hub 闸)→ 返回;
2. 绑定缺失/指向无效 → 回退 `system.main` 绑定;
3. `system.main` 也无效 → **终极回退读 `agent_config.main_model` 列**(列保留,行为=现状);
4. 每次回退 `slog.Warn` + admin 绑定页把「处于回退态」的 purpose **标红**(对比绑定值与实际返回值,数据现成)—— 消灭 fastModel 静默升档暗坑的同时,自己不能再造静默回退。
- 30s 内存缓存(照抄 vip.ConfigService),WS 热路径零 DB 查询;**缓存 miss 不打 DB 回源到同步请求路径**(internal/ai 的 Record 是同步链)。
- `FeatureSpec.DefaultTier`(spec.go:206)废弃,由 `chat_default.*` 绑定替代 —— per-feature 默认从「编译期常量」变「admin 可配」。
- **绑定行不支持删除**(admin 只能改指向):INSERT IGNORE 种子在重启重放时会复活被删行,与其加删除墓碑不如禁删,11 个 purpose 是闭集。
- **fresh install**(agent_config 从未配置):种子为空集,Resolve 走终极回退也为空 → admin 后台「模型目录」页作为新装机第一步引导(空目录时 AgentConfigPage/目录页顶部横幅提示),行为与现状「未配置 agent 就不可用」一致。

### 3.3 billing_config 扩展(0064_weekly_quota.sql)

```sql
CALL add_column_if_not_exists('billing_config','free_window_tokens','BIGINT NOT NULL DEFAULT 0');  -- 7天窗口基准(加权 token)
CALL add_column_if_not_exists('billing_config','window_days','INT NOT NULL DEFAULT 7');
CALL add_column_if_not_exists('billing_config','base_price_per_m','DECIMAL(12,4) NOT NULL DEFAULT 0'); -- weight 换算锚点
UPDATE billing_config SET free_window_tokens = free_daily_tokens * 7 WHERE free_window_tokens = 0;
```

- **幂等哨兵用 DEFAULT 0 + WHERE=0**(评审修订:原设计 DEFAULT 1400000 恰好等于 200000×7,重放永真,admin 改过的值会被每次重启覆写)。
- `free_daily_tokens` 列**保留不删**(回滚兜底),代码不再读。
- `WindowCeiling(tier)` 替代 `DailyCeiling(tier)`,倍率(Pro=×5、Max=×25)沿用。

### 3.4 账本快照列(0065_llm_usage_cost.sql)

```sql
CALL add_column_if_not_exists('llm_token_usage','weighted_tokens','BIGINT NOT NULL DEFAULT 0');
CALL add_column_if_not_exists('llm_token_usage','cost_micro_yuan','BIGINT NOT NULL DEFAULT 0'); -- 四类单价精算快照(微元),调价不漂
```

### 3.5 会话锁定(同 0063 文件)

```sql
CALL add_column_if_not_exists('agent_sessions','pinned_model','VARCHAR(200) NOT NULL DEFAULT ''');
CALL add_column_if_not_exists('agent_sessions','usage_watermark','VARCHAR(120) NOT NULL DEFAULT ''); -- P3 前置:计费水位持久化,见 §5.4
```

- `pinned_tier`(varchar16,装不下真实 model id)弃用不删;生产基本全空,无数据迁移。

### 3.6 agent_config 的去留

**保留单行表,职责收窄为「连接配置」**:base_url / api_key / enabled / push_status 族继续用(PushConfig 自愈链、推送状态观测面全部不动)。4 个模型槽位列保留(main_model 兼任 Resolve 终极回退),admin 页面移除输入框,推送值改由绑定表生成:

```
PushConfig payload.models = {
  main:   Resolve("system.main"),
  haiku:  Resolve("system.fast"),
  sonnet: Resolve("system.main"),   // 兼容填充,agent resolveTier 永不落空
  opus:   Resolve("system.main"),
}
```

agent 容器 providerStore/models.ts/completion.ts **原样不动**,标题/记忆抽取自动吃到 `system.fast` 绑定。绑定或目录变更后,复用 `agentconfig.Service.pushAsync` 触发推送。

---

## 4. 各链路改造

### 4.1 新模块 `backend/internal/modelcatalog`

标准四件套(model/repository/service/handler),约 700 行:
- Service:`List(onlyEnabled)` / `ListSelectable(tier)` / **`Get(modelID)`(含停用行,计价/解析专用)** / `Resolve(purpose)` / `ValidateUserModel(userID, modelID)` / CRUD / 绑定读写;全带 30s 缓存 + 写后失效。
- admin 路由:`GET/POST/PUT/DELETE /api/v1/admin/models`、`GET/PUT /api/v1/admin/model-bindings`;变更后触发 agentconfig.pushAsync + **遍历活跃 hub 重发受影响会话的模型帧**(见 §7.1)。
- 用户路由:`GET /api/v1/user/models` → `[{model_id, display_name, description, context_window, speed_class, billing_weight, locked, is_default}]`。**不透四类单价、不透 notes**;billing_weight 出口量化到 0.25 粒度(4 位小数会精确泄露上游价格比例)。
- bootstrap 注入:agentbridge、peerreview、prism、agentconfig、llmusage(Pricer)。

### 4.2 agentbridge(hub 是唯一咽喉)

1. **sendInitialTier → sendInitialModel**(hub.go:277-299):
   - `effective = row.PinnedModel || Resolve("chat_default."+feature)`;
   - **pinned_model 必须过 `ValidateUserModel`(含 min_tier×EffectiveTier)**(评审修订:否则会员到期后贵模型永续可用)——失效则清 pinned 落库 + 用默认;
   - **写失败比照 seed 做 3 次重试**(现状 sendInitialTier 失败仅 Debug 丢弃;P3 后丢帧=盖章 weight 与实跑模型错位,必须收紧);
   - peerreview(serverside 自管)不变。
2. **readLoop set_runtime_config 闸**(hub.go:836-847)重写:
   - 解析 → `ValidateUserModel` → 合法:`SetPinnedModel` 落库(**落库失败=拒帧回 error,不转发**,保证 DB 与 executor 强一致)→ **重新 json.Marshal 只含白名单字段的新帧**(评审修订:绝不转发浏览器原始字节 —— 混合帧 `{tier:"main", modelId:"任意串"}` 会以 tier 路径过闸把未校验 modelId 带进 agent;canonical model_id 也在此统一)→ 转发;
   - **「切回默认」语义(评审修订)**:前端发 `{modelId:"", useDefault:true}` → hub 清 pinned_model → 下发 `chat_default` 解析出的具体 id(executor 零改动;不定义此语义则 pinned 一旦写入永不解除,admin 换默认对老会话永不生效);
   - 非法:兼容期(≥1 个小程序强更周期)**静默降级为默认模型转发 + 限流 WARN,不回 error 帧**(评审修订:老 web bundle/小程序每次重连自动重发 localStorage 里的 modelId,回 error 会让存量用户凭空弹错误气泡);兼容期后转严格拒绝 + `model_not_allowed` error 帧;
   - `tier` 字段兼容:映射到对应绑定后**只转发、不落 pinned_model**(评审修订:落库会把 user_selectable=false 的系统模型 pin 进会话,成为旁路),一个发版周期后删。
3. **多端同步(评审修订)**:校验通过后 hub 合成 `runtime_config_updated{modelId}` 走现成 `broadcastAgent`(含 replayBuf)广播给所有订阅者;`addSubscriber` 迟到补帧带上当前 effective model —— B tab 选择器实时跟随,hub 重建后前端也有感知。
4. **user_message 前轻量重校验**:PreUserMessage 同一跳对 pinned_model 做 30s 缓存校验(enabled + min_tier),失效→主动补发默认模型帧 + 清库 —— 覆盖「常开 tab 永不重连」的活连接(评审:hub 被订阅者保活可无限期存活,懒清理不够)。
5. **contextWindow 下发(agent 侧唯一必要小改)**:hub 下发模型帧时附 `contextWindow`(目录值),executor 存 `ws.data.contextWindow`,替代全局 `EXECUTOR_CONTEXT_WINDOW=128000` 用于 H5 滑窗裁剪触发线(ws.ts:218-228)与 inspection 水位(http.ts:262-272)—— 否则 64k 小上下文模型会先撞上游墙、200k 模型被提前裁剪、ContextMeter 百分比全错。缺省回落全局 env。
6. **盖章时点(评审修订)**:预算反折算的 weight **每条 user_message 现读 hub 内存态**(随 set_runtime_config 帧同步更新,写帧与盖章同走 h.mu),不用建连快照;多 tab 并发换模型的错位≤1 轮,透支带兜底。
7. `FeatureSpec.DefaultTier` 删除,替换为 catalog 注入。

### 4.3 peerreview / prism

- `fastModel()/mainModel()`(service.go:152-175)删除,5 个调用点改 `s.catalog.Resolve("peerreview.meta")` 等;**所有 serverside 调用点显式传值,不得依赖空串**(空=executor 默认主模型,见 §1.2 注释陷阱)。
- prism planner(planner.go:117)传 `Resolve("prism.planner")`,立收降本。
- meta 抽取 step_cache fingerprint 纳入模型 id(`assets_revision + ":" + modelID`),换绑后强制重抽。

### 4.4 前端

1. **shared 层新 API**:`shared/api/models.ts`(useModels,staleTime 5min)。`/user/claw/models` 透传端点**保留为目录→旧 DTO 形状的 shim**(评审修订:老 web bundle 与小程序都在调,直接下线=404),小程序覆盖完成后再删。
2. **统一选择器**:`shared/components/chat/ModelSelector.tsx`,挂 Composer `leftActions` 插槽。**信息密度(评审修订)**:trigger 只留短名 truncate(移动端仅图标),speed/×N/锁定徽标全部下沉到下拉项;display_name 后台录入约束 ≤16 字。
3. **smart-search / prism 接入**:各自 ClientMessage union 加 `set_runtime_config` arm + 消费 `runtime_config_updated`。
4. **状态服务端化**:per-session 真源=pinned_model,删 localStorage per-session map + onOpen 重发 + transferNewConversationModel;**但保留「新对话默认模型」用户级偏好**(评审修订:现有产品语义两处注释明文要求跨刷新粘性;保留单个 localStorage 键,载入时对目录校验、失效丢弃)——新对话:偏好作为首帧 set_runtime_config 发出,服务端校验落 pinned。
5. claw 旧侧边栏选择器移除;friendlyDesc 硬编码映射删除;**ContextMeter 的 model 字符串经目录映射成展示名**(context DTO 或前端 models 缓存映射,否则水位条与选择器两套名字)。
6. 移动端 + 小程序:**小程序不能再假设 `models[0]`=默认**(claw.ts:925/942),改读 `is_default`;friendlyDesc 硬编码同步清理;`model_not_allowed` 需静默降级分支(兼容期 hub 不发该帧,新版小程序先上分支再收严)。

### 4.5 admin 前端

- 新页 `ModelCatalogPage`(CRUD + 倍率「按价格换算」按钮 + 试连)+ 绑定 Tab(11 purpose 下拉,**回退态标红**)。
- `AgentConfigPage` 收窄:去掉 4 槽位输入框。
- `BillingConfigPage`:free_window_tokens(「7 天额度」)。
- llmusage 看板:加 `SUM(weighted_tokens)`、`SUM(cost_micro_yuan)`、**weighted/cost 比值监控列**。

---

## 5. 计费改造(加权额度)

### 5.1 单位定义

- **额度单位 = 加权 token(点数)**。`weighted = round(raw_total × billing_weight(model))`;raw_total 沿用现口径(4 类合计)。
- 展示:额度条数字量纲不变("7 天额度 140 万"),选择器标 ×0.5 / ×1 / ×3。
- 账本精算:`cost_micro_yuan = Σ(4 类 tokens × 对应单价)`(看板核账用,不参与额度)。

### 5.2 计算收口(评审修订:Pricer 进 Record,不挂 observer)

1. **`llmusage.Service` 注入 Pricer 接口**(modelcatalog 实现):`Record()` 内、**observer 三重门之前**统一算 `weighted + cost` 写进行 —— 这样 SkipQuota(记忆抽取)与 UserID=NULL(公众号)的行也有成本快照(原设计挂 observer 会让最需要核账的系统开销行恒为 0)。目录 miss:只走缓存兜底 weight=1 + 限流 WARN,不回源 DB(internal/ai 的 Record 在同步请求路径上)。
2. **observer 契约**:`func(userID uint, totalTokens int)` → `func(userID uint, weightedTokens int64)`;bootstrap 闭包只剩 `vip.AddUsage(ctx, userID, weighted)` 一件事。
3. **预算盖章反折算**:`RemainingBudget()` 返回加权余量 → hub 除以 `max(会话 weight, 0.05)` 盖 raw 口径章 → agent 自配速零改动。数学已评审核实:agent rawSpent 与后端 raw×weight 同口径,除同一 weight 后两侧闭合,负余量除法保号。

### 5.3 补差行计价(评审修订:从「顺手改」升级为 P3 硬前置)

- `accrueTurnUsage` 增加 `sessionModel` 参数(交互路 hub 传 effective model、serverside 传本轮注入的 modelID):**`len(rows)>0` 的残差分支同样用它计价**(现代码只在无明细时才填模型,有任一明细则残差恒为 "(reconciled)")。
- 堵掉「断线降价通道」:用户在贵模型出答案期间断开 WS(message_complete 丢失),重连后残差落补差行——若按 weight=1 计,这是可重复操作的绕过倍率手段。按 sessionModel 计价后该通道关闭;跨模型切换时残差归属仍可能错一轮(A 模型丢失量记到 B),量级有界、接受。
- peerreview serverside 整轮兜底(chatUsageToAgentUsage model 留空)同改。

### 5.4 水位持久化(评审新发现的存量 bug,P3 硬前置)

- 现状:计费水位是 backend 进程内 sync.Map,agent 侧 session_total 跨 backend 重启存活 → **backend 每次发版,活跃会话的全部历史累计被当增量重复扣一次额度**(残差全进 "(reconciled)")。今天已在多扣,P3 加权后失真放大。
- 修法:`agent_sessions.usage_watermark` 列(§3.5),message_complete 后异步写 `[4]int64` 水位;进程内 map 作缓存,启动/首帧 miss 时从 DB 读。写失败容忍(至多回到现状)。

### 5.5 不做的事

- 不按模型分池限额(key 空间 ×N、12 个执法点全要带模型参数);单池+倍率已表达"贵模型烧得快"。
- internal/ai 轨第一期不加权(其模型本就最便宜档,目录 miss 按 1 兜底=现状)。后续并轨单独立项。

---

## 6. 7 天窗口(✅ 已拍板 2026-07-14:**首次使用开锚的 7 天周期**)

### 6.1 定案语义

Claude 同款:用户第一次消耗额度的那一刻**开表**(anchor),此后 7 天为一个窗口,窗口内累计消耗与上限比较;**到期一次性满血**;到期后并不自动开新窗——**下一次实际消耗**时才重新开锚。展示上:无有效 anchor(从未用/已到期)= 满血、显示「额度将在下次使用时开始计时」;窗口内 = 显示「本周期额度将于 X 月 X 日 HH:MM 重置」。

> 相比初稿的「过去 7 天滑动求和」,锚定周期**大幅简化**:单桶 used/base 与现状日窗口机制完全同构,评审 window7 维度的负残值放水、逐日快照、MGET 14 key、fallback 环形桶等问题全部消失。代价是「烧完要等到期」,由花经费重置兜底。

### 6.2 机制(全部在 vip 包内部,12 个执法点签名不动)

- **Key 结构**:`quota:anchor:<uid>` = 窗口起点 unix 秒;`quota:tokens:<uid>:<anchor>`(used,单调)与 `quota:base:<uid>:<anchor>`(重置基线)——**key 名从含日期改为含 anchor,used/base 双桶机制原样平移**。TTL 全部 8×24h(anchor 桶、used、base 三处;原 25h)。
- **懒开窗/懒滚动**:读路径(Check/Budget/Overview)GET anchor,`now ≥ anchor+7d` 或不存在 → 按「零消耗满血」处理,**不写 anchor**;唯一开窗点在 `AddUsage`(实际消耗发生):无有效 anchor 时用 **Lua CAS 原子换锚**(`若 anchor 不存在或过期则 SET now`,输者重读赢者的 anchor),再 INCR 新窗 used。多实例并发安全,旧窗 key 靠 TTL 自然过期。
- **重置(花经费满血)**:`base := used` 单桶 Set —— **与现状完全同构**,双层锁+resetNotNeeded 双判原样保留;Redis 不可用时 `resetInternal` **直接返回友好错误、不扣经费**(评审修订:现状「降级期扣钱不解锁」bug 在 7 天周期下会从卡 1 天变卡 7 天,必须先修)。
- **升级满血 ResetBaselineOnUpgrade**:`base := used` 原样;跳过条件改「窗口内用量 ≤0」;anchor 不动(窗口期不因升级顺延)。
- **透支带**:`max(WindowCeiling×15%/7, 200_000)`(保持「单轮收尾」量级);「窗口到期透支归零不结转」语义与现状日窗口一致,无行为漂移。
- **越线观测**(AddUsage prevWin/curWin):单桶算术原样,仅 ceiling 换 `WindowCeiling`。
- **consumed_today(今日消耗统计)**:日 key 没了,AddUsage 顺手双写一个 `quota:day:<uid>:<日>` 统计 key(TTL 25h,纯展示);热力图本就走 MySQL 账本,不受影响。
- **fallbackCounter**(Redis 挂的进程内兜底):加 per-user 进程内 anchor(首次记数时间),同样 7 天滚动;进程重启丢失=现状同性质。
- **上线冷启动**:全员无 anchor → 下次使用才开窗,人人满血起步,**无放水争议、无需回填**(锚定形态的额外红利)。

### 6.3 DTO 与文案

- `TokenStatus` 扩展:`used/ceiling/percent`(窗口口径,字段名不变)+ `window_days:7` + **`window_started_at` / `window_reset_at`**(未开窗=null;「什么时候恢复」有了精确到分钟的确定答案,比滚动形态更好表达)+ `consumed_today` 保留(统计 key)。
- 超限文案单源:「本周期(7 天)AI 额度已用完,将于 X 月 X 日 HH:MM 自动重置;也可消耗 N 经费立即重置。」(动态日期时刻)。
- 前端「今日/00:00/明日再来」全量清扫(侦察已列全):QuotaNotifier、quota-toast 3 条 PRESETS、account-assets-card、MobileAssetsCard、PricingPage/plan-card/subscribe-dialog/PromoModal、admin BillingConfigPage/TokenQuotaBar、claw MessageTurn:209、**smart-search AssistantTurn:47「明日再来」必改**(改「X 日 HH:MM 恢复」)、小程序 me 页+agent-socket(quota 正则 `/额度|quota/` 兼容已核)。
- **50%/80% 阈值提醒**:去重粒度从 warnDay 改按 anchor(每窗口每档一次)——锚定周期下有天然窗口标识,滚动形态的回滞带复杂度消失。
- 热力图:日格数值与参考线**统一加权口径**(评审修订:P3 后 raw 格子 + 加权参考线自相矛盾);`daily_ceiling` → `daily_reference = ceiling/7`;`consumed_today` 同步切加权并统一命名「点数」。
- **quota_exceeded 自救引导**:blocked 卡与重置弹窗在「当前模型 weight>1」时加「切换省额度模型后重发」动作;会话消耗归因:usage/context DTO 透出本轮加权消耗。
- 重置定价:✅ 已拍板 —— **沿用后台旋钮 `reset_cost_credits`(billing_config,admin 随时可调)**,不写死;上线时 owner 自定初值(参考:一次重置=刷满整个 7 天窗口,价值 ≈7× 原日重置)。

---

## 7. 安全与一致性

1. **modelId 注入洞必堵**(P2 上线同时):闸 + 重组帧 + sendInitialModel 校验 + user_message 前 30s 缓存重校验(§4.2)。目录下架:admin 侧变更时**遍历活跃 hub 主动补发默认帧**(writeAgent 现成、成本极低),懒清理只作兜底 —— 活连接可被订阅者无限保活,纯懒清理会让下架模型无限期继续跑。
2. **min_tier 回收**:会员到期(EffectiveTier 回落)由 sendInitialModel + user_message 前重校验双覆盖;计费本身不受影响(按 agent 上报真实 model 加权)。
3. **enabled=false 残留**:agent providers.json 残留旧配置继续跑 —— 目录/绑定变更必推送覆盖(60s resync 自愈)+ 主动补发帧。
4. **推送最终一致性**:绑定变更 → pushAsync;失败 push_status=failed 可见;窗口 ≤60s(影响面=标题/记忆抽取旧模型)。
5. **多实例**:catalog 30s 缓存与 billing_config 同款;Redis 键结构不变(数量×7);重置锁语义在逐日 Set 下退回「无害重复」,跨 0 点锁缝隙无害化。
6. **回滚**:
   - P1/P2:回代码即可,数据无损(迁移只加不删)。
   - **P3 回滚有 Redis 单位混杂期**(评审修订,初稿「数据无损」不成立):加权运行一周后 7 天桶里是加权值,回 raw 口径读同一批桶 → weight>1 用户被虚增用量最长 7 天。回滚 runbook 必须附一次性修复脚本:从 `llm_token_usage`(raw 4 类全齐)按 user 聚合近 7 天**覆写** used 桶、清 base 桶(事故模式豁免「used 单调」不变量);或明确接受+公告余额跳变。正向切换时刻同样有混杂(存量桶 raw + 新增加权,方向=少扣),声明接受。
7. **契约测试**:重录 `vip-overview.json`(+window_days/next_release_*)、`ws-error-quota.json`(7 天文案;code 不变);**新增** `/user/models` DTO schema+fixture 与 `model_not_allowed` error 帧契约(驱动 UI 分支的契约必须进 tests/contract)。

---

## 8. 分期实施

| 期 | 内容 | 用户可感知 | 规模 |
|----|------|-----------|------|
| **P1 目录数据面** | 迁移 0063(目录+绑定+种子+pinned_model+watermark 列);modelcatalog 模块;PushConfig 改吃绑定;peerreview 5 点 + planner 换 Resolve(显式传值);admin 目录/绑定页;AgentConfigPage 收窄 | 无感(行为等价,planner 立省) | 后端 ~900 行 + admin ~700 行 |
| **P2 用户选模型** | hub 闸(重组帧+兼容期静默降级)+ sendInitialModel(校验+重试)+ runtime_config_updated 广播 + unpin 语义 + contextWindow 下发(agent 小改);/user/models;统一 ModelSelector 进三 Composer;新对话偏好保留;小程序适配;/user/claw/models shim;**堵注入洞** | 三个对话 feature 出现 Cursor 式选择器 | 后端 ~400 行 + agent ~40 行 + 前端 ~800 行 |
| **P4 7 天窗口** | 迁移 0064;vip 包窗口改造(anchor 懒开窗 Lua CAS/单桶 used-base 平移/TTL 8d/consumed_today 统计 key);DTO 扩展(window_started_at/window_reset_at);前端+小程序全量文案;阈值提醒按 anchor 去重 | 「每日额度」→「7 天周期额度」(**单独公告,纯利好叙事:总量不变更灵活,人人满血起步**) | 后端 ~350 行 + 前端文案清扫 |
| **P3 加权计费** | 迁移 0065;Pricer 进 Record;observer 换 weighted;补差行 sessionModel 计价;**水位持久化**;盖章反折算;看板成本列;倍率徽标生效;**上线约束:所有 chat_default 绑定模型 weight 必须=1**(不动设置的老用户零体感,申诉面收敛为主动选 ×N 的知情用户) | 选贵模型烧额度快(与 P2 选择器叙事绑定公告) | 后端 ~400 行 |

依赖:P2 依赖 P1;P3 依赖 P1(单价)+建议后于 P2(有选择器才有「知情选择」);P4 独立。**推荐顺序 P1→P2→P4→P3**,P4 与 P3 分开公告(评审修订:合并公告会让利好被利空淹没、额度突变归因混杂无法拆解客服)。

> **✅ P3 已于 2026-07-14 完成并部署验证(四期全部交付)**:迁移 0065;Pricer 进 Record(SkipQuota/匿名行也有成本快照);observer 换加权口径;水位持久化接线(修发版重复扣费存量 bug);补差行按会话模型计价;盖章反折算;admin 聚合加 weighted/cost。实测(flash 临时 ×0.5+定价):真实消息 12513 raw → 6257 加权入额度、成本 25110 微元精确命中、水位落库。上线真实定价前 chat_default 绑定保持 ×1。
>
> **✅ P2 已于 2026-07-14 完成并部署验证**:hub 权威闸(重组帧,注入洞已堵)+ pinned_model + runtime_config_updated 多端广播 + unpin + contextWindow 下发;三 feature composer 选择器上线;claw localStorage 旁路删除。WS 端到端四场景实测通过(默认下发/切换落库/伪造 id 静默降级/unpin 清库)。
>
> **✅ P4 已于 2026-07-14 完成并部署验证**:迁移 0064;quota.go 重写为锚定窗口(anchor Lua CAS 唯一开窗点=AddUsage;读路径到期只视为满血);三闸门名/签名不变;透支带按日均;重置在 Redis 不可用时拒绝不扣费(修存量 bug);DTO+window_started_at/window_reset_at;前端+小程序全量文案清扫;契约 fixtures 更新。实测:未开窗满血 → 模拟超限 → WS 拒绝帧带「本周期…将于 X月X日 HH:MM 自动重置」动态文案;集成测试全绿(含到期换锚场景)。
>
> **✅ P1 已于 2026-07-14 完成并部署验证**:迁移 0063 执行成功(2 模型入目录、11 绑定种子正确);push_status=success;executor providers.json 实测拿到绑定解析槽位(main/sonnet/opus=pro、haiku=flash —— sonnet 槽从 flash 变 pro 是设计行为,该槽无实际消费者);admin「模型目录」页(/admin/model-catalog)上线,AgentConfigPage 收窄为连接配置。附带行为增强:prism planner 从主模型降到 prism.planner 绑定(立省);peerreview meta 的 step_cache fingerprint 纳入模型 id(换绑强制重抽);agentconfig repo 不再写 4 模型列(冻结为终极回退)。

---

## 9. 决策记录(2026-07-14 owner 已拍板)

| # | 决策 | 结论 |
|---|------|------|
| 1 | 额度是否按模型加权 | ✅ **做加权**(billing_weight,×N 徽标;chat_default 绑定恒 ×1 保老用户体感) |
| 2 | 7 天窗口形态 | ✅ **首次使用开锚的 7 天周期**(第一条消息开表、到期满血、下次使用重新开锚;非滑动求和) |
| 3 | 重置经费定价 | ✅ **走后台旋钮 `reset_cost_credits`,owner 自定**(admin 计费配置页随时可调) |
| 4 | 实施 | ✅ **按 P1→P2→P4→P3 开工** |

未再上会的次级决策(按方案推荐执行,均可后改):会话中途换模型=允许(claw 现状);internal/ai 轨第一期不并(channel 字段预留);chat_default 不分档(单值绑定 + weight=1 约束,后续需要时 purpose+tier 复合键扩展)。

---

## 10. 风险清单

| 风险 | 缓解 |
|------|------|
| 弱模型跑审稿 meta(需 tool-use+严格 JSON)重试率升高反增本 | 绑定页标注能力要求;已有 2 次 JSON 重试+5min 超时护栏;换绑后看 ByModel 用量 |
| 加权后 agent 自配速与后端口径错位 | §5.2-3 反折算 + weight clamp + 盖章现读内存态;透支带兜底 |
| backend 发版重复扣费(存量 bug) | §5.4 水位持久化,P3 硬前置(建议尽早单独修) |
| 断线丢 message_complete 的残差降价 | §5.3 补差行按 sessionModel 计价 |
| 老客户端(小程序周级存活)被闸误伤 | 兼容期静默降级+种子 user_selectable=1+shim 端点 |
| 迁移排序/种子缺失导致全 agent 停摆 | 单文件迁移 + 目录先于绑定种子 + Resolve 终极回退到 agent_config.main_model |
| anchor 换锚并发(多实例同时发现过期) | Lua CAS 原子换锚,输者重读;旧窗 key TTL 自然过期 |
| 目录误配(上游不存在的 id) | admin「试连」(id 只进 body)+ Resolve 回退标红 |
| P3 回滚单位混杂 | §7.6 回滚 runbook + 修复脚本 |
