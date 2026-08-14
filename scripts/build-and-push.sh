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
#   ./scripts/build-and-push.sh patch agent    # 只构建 agent (scholar_agent / clean-room executor Bun 容器)
#
# 构建目标: backend | agent | frontend-user | prism_tex | all (默认 all)
#
# 注意:
#   - frontend-admin 已合并到 frontend-user(/admin 路由), 不再单独构建。
#   - frontend-user 是 Vite + React 19 (源在 frontend-user/);容器 / ACR 镜像名仍叫 frontend-user。
#   - agent 是 clean-room executor 容器 (Bun, 源在 agent/), 跟 backend 同一套 buildx linux/amd64 构建, 无 build-arg。
# ============================================================

set -e

# ==================== 配置区域 ====================
REGISTRY="crpi-ebrftpuujezamyxv.cn-shanghai.personal.cr.aliyuncs.com"
NAMESPACE="scholay"
ALIYUN_USERNAME="aliyun6925902158"
VERSION_FILE="VERSION"
# 目标平台 (服务器架构) - 仅用于 backend
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

# ⚠️ 这里【不再】读 .env 的站点配置。
#
# 旧实现 source 了 .env 并把 SITE_URL / SITE_NAME 当 --build-arg 传给前端构建,
# 兜底默认值还是生产域名。两个问题:
#   1. **那两个 build-arg 从来没生效过。** frontend-user/Dockerfile 只声明了
#      `ARG VITE_API_BASE_URL`,源码里也没有任何 VITE_SITE_URL / VITE_SITE_NAME 的
#      消费点 —— docker 只打一行 unused build-arg warning 就丢弃,而脚本却先
#      打印了「站点配置(build-time 注入到 vite bundle)」。配了、看起来生效了、
#      实际一个字节都没变,是最难发现的那种错。
#   2. 即使让它生效也是错方向:域名一旦烘进 bundle,就等于「换域名 = 换镜像」,
#      与「同一个镜像 tag + 各自的 .env 跑多套环境」的目标直接冲突。
#
# 现在站点身份全部**运行时注入**:index.html 留占位符,frontend-user 容器启动时由
# docker-entrypoint.d/50-inject-site.sh 按 env 替换(SITE_URL / CLARITY_PROJECT_ID /
# ICP_BEIAN / SITE_TITLE_PREFIX,接线见两份 docker-compose 的 frontend-user 服务)。
# 也就是说:**构建产物与部署到哪个域名无关**,同一个 tag 可以同时服务多套环境。

