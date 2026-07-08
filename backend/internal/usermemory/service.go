// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

package usermemory

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
)

// extractCooldown 是同一用户两次后台抽取之间的最小间隔(限流控成本)。
const extractCooldown = 90 * time.Second

// minTranscriptForExtract 低于此长度的对话不值得跑抽取(省成本)。
const minTranscriptForExtract = 40

// Service per-user 长期记忆服务:渲染注入 + 后台抽取 + 用户编辑。
//
// 抽取的 LLM 调用本身不在这里跑 —— 改由 agent 容器执行(每轮对话后 agentbridge 把
// BuildExtractionPrompt 产出的 system/user prompt 经 WS 控制帧 extract_memory 推给 agent,
// agent 用便宜模型跑完把原始文本经 memory_update 帧回传,backend 再 IngestFromAgent 落库)。
// 「策略大脑」(抽取提示词 / StandardBlocks 规格 / 冷却 / 当前记忆合并 / 写库校验)全留 backend,
// 单一真源、零 TS 漂移;agent 只当无状态的廉价模型执行器。
type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ── 读路径:渲染注入 ──────────────────────────────────────────────

// RenderBlocks 把用户的记忆块渲染成纯 bullet 列表(不含外层 frame);无记忆返回 ""。
// 调用方(WS / peerreview)各自包不同的 frame(个性化 vs 中立背景)。
func (s *Service) RenderBlocks(userID uint) string {
	if s == nil {
		return ""
	}
	blocks, err := s.repo.ListByUser(userID)
	if err != nil || len(blocks) == 0 {
		return ""
	}
	var b strings.Builder
	for _, bl := range blocks {
		v := strings.TrimSpace(bl.Value)
		if v == "" {
			continue
		}
		b.WriteString("- ")
		b.WriteString(blockTitle(bl.Label))
		b.WriteString(": ")
		b.WriteString(v)
		b.WriteString("\n")
	}
	return b.String()
}

// ── 用户编辑(handler 用)────────────────────────────────────────

func (s *Service) List(userID uint) ([]MemoryBlock, error) { return s.repo.ListByUser(userID) }

// SetBlock 用户手动设置某 label(截断到 spec 上限;未知 label 用默认上限)。
func (s *Service) SetBlock(userID uint, label, value string) error {
	limit := 1500
	if spec := blockSpec(label); spec != nil {
		limit = spec.CharLimit
	}
	value = truncateRunes(strings.TrimSpace(value), limit)
	return s.repo.Upsert(userID, label, value, limit)
}

func (s *Service) DeleteBlock(userID uint, label string) error { return s.repo.DeleteBlock(userID, label) }
func (s *Service) Clear(userID uint) error                     { return s.repo.DeleteAll(userID) }

// ── 写路径:后台异步抽取 ─────────────────────────────────────────

// ShouldExtract 限流闸:同一用户 extractCooldown 内只抽一次。Redis 不可用 → 放行(尽力)。
func (s *Service) ShouldExtract(ctx context.Context, userID uint) bool {
	rdb := cache.GetRedis()
	if rdb == nil {
		return true
	}
	key := fmt.Sprintf("usermem:cooldown:%d", userID)
	// SET key 1 NX EX <cooldown>:抢到 = 这次可抽;抢不到 = 冷却中,跳过。
	ok, err := rdb.SetNX(ctx, key, "1", extractCooldown).Result()
	if err != nil {
		return true // Redis 异常不阻塞功能
	}
	return ok
}

// BuildExtractionPrompt 组装一次抽取调用的 (system, user) prompt:给模型看现有记忆 + 最近对话,
// 要求输出「更新后的全文」(Letta core_memory_replace 语义),无新增则该 key 省略 / 返回空对象。
// ok=false 表示对话太短不值得抽(省成本)。由 agentbridge 拿去推给 agent 执行(backend 不跑 LLM)。
func (s *Service) BuildExtractionPrompt(userID uint, transcript string) (system, user string, ok bool) {
	if s == nil {
		return "", "", false
	}
	transcript = strings.TrimSpace(transcript)
	if len([]rune(transcript)) < minTranscriptForExtract {
		return "", "", false
	}
	blocks, _ := s.repo.ListByUser(userID)
	current := s.renderBlocksForPrompt(blocks)
	return extractionSystemPrompt(), buildExtractionUserPrompt(current, transcript), true
}

