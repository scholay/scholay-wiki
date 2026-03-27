// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"fmt"
	"log/slog"
	"sort"
)

// GetAnalysisDimensionsResult 返回维度列表和是否自定义的标志
type GetAnalysisDimensionsResult struct {
	Dimensions []AnalysisDimension
	IsCustom   bool
}

// 用户维度数量限制
const MaxUserDimensions = 15

// GetAnalysisDimensions 获取用户的分析维度
// 采用覆盖式设计：系统默认维度 + 用户自定义维度（用户自定义覆盖同dimension_key的系统默认）
func (s *Service) GetAnalysisDimensions(userID *uint) (*GetAnalysisDimensionsResult, error) {
	var systemDimensions []AnalysisDimension
	err := s.db.Where("user_id = -1 AND is_active = ?", true).
		Order("sort_order ASC").
		Find(&systemDimensions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get system dimensions: %w", err)
	}

	if userID == nil || *userID == 0 {
		slog.Info("Using system default dimensions", "count", len(systemDimensions))
		return &GetAnalysisDimensionsResult{
			Dimensions: systemDimensions,
			IsCustom:   false,
		}, nil
	}

	var userDimensions []AnalysisDimension
	err = s.db.Where("user_id = ?", *userID).
		Find(&userDimensions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get user dimensions: %w", err)
	}

	if len(userDimensions) == 0 {
		slog.Info("Using system default dimensions for user", "count", len(systemDimensions), "userId", *userID)
		return &GetAnalysisDimensionsResult{
			Dimensions: systemDimensions,
			IsCustom:   false,
		}, nil
	}

	// 合并：用户自定义覆盖系统默认（按dimension_key匹配）
	userDimMap := make(map[string]AnalysisDimension)
	for _, ud := range userDimensions {
		userDimMap[ud.DimensionKey] = ud
	}

	var mergedDimensions []AnalysisDimension
	customCount := 0
	for _, sd := range systemDimensions {
		if ud, exists := userDimMap[sd.DimensionKey]; exists {
			if ud.IsActive {
				mergedDimensions = append(mergedDimensions, ud)
				customCount++
			}
		} else {
			mergedDimensions = append(mergedDimensions, sd)
		}
	}

	systemKeySet := make(map[string]bool)
	for _, sd := range systemDimensions {
		systemKeySet[sd.DimensionKey] = true
	}
	for _, ud := range userDimensions {
		if !systemKeySet[ud.DimensionKey] && ud.IsActive {
			mergedDimensions = append(mergedDimensions, ud)
			customCount++
		}
	}

	sort.Slice(mergedDimensions, func(i, j int) bool {
		return mergedDimensions[i].SortOrder < mergedDimensions[j].SortOrder
	})

	slog.Info("Merged dimensions for user", "userId", *userID, "total", len(mergedDimensions), "customized", customCount)
	return &GetAnalysisDimensionsResult{
		Dimensions: mergedDimensions,
		IsCustom:   customCount > 0,
	}, nil
}

// GetSystemDimensions 获取系统默认维度（user_id = -1 表示系统级）
func (s *Service) GetSystemDimensions() ([]AnalysisDimension, error) {
	var dimensions []AnalysisDimension
	err := s.db.Where("user_id = -1 AND is_active = ?", true).
		Order("sort_order ASC").
		Find(&dimensions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get system dimensions: %w", err)
	}
	return dimensions, nil
}

// GetUserDimensions 获取用户自定义维度
func (s *Service) GetUserDimensions(userID uint) ([]AnalysisDimension, error) {
	var dimensions []AnalysisDimension
	err := s.db.Where("user_id = ? AND is_active = ?", userID, true).
		Order("sort_order ASC").
		Find(&dimensions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get user dimensions: %w", err)
	}
	return dimensions, nil
}

// CreateUserDimension 创建或更新用户自定义维度
// 如果用户已有该dimension_key的自定义，则更新；否则创建新的
func (s *Service) CreateUserDimension(userID uint, dimensionKey, name, description string, sortOrder int) (*AnalysisDimension, error) {
	var existingDimension AnalysisDimension
	err := s.db.Where("user_id = ? AND dimension_key = ?", userID, dimensionKey).First(&existingDimension).Error

	if err == nil {
		existingDimension.Name = name
		existingDimension.Description = description
		existingDimension.SortOrder = sortOrder
		existingDimension.IsActive = true

		if err := s.db.Save(&existingDimension).Error; err != nil {
			return nil, fmt.Errorf("failed to update dimension: %w", err)
		}
		slog.Info("Updated user dimension", "dimensionKey", dimensionKey, "userId", userID)
		return &existingDimension, nil
	}

	var systemDimension AnalysisDimension
	isModifyingSystemDimension := s.db.Where("user_id = -1 AND dimension_key = ?", dimensionKey).First(&systemDimension).Error == nil

	if !isModifyingSystemDimension {
		currentCount, err := s.GetUserDimensionCount(userID)
		if err != nil {
			return nil, fmt.Errorf("failed to check dimension count: %w", err)
		}
		if currentCount >= MaxUserDimensions {
			return nil, fmt.Errorf("已达到维度数量上限（%d个），请删除部分自定义维度后再添加", MaxUserDimensions)
		}
	}

	dimension := &AnalysisDimension{
		UserID:       int64(userID),
		DimensionKey: dimensionKey,
		Name:         name,
		Description:  description,
		SortOrder:    sortOrder,
		IsActive:     true,
	}

	if err := s.db.Create(dimension).Error; err != nil {
		return nil, fmt.Errorf("failed to create dimension: %w", err)
	}

	if isModifyingSystemDimension {
		slog.Info("Created user override for system dimension", "dimensionKey", dimensionKey, "userId", userID)
	} else {
		slog.Info("Created new user dimension", "dimensionKey", dimensionKey, "userId", userID)
	}
	return dimension, nil
}

