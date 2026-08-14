// ============================================================================
// 轮内成本硬闸(逐帧上报)的纯内存单测。
//
// 线上证据(2026-08-13,user 873):执行器的 wind-down 按时触发、数字精确
// (raw_spent=372826 ≥ hard_remaining=270187),但 OpenAI 兼容道上 tools:[] 被 adapter
// 丢成 undefined、模型凭历史惯性继续吐 tool_calls → 又跑了 21 轮工具,单轮实花是预算的
// 8.2 倍,把用户经费从 +662.86 打穿到 -3430.83。
//
// 根因不是预算算错,是**预算只是下发给执行器的建议值,backend 手上轮内没有成本数据源**。
// 逐帧上报补上那个数据源,这组测试钉死补上之后的判定:
//   - 未 arm / 未在轮内 / 目录 miss  → 永不误杀(比漏杀更贵:用户正跑着的活被凭空掐断);
//   - 越顶那一帧 stop 恰好一次        → 幂等,不会对同一轮反复发停机帧;
//   - 越顶后继续来的帧不再累加       → 水位不被越界帧继续推高(否则日志里的数字会失真);
//   - stop 时盖 abortedTurn          → 终帧广播带 aborted:true,前端按「已停止」渲染。
// ============================================================================

package agentbridge

import "testing"

// armedHub 造一个「已 arm 硬闸、正在轮内」的 hub:cap 微元 + 每 token 单价。
func armedHub(capMicro int64, pricePerToken int64) *sessionHub {
	h := hubWithCatalog(&fakeCatalog{price: map[string]int64{"m1": pricePerToken}})
	h.inFlight = true
	h.turnCapMicro = capMicro
	h.turnCapArmed = true
	return h
}

// call 造一帧 per-call 用量:input=n token,其余为 0(单价 × n = 成本)。
func call(model string, n int) AgentUsage {
	return AgentUsage{Model: model, InputTokens: n}
}

func TestTurnCapStopsOnceWhenCrossed(t *testing.T) {
	h := armedHub(1000, 1) // cap = 1000 微元,1 微元/token

	if stop, spent, _ := h.accrueTurnCost(call("m1", 400)); stop || spent != 400 {
		t.Fatalf("400 < 1000 不该停;得到 stop=%v spent=%d", stop, spent)
	}
	if stop, spent, _ := h.accrueTurnCost(call("m1", 400)); stop || spent != 800 {
		t.Fatalf("累计 800 < 1000 仍不该停;得到 stop=%v spent=%d", stop, spent)
	}
	// 第三帧把累计推到 1000 —— 恰好等于 cap 也算越顶(>=),否则「刚好花光」会漏过闸门。
	stop, spent, capMicro := h.accrueTurnCost(call("m1", 200))
	if !stop || spent != 1000 || capMicro != 1000 {
		t.Fatalf("累计 1000 >= cap 1000 应停;得到 stop=%v spent=%d cap=%d", stop, spent, capMicro)
	}
	if !h.abortedTurn {
		t.Fatal("越顶停轮必须盖 abortedTurn,否则终帧不带 aborted:true,前端会当成正常收尾")
	}

	// 幂等:执行器 abort 前很可能还在飞着一两次 call,它们的 delta 帧随后到达。
	// 那时若再发一次 stop_generation,轻则重复日志,重则打断已经开始的下一轮。
	if stop, _, _ := h.accrueTurnCost(call("m1", 5000)); stop {
		t.Fatal("已停过一次的轮不该再次触发 stop")
	}
	if h.turnSpentMicro != 1000 {
		t.Fatalf("越顶后不该继续累加水位(日志数字会失真);得到 %d", h.turnSpentMicro)
	}
}

func TestTurnCapNeverFiresWhenNotArmed(t *testing.T) {
	// 未 arm = 不限额档 / TurnCostCap 未接线 / 老执行器不发帧 —— 三种情形都必须是「行为与
	// 上线前逐字相同」,即无论花多少都不掐。误杀比漏杀贵:漏杀只是这一轮多花钱,误杀是把
	// 用户正跑着的活凭空砍断,而且没有任何面向用户的解释。
	h := hubWithCatalog(&fakeCatalog{price: map[string]int64{"m1": 1}})
	h.inFlight = true
	h.turnCapMicro, h.turnCapArmed = 1000, false

	if stop, _, _ := h.accrueTurnCost(call("m1", 999999)); stop {
		t.Fatal("未 arm 的轮不该被硬闸掐断")
	}
	if h.turnSpentMicro != 0 {
		t.Fatalf("未 arm 时不该累加水位;得到 %d", h.turnSpentMicro)
	}
}

