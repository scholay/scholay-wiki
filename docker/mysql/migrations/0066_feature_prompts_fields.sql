-- ============================================================================
-- 0066: 通用 prompt 注册表 feature_prompts
--
-- 统一管理所有 AI feature (smart_search / claw / peerreview / 未来扩展) 的
-- system_prompt 文本, 让运营可以在 admin 后台改 prompt 不必重启。
--
-- 设计:
--   - 一张表覆盖所有 feature, 通过 (feature_key, slug) 唯一定位
--   - persona 维度: smart_search/claw 单 prompt 场景填 'default';
--     peerreview 多视角填 'alpha'/'beta'/'gamma'/'chief'
--   - applicable_subjects + weight 给"按学科匹配 + 加权随机"选 prompt 用
--   - source ENUM('seed','admin'): 区分代码内种子 vs 后台编辑;
--     工程师改 seed migration 时遇 source='admin' 的行**不覆盖** (保护运营改动)
--   - version + history 表 (见 0067) 支持运营改 prompt 时审计 + 回滚
--
-- 与既有 peer_review_skills 表的关系:
--   peerreview 的 30 行数据通过 0068 迁移过来 (INSERT ... SELECT, 加 feature_key='peerreview');
--   peer_review_skills 表保留不动, 标记 DEPRECATED 见 DEPRECATED_TABLES.md。
--   peerreview/service.go 改完读源后, peer_review_skills 表的字段不再被 Go 代码消费。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `feature_prompts` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- 归属
  `feature_key`         VARCHAR(64)  NOT NULL COMMENT 'smart_search / claw / peerreview / ...',
  `slug`                VARCHAR(128) NOT NULL COMMENT '全局唯一短标识 (feature_key 内唯一), 给代码用作 BySlugPicker 入参',
  `persona`             VARCHAR(32)  NOT NULL DEFAULT 'default' COMMENT 'default (单 prompt) / alpha / beta / gamma / chief / ...',

  -- 展示
  `name`                VARCHAR(120) NOT NULL COMMENT '人类可读名称, admin 列表显示',
  `description`         VARCHAR(500) NULL COMMENT '简短说明, 给 admin UI 用',

  -- 选择匹配
  `applicable_subjects` JSON         NULL COMMENT '学科白名单 JSON 数组; NULL / [] = 通用 fallback',
  `weight`              DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT '加权随机 picker 用; 1.0 是基线',
  `enabled`             TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '一键启用/停用; 停用即不会被 picker 选中',

  -- 内容
  `system_prompt`       MEDIUMTEXT   NOT NULL COMMENT 'system prompt 全文, 注入到 agent 首条 user_message 前 或 server-side chat 单轮',

  -- 治理
  `version`             INT          NOT NULL DEFAULT 1 COMMENT '每次写改 +1, feature_prompt_history 用作快照版本号',
  `source`              ENUM('seed','admin') NOT NULL DEFAULT 'seed' COMMENT 'seed=代码迁移种子; admin=后台运营编辑',
  `updated_by_user_id`  BIGINT UNSIGNED NULL COMMENT 'admin 编辑时记录改动者; seed 路径 NULL',

  -- 时间戳
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='通用 AI feature prompt 注册表; 替代各 feature 源码 const + peer_review_skills 表';


-- ─── feature_prompt_history ────────────────────────────────────────────────
--
-- 每次 feature_prompts 写改 (Upsert) 前先 INSERT 一条快照到这里, 用于 admin
-- 后台 "查看历史 / 回滚到某版本" 功能。
--
-- 字段只快照内容相关字段 (system_prompt + name + applicable_subjects + weight + enabled),
-- 治理字段 (source/version/changed_by/note) 描述这次"为什么改"。
-- 不冗余 feature_key / slug / persona — 这些通过 prompt_id 反查 feature_prompts 即可。
CREATE TABLE IF NOT EXISTS `feature_prompt_history` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `prompt_id`          BIGINT UNSIGNED NOT NULL COMMENT '指向 feature_prompts.id',
  `version`            INT          NOT NULL COMMENT '快照对应 feature_prompts.version (改前的旧版本号)',
  `name`               VARCHAR(120) NOT NULL,
  `applicable_subjects` JSON        NULL,
  `weight`             DECIMAL(4,2) NOT NULL,
  `enabled`            TINYINT(1)   NOT NULL,
  `system_prompt`      MEDIUMTEXT   NOT NULL,
  `change_note`        VARCHAR(500) NULL COMMENT '运营改动备注, 选填',
  `changed_by_user_id` BIGINT UNSIGNED NULL COMMENT '改动者 user_id, seed 迁移路径 NULL',
  `created_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '快照时刻',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='feature_prompts 版本历史快照, admin 回滚用';
