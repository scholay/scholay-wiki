package fund

import (
	"fmt"
	"time"
)

// Service 基金服务
type Service struct {
	repo *Repository
}

// NewService 创建服务实例
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ========== 基金查询 ==========

// GetCurrentFund 获取当前月份的基金
func (s *Service) GetCurrentFund() (*MembershipFund, error) {
	return s.repo.GetCurrentFund()
}

// GetFundByMonth 根据月份获取基金
func (s *Service) GetFundByMonth(month string) (*MembershipFund, error) {
	return s.repo.GetFundByMonth(month)
}

// GetFundByID 根据ID获取基金
func (s *Service) GetFundByID(id uint) (*MembershipFund, error) {
	return s.repo.GetFundByID(id)
}

// GetFundDetail 获取基金详情（包含用户领取信息）
func (s *Service) GetFundDetail(fundID, userID uint) (*FundDetail, error) {
	fund, err := s.repo.GetFundByID(fundID)
	if err != nil {
		return nil, err
	}
	if fund == nil {
		return nil, nil
	}

	detail := &FundDetail{
		MembershipFund: *fund,
	}

	// 查询用户是否已领取
	if userID > 0 {
		dist, err := s.repo.GetDistribution(fundID, userID)
		if err != nil {
			return nil, err
		}
		if dist != nil {
			detail.UserReceived = true
			detail.UserGoldAmount = dist.GoldAmount
			detail.UserDiamondAmount = dist.DiamondAmount
		}
	}

	return detail, nil
}

// ListFunds 获取基金列表（管理后台用）
func (s *Service) ListFunds(status string, page, pageSize int) ([]MembershipFund, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.ListFunds(status, page, pageSize)
}

// ListActiveFunds 获取已生效的基金（用户端用）
func (s *Service) ListActiveFunds() ([]MembershipFund, error) {
	return s.repo.ListActiveFunds()
}

// ListAllFunds 获取所有基金
func (s *Service) ListAllFunds() ([]MembershipFund, error) {
	return s.repo.ListAllFunds()
}

// ========== 基金管理 ==========

// CreateFund 创建基金
func (s *Service) CreateFund(fund *MembershipFund) error {
	// 验证月份格式
	if len(fund.FundMonth) != 7 {
		return fmt.Errorf("月份格式错误，应为 YYYY-MM")
	}

	// 检查是否已存在
	existing, err := s.repo.GetFundByMonth(fund.FundMonth)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("该月份的基金已存在")
	}

	// 设置默认状态
	if fund.Status == "" {
		fund.Status = FundStatusPending
	}

	return s.repo.CreateFund(fund)
}

// UpdateFund 更新基金
func (s *Service) UpdateFund(fund *MembershipFund) error {
	return s.repo.UpdateFund(fund)
}

// DeleteFund 删除基金
func (s *Service) DeleteFund(id uint) error {
	fund, err := s.repo.GetFundByID(id)
	if err != nil {
		return err
	}
	if fund == nil {
		return fmt.Errorf("基金不存在")
	}
	if fund.BeneficiaryCount > 0 {
		return fmt.Errorf("已有用户领取，无法删除")
	}
	return s.repo.DeleteFund(id)
}

// ========== 基金发放 ==========

// GetOrCreateCurrentFund 获取或创建当前月份的基金
func (s *Service) GetOrCreateCurrentFund() (*MembershipFund, error) {
	currentMonth := time.Now().Format("2006-01")
	fund, err := s.repo.GetFundByMonth(currentMonth)
	if err != nil {
		return nil, err
	}

	if fund == nil {
		// 自动创建当月基金
		fund = &MembershipFund{
			FundMonth:        currentMonth,
			FundName:         s.generateFundName(currentMonth),
			FundSlogan:       "Scholay会员专属福利",
			FundDescription:  fmt.Sprintf("%s月份会员专属基金，感谢您对Scholay的支持与信任。", currentMonth),
			ThemeColor:       "#6366f1",
			ProGoldAmount:    5000,
			MaxGoldAmount:    10000,
			MaxDiamondAmount: 6,
			Status:           FundStatusActive,
		}
		if err := s.repo.CreateFund(fund); err != nil {
			return nil, err
		}
	}

	return fund, nil
}

// generateFundName 根据月份生成基金名称
func (s *Service) generateFundName(month string) string {
	// 解析月份
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return "会员基金"
	}

	// 根据月份生成名称
	monthNames := map[int]string{
		1:  "新春基金",
		2:  "元宵基金",
		3:  "惊蛰基金",
		4:  "清明基金",
		5:  "立夏基金",
		6:  "仲夏基金",
		7:  "盛夏基金",
		8:  "立秋基金",
		9:  "中秋基金",
		10: "重阳基金",
		11: "立冬基金",
		12: "冬至基金",
	}

	if name, ok := monthNames[int(t.Month())]; ok {
		return name
	}
	return "会员基金"
}

// RecordDistribution 记录基金发放
func (s *Service) RecordDistribution(fundID, userID uint, membershipType string, goldAmount, diamondAmount int64, transactionNo string) error {
	// 检查是否已发放
	existing, err := s.repo.GetDistribution(fundID, userID)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("该用户已领取过此基金")
	}

	// 创建发放记录
	dist := &MembershipFundDistribution{
		FundID:         fundID,
		UserID:         userID,
		MembershipType: membershipType,
		GoldAmount:     goldAmount,
		DiamondAmount:  diamondAmount,
		TransactionNo:  transactionNo,
		DistributedAt:  time.Now(),
	}
	if err := s.repo.CreateDistribution(dist); err != nil {
		return err
	}

	// 更新基金统计
	return s.repo.IncrementFundStats(fundID, goldAmount, diamondAmount)
}

// HasUserReceivedFund 检查用户是否已领取某基金
func (s *Service) HasUserReceivedFund(fundID, userID uint) (bool, error) {
	dist, err := s.repo.GetDistribution(fundID, userID)
	if err != nil {
		return false, err
	}
	return dist != nil, nil
}

// ListUserDistributions 获取用户的发放历史
func (s *Service) ListUserDistributions(userID uint) ([]MembershipFundDistribution, error) {
	return s.repo.ListUserDistributions(userID)
}

// ========== 统计 ==========

// GetTotalStats 获取总统计
func (s *Service) GetTotalStats() (totalGold, totalDiamond int64, totalBeneficiaries int, err error) {
	return s.repo.GetFundTotalStats()
}

