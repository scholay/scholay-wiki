# Scholay clean-room agent executor —— raw @anthropic-ai/sdk tool-runner,provider-agnostic。
# 零 Claude Code CLI / cc-haha / Codex 血统。bun:1 slim,non-root,cap_drop(compose)。
FROM oven/bun:1-slim AS base
WORKDIR /app

# bubblewrap:P4b sandbox(SANDBOX_MODE=bwrap,仅生产真内核生效;none 模式不用但装着无害)。
# 文档转文本工具链:agent(claw / peerreview)用 Bash 把用户上传的**任意格式**转成文本自行分析
#   (设计原则:能力交给 agent 自控 tool,后端不预处理 —— 格式太多无法预判)。
#   poppler-utils=pdftotext(PDF);pandoc=通用转换(docx/odt/rtf/epub/html/latex…;
#     apt 版 3.1.11.1 只作依赖兜底,实际生效的是下方 /usr/local 的上游 3.10.1,能读 pptx/xlsx);
#   python3-docx=Word(pandoc 缺时兜底);python3-openpyxl=Excel 精读(定位 sheet/区域)。
#   注:python3-pptx 不在此 Debian 镜像的包库(packages.debian.org 无此包),pptx 读取走新 pandoc。
# ⚠️ pandoc ~150MB+Haskell,在 clash fake-ip 网络下 apt fetch 可能超时;生产构建网络能连阿里云镜像即可。
# 用阿里云 Debian 镜像,规避生产 clash fake-ip 导致 deb.debian.org 解析成假 IP 的构建超时
# (见 memory prod-apt-mirror-clash-fakeip)。
# chromium + fonts-noto-cjk:mermaid 图表服务端渲染(/render/mermaid,mermaid 必须真浏览器;
# CJK 字体缺失会渲成豆腐块)。~450MB,owner 已拍板要小程序内嵌真图。
RUN { sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; } \
    && apt-get update && apt-get install -y --no-install-recommends \
        bubblewrap ca-certificates poppler-utils pandoc python3 python3-docx python3-openpyxl \
        chromium fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
# emoji 字体单独一层:上面的大层(~1.1GB)已缓存,10MB 小层低内存增量构建
# (Docker Desktop 内存紧张时整层重装会 OOM Killed,别合并回去)。
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium

