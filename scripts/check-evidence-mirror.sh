#!/usr/bin/env bash
# ============================================================================
# 跨包接线护栏 —— 校验对象横跨两个包、因此单包构建看不见的那一族规则。现在有两条:
#
#   ① 解析器镜像   agent/src/evidence/parse.ts  ←→  frontend-user/…/minicod-papers.ts
#   ② 工具放行面   agent 的 builtinRegistry     ←→  backend …/ws.go permissionAllowed
#
# 守卫本体分别是 agent/src/evidence/parse.mirror.test.ts(2026-08 证据账本 P0)与
# agent/src/tools/permissionParity.test.ts(2026-08 P1 收尾);
# 本脚本只做一件事:**让它们有一个自动执行点**,并且诚实汇报「有没有真的跑」。
#
# ⚠️ 文件名仍叫 check-evidence-mirror.sh(②是后加的)。刻意不改名:它被 .githooks/pre-push
#    与两处 CLAUDE.md 引用,改名的收益只有好听,代价是又一处可能对不上的引用。
#    以 TESTS_REL 为准 —— 那才是它实际跑什么的真源。
#
# 【为什么必须挂上闸】
#   P0 把前端那份唯一经实战的 minicod 解析器移植到了 agent 侧(不该重写,故移植),
#   移植即产生镜像:两侧必须同步演进。漂移的后果不是配色不一致 ——
#   是「前端能把 tool_result 解析成论文卡、账本却解析不出来」= 检索了但没入账,
#   正是 P0 要治的那个病灶原样复现。
#   而守卫写好之后,唯一跑它的方式是有人手动 `cd agent && bun test src`。
#   按本仓库自己的话:**一条永远绿的规则和一条不存在的规则等价。**
#
# 【为什么单独一个 gate,不塞进 check-design-system.sh】
#   两者都叫「跨包镜像」,但环境前置完全不同:设计护栏要 node + frontend-user/node_modules,
#   本护栏要 bun。塞在一起会产生一个隐蔽的连坐:只改后端、没装前端依赖时,
#   check-design-system.sh 在前置检查处 exit 2 提前返回,本护栏**一次都不会跑且没人知道** ——
#   那正是要消灭的「静默不检查」。两个独立 gate 各自出判决,pre-push 依次跑完再汇总。
#
# 【为什么要自己判「跳过」,而不是只看退出码】
#   实测 bun 1.3.14:整个 describe 被 skipIf 跳过时输出是
#       1 pass / 2 skip / 0 fail        退出码 0
#   —— 绿灯,和 vitest 一模一样的陷阱。所以照抄 frontend-user/scripts/design-guard.mjs 的做法:
#   读**结构化报告**(bun 的 junit reporter)拿到被跳过的**规则名**逐条打出来,
#   而不是 grep 摘要行(文案会随版本变,字段不会)。
#   本脚本是完整仓库口径 ⇒ 这里还有规则被跳过 = 直接判失败,
#   语义等价于设计护栏那侧的 DESIGN_GUARD_STRICT=1。
#
# 用法:
#   scripts/check-evidence-mirror.sh
#
# 退出码(与 check-design-system.sh 同一套契约,pre-push 按三档区别对待,别随便改语义):
#   0 = 规则全部执行了,且全部通过
#   1 = 护栏失败(镜像漂移 / 完整仓库里仍有规则被跳过 / 守卫文件被删或改名)
#   2 = 环境未就绪(没装 bun,或 agent 包不在场)—— **没能检查**,不是「通过」
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT="$ROOT/agent"
# 只跑**跨包接线**这一族文件,不跑 agent 全量。pre-push 的成本预算是秒级:
# 实测这两个文件合计 ~60ms,全量则以秒计 —— 慢闸养出的是 `--no-verify` 的肌肉记忆,那比没有闸更糟。
#
# 这一族的共同性质:**校验对象横跨两个包**,因此单包的构建/测试都看不见它们,
# 只有在完整 checkout 上才可能被发现 —— 也就是最容易长期「静默不生效」的那一类规则。
#   · parse.mirror       agent/evidence/parse.ts ←→ frontend-user/minicod-papers.ts(解析行为)
#   · permissionParity   agent 的 builtin 工具 ←→ backend permissionAllowed(放行面)
#     2026-08 加入。它挡的是本仓库**咬过五次**的同一个坑:工具在 agent 造好、backend 忘了放行 →
#     命中 default-deny → 模型静默回落,零红灯。见该文件头。
#   · composeVolumeParity  docker-compose.yml ←→ docker-compose.prod.yml(agent 的 volumes)
#     2026-08 加入。它挡的是**已经发生过**的一次漂移:`./data/agent-sessions:/home/bun/sessions`
#     在 a30add8d2「优化 agent架构」把 dev 的 volumes 整块重写时被顺带删掉,prod 保住 ⇒
#     dev 与 prod 漂移两个月,而丢的正是数据持久化 —— 209 个 stat_lab 会话里 203 个的 bundle
#     (「交付物里每个数字可溯源」的唯一源)已不可复核。同批还丢了 /etc/localtime,那条
#     在 2026-07 被单独补回 = **当时已排查过一轮却只补了两条里的一条**,证明人工复查挡不住这类漏项。
#   · skillSize          agent/src/skills/loader.ts 的 CAP ←→ agent-skills/**/SKILL.md 的体积
#     2026-08 加入。它挡的是**已经发生过两个月**的一次静默截断:stat_lab 的 workbench/SKILL.md
#     长期 8886 字而 cap 是 8000 ⇒ 末尾 886 字被切掉,丢的正好是三条法律禁语
#     (不许说「符合 GDPR/HIPAA」等)与隐私三句话原文。E2E 的「隐私三句话一句都没说」
#     因此被长期误诊成「模型不听话」,真因是那段文字从来没进过 system prompt。
#     跨包性质:cap 在 agent/,SKILL.md 在 agent-skills/,单包构建两边都看不全。
TESTS_REL=(
  "src/evidence/parse.mirror.test.ts"
  "src/tools/permissionParity.test.ts"
  "src/server/composeVolumeParity.test.ts"
  # AGENT_EXECUTOR_FEATURES:.env* 的显式名单不得少于 compose 默认值。
  #
  # 2026-08-13 补挂。这条测试早就写好了(而且写它的直接原因就是 2026-08-06 漏 stat_lab
  # 那次事故),但一直没进这个名单 —— 于是它从来没被自动跑过,而线上 .env 的
  # AGENT_EXECUTOR_FEATURES 就一直缺着 stat_lab、「数据分析」一直走已退役的 fork 路径,
  # 直到人肉比对线上 .env 才发现。
  # 正是本文件头写的那句:**一条永远绿的规则和一条不存在的规则等价。**
  "src/server/executorFeatures.test.ts"
  "src/skills/skillSize.test.ts"
)

