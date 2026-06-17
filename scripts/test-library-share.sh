#!/usr/bin/env bash
# ============================================================================
# 文献集分享 端到端测试用例(对接本地 docker 运行栈,经 nginx :5411)
# ----------------------------------------------------------------------------
# 覆盖:创建(单篇/集合)→ 提取码校验 → 公开获取 → 转存(含幂等)→ 访问追踪 → 撤销。
# 自带两名测试用户(直接种入 MySQL,bcrypt 口令),跑完自动清理,可重复运行。
# 用法: bash scripts/test-library-share.sh   (需要 scholar_mysql + 后端在跑)
# 退出码: 0=全部通过, 1=有失败。
# ============================================================================
set -uo pipefail

BASE="http://localhost:5411/api/v1"
MYSQLX=(docker exec -i scholar_mysql mysql -u scholar_user -pscholar_pass scholar -N -e)
PASS="Sharetest123!"
EMAILS="('sharetest_sharer@test.local','sharetest_recipient@test.local')"

PASS_CNT=0; FAIL_CNT=0
ok(){ echo "  ✅ $1"; PASS_CNT=$((PASS_CNT+1)); }
ko(){ echo "  ❌ $1"; FAIL_CNT=$((FAIL_CNT+1)); }
assert_eq(){ if [ "$2" = "$3" ]; then ok "$1 ($2)"; else ko "$1: 期望 '$3' 实得 '$2'"; fi; }

mysql_e(){ "${MYSQLX[@]}" "$1" 2>/dev/null; }

cleanup(){
  mysql_e "DELETE sp FROM library_share_papers sp JOIN library_shares s ON sp.share_id=s.id JOIN users u ON s.user_id=u.id WHERE u.email IN $EMAILS;"
  mysql_e "DELETE sa FROM library_share_access sa JOIN library_shares s ON sa.share_id=s.id JOIN users u ON s.user_id=u.id WHERE u.email IN $EMAILS;"
  mysql_e "DELETE s FROM library_shares s JOIN users u ON s.user_id=u.id WHERE u.email IN $EMAILS;"
  mysql_e "DELETE p FROM user_library_papers p JOIN users u ON p.user_id=u.id WHERE u.email IN $EMAILS;"
  mysql_e "DELETE f FROM user_library_folders f JOIN users u ON f.user_id=u.id WHERE u.email IN $EMAILS;"
  mysql_e "DELETE FROM users WHERE email IN $EMAILS;"
}
trap cleanup EXIT
cleanup  # 清掉上次残留

# bcrypt 口令:htpasswd 产 \$2y\$,Go bcrypt 只认 \$2a\$/\$2b\$ —— 同算法,改前缀即可。
HASH=$(htpasswd -bnBC 10 "" "$PASS" | tr -d '\n' | cut -d: -f2 | sed 's/^\$2y\$/\$2a\$/')
for who in sharer recipient; do
  mysql_e "INSERT INTO users (username,email,password_hash,role,status,email_verified,created_at,updated_at) VALUES ('sharetest_$who','sharetest_$who@test.local','$HASH','user',1,1,NOW(),NOW());"
done

login(){ curl -s -X POST "$BASE/user/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"sharetest_$1@test.local\",\"password\":\"$PASS\"}" | jq -r '.data.token // empty'; }

echo "── 登录 ──────────────────────────────────────"
T1=$(login sharer); T2=$(login recipient)
[ -n "$T1" ] && ok "sharer 登录" || { ko "sharer 登录失败(检查 Turnstile 是否开启)"; echo "通过 $PASS_CNT / 失败 $((FAIL_CNT+1))"; exit 1; }
[ -n "$T2" ] && ok "recipient 登录" || ko "recipient 登录失败"

auth1=(-H "Authorization: Bearer $T1"); auth2=(-H "Authorization: Bearer $T2")

echo "── 准备:文件夹 + 论文(sharer) ───────────────"
FID=$(curl -s -X POST "$BASE/user/library/folders" "${auth1[@]}" -H 'Content-Type: application/json' -d '{"name":"分享E2E测试集"}' | jq -r '.data.id // empty')
[ -n "$FID" ] && ok "新建文件夹 id=$FID" || ko "新建文件夹失败"
for n in 1 2; do
  curl -s -X POST "$BASE/user/library" "${auth1[@]}" -H 'Content-Type: application/json' \
    -d "{\"source\":\"stc\",\"source_paper_id\":\"SHARE_E2E_P$n\",\"title\":\"E2E 测试论文 $n\",\"venue\":\"NeurIPS\",\"year\":2017,\"citation_count\":$((n*100)),\"folder_id\":$FID}" >/dev/null
done
ok "加入 2 篇论文到文件夹"

