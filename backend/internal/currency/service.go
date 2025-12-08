package currency

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Service 货币服务
type Service struct {
	repo *Repository
}

// NewService 创建服务实例
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ========== 钱包查询 ==========

// GetWallet 获取用户钱包
func (s *Service) GetWallet(userID uint) (*WalletResponse, error) {
	wallet, err := s.repo.GetWallet(userID)
	if err != nil {
		return nil, err
	}
	return &WalletResponse{
		Gold:    wallet.Gold,
		Diamond: wallet.Diamond,
	}, nil
}

// CheckBalance 检查余额是否充足
func (s *Service) CheckBalance(userID uint, currencyType CurrencyType, amount int64) (*BalanceCheckResult, error) {
	wallet, err := s.repo.GetWallet(userID)
	if err != nil {
		return nil, err
	}

	var balance int64
	switch currencyType {
	case CurrencyGold:
		balance = wallet.Gold
	case CurrencyDiamond:
		balance = wallet.Diamond
	}

	result := &BalanceCheckResult{
		Sufficient: balance >= amount,
		Balance:    balance,
		Required:   amount,
		Shortage:   0,
	}
	if !result.Sufficient {
		result.Shortage = amount - balance
	}
	return result, nil
}

// ========== 生成交易流水号 ==========

func generateTransactionNo() string {
	return fmt.Sprintf("TX%s%s", time.Now().Format("20060102150405"), uuid.New().String()[:8])
}

// ========== 货币配置 ==========

// GetCurrencyConfig 获取单个配置
func (s *Service) GetCurrencyConfig(configKey string) (*CurrencyConfig, error) {
	return s.repo.GetCurrencyConfig(configKey)
}

// GetCurrencyConfigAmount 获取配置金额
func (s *Service) GetCurrencyConfigAmount(configKey string) (int64, error) {
	return s.repo.GetCurrencyConfigAmount(configKey)
}

// ListCurrencyConfigs 获取所有配置
func (s *Service) ListCurrencyConfigs() ([]CurrencyConfig, error) {
	return s.repo.ListCurrencyConfigs()
}

// ListCurrencyConfigsByCategory 按分类获取配置
func (s *Service) ListCurrencyConfigsByCategory(category string) ([]CurrencyConfig, error) {
	return s.repo.ListCurrencyConfigsByCategory(category)
}

// SaveCurrencyConfig 保存配置
func (s *Service) SaveCurrencyConfig(config *CurrencyConfig) error {
	return s.repo.SaveCurrencyConfig(config)
}

// UpdateCurrencyConfigAmount 更新配置金额
func (s *Service) UpdateCurrencyConfigAmount(configKey string, amount int64) error {
	return s.repo.UpdateCurrencyConfigAmount(configKey, amount)
}

// InitDefaultConfigs 初始化默认配置
func (s *Service) InitDefaultConfigs() error {
	return s.repo.InitDefaultConfigs()
}

// EnsureWalletExists 确保钱包存在
func (s *Service) EnsureWalletExists(userID uint) error {
	return s.repo.EnsureWalletExists(userID)
}

