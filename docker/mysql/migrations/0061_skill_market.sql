-- ============================================================================
-- 0061: Skills 市场(用户上传/分享 skill + claw 动态加载)
-- ----------------------------------------------------------------------------
-- ⚠️ 根本前提:用户 skill = **不可信内容**。SKILL.md 是提示注入面;附带脚本(暂未放行)是 RCE 面。
--    · name/tagline/description 等展示字段渲染必转义(前端禁 rehype-raw)。
--    · declared_tools 仅作展示/审核参考,**绝不据此授权**。
--    · MVP 只放行 tier-1 纯指令 skill(一个 SKILL.md,无脚本/无 Bash/无出网);带脚本能力(tier-2 沙箱)另案。
-- 四张表 + agent_sessions 加一列快照:
--   user_skills          市场主表:所有权 + 元数据 + 当前版本指针 + 可见性 + 过审状态。
--   skill_versions       不可变版本(追加式);skill_md 冗余存规范化正文供物化热路径零 MinIO 往返。
--   user_enabled_skills  用户在 claw 启用了哪些(= installs);UNIQUE(user_id,skill_id) 幂等。
--   skill_reports        举报;UNIQUE(skill_id,reporter,reason) 防重刷。
-- 注:MVP 用 live provider(建会话/重连都按当前 user_enabled_skills 现算),不落会话级快照。
--    tier-1 纯指令 skill 在 executor 重启后按当前启用集重算,是「新对话生效」语义的轻微放宽(安全方向,
--    非安全问题)。会话级冻结快照留待后续需要严格「建时冻结」时再加(见 REPORT Phase 1.x)。
-- 中文统一 utf8mb4(见 migration-utf8-charset 约定)。幂等:CREATE TABLE IF NOT EXISTS;never DROP。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `user_skills` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`            BIGINT UNSIGNED NOT NULL                     COMMENT '作者',
  `slug`               VARCHAR(160)    NOT NULL                     COMMENT '公开短链 /skills/<slug>(唯一);派生自 name + 冲突加后缀 + 保留字守卫',
  `name`               VARCHAR(120)    NOT NULL DEFAULT ''          COMMENT '展示名(不可信,渲染转义)',
  `tagline`            VARCHAR(255)    NOT NULL DEFAULT ''          COMMENT '一句话简介(不可信)',
  `description_md`     TEXT            NULL                         COMMENT '市场详情 markdown(不可信,预览禁 raw HTML)',
  `when_to_use`        VARCHAR(1024)   NOT NULL DEFAULT ''          COMMENT 'frontmatter 抽取,给菜单/展示',
  `declared_tools`     JSON            NULL                         COMMENT 'SKILL.md allowed-tools 原值,仅展示/审核参考,不授权',
  `current_version_id` BIGINT UNSIGNED NULL                         COMMENT '生效版本指针 → skill_versions.id',
  `visibility`         VARCHAR(16)     NOT NULL DEFAULT 'private'   COMMENT 'private | unlisted | public',
  `moderation_status`  VARCHAR(16)     NOT NULL DEFAULT 'draft'     COMMENT 'draft|pending|approved|rejected|flagged;public 必须 approved 才对外可见',
  `moderation_note`    VARCHAR(512)    NOT NULL DEFAULT ''          COMMENT '驳回理由',
  `category`           VARCHAR(40)     NOT NULL DEFAULT 'other'     COMMENT '市场浏览分组',
  `install_count`      BIGINT          NOT NULL DEFAULT 0           COMMENT '去正规化启用量(排序用,可后台对账)',
  `report_count`      INT             NOT NULL DEFAULT 0           COMMENT '未处理举报数,超阈值自动置 flagged',
  `status`             VARCHAR(16)     NOT NULL DEFAULT 'active'    COMMENT 'active | disabled_by_admin | deleted',
  `created_at`         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_skill_slug` (`slug`),
  KEY `idx_user_updated` (`user_id`, `updated_at`),
  KEY `idx_market_rank` (`visibility`, `moderation_status`, `install_count`),
  KEY `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Skills 市场 · 主表';

CREATE TABLE IF NOT EXISTS `skill_versions` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `skill_id`          BIGINT UNSIGNED NOT NULL,
  `version`           INT             NOT NULL                     COMMENT 'skill 内自增 1..N',
  `object_key`        VARCHAR(512)    NOT NULL DEFAULT ''          COMMENT 'skills/<uid>/<skill_id>/v<n>/<sha256>.tgz(原始归档/审计)',
  `bundle_sha256`     CHAR(64)        NOT NULL DEFAULT ''          COMMENT '完整性 + 秒传去重',
  `bundle_size`       BIGINT          NOT NULL DEFAULT 0,
  `manifest_json`     JSON            NULL                         COMMENT 'frontmatter 解析快照',
  `skill_md`          MEDIUMTEXT      NULL                         COMMENT '规范化后的 SKILL.md 正文(物化热路径直接读此列,零 MinIO 往返)',
  `entry_count`       INT             NOT NULL DEFAULT 1           COMMENT 'bundle 内文件数(审核展示)',
  `scan_status`       VARCHAR(16)     NOT NULL DEFAULT 'pending'   COMMENT 'pending|clean|suspect(静态扫描 = 降噪非授权门)',
  `scan_report`       JSON            NULL,
  `moderation_status` VARCHAR(16)     NOT NULL DEFAULT 'pending'   COMMENT '版本级审核(每次改内容重审)',
  `changelog`         VARCHAR(512)    NOT NULL DEFAULT '',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_skill_version` (`skill_id`, `version`),
  KEY `idx_bundle_sha` (`bundle_sha256`),
  KEY `idx_skill_created` (`skill_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Skills 市场 · 不可变版本';

CREATE TABLE IF NOT EXISTS `user_enabled_skills` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`           BIGINT UNSIGNED NOT NULL                     COMMENT '启用者',
  `skill_id`          BIGINT UNSIGNED NOT NULL,
  `pinned_version_id` BIGINT UNSIGNED NULL                         COMMENT 'NULL=跟随作者 current_version(需 approved);非 NULL=钉某版本',
  `enabled`           TINYINT(1)      NOT NULL DEFAULT 1           COMMENT '软开关',
  `source`            VARCHAR(16)     NOT NULL DEFAULT 'self'      COMMENT 'self=自建 | market=装了别人的',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_skill` (`user_id`, `skill_id`),
  KEY `idx_skill` (`skill_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Skills 市场 · 用户启用(installs)';

CREATE TABLE IF NOT EXISTS `skill_reports` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `skill_id`         BIGINT UNSIGNED NOT NULL,
  `version_id`       BIGINT UNSIGNED NULL,
  `reporter_user_id` BIGINT UNSIGNED NOT NULL,
  `reason`           VARCHAR(32)     NOT NULL DEFAULT 'other'      COMMENT 'prompt_injection|malware|data_exfil|ip_infringe|spam|other',
  `detail`           VARCHAR(1024)   NOT NULL DEFAULT '',
  `status`           VARCHAR(16)     NOT NULL DEFAULT 'open'       COMMENT 'open|reviewing|actioned|dismissed',
  `handled_by`       BIGINT UNSIGNED NULL                          COMMENT 'admin user_id',
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at`      DATETIME        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_report_dedup` (`skill_id`, `reporter_user_id`, `reason`),
  KEY `idx_skill_created` (`skill_id`, `created_at`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Skills 市场 · 举报';
