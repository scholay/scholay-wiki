#!/bin/bash
# ============================================================
# Scholar 服务器部署脚本
# 
# 从阿里云 ACR 拉取最新镜像并重启服务
#
# 使用方法:
#   ./scripts/deploy.sh              # 拉取 latest 并部署
#   ./scripts/deploy.sh v1.0.1       # 拉取指定版本并部署
#   ./scripts/deploy.sh latest pull  # 只拉取不重启
#   ./scripts/deploy.sh latest restart # 只重启不拉取
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

# 操作类型: all(默认), pull, restart
ACTION=${2:-"all"}

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
EGRESS_IMAGE="${REGISTRY}/${NAMESPACE}/egress:${VERSION}"
PRISM_TEX_IMAGE="${REGISTRY}/${NAMESPACE}/prism_tex:${VERSION}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Scholar 服务器部署工具${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "版本: ${YELLOW}${VERSION}${NC}"
echo -e "操作: ${YELLOW}${ACTION}${NC}"
echo -e "仓库: ${YELLOW}${REGISTRY}/${NAMESPACE}${NC}"
echo ""

# 检查 docker-compose 文件
if [ ! -f "${COMPOSE_FILE}" ]; then
    echo -e "${RED}错误: 找不到 ${COMPOSE_FILE}${NC}"
    echo "请确保在项目根目录运行此脚本"
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

    echo "拉取 egress (agent 出网代理)..."
    docker pull ${EGRESS_IMAGE}
    echo ""

    echo "拉取 prism_tex (Prism LaTeX 编译沙箱)..."
    docker pull ${PRISM_TEX_IMAGE}
    echo ""

    echo -e "${GREEN}镜像拉取完成${NC}"
    echo ""
}

# 重启服务
restart_services() {
    echo -e "${YELLOW}=== 停止旧服务 ===${NC}"
    docker compose -f ${COMPOSE_FILE} down
    echo ""

    # agent 以非 root 的 bun(uid 1000)运行 + cap_drop, 不能在容器内自己 chown。
    # bind mount 的数据/会话目录默认是宿主 root 属主 → 容器写不进去 (EACCES) →
    # 建会话/推配置全 500, 旧会话续聊还会丢工作目录。这里在宿主侧幂等修正属主, 一劳永逸。
    #   - ./data/agent          → /home/bun/.claude   (transcript / provider 配置 / skill)
    #   - ./data/agent-sessions → /home/bun/sessions  (会话 cwd + 上传文件, 需持久化跨重建)
    echo -e "${YELLOW}=== 修正 agent 数据目录属主 (uid 1000 = 容器内 bun) ===${NC}"
    mkdir -p ./data/agent ./data/agent-sessions
    chown -R 1000:1000 ./data/agent ./data/agent-sessions
    echo ""

    # Prism 编译任务共享卷:backend 与 scholar_prism_tex 都以 root 读写(Phase 0),只需存在即可。
    mkdir -p ./data/prism-work
    echo ""

    echo -e "${YELLOW}=== 启动新服务 ===${NC}"
    docker compose -f ${COMPOSE_FILE} up -d
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
        echo "可用选项: all(默认), pull, restart, status"
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
