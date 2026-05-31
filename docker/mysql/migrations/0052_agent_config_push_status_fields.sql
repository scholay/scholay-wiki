-- ============================================================================
-- 0052: agent_config 新增 push_status 字段族, 让 admin 后台看得到推送结果
--
-- 背景:
--   原 Service.UpdateConfig 写库后 fire-and-forget 起 goroutine 推 agent
--   /api/providers, 推送结果只打 slog, admin 完全不知道是不是真生效。
--   生产里出过两次 "改了 model 名但 backend 跑了好几小时还是旧模型" 的事故,
--   排查全靠 grep slog, 体验很差。
--
--   本迁移加 3 列让 admin 后台 GET /admin/agent/config 能直接显示推送状态:
--
--   push_status   - pending / success / failed (每次保存后从 pending 起算)
--   last_pushed_at - 上一次成功 push 的时间 (失败不更新)
--   push_error     - 失败时的错误简介 (1024 字符截断, 用于排错)
--
-- 幂等: add_column_if_not_exists 包裹, 重放安全。
-- ============================================================================

CALL add_column_if_not_exists('agent_config', 'push_status',
  'VARCHAR(16) NOT NULL DEFAULT ''pending'' COMMENT ''pending/success/failed''');

CALL add_column_if_not_exists('agent_config', 'last_pushed_at',
  'DATETIME NULL DEFAULT NULL COMMENT ''最近一次成功推送 agent 的时间''');

CALL add_column_if_not_exists('agent_config', 'push_error',
  'VARCHAR(1024) NOT NULL DEFAULT '''' COMMENT ''最近一次推送失败的错误信息''');
