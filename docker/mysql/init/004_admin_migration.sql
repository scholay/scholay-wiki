-- ============================================================================
-- Scholar 学术平台 - 管理员数据迁移
-- 将 admin_users 表的数据合并到 users 表（统一登录）
-- 幂等性: 所有操作使用条件判断，可重复执行
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================
-- 1. 确保 users 表有 role 字段
-- ============================================
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'role'
);
SET @ddl = IF(@col_exists = 0,
    'ALTER TABLE `users` ADD COLUMN `role` VARCHAR(20) NOT NULL DEFAULT ''user'' COMMENT ''user, admin'' AFTER `website`',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- 2. 添加 role 索引
-- ============================================
DROP PROCEDURE IF EXISTS _tmp_add_role_index;
DELIMITER //
CREATE PROCEDURE _tmp_add_role_index()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND INDEX_NAME = 'idx_users_role'
    ) THEN
        CREATE INDEX `idx_users_role` ON `users` (`role`);
    END IF;
END //
DELIMITER ;
CALL _tmp_add_role_index();
DROP PROCEDURE IF EXISTS _tmp_add_role_index;

-- ============================================
-- 3. 迁移 admin_users 数据到 users 表
--    处理两种情况:
--    a) admin 的 username 在 users 中不存在 → INSERT
--    b) admin 的 username 在 users 中已存在 → UPDATE role 为 admin
-- ============================================
DROP PROCEDURE IF EXISTS _tmp_migrate_admin_users;
DELIMITER //
CREATE PROCEDURE _tmp_migrate_admin_users()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_username VARCHAR(50);
    DECLARE v_password_hash VARCHAR(255);
    DECLARE v_email VARCHAR(100);
    DECLARE v_status TINYINT;
    DECLARE v_last_login_at DATETIME;
    DECLARE v_created_at DATETIME;
    DECLARE v_updated_at DATETIME;
    DECLARE v_existing_id BIGINT UNSIGNED;

    DECLARE cur CURSOR FOR
        SELECT username, password_hash, email, status, last_login_at, created_at, updated_at
        FROM admin_users;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    -- Only proceed if admin_users table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_users'
    ) THEN
        OPEN cur;
        read_loop: LOOP
            FETCH cur INTO v_username, v_password_hash, v_email, v_status, v_last_login_at, v_created_at, v_updated_at;
            IF done THEN
                LEAVE read_loop;
            END IF;

            -- Check if a user with the same username already exists
            SELECT id INTO v_existing_id FROM users WHERE username = v_username LIMIT 1;

            IF v_existing_id IS NOT NULL THEN
                -- Username exists: upgrade to admin if not already
                UPDATE users SET role = 'admin' WHERE id = v_existing_id AND role != 'admin';
            ELSE
                -- Username not in users: insert new admin user
                -- Use email only if it doesn't conflict with existing users
                IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE email = v_email) THEN
                    SET v_email = NULL;
                END IF;

                INSERT INTO users (username, email, password_hash, role, status, email_verified, last_login_at, created_at, updated_at)
                VALUES (v_username, v_email, v_password_hash, 'admin', v_status, FALSE, v_last_login_at, v_created_at, v_updated_at);
            END IF;

            SET v_existing_id = NULL;
        END LOOP;
        CLOSE cur;
    END IF;
END //
DELIMITER ;
CALL _tmp_migrate_admin_users();
DROP PROCEDURE IF EXISTS _tmp_migrate_admin_users;
