#!/usr/bin/env bash
# ============================================================================
# 成果交付链路 · 验收基线快照(2026-08-07 · 交付链路重建)
#
# 为什么要有它:三份候选设计稿都写了「需先测某某指标」,却把采集和改动排在同一批上线 ——
# 那样永远拿不到分母,事后只能说「感觉好多了」。本脚本把口径固化成可重跑的 SQL,
# 上线前跑一次、上线后按 created_at 切分再跑一次,每条判据都对着一个具体数字。
#
# 用法:
#   ./scripts/artifact-baseline.sh                 # 全量快照(上线前基线)
#   ./scripts/artifact-baseline.sh '2026-08-07 12:00:00'   # 只统计该时刻之后新增的行(上线后)
#
# 输出落 .cache/artifact-baselines/baseline-<时间戳>.txt 并同时打到 stdout。
# ============================================================================
set -euo pipefail

SINCE="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTDIR="${ARTIFACT_BASELINE_DIR:-$ROOT/.cache/artifact-baselines}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUTDIR/baseline-$STAMP.txt"
mkdir -p "$OUTDIR"

MYSQL_CONTAINER="${MYSQL_CONTAINER:-scholar_mysql}"
MYSQL_USER="${MYSQL_USER:-scholar_user}"
MYSQL_PASS="${MYSQL_PASS:-scholar_pass}"
MYSQL_DB="${MYSQL_DB:-scholar}"

# 行过滤:给了时刻就只看该时刻之后新增的产物行(上线后口径)。
if [[ -n "$SINCE" ]]; then
  A_WHERE="WHERE created_at > '$SINCE'"
  A_AND="AND created_at > '$SINCE'"
  # 🔴 分子分母必须同时过滤。第一版只过滤了产物行(分子)而没过滤「写过文件的会话」(分母),
  #    于是上线后立刻跑一次会显示「捕获率 7.1%」——那其实是「1 个新产物 ÷ 全期 14 个写文件会话」,
  #    一个读起来像灾难、实际毫无意义的数。一个会误导的指标比没有指标更糟。
  T_AND="AND t.created_at > '$SINCE'"
  SCOPE="仅统计 $SINCE 之后新增(分子分母同口径)"
else
  A_WHERE=""
  A_AND=""
  T_AND=""
  SCOPE="全量"
fi

