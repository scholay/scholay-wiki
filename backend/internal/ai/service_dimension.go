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
	systemDimensions, err := s.repo.GetSystemDimensions()
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

	userDimensions, err := s.repo.GetAllUserDimensions(*userID)
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
	return s.repo.GetSystemDimensions()
}

// GetUserDimensions 获取用户自定义维度
func (s *Service) GetUserDimensions(userID uint) ([]AnalysisDimension, error) {
	return s.repo.GetUserDimensions(userID)
}

// CreateUserDimension 创建或更新用户自定义维度
// 如果用户已有该dimension_key的自定义，则更新；否则创建新的
func (s *Service) CreateUserDimension(userID uint, dimensionKey, name, description string, sortOrder int) (*AnalysisDimension, error) {
	existingDimension, err := s.repo.FindDimensionByUserAndKey(userID, dimensionKey)

	if err == nil {
		existingDimension.Name = name
		existingDimension.Description = description
		existingDimension.SortOrder = sortOrder
		existingDimension.IsActive = true

		if err := s.repo.SaveDimension(existingDimension); err != nil {
			return nil, fmt.Errorf("failed to update dimension: %w", err)
		}
		slog.Info("Updated user dimension", "dimensionKey", dimensionKey, "userId", userID)
		return existingDimension, nil
	}

	_, sysErr := s.repo.FindSystemDimensionByKey(dimensionKey)
	isModifyingSystemDimension := sysErr == nil

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

	if err := s.repo.CreateDimension(dimension); err != nil {
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
	dimension, err := s.repo.FindDimensionByIDAndUser(dimensionID, userID)
	if err != nil {
		return nil, fmt.Errorf("dimension not found: %w", err)
	}

	dimension.Name = name
	dimension.Description = description
	dimension.SortOrder = sortOrder

	if err := s.repo.SaveDimension(dimension); err != nil {
		return nil, fmt.Errorf("failed to update dimension: %w", err)
	}

	return dimension, nil
}

// DeleteUserDimension 删除用户自定义维度
func (s *Service) DeleteUserDimension(userID uint, dimensionID uint) error {
	rowsAffected, err := s.repo.DeleteDimensionByIDAndUser(dimensionID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete dimension: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("dimension not found or not owned by user")
	}
	return nil
}

// ResetUserDimensionToDefault 重置用户的某个维度为系统默认
func (s *Service) ResetUserDimensionToDefault(userID uint, dimensionKey string) error {
	if err := s.repo.DeleteDimensionByUserAndKey(userID, dimensionKey); err != nil {
		return fmt.Errorf("failed to reset dimension: %w", err)
	}
	slog.Info("Reset dimension to default", "dimensionKey", dimensionKey, "userId", userID)
	return nil
}

// ResetAllUserDimensions 重置用户的所有维度为系统默认
func (s *Service) ResetAllUserDimensions(userID uint) error {
	rowsAffected, err := s.repo.DeleteAllUserDimensions(userID)
	if err != nil {
		return fmt.Errorf("failed to reset all dimensions: %w", err)
	}
	slog.Info("Reset all dimensions to default", "userId", userID, "deleted", rowsAffected)
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
		if err := s.repo.CreateDimension(&ud); err != nil {
			return nil, fmt.Errorf("failed to copy dimension %s: %w", sd.DimensionKey, err)
		}
		userDimensions = append(userDimensions, ud)
	}

	slog.Info("Copied system dimensions to user", "count", len(userDimensions), "userId", userID)
	return userDimensions, nil
}

// UpdateSystemDimension 更新系统默认维度（管理员接口）
func (s *Service) UpdateSystemDimension(dimensionID uint, name, description string, sortOrder int, isActive bool) (*AnalysisDimension, error) {
	dimension, err := s.repo.FindSystemDimensionByID(dimensionID)
	if err != nil {
		return nil, fmt.Errorf("system dimension not found: %w", err)
	}

	dimension.Name = name
	dimension.Description = description
	dimension.SortOrder = sortOrder
	dimension.IsActive = isActive

	if err := s.repo.SaveDimension(dimension); err != nil {
		return nil, fmt.Errorf("failed to update dimension: %w", err)
	}

	slog.Info("Updated system dimension", "dimensionKey", dimension.DimensionKey, "id", dimension.ID)
	return dimension, nil
}
