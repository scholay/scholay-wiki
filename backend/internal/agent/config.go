// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agent

import "os"

const (
	defaultBaseURL = "http://scholar_agent:3456"
)

// LoadFromEnv 按 AGENT_BASE_URL / AGENT_AUTH_TOKEN 构造客户端;
// AGENT_AUTH_TOKEN 必须与 agent 容器的 ANTHROPIC_API_KEY 保持一致 ——
// 当 agent 监听 0.0.0.0 时其 /api/* 强制要求 Bearer 头(见 agent/src/server/middleware/auth.ts)。
func LoadFromEnv() *Client {
	baseURL := os.Getenv("AGENT_BASE_URL")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	return NewClient(baseURL, os.Getenv("AGENT_AUTH_TOKEN"))
}
