package fund

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Repository 基金仓储层
type Repository struct {
	db *gorm.DB
}

// NewRepository 创建仓储实例
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ========== 基金操作 ==========

// GetFundByMonth 根据月份获取基金
func (r *Repository) GetFundByMonth(month string) (*MembershipFund, error) {
	var fund MembershipFund
	err := r.db.Where("fund_month = ?", month).First(&fund).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &fund, nil
}

// GetFundByID 根据ID获取基金
func (r *Repository) GetFundByID(id uint) (*MembershipFund, error) {
	var fund MembershipFund
	err := r.db.First(&fund, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &fund, nil
}

// GetCurrentFund 获取当前月份的基金
func (r *Repository) GetCurrentFund() (*MembershipFund, error) {
	currentMonth := time.Now().Format("2006-01")
	return r.GetFundByMonth(currentMonth)
}

// ListFunds 获取基金列表
func (r *Repository) ListFunds(status string, page, pageSize int) ([]MembershipFund, int64, error) {
	var funds []MembershipFund
	var total int64

	query := r.db.Model(&MembershipFund{})
	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	err := query.Order("fund_month DESC").Offset(offset).Limit(pageSize).Find(&funds).Error
	return funds, total, err
}

// ListAllFunds 获取所有基金（用于前端展示）
func (r *Repository) ListAllFunds() ([]MembershipFund, error) {
	var funds []MembershipFund
	err := r.db.Order("fund_month DESC").Find(&funds).Error
	return funds, err
}

// ListActiveFunds 获取已生效的基金（active + completed）
func (r *Repository) ListActiveFunds() ([]MembershipFund, error) {
	var funds []MembershipFund
	err := r.db.Where("status IN ?", []string{FundStatusActive, FundStatusCompleted}).
		Order("fund_month DESC").Find(&funds).Error
	return funds, err
}

// CreateFund 创建基金
func (r *Repository) CreateFund(fund *MembershipFund) error {
	return r.db.Create(fund).Error
}

// UpdateFund 更新基金
func (r *Repository) UpdateFund(fund *MembershipFund) error {
	return r.db.Save(fund).Error
}

// DeleteFund 删除基金
func (r *Repository) DeleteFund(id uint) error {
	return r.db.Delete(&MembershipFund{}, id).Error
}

// IncrementFundStats 增加基金统计数据
func (r *Repository) IncrementFundStats(fundID uint, goldAmount, diamondAmount int64) error {
	return r.db.Model(&MembershipFund{}).Where("id = ?", fundID).Updates(map[string]any{
		"total_distributed_gold":    gorm.Expr("total_distributed_gold + ?", goldAmount),
		"total_distributed_diamond": gorm.Expr("total_distributed_diamond + ?", diamondAmount),
		"beneficiary_count":         gorm.Expr("beneficiary_count + 1"),
	}).Error
}

// ========== 发放记录操作 ==========

// GetDistribution 获取用户在某基金的发放记录
func (r *Repository) GetDistribution(fundID, userID uint) (*MembershipFundDistribution, error) {
	var dist MembershipFundDistribution
	err := r.db.Where("fund_id = ? AND user_id = ?", fundID, userID).First(&dist).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &dist, nil
}

// CreateDistribution 创建发放记录
func (r *Repository) CreateDistribution(dist *MembershipFundDistribution) error {
	return r.db.Create(dist).Error
}

// ListUserDistributions 获取用户的所有发放记录
func (r *Repository) ListUserDistributions(userID uint) ([]MembershipFundDistribution, error) {
	var dists []MembershipFundDistribution
	err := r.db.Preload("Fund").Where("user_id = ?", userID).
		Order("distributed_at DESC").Find(&dists).Error
	return dists, err
}

// ListFundDistributions 获取基金的所有发放记录
func (r *Repository) ListFundDistributions(fundID uint, page, pageSize int) ([]MembershipFundDistribution, int64, error) {
	var dists []MembershipFundDistribution
	var total int64

	query := r.db.Model(&MembershipFundDistribution{}).Where("fund_id = ?", fundID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	err := query.Order("distributed_at DESC").Offset(offset).Limit(pageSize).Find(&dists).Error
	return dists, total, err
}

// GetFundTotalStats 获取所有基金的总统计
func (r *Repository) GetFundTotalStats() (totalGold, totalDiamond int64, totalBeneficiaries int, err error) {
	var result struct {
		TotalGold         int64
		TotalDiamond      int64
		TotalBeneficiaries int
	}
	err = r.db.Model(&MembershipFund{}).Select(
		"COALESCE(SUM(total_distributed_gold), 0) as total_gold, " +
			"COALESCE(SUM(total_distributed_diamond), 0) as total_diamond, " +
			"COALESCE(SUM(beneficiary_count), 0) as total_beneficiaries",
	).Scan(&result).Error
	return result.TotalGold, result.TotalDiamond, result.TotalBeneficiaries, err
}

