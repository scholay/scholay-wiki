#!/usr/bin/env bash
# ============================================================================
# Scholay 全量冷备份「三件套」—— 堵住 mysqldump 覆盖不到的盲区。
#
# 背景:CLAUDE.md 只提了 mysqldump,但平台真源散在三处:
#   1) MySQL        —— 账户/会话映射/审稿与写作的结构化数据(mysqldump 可备)
#   2) agent 容器盘 —— 所有 AI 对话 transcript(jsonl)+ 会话工作目录 cwd(mysqldump 备不到!)
#                      智能搜索/智能助手的对话就是唯一产物,这盘一丢全没
#   3) MinIO 对象   —— 审稿稿件/PDF、Prism 编译产物、上传文件(mysqldump 只存 object key,二进制丢了=悬空指针)
#
# 本脚本一次性把三者打包到 ./backups/<时间戳>/。纯加法、不碰任何运行路径。
#
# 一致性:冷备/快照,不是 PITR —— 两次备份之间的对话会丢(对话非金融数据,接受)。
# 目标是把「丢光」降到「只读历史仍在」。tar 期间容器可能在写 = 近似一致;
# 审稿/写作的结构化产物在 MySQL/MinIO 有强一致,丢的只是对话叙事。
#
# 用法:
#   ./scripts/backup-all.sh              # 全量(mysql + agent + minio)
#   ./scripts/backup-all.sh mysql        # 只备某一件:mysql | agent | minio
#   KEEP=14 ./scripts/backup-all.sh      # 保留最近 14 份(默认 7)
#
# 恢复见 scripts/RESTORE.md(恢复是破坏性操作,故意不做成一键脚本)。
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."   # 切到项目根
ROOT="$(pwd)"

# ── 配置 ─────────────────────────────────────────────────────────────────
KEEP="${KEEP:-7}"                       # 保留最近几份
MYSQL_CONTAINER="${MYSQL_CONTAINER:-scholar_mysql}"
DATA_DIR="${DATA_DIR:-./data}"          # 所有持久卷的宿主机根
WHAT="${1:-all}"                        # all | mysql | agent | minio

TS="$(date +%Y%m%d-%H%M%S)"
DEST="${ROOT}/backups/${TS}"
mkdir -p "${DEST}"

# 读 .env 拿 MySQL 凭据(跟 build-and-push 同款 source 法)。
if [ -f ".env" ]; then set -a; . ./.env; set +a; fi
MYSQL_DATABASE="${MYSQL_DATABASE:-scholar}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-${MYSQL_PASSWORD:-scholar_pass}}"

log() { printf '\033[36m[backup %s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
err() { printf '\033[31m[backup ERROR]\033[0m %s\n' "$*" >&2; }

# tar 一个 ./data 子目录 —— 用一次性 alpine 容器执行,避开宿主机对容器 uid 文件的读权限问题。
tar_data_subdir() {
  local sub="$1" out="$2"
  if [ ! -d "${DATA_DIR}/${sub}" ]; then
    log "跳过 ${sub}(目录不存在)"
    return 0
  fi
  docker run --rm \
    -v "${ROOT}/${DATA_DIR#./}/${sub}:/src:ro" \
    -v "${DEST}:/backup" \
    alpine:3 sh -c "tar -czf /backup/${out} -C /src . 2>/dev/null || tar -czf /backup/${out} -C /src ."
}

backup_mysql() {
  log "1/3 mysqldump ${MYSQL_DATABASE} → mysql.sql.gz"
  # --single-transaction:InnoDB 一致性快照,不锁表;--routines/--triggers/--events 备齐对象。
  docker exec "${MYSQL_CONTAINER}" sh -c \
    "exec mysqldump --single-transaction --quick --routines --triggers --events \
       -u root -p\"${MYSQL_ROOT_PASSWORD}\" ${MYSQL_DATABASE}" \
    | gzip > "${DEST}/mysql.sql.gz"
  [ -s "${DEST}/mysql.sql.gz" ] || { err "mysqldump 产出为空,检查凭据/容器"; return 1; }
}

backup_agent() {
  log "2/3 tar agent 对话 jsonl + 会话 cwd → agent-claude.tar.gz / agent-sessions.tar.gz"
  # ./data/agent = /home/bun/.claude(含 projects/<…>/*.jsonl 全部对话 transcript + 记忆)
  tar_data_subdir "agent" "agent-claude.tar.gz"
  # ./data/agent-sessions = /home/bun/sessions/<sid>/(上传文件 + Prism 项目工作副本 cwd)
  tar_data_subdir "agent-sessions" "agent-sessions.tar.gz"
}

backup_minio() {
  log "3/3 tar MinIO 对象(全部桶:审稿稿件/PDF · Prism 编译产物 · 上传)→ minio.tar.gz"
  # MinIO 用文件系统存对象,直接 tar 数据卷即全量桶。免装 mc;近似一致(对象写入原子,极端情况捕到半个对象,
  # 恢复时由各 feature 的 object_key 兜底)。要更强一致可改 `mc mirror` + 桶 versioning(需 mc 客户端)。
  tar_data_subdir "minio" "minio.tar.gz"
}

case "${WHAT}" in
  all)   backup_mysql; backup_agent; backup_minio ;;
  mysql) backup_mysql ;;
  agent) backup_agent ;;
  minio) backup_minio ;;
  *) err "未知目标 '${WHAT}'(可选 all|mysql|agent|minio)"; exit 1 ;;
esac

# 写一份清单(恢复时核对)。
{
  echo "scholay backup ${TS}"
  echo "what=${WHAT}  db=${MYSQL_DATABASE}"
  echo "---"
  ( cd "${DEST}" && ls -la *.gz 2>/dev/null )
} > "${DEST}/MANIFEST.txt"

# 保留最近 KEEP 份,删旧的。
( cd "${ROOT}/backups" && ls -1dt */ 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -rf )

log "完成 → ${DEST}"
( cd "${DEST}" && du -sh . && ls -la )
log "提示:首次务必演练恢复链路(见 scripts/RESTORE.md),别只信脚本跑过。"
