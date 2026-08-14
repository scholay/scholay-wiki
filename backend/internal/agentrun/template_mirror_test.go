package agentrun

import (
	"encoding/json"
	"reflect"
	"testing"

	"scholar-backend/internal/agentbridge"
)

// 跨包镜像守卫:agentbridge.RunTemplateJSON ←→ agentrun.RunTemplate。
//
// 🔴 为什么会有两份结构:agentrun 依赖 agentbridge(骑 SagaStepRow),
//
//	所以 FeatureSpec 不能直接持 agentrun.RunTemplate —— 会成 import 环。
//	agentbridge 侧因此放了一份纯数据镜像,由 adapter.go 转换。
//
// 镜像 = 会漂。漂了的后果**不是编译错误**,是转换时**静默丢字段**:
// 剖面在 spec.go 里认认真真声明了 max_rounds,转换层漏掉它 → 每步都按默认 24 轮跑,
// 分页收益消失,而没有任何红灯。本仓库这类"造好没接线"已经吃过七次。
func TestSpecMirrorFieldParity(t *testing.T) {
	// 字段名(JSON tag)必须逐项一致。用 JSON tag 而不是 Go 字段名:
	// tag 才是两侧真正要对齐的东西(它决定序列化后的形状,也决定人读代码时的对应关系)。
	want := jsonTags(reflect.TypeOf(RunTemplate{}))
	got := jsonTags(reflect.TypeOf(agentbridge.RunTemplateJSON{}))
	if !reflect.DeepEqual(want, got) {
		t.Fatalf("RunTemplate 镜像漂移:\n  agentrun    = %v\n  agentbridge = %v\n"+
			"两侧字段必须逐项对齐,否则 adapter.FromSpecTemplates 会静默丢字段。", want, got)
	}

	wantStep := jsonTags(reflect.TypeOf(StepDef{}))
	gotStep := jsonTags(reflect.TypeOf(agentbridge.RunStepJSON{}))
	// StepDef 允许**多出** exit_criteria(那是引擎内部判据,剖面还不声明它);
	// 但镜像里出现的每一个字段,引擎侧都必须有。
	for _, f := range gotStep {
		if !contains(wantStep, f) {
			t.Fatalf("agentbridge.RunStepJSON 有字段 %q,而 agentrun.StepDef 没有 —— 转换时必然丢掉它", f)
		}
	}
}

// FromSpecTemplates 必须真的搬运每一个字段(不是只搬 Key)。
func TestFromSpecTemplatesCarriesEveryField(t *testing.T) {
	in := []agentbridge.RunTemplateJSON{{
		Key: "deep", Title: "深度研究",
		Steps: []agentbridge.RunStepJSON{{Key: "s1", Brief: "检索", MaxRounds: 7, MaxRetry: 3}},
	}}
	out := FromSpecTemplates(in)
	if len(out) != 1 || len(out[0].Steps) != 1 {
		t.Fatalf("shape lost: %+v", out)
	}
	s := out[0].Steps[0]
	switch {
	case out[0].Key != "deep":
		t.Fatal("template key lost")
	case out[0].Title != "深度研究":
		t.Fatal("template title lost")
	case s.Key != "s1":
		t.Fatal("step key lost")
	case s.Brief != "检索":
		t.Fatal("step brief lost")
	case s.MaxRounds != 7:
		t.Fatal("max_rounds lost —— 分页收益会静默消失(每步退回默认 24 轮)")
	case s.MaxRetry != 3:
		t.Fatal("max_retry lost —— DLQ 判据会用错阈值")
	}
}

func TestFromSpecTemplatesZeroValueMeansNoRun(t *testing.T) {
	// 零值 = 该剖面不支持 Run。这是 Phase 1「零回归」的全部保证:
	// 五个剖面都不声明模板 ⇒ 引擎对它们完全不动。
	if got := FromSpecTemplates(nil); got != nil {
		t.Fatalf("零值必须转成 nil(不支持 Run),得到 %+v", got)
	}
}

func TestSpecTemplateSourceRejectsInvalidAtRegistration(t *testing.T) {
	// 注册期拒绝,不拖到运行期:重复 step_key 会撞 uk_saga_step,
	// 那时错误发生在用户的一次真实请求里、表现为"Run 卡住"而不是"模板写错了"。
	src := NewSpecTemplateSource()
	err := src.Add("claw", []RunTemplate{{Key: "t", Steps: []StepDef{{Key: "a"}, {Key: "a"}}}})
	if err == nil {
		t.Fatal("非法模板必须在注册期被拒")
	}
	if len(src.Templates("claw")) != 0 {
		t.Fatal("被拒的模板不得进入运行期")
	}
}

func jsonTags(t reflect.Type) []string {
	out := []string{}
	for i := 0; i < t.NumField(); i++ {
		tag := t.Field(i).Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		name := tag
		for j := 0; j < len(tag); j++ {
			if tag[j] == ',' {
				name = tag[:j]
				break
			}
		}
		out = append(out, name)
	}
	return out
}

func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

var _ = json.Marshal
