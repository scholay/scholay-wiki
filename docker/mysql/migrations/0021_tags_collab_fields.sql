-- ============================================================================
-- 0021: 运营增强 — 用户标签系统 + 反馈协作字段
--
-- 1. user_tags                 — 标签字典(VIP / 高价值 / 待激活 / 即将流失 ...)
-- 2. user_tag_assignments      — 多对多:user × tag
-- 3. feedbacks 加协作字段       — assigned_to / internal_notes / first_response_at
--
-- 预填一些常用标签作为初始数据,管理员可继续添加。
-- ============================================================================

-- 1. 标签字典
CREATE TABLE IF NOT EXISTS `user_tags` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL COMMENT '标签名',
  `color` VARCHAR(20) NOT NULL DEFAULT 'default' COMMENT 'default/success/warning/destructive/info — 对齐 Badge variant',
  `description` VARCHAR(255) DEFAULT '' COMMENT '管理员看的说明',
  `created_by` BIGINT UNSIGNED COMMENT '创建人 user.id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户标签字典';

CALL add_index_if_not_exists('user_tags', 'uk_name', '`name`', TRUE);

-- 2. 多对多
CREATE TABLE IF NOT EXISTS `user_tag_assignments` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `tag_id` BIGINT UNSIGNED NOT NULL,
  `assigned_by` BIGINT UNSIGNED COMMENT '操作人 user.id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户标签关联';

CALL add_index_if_not_exists('user_tag_assignments', 'idx_tag', '`tag_id`', FALSE);

-- 3. feedbacks 协作字段
CALL add_column_if_not_exists('feedbacks', 'assigned_to',
  "BIGINT UNSIGNED DEFAULT NULL COMMENT '指派给某管理员处理 (user.id)' AFTER `replied_by`");
CALL add_column_if_not_exists('feedbacks', 'internal_notes',
  "TEXT COMMENT '内部备注(管理员之间协作,用户不可见)' AFTER `assigned_to`");
CALL add_column_if_not_exists('feedbacks', 'first_response_at',
  "DATETIME DEFAULT NULL COMMENT '首次回复时间(用于 SLA 统计)' AFTER `internal_notes`");
CALL add_index_if_not_exists('feedbacks', 'idx_assigned_to', '`assigned_to`', FALSE);

-- 4. 预填常用标签(幂等)
INSERT IGNORE INTO `user_tags` (`name`, `color`, `description`) VALUES
  ('VIP',         'success',     'VIP 客户,需要优先服务'),
  ('高价值',      'success',     '累计消费 ¥1000+'),
  ('待激活',      'warning',     '注册超过 7 天但未付费'),
  ('即将流失',    'destructive', '近 30 天无登录的付费用户'),
  ('内测用户',    'info',        '帮助测试新功能的早期用户'),
  ('观察名单',    'warning',     '需要管理员关注的可疑账号');
