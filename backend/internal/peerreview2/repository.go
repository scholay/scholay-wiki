// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview2

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// CreateConversation 写入新会话映射
func (r *Repository) CreateConversation(c *PeerReview2Conversation) error {
	return r.db.Create(c).Error
}

// FindByRemoteID 通过远端 conversation id 查找(用于幂等命中后回填)
func (r *Repository) FindByRemoteID(remoteID string) (*PeerReview2Conversation, error) {
	var c PeerReview2Conversation
	if err := r.db.Where("remote_conversation_id = ?", remoteID).First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

// FindByLocalID 通过本地自增 id 查找
func (r *Repository) FindByLocalID(id uint) (*PeerReview2Conversation, error) {
	var c PeerReview2Conversation
	if err := r.db.First(&c, id).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

// FindByClientRequestID 通过主体 + client_request_id 查找。
//   - 登录态:scope = user_id
//   - 匿名态:scope = device_id (anon_token 可能重新生成,device_id 稳定)
//
// 设计:把内容哈希派生的 client_request_id 与稳定身份配对,避免重复消耗远端 4-process 配额。
func (r *Repository) FindByClientRequestID(userID *uint, deviceID, clientRequestID string) (*PeerReview2Conversation, error) {
	var c PeerReview2Conversation
	q := r.db.Where("client_request_id = ?", clientRequestID)
	switch {
	case userID != nil:
		q = q.Where("user_id = ?", *userID)
	case deviceID != "":
		q = q.Where("device_id = ?", deviceID)
	default:
		return nil, gorm.ErrRecordNotFound
	}
	if err := q.First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

// UpdateStatus 更新本地缓存的 status / 推荐结论
func (r *Repository) UpdateStatus(id uint, status string, finalRecommendation string, finalChars int) error {
	now := time.Now()
	updates := map[string]any{
		"status":              status,
		"last_remote_sync_at": &now,
	}
	if finalRecommendation != "" {
		updates["final_recommendation"] = finalRecommendation
	}
	if finalChars > 0 {
		updates["final_chars"] = finalChars
	}
	return r.db.Model(&PeerReview2Conversation{}).Where("id = ?", id).Updates(updates).Error
}

// UpdateThreadID 写回 cursor thread id
func (r *Repository) UpdateThreadID(id uint, threadID string) error {
	if threadID == "" {
		return nil
	}
	return r.db.Model(&PeerReview2Conversation{}).Where("id = ?", id).
		Update("remote_thread_id", threadID).Error
}

// ListByUser 用户已登录:按 user_id 列出
func (r *Repository) ListByUser(userID uint, page, pageSize int) ([]PeerReview2Conversation, int64, error) {
	return r.list(r.db.Where("user_id = ?", userID), page, pageSize)
}

// ListByAnonToken 匿名:按 anon_token 列出
func (r *Repository) ListByAnonToken(anonToken string) ([]PeerReview2Conversation, int64, error) {
	if anonToken == "" {
		return nil, 0, nil
	}
	items, total, err := r.list(r.db.Where("anon_token = ?", anonToken), 1, 100)
	return items, total, err
}

func (r *Repository) list(q *gorm.DB, page, pageSize int) ([]PeerReview2Conversation, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	var items []PeerReview2Conversation
	var total int64
	if err := q.Model(&PeerReview2Conversation{}).
		Where("status <> ?", StatusArchived).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := q.Where("status <> ?", StatusArchived).
		Order("id DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// Delete 删除本地映射(远端独立删除,由 service 协调)
func (r *Repository) Delete(id uint) error {
	return r.db.Delete(&PeerReview2Conversation{}, id).Error
}

// ========== 匿名试用 ==========

// CheckAnonTrialQuota 同 device 同 day 仅 1 次硬限。
// 返回 (canTrial, existing) — canTrial=false 时 existing 给出今天已有的记录。
func (r *Repository) CheckAnonTrialQuota(deviceID, ipUAHash, trialDay string) (bool, *PeerReview2AnonTrial, error) {
	if deviceID == "" {
		return false, nil, errors.New("缺少设备识别")
	}
	var trial PeerReview2AnonTrial
	q := r.db.Where("trial_day = ? AND (device_id = ? OR ip_ua_hash = ?)",
		trialDay, deviceID, ipUAHash)
	if err := q.Order("id DESC").First(&trial).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return true, nil, nil
		}
		return false, nil, err
	}
	return false, &trial, nil
}

// ConsumeAnonTrial 写入消费记录
func (r *Repository) ConsumeAnonTrial(t *PeerReview2AnonTrial) error {
	return r.db.Create(t).Error
}

// ClaimAllByAnonToken 登录后批量认领该 anon_token 下的所有会话
func (r *Repository) ClaimAllByAnonToken(userID uint, anonToken string) ([]uint, error) {
	if userID == 0 || anonToken == "" {
		return nil, errors.New("缺少认领参数")
	}
	var claimedIDs []uint
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var convs []PeerReview2Conversation
		if err := tx.Where("anon_token = ? AND user_id IS NULL", anonToken).Find(&convs).Error; err != nil {
			return err
		}
		if len(convs) == 0 {
			return nil
		}
		ids := make([]uint, 0, len(convs))
		for _, c := range convs {
			ids = append(ids, c.ID)
		}
		if err := tx.Model(&PeerReview2Conversation{}).
			Where("id IN ? AND user_id IS NULL", ids).
			Updates(map[string]any{
				"user_id":    userID,
				"anon_token": "",
			}).Error; err != nil {
			return err
		}
		now := time.Now()
		if err := tx.Model(&PeerReview2AnonTrial{}).
			Where("anon_token = ? AND claimed_by_user_id = 0", anonToken).
			Updates(map[string]any{
				"claimed_by_user_id": userID,
				"claimed_at":         &now,
			}).Error; err != nil {
			return err
		}
		claimedIDs = ids
		return nil
	})
	return claimedIDs, err
}
