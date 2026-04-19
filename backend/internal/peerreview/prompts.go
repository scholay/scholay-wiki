// ============================================================================
// Scholay学术 V1.0
// Peer Review 提示词集合（Meta-Review / 审稿系统 / 审稿用户模板）
// 提示词正文拆至 prompts/*.txt，通过 go:embed 嵌入，保持代码与数据分离。
// ============================================================================

package peerreview

import _ "embed"

//go:embed prompts/meta_review_system.txt
var metaReviewSystemPrompt string

//go:embed prompts/meta_review_user.txt
var metaReviewUserPrompt string

//go:embed prompts/review_user_file.txt
var reviewUserPromptFile string

//go:embed prompts/review_user_text.txt
var reviewUserPromptText string

//go:embed prompts/review_system_base.txt
var reviewSystemBase string

//go:embed prompts/review_system_role_1.txt
var reviewSystemRole1 string

//go:embed prompts/review_system_role_2.txt
var reviewSystemRole2 string

//go:embed prompts/review_system_role_3.txt
var reviewSystemRole3 string

//go:embed prompts/review_system_common.txt
var reviewSystemCommon string

func getMetaReviewSystemPrompt() string { return metaReviewSystemPrompt }

func getMetaReviewUserPrompt() string { return metaReviewUserPrompt }

func getReviewUserPromptTemplateForFile() string { return reviewUserPromptFile }

func getReviewUserPromptTemplate() string { return reviewUserPromptText }

// getReviewSystemPrompt 组装差异化审稿系统提示词
// reviewerIndex: 1=原创性与理论贡献, 2=方法论与技术严谨性, 3=清晰度/影响力/实用性
func getReviewSystemPrompt(reviewerIndex int) string {
	var role string
	switch reviewerIndex {
	case 1:
		role = reviewSystemRole1
	case 2:
		role = reviewSystemRole2
	case 3:
		role = reviewSystemRole3
	}
	return reviewSystemBase + role + reviewSystemCommon
}