q() { docker exec "$MYSQL_CONTAINER" mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" -e "$1" 2>&1 | grep -v '^mysql: \[Warning\]'; }

{
  echo "# 成果交付链路验收基线 · $STAMP · 口径:$SCOPE"
  echo

  echo "## 1. 轮次总量与终态分布"
  echo "   判据 V0-5 的分母来源。注意:异常轮里绝大多数是上游 overloaded、根本没产出文件,"
  echo "   所以「异常轮零帧」这个数**不能**直接当作产物丢失量(2026-08-07 曾据此高估 30 倍)。"
  q "SELECT status, COUNT(*) turns FROM agent_turns GROUP BY status ORDER BY turns DESC;"

  echo "## 2. 异常轮里真正写过文件的有几轮(V0-5 的诚实分母)"
  q "SELECT a.status, COUNT(DISTINCT a.id) turns,
        COUNT(DISTINCT CASE WHEN e.ev_type='tool_use' AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'\$.toolName'))
             IN ('Write','Edit','ExportDocument','BuildDeck','StatReport') THEN a.id END) turns_writing,
        COUNT(DISTINCT CASE WHEN e.ev_type='artifact' THEN a.id END) turns_with_frame
      FROM agent_turns a LEFT JOIN agent_turn_events e ON e.turn_id=a.id
      WHERE a.status IN ('failed','aborted','blocked') GROUP BY a.status;"

  echo "## 3. 🔴 V1-1 主判据:写过文件的会话 vs 真的留下产物行的会话"
  echo "   这是「文件输出在用户端看不到」的直接度量。修复前 claw 是 13 → 7(46% 丢失),sci_draw 11 → 7。"
  echo "   轮末收割钩子上线后,claw / sci_draw / boltslides 三行应当趋近 100%。"
  echo "   ⚠️ 只有 note 列为空的行可用 —— 另两行的分子分母不同源,百分比无意义,别拿它下结论。"
  q "SELECT w.feature_key,
        w.sessions_with_write,
        COALESCE(a.sessions_with_artifact,0) AS sessions_with_artifact,
        ROUND(100*COALESCE(a.sessions_with_artifact,0)/w.sessions_with_write,1) AS capture_pct,
        CASE w.feature_key
          WHEN 'stat_lab' THEN '⚠️勿用:产物多由 StatRun/Bash 里的 python 写出,不在分母的工具集里'
          WHEN 'prism'    THEN '⚠️勿用:无产物路由(交付走 DB 真源),0% 是正确的'
          ELSE '' END AS note
      FROM (SELECT t.feature_key, COUNT(DISTINCT t.agent_session_id) sessions_with_write
              FROM agent_turns t JOIN agent_turn_events e ON e.turn_id=t.id
             WHERE e.ev_type='tool_use'
               AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'\$.toolName')) IN ('Write','ExportDocument','BuildDeck','StatReport')
               $T_AND
             GROUP BY t.feature_key) w
      LEFT JOIN (SELECT feature_key, COUNT(DISTINCT session_id) sessions_with_artifact
                   FROM agent_artifacts $A_WHERE GROUP BY feature_key) a
        ON a.feature_key = w.feature_key
      ORDER BY w.sessions_with_write DESC;"

  echo "## 4. 产物行的质量画像(V0-1 / V0-2 / V1-4)"
  echo "   基线:1035 行 / title 非空 0 行 / 含 ≥8 位 hex 名 629 行(60.8%) / .py 209 行(20.2%)"
  q "SELECT '产物行数' k, COUNT(*) v FROM agent_artifacts $A_WHERE
     UNION ALL SELECT '有 title(友好名)', COUNT(*) FROM agent_artifacts WHERE title <> '' $A_AND
     UNION ALL SELECT '文件名含 >=8 位 hex', COUNT(*) FROM agent_artifacts WHERE filename REGEXP '[0-9a-f]{8,}' $A_AND
     UNION ALL SELECT '.py 当交付物', COUNT(*) FROM agent_artifacts WHERE filename LIKE '%.py' $A_AND
     UNION ALL SELECT '-N 后缀副本(路径分叉)', COUNT(*) FROM agent_artifacts WHERE filename REGEXP '-[0-9]+\\\\.[A-Za-z0-9]+\$' $A_AND
     UNION ALL SELECT '被原地更新过(编辑生效)', COUNT(*) FROM agent_artifacts WHERE updated_at > created_at $A_AND;"

  echo "## 5. 正文路径泄漏率(V0-3),分 feature"
  echo "   基线:全站 31.2%(221/709)· sci_draw 76.5% · stat_lab 36.0% · claw 7.5% · prism 0%"
  echo "   注意 GROUP_CONCAT 默认 1024 字节会腰斩正文、把泄漏率压到约 13% —— 必须先放大。"
  q "SET SESSION group_concat_max_len = 16777216;
     WITH t AS (
       SELECT e.turn_id, a.feature_key,
              GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(e.payload,'\$.text')) ORDER BY e.ev_seq SEPARATOR '') txt
         FROM agent_turn_events e JOIN agent_turns a ON a.id=e.turn_id
        WHERE e.ev_type='content_delta' GROUP BY e.turn_id, a.feature_key)
     SELECT feature_key, COUNT(*) turns,
            SUM(txt LIKE '%out/%') leak_out,
            ROUND(100*SUM(txt LIKE '%out/%')/COUNT(*),1) pct,
            SUM(txt LIKE '%./out%') dotout_only,
            SUM(txt LIKE '%bundle%') leak_bundle
       FROM t GROUP BY feature_key ORDER BY turns DESC;"

  echo "## 6. 工具调用分布(判断改动打在哪儿的依据)"
  q "SELECT JSON_UNQUOTE(JSON_EXTRACT(payload,'\$.toolName')) tool, COUNT(*) c
       FROM agent_turn_events WHERE ev_type='tool_use'
      GROUP BY tool ORDER BY c DESC LIMIT 15;"

  echo "## 7. 工具失败信号(Edit 契约手术的分母)"
  echo "   基线:Edit 调用 51 次,old_string not found **0 次** —— 所以「改不到」不是匹配失败。"
  q "SELECT SUM(payload LIKE '%old_string not found%') edit_notfound,
            SUM(payload LIKE '%binary file%') binary_read_refused,
            SUM(payload LIKE '%write failed%') write_failed,
            COUNT(*) total_tool_results
       FROM agent_turn_events WHERE ev_type='tool_result';"
} | tee "$OUT"

echo
echo "→ 已写入 $OUT"
