// ============================================================================
// Prism 项目自动命名 —— 由 agent 容器生成(就跟智能助手会话起名同一套逻辑)。
//
// 为什么不在 backend 跑起名 LLM(旧实现 ai.Service.ChatCompletionWithLevel 已下线):
//   - 前端发编辑指令时随 user_message 帧带一个干净的 titleSeed —— 原始指令,**不含**
//     buildEditPrompt 的补丁协议前缀 / 全项目上下文 / 全文(否则 agent 拿巨型 prompt 起名会得到
//     每个项目都雷同的无意义标题,这正是当初绕开 agent 起名的原因)。
//   - agent 用 titleSeed 跑廉价标题模型生成项目名,经 session_title_updated(aiGenerated=true)帧回传。
//   - prism 标题真源在 backend DB(prism_projects.title),故 agent 只当「建议者」:backend 在
//     agentbridge pipe 里 tap 该帧 → 这里清洗(clamp/junk)+ 幂等落库(仅默认占位时写)。
// ============================================================================

package prism

import (
	"context"
	"log/slog"
	"strings"
)

// titleSink 持有 prism Service,供包级 OnTitleResult 回调反查 project + 落库。bootstrap 注入。
// 用包级 var:BuildSpec(构造 FeatureSpec)早于 NewService,而回调在运行期才求值,不受构造顺序影响
// (与 vipChecker / usageStatRecorder 同款手法)。
var titleSink *Service

// SetTitleSink 注入 prism Service(bootstrap 在 NewService 后调用一次;nil = 不落 agent 标题)。
func SetTitleSink(s *Service) { titleSink = s }

// handleAgentTitle 是 prism 的 agentbridge.OnTitleResultFn:agent 生成项目名后落 prism_projects.title。
// rawTitle 已是 agent 解析好的纯标题;这里再做一道清洗(clamp/junk)防垃圾/超长,
// UpdateProjectTitleIfDefault 保证幂等(用户已改名 / 已自动命名的项目永不被覆盖)。
// userID 来自已鉴权 WS 会话;反查 project 后校验归属,杜绝越权写他人项目。
func handleAgentTitle(_ context.Context, userID uint, sessionID, rawTitle string) {
	if titleSink == nil || userID == 0 || sessionID == "" {
		return
	}
	title := clampTitle(rawTitle)
	if title == "" || isJunkTitle(title) {
		// 模型偶发无意义应答(如裸 "ok")→ 保持默认名,交用户手动改,不写入垃圾标题。
		return
	}
	proj, err := titleSink.repo.GetProjectBySession(sessionID)
	if err != nil || proj == nil || proj.UserID != userID {
		return // 反查失败 / 归属不符 → 跳过
	}
	if ok, err := titleSink.repo.UpdateProjectTitleIfDefault(proj.ID, defaultProjectTitle, title); err != nil {
		slog.Warn("prism: agent auto-name persist failed", "project_id", proj.ID, "err", err)
	} else if ok {
		slog.Info("prism: project auto-named by agent", "project_id", proj.ID, "title", title)
	}
}

// isJunkTitle 过滤模型偶发的无意义应答(裸 "ok" / "好的" / 占位词),这类保持默认名让用户手动改。
func isJunkTitle(t string) bool {
	t = strings.TrimSpace(t)
	if len([]rune(t)) < 2 {
		return true
	}
	switch strings.ToLower(t) {
	case "ok", "okay", "好的", "好", "none", "null", "n/a", "na", "nil",
		"title", "untitled", "untitled session", "无标题", "未命名", "未命名项目", "项目", "新项目":
		return true
	}
	return false
}

func clampTitle(t string) string {
	t = strings.TrimSpace(t)
	t = strings.Trim(t, "\"'「」“”`")
	t = strings.TrimSpace(t)
	if r := []rune(t); len(r) > 40 { // 防御模型偶发长输出,按 rune 截断不切坏中文
		t = string(r[:40])
	}
	return t
}
