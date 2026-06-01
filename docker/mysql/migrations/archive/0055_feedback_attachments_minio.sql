-- ============================================================================
-- 0055: feedback_attachments 改造 — 走 MinIO 对象存储, 不再 BLOB 存库
--
-- 背景:
--   早期版本把上传的图片/文件内容 (LONGBLOB file_data) 直接塞到 MySQL,
--   单条 ~10MB,~10 张就 100MB,影响 mysqldump / 复制 / 备份盘空间。
--   现在已经上了 MinIO 容器 (scholar_minio),应该把文件本体迁过去,
--   MySQL 只留 object_key 元数据。
--
-- 数据情况:
--   feedback_attachments 当前 0 行 (没真实历史数据,无丢失风险),
--   所以直接 DROP file_data + ADD object_key, 不写复杂回填逻辑。
--
-- 字段变化:
--   - 新增 object_key VARCHAR(512) — MinIO bucket 里的对象键
--     (格式: tmp/<uploadKey>/<uuid>.<ext> 或 attached/<feedbackID>/<uuid>.<ext>)
--   - 删除 file_data LONGBLOB
--
-- 兼容性:
--   - 后端代码同步改造 (PR 一起提交): 上传走 storage.PutObject,
--     下载走 storage.GetObject, 删除走 storage.DeleteObject
--   - 不需要 backfill — 表 0 行
--
-- 幂等: add_column_if_not_exists + 条件 DROP COLUMN; 重放安全。
-- ============================================================================

CALL add_column_if_not_exists('feedback_attachments', 'object_key',
  'VARCHAR(512) NOT NULL DEFAULT '''' COMMENT ''MinIO bucket 里的对象键''');

-- DROP COLUMN file_data (如果还存在)。information_schema 检查 + 动态 SQL 保证幂等。
DROP PROCEDURE IF EXISTS drop_feedback_file_data_column;
DELIMITER //
CREATE PROCEDURE drop_feedback_file_data_column()
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'feedback_attachments'
          AND COLUMN_NAME  = 'file_data'
    ) THEN
        ALTER TABLE `feedback_attachments` DROP COLUMN `file_data`;
    END IF;
END //
DELIMITER ;
CALL drop_feedback_file_data_column();
DROP PROCEDURE drop_feedback_file_data_column;
