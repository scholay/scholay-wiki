-- ============================================================================
-- 0099: 邀请注册(invite)最小闭环 —— 一人一码 + 落地页打开计数 + 新用户归因
--
-- 两张表:
--   invite_codes         邀请码主表:一个用户一行(get-or-create),open_count 公开端点原子 +1。
--   invite_registrations 归因流水:一个新用户至多归因一次(uk 唯一键兜幂等)。
--
-- 设计取舍:
--   · 刻意**不复用** stranded 的 user_invitations / invitation_relationships
--     (CLAUDE.md 明令:那批表无代码读写,新功能不得再依赖);
--   · 刻意**不建外键**(与近期迁移 0061/0090 等口径一致:应用层保证引用,删用户不级联);
--   · 唯一索引直接内联在 CREATE TABLE IF NOT EXISTS 里 —— 全新表、后续不 ALTER 唯一键,
--     无 0014 那类「重放期重建唯一索引撞后继数据」的风险(那个坑只发生在
--     老迁移被后继迁移放宽唯一键之后的重放,见 migration-replay-uniq-trap)。
--
-- 幂等:CREATE TABLE IF NOT EXISTS;never DROP;中文注释统一 utf8mb4(migration-utf8-charset 约定)。
-- ============================================================================

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;

-- ── 邀请码主表(一人一码)────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `invite_codes` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL                     COMMENT '邀请人 users.id(一人一码)',
  `code`           VARCHAR(16)     NOT NULL                     COMMENT '8 位大写邀请码(去易混字符 0/O/1/I/L,全局唯一)',
  `open_count`     BIGINT          NOT NULL DEFAULT 0           COMMENT '落地页打开次数(公开端点原子 +1)',
  `last_opened_at` DATETIME        NULL                         COMMENT '最近一次被打开时间',
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '「生成邀请」时刻(get-or-create 首次调用)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invite_codes_code` (`code`),
  UNIQUE KEY `uk_invite_codes_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请注册 · 邀请码(0099;一人一码)';

-- ── 归因流水(一个新用户至多归因一次)──────────────────────────────────────
-- 写入点唯一:后端在「新用户创建成功(事务提交后)」消费 X-Invite-Code 请求头,
-- INSERT IGNORE 落一行;uk_invreg_invited 保证并发/重放下也只归因一次。
CREATE TABLE IF NOT EXISTS `invite_registrations` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `inviter_user_id` BIGINT UNSIGNED NOT NULL                    COMMENT '邀请人 users.id(冗余自 invite_codes,免 JOIN)',
  `code_id`         BIGINT UNSIGNED NOT NULL                    COMMENT '归因到的邀请码 invite_codes.id',
  `invited_user_id` BIGINT UNSIGNED NOT NULL                    COMMENT '被邀请的新用户 users.id(唯一 = 只归因一次)',
  `method`          VARCHAR(32)     NOT NULL DEFAULT ''         COMMENT '注册途径: email|phone|github|google|wechat|orcid|apple|microsoft|discourse|oauth_merge',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归因(=注册)时刻',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invreg_invited` (`invited_user_id`),
  KEY `idx_invreg_inviter_created` (`inviter_user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请注册 · 归因流水(0099)';

/*!40101 SET character_set_client = @saved_cs_client */;
