-- 0006_iterative_fields.sql
-- 迭代字段迁移：隐私审稿模式支持

-- 为 peer_review_tasks 添加 is_private 字段（隐私模式标记）
CALL add_column_if_not_exists('peer_review_tasks', 'is_private', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER anon_token');

-- 为 peer_review_tasks 添加 private_exp_at 字段（隐私数据过期时间）
CALL add_column_if_not_exists('peer_review_tasks', 'private_exp_at', 'DATETIME DEFAULT NULL AFTER is_private');
