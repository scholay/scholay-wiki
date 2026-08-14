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

# ==================== 环境身份闸门 ====================
#
# 同一份 compose + 同一批镜像会被部署到不止一台机器(权威生产站、测试站……),
# 它们唯一的差别是 .env。于是「我现在到底在哪台机器上、要把什么部到哪」必须
# 在**动手之前**明确 —— 而不是靠敲命令的人记得。
#
# APP_ENV 是那个唯一的开关:一堆「两套环境要拨不同方向」的旋钮从它派生默认值
# (当前:SEO_INDEXABLE —— prod 可索引、test 不可索引)。
#
# 这里强制它必须在 .env 里写明:
#   - 缺失 → 直接退出并给出改法。宁可多这一步,也不要出现「测试站被搜索引擎
#     收录成生产站的镜像」这种要几周后才发现、恢复更久的事故。
#   - 存在 → 大字回显,让部署者在敲 y 之前看见自己在操作哪套环境。
# 只挑需要的两个变量,不 source 整个 .env —— 那会把全部密钥灌进当前 shell 的环境,
# 之后任何子进程(包括 docker CLI 的插件)都能读到,没必要。
#
# 解析规则**刻意对齐 docker compose 读 .env 的行为**,否则会出现「compose 读到 A、
# 这个脚本读到 B」的错位 —— 那比读不到更难查。对齐的两点:
#   1. 行内注释:空白 + # 到行尾算注释(compose 同样要求 # 前有空白才算注释,
#      所以 `URL=https://x/#frag` 里的 # 不会被误删)
#   2. 值两端的成对引号剥掉
# 不支持 `export FOO=bar` 前缀 —— compose 自己也不支持,匹配不上会走「缺失」分支报错,
# 是正确的行为。
read_env_var() {
    [ -f ".env" ] || return 0
    grep -E "^[[:space:]]*$1[[:space:]]*=" .env 2>/dev/null \
        | tail -n 1 \
        | cut -d= -f2- \
        | sed -e 's/[[:space:]]#.*$//' \
              -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
              -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/" \
        || true
}

APP_ENV=$(read_env_var APP_ENV)
# 只用于部署前回显「这台机器对外自称是谁」,方便肉眼核对是不是站错了机器。
SITE_URL_ECHO=$(read_env_var SITE_URL)

# 「原本写死在代码里、后来改成 env」的值 —— 漏配的后果是**静默丢功能**。
#
# 这类项有个共同的坏性质:改造前它们在代码里恒有值,所以从来不需要配;改造后
# 缺了它们,页面照常渲染、日志照常干净,只是少了一块东西,要人肉去看才发现。
# 已知踩过的两个:ICP 备案号(合规公示项)与 Clarity 项目 ID(采集一停,数据不可回补)。
# 只对 APP_ENV=prod 告警,不阻断 —— 有些站点确实不需要备案号或不用 Clarity。
warn_missing_prod_env() {
    [ "${APP_ENV}" = "prod" ] || [ "${APP_ENV}" = "production" ] || return 0
    _missing=""
    for _v in ICP_BEIAN CLARITY_PROJECT_ID; do
        [ -n "$(read_env_var "$_v")" ] || _missing="${_missing} ${_v}"
    done
    [ -n "${_missing}" ] || return 0
    echo -e "${YELLOW}提示: 生产 .env 里以下变量为空或缺失:${_missing}${NC}"
    echo    "      这些值改造前写死在代码里,现在改由 env 提供。缺了不会报错,只是对应功能静默消失:"
    echo    "        ICP_BEIAN          → 页脚不再展示备案号(中国大陆运营的公示要求)"
    echo    "        CLARITY_PROJECT_ID → Microsoft Clarity 停止采集(会话录制/热图,数据不可回补)"
    echo    "      确认本站不需要则忽略此提示。"
    echo ""
}

if [ -z "${APP_ENV:-}" ]; then
    echo -e "${RED}错误: .env 里没有 APP_ENV${NC}"
    echo ""
    echo "这台机器扮演什么角色必须写明,否则一堆开关会按「权威生产站」取默认值 ——"
    echo "最典型的后果是测试站被搜索引擎当成生产站的镜像收录,稀释生产站的排名。"
    echo ""
    echo "在 .env 顶部加一行:"
    echo -e "  ${YELLOW}APP_ENV=prod${NC}   # 权威生产站"
    echo -e "  ${YELLOW}APP_ENV=test${NC}   # 测试 / 预发 / 克隆环境"
    exit 1
fi

case "${APP_ENV}" in
    prod|production)
        ENV_BANNER="${RED}生产环境 (APP_ENV=${APP_ENV})${NC}" ;;
    test|testing|staging|stage|preview)
        ENV_BANNER="${GREEN}测试环境 (APP_ENV=${APP_ENV})${NC}" ;;
    *)
        echo -e "${RED}错误: APP_ENV='${APP_ENV}' 不是可识别的值${NC}"
        echo "可用: prod / test(后端还认 staging|stage|preview|dev 等别名,但部署脚本只放行前两类)"
        exit 1 ;;
esac

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
echo -e "环境: ${ENV_BANNER}"
echo -e "站点: ${YELLOW}${SITE_URL_ECHO:-(.env 未设 SITE_URL)}${NC}"
echo -e "版本: ${YELLOW}${VERSION}${NC}"
echo -e "操作: ${YELLOW}${ACTION}${NC} (重启方式: ${YELLOW}${RESTART_MODE}${NC})"
echo -e "仓库: ${YELLOW}${REGISTRY}/${NAMESPACE}${NC}"
echo ""
warn_missing_prod_env

# 会改动服务的操作,在生产上要求一次显式确认。
#
# 理由是这套流程的具体形状:两台机器上的目录名、命令、脚本完全一样,分辨它们
# 全靠「我记得这个终端连的是哪台」。而最常见的误操作不是敲错命令,是**敲对了
# 命令但在错的机器上**。这一问只挡这一件事,代价是生产发版多按一个键。
# 非交互场景(CI / nohup)用 `DEPLOY_YES=1` 跳过。
case "${ACTION}" in
    all|rolling|restart)
        if [ "${APP_ENV}" = "prod" ] || [ "${APP_ENV}" = "production" ]; then
            if [ -z "${DEPLOY_YES:-}" ] && [ -t 0 ]; then
                echo -e "${RED}即将改动【生产环境】的运行服务。${NC}"
                read -p "确认继续? 输入 yes 继续,其它任意键取消: " CONFIRM_ENV
                if [ "${CONFIRM_ENV}" != "yes" ]; then
                    echo "已取消"
                    exit 0
                fi
                echo ""
            fi
        fi
        ;;
esac

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