# Node.js —— 仅给「制作PPT」feature(boltslides)构建 bolt-slides 演示稿用。
# 容器主运行时是 bun;bun 跑 vite/rollup 构建有兼容风险,故单独装 Debian 的 node(bookworm=18.x,
# 满足 vite 5 的 node>=18)。~150MB,与已装的 pandoc/chromium 同量级,可接受。
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# 科研绘图(sci_draw)L1 数据图/统计图运行时:matplotlib + numpy + pandas。
# 构建期烧入(apt 走上面已设的阿里云镜像);运行期是断网 bwrap 沙箱 + cwd jail,无法 pip/apt,
# 故依赖必须镜像期就位(与 pandoc/chromium/node 同策略)。agent 用 Bash 跑 python 生成图落 ./out/
#   (KM/森林/ROC 等统计图 + 通用数据图,数据由用户提供,模型只选列/参数不发明数字)。
# 单独一层(~200-400MB,与 pandoc/chromium 同量级),别合进上面的大层(整层重装 Docker Desktop 易 OOM)。
# 中文标签:容器已装 fonts-noto-cjk(mermaid 用),skill 里让 matplotlib 设 Noto Sans CJK 字体避免豆腐块。
# ⚠️ 必须显式装 BLAS/LAPACK 运行库(libblas3/liblapack3):numpy(matplotlib/rdkit 都依赖它)运行期要
#    load libblas.so.3,--no-install-recommends 下虚拟包 provider 可能没被拉进来 → 运行期报
#    "libblas.so.3: cannot open shared object file"。而运行期是断网 bwrap 沙箱**装不了包**,故必须构建期就位。
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3-matplotlib python3-numpy python3-pandas \
        libblas3 liblapack3 \
    && rm -rf /var/lib/apt/lists/*

# 统计建模运行时(2026-08 证据账本 P0-a「运行时诚实化」)。
# 事故背景:agent-skills/claw-add/guides 的 methods-stats/SKILL.md 与 data-figures/SKILL.md 向模型
#   声明「claw 能用 python(statsmodels)真算」「scipy / statsmodels 做检验与建模」,而镜像里
#   statsmodels / sklearn / lifelines **根本没装**(2026-08-01 容器实测)。用户要混合效应模型 /
#   Cox 回归时,模型只剩「撞 ImportError」或「把数字编出来」两条路 —— 后者正是审计中效应量凭空
#   出现的机械成因。声明必须与镜像一致:要么装上,要么把话收回去(本层选前者,SKILL.md 同步改口径)。
# ⚠️ python3-scipy 在此**显式声明**。它此前只是 python3-pandas / python3-matplotlib 的传递依赖
#   (apt-cache rdepends --installed 实测),即「为画图装的包顺带带进来的」——上面那层哪天调整,
#   scipy 就会静默消失,而 SKILL.md 还在承诺它。显式列出 = apt 标记 manually-installed,不随上游漂移。
#   刻意放本层而不是回改上面那层:回改会让那个 ~300MB 的 apt 层缓存失效并整层重装(Docker Desktop
#   内存紧张时 OOM Killed,见上方注释);而 scipy 已在镜像里,在本层声明是零增量的。
# ⚠️ lifelines 必须走 pip,**不能写进 apt 列表**:Debian 里叫 `lifelines` 的包是同名的**家谱软件**
#   (text-based genealogy,apt-cache search 实测),装了会得到完全无关的东西 —— 那恰恰是本次要根除的
#   「声明与现实不符」的加深版。生存分析(KM / log-rank / Cox)的 python 库只在 PyPI 上。
#   用阿里云 PyPI 镜像(与 apt 阿里云镜像 / npmmirror 同理,规避生产 clash fake-ip 拉包超时);
#   钉死版本保证可复现(与下方 pandoc 3.10.1 vendor 同策略)。装完即 purge pip —— 运行期 jail 里
#   /usr 是只读 bind,本就装不了包,留着只是徒增面。
#   注:lifelines 的依赖(autograd / formulaic 等)均为纯 python;numpy/scipy/pandas/matplotlib 由
#   Debian 提供且版本已满足,pip 不会重装它们 —— 这一点由下方构建期断言机械保证,不靠人肉相信。
# 单独一层(实测 +130MB),别合进上面的大层(整层重装 Docker Desktop 易 OOM,同 sci_draw 层的理由)。
# 运行期是断网 bwrap 沙箱 + /usr 只读,pip/apt 都不可用 → 依赖必须构建期就位。
# pip 装到 /usr/local/lib/python3.*/dist-packages,已在 bwrap 的 `--ro-bind /usr /usr` 覆盖内(已实测)。
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3-scipy python3-statsmodels python3-sklearn python3-pip \
    && pip3 install --break-system-packages --no-cache-dir --root-user-action=ignore \
        -i https://mirrors.aliyun.com/pypi/simple/ lifelines==0.30.3 \
    && apt-get purge -y python3-pip && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -c "import numpy,scipy,pandas,matplotlib,statsmodels,sklearn,lifelines; assert numpy.__file__.startswith('/usr/lib/python3/dist-packages'), 'pip clobbered Debian numpy: '+numpy.__file__; print('stats engines OK', statsmodels.__version__, sklearn.__version__, lifelines.__version__)"