banner() {
  echo ""
  echo "════════════════════════════════════════════════════════════════════════════"
  while [ "$#" -gt 0 ]; do echo " $1"; shift; done
  echo "════════════════════════════════════════════════════════════════════════════"
  echo ""
}

echo "跨包接线护栏(解析器镜像 + builtin 工具↔backend 放行面)"
echo "  仓库根: $ROOT"

# ── 环境前置:宁可明说「没能检查」,也不要给一个含义不明的绿灯 ────────────────────
if [ ! -d "$AGENT" ]; then
  echo "  ✗ 找不到 $AGENT —— agent 包不在场,镜像无从比对。"
  echo "    在完整仓库根上跑本脚本。"
  exit 2
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "  ✗ 找不到 bun —— 守卫跑不了(agent 包用 bun test)。"
  echo "    装 bun: https://bun.sh  (仓库 agent 容器内置)"
  echo "    (只改前端/后端、不想装 bun → 本次镜像护栏就是没跑,别当成通过。)"
  exit 2
fi

# 守卫文件不在 = 护栏本身被删/改名。这**不是**「环境未就绪」:agent 包都在场了,
# 它的文件就该在。判失败 —— 删掉一条规则和让它永远绿,后果是一样的。
for t in "${TESTS_REL[@]}"; do
  if [ ! -f "$AGENT/$t" ]; then
    banner "✗ 守卫文件不见了: agent/$t" \
           "   护栏被删或被改名 —— 判失败(这不是环境问题)。" \
           "   若确实要移动它,同步改本脚本里的 TESTS_REL。"
    exit 1
  fi
done

echo "  ✓ agent 包与守卫文件在场,bun $(bun --version)"
echo ""

# ── 跑守卫 ────────────────────────────────────────────────────────────────────
# junit 报告写临时文件:不落进仓库,不需要 .gitignore 配合。
REPORT="$(mktemp)" || { echo "  ✗ 创建临时文件失败。"; exit 2; }
trap 'rm -f "$REPORT"' EXIT

