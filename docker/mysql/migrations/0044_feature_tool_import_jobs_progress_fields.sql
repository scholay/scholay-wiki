-- ============================================================================
-- 0044 功能广场导入任务 —— logo 上传阶段进度字段
--   zip 导入原来在 HTTP handler 内同步上传 logo 到 MinIO(最多 5000 张),
--   30s 写超时直接掐断 → 改为异步任务里并发上传, 这里补三个进度字段:
--     phase       当前阶段(uploading_logos / importing / done)
--     logo_total  zip 内待上传 logo 总数
--     logo_done   已上传数(并发进度, 任务页实时显示)
-- 幂等: add_column_if_not_exists。永不 DROP。
-- ============================================================================

CALL add_column_if_not_exists('feature_tool_import_jobs', 'phase',
  "varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '导入阶段: uploading_logos|importing|done(空=未分阶段)'");

CALL add_column_if_not_exists('feature_tool_import_jobs', 'logo_total',
  "int NOT NULL DEFAULT '0' COMMENT 'zip 内待上传 logo 总数'");

CALL add_column_if_not_exists('feature_tool_import_jobs', 'logo_done',
  "int NOT NULL DEFAULT '0' COMMENT '已上传 logo 数(并发上传进度)'");
