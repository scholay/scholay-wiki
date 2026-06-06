-- ============================================================================
-- 0014 · agent_sessions 归属归一(owner_kind / owner_id + uk_owner + 回填)
--
-- 背景:智能搜索/智能助手(claw)用 agent_sessions 做「用户↔会话」映射,鉴权走
-- agentbridge.OwnsSession(查 agent_sessions);而 prism / peerreview 历史上各自把
-- agent_session_id 存在自己的业务表(prism_projects.agent_session_id /
-- peer_review_submissions.agent_session_id),没进 agent_sessions —— 于是这两个 feature
-- 的 WS 鉴权走不了标准 OwnsSession,prism 临时靠 IssueWSTicketTrusted「后门」绕过。
--
-- 本迁移把 agent_sessions 升级成四个 feature 的统一归属表:
--   - 用户级会话(smart_search / claw 多会话):owner_kind / owner_id 留 NULL,
--     多行 (NULL,NULL) 在 uk_owner 下互不冲突(MySQL 唯一索引视 NULL 为彼此不等)。
--   - 实体级会话(prism 每项目一会话 / peerreview 每投稿一会话):
--     owner_kind='project'|'submission' + owner_id=<实体主键>,uk_owner 保证一实体一行。
-- 回填后,prism / peerreview 也能走标准 OwnsSession,后门即可下线(阶段2)。
--
-- 幂等:加列/加索引用 0000_utils 存储过程;回填用 INSERT IGNORE(撞 uk_agent_session_id
-- 或 uk_owner 即跳过),可重复执行。运行期的「双写」在 Go 侧做(按 owner 唯一键 upsert,
-- 非 INSERT IGNORE),保证 churn(reset/recreate)时同行更新不留孤儿。
-- ============================================================================

-- 1) 字段:owner_kind / owner_id(均可空 —— 用户级会话留空)
CALL add_column_if_not_exists('agent_sessions', 'owner_kind',
  "varchar(32) COLLATE utf8mb4_unicode_ci NULL COMMENT '实体级会话归属类型: project / submission;用户级会话(smart_search/claw)留 NULL'");
CALL add_column_if_not_exists('agent_sessions', 'owner_id',
  "bigint unsigned NULL COMMENT '实体级会话归属主键(prism_projects.id / peer_review_submissions.id);用户级会话留 NULL'");

-- 2) 唯一索引:一实体一会话。(NULL,NULL) 视为互不相等 → 不影响用户级多会话。
CALL add_index_if_not_exists('agent_sessions', 'uk_owner', '`owner_kind`,`owner_id`', TRUE);

-- 3) 回填:把 prism / peerreview 既有的实体级会话灌进 agent_sessions。
--    INSERT IGNORE:重复执行时撞 uk_agent_session_id / uk_owner 自动跳过(一次性快照,幂等)。
INSERT IGNORE INTO agent_sessions
  (user_id, feature_key, agent_session_id, owner_kind, owner_id, reset_count, last_accessed_at, created_at, updated_at)
SELECT p.user_id, 'prism', p.agent_session_id, 'project', p.id, 0, NOW(), NOW(), NOW()
FROM prism_projects p
WHERE p.agent_session_id IS NOT NULL AND p.agent_session_id <> '';

INSERT IGNORE INTO agent_sessions
  (user_id, feature_key, agent_session_id, owner_kind, owner_id, reset_count, last_accessed_at, created_at, updated_at)
SELECT s.user_id, 'peerreview', s.agent_session_id, 'submission', s.id, 0, NOW(), NOW(), NOW()
FROM peer_review_submissions s
WHERE s.agent_session_id IS NOT NULL AND s.agent_session_id <> '';

-- 4) 清理遗留孤儿:prism / peerreview 在归属归一前由旧代码路径写过若干 owner_kind=NULL 的
--    user-level 行,这些 session_id 早已不绑任何项目/投稿(老架构残留)。新模型下这两个 feature
--    只应有 owner 行,故删掉「NULL 归属 且 session_id 不被任何业务表引用」的孤儿。
--    条件自限:只删真正悬空的行 → 全新部署无此类行(no-op),也不会误删将来合法的 owner 行。
DELETE a FROM agent_sessions a
WHERE a.feature_key IN ('prism', 'peerreview')
  AND a.owner_kind IS NULL
  AND NOT EXISTS (SELECT 1 FROM prism_projects p          WHERE p.agent_session_id = a.agent_session_id)
  AND NOT EXISTS (SELECT 1 FROM peer_review_submissions s WHERE s.agent_session_id = a.agent_session_id);
