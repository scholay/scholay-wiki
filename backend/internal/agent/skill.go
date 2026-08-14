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
	"log/slog"
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

	// 2026-07 线上审计:backend 撞 agent 旧镜像时 /api/agents 返回 501 (Not Implemented),
	// 此前当普通失败进熔断 + 启动线性退避重试 → 熔断器反复开合 11 分钟 ×40 条 ERROR 风暴。
	// 501 = 端点不存在,是部署版本错配的**永久**错误:首见记一条 ERROR 后置位短路,
	// 后续推送直接返回 nil(视作"已处理")让调用方(启动 sync 循环)立即停止重试,
	// 且不计入熔断失败窗口。
	if c.skillEndpointGone.Load() {
		return nil // 已确认端点不存在,静默跳过(详见首次那条 ERROR 日志)
	}

	var endpointGone bool
	_, err := circuitbreaker.AgentSkillBreaker.Execute(func() (any, error) {
		e := c.upsertAgentOnce(ctx, name, body)
		if isNotImplementedErr(e) {
			endpointGone = true
			return nil, nil // 永久错误不计入熔断失败窗口,不进熔断循环
		}
		return nil, e
	})
	if endpointGone {
		c.skillEndpointGone.Store(true)
		slog.Error("agent skill sync: /api/agents 返回 501 Not Implemented —— 线上 agent 镜像过旧(无此端点),已停止全部 feature 的 skill 推送重试;线上 agent 镜像需要与 backend 同版部署,升级后重启 backend 恢复推送",
			"agent", name, "base_url", c.baseURL)
		return nil
	}
	return err
}

// isNotImplementedErr 判断 err 是否 agent 返回 501(typed *HTTPError,errors.As 穿透 %w 包装)。
func isNotImplementedErr(err error) bool {
	if err == nil {
		return false
	}
	var httpErr *HTTPError
	return errors.As(err, &httpErr) && httpErr.StatusCode == http.StatusNotImplemented
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
		// 2026-07 线上审计:改用 typed *HTTPError(Error() 格式向后兼容 "agent http %d"),
		// 让 UpsertAgent 能以 errors.As 识别 501(旧镜像端点不存在)这类永久错误。
		return false, &HTTPError{StatusCode: resp.StatusCode}
	}
	return true, nil
}
