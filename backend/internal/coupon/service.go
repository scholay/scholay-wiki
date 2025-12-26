// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package coupon

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"scholar-backend/internal/user"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// CurrencyService 货币服务接口
type CurrencyService interface {
	GetCurrencyConfigAmount(configKey string) (int64, error)
	GiftDiamond(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (any, error)
}

// MessageService 消息服务接口（用于发送站内信）
type MessageService interface {
	SendToUser(userID uint, title, content string, category string, linkURL, linkText string) error
}

type Service struct {
	repo            *Repository
	userRepo        *user.Repository
	cache           *redis.Client
	baseURL         string // 用于生成邀请链接
	currencyService CurrencyService
	messageService  MessageService
}

func NewService(db *gorm.DB, userRepo *user.Repository, cache *redis.Client, baseURL string) *Service {
	return &Service{
		repo:     NewRepository(db),
		userRepo: userRepo,
		cache:    cache,
		baseURL:  baseURL,
	}
}

// SetCurrencyService 设置货币服务（用于依赖注入）
func (s *Service) SetCurrencyService(cs CurrencyService) {
	s.currencyService = cs
}

// SetMessageService 设置消息服务（用于发送站内信通知）
func (s *Service) SetMessageService(ms MessageService) {
	s.messageService = ms
}

// ============================================
// 折扣券模板管理
// ============================================

// CreateTemplate 创建折扣券模板
func (s *Service) CreateTemplate(req *CreateCouponTemplateRequest, createdBy uint64) (*CouponTemplate, error) {
	// 如果没有提供编码，自动生成
	code := req.Code
	if code == "" {
		code = GenerateTemplateCode(req.DistributionType)
		// 确保生成的编码不重复
		for {
			existingTemplate, err := s.repo.GetTemplateByCode(code)
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, err
			}
			if existingTemplate == nil {
				break // 编码可用
			}
			// 编码已存在，重新生成
			code = GenerateTemplateCode(req.DistributionType)
		}
	} else {
		// 如果提供了编码，检查是否已存在
		existingTemplate, err := s.repo.GetTemplateByCode(code)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		if existingTemplate != nil {
			return nil, errors.New("template code already exists")
		}
	}

	template := &CouponTemplate{
		Code:              code,
		Name:              req.Name,
		Description:       req.Description,
		Type:              req.Type,
		DiscountValue:     req.DiscountValue,
		MinPurchaseAmount: req.MinPurchaseAmount,
		DistributionType:  req.DistributionType,
		ValidDays:         req.ValidDays,
		FixedValidStart:   req.FixedValidStart,
		FixedValidEnd:     req.FixedValidEnd,
		MaxUsageTotal:     req.MaxUsageTotal,
		MaxUsagePerUser:   req.MaxUsagePerUser,
		FirstPurchaseOnly: req.FirstPurchaseOnly,
		NewUserOnly:       req.NewUserOnly,
		IsInviteCoupon:    req.IsInviteCoupon,
		Status:            TemplateStatusDraft,
		Priority:          0,
		CreatedBy:         &createdBy,
	}

	// 处理JSON字段
	if len(req.ApplicablePlans) > 0 {
		plans := make(JSONArray, len(req.ApplicablePlans))
		for i, plan := range req.ApplicablePlans {
			plans[i] = plan
		}
		template.ApplicablePlans = plans
	}

	if len(req.ApplicableProducts) > 0 {
		products := make(JSONArray, len(req.ApplicableProducts))
		for i, product := range req.ApplicableProducts {
			products[i] = product
		}
		template.ApplicableProducts = products
	}

	if req.InviterBenefit != nil {
		template.InviterBenefit = JSONMap(req.InviterBenefit)
	}

	if err := s.repo.CreateTemplate(template); err != nil {
		return nil, err
	}

	return template, nil
}

