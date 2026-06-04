// ============================================================================
// Prism 项目自动命名 —— 首次成功编辑后,用轻量模型(ModelLow)按用户指令给项目起名。
//
// 为什么不复用 agent 会话的自动标题:prism 给 agent 的首条 user_message 是 buildEditPrompt
// (patch 协议前缀 + 全项目上下文 + 全文,真实指令在末尾),agent 会基于这段巨型 prompt 起名 →
// 每个项目都得到同一个无意义标题。所以这里改用一次干净的轻量调用,只喂用户的原始指令。
// 全程 best-effort:任何失败仅记日志,绝不影响编辑结果;仅在标题仍是默认占位时落库(幂等)。
// ============================================================================

package prism

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/thirdparty"
)

const autoNameSystemPrompt = `你在为一篇 LaTeX 学术写作项目起名。根据用户的首条编辑指令,推断这篇论文/项目最可能的主题,生成一个简洁的中文项目名。
要求:3 到 12 个汉字,只给主题本身(不要带「项目」「论文」「研究」等冗余词、不要标点、不要引号)。
严格只输出 JSON,不要解释:{"title":"在此填写"}`

// maybeAutoNameProject 给项目自动起名(首次成功的「编辑」类操作后调用)。
// 先廉价校验标题仍是默认占位,再发一次 ModelLow 轻量调用,最后条件落库。
func (s *Service) maybeAutoNameProject(ctx context.Context, projectID, userID uint, instruction string) {
	if s.ai == nil {
		return
	}
	ins := strings.TrimSpace(instruction)
	if ins == "" {
		return
	}
	// 廉价前置闸:标题已非默认(用户改过 / 已自动命名)→ 不再花 LLM。条件 UPDATE 是最终的并发兜底。
	p, err := s.repo.GetProject(projectID, userID)
	if err != nil || p == nil || p.Title != defaultProjectTitle {
		return
	}
	if len([]rune(ins)) > 300 {
		ins = string([]rune(ins)[:300])
	}

	// token 账本:挂到 prism feature(同 runStream 的咽喉点)。
	uid := userID
	ctx = llmusage.WithCall(ctx, llmusage.Call{Feature: llmusage.FeaturePrism, UserID: &uid})

	out, err := s.ai.ChatCompletionWithLevel(ctx, []ai.ChatMessage{
		{Role: "system", Content: autoNameSystemPrompt},
		{Role: "user", Content: ins},
	}, thirdparty.ModelLevelLow)
	if err != nil {
		slog.Warn("prism: auto-name LLM failed", "project_id", projectID, "err", err)
		return
	}
	title := parseAutoName(out)
	if title == "" || isJunkTitle(title) {
		// 模型偶发返回无意义应答(如裸 "ok")→ 保持默认名,交给用户手动改,不写入垃圾标题。
		return
	}
	if ok, err := s.repo.UpdateProjectTitleIfDefault(projectID, defaultProjectTitle, title); err != nil {
		slog.Warn("prism: auto-name persist failed", "project_id", projectID, "err", err)
	} else if ok {
		slog.Info("prism: project auto-named", "project_id", projectID, "title", title)
	}
}

// parseAutoName 解析轻量模型输出:优先 JSON {"title":...},降级取首行;去围栏/引号、按 rune 截断。
func parseAutoName(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	// 去掉可能的 ```json / ``` 围栏
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)

	// 优先解析内嵌 JSON 对象
	if i := strings.IndexByte(s, '{'); i >= 0 {
		if j := strings.LastIndexByte(s, '}'); j > i {
			var obj struct {
				Title string `json:"title"`
			}
			if json.Unmarshal([]byte(s[i:j+1]), &obj) == nil && strings.TrimSpace(obj.Title) != "" {
				return clampTitle(obj.Title)
			}
		}
	}
	// 降级:取第一行纯文本
	if nl := strings.IndexByte(s, '\n'); nl >= 0 {
		s = s[:nl]
	}
	return clampTitle(s)
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
