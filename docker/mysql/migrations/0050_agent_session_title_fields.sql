-- Web-native 重构:会话标题改为「后端拥有」(P4a 切流前置)。
-- 历史上 claw 等会话标题只存在 agent 的 jsonl 里,ListSessions 从 agent 读。切到 clean-room
-- executor(内存态、不持久化标题)后标题全丢 → 改为持久化到 agent_sessions.title:
--   · hub 收 session_title_updated 时 first-wins 写入(不覆盖既有)
--   · ListSessions / 续流读 DB title 为准(fork 的 jsonl title 仅作历史 backfill 源)
-- 幂等 + utf8mb4。

CALL add_column_if_not_exists('agent_sessions', 'title', "VARCHAR(255) NOT NULL DEFAULT ''");
