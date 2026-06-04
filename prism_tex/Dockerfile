# Scholay Prism —— LaTeX 编译沙箱 (scholar_prism_tex)
#
# 设计 (见锁定架构 D3):
#   - 与硬化的 scholar_agent **分离**:TeX Live 体积大且 \write18/shell-escape 有提权面,
#     绝不进 agent 容器。这是一个只会编译 LaTeX、对外零网络的纯沙箱。
#   - **无 HTTP、无 Docker socket**:后端与本容器只通过共享卷 ./data/prism-work 通信
#     (后端写「任务目录 + .request 标记」,本容器 watcher 轮询编译、回写 status.json)。
#     因此运行期可以 network_mode: none(见 docker-compose),彻底断网。
#   - 双层禁 shell-escape:CLI `-no-shell-escape` + kpathsea(texmf.cnf / 同名 env)
#     shell_escape=f / openin_any=p / openout_any=p,即便调用方漏传 flag 也挡得住 \write18。
#
# 体积说明:为可靠性优先用 debian apt 的 texlive 包集(覆盖 article/amsmath/tikz-cd/
#   hyperref/biblatex + 中文 xelatex/ctex)。比 TinyTeX 大(~2GB 级),但无 CTAN 构建期
#   网络抖动、可复现。后续可换 TinyTeX + 固定 tlmgr 包集瘦身(锁定架构开放项)。
FROM debian:bookworm-slim

# apt 镜像按环境可覆盖(默认官方 deb.debian.org):
#   - 本机 / 有海外代理:默认 deb.debian.org 走全球 CDN 反而最快最稳(实测 ~700kB/s 不丢连);
#   - 纯国内直连:--build-arg APT_MIRROR=mirrors.aliyun.com。
# ⚠️ 若环境跑 clash/mihomo fake-ip,任何镜像都可能被代理拦成慢/丢连(阿里云被绕去海外更糟)——
#    治本是让 clash 对该镜像域名走 DIRECT,或构建期间关掉 TUN/系统代理。
ARG APT_MIRROR=deb.debian.org
RUN set -eux; \
    if [ "$APT_MIRROR" != "deb.debian.org" ]; then \
      for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
        [ -f "$f" ] && sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" "$f" || true; \
      done; \
    fi

# --no-install-recommends 砍掉文档/源码,只装引擎 + 编译实际用到的宏包。
# BuildKit 缓存挂载持久化已下载的 .deb:代理 / amd64 模拟构建下 ~2GB texlive 易丢连失败,
# 但失败重来**不再从头下**,多跑几次就能把包集齐(build-and-push 跨平台构建尤其需要)。
# docker-clean 默认装完即删 .deb,缓存挂载下要先删掉它才能留住缓存。
# 缓存挂载不进镜像,所以也不再需要 rm /var/lib/apt/lists;Acquire::Retries 容忍偶发丢连。
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean; \
    apt-get update && apt-get install -y --no-install-recommends -o Acquire::Retries=10 \
        latexmk \
        texlive-latex-base \
        texlive-latex-recommended \
        texlive-latex-extra \
        texlive-fonts-recommended \
        texlive-pictures \
        texlive-science \
        texlive-xetex \
        texlive-lang-chinese \
        texlive-bibtex-extra \
        biber \
        coreutils \
    && mktexlsr

# kpathsea 安全配置:用一份只读 texmf.cnf 前置到 TEXMFCNF,写死禁 shell-escape +
# 禁止读/写项目目录之外。trailing ':' = 之后接系统默认搜索路径。
COPY texmf.cnf /opt/prism/web2c/texmf.cnf
COPY entrypoint.sh /opt/prism/entrypoint.sh
RUN chmod +x /opt/prism/entrypoint.sh

# read_only rootfs 下,TeX 的可写目录(格式/字体缓存)必须落到 tmpfs。HOME 也指向 tmpfs。
ENV TEXMFCNF=/opt/prism/web2c: \
    HOME=/tmp \
    TEXMFVAR=/tmp/texmf-var \
    TEXMFCACHE=/tmp/texmf-cache \
    openin_any=p \
    openout_any=p \
    shell_escape=f \
    COMPILE_TIMEOUT=60

# 运行期:常驻 watcher 轮询 /work。容器另在 compose 里加 cap_drop/read_only/
# network_mode:none/pids/mem 限额(纵深防御)。Phase 0 以 root 运行(容器已极度受限:
# 无 cap、无网络、只读 rootfs、no-new-privileges),换非 root + 与后端对齐 uid 留作后续硬化。
CMD ["/opt/prism/entrypoint.sh"]
