// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// internal/agentartifact —— Delivery 契约 (seam, C13)。
//
// 背景:「agent 把成品写进会话 cwd 的 ./out/ → 后端收割落 MinIO → 交付给 web 用户
// 下载/预览」这套能力目前**只有 claw 一个消费者**(见 internal/claw/artifact.go /
// artifact_harvest.go)。Prism 的 PDF 是**独立编译管线**(独立桶 scholar-prism、独立表
// prism_compiles、texclient 在 network_none 沙箱里 latexmk 编出,不是 agent 写 ./out),
// 不是第二消费者。smart_search/peerreview 无产出文件。
//
// 因此**不**把 claw 的 harvest/serve/dedup/reconcile 搬进通用层 —— 那些逻辑高度依赖 claw
// 的 ./out 目录约定、manifest.json 协议、同源 XSS 回写规则,搬进 bridge 只会污染通用层,
// 且让 P0 已验证的 claw 行为承担回归风险(为单一消费者过早抽象)。
//
// 取而代之只钉一个**最小契约**:任何想做「agent 产出 → MinIO 交付」的未来 feature,都应
// (1) 复用 *agentartifact.Repository 做元数据存取、(2) 通过 FeatureBridge.AgentClient()
// 读会话 workspace、(3) 抄 internal/claw/artifact*.go 的 harvest/serve 端点作为起点。
// Delivery 让这套依赖在编译期可被表达/替换(将来真出现第二消费者要抽 Harvester 时,先让它
// 依赖 Delivery 而非具体 Repository,消费者侧改动最小)。
//
// 这是 seam 而非框架:现在零成本(Repository 已天然满足),零运行时行为变更。
package agentartifact

// Delivery 是 agent 成果交付物「元数据存取」的最小契约。
// *Repository 已实现它(见下方编译期断言)。当前唯一实现/消费者是 claw;新增此接口
// 不改变任何运行时行为,纯粹把契约显式化,供未来 feature 依赖接口而非具体类型。
type Delivery interface {
	// Upsert 按 dedup_anchor 收割 upsert(内容/元信息列);身份列不动。
	Upsert(a *Artifact) error
	// GetByID 取一行;不存在 → ErrNotFound。
	GetByID(id uint64) (*Artifact, error)
	// GetByDedup 按收割键取一行;不存在 → ErrNotFound。
	GetByDedup(anchor string) (*Artifact, error)
	// ListBySession 列某会话全部交付物(created_at 升序)。
	ListBySession(sessionID string) ([]Artifact, error)
	// DeleteBySession 删某会话全部行,返回 storage_key 供删 MinIO(会话 TTL 清理)。
	DeleteBySession(sessionID string) ([]string, error)
	// DeleteStaleBySession 删 rel_path 不在 keepRelPaths 内的行(收割对账),返回 storage_key。
	DeleteStaleBySession(sessionID string, keepRelPaths []string) ([]string, error)
}

// 编译期保证 *Repository 满足 Delivery 契约。若将来给 Repository 改了方法签名而忘了
// 同步契约,这行会让 go build 直接失败 —— 这正是断言的价值(防接口/实现漂移)。
var _ Delivery = (*Repository)(nil)
