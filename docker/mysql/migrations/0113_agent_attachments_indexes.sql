-- ============================================================================
-- 0113: agent_attachments 索引与外键
--
-- 一个附件在 N 个会话里是 N 行(不是一行 + 关联表):删会话、会话内驱逐、cwd 物化状态
-- (materialized_at)全都是 **per-session** 的属性,关联表会把这三件事都变成 join。
-- N 行的冗余只有元数据(几百字节);字节靠内容寻址(key=att/<uid>/<sha256>)天然只有 1 份。
-- ============================================================================

-- uk_session_uuid:一个附件在一个会话里只能有一行。原生上传与跨会话物化共用这条唯一键,
-- 于是「物化幂等」从旧的「列目录比同名同大小」升格成 DB 层的 INSERT ... ON DUPLICATE KEY。
-- 索引长度:varchar(191) utf8mb4 = 764B + char(36) = 144B = 908B,远低于 DYNAMIC 的 3072B。
CALL add_index_if_not_exists('agent_attachments', 'uk_agent_att_session_uuid',
  '`session_id`, `attachment_uuid`', TRUE);

-- idx_uuid:取回端点(GET /user/attachment/:uuid)的唯一入口 —— 前端从 journal 的
-- @"path" 剥出 basename 的 UUID 前缀来查,不知道也拿不到行 id。
CALL add_index_if_not_exists('agent_attachments', 'idx_agent_att_uuid', '`attachment_uuid`', FALSE);

-- idx_user_sha 服务两件事,都在写路径上:
--   ① 上传去重(同一用户传过同样的字节 → 复用对象,跳过 PUT);
--   ② 删对象前的引用计数(还有没有别的行指着这个 key)。内容寻址的代价就是这条计数,
--      少了它就会「删一行连带删掉别的会话还在用的字节」。
CALL add_index_if_not_exists('agent_attachments', 'idx_agent_att_user_sha',
  '`user_id`, `content_sha256`', FALSE);

-- idx_user_created:per-user 附件配额求和 +(后续)「我的文件」列表。
CALL add_index_if_not_exists('agent_attachments', 'idx_agent_att_user_created',
  '`user_id`, `created_at`', FALSE);

-- idx_session:删会话 / 重置会话时按会话清行。
CALL add_index_if_not_exists('agent_attachments', 'idx_agent_att_session', '`session_id`', FALSE);

-- ── 外键 ON DELETE CASCADE(与 0104 user_quota_windows 同款范式)────────────────
--
-- 用户是**硬删**的(user/repository.go 的 tx.Delete(&User{}, userID)),没有外键就会留下
-- 孤儿行 —— 而孤儿行在这张表上不只是脏数据:附件是用户的原始数据,「删了号数据还在平台」
-- 是合规上的坏形状。MinIO 侧对应的 att/<uid>/ 前缀由 DeleteUser 事务提交后异步清。
--
-- ⚠️ 加约束前先清孤儿:本迁移每次启动都重放,一次 ADD CONSTRAINT 失败 = 每次启动都失败。
-- DELETE 本身幂等(第二次跑时没有孤儿可删)。
DELETE a FROM agent_attachments a
  LEFT JOIN users u ON u.id = a.user_id
  WHERE u.id IS NULL;

CALL add_foreign_key_if_not_exists('agent_attachments', 'fk_agent_att_user',
  'FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE');
