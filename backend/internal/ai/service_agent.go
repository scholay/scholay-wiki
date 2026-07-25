// ============================================================================
// 项目侧 LLM 走 agent 单次接口 —— 翻译 / 论文分析(对比矩阵)/ 公众号自动回复 / Prism 内联点评
// 原走「第三方账号 key + 账户轮换」,现改经 agent 的 /api/complete(+/stream)调 agent 模型,
// 模型由 modelcatalog 能力绑定(project.*)选。usage 仍落统一账本(source=project,model=目录
// 模型 → 加权计价生效)。未注入 agent 后端时回退旧第三方路径(平滑迁移 + 回滚)。
// ============================================================================

package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/modelcatalog"
	"scholar-backend/internal/thirdparty"
)

// 项目侧能力绑定 purpose —— re-export,免外部调用方(wechatofficial 等)直接依赖 modelcatalog。
const (
	PurposeTranslate = modelcatalog.PurposeProjectTranslate
	PurposeAnalysis  = modelcatalog.PurposeProjectAnalysis
	PurposeWechatOA  = modelcatalog.PurposeProjectWechatOA
	PurposeRevision  = modelcatalog.PurposeProjectRevision
)

// CompleteSimple 一次性廉价 (system, user) → 文本补全,模型由 project.revision 能力绑定选。
// 供 prism 修改意见拆条(SetCheapCompletionFn)复用;未接线 agent 时回退旧第三方路径。
func (s *Service) CompleteSimple(ctx context.Context, system, user string) (string, error) {
	return s.CompleteText(ctx, []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}, PurposeRevision)
}

// agentCompleter —— agent 单次补全后端(*agent.Client 实现;接口解耦便于测试/替换)。
type agentCompleter interface {
	Complete(ctx context.Context, req *agent.CompleteRequest) (*agent.CompleteResult, error)
	StreamComplete(ctx context.Context, req *agent.CompleteRequest, onDelta func(string)) (*agent.CompleteUsage, error)
}

// modelResolver —— 能力绑定 → 模型(*modelcatalog.Service.Resolve 实现)。
type modelResolver interface {
	Resolve(purpose string) string
}

// SetAgentBackend 注入 agent 单次补全后端 + 能力绑定解析器(bootstrap 调一次)。两者齐备才生效。
func (s *Service) SetAgentBackend(client agentCompleter, catalog modelResolver) {
	s.agentClient = client
	s.catalog = catalog
}

// agentReady 报告是否已接线到 agent 后端(否则回退旧第三方路径)。
func (s *Service) agentReady() bool { return s.agentClient != nil && s.catalog != nil }

// contentToText 把 ChatMessage.Content(MessageContent=any:string 或多模态 []any)压成纯文本。
// string 直返;[]any(OpenAI 形 {type:text,text} / {type:image_url,...})抽取 text 块拼接,
// 非文本块(图片等)丢弃并置 dropped=true(agent /api/complete 单次接口暂只支持文本);nil→空。
func contentToText(c MessageContent) (text string, dropped bool) {
	switch v := c.(type) {
	case string:
		return v, false
	case nil:
		return "", false
	case []any:
		var sb strings.Builder
		for _, part := range v {
			pm, ok := part.(map[string]any)
			if !ok {
				continue
			}
			if t, _ := pm["type"].(string); t == "text" {
				if s, _ := pm["text"].(string); s != "" {
					sb.WriteString(s)
				}
			} else {
				dropped = true // 非文本块(图片等)—— 单次接口不支持,丢弃 + 上层告警
			}
		}
		return sb.String(), dropped
	default:
		return fmt.Sprintf("%v", v), false
	}
}

