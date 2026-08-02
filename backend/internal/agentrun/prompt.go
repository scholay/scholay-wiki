package agentrun

import (
	"fmt"
	"strings"
)

// BuildStepPrompt —— 一步的提示词。
//
// 🔴 三条硬约束,每条都对应一个已知失效:
//
//  1. **必须带上用户的原始诉求**。Step 是一次**独立的 turn**,它看不到上一步的对话历史
//     (那正是 Run 形态的意义:不靠内存 messages 交接)。只给「这一步做什么」而不给
//     「用户到底想要什么」,模型会做出一个技术上正确、方向上跑偏的产物。
//
//  2. **必须告诉它产物写哪**、并且**只写那一个文件**。不指定路径,它会写到 out/ 里各种名字,
//     下一步找不到、交付边界也收不住(2026-08-02 实测:一个会话里产出过 INDEX-3/INDEX-4 这种)。
//
//  3. **重试时必须明说是重试**,并要求它先读已有产物再续写。
//     不说的话,重试等于从零重做 —— attempt 越多产物越乱,还把前一次的成果覆盖掉。
//     这是分页语义的关键:轮尽重排队**不是**失败重来,是"接着做"。
func BuildStepPrompt(run AgentRun, tpl RunTemplate, def StepDef, attempt int) string {
	var b strings.Builder

	b.WriteString("【平台编排 · 深度研究任务】\n")
	b.WriteString("你正在执行一个多步研究任务中的一步。这一步是独立的一轮对话 —— ")
	b.WriteString("**你看不到前面几步的对话内容**,但前面几步的产物已经写在文件里,你可以随时 Read。\n\n")

	b.WriteString("## 用户的原始诉求\n")
	b.WriteString(strings.TrimSpace(run.Request))
	b.WriteString("\n\n")

	b.WriteString(fmt.Sprintf("## 任务形态:%s(共 %d 步)\n", tpl.Title, len(tpl.Steps)))
	for i, s := range tpl.Steps {
		mark := "  "
		if s.Key == def.Key {
			mark = "▶ "
		}
		b.WriteString(fmt.Sprintf("%s%d. %s\n", mark, i+1, s.Brief))
	}
	b.WriteString("\n")

	b.WriteString("## 本步要做的事\n")
	b.WriteString(strings.TrimSpace(def.Brief))
	b.WriteString("\n\n")

	out := StepArtifactPath(def.Key)
	b.WriteString("## 产物要求\n")
	b.WriteString(fmt.Sprintf("- 把本步成果写入 `%s`(**只写这一个文件**,不要另建文件、不要写进 out/)。\n", out))
	b.WriteString("- 前面几步的产物在 `run/steps/` 下,需要时先 Read 它们,别重复劳动。\n")
	b.WriteString("- 引用文献一律用账本编号 `[[E<n>]]`;拿不准就先 EvidenceGet 查,**不要凭记忆写题录**。\n")
	b.WriteString("- 要写具体数值(样本量 / 效应量 / p 值 / 随访时长)前,先取原文段落再引,别重构。\n\n")

	if attempt > 1 {
		b.WriteString("## ⚠️ 这是本步的续做(第 " + fmt.Sprint(attempt) + " 次)\n")
		b.WriteString(fmt.Sprintf(
			"上一次因为工具轮数用尽被分页中断,**不是失败**。请先 Read `%s` 看已经做到哪,"+
				"然后**接着往下做并更新该文件**,不要从头重来、更不要覆盖掉已有内容。\n\n", out))
	}

	b.WriteString("完成本步后用一两句话说明做了什么、产物在哪即可,不需要把全文再复述一遍。\n")
	return b.String()
}

// StepArtifactPath 一步的产物路径(相对 workDir)。**唯一拼串处** ——
// prompt 与判据(coverage)必须用同一份,否则模型写到 A、引擎去 B 找,判据永远不达标。
func StepArtifactPath(stepKey string) string {
	return "run/steps/" + stepKey + ".md"
}