echo "── 创建集合分享(带提取码 + 7 天过期) ─────────"
CR=$(curl -s -X POST "$BASE/user/library/shares" "${auth1[@]}" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"collection\",\"folder_id\":$FID,\"with_code\":true,\"expires_in_days\":7}")
TOKEN=$(jq -r '.data.token // empty' <<<"$CR")
CODE=$(jq -r '.data.extract_code // empty' <<<"$CR")
SID=$(jq -r '.data.id // empty' <<<"$CR")
assert_eq "分享篇目数" "$(jq -r '.data.paper_count' <<<"$CR")" "2"
[ -n "$TOKEN" ] && ok "拿到 token=$TOKEN" || ko "未拿到 token"
[ -n "$CODE" ] && ok "拿到提取码=$CODE" || ko "未生成提取码"

echo "── 公开获取(提取码门禁) ──────────────────────"
assert_eq "无提取码 → need_code" "$(curl -s "$BASE/public/share/$TOKEN" | jq -r '.data.need_code')" "true"
assert_eq "错误提取码 → need_code" "$(curl -s "$BASE/public/share/$TOKEN?code=WRONG" | jq -r '.data.need_code')" "true"
PUB=$(curl -s "$BASE/public/share/$TOKEN?code=$CODE")
assert_eq "正确提取码 → need_code=false" "$(jq -r '.data.need_code' <<<"$PUB")" "false"
assert_eq "公开篇目数" "$(jq -r '.data.papers | length' <<<"$PUB")" "2"

echo "── 转存(recipient) ───────────────────────────"
C_NOCODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/user/library/shares/$TOKEN/save" "${auth2[@]}" -H 'Content-Type: application/json' -d '{}')
assert_eq "无提取码转存 → 403" "$C_NOCODE" "403"
SAVE=$(curl -s -X POST "$BASE/user/library/shares/$TOKEN/save" "${auth2[@]}" -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}")
assert_eq "转存新增" "$(jq -r '.data.added' <<<"$SAVE")" "2"
assert_eq "recipient 现已收藏 P1" "$(curl -s "$BASE/user/library/by-upstream/stc/SHARE_E2E_P1" "${auth2[@]}" | jq -r 'if .data then "yes" else "no" end')" "yes"
SAVE2=$(curl -s -X POST "$BASE/user/library/shares/$TOKEN/save" "${auth2[@]}" -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}")
assert_eq "重复转存幂等(added=0)" "$(jq -r '.data.added' <<<"$SAVE2")" "0"
assert_eq "重复转存幂等(skipped=2)" "$(jq -r '.data.skipped' <<<"$SAVE2")" "2"

echo "── 访问追踪(sharer 看记录) ───────────────────"
ACC=$(curl -s "$BASE/user/library/shares/$SID/access" "${auth1[@]}")
[ "$(jq -r '.data.save_count' <<<"$ACC")" -ge 1 ] && ok "save_count>=1" || ko "save_count 异常: $(jq -r '.data.save_count' <<<"$ACC")"
[ "$(jq -r '[.data.records[]|select(.action=="save")]|length' <<<"$ACC")" -ge 1 ] && ok "存在 save 访问记录" || ko "无 save 记录"

echo "── 单篇分享(无提取码) ────────────────────────"
SCR=$(curl -s -X POST "$BASE/user/library/shares" "${auth1[@]}" -H 'Content-Type: application/json' \
  -d '{"kind":"single","paper":{"source":"stc","source_paper_id":"SHARE_E2E_P1","title":"E2E 测试论文 1","venue":"NeurIPS","year":2017}}')
STOKEN=$(jq -r '.data.token // empty' <<<"$SCR")
SPUB=$(curl -s "$BASE/public/share/$STOKEN")
assert_eq "单篇公开 need_code=false" "$(jq -r '.data.need_code' <<<"$SPUB")" "false"
assert_eq "单篇公开篇目=1" "$(jq -r '.data.papers | length' <<<"$SPUB")" "1"

echo "── 列表 + 撤销 ────────────────────────────────"
[ "$(curl -s "$BASE/user/library/shares" "${auth1[@]}" | jq -r '.data.shares | length')" -ge 2 ] && ok "我的分享列表 >=2" || ko "分享列表异常"
curl -s -o /dev/null -X DELETE "$BASE/user/library/shares/$SID" "${auth1[@]}"
assert_eq "撤销后公开获取 → 404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/public/share/$TOKEN?code=$CODE")" "404"

echo ""
echo "════════════════════════════════════════════════"
echo "  通过 $PASS_CNT · 失败 $FAIL_CNT"
echo "════════════════════════════════════════════════"
[ "$FAIL_CNT" -eq 0 ]
