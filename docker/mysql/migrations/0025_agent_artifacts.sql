-- ============================================================================
-- 0025 · agent_artifacts —— agent 成果交付落 MinIO 的元数据表
--
-- 背景: 智能助手(claw)的 agent 在私有/临时会话 cwd 的 ./out 写成品。历史实现是
-- 「实时回读 agent cwd、不落 MinIO」(见 internal/claw/artifact.go 旧 header),只能服务
-- 文本/位图,二进制(xlsx/pdf/docx)被 agent 判为 binary 直接 404。
--
-- 本表配合「后端中转落 MinIO」方案(agent-web-delivery 设计的 Phase 1):每轮结束后端把
-- ./out 收割成原始字节 → 存 MinIO(bucket=scholar-agent-artifacts)→ 在此表 upsert 一行 →
-- 给前端发 artifact 帧 + GET /<feature>/artifact/:id 从 MinIO 取字节(真实 mime,二进制可用)。
--
-- 归属沿用 agent_sessions 的 owner_kind/owner_id(见 0014),鉴权用 agentbridge.OwnsSession。
-- 生命周期 = 会话 TTL:会话 reset/delete 时一并删本表行 + MinIO 对象。
--
-- 幂等:CREATE TABLE IF NOT EXISTS;唯一键 uk_dedup(= sha256(session_id\0rel_path),Go 侧算)
-- 让收割可重复 upsert(同一文件再收割 = 更新,不产生重复行)。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_artifacts` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_kind`     VARCHAR(32)  NOT NULL DEFAULT 'user'           COMMENT '归属类型,沿用 agent_sessions',
  `owner_id`       BIGINT UNSIGNED NOT NULL                        COMMENT '归属者 id(user_id)',
  `feature_key`    VARCHAR(64)  NOT NULL DEFAULT 'claw'            COMMENT '所属 feature(claw / smart_search ...)',
  `session_id`     VARCHAR(191) NOT NULL                           COMMENT 'agent 会话 id',
  `rel_path`       VARCHAR(512) NOT NULL                           COMMENT '相对会话 cwd 的路径,如 out/report.md(收割键)',
  `filename`       VARCHAR(255) NOT NULL                           COMMENT '展示用文件名(basename)',
  `mime`           VARCHAR(160) NOT NULL DEFAULT ''                COMMENT '真实 MIME(后端按扩展名/嗅探得出)',
  `size_bytes`     BIGINT UNSIGNED NOT NULL DEFAULT 0              COMMENT '字节数',
  `content_sha256` CHAR(64)     NOT NULL DEFAULT ''                COMMENT '内容 sha256,用于跳过未变更文件的重传',
  `storage_key`    VARCHAR(640) NOT NULL DEFAULT ''               COMMENT 'MinIO 对象 key(owner/session/relpath)',
  `dedup_anchor`   CHAR(64)     NOT NULL                           COMMENT 'sha256(session_id\\0rel_path),Go 侧算,做唯一收割键',
  `title`          VARCHAR(255) NOT NULL DEFAULT ''                COMMENT '来自 out/manifest.json 的友好标题(可空)',
  `description`    VARCHAR(1024) NOT NULL DEFAULT ''               COMMENT '来自 manifest 的说明(可空)',
  `kind`           VARCHAR(16)  NOT NULL DEFAULT 'file'            COMMENT 'file=单文件 / dir=目录打包 zip',
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dedup` (`dedup_anchor`),
  KEY `idx_owner`   (`owner_kind`, `owner_id`),
  KEY `idx_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='agent 成果交付物元数据(字节存 MinIO,生命周期=会话 TTL)';
