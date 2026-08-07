package prism

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// 「会话历史失联」的机械防线(2026-08-07 线上事故)。
//
// ── 事故 ──────────────────────────────────────────────────────────────────────
// 用户 1248 / 项目 367:14:30–14:59 做了 4 轮全文润色,回头对话历史全空。
// 数据侧实测:那 4 轮**完好地躺在 journal 里**(agent_turns.agent_session_id=0536f3c4…),
// 但 agent_sessions 里没有任何行指向它,prism_projects 的指针也早换成了别的会话。
// 全库同类孤儿:**64 个 prism 会话「有轮次、无映射行」**。
//
// ── 根因(一句话)────────────────────────────────────────────────────────────────
// **会话历史按 agent session id 索引,所以任何「换一个新 session id」的动作都等于丢历史。**
// 而 invalidateSessionForProfile(画像变更)在删 executor 会话之外,还清了项目指针
// (SetProjectSession(id,""))并解了绑(UnbindOwnerSession)——下次自然建一条全新空会话。
// 它的注释还写着「下次 seedHistoryFromJournal 重放历史」,但 seed 是按**新** id 去取的,
// 必然 0 条(线上日志:`seeded executor history … messages=0`)。
//
// ── 为什么需要这个测试 ────────────────────────────────────────────────────────
// 🔴 **这是同一个 bug 的第二次发作。** 2026-07-18 已经因为 proj105 事故删掉过
// recreateProjectSession(见 edit.go 的注释:「agent 404 时应重连同一 session_id …绝不换新会话」),
// 但那次只删了一个调用点,invalidateSessionForProfile 在做一模一样的事、没人发现,
// 而且**没有任何测试会红**。所以这次把不变式钉成机械规则:
//
//	切断「项目 ↔ 有历史的 session id」这条关联的动作,只允许出现在**新建对话**的路径上。
//
// 测试形态说明:这一族是**源码结构断言**,不是行为断言 —— 因为要触发真实行为需要
// 一个活的 agent + DB,而这条不变式恰恰是在「没人跑得到的边角路径」上失守的。
// 结构断言在这里是对的工具:它拦的是「谁能调这两个 API」,而那正是失守点。

func readSrc(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(name)
	if err != nil {
		t.Fatalf("读不到 %s: %v", name, err)
	}
	return string(b)
}

// stripGoComments 去掉 // 与 /* */ 注释 —— 本包注释里大量出现被讨论的函数名,
// 不剥离会把注释里的提及计成调用(本仓库被这个模式坑过,见 frontend-user 的护栏口径)。
func stripGoComments(s string) string {
	s = regexp.MustCompile(`(?s)/\*.*?\*/`).ReplaceAllString(s, "")
	out := make([]string, 0, 256)
	for _, ln := range strings.Split(s, "\n") {
		if i := strings.Index(ln, "//"); i >= 0 {
			ln = ln[:i]
		}
		out = append(out, ln)
	}
	return strings.Join(out, "\n")
}

// 会切断「项目 ↔ session id」关联的两个 API。调用它们 = 让当前会话的历史失去入口。
var severingCalls = []string{
	`SetProjectSession(`,   // 清空/改写项目指针
	`UnbindOwnerSession(`,  // 删 agent_sessions 归属行
}

// allowedSeveringFuncs —— 允许出现这两个调用的函数(白名单)。
//
// 只有「新建对话」这一类路径是正当的:它给项目挂上**另一条**对话,
// 旧对话仍然绑定、仍在列表里、历史仍可达。
var allowedSeveringFuncs = map[string]string{
	"newConversation":      "新建对话:旧对话仍绑定、仍可达,指针指向新的那条是正确语义",
	"createProjectSession": "首次建会话:此前项目根本没有会话,不存在可丢的历史",
	"DeleteProject":        "删项目:整个项目连同它的全部对话一起消失,解绑是正确且必要的",
}

