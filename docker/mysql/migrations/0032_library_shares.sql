-- ============================================================================
-- 0032: 文献集分享(网盘式:链接 + 提取码 + 过期 + 转存 + 访问追踪)
-- ----------------------------------------------------------------------------
-- 本轮只做「论文文献集」分享(单篇 + 文件夹整本)。期刊集留下一轮。
-- 三张表:
--   library_shares        一条分享 = 一个链接(token);kind=single|collection。
--   library_share_papers  分享时的篇目【快照】—— 收件人始终看到分享那一刻的内容,
--                         不受 owner 后续增删/改名影响(网盘语义)。
--   library_share_access  访问/转存流水(谁、何时、view 还是 save、转存了几篇)。
-- 中文统一 utf8mb4 入库(见 migration-utf8-charset 约定)。幂等:CREATE TABLE IF NOT EXISTS。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `library_shares` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `token`        VARCHAR(32)     NOT NULL                COMMENT 'URL 短码(唯一);链接 = /s/<token>',
  `user_id`      BIGINT UNSIGNED NOT NULL                COMMENT '分享人',
  `kind`         VARCHAR(16)     NOT NULL DEFAULT 'single' COMMENT 'single=单篇 | collection=文件夹整本',
  `entity_type`  VARCHAR(16)     NOT NULL DEFAULT 'paper'  COMMENT '本轮:paper | folder(期刊/作者留后)',
  `folder_id`    BIGINT UNSIGNED NULL                      COMMENT 'collection 来源文件夹(仅记录,内容以快照为准)',
  `title`        VARCHAR(512)    NOT NULL DEFAULT ''       COMMENT '落地页/卡片标题快照',
  `subtitle`     VARCHAR(512)    NOT NULL DEFAULT ''       COMMENT '副标题/描述快照',
  `paper_count`  INT             NOT NULL DEFAULT 0        COMMENT '快照篇目数',
  `extract_code` VARCHAR(16)     NOT NULL DEFAULT ''       COMMENT '提取码;空=无需提取码',
  `expires_at`   DATETIME        NULL                      COMMENT '过期时刻;NULL=永久',
  `allow_save`   TINYINT(1)      NOT NULL DEFAULT 1        COMMENT '是否允许收件人转存',
  `status`       VARCHAR(16)     NOT NULL DEFAULT 'active' COMMENT 'active | revoked',
  `view_count`   INT             NOT NULL DEFAULT 0,
  `save_count`   INT             NOT NULL DEFAULT 0,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token` (`token`),
  KEY `idx_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文献集分享链接';

CREATE TABLE IF NOT EXISTS `library_share_papers` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `share_id`        BIGINT UNSIGNED NOT NULL,
  `source`          VARCHAR(16)     NOT NULL DEFAULT ''   COMMENT 'stc/olx/pmd/local',
  `source_paper_id` VARCHAR(128)    NOT NULL DEFAULT '',
  `title`           VARCHAR(1024)   NOT NULL DEFAULT '',
  `authors_json`    JSON            NULL,
  `year`            SMALLINT UNSIGNED NULL,
  `venue`           VARCHAR(512)    NOT NULL DEFAULT '',
  `doi`             VARCHAR(255)    NOT NULL DEFAULT '',
  `abstract`        MEDIUMTEXT      NULL,
  `pdf_url`         VARCHAR(1024)   NOT NULL DEFAULT '',
  `citation_count`  INT UNSIGNED    NOT NULL DEFAULT 0,
  `position`        INT             NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_share_position` (`share_id`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分享篇目快照';

CREATE TABLE IF NOT EXISTS `library_share_access` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `share_id`       BIGINT UNSIGNED NOT NULL,
  `viewer_user_id` BIGINT UNSIGNED NULL                  COMMENT 'NULL=匿名访客',
  `viewer_label`   VARCHAR(128)    NOT NULL DEFAULT ''   COMMENT '昵称/邮箱快照,或匿名标识',
  `action`         VARCHAR(16)     NOT NULL DEFAULT 'view' COMMENT 'view | save',
  `item_count`     INT             NOT NULL DEFAULT 0    COMMENT 'save 时转存的篇目数',
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_share_created` (`share_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分享访问/转存流水';
