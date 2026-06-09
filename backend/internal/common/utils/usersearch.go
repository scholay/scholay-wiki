// 统一的「用户搜索」WHERE 片段 —— 全站 admin 列表按用户筛选都用它,保证口径一致:
//   · 关键词为纯数字 → 顺带按 ID 精确匹配(走主键/索引,快)
//   · username / email / phone 模糊匹配(LIKE,已转义元字符防注入/误匹配)
// 列名由调用方传(支持 JOIN 别名,如 "u.email");传空串的列跳过。
package utils

import (
	"strconv"
	"strings"
)

// UserSearchClause 构造「ID 精确 + username/email/phone 模糊」的 SQL 片段 + 参数。
// q 为空 → 返回 ("", nil),调用方据此不追加条件。idCol 传空 → 不做 ID 匹配。
//
// 性能:纯数字走 idCol = ?(主键/唯一索引,O(1));模糊用 LIKE '%q%'(前导通配符吃不到
// 索引,但 admin 检索 QPS 低、users 量级可控,可接受)。需要时可在调用侧改前缀匹配。
func UserSearchClause(q, idCol, usernameCol, emailCol, phoneCol string) (string, []any) {
	q = strings.TrimSpace(q)
	if q == "" {
		return "", nil
	}
	if len(q) > 100 {
		q = q[:100]
	}
	esc := strings.ReplaceAll(q, `\`, `\\`)
	esc = strings.ReplaceAll(esc, "%", `\%`)
	esc = strings.ReplaceAll(esc, "_", `\_`)
	like := "%" + esc + "%"

	var conds []string
	var args []any
	// 纯数字(且未溢出 uint64)→ 按 ID 精确匹配。
	if idCol != "" {
		if id, err := strconv.ParseUint(q, 10, 64); err == nil {
			conds = append(conds, idCol+" = ?")
			args = append(args, id)
		}
	}
	for _, col := range []string{usernameCol, emailCol, phoneCol} {
		if col != "" {
			conds = append(conds, col+` LIKE ? ESCAPE '\\'`)
			args = append(args, like)
		}
	}
	if len(conds) == 0 {
		return "", nil
	}
	return "(" + strings.Join(conds, " OR ") + ")", args
}
