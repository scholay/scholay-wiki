#!/usr/bin/env bash
# Scholay Prism 编译沙箱 watcher。
#
# 协议(后端 ↔ 本容器只经共享卷 /work,无网络):
#   后端: mkdir /work/<cid> → 写项目文件(main.tex/*.bib/*.sty/图...) → 原子写 /work/<cid>/.request
#         (.request 内容: 两行 `main=<入口.tex>` 与 `engine=pdflatex|xelatex`)
#   本容器: 轮询 /work,认领 .request(mv→.processing,单 watcher 无竞争)→ latexmk 编译
#           → 回写 main.pdf(成功时)+ compile.log + error.txt(摘要)+ 原子写 status.json
#   后端: 轮询 status.json 出现 → 读 pdf/log → 传 MinIO → 删 /work/<cid>
#
# status.json 只含安全标量(无需 JSON 转义):
#   {"status":"success|error","pdf":"main.pdf","log":"compile.log","exit":N,"duration_ms":N}
set -u

WORK="${PRISM_WORK_DIR:-/work}"
TIMEOUT="${COMPILE_TIMEOUT:-60}"
HEARTBEAT=/tmp/heartbeat
# 单文件写入上限(KB,ulimit -f 单位):防病态 .tex(\newwrite 循环 / compile.log 洪写)
# 把与 mysql/minio 共享的宿主分区写爆(磁盘耗尽 DoS)。legit PDF/log 远小于此。
MAXFILEKB="${COMPILE_MAX_FILE_KB:-102400}"   # 100MB
# 并发编译上限:认领走原子 mv(.request→.processing),天然单认领,可安全并行。
# 串行 watcher 下 2+ 并发用户会触发后端 95s 轮询超时(伪「编译服务异常」)。默认 3(评审 #11:2 仍是瓶颈,
# 3 并发用户会排队到超时)。**必须与容器 CPU/内存配额同步**:每个 latexmk ~0.5CPU + 250-400MB,
# compose 已把 prism-tex 提到 2CPU/1.5G 以匹配 MAXPAR=3。经 COMPILE_MAX_PARALLEL 按宿主实际算力调。
MAXPAR="${COMPILE_MAX_PARALLEL:-3}"

mkdir -p "${TEXMFVAR:-/tmp/texmf-var}" "${TEXMFCACHE:-/tmp/texmf-cache}" 2>/dev/null || true
echo "[prism_tex] watcher up · work=$WORK · timeout=${TIMEOUT}s"

# 编译单个任务目录。$1=任务目录(绝对)
compile_one() {
  local dir="$1"
  local main engine flag pdf log code start end dur status
  main=$(sed -n 's/^main=//p' "$dir/.processing" | head -1)
  engine=$(sed -n 's/^engine=//p' "$dir/.processing" | head -1)
  main="${main:-main.tex}"
  engine="${engine:-pdflatex}"
  # 仅允许 basename 入口(防 ../ 越界);非法则当 error。
  case "$main" in */*|..*|"") echo "invalid main: $main" > "$dir/error.txt"; _write_status "$dir" error "" "" 2 0; return;; esac

  flag="-pdf"
  [ "$engine" = "xelatex" ] && flag="-xelatex"
  log="compile.log"
  pdf="${main%.tex}.pdf"

  start=$(date +%s%3N)
  # 在任务目录内编译;-no-shell-escape 是三重保险之一(另两重: texmf.cnf + env)。
  # timeout -k 15: SIGTERM 到点(TIMEOUT)后再等 15s,仍没退出就 SIGKILL —— 确保卡死的
  #   latexmk/xelatex(重 TikZ/pgfplots 期间可能吃不到 SIGTERM)一定被收掉、status.json 一定回写;
  #   否则后端轮询不到 status,只能报「编译服务异常」。
  # 编译放后台,前台 while 持续刷新 heartbeat —— 长编译(>30s)期间不让 healthcheck 误判
  #   unhealthy(否则编排器重启容器会丢掉正在编的 status.json,同样表现为「编译服务异常」)。
  # ulimit -f $MAXFILEKB:任一输出文件超限即 SIGXFSZ 终止编译(防写爆共享磁盘);子 shell 内生效不影响 watcher。
  ( cd "$dir" && ulimit -f "$MAXFILEKB" && timeout -k 15 "$TIMEOUT" latexmk "$flag" -interaction=nonstopmode -halt-on-error \
      -no-shell-escape -outdir=. "$main" ) > "$dir/$log" 2>&1 &
  local pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    : > "$HEARTBEAT" 2>/dev/null || true
    sleep 1
  done
  wait "$pid"
  code=$?
  end=$(date +%s%3N)
  dur=$((end - start))

  if [ "$code" -eq 0 ] && [ -f "$dir/$pdf" ]; then
    status=success
    : > "$dir/error.txt"
  else
    status=error
    # 124 = timeout 的 SIGTERM;137 = 128+9(SIGKILL:来自 timeout -k 或内存超限 OOM)。
    if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
      echo "编译超时或资源超限(>${TIMEOUT}s,可尝试精简图表 / 减少 pgfplots 数据点)" > "$dir/error.txt"
    else
      # 取第一条有意义的报错行(latexmk/tex 后续多为级联,首条最有用)。
      grep -m1 -E '^! |^!|Error|Undefined|Emergency stop|Fatal' "$dir/$log" 2>/dev/null \
        | head -1 | cut -c1-480 > "$dir/error.txt" || true
      [ -s "$dir/error.txt" ] || echo "编译失败(exit=$code)" > "$dir/error.txt"
    fi
  fi
  _write_status "$dir" "$status" "$pdf" "$log" "$code" "$dur"
  echo "[prism_tex] $(basename "$dir") · $status · ${dur}ms · exit=$code"
}

# 原子写 status.json($1=dir $2=status $3=pdf $4=log $5=exit $6=dur_ms)
_write_status() {
  local dir="$1"
  printf '{"status":"%s","pdf":"%s","log":"%s","exit":%s,"duration_ms":%s}\n' \
    "$2" "$3" "$4" "$5" "$6" > "$dir/.status.tmp"
  mv -f "$dir/.status.tmp" "$dir/status.json"
}

while true; do
  : > "$HEARTBEAT" 2>/dev/null || true   # 健康检查心跳
  if [ -d "$WORK" ]; then
    for dir in "$WORK"/*/; do
      [ -d "$dir" ] || continue
      dir="${dir%/}"
      [ -f "$dir/status.json" ] && continue        # 已完成
      [ -f "$dir/.processing" ] && continue         # 进行中(异常残留也跳过,避免重复)
      [ -f "$dir/.request" ] || continue            # 未就绪
      mv -f "$dir/.request" "$dir/.processing" 2>/dev/null || continue  # 认领(原子)
      # 后台化编译 + 有界并行:认领后台跑;达到并行上限就等任意一个完成再认领下一个。
      # 主循环不再被单个长编译阻塞 → 心跳持续刷新、多用户不必排队到轮询超时。
      compile_one "$dir" &
      while [ "$(jobs -rp | wc -l)" -ge "$MAXPAR" ]; do
        : > "$HEARTBEAT" 2>/dev/null || true
        sleep 0.3
      done
    done
  fi
  sleep 0.5
done
