#!/bin/bash
# ============================================================
# 本地构建并推送镜像到阿里云 ACR
# 
# 使用方法:
#   ./scripts/build-and-push.sh           # 自动递增补丁版本 (0.0.1 -> 0.0.2)
#   ./scripts/build-and-push.sh patch     # 同上，递增补丁版本
#   ./scripts/build-and-push.sh minor     # 递增次版本 (0.0.1 -> 0.1.0)
#   ./scripts/build-and-push.sh major     # 递增主版本 (0.0.1 -> 1.0.0)
#   ./scripts/build-and-push.sh v1.2.3    # 使用指定版本号
#   ./scripts/build-and-push.sh patch backend  # 只构建 backend
# ============================================================

set -e

# ==================== 配置区域 ====================
REGISTRY="crpi-ebrftpuujezamyxv.cn-shanghai.personal.cr.aliyuncs.com"
NAMESPACE="scholay"
ALIYUN_USERNAME="aliyun6925902158"
VERSION_FILE="VERSION"
# 目标平台 (服务器架构)
TARGET_PLATFORM="linux/amd64"
# ================================================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# 检查是否在项目根目录
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 检查并设置 buildx
setup_buildx() {
    # 检查 buildx 是否可用
    if ! docker buildx version &> /dev/null; then
        echo -e "${RED}错误: docker buildx 不可用，请更新 Docker${NC}"
        exit 1
    fi
    
    # 检查是否有可用的 builder
    if ! docker buildx inspect mybuilder &> /dev/null; then
        echo -e "${YELLOW}创建 buildx builder...${NC}"
        docker buildx create --name mybuilder --use
        docker buildx inspect --bootstrap
    else
        docker buildx use mybuilder
    fi
}

# 读取当前版本
get_current_version() {
    if [ -f "$VERSION_FILE" ]; then
        cat "$VERSION_FILE" | tr -d '[:space:]'
    else
        echo "0.0.0"
    fi
}

# 递增版本号
increment_version() {
    local version=$1
    local type=$2
    
    # 解析版本号 (移除 v 前缀如果有)
    version=${version#v}
    
    local major=$(echo "$version" | cut -d. -f1)
    local minor=$(echo "$version" | cut -d. -f2)
    local patch=$(echo "$version" | cut -d. -f3)
    
    # 默认值
    major=${major:-0}
    minor=${minor:-0}
    patch=${patch:-0}
    
    case $type in
        "major")
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        "minor")
            minor=$((minor + 1))
            patch=0
            ;;
        "patch"|*)
            patch=$((patch + 1))
            ;;
    esac
    
    echo "${major}.${minor}.${patch}"
}

# 保存版本号
save_version() {
    echo "$1" > "$VERSION_FILE"
}

# 获取版本参数
VERSION_ARG=${1:-"patch"}
BUILD_TARGET=${2:-"all"}

