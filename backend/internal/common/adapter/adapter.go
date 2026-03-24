// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package adapter

import (
	"scholar-backend/internal/config"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/user"
	"scholar-backend/internal/usagelog"
)

type feedbackUserRepoAdapter struct {
	userRepo *user.Repository
}

// NewFeedbackUserRepoAdapter adapts user.Repository to feedback.UserRepository.
func NewFeedbackUserRepoAdapter(userRepo *user.Repository) feedback.UserRepository {
	return &feedbackUserRepoAdapter{userRepo: userRepo}
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

type usageLogServiceAdapter struct {
	service *usagelog.Service
}

// NewUsageLogServiceAdapter adapts usagelog.Service to config.UsageLogService.
func NewUsageLogServiceAdapter(service *usagelog.Service) config.UsageLogService {
	return &usageLogServiceAdapter{service: service}
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
