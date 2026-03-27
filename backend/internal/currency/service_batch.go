package currency

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

// MessageSender 站内信发送接口
type MessageSender interface {
	SendToUser(userID uint, title, content, category, linkURL, linkText string) error
}

// BatchService 批量发放服务
type BatchService struct {
	repo           *Repository
	currencyService *Service
	messageSender  MessageSender
}

// NewBatchService 创建批量发放服务
func NewBatchService(repo *Repository, currencyService *Service) *BatchService {
	return &BatchService{
		repo:           repo,
		currencyService: currencyService,
	}
}

// SetMessageSender 设置站内信发送器
func (s *BatchService) SetMessageSender(sender MessageSender) {
	s.messageSender = sender
}

// CreateBatchDistribute 创建并执行批量发放
func (s *BatchService) CreateBatchDistribute(ctx context.Context, req *BatchDistributeRequest, adminID uint, adminName string) (*BatchResponse, error) {
	// 1. 验证请求
	if req.TargetType == BatchTargetSpecific && len(req.TargetUserIDs) == 0 {
		return nil, fmt.Errorf("指定用户发放时必须提供用户ID列表")
	}

	// 2. 获取目标用户列表
	userIDs, err := s.getTargetUserIDs(req)
	if err != nil {
		return nil, fmt.Errorf("获取目标用户失败: %w", err)
	}
	if len(userIDs) == 0 {
		return nil, fmt.Errorf("没有符合条件的用户")
	}

	// 3. 创建批次记录
	batch := &CurrencyBatch{
		BatchNo:       s.generateBatchNo(),
		CurrencyType:  req.CurrencyType,
		Amount:        req.Amount,
		TargetType:    req.TargetType,
		Title:         req.Title,
		Description:   req.Description,
		Remark:        req.Remark,
		TotalCount:    len(userIDs),
		SuccessCount:  0,
		FailedCount:   0,
		Status:        BatchStatusPending,
		CreatedBy:     adminID,
		CreatedByName: adminName,
	}

	// 存储指定用户ID列表
	if req.TargetType == BatchTargetSpecific {
		userIDsJSON, _ := json.Marshal(req.TargetUserIDs)
		batch.TargetUserIDs = string(userIDsJSON)
	}

	if err := s.repo.CreateBatch(batch); err != nil {
		return nil, fmt.Errorf("创建批次记录失败: %w", err)
	}

	// 4. 创建发放明细记录
	distributions := make([]BatchDistribution, len(userIDs))
	for i, userID := range userIDs {
		distributions[i] = BatchDistribution{
			BatchID:      batch.ID,
			BatchNo:      batch.BatchNo,
			UserID:       userID,
			CurrencyType: req.CurrencyType,
			Amount:       req.Amount,
			Status:       TxStatusPending,
		}
	}
	if err := s.repo.CreateBatchDistributionsBulk(distributions); err != nil {
		return nil, fmt.Errorf("创建发放明细失败: %w", err)
	}

	// 5. 异步执行发放
	go s.executeBatch(batch.ID, req.Title, req.Description)

	return &BatchResponse{
		ID:            batch.ID,
		BatchNo:       batch.BatchNo,
		CurrencyType:  batch.CurrencyType,
		CurrencyName:  getCurrencyName(batch.CurrencyType),
		Amount:        batch.Amount,
		TargetType:    batch.TargetType,
		TargetName:    getTargetName(batch.TargetType),
		Title:         batch.Title,
		Description:   batch.Description,
		Remark:        batch.Remark,
		TotalCount:    batch.TotalCount,
		SuccessCount:  batch.SuccessCount,
		FailedCount:   batch.FailedCount,
		Status:        batch.Status,
		StatusName:    getStatusName(batch.Status),
		CreatedBy:     batch.CreatedBy,
		CreatedByName: batch.CreatedByName,
		CreatedAt:     batch.CreatedAt,
	}, nil
}

// executeBatch 执行批量发放
func (s *BatchService) executeBatch(batchID uint, title, description string) {
	ctx := context.Background()

	// 更新状态为执行中
	if err := s.repo.UpdateBatchStatus(batchID, BatchStatusProcessing); err != nil {
		slog.Error("Failed to update batch status", "batchID", batchID, "err", err)
		return
	}

	var successCount, failedCount int
	batchSize := 100 // 每批处理100个用户

	for {
		// 获取待处理的发放明细
		distributions, err := s.repo.GetPendingDistributions(batchID, batchSize)
		if err != nil {
			slog.Error("Failed to get pending distributions", "batchID", batchID, "err", err)
			break
		}
		if len(distributions) == 0 {
			break
		}

		// 逐个处理
		for _, dist := range distributions {
			txNo, err := s.distributeToUser(ctx, dist.UserID, dist.CurrencyType, dist.Amount, title, description)
			if err != nil {
				// 发放失败
				failedCount++
				s.repo.UpdateBatchDistributionStatus(dist.ID, TxStatusFailed, "", err.Error())
				slog.Error("Failed to distribute to user", "userID", dist.UserID, "err", err)
			} else {
				// 发放成功
				successCount++
				s.repo.UpdateBatchDistributionStatus(dist.ID, TxStatusSuccess, txNo, "")
			}
		}

		// 更新批次统计
		s.repo.UpdateBatchCounts(batchID, successCount, failedCount)
	}

	// 更新最终状态
	finalStatus := BatchStatusCompleted
	if failedCount > 0 && successCount == 0 {
		finalStatus = BatchStatusFailed
	}
	s.repo.UpdateBatchStatus(batchID, finalStatus)

	slog.Info("Batch completed", "batchID", batchID, "success", successCount, "failed", failedCount)
}

