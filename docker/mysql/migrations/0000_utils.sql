-- ============================================================================
-- 幂等工具存储过程
-- 每次迁移重放前置执行，为后续迁移脚本提供安全操作工具
-- ============================================================================

-- 安全添加列（列不存在时才添加）
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
DELIMITER //
CREATE PROCEDURE add_column_if_not_exists(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64),
    IN p_column_definition VARCHAR(2000)
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table_name
        AND COLUMN_NAME = p_column_name
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table_name, '` ADD COLUMN `', p_column_name, '` ', p_column_definition);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- 安全添加索引（索引不存在时才添加）
-- p_is_unique: 1=唯一索引, 0=普通索引
DROP PROCEDURE IF EXISTS add_index_if_not_exists;
DELIMITER //
CREATE PROCEDURE add_index_if_not_exists(
    IN p_table_name VARCHAR(64),
    IN p_index_name VARCHAR(64),
    IN p_columns VARCHAR(2000),
    IN p_is_unique BOOLEAN
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table_name
        AND INDEX_NAME = p_index_name
    ) THEN
        IF p_is_unique THEN
            SET @sql = CONCAT('CREATE UNIQUE INDEX `', p_index_name, '` ON `', p_table_name, '` (', p_columns, ')');
        ELSE
            SET @sql = CONCAT('CREATE INDEX `', p_index_name, '` ON `', p_table_name, '` (', p_columns, ')');
        END IF;
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- 安全添加外键约束（约束不存在时才添加）
DROP PROCEDURE IF EXISTS add_foreign_key_if_not_exists;
DELIMITER //
CREATE PROCEDURE add_foreign_key_if_not_exists(
    IN p_table_name VARCHAR(64),
    IN p_constraint_name VARCHAR(64),
    IN p_fk_definition VARCHAR(2000)
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table_name
        AND CONSTRAINT_NAME = p_constraint_name
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table_name, '` ADD CONSTRAINT `', p_constraint_name, '` ', p_fk_definition);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- 安全删除索引（索引存在时才删除）
DROP PROCEDURE IF EXISTS drop_index_if_exists;
DELIMITER //
CREATE PROCEDURE drop_index_if_exists(
    IN p_table_name VARCHAR(64),
    IN p_index_name VARCHAR(64)
)
BEGIN
    IF EXISTS (
        SELECT * FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table_name
        AND INDEX_NAME = p_index_name
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table_name, '` DROP INDEX `', p_index_name, '`');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- 安全删除外键约束（约束存在时才删除）
DROP PROCEDURE IF EXISTS drop_foreign_key_if_exists;
DELIMITER //
CREATE PROCEDURE drop_foreign_key_if_exists(
    IN p_table_name VARCHAR(64),
    IN p_constraint_name VARCHAR(64)
)
BEGIN
    IF EXISTS (
        SELECT * FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table_name
        AND CONSTRAINT_NAME = p_constraint_name
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table_name, '` DROP FOREIGN KEY `', p_constraint_name, '`');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- 幂等延展月度 RANGE 分区(性能审计 P0)。
-- 适用:按 TO_DAYS(created_at) 月度 RANGE 分区、且末尾有 p_future(VALUES LESS THAN MAXVALUE)的表。
-- 作用:从当前月起向后补齐 p_months_ahead 个月的分区,缺哪个补哪个(命名 pYYMM,与既有 p2607/p2608 一致)。
-- 手法:对每个尚不存在的月份,REORGANIZE p_future 切出该月分区 + 保留末尾 p_future。因数据落在当前月分区,
--       p_future 常为空 → REORGANIZE 廉价;须在数据堆进 p_future 前长期保持领先(迁移重放 + cleanup 日任务共维持)。
-- 时区:CURDATE() 取容器本地(已钉北京 +08:00),与既有 TO_DAYS('2026-08-01') 边界口径一致;月度粒度 ±8h 无影响。
-- 幂等:按分区名存在性跳过;非分区表 / 无 p_future 的表静默跳过,绝不新建或删除数据。
DROP PROCEDURE IF EXISTS ensure_month_range_partitions;
DELIMITER //
CREATE PROCEDURE ensure_month_range_partitions(
    IN p_table_name VARCHAR(64),
    IN p_months_ahead INT
)
BEGIN
    DECLARE v_i INT DEFAULT 0;
    DECLARE v_month_start DATE;
    DECLARE v_next_start DATE;
    DECLARE v_pname VARCHAR(16);
    DECLARE v_bound BIGINT;

    IF EXISTS (
        SELECT 1 FROM information_schema.PARTITIONS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table_name
          AND PARTITION_NAME = 'p_future'
    ) THEN
        WHILE v_i <= p_months_ahead DO
            SET v_month_start = DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL v_i MONTH), '%Y-%m-01');
            SET v_next_start  = DATE_ADD(v_month_start, INTERVAL 1 MONTH);
            SET v_pname       = CONCAT('p', DATE_FORMAT(v_month_start, '%y%m'));
            SET v_bound       = TO_DAYS(v_next_start);
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.PARTITIONS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table_name
                  AND PARTITION_NAME = v_pname
            ) THEN
                SET @sql = CONCAT('ALTER TABLE `', p_table_name,
                    '` REORGANIZE PARTITION p_future INTO (PARTITION `', v_pname,
                    '` VALUES LESS THAN (', v_bound, '), PARTITION p_future VALUES LESS THAN MAXVALUE)');
                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            END IF;
            SET v_i = v_i + 1;
        END WHILE;
    END IF;
END //
DELIMITER ;
