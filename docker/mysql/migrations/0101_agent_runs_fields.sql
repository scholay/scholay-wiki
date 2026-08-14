-- ============================================================================
-- 0101 · agent_runs —— Run 引擎的 Run 级元数据(2026-08 科研内核 Phase 1)。
--
-- 【它与 agent_saga_steps(0048)的分工】
--   agent_runs        一条科研请求 = 一个 Run(状态机的头)
--   agent_saga_steps  Run 的每一步(0048 已建表、此前零消费;本次**一列都不加**)
--   两者靠 saga_id = 'run:<run_id>' 关联 —— 刻意不加外键:0048 是通用底座,
--   peerreview 之类的非 Run 编排也可能骑它,加外键会把通用表绑死在 agent_runs 上。
--
-- 【为什么 Run 元数据不塞进 agent_saga_steps】
--   那张表的粒度是「一步」,而「这个 Run 归谁、跑在哪个会话、用哪个模板、整体什么状态」
--   是 Run 级事实。塞进 step 行会让每一步都冗余一份 Run 状态,且没有唯一的真源
--   —— 状态机最忌讳同一事实有两个可写副本。
--
-- 【产物正文不进本表】
--   output_ref 只存 {path, chars, evidence_ids},正文永远在 workDir。
--   理由是**模型视野**:workDir 是模型能 Read 的天然位置,放 DB 就得再造一条注入通道。
--   repo.go 里有长度断言兜住「图省事把整篇中间稿塞进 JSON 列」。
--
-- 幂等: CREATE TABLE IF NOT EXISTS + add_column_if_not_exists。utf8mb4(中文标题/错误)。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_runs` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`          BIGINT UNSIGNED NOT NULL DEFAULT 0  COMMENT '归属用户(per-user 并发闸按它算)',
  `feature_key`      VARCHAR(64)     NOT NULL DEFAULT '' COMMENT 'claw|peerreview|prism|…',
  `agent_session_id` VARCHAR(64)     NOT NULL DEFAULT '' COMMENT '执行所在的 agent 会话(产物落它的 workDir)',
  `template_key`     VARCHAR(64)     NOT NULL DEFAULT '' COMMENT 'RunTemplate.Key,决定有哪些 Step',
  `status`           VARCHAR(16)     NOT NULL DEFAULT 'planning'
                     COMMENT 'planning|running|awaiting_user|done|failed|canceled',
  `title`            VARCHAR(255)    NOT NULL DEFAULT '' COMMENT '给用户看的一句话任务名',
  `request`          TEXT            NULL                COMMENT '用户原始诉求(Step 提示词的上下文来源)',
  `error`            TEXT            NULL                COMMENT '终态失败原因',
  `created_at`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `finished_at`      DATETIME(3)     NULL                COMMENT '进入终态的时刻(done/failed/canceled)',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='科研内核 Run 级元数据(Phase 1)';

-- 存量库补列(表已存在时 CREATE TABLE IF NOT EXISTS 是 no-op,靠这些 CALL 兜住)。
CALL add_column_if_not_exists('agent_runs', 'request',     'TEXT NULL');
CALL add_column_if_not_exists('agent_runs', 'error',       'TEXT NULL');
CALL add_column_if_not_exists('agent_runs', 'finished_at', 'DATETIME(3) NULL');