(cd "$AGENT" && bun test "${TESTS_REL[@]}" --reporter=junit --reporter-outfile="$REPORT")
rc=$?

# 哪个文件挂了 —— 判据必须用 junit 的**结构化字段**,不猜。
# ⚠️ bun 的 `classname` 是 describe 标题(本仓库是中文),**不是**文件名;
#    文件身份只在 <testsuite ... file="..."> 上。踩过一次:按 classname 匹配永远匹不中,
#    于是权限接线挂了却打出「两份解析器不一致」的横幅,把人送去调错的文件。
failed_files() {
  awk '
    /<testsuite /{
      f=""; n="";
      if (match($0, / file="[^"]*"/))     f = substr($0, RSTART+7, RLENGTH-8);
      if (match($0, / failures="[0-9]+"/)) { n = substr($0, RSTART, RLENGTH); sub(/failures="/, "", n); sub(/"$/, "", n) }
      if (f != "" && n != "" && n+0 > 0) print f;
    }
  ' "$REPORT" 2>/dev/null | sort -u
}

if [ "$rc" -ne 0 ]; then
  # 两族规则的失败原因与修法完全不同 —— 横幅必须说对是哪一族挂了。
  # 两族同时挂时两条都打(只打一条会让人修完一个以为完事)。
  bad="$(failed_files)"
  hit_perm=0; hit_parse=0; hit_vol=0
  case "$bad" in *permissionParity*)    hit_perm=1 ;; esac
  case "$bad" in *parse.mirror*)        hit_parse=1 ;; esac
  case "$bad" in *composeVolumeParity*) hit_vol=1 ;; esac
  hit_skill=0
  case "$bad" in *skillSize*) hit_skill=1 ;; esac
  # 一条都没识别出来(junit 格式变了 / 崩在测试之外)→ 全打,宁可多说也别指错方向。
  if [ "$hit_perm" -eq 0 ] && [ "$hit_parse" -eq 0 ] && [ "$hit_vol" -eq 0 ] && [ "$hit_skill" -eq 0 ]; then
    hit_perm=1; hit_parse=1; hit_vol=1; hit_skill=1
  fi

  if [ "$hit_perm" -eq 1 ]; then
    banner "✗ 跨包接线护栏失败 —— builtin 工具没在 backend 登记(上线即 DOA)。" \
           "   具体是哪个工具,见上面测试输出点名的那一行。" \
           "" \
           "   修法: backend/internal/agentbridge/ws.go 的 permissionAllowed 加一条显式分支" \
           "        (照抄 EvidenceGet 那段的形态,并写清放行面为何安全)。" \
           "" \
           "   ⚠️ 后果不是报错,是**静默失效**: permissionAllowed 是 default-deny,没登记的工具" \
           "      让模型收到「不存在该工具」→ 悄悄回落到没有该能力的行为,零红灯。" \
           "      本仓库已被这个坑咬过五次(ReadDocument/ExportDocument/BuildDeck/EvidenceGet/SubmitAnswer)。"
  fi
  if [ "$hit_parse" -eq 1 ]; then
    banner "✗ 跨包镜像护栏失败 —— 两份解析器已经不一致了。" \
           "   真源(实战验证过的那份): frontend-user/src/shared/lib/minicod-papers.ts" \
           "   镜像:                    agent/src/evidence/parse.ts" \
           "   规则与【为什么】见 agent/src/evidence/parse.mirror.test.ts 的文件头。" \
           "" \
           "   ⚠️ 漂移的后果不是样式不一致,是「前端认得的论文,账本认不得」= 检索了但没入账。" \
           "      先判断是哪一侧错,别为了绿灯改 fixture。"
  fi
  if [ "$hit_vol" -eq 1 ]; then
    banner "✗ compose 挂载漂移 —— docker-compose.yml 与 docker-compose.prod.yml 的 agent volumes 不一致。" \
           "   具体是哪一条只在哪一侧,见上面测试输出。" \
           "" \
           "   修法: 补齐缺的那一侧;若确实**只该**出现在一侧,把它加进" \
           "        agent/src/server/composeVolumeParity.test.ts 的 ALLOWED_DIFF 并写清理由。" \
           "" \
           "   ⚠️ 这条已经真的发生过一次: ./data/agent-sessions:/home/bun/sessions 在 dev 被顺带删掉," \
           "      漂移两个月无人知 —— 会话工作目录不落盘 ⇒ analysis/ 里的 bundle 随容器重建即灭," \
           "      而它是「交付物里每个数字可溯源」的唯一源。实测 209 个会话里 203 个已不可复核。"
  fi
  if [ "$hit_skill" -eq 1 ]; then
    banner "✗ SKILL 超长 —— 末尾内容会被静默截掉,**从未送达模型**。" \
           "   具体是哪份、超了多少,见上面测试输出。" \
           "" \
           "   ⚠️ 先别急着调大 agent/src/skills/loader.ts 的 PER_SKILL_CAP。" \
           "      SKILL.md 的写作惯例是**越重要的约束越往后写**(红线、禁语都在末尾)," \
           "      所以「从尾部截断」本身就与内容组织方式正面冲突 —— 调大只能治这一次。" \
           "      先问这份 SKILL 是不是可以更短(能查的东西不必枚举:引擎的 30 种情况" \
           "      已经可以 \`statkit situations\` 查)。确要调大,照 loader.ts 里那段注释重算一次账。" \
           "" \
           "   这条已经真的发生过:stat_lab 的 workbench/SKILL.md 超限 886 字两个月," \
           "   丢的正好是三条法律禁语与隐私三句话原文。"
  fi
  exit 1
