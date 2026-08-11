#!/bin/bash
# ============================================================
# Scholar 服务器部署脚本
# 
# 从阿里云 ACR 拉取最新镜像并重启服务
#
# 使用方法:
#   ./scripts/deploy.sh                  # 拉 latest + 停整栈 + 全部重启(默认)
#   ./scripts/deploy.sh v1.0.1           # 拉指定版本 + 停整栈 + 全部重启
#   ./scripts/deploy.sh latest pull      # 只拉镜像,不动服务
#   ./scripts/deploy.sh latest restart   # 不拉镜像,停整栈 + 全部重启
#   ./scripts/deploy.sh latest rolling   # 拉镜像 + 原地滚动收敛(不停整栈,老行为)
#   ./scripts/deploy.sh latest status    # 只看状态
#
# 默认为什么是"先停再全部起"、代价多大:见下面 restart_services 的注释。
# ============================================================

set -e

# ==================== 配置区域 ====================
REGISTRY="crpi-ebrftpuujezamyxv.cn-shanghai.personal.cr.aliyuncs.com"
NAMESPACE="scholay"
ALIYUN_USERNAME="aliyun6925902158"
COMPOSE_FILE="docker-compose.prod.yml"
# ================================================

# 版本号，默认 latest
VERSION=${1:-"latest"}

# prod compose 的镜像 tag 走 ${IMAGE_TAG:-latest}。这里把它对齐到要部署的 VERSION,
# 否则 `docker compose up -d` 永远跑 latest —— 传了具体版本号也不生效 (拉了 v1.2.3 却启动 latest)。
export IMAGE_TAG="${VERSION}"

# 操作类型: all(默认), pull, restart, rolling, status
ACTION=${2:-"all"}

# 重启方式: full = down + up(默认);rolling = 只 up 原地收敛。
RESTART_MODE="full"
[ "${ACTION}" = "rolling" ] && RESTART_MODE="rolling"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 镜像完整名称
# 注意: frontend-admin 已合并到 frontend-user（/admin 路由）, 不再单独拉取。
BACKEND_IMAGE="${REGISTRY}/${NAMESPACE}/backend:${VERSION}"
AGENT_IMAGE="${REGISTRY}/${NAMESPACE}/agent:${VERSION}"
FRONTEND_USER_IMAGE="${REGISTRY}/${NAMESPACE}/frontend-user:${VERSION}"
# (egress 已合并入 agent,不再单独拉取)
PRISM_TEX_IMAGE="${REGISTRY}/${NAMESPACE}/prism_tex:${VERSION}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Scholar 服务器部署工具${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "版本: ${YELLOW}${VERSION}${NC}"
echo -e "操作: ${YELLOW}${ACTION}${NC} (重启方式: ${YELLOW}${RESTART_MODE}${NC})"
echo -e "仓库: ${YELLOW}${REGISTRY}/${NAMESPACE}${NC}"
echo ""

# 检查 docker-compose 文件
if [ ! -f "${COMPOSE_FILE}" ]; then
    echo -e "${RED}错误: 找不到 ${COMPOSE_FILE}${NC}"
    echo "请确保在项目根目录运行此脚本"
    exit 1
fi

