// ============================================================================
// 轮级 provider 故障转移 + 失败轮归责 的纯函数/纯内存单测(2026-07-31 线上审计 §五)。
//
// 线上证据:一位付费新客支付后 8 分钟连吃 3 次上游硬错误后永久流失,而同一会话下一轮落回
// 默认模型就成功了;另一位为 9 连败付了 9 轮 token 的钱。这两条各自对应下面两组断言:
//   - pickFailoverModel:失败时确实能挑出「换了 provider ∧ 用户有权用」的目标;
//   - turnFailureChargedToUser:平台责任的失败不计用户额度,用户任务导致的照计。
// ============================================================================

package agentbridge

import "testing"

// fakeCatalog 是 ModelCatalog 的测试替身:模型 → provider key,以及该用户能否用。
type fakeCatalog struct {
	chatDefault string
	systemMain  string
	provider    map[string]string // modelID → providerKey("" = 默认端点)
	forbidden   map[string]bool   // 该用户不可用(档位不够 / 未上架)
	price       map[string]int64  // modelID → 微元/token(缺项 = 目录 miss → cost 0)
}

func (c *fakeCatalog) Resolve(purpose string) string {
	if purpose == "system.main" {
		return c.systemMain
	}
	return ""
}
func (c *fakeCatalog) ResolveChatDefault(string, uint) string { return c.chatDefault }
func (c *fakeCatalog) ValidateUserModel(_ uint, modelID string) error {
	if c.forbidden[modelID] {
		return errQuotaTestForbidden
	}
	return nil
}
func (c *fakeCatalog) ContextWindow(string) int    { return 200000 }
func (c *fakeCatalog) MaxInput(string) int         { return 0 }
func (c *fakeCatalog) MaxOutput(string) int        { return 0 }
func (c *fakeCatalog) Vision(string) bool          { return false }
func (c *fakeCatalog) CostPerToken(string) float64 { return 0 }
func (c *fakeCatalog) ProviderKey(m string) string { return c.provider[m] }

// PriceUsage 测试替身:未在 price 里登记的模型 → cost=0(模拟目录 miss)。
// 登记了就按「每 token 该单价微元」线性计价,便于在测试里把成本算成整数。
func (c *fakeCatalog) PriceUsage(model string, in, out, cr, cw int) (int64, int64) {
	total := int64(in) + int64(out) + int64(cr) + int64(cw)
	return total, total * c.price[model]
}

type testErr string

func (e testErr) Error() string { return string(e) }

const errQuotaTestForbidden = testErr("该模型需要更高会员档位")

func hubWithCatalog(c *fakeCatalog) *sessionHub {
	return &sessionHub{
		f:      &FeatureBridge{bridge: &Bridge{catalog: c}, spec: FeatureSpec{Key: "claw"}},
		userID: 7,
	}
}

func TestPickFailoverModelSwitchesProvider(t *testing.T) {
	// 失败模型挂在额外端点 p2;feature 默认模型在默认端点 → 应切到默认模型(线上那次自愈的形态)。
	h := hubWithCatalog(&fakeCatalog{
		chatDefault: "glm-5.2",
		systemMain:  "glm-5.2",
		provider:    map[string]string{"deepseek-v4-pro": "scholay-p2", "glm-5.2": ""},
	})
	model, isDefault, ok := h.pickFailoverModel("deepseek-v4-pro", "scholay-p2")
	if !ok || model != "glm-5.2" || !isDefault {
		t.Fatalf("应切到默认端点的 glm-5.2, 得到 (%q, %v, %v)", model, isDefault, ok)
	}
}

func TestPickFailoverModelSkipsSameProvider(t *testing.T) {
	// 默认模型与失败模型同一个端点 → 跳过它,继续看 system.main(在另一个端点)。
	h := hubWithCatalog(&fakeCatalog{
		chatDefault: "deepseek-v4",
		systemMain:  "glm-5.2",
		provider: map[string]string{
			"deepseek-v4-pro": "scholay-p2", "deepseek-v4": "scholay-p2", "glm-5.2": "",
		},
	})
	model, isDefault, ok := h.pickFailoverModel("deepseek-v4-pro", "scholay-p2")
	if !ok || model != "glm-5.2" || isDefault {
		t.Fatalf("应跳过同端点候选切到 system.main, 得到 (%q, %v, %v)", model, isDefault, ok)
	}
}

func TestPickFailoverModelNoCandidate(t *testing.T) {
	// 整个池子只有一个端点 → 没得切,如实返回 false(错误照常上抛,绝不假装重试)。
	h := hubWithCatalog(&fakeCatalog{
		chatDefault: "glm-5.2",
		systemMain:  "glm-5.2",
		provider:    map[string]string{"glm-5.2-air": "", "glm-5.2": ""},
	})
	if _, _, ok := h.pickFailoverModel("glm-5.2-air", ""); ok {
		t.Fatal("同端点池不应产出故障转移目标")
	}
}

