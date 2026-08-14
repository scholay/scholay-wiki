package agentrun

import (
	"context"
	"strings"

	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/llmusage"
)

// 装配层:把 agentbridge 的类型转成引擎自己的类型。
//
// 🔴 为什么需要这一层而不是让 FeatureSpec 直接持 agentrun.RunTemplate:
//    agentrun 依赖 agentbridge(骑 SagaStepRow),反向依赖会成环。
//    所以 agentbridge 侧放一份**纯数据**的镜像结构,由这里转换。
//    两份结构必须逐字段对齐 —— 由 template_mirror_test.go 机械对咬,漂了当场红。

// FromSpecTemplates 把 FeatureSpec.RunTemplates 转成引擎模板。
func FromSpecTemplates(in []agentbridge.RunTemplateJSON) []RunTemplate {
	if len(in) == 0 {
		return nil
	}
	out := make([]RunTemplate, 0, len(in))
	for _, t := range in {
		steps := make([]StepDef, 0, len(t.Steps))
		for _, s := range t.Steps {
			steps = append(steps, StepDef{
				Key: s.Key, Brief: s.Brief, MaxRounds: s.MaxRounds, MaxRetry: s.MaxRetry,
			})
		}
		out = append(out, RunTemplate{Key: t.Key, Title: t.Title, Steps: steps})
	}
	return out
}

// SpecTemplateSource 从一组 FeatureBridge 读模板(生产实现)。
type SpecTemplateSource struct {
	features map[string][]RunTemplate
}

func NewSpecTemplateSource() *SpecTemplateSource {
	return &SpecTemplateSource{features: map[string][]RunTemplate{}}
}

// Add 注册一个剖面的模板。**注册期校验**:模板非法直接返回错误,
// 由 bootstrap 决定是 fatal 还是跳过 —— 绝不把一个 step_key 重复的模板放进运行期
// (那会在 uk_saga_step 上撞唯一键,表现成"Run 卡住"而不是"模板写错了")。
func (s *SpecTemplateSource) Add(featureKey string, tpls []RunTemplate) error {
	for _, t := range tpls {
		if err := t.Validate(); err != nil {
			return err
		}
	}
	if len(tpls) > 0 {
		s.features[featureKey] = tpls
	}
	return nil
}

func (s *SpecTemplateSource) Templates(featureKey string) []RunTemplate {
	if s == nil {
		return nil
	}
	return s.features[featureKey]
}

// ── StepExecutor 的生产实现 ───────────────────────────────────────────────────

// BridgeExecutor 用既有的 FeatureBridge.ServerSideChatStreaming 跑一步。
// **不新建执行路径** —— 与今天 peerreview 在生产用的是同一条路(见 model.go 边界 1)。
type BridgeExecutor struct {
	f *agentbridge.FeatureBridge
	// userID 由每步执行前 WithUser 绑定(Run 行上有 user_id)。
	userID *uint
}

// WithUser 返回一个绑定了用户归属的浅拷贝。**每步执行前必须调** ——
// 不绑就会走 ws_serverside 的兜底,账记到 peer_review 且 user_id 为空。
func (b *BridgeExecutor) WithUser(uid uint64) StepExecutor {
	u := uint(uid)
	return &BridgeExecutor{f: b.f, userID: &u}
}

func NewBridgeExecutor(f *agentbridge.FeatureBridge) *BridgeExecutor {
	if f == nil {
		return nil
	}
	return &BridgeExecutor{f: f}
}

func (b *BridgeExecutor) FeatureKey() string { return b.f.Spec().Key }

func (b *BridgeExecutor) SessionBusy(sessionID string) bool {
	if sessionID == "" {
		return false
	}
	return b.f.SessionBusy(sessionID)
}

// RunStep 发一步。maxRounds 目前**不下发**给执行器 —— 见下面的长注释。
func (b *BridgeExecutor) RunStep(ctx context.Context, sessionID, prompt string, maxRounds int) (string, error) {
	// 🔴 已知缺口(Phase 1 → Phase 2):ServerSideChatStreaming 的签名里**没有 maxRounds**,
	//    透传它需要改 ws_serverside.go 的帧组装(方案把这条排在 Phase 2 的 `ws.ts:466 透传`)。
	//    在那之前,Step 用执行器默认的 24 轮 —— 行为正确(只是每步更长、分页更少),
	//    **不会**变成静默失效:轮尽仍会发 round_cap,引擎的 isStepIncomplete 认不出它,
	//    于是走 RequeueStep 的通用失败分支 —— 一样重排队、一样能续跑,只是日志里记的是错误而非分页。
	//    这个降级是**刻意选的**:宁可 Phase 1 少一项收益,也不在本阶段改 server-side 帧组装
	//    (那条路径 peerreview 在生产用着,改它就不再是"用户零可见变化"了)。
	_ = maxRounds
	// 🔴 用量归属必须显式注入:ws_serverside.go 的 recordTurn 在 ctx 里取不到 llmusage.Call 时
	//    会把 feature **兜底成 peer_review**、UserID 留零值 ⇒ Run 的每一步都记成「AI 审稿」
	//    且挂不到人头上(NULL 写进账本后永久追不回是谁的)。
	//    SkipQuota 保持 false:Run 消耗的是真实上游 token,必须计入用户额度。
	//    ⚠️ 这只解决**归属**;CreateRun 之前的**额度闸**还没接(见 engineEnabled 的前置 ①)。
	ctx = llmusage.WithCall(ctx, llmusage.Call{
		Feature: b.FeatureKey(),
		UserID:  b.userID,
	})
	text, _, err := b.f.ServerSideChatStreaming(ctx, sessionID, prompt, nil, nil, "")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(text), nil
}
