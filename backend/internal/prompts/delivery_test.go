package prompts

import (
	"strings"
	"testing"
)

// 成果交付纪律的接线回归(2026-08-07 · A4)。
//
// 🔴 这一族防的是本仓库的具名失败模式:**四份镜像漂移**。
//    claw 是最早写的那份,后来 sci_draw / stat_lab / boltslides 照它抄骨架起,
//    但没人把「绝不对用户暴露内部路径」那一段抄过去,也没有任何机制提醒。
//    代价可量化:生产实测正文泄漏率 sci_draw 76.5% / stat_lab 36.0%(提示词一字未提)
//    / boltslides 25.0%,而有这条纪律的 claw 只有 7.5%、prism 0%。
//
//    所以这里断言的是**行为**(最终 prompt 里真的含这段字),不是「某个文件里写了某行」——
//    后者证明不了拼接真的发生了(Go 的 const 拼接写错顺序/漏拼都编译得过)。

// deliveryFeaturePrompts 是「会产出交付文件、因而必须带交付纪律」的全部 feature。
//
// ⚠️ 新增第五个这类 feature 时,**把它加进这张表**。测试不会自动发现它 ——
// 这是防线不是保证(见 DESIGN.md §8.3)。但漏加至少只是少一层保护,
// 而漏拼 DeliverySection 会被这张表当场抓住。
var deliveryFeaturePrompts = map[string]string{
	"claw":       ClawSystemPrompt,
	"sci_draw":   SciDrawSystemPrompt,
	"stat_lab":   StatLabSystemPrompt,
	"boltslides": BoltSlidesSystemPrompt,
}

func TestAllDeliveryFeaturesIncludeDeliverySection(t *testing.T) {
	// 锚点:纪律本身不能是空串,否则下面每条断言都恒真(一条永远绿的规则)。
	if len(strings.TrimSpace(DeliverySection)) < 200 {
		t.Fatalf("DeliverySection 太短(%d 字符)—— 它要么被清空了,要么这个测试在裸奔",
			len(DeliverySection))
	}
	// 纪律里的两条铁律标题,拿来做「真的拼进去了」的指纹。
	const fingerprint = "【铁律 · 只说成果,不说位置】"
	if !strings.Contains(DeliverySection, fingerprint) {
		t.Fatalf("DeliverySection 里找不到指纹 %q —— 改了标题就同步改这里", fingerprint)
	}

	for feature, prompt := range deliveryFeaturePrompts {
		if !strings.Contains(prompt, fingerprint) {
			t.Errorf("%s 的 system prompt 里没有交付纪律 —— "+
				"要么忘了 `+ DeliverySection`,要么拼错了位置。"+
				"没有这一段的 feature 在生产上泄漏率是 36%%~76.5%%(有的是 7.5%%)", feature)
		}
	}
}

// 🔴 交付纪律**自身**不许出现交付目录名。
//
// 旧版 claw 的交付段里 `./out/` 出现 14 次,还包括一条否定式铁律给出的反例原文
// 「错误说法(禁止):文件已保存到 ./out/report.md」—— 那句话本身就是个完美模板。
// 一边把路径喂 14 次一边禁止说它,是无解约束。现在的分工是:
// 「写到哪」留在各 feature 的操作指令里,「对用户怎么说」收敛到这一份且**无路径可抄**。
func TestDeliverySectionItselfMentionsNoPath(t *testing.T) {
	for _, bad := range []string{"out/", "./out", "manifest.json", "/home/", "工作目录内"} {
		if strings.Contains(DeliverySection, bad) {
			t.Errorf("DeliverySection 里出现了 %q —— 这一段是给模型看的「怎么对用户说」,"+
				"里面每出现一次路径,就是给它多一个可照抄的模板", bad)
		}
	}
}

// claw 的操作指令允许提交付目录(它得知道往哪写),但**次数要收敛**。
// 旧版 14 次是失控;这里设一个棘轮上界,防止下一次编辑又把它涨回去。
func TestClawPromptPathMentionsStayBounded(t *testing.T) {
	const maxMentions = 8
	n := strings.Count(ClawSystemPrompt, "out/")
	if n > maxMentions {
		t.Errorf("claw prompt 里 `out/` 出现 %d 次,超过上界 %d。"+
			"旧版是 14 次并伴随 7.5%% 的泄漏率;每多喂一次,禁令就更难生效", n, maxMentions)
	}
	if n == 0 {
		t.Error("claw prompt 里一次 `out/` 都没有 —— 那它不知道往哪写交付文件了(交付会整体失效)")
	}
}

// sci_draw 的 B/C 车道要跑 `python3 ./out/x.py`,路径删不掉;
// 但那句「也不必加 ./ 前缀」必须删 —— 它在系统性地生产**裸 out/** 形态,
// 而前端出口清洗器只认带 `./` 的那一种(实测泄漏片段里 98.2% 是裸 out/,命中率约 1.8%)。
func TestSciDrawNoLongerTeachesBarePathForm(t *testing.T) {
	if strings.Contains(SciDrawSystemPrompt, "不必加 ./ 前缀") {
		t.Error("sci_draw 又教模型省掉 ./ 前缀了 —— 那正是前端清洗器唯一认不出的形态")
	}
}