// splitSystem 把 ChatMessage 列表拆成 system 串(所有 system 段拼接)+ user/assistant 消息(agent 形)。
// Content 统一压成文本(MessageContent 是 any);遇多模态非文本块(如公众号图片)丢弃并告警。
func splitSystem(messages []ChatMessage) (system string, out []agent.CompleteMessage) {
	for _, m := range messages {
		text, dropped := contentToText(m.Content)
		if dropped {
			slog.Warn("ai(agent): 单次补全丢弃了非文本内容(图片等多模态,/api/complete 暂只支持文本;如公众号图片自动回复视觉能力受影响)")
		}
		if m.Role == "system" {
			if system != "" && text != "" {
				system += "\n\n"
			}
			system += text
			continue
		}
		role := m.Role
		if role != "assistant" {
			role = "user"
		}
		out = append(out, agent.CompleteMessage{Role: role, Content: text})
	}
	return system, out
}

// CompleteText 单次(非流式)文本补全:模型由 purpose 能力绑定解析,usage 落账本。
// agent 后端未接线时回退旧第三方路径(ChatCompletionWithLevel,ModelLow 档),purpose 忽略。
func (s *Service) CompleteText(ctx context.Context, messages []ChatMessage, purpose string) (string, error) {
	if !s.agentReady() {
		return s.ChatCompletionWithLevel(ctx, messages, thirdparty.ModelLevelLow)
	}
	system, msgs := splitSystem(messages)
	res, err := s.agentClient.Complete(ctx, &agent.CompleteRequest{
		Model:     s.catalog.Resolve(purpose),
		System:    system,
		Messages:  msgs,
		MaxTokens: defaultLLMMaxTokens,
	})
	if err != nil {
		return "", err
	}
	s.recordAgentUsage(ctx, &res.Usage)
	return res.Text, nil
}

// streamViaAgent 流式补全:把 agent 的 text delta 包成前端认的 OpenAI SSE 帧写 writer;usage 落账本。
func (s *Service) streamViaAgent(ctx context.Context, purpose string, messages []ChatMessage, writer io.Writer) error {
	system, msgs := splitSystem(messages)
	usage, err := s.agentClient.StreamComplete(ctx, &agent.CompleteRequest{
		Model:     s.catalog.Resolve(purpose),
		System:    system,
		Messages:  msgs,
		MaxTokens: defaultLLMMaxTokens,
	}, func(delta string) { writeDeltaFrame(writer, delta) })
	// 即使流以 error 收尾,只要已收到 usage(done 帧)就记账,防漏计(评审 #3:StreamComplete 有意
	// 在 err 非空时也回非空 usage)。仅在「无错且无 usage」时告警漏计。
	if usage != nil {
		s.recordAgentUsage(ctx, usage)
	} else if err == nil {
		slog.Warn("ai(agent): streaming finished without usage — token NOT metered", "purpose", purpose)
	}
	return err
}

// writeDeltaFrame 写一帧前端认的 OpenAI 流式格式:data: {"choices":[{"delta":{"content":...}}]}\n\n
func writeDeltaFrame(writer io.Writer, content string) {
	if content == "" {
		return
	}
	frame := map[string]any{
		"choices": []map[string]any{{"delta": map[string]any{"content": content}}},
	}
	b, err := json.Marshal(frame)
	if err != nil {
		return
	}
	if _, err := fmt.Fprintf(writer, "data: %s\n\n", string(b)); err != nil {
		return
	}
	if f, ok := writer.(http.Flusher); ok {
		f.Flush()
	}
}

// recordAgentUsage 把 agent 单次补全的 usage 落统一账本(source=project;model=目录模型 → 加权计价)。
func (s *Service) recordAgentUsage(ctx context.Context, u *agent.CompleteUsage) {
	if s.llmRec == nil || u == nil {
		return
	}
	call := llmusage.CallFromCtx(ctx)
	s.llmRec.Record(llmusage.Usage{
		UserID:              call.UserID,
		Feature:             call.Feature,
		Source:              llmusage.SourceProject,
		Provider:            "agent",
		Model:               u.Model,
		SkipQuota:           call.SkipQuota,
		InputTokens:         u.InputTokens,
		OutputTokens:        u.OutputTokens,
		TotalTokens:         u.InputTokens + u.OutputTokens + u.CacheReadTokens + u.CacheCreationTokens,
		CacheReadTokens:     u.CacheReadTokens,
		CacheCreationTokens: u.CacheCreationTokens,
		RequestID:           call.RequestID,
	})
}