func TestTurnCapIgnoresFramesOutsideTurn(t *testing.T) {
	// 轮已收口(inFlight=false)后飘来的迟到 delta 帧:必须完全忽略。否则它会把**下一轮**的
	// 水位推高 —— 表现为「上一轮很贵,于是下一轮刚开口就被掐」,归因链完全断掉。
	h := armedHub(1000, 1)
	h.inFlight = false

	if stop, _, _ := h.accrueTurnCost(call("m1", 999999)); stop {
		t.Fatal("轮外的迟到帧不该触发 stop")
	}
	if h.turnSpentMicro != 0 {
		t.Fatalf("轮外的迟到帧不该累加水位;得到 %d", h.turnSpentMicro)
	}
}

func TestTurnCapIgnoresUnpricedModel(t *testing.T) {
	// 目录 miss(上游改名 / 新模型未登记单价)→ PriceUsage 返回 cost=0。
	// 不设闸而非按估算掐:modelcatalog 已在 miss 时限流告警 + 自动登记占位行,补单价是
	// admin 的一步操作;在闸门里造假价格只会让「这轮为什么被掐」变得无法解释。
	h := armedHub(1000, 1)

	if stop, _, _ := h.accrueTurnCost(call("未登记的模型", 999999)); stop {
		t.Fatal("未计价模型不该触发 stop")
	}
	if h.turnSpentMicro != 0 {
		t.Fatalf("未计价模型不该累加水位;得到 %d", h.turnSpentMicro)
	}
}

func TestTurnCapCountsAllFourTokenClasses(t *testing.T) {
	// 闸门必须按**四类 token 各自单价**算钱,而不是只看 input。
	// 873 那一轮 85% 的 token 是 cache_read,而 qwen3.7-max 的 cache_read 单价是 input 的 20%
	// (¥2.4/M vs ¥12/M)—— 只看 input 会把那一轮的成本低估到不足三成,闸门形同虚设。
	// fakeCatalog 对四类同价,这里断言的是「四类都进了 total」这一结构性事实。
	h := armedHub(1000, 1)
	stop, spent, _ := h.accrueTurnCost(AgentUsage{
		Model: "m1", InputTokens: 100, OutputTokens: 200, CacheReadTokens: 300, CacheCreationTokens: 400,
	})
	if !stop || spent != 1000 {
		t.Fatalf("四类合计 1000 应越顶;得到 stop=%v spent=%d(漏算了某一类?)", stop, spent)
	}
}

func TestExtractTurnUsageDelta(t *testing.T) {
	u, ok := extractTurnUsageDelta([]byte(
		`{"type":"turn_usage_delta","usage":{"model":"m1","input_tokens":10,"output_tokens":2,` +
			`"cache_read_tokens":3,"cache_creation_tokens":4}}`))
	if !ok || u.Model != "m1" || u.InputTokens != 10 || u.OutputTokens != 2 ||
		u.CacheReadTokens != 3 || u.CacheCreationTokens != 4 {
		t.Fatalf("合法帧应解出完整四类用量;得到 ok=%v u=%+v", ok, u)
	}

	// 非本帧型 / 空用量 / 非 JSON:一律 ok=false。空用量单独挡掉是因为执行器在 abort 抢救路径上
	// 可能推一条全 0 的 usage,那不该被当成一次真实调用去推水位。
	for _, raw := range []string{
		`{"type":"message_complete","usage":{"model":"m1","input_tokens":10}}`,
		`{"type":"turn_usage_delta","usage":{}}`,
		`{"type":"turn_usage_delta"}`,
		`not json`,
		``,
	} {
		if _, ok := extractTurnUsageDelta([]byte(raw)); ok {
			t.Fatalf("不该解出用量: %q", raw)
		}
	}
}
