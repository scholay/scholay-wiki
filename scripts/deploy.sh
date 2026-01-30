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

# 操作类型: all(默认), pull, restart
ACTION=${2:-"all"}

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 镜像完整名称
BACKEND_IMAGE="${REGISTRY}/${NAMESPACE}/backend:${VERSION}"
FRONTEND_USER_IMAGE="${REGISTRY}/${NAMESPACE}/frontend-user:${VERSION}"
FRONTEND_ADMIN_IMAGE="${REGISTRY}/${NAMESPACE}/frontend-admin:${VERSION}"

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
    if docker login --username=${ALIYUN_USERNAME} ${REGISTRY} 2>/dev/null; then
        echo -e "${GREEN}✓ 登录成功${NC}"
    else
        echo -e "${RED}登录失败，请检查用户名和密码${NC}"
        exit 1
    fi
}

# 拉取单个镜像（带进度显示）
pull_image() {
    local name=$1
    local image=$2
    
    echo -ne "${BLUE}  拉取 ${name}...${NC} "
    
    # 使用 quiet 模式拉取，只显示最终 digest
    if docker pull --quiet ${image} > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo -e "${RED}拉取 ${name} 失败${NC}"
        return 1
    fi
}

# 拉取镜像
pull_images() {
    echo ""
    echo -e "${YELLOW}=== 拉取最新镜像 ===${NC}"
    
    pull_image "backend" "${BACKEND_IMAGE}"
    pull_image "frontend-user" "${FRONTEND_USER_IMAGE}"
    pull_image "frontend-admin" "${FRONTEND_ADMIN_IMAGE}"
    
    echo -e "${GREEN}✓ 镜像拉取完成${NC}"
}

# 重启服务
restart_services() {
    echo ""
    echo -e "${YELLOW}=== 重启服务 ===${NC}"
    
    # 使用 --quiet-pull 避免拉取时的乱码输出
    # 使用 --force-recreate 确保使用新镜像
    docker compose -f ${COMPOSE_FILE} up -d --force-recreate --quiet-pull 2>&1 | while read line; do
        # 过滤并美化输出
        if [[ "$line" == *"Started"* ]] || [[ "$line" == *"Running"* ]] || [[ "$line" == *"Created"* ]]; then
            echo -e "  ${GREEN}✓${NC} $line"
        elif [[ "$line" == *"Error"* ]] || [[ "$line" == *"error"* ]]; then
            echo -e "  ${RED}✗${NC} $line"
        elif [[ -n "$line" ]]; then
            echo "  $line"
        fi
    done
    
    echo -e "${GREEN}✓ 服务重启完成${NC}"
}

# 清理旧镜像
cleanup_images() {
    echo ""
    echo -e "${YELLOW}=== 清理未使用的镜像 ===${NC}"
    
    # 静默清理
    CLEANED=$(docker image prune -f 2>/dev/null | grep "Total reclaimed space" || echo "无需清理")
    echo -e "  ${CLEANED}"
    
    echo -e "${GREEN}✓ 清理完成${NC}"
}

# 显示状态
show_status() {
    echo ""
    echo -e "${YELLOW}=== 服务状态 ===${NC}"
    
    # 使用表格格式显示
    docker compose -f ${COMPOSE_FILE} ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
    docker compose -f ${COMPOSE_FILE} ps
    
    echo ""
    echo -e "${YELLOW}=== 镜像版本 ===${NC}"
    printf "  %-20s %s\n" "服务" "镜像大小"
    printf "  %-20s %s\n" "----" "--------"
    
    # Backend
    SIZE=$(docker images ${REGISTRY}/${NAMESPACE}/backend:${VERSION} --format "{{.Size}}" 2>/dev/null || echo "未找到")
    printf "  %-20s %s\n" "backend" "${SIZE}"
    
    # Frontend User
    SIZE=$(docker images ${REGISTRY}/${NAMESPACE}/frontend-user:${VERSION} --format "{{.Size}}" 2>/dev/null || echo "未找到")
    printf "  %-20s %s\n" "frontend-user" "${SIZE}"
    
    # Frontend Admin
    SIZE=$(docker images ${REGISTRY}/${NAMESPACE}/frontend-admin:${VERSION} --format "{{.Size}}" 2>/dev/null || echo "未找到")
    printf "  %-20s %s\n" "frontend-admin" "${SIZE}"
}

# 等待服务健康
wait_healthy() {
    echo ""
    echo -e "${YELLOW}=== 等待服务启动 ===${NC}"
    
    local max_wait=60
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        # 检查所有服务是否健康
        local unhealthy=$(docker compose -f ${COMPOSE_FILE} ps 2>/dev/null | grep -E "Restarting|unhealthy|starting" | wc -l)
        
        if [ "$unhealthy" -eq 0 ]; then
            echo -e "${GREEN}✓ 所有服务已启动${NC}"
            return 0
        fi
        
        echo -ne "\r  等待服务启动... ${waited}s"
        sleep 2
        waited=$((waited + 2))
    done
    
    echo ""
    echo -e "${YELLOW}⚠ 部分服务可能仍在启动中，请检查日志${NC}"
}

# 主流程
case ${ACTION} in
    "all")
        login_acr
        pull_images
        restart_services
        wait_healthy
        cleanup_images
        show_status
        ;;
    "pull")
        login_acr
        pull_images
        ;;
    "restart")
        restart_services
        wait_healthy
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

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "常用命令:"
echo "  查看日志:   docker logs -f scholar_backend"
echo "  查看状态:   ./scripts/deploy.sh latest status"
echo "  重启服务:   ./scripts/deploy.sh latest restart"
