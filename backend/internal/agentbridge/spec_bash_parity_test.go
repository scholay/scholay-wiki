package agentbridge

import (
	"testing"

	"scholar-backend/internal/agent"
)

// Bash 能力面有**两个消费者**,必须同时改:
//
//	① agent 侧 —— SessionOptions.DisallowedTools(经 SessionDisallowedTools(base, allowBash) 构造),
//	   决定模型每轮在 tools[] 里**看不看得见** Bash;
//	② backend 侧 —— FeatureSpec.AllowBash → specDeny() → decidePermission 的 denyTools,
//	   决定这次调用**批不批**。
//
// 🔴 2026-08-01 prism 只改了 ①、漏了 ②,结果是最坏的一种半边接线:模型看得见 Bash、每次调用都被拒。
// 线上 48/48 次 100% 失败,持续 6 天,只打 INFO 日志 —— 没有任何红灯。
// Bridge.For() 现在会以 AllowBash 为准强制对齐;这里钉死那条对齐。
func denies(tools []string, want string) bool {
	for _, t := range tools {
		if t == want {
			return true
		}
	}
	return false
}

func TestReconcileBashCapability(t *testing.T) {
	t.Run("半边接线(agent 侧放开、AllowBash=false)被拉回禁用", func(t *testing.T) {
		// prism 2026-08-01~08-08 的真实状态。
		spec := FeatureSpec{
			Key:       "prism",
			AllowBash: false,
			SessionOptions: &agent.CreateSessionOptions{
				DisallowedTools: SessionDisallowedTools([]string{"NotebookEdit", "Task", "Agent", "ExportDocument"}, true),
			},
		}
		if denies(spec.SessionOptions.DisallowedTools, "Bash") {
			t.Fatal("前置条件不成立:改造前 agent 侧本来就没禁 Bash")
		}
		reconcileBashCapability(&spec)
		if !denies(spec.SessionOptions.DisallowedTools, "Bash") {
			t.Fatal("AllowBash=false 时 agent 侧必须被拉回禁用 —— 否则模型看得见一个必然失败的工具")
		}
		if !denies(specDeny(spec), "Bash") {
			t.Fatal("backend 侧也必须仍然禁用")
		}
		// 其余 denylist 项不得被弄丢。
		for _, want := range []string{"NotebookEdit", "Task", "Agent", "ExportDocument"} {
			if !denies(spec.SessionOptions.DisallowedTools, want) {
				t.Fatalf("重建 denylist 时丢了 %s", want)
			}
		}
	})

	t.Run("反向半边接线(AllowBash=true 但 agent 侧仍禁)被拉回放行", func(t *testing.T) {
		spec := FeatureSpec{
			Key:            "claw",
			AllowBash:      true,
			SessionOptions: &agent.CreateSessionOptions{DisallowedTools: SessionDisallowedTools([]string{"Task"}, false)},
		}
		reconcileBashCapability(&spec)
		if denies(spec.SessionOptions.DisallowedTools, "Bash") {
			t.Fatal("AllowBash=true 时 agent 侧不该禁 Bash")
		}
		if denies(specDeny(spec), "Bash") {
			t.Fatal("AllowBash=true 时 backend 侧不该禁 Bash")
		}
	})

	t.Run("两侧本就一致时零改动(不制造无谓的 denylist 抖动)", func(t *testing.T) {
		for _, allow := range []bool{true, false} {
			spec := FeatureSpec{
				Key:            "x",
				AllowBash:      allow,
				SessionOptions: &agent.CreateSessionOptions{DisallowedTools: SessionDisallowedTools([]string{"Task"}, allow)},
			}
			before := append([]string(nil), spec.SessionOptions.DisallowedTools...)
			reconcileBashCapability(&spec)
			after := spec.SessionOptions.DisallowedTools
			if len(before) != len(after) {
				t.Fatalf("allowBash=%v:一致的 spec 被改动了 %v → %v", allow, before, after)
			}
		}
	})

	t.Run("SessionOptions 为 nil 时不 panic", func(t *testing.T) {
		spec := FeatureSpec{Key: "y", AllowBash: true}
		reconcileBashCapability(&spec)
	})
}