// UpdateTemplate 更新模板
func (s *Service) UpdateTemplate(id uint64, req *UpdateCouponTemplateRequest) error {
	// 获取原模板
	template, err := s.repo.GetTemplateByID(id)
	if err != nil {
		return err
	}

	// 构建更新字段
	updates := make(map[string]interface{})
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	updates["min_purchase_amount"] = req.MinPurchaseAmount
	updates["valid_days"] = req.ValidDays
	updates["max_usage_per_user"] = req.MaxUsagePerUser
	updates["first_purchase_only"] = req.FirstPurchaseOnly
	updates["new_user_only"] = req.NewUserOnly
	updates["priority"] = req.Priority

	if req.Status != "" {
		// 状态变更验证
		if template.Status == TemplateStatusExpired {
			return errors.New("cannot update expired template")
		}
		updates["status"] = req.Status
	}

	if req.FixedValidStart != nil {
		updates["fixed_valid_start"] = req.FixedValidStart
	}
	if req.FixedValidEnd != nil {
		updates["fixed_valid_end"] = req.FixedValidEnd
	}
	if req.MaxUsageTotal != nil {
		updates["max_usage_total"] = req.MaxUsageTotal
	}

	// 处理JSON字段
	if req.ApplicablePlans != nil {
		plans := make(JSONArray, len(req.ApplicablePlans))
		for i, plan := range req.ApplicablePlans {
			plans[i] = plan
		}
		updates["applicable_plans"] = plans
	}

	if req.ApplicableProducts != nil {
		products := make(JSONArray, len(req.ApplicableProducts))
		for i, product := range req.ApplicableProducts {
			products[i] = product
		}
		updates["applicable_products"] = products
	}

	return s.repo.UpdateTemplate(id, updates)
}

// ActivateTemplate 激活模板
func (s *Service) ActivateTemplate(id uint64) error {
	return s.repo.UpdateTemplate(id, map[string]interface{}{
		"status": TemplateStatusActive,
	})
}

// PauseTemplate 暂停模板
func (s *Service) PauseTemplate(id uint64) error {
	return s.repo.UpdateTemplate(id, map[string]interface{}{
		"status": TemplateStatusPaused,
	})
}

// GetTemplate 获取模板详情
func (s *Service) GetTemplate(id uint64) (*CouponTemplate, error) {
	return s.repo.GetTemplateByID(id)
}

// ListTemplates 获取模板列表
func (s *Service) ListTemplates(status *TemplateStatus, distributionType *DistributionType, page, pageSize int) ([]*CouponTemplate, int64, error) {
	offset := (page - 1) * pageSize
	return s.repo.ListTemplates(status, distributionType, offset, pageSize)
}

// DeleteTemplate 删除模板
func (s *Service) DeleteTemplate(id uint64) error {
	return s.repo.DeleteTemplate(id)
}

// AdminListAllDistributedCoupons 管理员获取所有已发放折扣券列表
func (s *Service) AdminListAllDistributedCoupons(templateID *uint64, status *CouponStatus, userEmail string, page, pageSize int) ([]*UserCoupon, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize
	return s.repo.AdminListAllDistributedCoupons(templateID, status, userEmail, offset, pageSize)
}

// ============================================
// 折扣券发放管理
// ============================================

// DistributeCoupons 发放折扣券
func (s *Service) DistributeCoupons(req *DistributeCouponRequest) error {
	// 获取模板
	template, err := s.repo.GetTemplateByID(req.TemplateID)
	if err != nil {
		return err
	}

	if template.Status != TemplateStatusActive {
		return errors.New("template is not active")
	}

	// 检查发放限制
	if template.MaxUsageTotal != nil {
		// TODO: 检查总使用量
	}

	// 批量创建用户折扣券
	coupons := make([]*UserCoupon, 0, len(req.UserIDs))
	now := time.Now()
	validUntil := CalculateExpiry(template)

	for _, userID := range req.UserIDs {
		// 检查用户是否已达到领取限制
		count, err := s.repo.CountUserCouponUsage(userID, template.ID)
		if err != nil {
			return err
		}
		if int(count) >= template.MaxUsagePerUser {
			continue // 跳过已达限制的用户
		}

		coupon := &UserCoupon{
			UserID:            userID,
			TemplateID:        template.ID,
			CouponCode:        GenerateCouponCode(template.Code),
			SourceType:        req.SourceType,
			SourceID:          req.SourceID,
			ValidFrom:         now,
			ValidUntil:        validUntil,
			Status:            CouponStatusUnused,
			DiscountType:      string(template.Type),
			DiscountValue:     template.DiscountValue,
			MinPurchaseAmount: template.MinPurchaseAmount,
		}

		coupons = append(coupons, coupon)
	}

	if len(coupons) == 0 {
		return errors.New("no coupons to distribute")
	}

	return s.repo.CreateUserCoupons(coupons)
}

