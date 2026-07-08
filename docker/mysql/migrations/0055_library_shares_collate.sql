-- ============================================================================
-- 0055_library_shares_collate.sql
-- 分享三表(library_shares / library_share_papers / library_share_access)显式
-- 对齐到 utf8mb4_unicode_ci —— 0032/0038 建表时只写了 CHARSET=utf8mb4 未带 COLLATE,
-- MySQL 8 会落到默认 utf8mb4_0900_ai_ci,与全库(unicode_ci)漂移。当前无跨表字符串
-- JOIN 故未爆,但埋隐患且违反 migration-utf8 约定精神,这里统一。
--
-- 幂等 + 免每次重放重写:只在「当前 collation != utf8mb4_unicode_ci」时才 CONVERT
-- (CONVERT 会重写全表,share 表都很小,但仍避免每次启动无谓 rewrite)。
-- ============================================================================

DROP PROCEDURE IF EXISTS convert_table_collation_if_needed;
DELIMITER //
CREATE PROCEDURE convert_table_collation_if_needed(
    IN p_table_name VARCHAR(64),
    IN p_collation VARCHAR(64)
)
BEGIN
    DECLARE v_current VARCHAR(64);
    SELECT TABLE_COLLATION INTO v_current
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table_name;

    IF v_current IS NOT NULL AND v_current <> p_collation THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table_name,
            '` CONVERT TO CHARACTER SET utf8mb4 COLLATE ', p_collation);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

CALL convert_table_collation_if_needed('library_shares', 'utf8mb4_unicode_ci');
CALL convert_table_collation_if_needed('library_share_papers', 'utf8mb4_unicode_ci');
CALL convert_table_collation_if_needed('library_share_access', 'utf8mb4_unicode_ci');

DROP PROCEDURE IF EXISTS convert_table_collation_if_needed;
