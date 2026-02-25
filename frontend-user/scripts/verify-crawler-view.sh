#!/bin/bash
#
# verify-crawler-view.sh
# Simulates AdsBot-Google / Googlebot requests to key pages
# and checks that pre-rendered content is present and well-formed.
#
# Usage:
#   ./scripts/verify-crawler-view.sh [BASE_URL]
#   Default BASE_URL: http://localhost:5411

set -euo pipefail

BASE_URL="${1:-http://localhost:5411}"
UA="AdsBot-Google (+http://www.google.com/adsbot.html)"

PAGES=(
  "/"
  "/blog"
  "/about"
  "/help"
  "/resources"
  "/pricing"
  "/privacy"
  "/terms"
  "/contact"
  "/features/search"
  "/features/ai-analysis"
  "/features/peer-review"
  "/features/latex-writer"
)

PASS=0
FAIL=0
WARN=0

extract_title() {
  echo "$1" | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' | head -1
}

count_tag() {
  echo "$1" | grep -o "<$2" | wc -l | tr -d ' '
}

check_page() {
  local path="$1"
  local url="${BASE_URL}${path}"
  local html
  html=$(curl -s -A "$UA" --max-time 10 "$url" 2>/dev/null || echo "CURL_FAILED")

  if [ "$html" = "CURL_FAILED" ]; then
    echo "  FAIL  $path  (request failed)"
    FAIL=$((FAIL + 1))
    return
  fi

  local size=${#html}
  local has_prerender=$(echo "$html" | grep -c 'seo-prerender' || true)
  local has_noscript=$(echo "$html" | grep -c '<noscript>' || true)
  local h1_count=$(count_tag "$html" "h1")
  local has_dark_bg=$(echo "$html" | grep -c 'background:#1a1a1a' || true)

  local text_len=0
  if [ "$has_prerender" -gt 0 ]; then
    text_len=$(echo "$html" | sed -n 's/.*id="seo-prerender"[^>]*>//p' | sed 's/<[^>]*>//g' | tr -s ' \n' ' ' | wc -c | tr -d ' ')
  fi

  local status="PASS"
  local notes=""

  if [ "$has_prerender" -eq 0 ]; then
    status="FAIL"
    notes="no seo-prerender"
  fi

  if [ "$has_noscript" -eq 0 ]; then
    if [ "$status" = "PASS" ]; then status="WARN"; fi
    notes="${notes:+$notes, }no noscript"
  fi

  if [ "$h1_count" -gt 1 ]; then
    if [ "$status" = "PASS" ]; then status="WARN"; fi
    notes="${notes:+$notes, }${h1_count} h1 tags"
  fi

  if [ "$has_dark_bg" -gt 0 ]; then
    if [ "$status" = "PASS" ]; then status="WARN"; fi
    notes="${notes:+$notes, }dark background detected"
  fi

  if [ "$text_len" -lt 200 ] && [ "$has_prerender" -gt 0 ]; then
    if [ "$status" = "PASS" ]; then status="WARN"; fi
    notes="${notes:+$notes, }thin content (${text_len}c)"
  fi

  if [ -z "$notes" ]; then
    notes="ok"
  fi

  printf "  %-5s %-30s %6d bytes  h1:%d  text:~%dc  %s\n" \
    "$status" "$path" "$size" "$h1_count" "$text_len" "$notes"

  case "$status" in
    PASS) PASS=$((PASS + 1)) ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
    WARN) WARN=$((WARN + 1)) ;;
  esac
}

echo "============================================"
echo "  Crawler View Verification"
echo "  Base URL: $BASE_URL"
echo "  User-Agent: $UA"
echo "============================================"
echo ""
echo "  Title from homepage:"
HOMEPAGE_HTML=$(curl -s -A "$UA" --max-time 10 "$BASE_URL/")
HOMETITLE=$(extract_title "$HOMEPAGE_HTML")
echo "  $HOMETITLE"
echo ""
echo "  Page results:"
echo "  ---"

for page in "${PAGES[@]}"; do
  check_page "$page"
done

echo ""
echo "============================================"
echo "  Summary: $PASS passed, $WARN warnings, $FAIL failed"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
