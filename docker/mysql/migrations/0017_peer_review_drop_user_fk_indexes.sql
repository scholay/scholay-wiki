-- ============================================================================
-- 0017: 移除 peer_review_tasks / peer_review_files 对 users.id 的外键约束
--
-- 背景：免登录试用上线后，user_id=0 成为合法的"匿名任务"状态，
-- 原 FK 会阻止 INSERT（user_id=0 在 users 表无对应行）。
-- 归属转移由 Service 层 ClaimAllByAnonToken 事务显式处理，无需 DB 级 CASCADE。
--
-- 保留 idx_user_id 普通索引以支持按用户查询。
-- ============================================================================

CALL drop_foreign_key_if_exists('peer_review_tasks', 'fk_pr_task_user');
CALL drop_foreign_key_if_exists('peer_review_files', 'fk_pr_file_user');