// ClaimCoupon 用户领取折扣券
func (s *Service) ClaimCoupon(userID uint64, code string) (*UserCoupon, error) {
	// 获取模板
	template, err := s.repo.GetActiveTemplateByCode(code)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid or inactive coupon code")
		}
		return nil, err
	}

	// 检查用户资格
	userInfo, err := s.userRepo.FindByID(uint(userID))
	if err != nil {
		return nil, err
	}

	isNewUser := userInfo.CreatedAt.After(time.Now().AddDate(0, 0, -30)) // 30天内注册的算新用户
	isFirstPurchase := false                                             // TODO: 从订单系统获取

	if !IsValidForUser(template, isNewUser, isFirstPurchase) {
		return nil, errors.New("you are not eligible for this coupon")
	}

	// 检查领取限制
	count, err := s.repo.CountUserCouponUsage(userID, template.ID)
	if err != nil {
		return nil, err
	}
	if int(count) >= template.MaxUsagePerUser {
		return nil, errors.New("you have reached the maximum claim limit for this coupon")
	}

	// 创建用户折扣券
	now := time.Now()
	validUntil := CalculateExpiry(template)

	coupon := &UserCoupon{
		UserID:            userID,
		TemplateID:        template.ID,
		CouponCode:        GenerateCouponCode(template.Code),
		SourceType:        SourceTypeManual,
		ValidFrom:         now,
		ValidUntil:        validUntil,
		Status:            CouponStatusUnused,
		DiscountType:      string(template.Type),
		DiscountValue:     template.DiscountValue,
		MinPurchaseAmount: template.MinPurchaseAmount,
	}

	if err := s.repo.CreateUserCoupon(coupon); err != nil {
		return nil, err
	}

	coupon.Template = template
	return coupon, nil
}

// GetUserCoupons 获取用户折扣券列表
func (s *Service) GetUserCoupons(userID uint64, status *CouponStatus, page, pageSize int) ([]*UserCoupon, int64, error) {
	offset := (page - 1) * pageSize
	return s.repo.ListUserCoupons(userID, status, offset, pageSize)
}

// GetAvailableCoupons 获取可用折扣券
func (s *Service) GetAvailableCoupons(userID uint64, orderAmount float64) ([]*UserCoupon, error) {
	return s.repo.GetAvailableCoupons(userID, orderAmount)
}

