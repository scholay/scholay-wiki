// ============================================================================
// promptregistry/repository — DB 直接交互层
//
// 只做 SQL, 不做缓存 / 业务规则 / picker。缓存在 Service 层做, picker 在
// agentbridge 包做。
// ============================================================================

package promptregistry

import (
	"errors"

	"gorm.io/gorm"
)

// ErrNotFound — 业务可识别的"找不到"。Service 层会把它翻译给 caller。
var ErrNotFound = errors.New("promptregistry: prompt not found")

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ─── Read paths ──────────────────────────────────────────────────────────

// GetBySlug — BySlugPicker 的主路径。走 uk_feature_slug 唯一索引, O(1)。
func (r *Repository) GetBySlug(featureKey, slug string) (*Prompt, error) {
	var p Prompt
	err := r.db.Where("feature_key = ? AND slug = ?", featureKey, slug).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// GetByID — admin 查详情 + 历史回滚的入口。
func (r *Repository) GetByID(id uint64) (*Prompt, error) {
	var p Prompt
	err := r.db.First(&p, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ListByPersona — PersonaRandomPicker 的主路径 (peerreview)。
// 走 idx_feature_persona_enabled 复合索引前缀, 只返 enabled=true。
func (r *Repository) ListByPersona(featureKey, persona string) ([]Prompt, error) {
	var out []Prompt
	err := r.db.
		Where("feature_key = ? AND persona = ? AND enabled = ?", featureKey, persona, true).
		Find(&out).Error
	return out, err
}

// ListAll — admin 列表用; 按 updated_at DESC 排序方便看最近改动。
// 不分页 — 这张表预期 < 200 行 (全公司所有 feature 的所有 prompt 累计), 拉全量在内存翻页。
// 如果未来增长到需要分页, 加 limit/offset 参数即可, 这里 KISS。
func (r *Repository) ListAll(featureKey string) ([]Prompt, error) {
	var out []Prompt
	q := r.db.Order("updated_at DESC, id DESC")
	if featureKey != "" {
		q = q.Where("feature_key = ?", featureKey)
	}
	err := q.Find(&out).Error
	return out, err
}

// GetHistory — 看一份 prompt 的版本历史。最多取 limit 条 (默认 50, 0 → 不限)。
func (r *Repository) GetHistory(promptID uint64, limit int) ([]PromptHistory, error) {
	var out []PromptHistory
	q := r.db.Where("prompt_id = ?", promptID).Order("version DESC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	err := q.Find(&out).Error
	return out, err
}

// GetHistoryVersion — 取某 prompt 在某 version 的快照, 给 revert 用。
func (r *Repository) GetHistoryVersion(promptID uint64, version int) (*PromptHistory, error) {
	var h PromptHistory
	err := r.db.Where("prompt_id = ? AND version = ?", promptID, version).First(&h).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &h, nil
}

// ─── Write paths ─────────────────────────────────────────────────────────

// Create — 新建 prompt 行 (admin 后台"加变体"用)。
// 不写 history (没有"之前的版本"可快照); version 默认 1 由 DB 兜底。
func (r *Repository) Create(p *Prompt) error {
	return r.db.Create(p).Error
}

// UpdateAndSnapshot — admin 编辑 prompt 的主路径。事务里做两件事:
//   1. 把现行 row 快照到 feature_prompt_history (version = 旧 version)
//   2. 用新内容更新 feature_prompts (version += 1)
//
// 失败原子回滚, 不会出现 "改了 prompt 但没 history" 的脏状态。
//
// changeNote / changedBy 仅写进 history, 不写进主表 (主表只关心当前内容)。
func (r *Repository) UpdateAndSnapshot(
	id uint64,
	newName string,
	newDescription *string,
	newSubjects []string,
	newWeight float32,
	newEnabled bool,
	newSystemPrompt string,
	source string, // 'seed' | 'admin' — 通常是 'admin' (seed 不走这里, 走 INSERT IGNORE 迁移)
	changedBy *uint64,
	changeNote *string,
) (*Prompt, error) {
	var updated Prompt
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var cur Prompt
		if err := tx.First(&cur, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}

		// 1. 快照旧版本
		snap := PromptHistory{
			PromptID:        cur.ID,
			Version:         cur.Version,
			Name:            cur.Name,
			SubjectsJSON:    cur.SubjectsJSON,
			Weight:          cur.Weight,
			Enabled:         cur.Enabled,
			SystemPrompt:    cur.SystemPrompt,
			ChangeNote:      changeNote,
			ChangedByUserID: changedBy,
		}
		if err := tx.Create(&snap).Error; err != nil {
			return err
		}

		// 2. 更新主行
		cur.Name = newName
		cur.Description = newDescription
		cur.SetSubjects(newSubjects)
		cur.Weight = newWeight
		cur.Enabled = newEnabled
		cur.SystemPrompt = newSystemPrompt
		cur.Source = source
		cur.UpdatedByUserID = changedBy
		cur.Version = cur.Version + 1
		if err := tx.Save(&cur).Error; err != nil {
			return err
		}
		updated = cur
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// ToggleEnabled — admin "停用 / 启用" 单按钮路径, 不走完整 Update。
// 也会写 history (因为 enabled 是 picker 选择行为的关键字段, 变更必须留底)。
func (r *Repository) ToggleEnabled(id uint64, enabled bool, changedBy *uint64) (*Prompt, error) {
	var updated Prompt
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var cur Prompt
		if err := tx.First(&cur, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return err
		}
		if cur.Enabled == enabled {
			updated = cur
			return nil // 已是目标状态, 不写 history 不 +version
		}
		note := "toggle enabled"
		snap := PromptHistory{
			PromptID:        cur.ID,
			Version:         cur.Version,
			Name:            cur.Name,
			SubjectsJSON:    cur.SubjectsJSON,
			Weight:          cur.Weight,
			Enabled:         cur.Enabled,
			SystemPrompt:    cur.SystemPrompt,
			ChangeNote:      &note,
			ChangedByUserID: changedBy,
		}
		if err := tx.Create(&snap).Error; err != nil {
			return err
		}
		cur.Enabled = enabled
		cur.Version = cur.Version + 1
		cur.UpdatedByUserID = changedBy
		if err := tx.Save(&cur).Error; err != nil {
			return err
		}
		updated = cur
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// Delete — 谨慎使用; 通常 admin 应走 ToggleEnabled(false) 而不是真删。
// 但提供这个方法给"删除运营误建变体"的少量场景用。
// 一并删除 history (CASCADE 不在 DB 层做, 这里应用层删, 避免 history 表残留孤儿行)。
func (r *Repository) Delete(id uint64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("prompt_id = ?", id).Delete(&PromptHistory{}).Error; err != nil {
			return err
		}
		return tx.Delete(&Prompt{}, id).Error
	})
}
