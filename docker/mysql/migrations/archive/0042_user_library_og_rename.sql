-- ============================================================================
-- 0042: 文献集 ai_* 列重命名为 og_*
--
-- 背景:
--   文献集每条记录有"上游元数据"和"用户覆盖字段"两类。原命名 ai_* 沿用自 PDF
--   AI 抽取场景, 现已扩展为用户编辑覆盖通道(PDF 抽取 + 手动编辑共用同一组列),
--   重命名为 og_* (origin / overridden, "用户那一边的真值") 以避免误导。
--
-- 6 列重命名 (类型保持不变, 仅改名):
--   ai_title         -> og_title
--   ai_abstract      -> og_abstract
--   ai_authors_json  -> og_authors_json
--   ai_year          -> og_year
--   ai_venue         -> og_venue
--   ai_doi           -> og_doi
--
-- 幂等保证: 用 information_schema 检查 —— ai_* 还在且 og_* 不在才执行 RENAME。
-- 重放安全(已重命名过的环境跳过)。
-- ============================================================================

DROP PROCEDURE IF EXISTS rename_column_if_needed;
DELIMITER //
CREATE PROCEDURE rename_column_if_needed(
    IN p_table VARCHAR(64),
    IN p_old   VARCHAR(64),
    IN p_new   VARCHAR(64)
)
BEGIN
    DECLARE v_old INT DEFAULT 0;
    DECLARE v_new INT DEFAULT 0;
    SELECT COUNT(*) INTO v_old FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_old;
    SELECT COUNT(*) INTO v_new FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_new;
    IF v_old = 1 AND v_new = 0 THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table, '` RENAME COLUMN `', p_old, '` TO `', p_new, '`');
        PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

CALL rename_column_if_needed('user_library_papers', 'ai_title',        'og_title');
CALL rename_column_if_needed('user_library_papers', 'ai_abstract',     'og_abstract');
CALL rename_column_if_needed('user_library_papers', 'ai_authors_json', 'og_authors_json');
CALL rename_column_if_needed('user_library_papers', 'ai_year',         'og_year');
CALL rename_column_if_needed('user_library_papers', 'ai_venue',        'og_venue');
CALL rename_column_if_needed('user_library_papers', 'ai_doi',          'og_doi');

DROP PROCEDURE IF EXISTS rename_column_if_needed;
