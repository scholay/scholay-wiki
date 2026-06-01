-- ============================================================================
-- 0002_cleanup_gorm_leftovers.sql — 清理生产上的历史 GORM AutoMigrate 残余
--
-- 背景: 早期某次 GORM AutoMigrate 在生产留下了一批迁移系统并不创建的残余:
--   - user_library_papers.ai_*   —— og_* 的孤儿副本 (0042 改名因 og_* 已被 GORM 预建而跳过),
--                                    代码只用 og_* (model.go: gorm:"column:og_title"), ai_* 是死列
--   - system_configs.github_*    —— GitHub OAuth 早已改用独立的 github_oauth_config 表, 这几列已死
--   - usage_quotas / user_subscriptions 上的 _ibfk_ 外键 —— stranded 表上的孤儿外键, 迁移不创建
-- 这些都【不在 0001_baseline】里。本迁移把它们从既有库 (生产) 删掉, 使生产收敛到 baseline。
--
-- 幂等: 用 information_schema 判断存在才删 —— 对全新库 (baseline 本就没建这些) 是 no-op,
--        对生产恰好删掉残余, 可重复执行。
-- ============================================================================

DROP PROCEDURE IF EXISTS _cleanup_drop_col;
DROP PROCEDURE IF EXISTS _cleanup_drop_fk;

DELIMITER $$

CREATE PROCEDURE _cleanup_drop_col(IN tn VARCHAR(64), IN cn VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tn AND COLUMN_NAME = cn
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tn, '` DROP COLUMN `', cn, '`');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END $$

CREATE PROCEDURE _cleanup_drop_fk(IN tn VARCHAR(64), IN fk VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tn
      AND CONSTRAINT_NAME = fk AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tn, '` DROP FOREIGN KEY `', fk, '`');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END $$

DELIMITER ;

-- ── 死列: user_library_papers.ai_* (og_* 的孤儿副本) ──
CALL _cleanup_drop_col('user_library_papers', 'ai_title');
CALL _cleanup_drop_col('user_library_papers', 'ai_abstract');
CALL _cleanup_drop_col('user_library_papers', 'ai_authors_json');
CALL _cleanup_drop_col('user_library_papers', 'ai_year');
CALL _cleanup_drop_col('user_library_papers', 'ai_venue');
CALL _cleanup_drop_col('user_library_papers', 'ai_doi');

-- ── 死列: system_configs.github_* (已改用 github_oauth_config 表) ──
CALL _cleanup_drop_col('system_configs', 'enable_github_oauth');
CALL _cleanup_drop_col('system_configs', 'github_client_id');
CALL _cleanup_drop_col('system_configs', 'github_client_secret');
CALL _cleanup_drop_col('system_configs', 'github_redirect_uri');

-- ── 孤儿外键: stranded 表 (usage_quotas / user_subscriptions) ──
CALL _cleanup_drop_fk('usage_quotas', 'usage_quotas_ibfk_1');
CALL _cleanup_drop_fk('user_subscriptions', 'user_subscriptions_ibfk_1');

DROP PROCEDURE IF EXISTS _cleanup_drop_col;
DROP PROCEDURE IF EXISTS _cleanup_drop_fk;
