// ============================================================================
// Skills 市场 —— Repository(GORM 数据访问)
// ============================================================================

package skillmarket

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

var ErrNotFound = gorm.ErrRecordNotFound

// ── user_skills ──────────────────────────────────────────────────────────────

func (r *Repository) CreateSkill(s *UserSkill) error { return r.db.Create(s).Error }

func (r *Repository) GetSkillByID(id uint) (*UserSkill, error) {
	var s UserSkill
	if err := r.db.First(&s, id).Error; err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) GetSkillBySlug(slug string) (*UserSkill, error) {
	var s UserSkill
	if err := r.db.Where("slug = ?", slug).First(&s).Error; err != nil {
		return nil, err
	}
	return &s, nil
}

// SlugExists 用于生成唯一 slug。
func (r *Repository) SlugExists(slug string) (bool, error) {
	var n int64
	err := r.db.Model(&UserSkill{}).Where("slug = ?", slug).Count(&n).Error
	return n > 0, err
}

func (r *Repository) UpdateSkill(s *UserSkill) error { return r.db.Save(s).Error }

// UpdateSkillFields 局部更新(避免 Save 覆盖并发字段)。
func (r *Repository) UpdateSkillFields(id uint, fields map[string]any) error {
	return r.db.Model(&UserSkill{}).Where("id = ?", id).Updates(fields).Error
}

func (r *Repository) CountUserSkills(userID uint) (int64, error) {
	var n int64
	err := r.db.Model(&UserSkill{}).Where("user_id = ? AND status <> ?", userID, StatusDeleted).Count(&n).Error
	return n, err
}

func (r *Repository) ListMySkills(userID uint) ([]UserSkill, error) {
	var list []UserSkill
	err := r.db.Where("user_id = ? AND status <> ?", userID, StatusDeleted).
		Order("updated_at DESC").Find(&list).Error
	return list, err
}

// ── skill_versions ───────────────────────────────────────────────────────────

func (r *Repository) CreateVersion(v *SkillVersion) error { return r.db.Create(v).Error }

func (r *Repository) GetVersionByID(id uint) (*SkillVersion, error) {
	var v SkillVersion
	if err := r.db.First(&v, id).Error; err != nil {
		return nil, err
	}
	return &v, nil
}

func (r *Repository) MaxVersion(skillID uint) (int, error) {
	var max *int
	err := r.db.Model(&SkillVersion{}).Where("skill_id = ?", skillID).
		Select("MAX(version)").Scan(&max).Error
	if err != nil || max == nil {
		return 0, err
	}
	return *max, nil
}

func (r *Repository) CountVersions(skillID uint) (int64, error) {
	var n int64
	err := r.db.Model(&SkillVersion{}).Where("skill_id = ?", skillID).Count(&n).Error
	return n, err
}

func (r *Repository) UpdateVersionFields(id uint, fields map[string]any) error {
	return r.db.Model(&SkillVersion{}).Where("id = ?", id).Updates(fields).Error
}

// ── 市场浏览(仅 public + approved + active)────────────────────────────────

