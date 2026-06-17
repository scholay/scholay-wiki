-- ============================================================================
-- 0035 · user_memory_blocks —— per-user 跨 feature 长期记忆(C4)。
--
-- 每用户若干「记忆块」(label 维度:profile / preferences),value 字符封顶(Hermes 手法:
-- 写溢出在 service 层截断/逼整合)。session 开始注入进 agent(smart_search/claw/prism 的
-- 首条消息前缀 + peerreview 的 prompt),后台异步从对话抽取更新(ai.Service low 模型,限流)。
-- 用户可经 /api/v1/user/memory 查看/编辑/删除(隐私/GDPR)。
--
-- DB-as-truth:记忆是 DB 行,不落 agent jsonl,agent 永远拿不到别人的记忆(按 user_id 行级隔离)。
-- 唯一键 (user_id, label):一个用户一个 label 一行,get-or-upsert 幂等(避免重蹈 C6 双行)。
-- 幂等:CREATE TABLE IF NOT EXISTS + add_index_if_not_exists。绝不 DROP。
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_memory_blocks (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  label       VARCHAR(64)     NOT NULL,
  value       TEXT,
  char_limit  INT UNSIGNED    NOT NULL DEFAULT 1500,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CALL add_index_if_not_exists('user_memory_blocks', 'uk_user_label', '`user_id`, `label`', TRUE);
CALL add_index_if_not_exists('user_memory_blocks', 'idx_user', '`user_id`', FALSE);
