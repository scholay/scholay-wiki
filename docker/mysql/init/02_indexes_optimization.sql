-- 性能优化索引
-- 这个文件添加额外的索引来提升查询性能
-- 使用存储过程实现 IF NOT EXISTS 逻辑 (MySQL 8.0 不支持 CREATE INDEX IF NOT EXISTS)

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

DELIMITER $$

-- 通用的创建索引存储过程
CREATE PROCEDURE create_index_if_not_exists(
    IN table_name VARCHAR(64),
    IN index_name VARCHAR(64),
    IN index_columns TEXT
)
BEGIN
    DECLARE index_exists INT DEFAULT 0;

    -- 检查索引是否已存在
    SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = table_name
      AND index_name = index_name;

    -- 如果索引不存在,则创建
    IF index_exists = 0 THEN
        SET @sql = CONCAT('CREATE INDEX `', index_name, '` ON `', table_name, '` (', index_columns, ')');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('✓ 创建索引: ', index_name, ' on ', table_name) AS status;
    ELSE
        SELECT CONCAT('⊙ 索引已存在: ', index_name, ' on ', table_name) AS status;
    END IF;
END$$

DELIMITER ;

-- ============================================
-- Conversation messages表的索引优化
-- ============================================

-- 优化 GetConversationMessages 查询
CALL create_index_if_not_exists(
    'conversation_messages',
    'idx_conversation_messages_conversation_created',
    '`conversation_id`, `created_at`'
);

-- 优化 BuildMessageChain 查询
CALL create_index_if_not_exists(
    'conversation_messages',
    'idx_conversation_messages_parent',
    '`parent_message_id`, `conversation_id`'
);

-- 优化 GetMessageByMessageID 查询
CALL create_index_if_not_exists(
    'conversation_messages',
    'idx_conversation_messages_message_id',
    '`message_id`'
);

-- ============================================
-- Conversations表的索引优化
-- ============================================

-- 优化 GetUserConversations 查询
CALL create_index_if_not_exists(
    'conversations',
    'idx_conversations_user_updated',
    '`user_id`, `updated_at` DESC'
);

CALL create_index_if_not_exists(
    'conversations',
    'idx_conversations_user_type_updated',
    '`user_id`, `conversation_type`, `updated_at` DESC'
);

-- ============================================
-- User sessions表的索引优化
-- ============================================

-- 优化活跃session查询
CALL create_index_if_not_exists(
    'user_sessions',
    'idx_user_sessions_activity',
    '`last_activity`, `expires_at`'
);

-- 优化用户session查询
CALL create_index_if_not_exists(
    'user_sessions',
    'idx_user_sessions_user_activity',
    '`user_id`, `last_activity` DESC'
);

-- ============================================
-- Subscription相关索引优化
-- ============================================

-- 优化订阅查询
CALL create_index_if_not_exists(
    'user_subscriptions',
    'idx_user_subscriptions_user_active',
    '`user_id`, `status`, `end_date`'
);

-- 优化订阅计划查询
CALL create_index_if_not_exists(
    'subscription_plans',
    'idx_subscription_plans_active_type',
    '`is_active`, `plan_code`'
);

-- ============================================
-- Orders表索引优化
-- ============================================

CALL create_index_if_not_exists(
    'orders',
    'idx_orders_user_created',
    '`user_id`, `created_at` DESC'
);

CALL create_index_if_not_exists(
    'orders',
    'idx_orders_status_created',
    '`status`, `created_at` DESC'
);

-- ============================================
-- Usage tracking索引优化
-- ============================================

CALL create_index_if_not_exists(
    'usage_quotas',
    'idx_usage_quotas_user_date',
    '`user_id`, `quota_date` DESC'
);

-- 清理存储过程
DROP PROCEDURE IF EXISTS create_index_if_not_exists;

SELECT '✓ 性能优化索引处理完成' AS status;
