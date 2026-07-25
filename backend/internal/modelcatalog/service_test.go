// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// 能力绑定精简(2026-07)单测:purposeAlias 归并(制作PPT/科研绘图→claw、审稿子阶段合并、
// 写作内部子任务→prism)、ResolveChatDefault 不再分档、BindingViews 只出主 purpose 闭集。
// 直接灌 snapshot 缓存(cacheTTL 内 load 不触 DB),零 DB 依赖。

package modelcatalog

import (
	"testing"
	"time"
)

// newTestService 构造带预置快照的 Service(tierFn nil = 全按 free)。
func newTestService(bindings map[string]string, models []string, tierFn func(uint) string) *Service {
	snap := &snapshot{
		byModel:   map[string]*AgentModel{},
		bindings:  bindings,
		providers: map[uint64]*AgentProvider{},
	}
	for _, id := range models {
		m := &AgentModel{ModelID: id, Enabled: true, BillingWeight: 1}
		snap.byModel[id] = m
		snap.models = append(snap.models, *m)
	}
	s := &Service{cached: snap, cachedAt: time.Now(), tierResolver: tierFn}
	return s
}

// ResolveChatDefault 不再分免费/付费档:两档都走主绑定 chat_default.<feature>。
func TestResolveChatDefaultTierIndependent(t *testing.T) {
	binds := map[string]string{"chat_default.claw": "main-model"}
	free := newTestService(binds, []string{"main-model"}, nil)
	paid := newTestService(binds, []string{"main-model"}, func(uint) string { return "max" })
	if got := free.ResolveChatDefault("claw", 1); got != "main-model" {
		t.Fatalf("free user default = %q, want main-model", got)
	}
	if got := paid.ResolveChatDefault("claw", 1); got != "main-model" {
		t.Fatalf("paid user default = %q, want main-model", got)
	}
}

// 制作PPT / 科研绘图 经 purposeAlias 归到智能助手默认(chat_default.claw)。
func TestChatDefaultAliasToClaw(t *testing.T) {
	s := newTestService(map[string]string{
		"chat_default.claw": "claw-model",
	}, []string{"claw-model"}, nil)
	if got := s.ResolveChatDefault("boltslides", 1); got != "claw-model" {
		t.Fatalf("boltslides should alias to claw, got %q", got)
	}
	if got := s.ResolveChatDefault("sci_draw", 1); got != "claw-model" {
		t.Fatalf("sci_draw should alias to claw, got %q", got)
	}
	// 直接 Resolve 别名 key 也应归并(peerreview.modelFor 等调用方走的就是这条)。
	if got := s.Resolve("chat_default.sci_draw"); got != "claw-model" {
		t.Fatalf("Resolve(chat_default.sci_draw) should deref to claw, got %q", got)
	}
}

// 审稿子阶段合并:letter→meta、scoring/chief→methodology(调用方仍用各自原常量)。
func TestPeerreviewStageAliases(t *testing.T) {
	s := newTestService(map[string]string{
		"peerreview.meta":        "prefill-model",
		"peerreview.methodology": "review-model",
	}, []string{"prefill-model", "review-model"}, nil)
	cases := map[string]string{
		PurposePeerreviewMeta:        "prefill-model",
		PurposePeerreviewLetter:      "prefill-model", // 合并到预填识别
		PurposePeerreviewMethodology: "review-model",
		PurposePeerreviewScoring:     "review-model", // 合并到审稿环节
		PurposePeerreviewChief:       "review-model", // 合并到审稿环节
	}
	for purpose, want := range cases {
		if got := s.Resolve(purpose); got != want {
			t.Fatalf("Resolve(%q) = %q, want %q", purpose, got, want)
		}
	}
}

