# Scholay 恢复手册(从 `backup-all.sh` 的备份恢复)

恢复是**破坏性操作**(覆盖现有数据),故意不做成一键脚本 —— 照下面手动来,并**先在测试环境演练过一遍**再用于生产(`verify-before-deliver` 纪律:别只信脚本跑过)。

备份产物在 `./backups/<时间戳>/`:
- `mysql.sql.gz` —— MySQL 全库(账户 / 会话映射 / 审稿与写作的结构化数据)
- `agent-claude.tar.gz` —— agent 容器 `/home/bun/.claude`(**所有 AI 对话 transcript jsonl** + 记忆)
- `agent-sessions.tar.gz` —— agent 容器 `/home/bun/sessions`(上传文件 + Prism 项目工作副本 cwd)
- `minio.tar.gz` —— MinIO 全部桶对象(审稿稿件/PDF · Prism 编译产物 · 上传文件)

## 恢复顺序(先 DB,再对话,最后对象)

```bash
cd <项目根>
B=./backups/<时间戳>          # 改成实际目录

# 0) 停服务(只停消费方,保留 mysql/minio 容器在跑)
docker compose stop backend agent frontend-user nginx

# 1) MySQL —— 灌回全库
gunzip -c "$B/mysql.sql.gz" | docker exec -i scholar_mysql sh -c \
  'exec mysql -u root -p"$MYSQL_ROOT_PASSWORD" "${MYSQL_DATABASE:-scholar}"'

# 2) agent 对话 jsonl + 会话 cwd —— 解回宿主机数据卷(覆盖)
#    用一次性 alpine 容器写,避开宿主机对容器 uid 文件的权限问题。
docker run --rm -v "$(pwd)/data/agent:/dst" -v "$B:/b:ro" alpine:3 \
  sh -c 'rm -rf /dst/* ; tar -xzf /b/agent-claude.tar.gz -C /dst'
docker run --rm -v "$(pwd)/data/agent-sessions:/dst" -v "$B:/b:ro" alpine:3 \
  sh -c 'rm -rf /dst/* ; tar -xzf /b/agent-sessions.tar.gz -C /dst'

# 3) MinIO 对象 —— 解回数据卷(覆盖)。务必先停 minio 再覆盖,避免写冲突。
docker compose stop minio
docker run --rm -v "$(pwd)/data/minio:/dst" -v "$B:/b:ro" alpine:3 \
  sh -c 'rm -rf /dst/* ; tar -xzf /b/minio.tar.gz -C /dst'
docker compose start minio

# 4) 起服务
docker compose up -d
```

## 注意 / 边界

- **不是 PITR**:只能恢复到备份那一刻;两次备份之间的对话/上传会丢。
- **失配自愈**:DB 里有 session 映射但 agent jsonl 缺失 → 相关 feature 下次会 `recreate` 一个空会话(对话历史丢、功能可用)。jsonl 多出来的孤儿无害。
- **Prism 未应用改动不在备份内**:agent 已在 cwd 改、用户没点「应用」的内容是瞬态(刷新/recreate 本就会丢),不在 DB 也不在对话里。`agent-sessions.tar.gz` 含 cwd,能捞回部分,但不保证。
- **属主**:agent/minio 数据卷文件属主由各自镜像 entrypoint 启动时自愈(chown);若起容器报权限,重启对应容器一次。
- **跨机恢复**:把整个 `./backups/<时间戳>/` 拷到新机的项目根下同样路径,再执行上面步骤即可。

## 建议
- 用 cron 定时跑 `./scripts/backup-all.sh`(如每日)+ 把 `./backups/` 同步到异机/对象存储冷桶。
- 想要 MinIO 对象级强一致 + 版本化:改用 `mc mirror` + 开桶 versioning(需 mc 客户端),代价是多一个依赖。
