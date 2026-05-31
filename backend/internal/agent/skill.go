// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agent

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"scholar-backend/internal/common/circuitbreaker"
)

// UpsertAgent 把一份 agent (subagent) 定义同步到 scholar_agent:
//   - GET /api/agents/:name 探测存在性 → 200 走 PUT, 404 走 POST
//   - 任何 4xx/5xx 都视为失败 (典型: agent 容器不可达)
//
// 业务侧不直接调本方法, 通过 agentbridge.Bridge.UpsertSkill(spec) 用 FeatureSpec 推送。
// 这里把通用能力留在 client 层是为了让 agentbridge 不依赖 circuitbreaker。
func (c *Client) UpsertAgent(ctx context.Context, name string, body map[string]any) error {
	if c.baseURL == "" {
		return errors.New("agent: empty base url")
	}
	if name == "" {
		return errors.New("agent: empty agent name")
	}

	_, err := circuitbreaker.AgentBreaker.Execute(func() (any, error) {
		return nil, c.upsertAgentOnce(ctx, name, body)
	})
	return err
}

// upsertAgentOnce 是 UpsertAgent 的真正实现, 单次不走断路器。
func (c *Client) upsertAgentOnce(ctx context.Context, name string, body map[string]any) error {
	exists, err := c.agentExists(ctx, name)
	if err != nil {
		return fmt.Errorf("probe agent: %w", err)
	}
	if exists {
		if err := c.doJSON(ctx, http.MethodPut, "/api/agents/"+name, body, nil); err != nil {
			return fmt.Errorf("put agent %s: %w", name, err)
		}
		return nil
	}
	if err := c.doJSON(ctx, http.MethodPost, "/api/agents", body, nil); err != nil {
		return fmt.Errorf("post agent: %w", err)
	}
	return nil
}

// agentExists GET /api/agents/:name → 200/404 → (true/false, nil); 其它错误正常上抛。
func (c *Client) agentExists(ctx context.Context, name string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/agents/"+name, nil)
	if err != nil {
		return false, err
	}
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if resp.StatusCode >= 400 {
		return false, fmt.Errorf("agent http %d", resp.StatusCode)
	}
	return true, nil
}