// GetUserDimensionCount 获取用户的维度总数
func (s *Service) GetUserDimensionCount(userID uint) (int, error) {
	systemDimensions, err := s.GetSystemDimensions()
	if err != nil {
		return 0, err
	}
	systemKeySet := make(map[string]bool)
	for _, sd := range systemDimensions {
		systemKeySet[sd.DimensionKey] = true
	}

	userDimensions, err := s.GetUserDimensions(userID)
	if err != nil {
		return 0, err
	}

	customCount := 0
	for _, ud := range userDimensions {
		if !systemKeySet[ud.DimensionKey] {
			customCount++
		}
	}

	totalCount := len(systemDimensions) + customCount
	slog.Info("User dimension count", "userId", userID, "total", totalCount, "system", len(systemDimensions), "custom", customCount)
	return totalCount, nil
}

// UpdateUserDimension 更新用户自定义维度
func (s *Service) UpdateUserDimension(userID uint, dimensionID uint, name, description string, sortOrder int) (*AnalysisDimension, error) {
	var dimension AnalysisDimension
	if err := s.db.Where("id = ? AND user_id = ?", dimensionID, userID).First(&dimension).Error; err != nil {
		return nil, fmt.Errorf("dimension not found: %w", err)
	}

	dimension.Name = name
	dimension.Description = description
	dimension.SortOrder = sortOrder

	if err := s.db.Save(&dimension).Error; err != nil {
		return nil, fmt.Errorf("failed to update dimension: %w", err)
	}

	return &dimension, nil
}

// DeleteUserDimension 删除用户自定义维度
func (s *Service) DeleteUserDimension(userID uint, dimensionID uint) error {
	result := s.db.Where("id = ? AND user_id = ?", dimensionID, userID).Delete(&AnalysisDimension{})
	if result.Error != nil {
		return fmt.Errorf("failed to delete dimension: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("dimension not found or not owned by user")
	}
	return nil
}

// ResetUserDimensionToDefault 重置用户的某个维度为系统默认
func (s *Service) ResetUserDimensionToDefault(userID uint, dimensionKey string) error {
	result := s.db.Where("user_id = ? AND dimension_key = ?", userID, dimensionKey).Delete(&AnalysisDimension{})
	if result.Error != nil {
		return fmt.Errorf("failed to reset dimension: %w", result.Error)
	}
	slog.Info("Reset dimension to default", "dimensionKey", dimensionKey, "userId", userID)
	return nil
}

// ResetAllUserDimensions 重置用户的所有维度为系统默认
func (s *Service) ResetAllUserDimensions(userID uint) error {
	result := s.db.Where("user_id = ?", userID).Delete(&AnalysisDimension{})
	if result.Error != nil {
		return fmt.Errorf("failed to reset all dimensions: %w", result.Error)
	}
	slog.Info("Reset all dimensions to default", "userId", userID, "deleted", result.RowsAffected)
	return nil
}

// CopySystemDimensionsToUser 将系统默认维度复制给用户（用于用户首次自定义）
func (s *Service) CopySystemDimensionsToUser(userID uint) ([]AnalysisDimension, error) {
	systemDimensions, err := s.GetSystemDimensions()
	if err != nil {
		return nil, err
	}

	var userDimensions []AnalysisDimension
	for _, sd := range systemDimensions {
		ud := AnalysisDimension{
			UserID:       int64(userID),
			DimensionKey: sd.DimensionKey,
			Name:         sd.Name,
			Description:  sd.Description,
			SortOrder:    sd.SortOrder,
			IsActive:     true,
		}
		if err := s.db.Create(&ud).Error; err != nil {
			return nil, fmt.Errorf("failed to copy dimension %s: %w", sd.DimensionKey, err)
		}
		userDimensions = append(userDimensions, ud)
	}

	slog.Info("Copied system dimensions to user", "count", len(userDimensions), "userId", userID)
	return userDimensions, nil
}

// UpdateSystemDimension 更新系统默认维度（管理员接口）
func (s *Service) UpdateSystemDimension(dimensionID uint, name, description string, sortOrder int, isActive bool) (*AnalysisDimension, error) {
	var dimension AnalysisDimension
	if err := s.db.Where("id = ? AND user_id = -1", dimensionID).First(&dimension).Error; err != nil {
		return nil, fmt.Errorf("system dimension not found: %w", err)
	}

	dimension.Name = name
	dimension.Description = description
	dimension.SortOrder = sortOrder
	dimension.IsActive = isActive

	if err := s.db.Save(&dimension).Error; err != nil {
		return nil, fmt.Errorf("failed to update dimension: %w", err)
	}

	slog.Info("Updated system dimension", "dimensionKey", dimension.DimensionKey, "id", dimension.ID)
	return &dimension, nil
}
