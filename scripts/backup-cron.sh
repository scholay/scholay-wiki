#!/usr/bin/env bash
# ============================================================================
# Scholay 备份的 cron 安全包装 —— 让 backup-all.sh 能被定时调度且不踩坑。
#
# 为什么不做成 compose sidecar:backup-all.sh 靠 host docker socket 编排
# (docker exec/run),把 docker.sock 挂进一个常驻容器 = 给该容器 root-等价权限,
# 与本次安全审计的方向相悖。host cron 跑本脚本是更安全、可审计的方案。
#
# 本包装相比直接 cron 调 backup-all.sh 多做四件事:
#   1) flock 串行化     —— 上一次没跑完就跳过,避免备份叠加打爆磁盘/IO
#   2) 固定 PATH + cd   —— cron 的极简环境里 docker / gzip 仍可寻址
#   3) 落日志           —— ./backups/backup.log,失败可回溯(cron 默认把输出丢给 mail)
#   4) 可选异机同步     —— 设 BACKUP_OFFSITE_DEST 即 rsync 到异机/对象存储挂载点
#
# 用法(手动验证):
#   KEEP=14 ./scripts/backup-cron.sh
#   BACKUP_OFFSITE_DEST=user@host:/srv/scholay-backups ./scripts/backup-cron.sh
#
# 安装定时任务:./scripts/install-backup-cron.sh(见该脚本)。
# ============================================================================
set -euo pipefail

# cron 的 PATH 极简,补上 docker / 系统工具常见路径。
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

KEEP="${KEEP:-14}"                                  # 默认保留 14 份(资金数据,留够回溯窗口)
LOG="${ROOT}/backups/backup.log"
LOCK="${ROOT}/backups/.backup.lock"
mkdir -p "${ROOT}/backups"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "${LOG}"; }

# flock:同一时刻只允许一个备份在跑。-n 拿不到锁就退出(本次跳过,不排队)。
exec 9>"${LOCK}"
if ! flock -n 9; then
  log "上一次备份仍在运行,跳过本次。"
  exit 0
fi

log "=== 备份开始 (KEEP=${KEEP}) ==="
if KEEP="${KEEP}" "${ROOT}/scripts/backup-all.sh" all >>"${LOG}" 2>&1; then
  log "备份成功。"
else
  rc=$?
  log "备份失败 (exit ${rc}),请检查上方日志与 docker/凭据。"
  exit "${rc}"
fi

# ── 可选:异机/对象存储同步 ──
# 备份与 ./data 同盘时,单块盘故障会同时带走主数据和备份 —— 必须异机才有意义。
if [ -n "${BACKUP_OFFSITE_DEST:-}" ]; then
  log "异机同步 → ${BACKUP_OFFSITE_DEST}"
  # --delete 让远端保留集与本地一致(本地已按 KEEP 滚动);-z 压缩传输。
  if rsync -az --delete -e "${BACKUP_RSYNC_SSH:-ssh}" \
       "${ROOT}/backups/" "${BACKUP_OFFSITE_DEST}/" >>"${LOG}" 2>&1; then
    log "异机同步成功。"
  else
    rc=$?
    log "异机同步失败 (exit ${rc})。本地备份已完成,但异地副本未更新 —— 请尽快排查。"
    exit "${rc}"
  fi
else
  log "未设 BACKUP_OFFSITE_DEST,跳过异机同步(强烈建议生产配置:否则单盘故障 = 主数据与备份一起丢)。"
fi

log "=== 备份结束 ==="