// IngestFromAgent 把 agent 跑完抽取后回传的「原始模型输出」解析、按 StandardBlocks 白名单过滤、
// 截断,合并落库。这是写记忆的**唯一可信入口** —— agent 永远只是建议者,allow-list / 截断 / Upsert
// 全在 backend(agent 不知 userID、跨用户寻址的安全模型完全依赖 backend 持有写)。
func (s *Service) IngestFromAgent(userID uint, raw string) {
	if s == nil || userID == 0 {
		return
	}
	updates := parseUpdates(raw)
	if len(updates) == 0 {
		return
	}
	changed := 0
	for _, spec := range StandardBlocks {
		v, ok := updates[spec.Label]
		if !ok {
			continue
		}
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		v = truncateRunes(v, spec.CharLimit)
		if err := s.repo.Upsert(userID, spec.Label, v, spec.CharLimit); err != nil {
			slog.Warn("usermemory: upsert block failed", "user_id", userID, "label", spec.Label, "err", err)
			continue
		}
		changed++
	}
	if changed > 0 {
		slog.Info("usermemory: extracted & updated blocks (agent-side)", "user_id", userID, "blocks", changed)
	}
}

func (s *Service) renderBlocksForPrompt(blocks []MemoryBlock) string {
	if len(blocks) == 0 {
		return "(暂无)"
	}
	var b strings.Builder
	for _, bl := range blocks {
		b.WriteString(bl.Label)
		b.WriteString(": ")
		b.WriteString(strings.TrimSpace(bl.Value))
		b.WriteString("\n")
	}
	return b.String()
}

// ── 抽取 prompt 与解析 ───────────────────────────────────────────

func extractionSystemPrompt() string {
	var sb strings.Builder
	sb.WriteString("你是一个为学术平台维护「用户长期画像」的后台助手。任务:从用户与 AI 的最近对话里,")
	sb.WriteString("抽取关于**用户本人**的、长期稳定有用的信息,合并进已有记忆,输出更新后的记忆。\n")
	// 时间锚点(2026-07):记忆是「合并后全文」永续滚动,正文里的"最近/上周"会无限期陈旧;
	// 注入当前日期 + 规则 5 强制相对时间绝对化。天粒度、每次抽取现算。
	sb.WriteString("今天是 " + time.Now().Format("2006-01-02") + "。\n\n")
	sb.WriteString("记忆块(只允许这些 key):\n")
	for _, spec := range StandardBlocks {
		sb.WriteString(fmt.Sprintf("- %s(%s,≤%d 字):%s\n", spec.Label, spec.Title, spec.CharLimit, spec.Purpose))
	}
	sb.WriteString("\n规则:\n")
	sb.WriteString("1. 只记**长期稳定**的用户事实/偏好,忽略一次性任务内容、具体某篇论文的细节、AI 的回答。\n")
	sb.WriteString("2. 输出是**合并后的全文**(把新信息融进旧记忆,去重、精炼),不是增量。\n")
	sb.WriteString("3. 某块若没有任何可记的稳定信息(或与旧记忆无变化),**省略该 key**。\n")
	sb.WriteString("4. 不要编造;拿不准就不记。每块控制在字数上限内。\n")
	sb.WriteString("5. 记忆正文里**不要用相对时间**(最近/上周/今年/去年):记忆会长期保存,相对说法随时间失真。涉及时间一律换算成绝对年月(如「2026-07 起研究 X」);旧记忆里已有的相对时间也趁合并改写成绝对时间。\n")
	sb.WriteString("6. **只输出一个 JSON 对象**,形如 {\"profile\":\"...\",\"preferences\":\"...\"};无任何可更新则输出 {}。不要解释、不要代码块标记。\n")
	return sb.String()
}

func buildExtractionUserPrompt(current, transcript string) string {
	return "【已有长期记忆】\n" + current + "\n\n【最近对话】\n" + transcript + "\n\n请输出更新后的 JSON。"
}

// parseUpdates 从模型输出里抠出 JSON 对象并解析成 label→value。
// 容忍 ```json 围栏 / 前后多余文本:取第一个 '{' 到最后一个 '}'。
func parseUpdates(out string) map[string]string {
	out = strings.TrimSpace(out)
	start := strings.Index(out, "{")
	end := strings.LastIndex(out, "}")
	if start < 0 || end <= start {
		return nil
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(out[start:end+1]), &m); err != nil {
		return nil
	}
	// 只保留已知 label
	res := make(map[string]string, len(m))
	for _, spec := range StandardBlocks {
		if v, ok := m[spec.Label]; ok {
			res[spec.Label] = v
		}
	}
	return res
}

func truncateRunes(s string, limit int) string {
	r := []rune(s)
	if len(r) <= limit {
		return s
	}
	return string(r[:limit])
}
