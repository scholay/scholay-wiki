-- 0005_iterative_indexes.sql
-- 迭代索引迁移：匿名用户审稿支持

-- 为 anon_token 添加索引
CALL add_index_if_not_exists('peer_review_tasks', 'idx_peer_review_tasks_anon_token', 'anon_token', FALSE);