# 判断是自动递增还是指定版本
if [[ "$VERSION_ARG" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # 用户指定了具体版本号
    NEW_VERSION=${VERSION_ARG#v}
else
    # 自动递增版本
    CURRENT_VERSION=$(get_current_version)
    NEW_VERSION=$(increment_version "$CURRENT_VERSION" "$VERSION_ARG")
fi

# 镜像完整名称
BACKEND_IMAGE="${REGISTRY}/${NAMESPACE}/backend:${NEW_VERSION}"
FRONTEND_USER_IMAGE="${REGISTRY}/${NAMESPACE}/frontend-user:${NEW_VERSION}"
FRONTEND_ADMIN_IMAGE="${REGISTRY}/${NAMESPACE}/frontend-admin:${NEW_VERSION}"

BACKEND_LATEST="${REGISTRY}/${NAMESPACE}/backend:latest"
FRONTEND_USER_LATEST="${REGISTRY}/${NAMESPACE}/frontend-user:latest"
FRONTEND_ADMIN_LATEST="${REGISTRY}/${NAMESPACE}/frontend-admin:latest"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Scholar 镜像构建推送工具${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "当前版本: ${CYAN}$(get_current_version)${NC}"
echo -e "新版本:   ${YELLOW}${NEW_VERSION}${NC}"
echo -e "构建目标: ${YELLOW}${BUILD_TARGET}${NC}"
echo -e "目标平台: ${YELLOW}${TARGET_PLATFORM}${NC}"
echo -e "仓库:     ${CYAN}${REGISTRY}/${NAMESPACE}${NC}"
echo ""

# 确认
read -p "确认构建并推送? [Y/n]: " CONFIRM
CONFIRM=${CONFIRM:-Y}
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

# 设置 buildx
echo ""
echo -e "${YELLOW}=== 设置 Docker Buildx ===${NC}"
setup_buildx

# 登录阿里云 ACR
echo ""
echo -e "${YELLOW}=== 登录阿里云 ACR ===${NC}"
docker login --username=${ALIYUN_USERNAME} ${REGISTRY}

# 构建函数 - 使用 buildx 构建并推送
build_and_push() {
    local service=$1
    local image=$2
    local latest=$3
    local context=$4
    local build_args=$5

    echo ""
    echo -e "${YELLOW}=== 构建 ${service} (${TARGET_PLATFORM}) ===${NC}"
    echo "版本镜像: ${image}"
    echo "Latest:   ${latest}"
    
    # 使用 buildx 构建多平台镜像并直接推送
    if [ -n "$build_args" ]; then
        docker buildx build \
            --platform ${TARGET_PLATFORM} \
            -t ${image} \
            -t ${latest} \
            ${build_args} \
            --push \
            ${context}
    else
        docker buildx build \
            --platform ${TARGET_PLATFORM} \
            -t ${image} \
            -t ${latest} \
            --push \
            ${context}
    fi

    echo -e "${GREEN}✓ ${service} 完成${NC}"
}

# 根据目标构建
case ${BUILD_TARGET} in
    "backend")
        build_and_push "backend" "${BACKEND_IMAGE}" "${BACKEND_LATEST}" "./backend"
        ;;
    "frontend-user")
        build_and_push "frontend-user" "${FRONTEND_USER_IMAGE}" "${FRONTEND_USER_LATEST}" "./frontend-user" "--build-arg REACT_APP_API_URL="
        ;;
    "frontend-admin")
        build_and_push "frontend-admin" "${FRONTEND_ADMIN_IMAGE}" "${FRONTEND_ADMIN_LATEST}" "./frontend-admin" "--build-arg REACT_APP_API_URL="
        ;;
    "all")
        build_and_push "backend" "${BACKEND_IMAGE}" "${BACKEND_LATEST}" "./backend"
        build_and_push "frontend-user" "${FRONTEND_USER_IMAGE}" "${FRONTEND_USER_LATEST}" "./frontend-user" "--build-arg REACT_APP_API_URL="
        build_and_push "frontend-admin" "${FRONTEND_ADMIN_IMAGE}" "${FRONTEND_ADMIN_LATEST}" "./frontend-admin" "--build-arg REACT_APP_API_URL="
        ;;
    *)
        echo -e "${RED}错误: 未知的构建目标 '${BUILD_TARGET}'${NC}"
        echo "可用选项: backend, frontend-user, frontend-admin, all"
        exit 1
        ;;
esac

# 保存新版本号
save_version "${NEW_VERSION}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  构建推送完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "版本号已更新: ${YELLOW}${NEW_VERSION}${NC}"
echo -e "目标平台: ${YELLOW}${TARGET_PLATFORM}${NC}"
echo ""
echo "已推送的镜像:"
if [ "${BUILD_TARGET}" = "all" ] || [ "${BUILD_TARGET}" = "backend" ]; then
    echo "  - ${BACKEND_IMAGE}"
    echo "  - ${BACKEND_LATEST}"
fi
if [ "${BUILD_TARGET}" = "all" ] || [ "${BUILD_TARGET}" = "frontend-user" ]; then
    echo "  - ${FRONTEND_USER_IMAGE}"
    echo "  - ${FRONTEND_USER_LATEST}"
fi
if [ "${BUILD_TARGET}" = "all" ] || [ "${BUILD_TARGET}" = "frontend-admin" ]; then
    echo "  - ${FRONTEND_ADMIN_IMAGE}"
    echo "  - ${FRONTEND_ADMIN_LATEST}"
fi
echo ""
echo "服务器部署: ./scripts/deploy.sh"
