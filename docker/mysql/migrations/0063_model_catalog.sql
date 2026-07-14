-- ============================================================================
-- 0063: 模型目录化 P1(方案:docs/research/model-catalog-2026-07/REPORT.md)
-- ----------------------------------------------------------------------------
-- agent_models          模型目录(N 行取代 agent_config 4 槽位;上下文/四类单价/计费倍率/可选性)
-- agent_model_bindings  能力绑定(purpose → 模型;审稿 5 阶段 / 标题记忆 system.fast / 各 feature 默认)
-- agent_sessions        +pinned_model(P2 用户选模型锁定;pinned_tier varchar16 装不下 model id,弃用不删)
--                       +usage_watermark(P3 前置:计费水位持久化,修 backend 重启重复扣费)
--
-- 铁律(评审修订):
--   · 单文件按 表 → 索引(建表内联) → 种子 顺序;绝不同编号拆 _fields/_indexes/_defaults 三文件
--     (runner 按文件名排序,defaults 会先于 fields 执行直接 fatal)。
--   · 种子顺序:目录必须先于绑定回填,否则 Resolve 全链失败(含 system.main 兜底自身)。
--   · 种子 user_selectable=1:老客户端 localStorage 里存的 modelId 恰好=槽位值,默认 0 会被 P2 闸全拒。
--   · agent_config 4 槽位列保留不删(main_model 兼任 Resolve 终极回退;回滚兜底)。
-- 幂等:CREATE TABLE IF NOT EXISTS / INSERT IGNORE / add_column_if_not_exists;never DROP。
-- 中文 utf8mb4;COLLATE 显式对齐全库 utf8mb4_unicode_ci(防未来与 llm_token_usage.model JOIN 撞 collation)。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_models` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `model_id`        VARCHAR(200)  NOT NULL                      COMMENT '上游真实 model id(唯一;CRUD 层字符白名单 [A-Za-z0-9._:/-])',
  `display_name`    VARCHAR(100)  NOT NULL DEFAULT ''           COMMENT '用户可见名(选择器 trigger 截断,录入建议 ≤16 汉字)',
  `description`     VARCHAR(500)  NOT NULL DEFAULT ''           COMMENT '选择器里的一句话说明',
  `channel`         VARCHAR(16)   NOT NULL DEFAULT 'agent'      COMMENT 'agent | project(预留 internal/ai 轨,第一期只用 agent)',
  `context_window`  INT           NOT NULL DEFAULT 128000       COMMENT '上下文 token 数(P2 下发 executor 供滑窗裁剪+水位条)',
  `max_output`      INT           NOT NULL DEFAULT 0            COMMENT '最大输出 token(0=未知,仅展示)',
  `price_in`        DECIMAL(12,4) NOT NULL DEFAULT 0            COMMENT '元/1M token,输入',
  `price_out`       DECIMAL(12,4) NOT NULL DEFAULT 0            COMMENT '元/1M token,输出',
  `price_cache_r`   DECIMAL(12,4) NOT NULL DEFAULT 0            COMMENT '元/1M token,缓存读',
  `price_cache_w`   DECIMAL(12,4) NOT NULL DEFAULT 0            COMMENT '元/1M token,缓存写',
  `billing_weight`  DECIMAL(8,4)  NOT NULL DEFAULT 1            COMMENT '计费倍率(额度扣减唯一生效值;admin 校验 ∈[0.05,100],堵除零/免费洞)',
  `speed_class`     VARCHAR(16)   NOT NULL DEFAULT 'balanced'   COMMENT 'fast | balanced | powerful(选择器徽标)',
  `user_selectable` TINYINT(1)    NOT NULL DEFAULT 0            COMMENT '是否出现在用户模型选择器',
  `min_tier`        VARCHAR(16)   NOT NULL DEFAULT ''           COMMENT '空=全员;pro/max=档位门槛(P2 锁定+升级引导)',
  `enabled`         TINYINT(1)    NOT NULL DEFAULT 1            COMMENT '总开关(下架=选择器消失;计价路径仍按含停用行的 Get 查,防少扣)',
  `sort_order`      INT           NOT NULL DEFAULT 0,
  `notes`           VARCHAR(500)  NOT NULL DEFAULT ''           COMMENT '内部备注,用户 DTO 绝不透出',
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agent_models_model_id` (`model_id`),
  KEY `idx_agent_models_selectable` (`enabled`, `user_selectable`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型目录(取代 agent_config 4 槽位)';

CREATE TABLE IF NOT EXISTS `agent_model_bindings` (
  `purpose`    VARCHAR(64)  NOT NULL                            COMMENT '能力 key:system.main/fast · chat_default.<feature> · peerreview.<stage> · prism.planner',
  `model_id`   VARCHAR(200) NOT NULL                            COMMENT '指向 agent_models.model_id(不设外键,模型可先删后修绑定,Resolve 有回退链)',
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`purpose`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='能力→模型绑定(admin 可改;行不可删,11 个 purpose 闭集)';

-- P2 用户选模型的会话锁定(pinned_tier 弃用不删);P3 计费水位持久化。
CALL add_column_if_not_exists('agent_sessions', 'pinned_model',    'VARCHAR(200) NOT NULL DEFAULT ''''');
CALL add_column_if_not_exists('agent_sessions', 'usage_watermark', 'VARCHAR(120) NOT NULL DEFAULT ''''');

-- ── 种子 ①:目录 ← agent_config 现有 4 槽位去重回填(必须先于绑定)────────────────
-- INSERT IGNORE 撞 uk_model_id 幂等;槽位为空串的不进目录;display_name 先用 id 本身,admin 后台再改。
INSERT IGNORE INTO `agent_models` (`model_id`, `display_name`, `user_selectable`, `enabled`)
SELECT t.m, t.m, 1, 1 FROM (
  SELECT NULLIF(`main_model`, '')   AS m FROM `agent_config` WHERE `id` = 1
  UNION SELECT NULLIF(`haiku_model`, '')  FROM `agent_config` WHERE `id` = 1
  UNION SELECT NULLIF(`sonnet_model`, '') FROM `agent_config` WHERE `id` = 1
  UNION SELECT NULLIF(`opus_model`, '')   FROM `agent_config` WHERE `id` = 1
) t WHERE t.m IS NOT NULL;

-- ── 种子 ②:绑定 ← 快档 COALESCE(haiku, main),主档 main;全空则不插行(Resolve 走终极回退)──
INSERT IGNORE INTO `agent_model_bindings` (`purpose`, `model_id`)
SELECT p.purpose, p.model_id FROM (
  SELECT 'system.main'               AS purpose, NULLIF(c.`main_model`, '') AS model_id FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'chat_default.claw',        NULLIF(c.`main_model`, '') FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'chat_default.prism',       NULLIF(c.`main_model`, '') FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'peerreview.methodology',   NULLIF(c.`main_model`, '') FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'peerreview.scoring',       NULLIF(c.`main_model`, '') FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'peerreview.chief',         NULLIF(c.`main_model`, '') FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'system.fast',              COALESCE(NULLIF(c.`haiku_model`, ''), NULLIF(c.`main_model`, '')) FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'chat_default.smart_search',COALESCE(NULLIF(c.`haiku_model`, ''), NULLIF(c.`main_model`, '')) FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'peerreview.meta',          COALESCE(NULLIF(c.`haiku_model`, ''), NULLIF(c.`main_model`, '')) FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'peerreview.letter',        COALESCE(NULLIF(c.`haiku_model`, ''), NULLIF(c.`main_model`, '')) FROM `agent_config` c WHERE c.`id` = 1
  UNION ALL SELECT 'prism.planner',            COALESCE(NULLIF(c.`haiku_model`, ''), NULLIF(c.`main_model`, '')) FROM `agent_config` c WHERE c.`id` = 1
) p WHERE p.model_id IS NOT NULL;
