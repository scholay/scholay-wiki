// ============================================================================
// Scholay学术 V1.0
// 跨模块适配器定义
// ============================================================================

package main

import (
	"context"
	"time"

	"scholar-backend/internal/config"
	"scholar-backend/internal/conversation"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/subscription"
	"scholar-backend/internal/usagelog"
	"scholar-backend/internal/user"
)

// feedbackUserRepoAdapter 将 user.Repository 适配为 feedback.UserRepository 接口
type feedbackUserRepoAdapter struct {
	userRepo *user.Repository
}

func (a *feedbackUserRepoAdapter) FindByID(id uint) (*feedback.UserInfo, error) {
	u, err := a.userRepo.FindByID(id)
	if err != nil || u == nil {
		return nil, err
	}
	return &feedback.UserInfo{
		ID:        u.ID,
		Username:  u.Username,
		Email:     u.Email,
		Phone:     u.Phone,
		AvatarURL: u.AvatarURL,
	}, nil
}

func (a *feedbackUserRepoAdapter) FindByIDs(ids []uint) (map[uint]*feedback.UserInfo, error) {
	users, err := a.userRepo.FindByIDs(ids)
	if err != nil {
		return nil, err
	}
	result := make(map[uint]*feedback.UserInfo)
	for id, u := range users {
		result[id] = &feedback.UserInfo{
			ID:        u.ID,
			Username:  u.Username,
			Email:     u.Email,
			Phone:     u.Phone,
			AvatarURL: u.AvatarURL,
		}
	}
	return result, nil
}

// usageLogServiceAdapter 将 usagelog.Service 适配为 config.UsageLogService 接口
type usageLogServiceAdapter struct {
	service *usagelog.Service
}

func (a *usageLogServiceAdapter) GetPopularPaperIDs(days int, limit int) ([]config.PopularPaper, error) {
	papers, err := a.service.GetPopularPaperIDs(days, limit)
	if err != nil {
		return nil, err
	}
	result := make([]config.PopularPaper, len(papers))
	for i, p := range papers {
		result[i] = config.PopularPaper{
			PaperID: p.PaperID,
			Count:   p.Count,
		}
	}
	return result, nil
}

// subscriptionQueryAdapter 将 subscription.Service 适配为 user.SubscriptionQueryService
type subscriptionQueryAdapter struct {
	svc *subscription.Service
}

func (a *subscriptionQueryAdapter) GetActiveSubscriptionsByUserIDs(userIDs []uint) ([]user.SubscriptionSummaryDTO, error) {
	subs, err := a.svc.GetActiveSubscriptionsByUserIDs(userIDs)
	if err != nil {
		return nil, err
	}
	result := make([]user.SubscriptionSummaryDTO, len(subs))
	for i, s := range subs {
		result[i] = user.SubscriptionSummaryDTO{
			UserID:    s.UserID,
			PlanCode:  s.PlanCode,
			PlanName:  s.PlanName,
			Status:    s.Status,
			EndDate:   s.EndDate,
			AutoRenew: s.AutoRenew,
		}
	}
	return result, nil
}

// conversationQueryAdapter 将 conversation.Service 适配为 user.ConversationQueryService
type conversationQueryAdapter struct {
	svc *conversation.Service
}

func (a *conversationQueryAdapter) GetRecentByUser(ctx context.Context, userID uint, convType string, since time.Time) ([]user.ConversationItemDTO, error) {
	items, err := a.svc.GetRecentByUser(ctx, userID, convType, since)
	if err != nil {
		return nil, err
	}
	result := make([]user.ConversationItemDTO, len(items))
	for i, item := range items {
		result[i] = user.ConversationItemDTO{
			ID:        item.ID,
			Title:     item.Title,
			UpdatedAt: item.UpdatedAt,
		}
	}
	return result, nil
}

// peerReviewQueryAdapter 将 peerreview.Service 适配为 user.PeerReviewQueryService
type peerReviewQueryAdapter struct {
	svc *peerreview.Service
}

func (a *peerReviewQueryAdapter) GetRecentNonDraftTasks(userID uint, since time.Time) ([]user.PeerReviewItemDTO, error) {
	items, err := a.svc.GetRecentNonDraftTasks(userID, since)
	if err != nil {
		return nil, err
	}
	result := make([]user.PeerReviewItemDTO, len(items))
	for i, item := range items {
		result[i] = user.PeerReviewItemDTO{
			ID:        item.ID,
			Title:     item.Title,
			Status:    item.Status,
			UpdatedAt: item.UpdatedAt,
		}
	}
	return result, nil
}