func (r *Repository) ListMarket(req ListMarketRequest) ([]UserSkill, int64, error) {
	q := r.db.Model(&UserSkill{}).
		Where("visibility = ? AND moderation_status = ? AND status = ?", VisibilityPublic, ModApproved, StatusActive)
	if req.Category != "" {
		q = q.Where("category = ?", req.Category)
	}
	if req.Q != "" {
		like := "%" + req.Q + "%"
		q = q.Where("name LIKE ? OR tagline LIKE ?", like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	switch req.Sort {
	case "recent":
		q = q.Order("updated_at DESC")
	default:
		q = q.Order("install_count DESC, updated_at DESC")
	}
	var list []UserSkill
	err := q.Offset((req.Page - 1) * req.PageSize).Limit(req.PageSize).Find(&list).Error
	return list, total, err
}

// ── user_enabled_skills(installs)───────────────────────────────────────────

func (r *Repository) GetEnabled(userID, skillID uint) (*UserEnabledSkill, error) {
	var e UserEnabledSkill
	if err := r.db.Where("user_id = ? AND skill_id = ?", userID, skillID).First(&e).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

// UpsertEnabled 幂等 install:存在则置 enabled，不存在则建。返回是否新建。
func (r *Repository) UpsertEnabled(userID, skillID uint, source string) (created bool, err error) {
	e, gerr := r.GetEnabled(userID, skillID)
	if gerr == nil {
		return false, r.db.Model(e).Update("enabled", true).Error
	}
	if !errors.Is(gerr, gorm.ErrRecordNotFound) {
		return false, gerr
	}
	return true, r.db.Create(&UserEnabledSkill{
		UserID: userID, SkillID: skillID, Enabled: true, Source: source,
	}).Error
}

func (r *Repository) SetEnabled(userID, skillID uint, enabled bool) error {
	return r.db.Model(&UserEnabledSkill{}).
		Where("user_id = ? AND skill_id = ?", userID, skillID).
		Update("enabled", enabled).Error
}

func (r *Repository) RemoveEnabled(userID, skillID uint) error {
	return r.db.Where("user_id = ? AND skill_id = ?", userID, skillID).Delete(&UserEnabledSkill{}).Error
}

func (r *Repository) ListEnabledByUser(userID uint) ([]UserEnabledSkill, error) {
	var list []UserEnabledSkill
	err := r.db.Where("user_id = ?", userID).Order("updated_at DESC").Find(&list).Error
	return list, err
}

// CountEnabled 该用户当前 enabled=1 的启用数(claw 单会话上限校验用)。
func (r *Repository) CountEnabled(userID uint) (int64, error) {
	var n int64
	err := r.db.Model(&UserEnabledSkill{}).Where("user_id = ? AND enabled = 1", userID).Count(&n).Error
	return n, err
}

func (r *Repository) IncInstallCount(skillID uint, delta int) error {
	return r.db.Model(&UserSkill{}).Where("id = ?", skillID).
		UpdateColumn("install_count", gorm.Expr("GREATEST(install_count + ?, 0)", delta)).Error
}

// ── 举报 ─────────────────────────────────────────────────────────────────────

func (r *Repository) CreateReport(rep *SkillReport) error { return r.db.Create(rep).Error }

// HasReported 该用户是否已举报过该 skill(与 reason 无关,反 griefing)。
func (r *Repository) HasReported(skillID, reporterID uint) (bool, error) {
	var n int64
	err := r.db.Model(&SkillReport{}).
		Where("skill_id = ? AND reporter_user_id = ?", skillID, reporterID).Count(&n).Error
	return n > 0, err
}

func (r *Repository) IncReportCount(skillID uint) (int, error) {
	if err := r.db.Model(&UserSkill{}).Where("id = ?", skillID).
		UpdateColumn("report_count", gorm.Expr("report_count + 1")).Error; err != nil {
		return 0, err
	}
	var s UserSkill
	if err := r.db.Select("report_count").First(&s, skillID).Error; err != nil {
		return 0, err
	}
	return s.ReportCount, nil
}

func (r *Repository) ListReports(status string) ([]SkillReport, error) {
	var list []SkillReport
	q := r.db.Model(&SkillReport{})
	if status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("created_at DESC").Limit(500).Find(&list).Error
	return list, err
}

func (r *Repository) ResolveReport(id, adminID uint, status string) error {
	now := time.Now()
	return r.db.Model(&SkillReport{}).Where("id = ?", id).
		Updates(map[string]any{"status": status, "handled_by": adminID, "resolved_at": now}).Error
}

// ── 管理端审核 ───────────────────────────────────────────────────────────────

func (r *Repository) ListForModeration(status string) ([]UserSkill, error) {
	var list []UserSkill
	q := r.db.Model(&UserSkill{}).Where("status <> ?", StatusDeleted)
	if status != "" {
		q = q.Where("moderation_status = ?", status)
	}
	err := q.Order("updated_at DESC").Limit(500).Find(&list).Error
	return list, err
}

// ListApprovedPublic 列出所有 public+approved+active 的 skill(供 marketplace.json)。
func (r *Repository) ListApprovedPublic(limit int) ([]UserSkill, error) {
	var list []UserSkill
	err := r.db.Where("visibility = ? AND moderation_status = ? AND status = ?",
		VisibilityPublic, ModApproved, StatusActive).
		Order("install_count DESC, updated_at DESC").Limit(limit).Find(&list).Error
	return list, err
}

// ── 作者名解析(轻量,直查 users 表,不耦合 user 模块)────────────────────────

// GetUsernames 批量取 id→展示名(username;缺省 "用户#id")。
func (r *Repository) GetUsernames(ids []uint) map[uint]string {
	out := make(map[uint]string, len(ids))
	if len(ids) == 0 {
		return out
	}
	var rows []struct {
		ID       uint
		Username *string
	}
	r.db.Table("users").Select("id, username").Where("id IN ?", ids).Scan(&rows)
	for _, row := range rows {
		if row.Username != nil && *row.Username != "" {
			out[row.ID] = *row.Username
		}
	}
	return out
}