# 检查并设置 buildx (仅用于 backend)
setup_buildx() {
    if ! docker buildx version &> /dev/null; then
        echo -e "${RED}错误: docker buildx 不可用，请更新 Docker${NC}"
        exit 1
    fi
    
    if docker buildx inspect scholar-builder &> /dev/null; then
        docker buildx use scholar-builder
    else
        echo -e "${YELLOW}创建 buildx builder...${NC}"
        docker buildx rm mybuilder 2>/dev/null || true
        docker buildx create --name scholar-builder --driver docker-container --use
        docker buildx inspect --bootstrap
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
    version=${version#v}
    
    local major=$(echo "$version" | cut -d. -f1)
    local minor=$(echo "$version" | cut -d. -f2)
    local patch=$(echo "$version" | cut -d. -f3)
    
    major=${major:-0}
    minor=${minor:-0}
    patch=${patch:-0}
    
    case $type in
        "major") major=$((major + 1)); minor=0; patch=0 ;;
        "minor") minor=$((minor + 1)); patch=0 ;;
        "patch"|*) patch=$((patch + 1)) ;;
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
    NEW_VERSION=${VERSION_ARG#v}
else
    CURRENT_VERSION=$(get_current_version)
    NEW_VERSION=$(increment_version "$CURRENT_VERSION" "$VERSION_ARG")
fi

# 镜像完整名称
BACKEND_IMAGE="${REGISTRY}/${NAMESPACE}/backend:${NEW_VERSION}"
AGENT_IMAGE="${REGISTRY}/${NAMESPACE}/agent:${NEW_VERSION}"
FRONTEND_USER_IMAGE="${REGISTRY}/${NAMESPACE}/frontend-user:${NEW_VERSION}"
PRISM_TEX_IMAGE="${REGISTRY}/${NAMESPACE}/prism_tex:${NEW_VERSION}"

BACKEND_LATEST="${REGISTRY}/${NAMESPACE}/backend:latest"
AGENT_LATEST="${REGISTRY}/${NAMESPACE}/agent:latest"
FRONTEND_USER_LATEST="${REGISTRY}/${NAMESPACE}/frontend-user:latest"
PRISM_TEX_LATEST="${REGISTRY}/${NAMESPACE}/prism_tex:latest"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Scholar 镜像构建推送工具${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "当前版本: ${CYAN}$(get_current_version)${NC}"
echo -e "新版本:   ${YELLOW}${NEW_VERSION}${NC}"
echo -e "构建目标: ${YELLOW}${BUILD_TARGET}${NC}"
echo -e "仓库:     ${CYAN}${REGISTRY}/${NAMESPACE}${NC}"
echo ""

# 确认
read -p "确认构建并推送? [Y/n]: " CONFIRM
CONFIRM=${CONFIRM:-Y}
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

# 登录阿里云 ACR
echo ""
echo -e "${YELLOW}=== 登录阿里云 ACR ===${NC}"
docker login --username=${ALIYUN_USERNAME} ${REGISTRY}

# 构建后端类服务 (backend / agent): buildx 跨平台 linux/amd64 + 直接 --push, 无 build-arg
# (env 都是运行期注入, 不烘进镜像)。agent 是 Bun 容器, 跟 backend 同一套构建方式。
build_server_image() {
    local service=$1
    local image=$2
    local latest=$3
    local context=$4

    echo ""
    echo -e "${YELLOW}=== 构建 ${service} (${TARGET_PLATFORM}) ===${NC}"
    echo "版本镜像: ${image}"
    echo "Latest:   ${latest}"
    echo "构建上下文: ${context}"

    # 设置 buildx
    setup_buildx

    # 使用 buildx 构建 linux/amd64 并推送
    docker buildx build \
        --platform ${TARGET_PLATFORM} \
        -t ${image} \
        -t ${latest} \
        --push \
        ${context}

    echo -e "${GREEN}✓ ${service} 完成${NC}"
}

# 构建 Frontend —— 与后端同一套 buildx + --push 直推
#
# 2026-08-10 磁盘优化:旧实现用 `docker build` + `docker tag` + `docker push`,
# 每个版本号都会在本地镜像库永久留一份(0.0.70/0.0.71/… 每份 ~85MB,从不清理),
# 且走的是 docker daemon 的另一套构建缓存。改成 buildx --push 后:
#   - 镜像直接推 ACR,本地不落副本(磁盘零增长);
#   - 与 backend/agent 共用 scholar-builder 的缓存域,统一被 cleanup_local 封顶。
build_frontend() {
    local service=$1
    local image=$2
    local latest=$3
    local context=$4

    echo ""
    echo -e "${YELLOW}=== 构建 ${service} (${TARGET_PLATFORM}) ===${NC}"
    echo "版本镜像: ${image}"
    echo "Latest:   ${latest}"
    echo "站点身份(域名 / Clarity / ICP / 标题前缀)不参与构建 —— 由各环境的 .env 在容器启动时注入。"

    setup_buildx

    # 唯一的 build-arg 是 VITE_API_BASE_URL(空 = 同源相对路径 /api/v1),它与部署到
    # 哪个域名无关。任何「每套环境不同」的值都不许走 build-arg —— Vite 在编译期把
    # import.meta.env.VITE_* 字面替换进 bundle,那等于把环境烘死在镜像里。
    docker buildx build \
        --platform ${TARGET_PLATFORM} \
        -t ${image} \
        -t ${latest} \
        --build-arg VITE_API_BASE_URL= \
        --push \
        ${context}

    echo -e "${GREEN}✓ ${service} 完成${NC}"
}

# ==================== 磁盘清理 ====================
# 每次构建后自动执行:缓存封顶(保留增量构建能力)+ 清历史残留。
# BUILD_CACHE_KEEP 可用 env 覆盖(如 BUILD_CACHE_KEEP=40GB ./scripts/build-and-push.sh)。
# SKIP_CLEANUP=1 可整段跳过(赶时间连发几版时用,记得事后手跑一次)。
BUILD_CACHE_KEEP="${BUILD_CACHE_KEEP:-25GB}"

cleanup_local() {
    if [ -n "${SKIP_CLEANUP:-}" ]; then
        echo ""
        echo -e "${YELLOW}(SKIP_CLEANUP=1,跳过本地清理)${NC}"
        return 0
    fi

    echo ""
    echo -e "${YELLOW}=== 清理本地磁盘(缓存封顶 ${BUILD_CACHE_KEEP},保留增量能力)===${NC}"

    # 1) scholar-builder 的 BuildKit 缓存按 LRU 封顶 —— 不是清空:热层留着,下次构建仍增量。
    #    (新旧 buildx 的参数名不同,逐个回退)
    docker buildx prune --builder scholar-builder --force --max-used-space "${BUILD_CACHE_KEEP}" >/dev/null 2>&1 \
      || docker buildx prune --builder scholar-builder --force --keep-storage "${BUILD_CACHE_KEEP}" >/dev/null 2>&1 \
      || true

    # 2) 本地的 ACR 镜像副本:buildx --push 直推后本地不需要任何副本,
    #    清掉旧版脚本历年攒下的每版一份(只清本项目 namespace,不碰其他项目)。
    local stale
    stale=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep "^${REGISTRY}/${NAMESPACE}/" || true)
    if [ -n "$stale" ]; then
        echo "清理本地 ACR 镜像副本(已推远端,本地是重复占用):"
        echo "$stale" | sed 's/^/  - /'
        echo "$stale" | xargs docker rmi -f >/dev/null 2>&1 || true
    fi

    # 3) dangling(无标签)镜像层
    docker image prune -f >/dev/null 2>&1 || true

    # 4) 用量回显 —— 只查 BuildKit 缓存这一项。
    # 🔴 这里**不要**用 `docker system df`:它要遍历所有镜像/容器/卷逐个算大小,
    #    本机实测 45.6s,是整个脚本尾巴上唯一的大头(其余三步合计 <2s),
    #    而它给出的信息我们只关心构建缓存这一行。`buildx du` 实测 0.36s。
    echo -e "${GREEN}清理完成。构建缓存占用:${NC}"
    docker buildx du --builder scholar-builder 2>/dev/null | tail -2 || true
}

# 根据目标构建
case ${BUILD_TARGET} in
    "backend")
        build_server_image "backend" "${BACKEND_IMAGE}" "${BACKEND_LATEST}" "./backend"
        ;;
    "agent")
        build_server_image "agent" "${AGENT_IMAGE}" "${AGENT_LATEST}" "./agent"
        ;;
    "frontend-user"|"frontend")
        build_frontend "frontend-user" "${FRONTEND_USER_IMAGE}" "${FRONTEND_USER_LATEST}" "./frontend-user"
        ;;
    "prism_tex"|"prism-tex")
        build_server_image "prism_tex" "${PRISM_TEX_IMAGE}" "${PRISM_TEX_LATEST}" "./prism_tex"
        ;;
    "all")
        build_server_image "backend" "${BACKEND_IMAGE}" "${BACKEND_LATEST}" "./backend"
        build_server_image "agent" "${AGENT_IMAGE}" "${AGENT_LATEST}" "./agent"
        build_frontend "frontend-user" "${FRONTEND_USER_IMAGE}" "${FRONTEND_USER_LATEST}" "./frontend-user"
        build_server_image "prism_tex" "${PRISM_TEX_IMAGE}" "${PRISM_TEX_LATEST}" "./prism_tex"
        ;;
    *)
        echo -e "${RED}错误: 未知的构建目标 '${BUILD_TARGET}'${NC}"
        echo "可用选项: backend, agent, frontend-user, prism_tex, all"
        exit 1
        ;;
esac

# 保存新版本号
save_version "${NEW_VERSION}"

# 构建后清理:缓存封顶 + 清历史残留(失败不影响本次发布结果)
cleanup_local || true

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  构建推送完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "版本号已更新: ${YELLOW}${NEW_VERSION}${NC}"
echo ""
echo "已推送的镜像:"
if [ "${BUILD_TARGET}" = "all" ] || [ "${BUILD_TARGET}" = "backend" ]; then
    echo "  - ${BACKEND_IMAGE} (linux/amd64)"
    echo "  - ${BACKEND_LATEST}"
fi
if [ "${BUILD_TARGET}" = "all" ] || [ "${BUILD_TARGET}" = "agent" ]; then
    echo "  - ${AGENT_IMAGE} (linux/amd64)"
    echo "  - ${AGENT_LATEST}"
fi
if [ "${BUILD_TARGET}" = "all" ] || [ "${BUILD_TARGET}" = "frontend-user" ] || [ "${BUILD_TARGET}" = "frontend" ]; then
    echo "  - ${FRONTEND_USER_IMAGE}"
    echo "  - ${FRONTEND_USER_LATEST}"
fi
echo ""
echo "服务器部署: ./scripts/deploy.sh"
