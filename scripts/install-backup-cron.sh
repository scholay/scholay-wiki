#!/usr/bin/env bash
# ============================================================================
# 把 Scholay 每日备份装进 host crontab(幂等:重复运行只更新不重复添加)。
#
# 在生产服务器上以「能跑 docker 的用户」执行一次即可:
#   ./scripts/install-backup-cron.sh
#
# 自定义:
#   BACKUP_HOUR=4 KEEP=14 BACKUP_OFFSITE_DEST=user@host:/srv/scholay-backups \
#     ./scripts/install-backup-cron.sh
#
# 卸载:crontab -e 删掉带 SCHOLAY_BACKUP 标记的那行。
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOUR="${BACKUP_HOUR:-4}"                  # 每日几点跑(低峰,默认 04:00)
KEEP="${KEEP:-14}"
MARK="# SCHOLAY_BACKUP"                    # 幂等标记,识别本工具加的行

# 组装环境前缀(只把非空变量带进 cron 行)
ENVPREFIX="KEEP=${KEEP}"
[ -n "${BACKUP_OFFSITE_DEST:-}" ] && ENVPREFIX="${ENVPREFIX} BACKUP_OFFSITE_DEST=${BACKUP_OFFSITE_DEST}"

# cron 字段:分 时 日 月 周 —— 每天 HOUR 点整跑。
CRON_LINE="0 ${HOUR} * * * ${ENVPREFIX} ${ROOT}/scripts/backup-cron.sh ${MARK}"

# 取现有 crontab(无则空),删掉旧的本工具行,追加新行,装回。
existing="$(crontab -l 2>/dev/null || true)"
cleaned="$(printf '%s\n' "${existing}" | grep -v "${MARK}" || true)"
printf '%s\n%s\n' "${cleaned}" "${CRON_LINE}" | sed '/^$/d' | crontab -

echo "已安装/更新每日备份任务:"
echo "  ${CRON_LINE}"
echo ""
echo "校验:crontab -l | grep SCHOLAY_BACKUP"
echo "日志:${ROOT}/backups/backup.log"
[ -z "${BACKUP_OFFSITE_DEST:-}" ] && echo "⚠️  未设 BACKUP_OFFSITE_DEST —— 备份与主数据同盘,建议配置异机目标后重跑本脚本。"
echo "提示:务必按 scripts/RESTORE.md 演练一次真实恢复,别只信备份跑过。"