func TestPickFailoverModelNeverUpgradesTier(t *testing.T) {
	// 候选换了端点但用户档位不够 → 不选。故障转移绝不能变成「按错误路径白送高档模型」。
	h := hubWithCatalog(&fakeCatalog{
		chatDefault: "opus-flagship",
		systemMain:  "opus-flagship",
		provider:    map[string]string{"glm-5.2": "", "opus-flagship": "scholay-p9"},
		forbidden:   map[string]bool{"opus-flagship": true},
	})
	if _, _, ok := h.pickFailoverModel("glm-5.2", ""); ok {
		t.Fatal("用户无权使用的模型不得作为故障转移目标")
	}
}

func TestTurnFailureBillingResponsibility(t *testing.T) {
	// 用户任务导致的失败 → 照计额度。
	// round_cap / step_incomplete 于 2026-08-02 计费审计 P0-3 从「平台自担」挪到这里:
	// 它们与 budget 同源(用户任务撑爆我们设的上限),且完全由 prompt 内容确定性诱导 ——
	// 留在平台自担侧等于一条「复制粘贴同一条 prompt 即可无限免费」的通道。
	for _, code := range []string{"budget", "content_blocked", "quota_exceeded", "round_cap", "step_incomplete"} {
		if !turnFailureChargedToUser(code) {
			t.Fatalf("code=%s 应计入用户额度", code)
		}
	}
	// 平台责任的失败 → 记账本但不计用户额度。
	for _, code := range []string{"upstream", "overloaded", "busy", "model_protocol_error",
		"internal", "config", "empty_turn", "turn_timeout"} {
		if turnFailureChargedToUser(code) {
			t.Fatalf("code=%s 不应计入用户额度(平台自担)", code)
		}
	}
	// 默认口径:未登记的新 code 一律平台自担 —— 收钱的口子必须显式登记。
	if turnFailureChargedToUser("some_new_agent_code_2027") {
		t.Fatal("未知 code 默认必须是平台自担,不得默默向用户收失败的钱")
	}
}

func TestTurnFailureProviderRetryScope(t *testing.T) {
	for _, code := range []string{"upstream", "busy", "overloaded", "model_protocol_error"} {
		if !turnFailureWorthProviderRetry(code) {
			t.Fatalf("code=%s 应换 provider 重投", code)
		}
	}
	// 语义性失败换端点必然同样失败,重投只是白烧一遍钱。
	for _, code := range []string{"content_blocked", "budget", "round_cap", "quota_exceeded", "config", "internal", ""} {
		if turnFailureWorthProviderRetry(code) {
			t.Fatalf("code=%s 不应重投", code)
		}
	}
}

func TestErrorFrameCode(t *testing.T) {
	if got := errorFrameCode([]byte(`{"type":"error","code":"upstream","message":"x"}`)); got != "upstream" {
		t.Fatalf("code = %q", got)
	}
	// 非 error 帧不得被当成失败归责的依据。
	if got := errorFrameCode([]byte(`{"type":"message_complete","code":"upstream"}`)); got != "" {
		t.Fatalf("非 error 帧应返回空, 得到 %q", got)
	}
	if got := errorFrameCode([]byte("not json")); got != "" {
		t.Fatalf("非 JSON 应返回空, 得到 %q", got)
	}
}

func TestReplayHasVisibleOutput(t *testing.T) {
	invisible := [][]byte{
		[]byte(`{"type":"status","text":"思考中"}`),
		[]byte(`{"type":"pong"}`),
		[]byte(`{"type":"round_discarded"}`),
	}
	if replayHasVisibleOutput(invisible) {
		t.Fatal("纯控制面/保活帧不构成可见产出")
	}
	if !replayHasVisibleOutput(append(invisible, []byte(`{"type":"content_delta","text":"半"}`))) {
		t.Fatal("已流出正文必须阻止重投(否则残缺前缀会与重投后的答案拼成两段)")
	}
	if !replayHasVisibleOutput([][]byte{[]byte(`{"type":"tool_use_complete","toolUseId":"t1"}`)}) {
		t.Fatal("已产生工具块必须阻止重投")
	}
	// 未登记的新帧类型按「可见」处理:最坏是少救一轮,而不是渲染出两段。
	if !replayHasVisibleOutput([][]byte{[]byte(`{"type":"some_future_frame"}`)}) {
		t.Fatal("未知帧类型必须保守判为可见")
	}
}