// distributeToUser 向单个用户发放货币
func (s *BatchService) distributeToUser(ctx context.Context, userID uint, currencyType CurrencyType, amount int64, title, description string) (string, error) {
	// 执行发放交易
	bizType := "admin_batch_gift"
	bizID := fmt.Sprintf("batch_%d_%d", userID, time.Now().UnixNano())

	var tx *Transaction
	var err error

	// 根据货币类型选择发放方法
	if currencyType == CurrencyGold {
		tx, err = s.currencyService.Gift(ctx, userID, CurrencyGold, amount, bizType, bizID, title)
	} else {
		tx, err = s.currencyService.Gift(ctx, userID, CurrencyDiamond, amount, bizType, bizID, title)
	}

	if err != nil {
		return "", err
	}

	// 发送站内信通知
	s.sendNotification(userID, currencyType, amount, title, description)

	return tx.TransactionNo, nil
}

// sendNotification 发送站内信通知
func (s *BatchService) sendNotification(userID uint, currencyType CurrencyType, amount int64, title, description string) {
	if s.messageSender == nil {
		return
	}

	currencyName := "经费"
	if currencyType == CurrencyDiamond {
		currencyName = "恩特币"
	}

	// 构建通知内容
	content := description
	if content == "" {
		content = fmt.Sprintf("您收到%d%s，请查收", amount, currencyName)
	}

	go func() {
		if err := s.messageSender.SendToUser(userID, title, content, "transaction", "/wallet", "查看钱包"); err != nil {
			slog.Error("Failed to send notification to user", "userID", userID, "err", err)
		}
	}()
}

// GetAllActiveUserIDs returns all active user IDs
func (s *BatchService) GetAllActiveUserIDs() ([]uint, error) {
	return s.repo.GetAllActiveUserIDs()
}

// GetMemberUserIDs returns user IDs with active memberships
func (s *BatchService) GetMemberUserIDs() ([]uint, error) {
	return s.repo.GetMemberUserIDs()
}

// GetNonMemberUserIDs returns user IDs without active memberships
func (s *BatchService) GetNonMemberUserIDs() ([]uint, error) {
	return s.repo.GetNonMemberUserIDs()
}

// getTargetUserIDs 获取目标用户ID列表
func (s *BatchService) getTargetUserIDs(req *BatchDistributeRequest) ([]uint, error) {
	switch req.TargetType {
	case BatchTargetAll:
		return s.repo.GetAllActiveUserIDs()
	case BatchTargetMembers:
		return s.repo.GetMemberUserIDs()
	case BatchTargetNonMembers:
		return s.repo.GetNonMemberUserIDs()
	case BatchTargetSpecific:
		return req.TargetUserIDs, nil
	default:
		return nil, fmt.Errorf("未知的目标类型: %s", req.TargetType)
	}
}

// generateBatchNo 生成批次号
func (s *BatchService) generateBatchNo() string {
	return fmt.Sprintf("BATCH%s%d", time.Now().Format("20060102150405"), time.Now().UnixNano()%10000)
}

// GetBatch 获取批次详情
func (s *BatchService) GetBatch(id uint) (*BatchResponse, error) {
	batch, err := s.repo.GetBatch(id)
	if err != nil {
		return nil, err
	}
	if batch == nil {
		return nil, fmt.Errorf("批次不存在")
	}
	resp := toBatchResponse(batch)
	return &resp, nil
}

// ListBatches 获取批次列表
func (s *BatchService) ListBatches(req *BatchListRequest) (*BatchListResponse, error) {
	return s.repo.ListBatches(req)
}

// CancelBatch 取消批次（仅待执行状态可取消）
func (s *BatchService) CancelBatch(id uint) error {
	batch, err := s.repo.GetBatch(id)
	if err != nil {
		return err
	}
	if batch == nil {
		return fmt.Errorf("批次不存在")
	}
	if batch.Status != BatchStatusPending {
		return fmt.Errorf("只能取消待执行状态的批次")
	}
	return s.repo.UpdateBatchStatus(id, BatchStatusCancelled)
}

// GetBatchDistributions 获取批次发放明细
func (s *BatchService) GetBatchDistributions(batchID uint, page, pageSize int) ([]BatchDistribution, int64, error) {
	return s.repo.ListBatchDistributions(batchID, page, pageSize)
}

// 辅助函数
func getCurrencyName(t CurrencyType) string {
	if t == CurrencyDiamond {
		return "恩特币"
	}
	return "经费"
}

func getTargetName(t BatchTargetType) string {
	switch t {
	case BatchTargetAll:
		return "全部用户"
	case BatchTargetMembers:
		return "会员用户"
	case BatchTargetNonMembers:
		return "非会员用户"
	case BatchTargetSpecific:
		return "指定用户"
	default:
		return "未知"
	}
}

func getStatusName(s BatchStatus) string {
	switch s {
	case BatchStatusPending:
		return "待执行"
	case BatchStatusProcessing:
		return "执行中"
	case BatchStatusCompleted:
		return "已完成"
	case BatchStatusFailed:
		return "失败"
	case BatchStatusCancelled:
		return "已取消"
	default:
		return "未知"
	}
}