// 写作内部子任务(写作画像 planner / 修改意见拆条 revision)归到智能写作默认。
func TestPrismInternalTaskAliases(t *testing.T) {
	s := newTestService(map[string]string{
		"chat_default.prism": "prism-model",
	}, []string{"prism-model"}, nil)
	if got := s.Resolve(PurposePrismPlanner); got != "prism-model" {
		t.Fatalf("prism.planner should alias to chat_default.prism, got %q", got)
	}
	if got := s.Resolve(PurposeProjectRevision); got != "prism-model" {
		t.Fatalf("project.revision should alias to chat_default.prism, got %q", got)
	}
}

// BindingViews 只出精简后的主 purpose 闭集,不含被合并/折叠的别名 key。
func TestBindingViewsOnlyPrimaries(t *testing.T) {
	s := newTestService(map[string]string{
		"chat_default.claw": "claw-model",
	}, []string{"claw-model"}, nil)
	seen := map[string]bool{}
	for _, v := range s.BindingViews() {
		seen[v.Purpose] = true
	}
	// 主 purpose 必须在
	for _, p := range []string{PurposeChatDefaultClaw, PurposePeerreviewMeta, PurposePeerreviewMethodology, PurposeProjectTranslate} {
		if !seen[p] {
			t.Fatalf("BindingViews missing primary purpose %q", p)
		}
	}
	// 别名 key 绝不出现在 admin 绑定页
	for _, p := range []string{"chat_default.boltslides", "chat_default.sci_draw", PurposePeerreviewLetter, PurposePeerreviewScoring, PurposePeerreviewChief, PurposePrismPlanner, PurposeProjectRevision, "chat_default.claw.free"} {
		if seen[p] {
			t.Fatalf("BindingViews should NOT expose aliased/removed purpose %q", p)
		}
	}
}

// PriceUsage 输入长度分档:prompt(input+cacheRead+cacheWrite)过阈 → 高档**价**(P5 成本制:
// 只分价格,不再有倍率)。第一返回值 total = 四类 token 原始总量(不 ×倍率);cost = 真实微元成本。
func TestPriceUsageInputTier(t *testing.T) {
	s := newTestService(map[string]string{}, nil, nil)
	s.cached.byModel["qwen-tier"] = &AgentModel{
		ModelID: "qwen-tier", Enabled: true,
		PriceIn: 2, PriceOut: 8, PriceCacheR: 0.4,
		InputTierThreshold: 256000, PriceInHi: 6, PriceOutHi: 24, PriceCacheRHi: 1.2,
	}
	// 低档:prompt = 100000 ≤ 256000 → 基础价。total=100000+1000=101000;cost=100000*2+1000*8=208000。
	if w, cost := s.PriceUsage("qwen-tier", 100000, 1000, 0, 0); w != 101000 || cost != 208000 {
		t.Fatalf("low tier = (w=%d, cost=%d), want (101000, 208000)", w, cost)
	}
	// 高档:prompt = 300000 > 256000 → 高档价。total=300000+1000=301000;cost=300000*6+1000*24=1824000。
	if w, cost := s.PriceUsage("qwen-tier", 300000, 1000, 0, 0); w != 301000 || cost != 1824000 {
		t.Fatalf("hi tier = (w=%d, cost=%d), want (301000, 1824000)", w, cost)
	}
	// cacheRead 计入 prompt 分档:input=100000 + cacheRead=200000 = 300000 > 256000 → 高档价。
	// total=100000+0+200000=300000。
	if w, _ := s.PriceUsage("qwen-tier", 100000, 0, 200000, 0); w != 300000 {
		t.Fatalf("cacheRead should count toward tier: w=%d, want 300000", w)
	}
	// 高档价=0 时回落基础价(防误配清零):另建一个只配部分高档价的模型。
	s.cached.byModel["qwen-priceonly"] = &AgentModel{
		ModelID: "qwen-priceonly", Enabled: true,
		PriceIn: 2, PriceOut: 8, InputTierThreshold: 256000, PriceInHi: 6, PriceOutHi: 24,
	}
	// prompt=300000>阈值 → 高档价 6/24。total=300000+1000=301000;cost=300000*6+1000*24=1824000。
	if w, cost := s.PriceUsage("qwen-priceonly", 300000, 1000, 0, 0); w != 301000 || cost != 1824000 {
		t.Fatalf("hi-price-only = (w=%d, cost=%d), want (301000, 1824000)", w, cost)
	}
}

