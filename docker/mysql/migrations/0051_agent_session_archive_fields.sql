-- Web-native 重构 P6 前置:彻底退役 fork(原 cc-haha agent)。
-- fork 退役后,切流前的老会话历史(只在 fork jsonl)需有持久落点,否则老对话续聊/历史/后台查看全空。
-- 方案:上线前一次性把 fork 自己折叠出的 transcript(daemon-flat SessionMessage[])归档进本表,
-- 此后所有「journal 空 → 回退」的读路径(readHistory/seedHistory/admin/记忆抽取)改读本表,而非 fork。
-- 数据落 MySQL(与全站数据同处、随卷持久),fork 容器即可彻底删除。
--
-- 幂等 + utf8mb4。messages_json = JSON 数组(agent.SessionMessage[]);一会话一行。

CREATE TABLE IF NOT EXISTS agent_session_archive (
  agent_session_id VARCHAR(64)  NOT NULL,
  feature_key      VARCHAR(64)  NOT NULL DEFAULT '',
  title            VARCHAR(255) NOT NULL DEFAULT '',
  total_turns      INT          NOT NULL DEFAULT 0,
  message_count    INT          NOT NULL DEFAULT 0,
  messages_json    LONGTEXT     NULL,
  source           VARCHAR(32)  NOT NULL DEFAULT 'fork_jsonl',
  archived_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
