-- ============================================================================
-- 0050: 智能搜索 - 用户 ↔ agent session 的 1:1 绑定表
--
-- 背景:
--   智能搜索 (frontend-user/src/features/search) 走 backend → scholar_agent
--   (cc-haha) 的 WS 桥, agent 把每个会话以 jsonl 文件落到容器内
--   data/agent/projects/-home-bun/<sid>.jsonl, 不进任何 DB。
--
--   原 backend 实现 (smartsearch/handler.go 的 CreateSession) 是 "每次进页
--   面就新建一个 agent session", 没有用户↔会话的映射, 导致:
--     1) 用户刷新页面 → 历史消失 (拿不回上次的 sid)
--     2) 每用户每访问一次 = jsonl +1 → 几周内 projects/ 下上千文件孤儿
--     3) 无法做 "重置会话" 这种 UX
--
--   本表把映射收进 DB, 强制 1 用户 1 行 = 1 个 agent session, 重置时
--   UPDATE agent_session_id 即可 (旧 jsonl 在 service 层硬删, 见 v2-audit)。
--
-- 字段说明:
--   user_id          - PK, 一个用户只有一行 (users.id 关联, 但不加 FK 以
--                      避免跨模块强耦合; 由 service 层确保引用完整性)
--   agent_session_id - 当前绑定的 cc-haha session UUID
--   reset_count     - 该用户累计触发过多少次重置, 主要给后台统计用
--
-- 幂等: CREATE TABLE IF NOT EXISTS, 重放安全。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `smart_search_sessions` (
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID (users.id, 1 用户 1 行)',
  `agent_session_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '当前 cc-haha agent session UUID',
  `reset_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '累计重置次数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能搜索 - 用户↔agent session 1:1 绑定';
