#!/bin/bash
# ============================================================
# 输出某个 MySQL 库的【规范化 schema 指纹】—— 表 / 列 / 索引 / 外键。
# 行级、排序确定、与 mysqldump 的 AUTO_INCREMENT/格式/顺序噪音无关, 适合直接 diff
# 用来核对"线上 vs 迁移基准"有无结构遗漏。
#
# 用法:
#   scripts/schema-fingerprint.sh [container] [user] [password] [db]
# 默认:
#   container=scholar_mysql  user=scholar_user  password=scholar_pass  db=scholar
# 例(线上):
#   scripts/schema-fingerprint.sh scholar_mysql scholar_user scholar_pass scholar > online.fp
# ============================================================
set -e
C="${1:-scholar_mysql}"
U="${2:-scholar_user}"
P="${3:-scholar_pass}"
DB="${4:-scholar}"

q() { docker exec -i "$C" mysql --default-character-set=utf8mb4 -u"$U" -p"$P" -sN "$DB" -e "$1" 2>/dev/null; }

echo "# ── TABLES (base) ──"
q "SELECT CONCAT('TABLE ', TABLE_NAME)
   FROM information_schema.TABLES
   WHERE TABLE_SCHEMA='$DB' AND TABLE_TYPE='BASE TABLE'
   ORDER BY TABLE_NAME;"

echo "# ── COLUMNS (table.col type null extra) ──"
q "SELECT CONCAT('COL ', TABLE_NAME, '.', COLUMN_NAME, ' | ', COLUMN_TYPE,
            ' | null=', IS_NULLABLE, IF(EXTRA<>'', CONCAT(' | ', EXTRA), ''))
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA='$DB'
   ORDER BY TABLE_NAME, COLUMN_NAME;"

echo "# ── INDEXES (table.index uniq cols) ──"
q "SELECT CONCAT('IDX ', TABLE_NAME, '.', INDEX_NAME,
            ' | uniq=', IF(MIN(NON_UNIQUE)=0,1,0),
            ' | cols=', GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ','))
   FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA='$DB'
   GROUP BY TABLE_NAME, INDEX_NAME
   ORDER BY TABLE_NAME, INDEX_NAME;"

echo "# ── FOREIGN KEYS (table.constraint -> reftable) ──"
q "SELECT CONCAT('FK ', TABLE_NAME, '.', CONSTRAINT_NAME, ' -> ', REFERENCED_TABLE_NAME)
   FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA='$DB' AND REFERENCED_TABLE_NAME IS NOT NULL
   GROUP BY TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
   ORDER BY TABLE_NAME, CONSTRAINT_NAME;"