// ApplyCoupon 应用折扣券
func (s *Service) ApplyCoupon(userID uint64, couponID uint64, orderID uint64, orderAmount float64) (*CouponUsageLog, error) {
	// 获取折扣券
	coupon, err := s.repo.GetUserCouponByID(couponID)
	if err != nil {
		return nil, err
	}

	// 验证所有权
	if coupon.UserID != userID {
		return nil, errors.New("coupon does not belong to you")
	}

	// 验证状态
	if coupon.Status != CouponStatusUnused {
		return nil, errors.New("coupon is not available")
	}

	// 验证时间
	if !IsValidTime(coupon.ValidFrom, coupon.ValidUntil) {
		return nil, errors.New("coupon has expired")
	}

	// 验证金额
	if !IsValidAmount(coupon.MinPurchaseAmount, orderAmount) {
		return nil, fmt.Errorf("minimum purchase amount is %.2f", coupon.MinPurchaseAmount)
	}

	// 计算折扣
	discountAmount := CalculateDiscount(
		DiscountType(coupon.DiscountType),
		coupon.DiscountValue,
		orderAmount,
	)
	finalAmount := orderAmount - discountAmount

	// 使用事务
	err = s.repo.Transaction(func(txRepo *Repository) error {
		// 使用折扣券
		if err := txRepo.UseCoupon(couponID, orderID); err != nil {
			return err
		}

		// 创建使用记录
		usageLog := &CouponUsageLog{
			UserCouponID:   couponID,
			UserID:         userID,
			OrderID:        orderID,
			OriginalAmount: orderAmount,
			DiscountAmount: discountAmount,
			FinalAmount:    finalAmount,
			Status:         "applied",
		}

		if err := txRepo.CreateUsageLog(usageLog); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &CouponUsageLog{
		UserCouponID:   couponID,
		UserID:         userID,
		OrderID:        orderID,
		OriginalAmount: orderAmount,
		DiscountAmount: discountAmount,
		FinalAmount:    finalAmount,
		Status:         "applied",
	}, nil
}

// ============================================
// 邀请系统
// ============================================

// GenerateInvitation 生成邀请码和链接
func (s *Service) GenerateInvitation(userID uint64) (*UserInvitation, error) {
	// 检查是否已有邀请信息
	existing, err := s.repo.GetUserInvitation(userID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if existing != nil {
		// 如果已存在但未激活，重新激活
		if !existing.IsActive {
			updates := map[string]interface{}{
				"is_active": true,
			}
			if err := s.repo.UpdateUserInvitation(userID, updates); err != nil {
				return nil, err
			}
			existing.IsActive = true
		}
		return existing, nil
	}

	// 创建新的邀请信息
	invitationCode := GenerateInvitationCode()
	invitationURL := BuildInvitationURL(s.baseURL, invitationCode)

	invitation := &UserInvitation{
		UserID:         userID,
		InvitationCode: invitationCode,
		InvitationURL:  invitationURL,
		IsActive:       true,
	}

	if err := s.repo.CreateUserInvitation(invitation); err != nil {
		return nil, err
	}

	return invitation, nil
}

// GetUserInvitation 获取用户邀请信息
func (s *Service) GetUserInvitation(userID uint64) (*UserInvitation, error) {
	return s.repo.GetUserInvitation(userID)
}

// RegisterWithInvitation 通过邀请码注册
func (s *Service) RegisterWithInvitation(invitationCode string, inviteeID uint64) error {
	// 获取邀请信息
	invitation, err := s.repo.GetUserInvitationByCode(invitationCode)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("invalid invitation code")
		}
		return err
	}

	// 检查是否已有邀请关系
	existing, err := s.repo.GetInvitationRelationship(inviteeID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if existing != nil {
		return errors.New("user already has an inviter")
	}

	// 使用事务处理
	err = s.repo.Transaction(func(txRepo *Repository) error {
		// 创建邀请关系
		relationship := &InvitationRelationship{
			InviterID:      invitation.UserID,
			InviteeID:      inviteeID,
			InvitationCode: invitationCode,
			Status:         "registered",
			RegisteredAt:   &[]time.Time{time.Now()}[0],
		}

		if err := txRepo.CreateInvitationRelationship(relationship); err != nil {
			return err
		}

		// 更新邀请统计
		if err := txRepo.IncrementInvitationCount(invitation.UserID, "total_invites"); err != nil {
			return err
		}
		if err := txRepo.IncrementInvitationCount(invitation.UserID, "successful_invites"); err != nil {
			return err
		}

		// 查找并发放邀请折扣券
		templates, err := txRepo.GetAutoDistributionTemplates(DistributionTypeAutoInvite)
		if err != nil {
			return err
		}

		for _, template := range templates {
			if !template.IsInviteCoupon {
				continue
			}

			// 为被邀请人创建折扣券
			now := time.Now()
			validUntil := CalculateExpiry(template)

			coupon := &UserCoupon{
				UserID:            inviteeID,
				TemplateID:        template.ID,
				CouponCode:        GenerateCouponCode(template.Code),
				SourceType:        SourceTypeInvite,
				SourceID:          fmt.Sprintf("%d", invitation.UserID),
				SourceDetail:      JSONMap{"inviter_id": invitation.UserID, "invitation_code": invitationCode},
				ValidFrom:         now,
				ValidUntil:        validUntil,
				Status:            CouponStatusUnused,
				DiscountType:      string(template.Type),
				DiscountValue:     template.DiscountValue,
				MinPurchaseAmount: template.MinPurchaseAmount,
			}

			if err := txRepo.CreateUserCoupon(coupon); err != nil {
				return err
			}

			// 更新关系记录
			updates := map[string]interface{}{
				"invitee_coupon_id": coupon.ID,
			}
			if err := txRepo.UpdateInvitationRelationship(relationship.ID, updates); err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		return err
	}

	// 异步发放邀请恩特币奖励给邀请人
	go s.giftInviteDiamond(invitation.UserID, invitation.SuccessfulInvites+1)

	// 异步发送站内信通知给被邀请人
	go s.sendInviteeCouponNotification(inviteeID)

	return nil
}

// sendInviteeCouponNotification 发送邀请奖励站内信给被邀请人
func (s *Service) sendInviteeCouponNotification(inviteeID uint64) {
	if s.messageService == nil {
		log.Printf("[Coupon] Message service not set, cannot send notification to invitee %d", inviteeID)
		return
	}

	// 获取被邀请人的折扣券信息
	coupons, _, err := s.repo.ListUserCoupons(inviteeID, nil, 0, 10)
	if err != nil {
		log.Printf("[Coupon] Failed to get invitee coupons: %v", err)
		return
	}

	// 查找邀请来源的折扣券
	var inviteCoupon *UserCoupon
	for _, c := range coupons {
		if c.SourceType == SourceTypeInvite {
			inviteCoupon = c
			break
		}
	}

	if inviteCoupon == nil {
		log.Printf("[Coupon] No invite coupon found for invitee %d", inviteeID)
		return
	}

	// 构建通知内容
	title := "邀请奖励到账"
	var content string
	
	// 根据折扣类型构建内容
	switch inviteCoupon.DiscountType {
	case string(DiscountTypePercentage):
		content = fmt.Sprintf("恭喜您获得邀请专属折扣券！\n\n优惠内容：%d%% 折扣\n有效期至：%s\n\n快去使用吧！",
			int(inviteCoupon.DiscountValue),
			inviteCoupon.ValidUntil.Format("2006-01-02"))
	case string(DiscountTypeFixed):
		content = fmt.Sprintf("恭喜您获得邀请专属折扣券！\n\n优惠内容：减免 %.2f 元\n有效期至：%s\n\n快去使用吧！",
			inviteCoupon.DiscountValue,
			inviteCoupon.ValidUntil.Format("2006-01-02"))
	default:
		content = fmt.Sprintf("恭喜您获得邀请专属折扣券！\n\n有效期至：%s\n\n快去使用吧！",
			inviteCoupon.ValidUntil.Format("2006-01-02"))
	}

	// 发送站内信（category = promotion）
	err = s.messageService.SendToUser(uint(inviteeID), title, content, "promotion", "/pricing", "查看会员方案")
	if err != nil {
		log.Printf("[Coupon] Failed to send invite notification to user %d: %v", inviteeID, err)
	} else {
		log.Printf("[Coupon] Sent invite notification to user %d", inviteeID)
	}
}

// giftInviteDiamond 发放邀请恩特币奖励
// inviteCount: 当前是第几个成功邀请（包含本次）
func (s *Service) giftInviteDiamond(inviterID uint64, inviteCount int) {
	if s.currencyService == nil {
		log.Printf("Warning: Currency service not set, cannot gift invite diamond to user %d", inviterID)
		return
	}

	ctx := context.Background()

	// 获取配置
	baseReward, err := s.currencyService.GetCurrencyConfigAmount("invite_reward_diamond")
	if err != nil || baseReward <= 0 {
		baseReward = 1 // 默认每次邀请奖励1恩特币
	}

	// 里程碑间隔固定为5（第5、10、15...个触发）
	const milestoneInterval = 5

	milestoneReward, err := s.currencyService.GetCurrencyConfigAmount("invite_milestone_diamond")
	if err != nil || milestoneReward <= 0 {
		milestoneReward = 10 // 默认里程碑奖励10恩特币
	}

	// 计算本次奖励
	totalReward := baseReward
	isMilestone := inviteCount > 0 && inviteCount%int(milestoneInterval) == 0

	if isMilestone {
		totalReward += milestoneReward
	}

	// 发放恩特币奖励
	bizID := fmt.Sprintf("invite_%d_%d", inviterID, inviteCount)
	var desc string
	if isMilestone {
		desc = fmt.Sprintf("邀请奖励（第%d位用户，里程碑奖励）", inviteCount)
	} else {
		desc = fmt.Sprintf("邀请奖励（第%d位用户）", inviteCount)
	}

	_, err = s.currencyService.GiftDiamond(ctx, uint(inviterID), totalReward, "invite_reward", bizID, desc)
	if err != nil {
		log.Printf("Failed to gift invite diamond to user %d: %v", inviterID, err)
	} else {
		log.Printf("Successfully gifted %d diamond to user %d for invite (count: %d, milestone: %v)", 
			totalReward, inviterID, inviteCount, isMilestone)
	}
}

// GetInvitationStatistics 获取邀请统计
func (s *Service) GetInvitationStatistics(userID uint64) (*UserInvitation, []*InvitationRelationship, error) {
	invitation, err := s.repo.GetUserInvitation(userID)
	if err != nil {
		return nil, nil, err
	}

	relationships, _, err := s.repo.ListInvitationRelationships(userID, nil, 0, 1000)
	if err != nil {
		return nil, nil, err
	}

	return invitation, relationships, nil
}

// DistributeRegisterCoupons 为新注册用户发放注册自动折扣券
func (s *Service) DistributeRegisterCoupons(userID uint64) error {
	// 获取所有注册自动发放的活跃模板
	templates, err := s.repo.GetAutoDistributionTemplates(DistributionTypeAutoRegister)
	if err != nil {
		return err
	}

	if len(templates) == 0 {
		return nil // 没有配置注册自动发放的折扣券
	}

	now := time.Now()

	for _, template := range templates {
		// 检查用户是否已领取过该模板的券
		count, err := s.repo.CountUserCouponUsage(userID, template.ID)
		if err != nil {
			continue // 跳过错误，继续处理其他模板
		}
		if int(count) >= template.MaxUsagePerUser {
			continue // 已达到领取限制
		}

		// 计算过期时间
		validUntil := CalculateExpiry(template)

		// 创建用户折扣券
		coupon := &UserCoupon{
			UserID:            userID,
			TemplateID:        template.ID,
			CouponCode:        GenerateCouponCode(template.Code),
			SourceType:        SourceTypeRegister,
			SourceDetail:      JSONMap{"auto_distribute": true, "distribute_type": "register"},
			ValidFrom:         now,
			ValidUntil:        validUntil,
			Status:            CouponStatusUnused,
			DiscountType:      string(template.Type),
			DiscountValue:     template.DiscountValue,
			MinPurchaseAmount: template.MinPurchaseAmount,
		}

		if err := s.repo.CreateUserCoupon(coupon); err != nil {
			// 记录错误但继续处理
			fmt.Printf("Failed to distribute register coupon (template %d) to user %d: %v\n", template.ID, userID, err)
			continue
		}
	}

	return nil
}

// OnUserFirstPurchase 用户首次购买时的处理
func (s *Service) OnUserFirstPurchase(userID uint64, orderID uint64) error {
	// 获取邀请关系
	relationship, err := s.repo.GetInvitationRelationship(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil // 没有邀请关系，直接返回
		}
		return err
	}

	if relationship.Status == "activated" || relationship.Status == "rewarded" {
		return nil // 已处理过
	}

	// 更新关系状态
	now := time.Now()
	updates := map[string]interface{}{
		"status":       "activated",
		"activated_at": now,
	}

	if err := s.repo.UpdateInvitationRelationship(relationship.ID, updates); err != nil {
		return err
	}

	// 更新邀请人的付费邀请数
	return s.repo.IncrementInvitationCount(relationship.InviterID, "paid_invites")
}

// ============================================
// 批次管理
// ============================================

// CreateBatchFromRequest 从请求创建批次
func (s *Service) CreateBatchFromRequest(req *CreateBatchRequest, createdBy uint64) (*CouponBatch, error) {
	// 验证模板存在
	template, err := s.repo.GetTemplateByID(req.TemplateID)
	if err != nil {
		return nil, errors.New("template not found")
	}

	if template.Status != TemplateStatusActive {
		return nil, errors.New("template is not active")
	}

	// 转换目标用户
	var targetUsers JSONArray
	if req.TargetUsers != nil && len(req.TargetUsers) > 0 {
		targetUsers = make(JSONArray, len(req.TargetUsers))
		for i, uid := range req.TargetUsers {
			targetUsers[i] = uid
		}
	}

	// 转换条件
	var targetConditions JSONMap
	if req.TargetConditions != nil {
		targetConditions = JSONMap(req.TargetConditions)
	}

	batch := &CouponBatch{
		BatchCode:        req.BatchCode,
		TemplateID:       req.TemplateID,
		Name:             req.Name,
		Description:      req.Description,
		TargetType:       req.TargetType,
		TargetUsers:      targetUsers,
		TargetConditions: targetConditions,
		TotalQuantity:    req.TotalQuantity,
		Status:           "draft",
		ScheduledAt:      req.ScheduledAt,
		CreatedBy:        &createdBy,
	}

	if err := s.repo.CreateBatch(batch); err != nil {
		return nil, err
	}

	return batch, nil
}

// CreateBatch 创建批次（简化版本，保持兼容性）
func (s *Service) CreateBatch(templateID uint64, name string, targetType string, totalQuantity int, createdBy uint64) (*CouponBatch, error) {
	batch := &CouponBatch{
		BatchCode:     GenerateBatchCode(),
		TemplateID:    templateID,
		Name:          name,
		TargetType:    targetType,
		TotalQuantity: totalQuantity,
		Status:        "draft",
		CreatedBy:     &createdBy,
	}

	if err := s.repo.CreateBatch(batch); err != nil {
		return nil, err
	}

	return batch, nil
}

// GetBatch 获取批次详情
func (s *Service) GetBatch(batchID uint64) (*CouponBatch, error) {
	return s.repo.GetBatchByID(batchID)
}

// ListBatches 获取批次列表
func (s *Service) ListBatches(status *string, page, pageSize int) ([]*CouponBatch, int64, error) {
	offset := (page - 1) * pageSize
	return s.repo.ListBatches(status, offset, pageSize)
}

// ExecuteBatch 执行批次发放
func (s *Service) ExecuteBatch(batchID uint64) error {
	batch, err := s.repo.GetBatchByID(batchID)
	if err != nil {
		return err
	}

	if batch.Status != "draft" {
		return errors.New("batch is not in draft status")
	}

	// 更新批次状态为处理中
	now := time.Now()
	if err := s.repo.UpdateBatch(batchID, map[string]interface{}{
		"status":     "processing",
		"started_at": now,
	}); err != nil {
		return err
	}

	// 根据目标类型获取用户列表
	userIDs, err := s.getTargetUsers(batch)
	if err != nil {
		s.repo.UpdateBatch(batchID, map[string]interface{}{
			"status": "cancelled",
		})
		return err
	}

	// 如果指定了数量限制，只取前N个用户
	if batch.TotalQuantity > 0 && len(userIDs) > batch.TotalQuantity {
		userIDs = userIDs[:batch.TotalQuantity]
	}

	// 批量发放折扣券
	distributedCount := 0
	for _, userID := range userIDs {
		// 检查用户是否已经领取过此模板的券
		usageCount, _ := s.repo.CountUserCouponUsage(userID, batch.TemplateID)
		if usageCount >= int64(batch.Template.MaxUsagePerUser) {
			continue
		}

		// 创建用户券
		coupon := &UserCoupon{
			UserID:            userID,
			TemplateID:        batch.TemplateID,
			CouponCode:        GenerateCouponCode(batch.BatchCode),
			SourceType:        SourceTypeBatch,
			SourceID:          fmt.Sprintf("%d", batchID),
			SourceDetail:      JSONMap{"batch_code": batch.BatchCode, "batch_name": batch.Name},
			ValidFrom:         now,
			ValidUntil:        now.AddDate(0, 0, batch.Template.ValidDays),
			Status:            CouponStatusUnused,
			DiscountType:      string(batch.Template.Type),
			DiscountValue:     batch.Template.DiscountValue,
			MinPurchaseAmount: batch.Template.MinPurchaseAmount,
		}

		if err := s.repo.CreateUserCoupon(coupon); err != nil {
			// 记录错误但继续处理
			continue
		}

		distributedCount++
	}

	// 更新批次完成状态
	completedAt := time.Now()
	if err := s.repo.UpdateBatch(batchID, map[string]interface{}{
		"status":               "completed",
		"distributed_quantity": distributedCount,
		"completed_at":         completedAt,
	}); err != nil {
		return err
	}

	return nil
}

// getTargetUsers 根据批次目标类型获取用户ID列表
func (s *Service) getTargetUsers(batch *CouponBatch) ([]uint64, error) {
	switch batch.TargetType {
	case "all":
		// 获取所有用户
		return s.getAllUsers()
	case "new_users":
		// 获取新注册用户（比如最近30天）
		return s.getNewUsers(30)
	case "paid_users":
		// 获取付费用户
		return s.getPaidUsers()
	case "specific_users":
		// 指定的用户列表
		if batch.TargetUsers == nil || len(batch.TargetUsers) == 0 {
			return nil, errors.New("no target users specified")
		}
		userIDs := make([]uint64, 0, len(batch.TargetUsers))
		for _, v := range batch.TargetUsers {
			if uid, ok := v.(float64); ok {
				userIDs = append(userIDs, uint64(uid))
			}
		}
		return userIDs, nil
	case "user_group":
		// 根据条件筛选用户组
		return s.getUsersByConditions(batch.TargetConditions)
	default:
		return nil, errors.New("unsupported target type")
	}
}

// getAllUsers 获取所有用户ID
func (s *Service) getAllUsers() ([]uint64, error) {
	var userIDs []uint64
	err := s.repo.db.Table("users").
		Where("deleted_at IS NULL").
		Pluck("id", &userIDs).Error
	return userIDs, err
}

// getNewUsers 获取最近N天注册的新用户
func (s *Service) getNewUsers(days int) ([]uint64, error) {
	var userIDs []uint64
	since := time.Now().AddDate(0, 0, -days)
	err := s.repo.db.Table("users").
		Where("deleted_at IS NULL AND created_at >= ?", since).
		Pluck("id", &userIDs).Error
	return userIDs, err
}

// getPaidUsers 获取付费用户
func (s *Service) getPaidUsers() ([]uint64, error) {
	var userIDs []uint64
	err := s.repo.db.Table("orders").
		Where("status = ?", "paid").
		Distinct("user_id").
		Pluck("user_id", &userIDs).Error
	return userIDs, err
}

// getUsersByConditions 根据条件获取用户
func (s *Service) getUsersByConditions(conditions JSONMap) ([]uint64, error) {
	// 基于条件构建查询
	query := s.repo.db.Table("users").Where("deleted_at IS NULL")

	// 示例条件处理
	if registeredAfter, ok := conditions["registered_after"].(string); ok {
		query = query.Where("created_at >= ?", registeredAfter)
	}
	if registeredBefore, ok := conditions["registered_before"].(string); ok {
		query = query.Where("created_at <= ?", registeredBefore)
	}

	var userIDs []uint64
	err := query.Pluck("id", &userIDs).Error
	return userIDs, err
}

// CancelBatch 取消批次
func (s *Service) CancelBatch(batchID uint64) error {
	batch, err := s.repo.GetBatchByID(batchID)
	if err != nil {
		return err
	}

	if batch.Status != "draft" && batch.Status != "processing" {
		return errors.New("batch cannot be cancelled")
	}

	return s.repo.UpdateBatch(batchID, map[string]interface{}{
		"status": "cancelled",
	})
}

// ============================================
// 统计
// ============================================

// GetStatistics 获取统计信息
func (s *Service) GetStatistics() (*CouponStatistics, error) {
	return s.repo.GetStatistics()
}

// GetAutoDistributionTemplates 获取自动发放模板
// 用于注册自动发放和邀请自动发放
func (s *Service) GetAutoDistributionTemplates(distributionType DistributionType) ([]*CouponTemplate, error) {
	return s.repo.GetAutoDistributionTemplates(distributionType)
}


// MarkCouponAsUsed marks a coupon as used (called when payment succeeds)
func (s *Service) MarkCouponAsUsed(couponID uint64, orderID uint, usedAt time.Time) error {
	return s.repo.UseCoupon(couponID, uint64(orderID))
}

// UnreserveCoupon unreserves a coupon (called when order is cancelled)
func (s *Service) UnreserveCoupon(couponID uint64) error {
	return s.repo.UpdateUserCoupon(couponID, map[string]interface{}{
		"status": CouponStatusUnused,
	})
}