# 科研绘图(sci_draw)分子结构图运行时:RDKit。SMILES → 确定性 2D 结构图(MolDraw2DSVG,零幻觉),
# 药物/化学分子结构走它、不交给模型手画。单独一层(rdkit 较大);apt 走上面已设阿里云镜像;运行期断网可用。
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3-rdkit \
    && rm -rf /var/lib/apt/lists/*

# ExportDocument 的 PDF 引擎(pandoc --pdf-engine=weasyprint;2026-07 审计:EXECUTOR_PDF_ENGINE 从未
# 配置 + 镜像无引擎 = 半月 0 个 pdf 产出的另一半根因)。选 weasyprint:纯本地渲染(jail net:none 可用)、
# 走 fontconfig(/etc/fonts 已 bind 进 jail,fonts-noto-cjk 已装,中文不豆腐块)、无 TeX 依赖(体积可控)。
# 需配套 compose env EXECUTOR_PDF_ENGINE=weasyprint(registry.ts:566 读它启用 pdf 目标)。
RUN apt-get update && apt-get install -y --no-install-recommends \
        weasyprint \
    && rm -rf /var/lib/apt/lists/*

# pandoc 升级到上游 3.10.1(2026-07 文件上传调研落地):Debian trixie apt 版是 3.1.11.1,
# **读不了 pptx/xlsx**(pptx/xlsx 输入 reader 是 pandoc 3.8.3/2025-12 才新增;3.1 的 pptx 只有
# writer 没有 reader,上面第 11 行旧注释「pptx 走 pandoc」把 writer 误当 reader,已不成立)。
# ReadDocument 工具靠它支持 xlsx/pptx 抽文本(xlsx 每个工作表一张表,pptx 按幻灯片分节)。
# 装到 /usr/local/bin(PATH 优先于 apt 的 /usr/bin/pandoc,后者保留作 apt 依赖不动)。
# tarball vendor 进仓库(agent/vendor/pandoc/,双架构):生产 clash fake-ip 网络拉不动 GitHub
# release,构建必须离线可复现(与 apt 阿里云镜像同思路)。
COPY vendor/pandoc /tmp/pandoc-dist
RUN arch="$(dpkg --print-architecture)" \
    && tar -xzf "/tmp/pandoc-dist/pandoc-3.10.1-linux-${arch}.tar.gz" -C /usr/local --strip-components=1 pandoc-3.10.1/bin/pandoc \
    && rm -rf /tmp/pandoc-dist \
    && /usr/local/bin/pandoc --version | head -1 \
    && /usr/local/bin/pandoc --list-input-formats | grep -qx pptx \
    && /usr/local/bin/pandoc --list-input-formats | grep -qx xlsx

# 预置 bolt-slides 脚手架 + 预装 node_modules(镜像构建期一次性联网,运行期零安装)。
# 运行期执行器把 /opt/bolt-slides 的**源码**铺进会话可写 cwd,node_modules 用 symlink 指回这里,
# 只跑 `npm run build:deck` 产出单文件 HTML(见 src/server/sessions.ts 铺设 + /api/sessions/:id/build-deck)。
# 用 npmmirror 规避生产 clash fake-ip 拉包超时(与上面 apt 阿里云镜像同理)。
COPY bolt-slides-template /opt/bolt-slides
RUN cd /opt/bolt-slides \
    && npm ci --no-audit --no-fund --registry=https://registry.npmmirror.com \
    && npm cache clean --force 2>/dev/null || true

# deps(独立缓存层)
# COPY bun.lock 一起进镜像 + --frozen-lockfile:锁定精确版本(如 @minicod/mcp-server 钉在 0.4.1),
# 避免只 COPY package.json 时按 caret 现场解析导致「构建即漂移/不可复现」(旧行为漏了 lock → 见
# minicod 对齐审计 #14)。lock 与 package.json 不一致时 --frozen-lockfile 会 fail-fast 而非静默重解析。
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# source
COPY tsconfig.json ./
COPY src ./src

ENV PORT=3456
ENV NODE_ENV=production
EXPOSE 3456

# non-root(oven/bun 镜像自带 bun 用户)
USER bun

CMD ["bun", "run", "src/index.ts"]
