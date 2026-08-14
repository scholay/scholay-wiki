-- ============================================================================
-- 0112 · agent_attachments —— 输入框上传附件的耐久元数据(字节存 MinIO)
--
-- 背景(docs/research/agent-data-storage-2026-08/01-uploads.md):此前上传附件的字节
-- **只在 executor 会话 cwd**(/home/bun/sessions/<sid>/<uuid>-<原名>),零 DB 行、零
-- MinIO 对象。会话删/重置立刻没,30 天 workdir GC 一到永久消失;而 journal 里折进
-- user_message 的 @"绝对路径" 文本**永不过期** ⇒ 老会话里 chip 还在、点开必裂图
-- (「幽灵 chip」)。产出物(agent_artifacts)与会话历史(agent_turns)早已耐久,
-- 唯独用户自己传的原始数据不是 —— 这正是本表要补的那一格。
--
-- 本表 + MinIO(bucket=scholar-agent-attachments)之后的三层分工:
--   MinIO 对象 = 耐久真源(永久)· 会话 cwd 文件 = 可重建的工作副本 · 本表 = 身份/归属/生命周期。
-- cwd 副本仍然必须存在 —— 模型的 Read/Bash/vision 读的是磁盘,MinIO 替代不了它;
-- 但它现在可以随时丢,下次发消息时从 MinIO 自愈重建(agentattach.Relocator)。
--
-- 🔴 身份键是 attachment_uuid —— 即落盘名 <uuid>-<原名> 里那个 UUID。
--    它已经写在**存量** journal 的 @"path" 里(前端 agent-history.ts 的 STORED_UUID_PREFIX
--    就靠它认附件),故取回端点按它反查 ⇒ 存量历史零迁移、四个 feature 共用一条路由。
--    换个自增 id 做主入口就得改 journal —— 那是不可能的(它是不可变的历史事实)。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_attachments` (
  `id`              bigint unsigned NOT NULL AUTO_INCREMENT,
  `attachment_uuid` char(36)        NOT NULL COMMENT '落盘名 <uuid>-<原名> 里的 uuid;存量 @"path" 唯一可反查的身份键',
  `user_id`         bigint unsigned NOT NULL COMMENT '上传者。刻意用 user_id 而非 agent_artifacts 的 owner_kind/owner_id:附件永远是某个已鉴权自然人传的(四个上传端点全挂 userProtected/prismG),单一列换来 ON DELETE CASCADE 与 per-user 配额的一次索引扫描',
  `feature_key`     varchar(64)     NOT NULL DEFAULT '' COMMENT 'claw / smart_search / stat_lab / prism / boltslides / sci_draw',
  `session_id`      varchar(191)    NOT NULL COMMENT '该 cwd 副本所属 agent 会话',
  `stored_name`     varchar(320)    NOT NULL COMMENT '<uuid>-<原名>(落盘名,不含目录)',
  `rel_path`        varchar(512)    NOT NULL COMMENT '相对会话 cwd 的路径:<stored_name> 或 uploads/<stored_name>。自愈重建时按它写回',
  `filename`        varchar(255)    NOT NULL COMMENT '展示原名(AttachmentDTO.Name)',
  `att_type`        varchar(16)     NOT NULL DEFAULT 'file' COMMENT 'image | file,与 AttachmentDTO.Type 同口径',
  `mime`            varchar(160)    NOT NULL DEFAULT '' COMMENT '归一后的 MIME(AttachmentDTO.MimeType)',
  `size_bytes`      bigint unsigned NOT NULL DEFAULT '0',
  `content_sha256`  char(64)        NOT NULL DEFAULT '' COMMENT '内容 sha256 = MinIO key 的内容寻址部分 + 自愈时的完整性校验',
  `storage_key`     varchar(640)    NOT NULL DEFAULT '' COMMENT 'MinIO key = att/<user_id>/<sha256>。空 = MinIO 未启用(dev 降级),此时只有 cwd 一份',
  `origin_id`       bigint unsigned NOT NULL DEFAULT '0' COMMENT '跨会话物化副本指向源行 id;0 = 原生上传',
  `materialized_at` datetime DEFAULT NULL COMMENT 'cwd 副本最近一次被确认存在;NULL = 当前 cwd 无副本(被 GC / 被驱逐 / 推送失败),下次用到时从 MinIO 重建',
  `deleted_at`      datetime DEFAULT NULL COMMENT '软删(用户主动永久删除)。有了这一列,取回端点才能区分「从未存在」与「已被删除」,给出语义化提示而不是无解释的裂图',
  `created_at`      datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='agent 输入框附件元数据(字节存 MinIO,cwd 副本可重建)—— 0112';
