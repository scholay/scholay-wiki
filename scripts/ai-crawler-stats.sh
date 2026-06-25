#!/bin/bash

# AI 爬虫命中统计 (GEO 监测)
#
# 区分两类 AI 生成式引擎爬虫,这是关键:
#   - 实时检索/取页类(被引信号): *-User / *-SearchBot / PerplexityBot
#     命中 = Scholar 正被当作某次 AI 回答的来源候选,是真实"被引用"的最强信号。
#   - 训练/批量类: GPTBot / ClaudeBot / Bytespider / CCBot 等
#     抓取量大但≠被引(Cloudflare 数据显示训练抓取占比极高却几乎不带量),不要拿它当成果。
#
# 用法:
#   ./scripts/ai-crawler-stats.sh         # 汇总统计(两类分别计数)
#   ./scripts/ai-crawler-stats.sh 20      # 额外列出最近 20 条 AI 爬虫命中明细
#   ./scripts/ai-crawler-stats.sh paths   # 列出 AI 爬虫最常抓取的 URL Top 20
#
# 注意: User-Agent 可伪造。要高置信度确认"真的是 OpenAI/Anthropic 的爬虫",
#       需对来源 IP 做反向 DNS 校验(各厂公布了官方 IP 段/PTR 规则),本脚本只看 UA。

set -euo pipefail

NGINX_CONTAINER="${NGINX_CONTAINER:-scholar_nginx}"

# 实时检索/取页类(被引信号)
RETRIEVAL_UAS=(
  "OAI-SearchBot"
  "ChatGPT-User"
  "Claude-SearchBot"
  "Claude-User"
  "PerplexityBot"
  "Perplexity-User"
)

# 训练/批量类
TRAINING_UAS=(
  "GPTBot"
  "ClaudeBot"
  "anthropic-ai"
  "Google-Extended"
  "Amazonbot"
  "Meta-ExternalAgent"
  "Bytespider"
  "CCBot"
  "cohere-ai"
  "Diffbot"
)

# 所有 AI UA 合并正则(给 paths / 明细模式用)
ALL_AI_RE="GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|anthropic-ai|PerplexityBot|Perplexity-User|Google-Extended|Amazonbot|Meta-ExternalAgent|Bytespider|CCBot|cohere-ai|Diffbot|YouBot|Timpibot"

echo "=========================================="
echo " AI 爬虫命中统计 (GEO 监测) · 容器: $NGINX_CONTAINER"
echo "=========================================="

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if ! docker logs "$NGINX_CONTAINER" >"$TMP" 2>&1; then
  echo "❌ 无法读取容器日志: $NGINX_CONTAINER (是否在运行? 用 NGINX_CONTAINER=xxx 覆盖名字)"
  exit 1
fi

count_bucket() {
  local total=0
  local ua n
  for ua in "$@"; do
    n="$(grep -ciE -- "$ua" "$TMP" || true)"
    printf "  %-22s %6d\n" "$ua" "$n"
    total=$((total + n))
  done
  echo "$total"
}

echo
echo "── 实时检索/取页类(被引信号 ✅ 看这个)──────────"
RETR_TOTAL="$(count_bucket "${RETRIEVAL_UAS[@]}" | tail -n1)"
count_bucket "${RETRIEVAL_UAS[@]}" | sed '$d'
printf "  %-22s %6s\n" "小计" "$RETR_TOTAL"

echo
echo "── 训练/批量类(抓取量 ≠ 被引,仅供参考)────────"
TRAIN_TOTAL="$(count_bucket "${TRAINING_UAS[@]}" | tail -n1)"
count_bucket "${TRAINING_UAS[@]}" | sed '$d'
printf "  %-22s %6s\n" "小计" "$TRAIN_TOTAL"

echo
echo "──────────────────────────────────────────"
echo "  被引信号(实时类)总命中: $RETR_TOTAL"
echo "  训练/批量类总命中:       $TRAIN_TOTAL"
echo "──────────────────────────────────────────"

ARG="${1:-}"
if [[ "$ARG" == "paths" ]]; then
  echo
  echo "── AI 爬虫最常抓取的 URL Top 20 ───────────"
  grep -E "$ALL_AI_RE" "$TMP" \
    | awk -F'"' '{print $2}' \
    | awk '{print $2}' \
    | sort | uniq -c | sort -rn | head -20
elif [[ "$ARG" =~ ^[0-9]+$ ]]; then
  echo
  echo "── 最近 $ARG 条 AI 爬虫命中明细 ───────────"
  grep -E "$ALL_AI_RE" "$TMP" | tail -n "$ARG"
fi

echo
echo "提示: UA 可伪造;高置信度需对来源 IP 反向 DNS 校验。Bytespider 会无视 robots.txt,"
echo "      只能靠 Nginx UA 限速/封堵。anthropic-ai 是已废弃旧 token,实时取页真名是 Claude-User。"
