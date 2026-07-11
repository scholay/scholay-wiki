// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agent

import (
	"context"
	"io"

	"scholar-backend/internal/agentconfig"
)

// Executor 是 Go bridge 与 agent 执行后端对话的接缝(Web-native 重构 P3 漏项补齐,
// 见 docs/research/agent-service-analysis-2026-06/DETAILED-DESIGN-P3-EXECUTOR.md §1)。
//
// fork 的 *agent.Client 今天即满足本接口(零改动,见文件末 var _ 守卫);P3 的 clean-room
// executor(agentexec)实现同一接口 → 交换执行后端 = 一行 bootstrap,4 个 feature 模块零改动。
//
// 这 20 个方法全是 HTTP。**live agent→browser 的 WS pipe 不是接缝方法** —— Go hub 用
// BaseURL() 派生 URL + Authorization:Bearer<AuthToken()> 自己拨 raw WS,讲中性 frame 协议;
// peerreview 的 server-side drive 也跑在该 WS/Enqueue+poll 协议上(见 §5)。任何实现者除了这 20
// 个 HTTP 方法,还必须在 BaseURL() endpoint 讲同一 WS frame 协议。
type Executor interface {
	// connectivity / config
	BaseURL() string
	AuthToken() string
	Health(ctx context.Context) error
	UpsertAgent(ctx context.Context, name string, body map[string]any) error
	PushConfig(ctx context.Context, cfg *agentconfig.AgentConfig) error
	ListModels(ctx context.Context) (*ListModelsResponse, error)

	// session lifecycle
	CreateSession(ctx context.Context, opts *CreateSessionOptions) (*CreatedSession, error)
	DeleteSession(ctx context.Context, sessionID string) error
	PatchSession(ctx context.Context, sessionID, title string) error
	ListSessions(ctx context.Context, ids []string) (*ListSessionsResponse, error)

	// transcript / context read
	GetSessionMessages(ctx context.Context, sessionID string, limitTurns int) (*SessionMessagesResponse, error)
	GetSessionContextEstimate(ctx context.Context, sessionID string) (*SessionContextEstimate, error)

	// 公式渲染(TeX → PNG;小程序 rich-text 跑不了 KaTeX)。无会话,纯函数。
	RenderMath(ctx context.Context, tex string, display bool) (*MathRenderResult, error)
	// mermaid 图表渲染(源码 → PNG;小程序无 DOM)。无会话,纯函数,caller 配缓存。
	RenderMermaid(ctx context.Context, code string) (*MermaidRenderResult, error)

	// server-side drive(无 WS client 在线时,peerreview 用)
	EnqueueChatMessage(ctx context.Context, sessionID, content string) error
	GetChatStatus(ctx context.Context, sessionID string) (*ChatStatus, error)

	// workspace ops —— prism / claw
	PushSessionFile(ctx context.Context, sessionID, filename string, content io.Reader) (*PushedFile, error)
	GetWorkspaceFile(ctx context.Context, sessionID, relPath string) (*WorkspaceFile, error)
	ReadWorkspaceFileFull(ctx context.Context, sessionID, relPath string) (*WorkspaceFile, error)
	ReadWorkspaceFileRaw(ctx context.Context, sessionID, relPath string) (*WorkspaceRawFile, error)
	ListWorkspaceFiles(ctx context.Context, sessionID, relDir string) (*WorkspaceTree, error)
	PutWorkspaceFile(ctx context.Context, sessionID, relPath string, content []byte) error
	DeleteWorkspaceFile(ctx context.Context, sessionID, relPath string) error
}

// 编译期证明 fork client 零改动满足接缝。P3 的 agentexec.Client 也将加同款守卫。
var _ Executor = (*Client)(nil)