// 三档分档(0087):prompt 超过第一/第二阈值分别切档2(hi)/档3(hi2)。qwen3.7-flash 实价 1×/3×/6×。
func TestPriceUsageThreeTier(t *testing.T) {
	s := newTestService(map[string]string{}, nil, nil)
	s.cached.byModel["q37f"] = &AgentModel{
		ModelID: "q37f", Enabled: true,
		PriceIn: 0.2, PriceOut: 0.8, PriceCacheR: 0.04,
		InputTierThreshold: 32000, PriceInHi: 0.6, PriceOutHi: 2.4, PriceCacheRHi: 0.12,
		InputTierThreshold2: 256000, PriceInHi2: 1.2, PriceOutHi2: 4.8, PriceCacheRHi2: 0.24,
	}
	// 档1(≤32k):cost=10000*0.2 + 1000*0.8 = 2800。total=11000。
	if w, cost := s.PriceUsage("q37f", 10000, 1000, 0, 0); w != 11000 || cost != 2800 {
		t.Fatalf("tier1 = (w=%d, cost=%d), want (11000, 2800)", w, cost)
	}
	// 档2(32k<prompt≤256k):cost=100000*0.6 + 1000*2.4 = 62400。
	if w, cost := s.PriceUsage("q37f", 100000, 1000, 0, 0); w != 101000 || cost != 62400 {
		t.Fatalf("tier2 = (w=%d, cost=%d), want (101000, 62400)", w, cost)
	}
	// 档3(prompt>256k):cost=300000*1.2 + 1000*4.8 = 364800。
	if w, cost := s.PriceUsage("q37f", 300000, 1000, 0, 0); w != 301000 || cost != 364800 {
		t.Fatalf("tier3 = (w=%d, cost=%d), want (301000, 364800)", w, cost)
	}
	// cacheRead 计入 prompt 分档:input=20000 + cacheRead=250000 = 270000 > 256000 → 档3。
	// cost=20000*1.2(输入 hi2) + 250000*0.24(缓存 hi2) = 24000 + 60000 = 84000。
	if _, cost := s.PriceUsage("q37f", 20000, 0, 250000, 0); cost != 84000 {
		t.Fatalf("cacheRead should count toward tier3: cost=%d, want 84000", cost)
	}
}

// 不分档模型(InputTierThreshold=0):无论多长都走基础价。total=raw 总量,不 ×倍率。
func TestPriceUsageNoTier(t *testing.T) {
	s := newTestService(map[string]string{}, nil, nil)
	s.cached.byModel["flat"] = &AgentModel{
		ModelID: "flat", Enabled: true, PriceIn: 1, PriceOut: 2,
		InputTierThreshold: 0, PriceInHi: 99, // hi 值存在但阈值 0 → 永不生效
	}
	if w, cost := s.PriceUsage("flat", 999999, 1000, 0, 0); w != 1000999 || cost != 1001999 {
		t.Fatalf("no-tier = (w=%d, cost=%d), want (1000999, 1001999)", w, cost)
	}
}

// ListForUser 默认徽标与运行时下发一致(走主绑定,不分档)。
func TestListForUserDefaultBadge(t *testing.T) {
	s := newTestService(map[string]string{
		"chat_default.claw": "claw-model",
	}, []string{"claw-model"}, func(uint) string { return "" })
	for _, m := range s.cached.byModel {
		m.UserSelectable = true
	}
	for i := range s.cached.models {
		s.cached.models[i].UserSelectable = true
	}
	var def string
	for _, v := range s.ListForUser(1, "claw") {
		if v.IsDefault {
			def = v.ModelID
		}
	}
	if def != "claw-model" {
		t.Fatalf("default badge = %q, want claw-model", def)
	}
}