# `up --wait` 是部署就绪门禁，老版 Compose 不得静默跳过。
COMPOSE_VERSION=$(docker compose version --short 2>/dev/null | sed 's/^v//' || true)
COMPOSE_MAJOR=${COMPOSE_VERSION%%.*}
COMPOSE_REST=${COMPOSE_VERSION#*.}
COMPOSE_MINOR=${COMPOSE_REST%%.*}
if ! [[ "${COMPOSE_MAJOR}" =~ ^[0-9]+$ && "${COMPOSE_MINOR}" =~ ^[0-9]+$ ]] ||
   (( COMPOSE_MAJOR < 2 || (COMPOSE_MAJOR == 2 && COMPOSE_MINOR < 7) )); then
    echo -e "${RED}错误: 需要 Docker Compose 2.7+，当前为 ${COMPOSE_VERSION:-未安装}${NC}"
    exit 1
fi

# 登录阿里云 ACR
login_acr() {
    echo -e "${YELLOW}=== 登录阿里云 ACR ===${NC}"
    docker login --username=${ALIYUN_USERNAME} ${REGISTRY}
    echo ""
}

# 拉取镜像
pull_images() {
    echo -e "${YELLOW}=== 拉取镜像 ===${NC}"
    echo ""
    
    echo "拉取 backend..."
    docker pull ${BACKEND_IMAGE}
    echo ""

    echo "拉取 agent..."
    docker pull ${AGENT_IMAGE}
    echo ""

    echo "拉取 frontend-user..."
    docker pull ${FRONTEND_USER_IMAGE}
    echo ""

    echo "拉取 prism_tex (Prism LaTeX 编译沙箱)..."
    docker pull ${PRISM_TEX_IMAGE}
    echo ""

    echo -e "${GREEN}镜像拉取完成${NC}"
    echo ""
}

# 更新服务。
#
# 两种模式(RESTART_MODE):
#   full (默认)  —— `down` 停掉整栈,再 `up -d --wait` 全部重启。
#   rolling      —— 不 down,直接 `up -d` 原地收敛,只重建镜像/配置变了的服务。
#
# 为什么默认改成 full(2026-08-11):
#   rolling 只重建"自己变了"的容器。nginx / redis 这类没变的容器会被原样留下,
#   而它们持有跨重建不会自愈的进程内状态:
#     - nginx 的 upstream 主机名是【启动时解析一次、进程内永久缓存】(见 nginx/nginx.conf
#       的 upstream 块;OSS nginx 的 upstream 不支持运行期重解析)。backend / frontend-user
#       被重建后拿到新容器 IP,nginx 还在往旧 IP 打 → 502,且 nginx 自己"健康"。
#     - Redis 里的缓存(API key 池 / 配置快照)与新版本代码的假设可能不一致。
#   这正是"发版后要手动把所有容器停掉再起才恢复"的来源。full 用一次可预期的停机换掉
#   一类随机的、事后很难归因的故障。
#
# 代价:停机窗口 ≈ MySQL 关机+启动 + 129 个迁移文件重放 + 各服务 healthy,实测量级 1-3 分钟。
# 明确只想省这段停机(比如只改了前端静态资源)时用:
#   ./scripts/deploy.sh latest rolling
restart_services() {
    # agent 以非 root 的 bun(uid 1000)运行 + cap_drop, 不能在容器内自己 chown。
    # bind mount 的数据/会话目录默认是宿主 root 属主 → 容器写不进去 (EACCES) →
    # 建会话/推配置全 500, 旧会话续聊还会丢工作目录。这里在宿主侧幂等修正属主, 一劳永逸。
    #   - ./data/agent          → /home/bun/.claude   (transcript / provider 配置 / skill)
    #   - ./data/agent-sessions → /home/bun/sessions  (会话 cwd + 上传文件, 需持久化跨重建)
    echo -e "${YELLOW}=== 修正 agent 数据目录属主 (uid 1000 = 容器内 bun) ===${NC}"
    mkdir -p ./data/agent ./data/agent-sessions
    chown -R 1000:1000 ./data/agent ./data/agent-sessions
    echo ""

    # Prism 编译任务共享卷:backend(appuser uid 1001)在这里建任务目录,prism-tex 也以 1001 跑
    # (见 compose 的 user: "1001:1001")回写 status.json/pdf。该卷默认 root 属主 → backend 建目录
    # 会 permission denied → 前端报「编译服务异常」。这里把属主修正到 1001:1001(同 agent 数据目录的处理)。
    mkdir -p ./data/prism-work
    chown -R 1001:1001 ./data/prism-work
    echo ""

	# Nginx 配置已 COPY 进自有镜像，必须显式构建才能让配置文件
	# 的内容变化体现为新 image ID，从而触发 Compose 重建并加载。
	docker compose -f "${COMPOSE_FILE}" build nginx

    if [ "${RESTART_MODE}" = "rolling" ]; then
        echo -e "${YELLOW}=== 原地收敛服务 (rolling,不停整栈) ===${NC}"
    else
        echo -e "${YELLOW}=== 停止整栈 ===${NC}"
        # 不带 -v:命名卷(nginx-static-cache)与 ./data 下的 bind mount 全部保留,
        # 只销毁容器和网络。网络重建 → 所有容器拿新 IP,nginx 也是全新进程,
        # 不存在"新 IP + 旧解析"的错配。
        docker compose -f "${COMPOSE_FILE}" down --remove-orphans
        echo ""
        echo -e "${YELLOW}=== 启动整栈 ===${NC}"
    fi

    # Umami 的健康检查最长合理启动窗口约 210s(start_period 60s + 5×30s),
    # 部署等待必须覆盖该窗口，否则会把仍在正常迁移的服务误判为失败。
    if ! docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --wait --wait-timeout 300; then
        echo -e "${RED}错误: 服务未在 300 秒内全部就绪${NC}"
        docker compose -f "${COMPOSE_FILE}" ps || true
        docker compose -f "${COMPOSE_FILE}" logs --tail=200 nginx backend frontend-user umami schema-sync || true
        return 1
    fi
    echo ""
}

# 清理旧镜像
cleanup_images() {
    echo -e "${YELLOW}=== 清理未使用的镜像 ===${NC}"
    docker image prune -f
    echo ""
}

# 显示状态
show_status() {
    echo -e "${YELLOW}=== 服务状态 ===${NC}"
    docker compose -f ${COMPOSE_FILE} ps
    echo ""
}

# 主流程
case ${ACTION} in
    "all")
        login_acr
        pull_images
        restart_services
        cleanup_images
        show_status
        ;;
    "rolling")
        login_acr
        pull_images
        restart_services
        cleanup_images
        show_status
        ;;
    "pull")
        login_acr
        pull_images
        ;;
    "restart")
        restart_services
        show_status
        ;;
    "status")
        show_status
        ;;
    *)
        echo -e "${RED}错误: 未知的操作 '${ACTION}'${NC}"
        echo "可用选项: all(默认), rolling, pull, restart, status"
        exit 1
        ;;
esac

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "常用命令:"
echo "  docker logs -f scholar_backend"
echo "  docker compose -f ${COMPOSE_FILE} logs -f"
