-- ============================================================================
-- 0058: 智能审稿 v3 — wizard step 缓存 + revision counter + 异步 compute state
--
-- 背景:
--   wizard 流程 (Step1→2 抽 meta / Step2→3 起草 letter / Step4 投递 4 轮审稿) 都要
--   调 agent, 单次响应 10-60 秒。当前实现是同步 + 每次新 session, 既扛不住中间件
--   30s 写超时, 也每次都重新发送 manuscript 浪费 token。
--
--   重设计:
--     1) 每个 submission 持有自己的 agent session (CreateDraft 即建),
--        全 wizard 共用一个 session, Step2→3 不必再传 manuscript。
--     2) 上游字段变化 → 对应 revision 字段 +1, 下游 cache 自然 stale。
--        assets_revision  ← upload/delete asset 时 +1
--        meta_revision    ← title/abstract/keywords/subjects/type/journal 改时 +1
--        letter_revision  ← cover letter / 审稿信改时 +1
--     3) peer_review_step_cache 存每步 agent 输出 + 输入 fingerprint,
--        fingerprint mismatch → 重算 + overwrite (永远只有一行 per step)。
--     4) compute_state 异步标记 (computing_meta / computing_letter / reviewing),
--        前端 polling submission detail 取代等待响应, 突破 30s 中间件超时。
--
-- 字段:
--   peer_review_submissions:
--     assets_revision  INT NOT NULL DEFAULT 0
--     meta_revision    INT NOT NULL DEFAULT 0
--     letter_revision  INT NOT NULL DEFAULT 0
--     extra_meta_json  JSON NULL                — keywords/subjects/manuscriptType
--                                                 (title/abstract 仍在顶层列)
--     compute_state    VARCHAR(20) NOT NULL DEFAULT 'idle'
--                                                — idle / computing_meta /
--                                                  computing_letter / reviewing / failed
--     compute_error    VARCHAR(500) NULL
--
--   peer_review_step_cache:
--     (submission_id, step) PK
--     input_fingerprint VARCHAR(64)             — hash of revisions tuple at compute time
--     payload_json      JSON                    — agent 输出 (extract result / letter body)
--     agent_tokens_in   INT UNSIGNED            — 审计
--     agent_tokens_out  INT UNSIGNED
--     created_at, updated_at
--
-- 幂等: add_column_if_not_exists + CREATE TABLE IF NOT EXISTS, 重放安全。
-- ============================================================================

CALL add_column_if_not_exists('peer_review_submissions', 'assets_revision',
  'INT NOT NULL DEFAULT 0 COMMENT "asset 增删时 +1, 用作 step_cache fingerprint 输入"');
CALL add_column_if_not_exists('peer_review_submissions', 'meta_revision',
  'INT NOT NULL DEFAULT 0 COMMENT "title/abstract/keywords/journal 改时 +1"');
CALL add_column_if_not_exists('peer_review_submissions', 'letter_revision',
  'INT NOT NULL DEFAULT 0 COMMENT "letter_body 改时 +1"');
CALL add_column_if_not_exists('peer_review_submissions', 'extra_meta_json',
  'JSON NULL COMMENT "keywords/subjects/manuscriptType (title/abstract 仍在顶层列)"');
CALL add_column_if_not_exists('peer_review_submissions', 'compute_state',
  'VARCHAR(20) NOT NULL DEFAULT "idle" COMMENT "idle/computing_meta/computing_letter/reviewing/failed"');
CALL add_column_if_not_exists('peer_review_submissions', 'compute_error',
  'VARCHAR(500) NULL COMMENT "失败时给前端展示的人类可读原因"');

CREATE TABLE IF NOT EXISTS `peer_review_step_cache` (
  `submission_id`     BIGINT UNSIGNED NOT NULL,
  `step`              TINYINT UNSIGNED NOT NULL COMMENT '2=meta extract, 3=letter draft',
  `input_fingerprint` VARCHAR(64) NOT NULL COMMENT 'hash(revisions tuple) at compute time',
  `payload_json`      JSON NOT NULL COMMENT 'agent 输出: step2=ExtractedMeta, step3={body}',
  `agent_tokens_in`   INT UNSIGNED,
  `agent_tokens_out`  INT UNSIGNED,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`submission_id`, `step`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='智能审稿 wizard 每步 agent 输出 cache (fingerprint mismatch 时 overwrite)';

CALL add_foreign_key_if_not_exists('peer_review_step_cache',
  'fk_prsc_submission',
  'FOREIGN KEY (`submission_id`) REFERENCES `peer_review_submissions`(`id`) ON DELETE CASCADE');