func TestNoPathSeversLiveSessionFromItsHistory(t *testing.T) {
	// 🔴 扫**整个包目录**,不写死文件列表。
	//    第一版写的是 []string{"planner.go","edit.go",…} —— 那样新加一个文件就自动绕过护栏,
	//    而本 bug 正是「新加的调用点没人发现」造成的。护栏自己不能有同款盲区。
	entries, derr := os.ReadDir(".")
	if derr != nil {
		t.Fatalf("读不到包目录: %v", derr)
	}
	files := make([]string, 0, len(entries))
	for _, e := range entries {
		n := e.Name()
		if !e.IsDir() && strings.HasSuffix(n, ".go") && !strings.HasSuffix(n, "_test.go") {
			files = append(files, n)
		}
	}
	if len(files) < 3 {
		t.Fatalf("只扫到 %d 个 .go 文件 —— 目录读取多半坏了,此刻护栏形同虚设", len(files))
	}
	seen := 0
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		src := stripGoComments(string(raw))
		curFunc := ""
		for i, ln := range strings.Split(src, "\n") {
			if m := regexp.MustCompile(`^func (?:\([^)]*\) )?([A-Za-z_][A-Za-z0-9_]*)`).FindStringSubmatch(ln); m != nil {
				curFunc = m[1]
				// 声明行本身不是调用点(`func (r *Repository) SetProjectSession(...)` 会撞规则)。
				continue
			}
			for _, call := range severingCalls {
				if !strings.Contains(ln, call) {
					continue
				}
				seen++
				if _, ok := allowedSeveringFuncs[curFunc]; ok {
					continue
				}
				t.Errorf("%s:%d 在 %s() 里调用了 %s\n"+
					"    🔴 这会切断「项目 ↔ 当前 session id」的关联,而会话历史是**按 session id**\n"+
					"       索引在 journal 里的 —— 一旦切断,那段历史对用户就是凭空消失。\n"+
					"       2026-07-18 已经因此出过一次事故(proj105),2026-08-07 又出了一次\n"+
					"       (用户 1248 丢 4 轮全文润色,全库 64 个孤儿会话)。\n"+
					"    ✅ 要让新画像/新配置生效**不需要**换会话:executor 无状态,\n"+
					"       每次建连都会用 journal 历史 + 当前画像重新 seed(见 hub.seedHistoryFromJournal)。\n"+
					"    ✅ 确实要开一段新对话,走 newConversation() —— 旧对话仍绑定、仍可达。",
					f, i+1, curFunc, strings.TrimSuffix(call, "("))
			}
		}
	}
	// 锚点:这两个 API 必须真的还在被调用,否则本测试恒绿(本仓库最常见的假防线形态)。
	if seen == 0 {
		t.Fatal("锚点失效:一处 SetProjectSession/UnbindOwnerSession 调用都没扫到 —— " +
			"要么函数改名了,要么文件列表过期了。本测试此刻不提供任何保护,请修它而不是删它。")
	}
}

// 画像变更这条具体路径的定点回归:它是 2026-08-07 事故的真凶。
func TestProfileInvalidationKeepsSessionID(t *testing.T) {
	src := stripGoComments(readSrc(t, "planner.go"))
	i := strings.Index(src, "func (s *Service) invalidateSessionForProfile")
	if i < 0 {
		t.Fatal("找不到 invalidateSessionForProfile —— 改名了就同步改这个测试,别删")
	}
	body := src[i:]
	if j := strings.Index(body[1:], "\nfunc "); j >= 0 {
		body = body[:j]
	}
	for _, bad := range severingCalls {
		if strings.Contains(body, bad) {
			t.Errorf("invalidateSessionForProfile 又开始调 %s 了。\n"+
				"    这正是 2026-08-07 事故的真凶:改个写作画像 → 换新 session id → 整段对话历史失联。\n"+
				"    让新画像生效不需要换会话,删 executor 侧会话即可(下次建连会重新 seed)。",
				strings.TrimSuffix(bad, "("))
		}
	}
}
