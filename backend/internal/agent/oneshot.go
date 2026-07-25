package agent

// 单次补全客户端 —— 调 agent 的 /api/complete(非流式)与 /api/complete/stream(SSE)。
// 无工具、无会话,像裸调大模型;model 由调用方(internal/ai 经 modelcatalog 能力绑定)显式解析后下发。
// 取代 internal/ai 原「第三方账号 key + 账户轮换」上游。usage 回传供 llmusage 计费。

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	// 单次补全往返超时(非流式:整段一次拿回,给足慢模型)。
	completeTimeout = 3 * time.Minute
	// 流式补全整体超时(逐块吐,给足长翻译/分析)。
	completeStreamTimeout = 5 * time.Minute
	// SSE 单帧上限(1MB),防异常大帧撑爆。
	sseMaxFrameBytes = 1024 * 1024
)

// CompleteMessage 单次补全的一条消息(role = user | assistant)。
type CompleteMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// CompleteRequest 单次补全入参(镜像 agent /api/complete)。Model 由调用方从能力绑定解析后显式给;
// 空则 agent 回落 active provider 的 main 槽位。
type CompleteRequest struct {
	Model       string            `json:"model,omitempty"`
	ProviderID  string            `json:"providerId,omitempty"`
	System      string            `json:"system,omitempty"`
	Messages    []CompleteMessage `json:"messages"`
	MaxTokens   int               `json:"max_tokens,omitempty"`
	Temperature *float64          `json:"temperature,omitempty"`
}

// CompleteUsage token 用量(镜像 agent OneShotUsage;喂 llmusage 计费链)。
type CompleteUsage struct {
	InputTokens         int    `json:"input_tokens"`
	OutputTokens        int    `json:"output_tokens"`
	CacheReadTokens     int    `json:"cache_read_tokens"`
	CacheCreationTokens int    `json:"cache_creation_tokens"`
	Model               string `json:"model"`
}

// CompleteResult 单次补全结果。
type CompleteResult struct {
	Text       string        `json:"text"`
	Usage      CompleteUsage `json:"usage"`
	StopReason string        `json:"stop_reason"`
}

// Complete 单次(非流式)补全:无工具/无会话,像裸调大模型。
func (c *Client) Complete(ctx context.Context, req *CompleteRequest) (*CompleteResult, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if len(req.Messages) == 0 {
		return nil, errors.New("agent: empty messages")
	}
	ctx, cancel := context.WithTimeout(ctx, completeTimeout)
	defer cancel()
	var out CompleteResult
	if err := c.doJSONWith(c.httpClientLong, ctx, http.MethodPost, "/api/complete", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// StreamComplete 流式单次补全:逐 text_delta 回调 onDelta,返回末尾 usage(计费用)。
// 翻译等需要把结果实时 SSE 吐给前端的功能用。onDelta 内自负快慢,失败返回 error(usage 可能非空=已收到 done 才置)。
func (c *Client) StreamComplete(ctx context.Context, req *CompleteRequest, onDelta func(string)) (*CompleteUsage, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if len(req.Messages) == 0 {
		return nil, errors.New("agent: empty messages")
	}
	ctx, cancel := context.WithTimeout(ctx, completeStreamTimeout)
	defer cancel()

	buf, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/complete/stream", bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	if c.authToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.authToken)
	}
	resp, err := c.httpClientLong.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, &HTTPError{StatusCode: resp.StatusCode, Raw: truncate(string(raw), 200)}
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), sseMaxFrameBytes)
	var usage *CompleteUsage
	var streamErr error
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" {
			continue
		}
		var ev struct {
			Type       string         `json:"type"`
			Text       string         `json:"text"`
			Usage      *CompleteUsage `json:"usage"`
			StopReason string         `json:"stop_reason"`
			Message    string         `json:"message"`
		}
		if json.Unmarshal([]byte(payload), &ev) != nil {
			continue
		}
		switch ev.Type {
		case "delta":
			if ev.Text != "" && onDelta != nil {
				onDelta(ev.Text)
			}
		case "done":
			usage = ev.Usage
		case "error":
			streamErr = fmt.Errorf("agent complete stream error: %s", ev.Message)
		}
	}
	if serr := scanner.Err(); serr != nil {
		return usage, fmt.Errorf("read sse: %w", serr)
	}
	if streamErr != nil {
		return usage, streamErr
	}
	return usage, nil
}
