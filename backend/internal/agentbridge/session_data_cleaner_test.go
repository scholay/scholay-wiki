package agentbridge

import (
	"context"
	"testing"
)

// 会话字节数据清理钩子(0112 附件耐久化)的可达性回归。
//
// 这条不是在测「函数会不会调函数」,而是钉住一个已经发生过的漏网:删会话有**两类**路径,
//   ① 经 FeatureBridge.DeleteSessionByID / ResetSession —— Bridge 内部自己会调钩子;
//   ② 绕开它、直接 agent client DeleteSession(prism 删项目就是这条:owner_kind=project
//      的会话过不了 DeleteSessionByID 的用户级归属校验)。
//
// ② 那条上,钩子在改造后仍然一次都不会被触发 —— 用户删掉整个项目,附件行照样活着占额度,
// 而且没有任何报错。CleanSessionData 就是给 ② 用的显式出口,这里断言它真的接到了同一个钩子。
func TestCleanSessionDataReachesInjectedHook(t *testing.T) {
	b := &Bridge{}
	var seen []string
	b.SetSessionDataCleaner(func(_ context.Context, sessionID string) {
		seen = append(seen, sessionID)
	})
	f := &FeatureBridge{bridge: b}

	f.CleanSessionData(context.Background(), "sess-1")
	if len(seen) != 1 || seen[0] != "sess-1" {
		t.Fatalf("显式清理没有到达钩子(绕开 Bridge 删会话的路径上附件会永久残留), got %v", seen)
	}

	// 空 sessionID 不该被当成一次真的清理:DeleteBySession("") 会命中零行,
	// 但它会白打一次 DB,而且掩盖调用方「sessionID 忘了传」的 bug。
	f.CleanSessionData(context.Background(), "")
	if len(seen) != 1 {
		t.Fatalf("空 sessionID 应是 no-op, got %v", seen)
	}
}

// 未注入钩子(dev / 未装配耐久化)时必须是安静的 no-op,而不是 nil 解引用 panic ——
// 删会话是用户动作,它绝不能因为一个可选的清理钩子没装而 500。
func TestCleanSessionDataWithoutHookIsSafe(t *testing.T) {
	f := &FeatureBridge{bridge: &Bridge{}}
	f.CleanSessionData(context.Background(), "sess-1") // 不 panic 即通过
}