fi

# ── 判「跳过」:测试全过 ≠ 测试都跑了 ──────────────────────────────────────────
# 被跳过的规则名(classname › name)。用 junit 的结构化字段,不 grep 摘要行文案。
skipped_names="$(awk '
  /<testcase /{
    n=""; c="";
    if (match($0, / name="[^"]*"/))      n = substr($0, RSTART+7,  RLENGTH-8);
    if (match($0, / classname="[^"]*"/)) c = substr($0, RSTART+12, RLENGTH-13);
    pending = (c == "" ? n : c " › " n);
    next
  }
  /<skipped/{ if (pending != "") { print pending; pending = "" } }
' "$REPORT" 2>/dev/null)"

skipped_count="$(awk '
  match($0, /<testsuites [^>]*skipped="[0-9]+"/){
    s = substr($0, RSTART, RLENGTH);
    match(s, /skipped="[0-9]+"/);
    print substr(s, RSTART + 9, RLENGTH - 10);
    exit
  }
' "$REPORT" 2>/dev/null)"

if [ ! -s "$REPORT" ] || [ -z "$skipped_count" ]; then
  # 读不到结构化报告 = **不知道有没有规则被跳过**。这本身就是要说出来的事。
  # 断言确实过了,所以不判失败(1);但也不是完整的绿灯,归到「没能检查」(2)。
  # 刻意不在这里红:bun 换个 junit 格式就堵死所有人的 push,而误报的下场从来是规则被放宽。
  banner "⚠️  证据账本镜像护栏:拿不到 bun 的 junit 报告," \
         "   本次运行【无法判断是否有规则被跳过】—— 绿灯请按「不确定」对待。" \
         "   (断言本身是通过的;可能是 bun 的 reporter 格式变了,去核对本脚本的 awk。)"
  exit 2
fi

if [ "$skipped_count" -ne 0 ]; then
  banner "⚠️  证据账本镜像护栏:本次运行有 $skipped_count 条规则被【跳过】—— 绿灯 ≠ 校验通过" \
         "" \
         "   被跳过的规则:" \
         "$(echo "$skipped_names" | sed 's/^/     ↓ /')" \
         "" \
         "   本脚本跑在**完整仓库**里,前端镜像源本就该在场 ⇒ 跳过只可能是:" \
         "     · 有人移动/删除了 frontend-user/src/shared/lib/minicod-papers.ts(或 data-source-brand / mask-tool-source)" \
         "     · 或 parse.mirror.test.ts 的在场判定(IN_FULL_REPO / MIRROR_PRESENT)被改坏" \
         "   两种都正是最该报警的时刻 —— 判失败,不放行。"
  exit 1
fi

echo ""
echo "✓ 跨包接线护栏通过,无规则被跳过:"
echo "    · 解析器镜像   parse.ts 与 minicod-papers.ts 行为一致"
echo "    · 工具放行面   每个 builtin 工具都已在 backend permissionAllowed 登记(无 DOA)"
echo "    · compose 挂载 dev 与 prod 的 agent volumes 一致(会话工作目录两侧都在)"
echo "    · SKILL 体积   每份 SKILL.md 都在 PER_SKILL_CAP 内(末尾的红线不会被静默截掉)"
