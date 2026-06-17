// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// Package usermemory 实现 per-user 跨 feature 的长期记忆(C4 / 04-memory.md)。
//
// 两条读写路径:
//   - 读(注入):session 开始把用户的记忆块渲染进 agent 上下文(smart_search/claw/prism 的
//     首条消息前缀;peerreview 的 prompt)。所有调用 agent 的位置共享同一份用户记忆。
//   - 写(后台抽取):每轮对话后 backend 异步用便宜模型从最近对话抽取用户持久信息更新记忆块,
//     按用户冷却限流;用户也可经 /api/v1/user/memory 手动编辑。
//
// DB-as-truth:记忆是 user_memory_blocks 的行,不落 agent jsonl;agent 只拿到「当前 session 的
// user_id」对应的记忆,无法跨用户寻址(比 Anthropic memory tool 的「MUST 校验路径」更硬的行级隔离)。
package usermemory

import "time"

// MemoryBlock 是一条 per-user 长期记忆块(跨 feature 共享)。
type MemoryBlock struct {
	ID        uint64    `gorm:"column:id;primaryKey;autoIncrement" json:"-"`
	UserID    uint      `gorm:"column:user_id" json:"-"`
	Label     string    `gorm:"column:label;type:varchar(64)" json:"label"`
	Value     string    `gorm:"column:value;type:text" json:"value"`
	CharLimit int       `gorm:"column:char_limit" json:"charLimit"`
	UpdatedAt time.Time `gorm:"column:updated_at" json:"updatedAt"`
	CreatedAt time.Time `gorm:"column:created_at" json:"-"`
}

func (MemoryBlock) TableName() string { return "user_memory_blocks" }

// BlockSpec 定义一个标准记忆块的元信息。v1 固定两块(跨 feature 共享),
// 后台抽取与渲染都以此为准;未来要加 feature 专属块时再扩展。
type BlockSpec struct {
	Label     string // DB label,也是抽取 JSON 的 key
	Title     string // 渲染/抽取给人/模型看的中文标题
	Purpose   string // 给抽取 LLM 的说明:这个块该装什么
	CharLimit int    // 硬字符上限(Hermes 手法:逼精炼、稳 prefix cache)
}

// StandardBlocks 是 v1 的固定记忆块集合。
var StandardBlocks = []BlockSpec{
	{
		Label:     "profile",
		Title:     "用户画像",
		Purpose:   "用户是谁:研究领域/方向、所属学科、身份(本科/研究生/博士/研究者/工程师)、研究水平、长期反复关注的主题或对象。只记长期稳定的事实,不记一次性任务。",
		CharLimit: 2000,
	},
	{
		Label:     "preferences",
		Title:     "偏好",
		Purpose:   "用户希望 AI 如何回答:语言(中文/英文)、详略程度、引用/排版/格式风格、口吻,以及明确表达过的喜好或禁忌。",
		CharLimit: 1000,
	},
}

// blockTitle 返回 label 的中文标题(渲染用);未知 label 回落 label 本身。
func blockTitle(label string) string {
	for _, s := range StandardBlocks {
		if s.Label == label {
			return s.Title
		}
	}
	return label
}

// blockSpec 返回 label 的 spec(抽取/截断用);未知 label 回 nil。
func blockSpec(label string) *BlockSpec {
	for i := range StandardBlocks {
		if StandardBlocks[i].Label == label {
			return &StandardBlocks[i]
		}
	}
	return nil
}
