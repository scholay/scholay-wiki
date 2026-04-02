-- 0004_iterative_fields.sql
-- 迭代字段迁移：匿名用户审稿支持

-- 为 peer_review_tasks 添加 anon_token 字段（匿名用户访问令牌）
CALL add_column_if_not_exists('peer_review_tasks', 'anon_token', 'VARCHAR(64) DEFAULT NULL AFTER user_id');
