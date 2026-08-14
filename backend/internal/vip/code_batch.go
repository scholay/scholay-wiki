package vip

import (
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

const legacyCodeBatchPrefix = "legacy-"

// CodeBatchFilter 是批次列表的筛选条件。Keyword 只搜管理属性(批次 ID / 备注)，
// 不搜兑换人；兑换人是单码流水维度，放在批次详情里查看。
type CodeBatchFilter struct {
	Keyword   string
	GrantKind string
	Tier      string
}

// CodeBatchSummary 是批次主列表与详情头部共用的冻结契约。
// 四个状态数量互斥，优先级与原单码页一致：停用 > 用完 > 过期 > 可用。
// grant_* / max_uses 等是代表配置；Mixed=true 时前端必须展示「批内配置不一致」，
// 不得把代表值当作整批的统一承诺。
type CodeBatchSummary struct {
	BatchID            string     `json:"batch_id"`
	CodeCount          int64      `json:"code_count"`
	AvailableCount     int64      `json:"available_count"`
	ExhaustedCount     int64      `json:"exhausted_count"`
	ExpiredCount       int64      `json:"expired_count"`
	RevokedCount       int64      `json:"revoked_count"`
	TotalUsedCount     int64      `json:"total_used_count"`
	TotalMaxUses       int64      `json:"total_max_uses"`
	GrantKind          string     `json:"grant_kind"`
	GrantTier          string     `json:"grant_tier"`
	GrantDays          int        `json:"grant_days"`
	GrantUnit          string     `json:"grant_unit"`
	GrantCredits       int        `json:"grant_credits"`
	CreditKind         string     `json:"credit_kind"`
	CreditValidityDays int        `json:"credit_validity_days"`
	MaxUses            int        `json:"max_uses"`
	ValidUntil         *time.Time `json:"valid_until"`
	Note               string     `json:"note"`
	CreatedBy          *uint      `json:"created_by"`
	CreatedAt          time.Time  `json:"created_at"`
	ConfigVariantCount int64      `json:"config_variant_count"`
	Mixed              bool       `json:"mixed"`
}

// CodeBatchDetail 一次返回整批码。发码上限是 1000，足以支持前端完整复制/导出；
// 不能在这里做默认分页，否则「复制全部」会静默丢码。
type CodeBatchDetail struct {
	Batch *CodeBatchSummary `json:"batch"`
	Codes []RedemptionCode  `json:"codes"`
	Total int               `json:"total"`
}

type codeBatchAvailability uint8

const (
	codeBatchAvailable codeBatchAvailability = iota
	codeBatchExhausted
	codeBatchExpired
	codeBatchRevoked
)

// classifyCodeAt 与 SQL 批次聚合的 CASE 口径一致。max_uses<1 是存量兼容，
// 兑换时也会把它按 1 处理。
func classifyCodeAt(code RedemptionCode, now time.Time) codeBatchAvailability {
	if code.RevokedAt != nil {
		return codeBatchRevoked
	}
	if code.UsedCount >= effectiveCodeMaxUses(code.MaxUses) {
		return codeBatchExhausted
	}
	if code.ValidUntil != nil && code.ValidUntil.Before(now) {
		return codeBatchExpired
	}
	return codeBatchAvailable
}

func effectiveCodeMaxUses(maxUses int) int {
	if maxUses < 1 {
		return 1
	}
	return maxUses
}

// codeBatchConfig 只放会影响之后兑换结果/可兑换能力的字段。
// used_count / revoked_at 是运行状态，不能因正常兑换就把整批标成 mixed。
type codeBatchConfig struct {
	GrantKind          string
	GrantTier          string
	GrantDays          int
	GrantUnit          string
	GrantCredits       int
	CreditKind         string
	CreditValidityDays int
	MaxUses            int
	ValidUntilUnix     int64
	HasValidUntil      bool
	Note               string
}

func configOfCode(code RedemptionCode) codeBatchConfig {
	cfg := codeBatchConfig{
		GrantKind: code.GrantKind, GrantTier: code.GrantTier,
		GrantDays: code.GrantDays, GrantUnit: NormGrantUnit(code.GrantUnit),
		GrantCredits: code.GrantCredits, CreditKind: code.CreditKind,
		CreditValidityDays: code.CreditValidityDays,
		MaxUses:            effectiveCodeMaxUses(code.MaxUses), Note: code.Note,
	}
	if code.ValidUntil != nil {
		cfg.HasValidUntil = true
		cfg.ValidUntilUnix = code.ValidUntil.Unix()
	}
	return cfg
}

func effectiveCodeBatchID(code RedemptionCode) string {
	if code.BatchID != "" {
		return code.BatchID
	}
	return legacyCodeBatchPrefix + leftPadUint(code.ID, 20)
}

func leftPadUint(v uint64, width int) string {
	s := strconv.FormatUint(v, 10)
	if len(s) >= width {
		return s
	}
	return strings.Repeat("0", width-len(s)) + s
}

// summarizeCodeBatch 供详情接口与无 DB 单测共用，避免前端自己重算状态口径。
func summarizeCodeBatch(batchID string, codes []RedemptionCode, now time.Time) CodeBatchSummary {
	summary := CodeBatchSummary{BatchID: batchID, CodeCount: int64(len(codes))}
	if len(codes) == 0 {
		return summary
	}
	rep := codes[0]
	if summary.BatchID == "" {
		summary.BatchID = effectiveCodeBatchID(rep)
	}
	summary.GrantKind = rep.GrantKind
	summary.GrantTier = rep.GrantTier
	summary.GrantDays = rep.GrantDays
	summary.GrantUnit = NormGrantUnit(rep.GrantUnit)
	summary.GrantCredits = rep.GrantCredits
	summary.CreditKind = rep.CreditKind
	summary.CreditValidityDays = rep.CreditValidityDays
	summary.MaxUses = effectiveCodeMaxUses(rep.MaxUses)
	summary.ValidUntil = rep.ValidUntil
	summary.Note = rep.Note
	summary.CreatedBy = rep.CreatedBy
	summary.CreatedAt = rep.CreatedAt

	variants := make(map[codeBatchConfig]struct{}, 1)
	for _, code := range codes {
		summary.TotalUsedCount += int64(code.UsedCount)
		summary.TotalMaxUses += int64(effectiveCodeMaxUses(code.MaxUses))
		variants[configOfCode(code)] = struct{}{}
		switch classifyCodeAt(code, now) {
		case codeBatchRevoked:
			summary.RevokedCount++
		case codeBatchExhausted:
			summary.ExhaustedCount++
		case codeBatchExpired:
			summary.ExpiredCount++
		default:
			summary.AvailableCount++
		}
	}
	summary.ConfigVariantCount = int64(len(variants))
	summary.Mixed = summary.ConfigVariantCount > 1
	return summary
}

func effectiveBatchIDSQL(alias string) string {
	return "CASE WHEN COALESCE(" + alias + ".batch_id, '') = '' THEN CONCAT('legacy-', LPAD(" + alias + ".id, 20, '0')) ELSE " + alias + ".batch_id END"
}

const batchConfigVariantSQL = `COUNT(DISTINCT SHA2(CONCAT_WS(CHAR(31),
  c.grant_kind, c.grant_tier, c.grant_days,
  CASE WHEN c.grant_unit IN ('month','year') THEN c.grant_unit ELSE 'day' END,
  c.grant_credits, c.credit_kind, c.credit_validity_days, GREATEST(c.max_uses, 1),
  COALESCE(DATE_FORMAT(c.valid_until, '%Y-%m-%d %H:%i:%s'), '<NULL>'), HEX(COALESCE(c.note, ''))
), 256))`

func escapeCodeBatchLike(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}

func normalizedBatchKeyword(value string) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) > 100 {
		runes = runes[:100]
	}
	return string(runes)
}

func applyCodeBatchFilter(q *gorm.DB, alias string, filter CodeBatchFilter) *gorm.DB {
	batchIDSQL := effectiveBatchIDSQL(alias)
	if keyword := normalizedBatchKeyword(filter.Keyword); keyword != "" {
		like := "%" + escapeCodeBatchLike(keyword) + "%"
		q = q.Where("("+batchIDSQL+` LIKE ? ESCAPE '\\' OR `+alias+`.note LIKE ? ESCAPE '\\')`, like, like)
	}
	if filter.GrantKind == GrantKindTier || filter.GrantKind == GrantKindCredit {
		q = q.Where(alias+".grant_kind = ?", filter.GrantKind)
	}
	if filter.Tier == TierPro || filter.Tier == TierMax {
		// grant_tier 在 credit 码上没有业务含义，且最早的存量行可能带默认 pro；
		// 因此「Pro / Max」筛选必须同时限定 tier 码，不能把经费批次带进来。
		q = q.Where(alias+".grant_kind = ? AND "+alias+".grant_tier = ?", GrantKindTier, filter.Tier)
	}
	return q
}

// matchingCodeBatchIDs 只决定「哪些批次入选」。外层摘要必须再回到整张码表
// 聚合这些批次的**全部**码：若直接在聚合外层 WHERE grant_kind/tier，mixed 批次中
// 未命中的码会被提前丢掉，code_count/四类状态就不再是整批真值。
func matchingCodeBatchIDs(db *gorm.DB, filter CodeBatchFilter) *gorm.DB {
	const alias = "matched"
	q := applyCodeBatchFilter(db.Table("vip_redemption_codes AS "+alias), alias, filter)
	return q.Select(effectiveBatchIDSQL(alias)).Group(effectiveBatchIDSQL(alias))
}

// ListCodeBatches 按批次分页。状态四分类互斥，所以四列之和必然等于 code_count。
func (r *Repository) ListCodeBatches(filter CodeBatchFilter, limit, offset int) ([]CodeBatchSummary, int64, error) {
	batchIDSQL := effectiveBatchIDSQL("c")
	var total int64
	if err := r.db.Table("(?) AS matching_batches", matchingCodeBatchIDs(r.db, filter)).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	selectSQL := batchIDSQL + ` AS batch_id,
COUNT(*) AS code_count,
SUM(CASE WHEN c.revoked_at IS NULL AND c.used_count < GREATEST(c.max_uses, 1)
              AND (c.valid_until IS NULL OR c.valid_until >= NOW()) THEN 1 ELSE 0 END) AS available_count,
SUM(CASE WHEN c.revoked_at IS NULL AND c.used_count >= GREATEST(c.max_uses, 1)
         THEN 1 ELSE 0 END) AS exhausted_count,
SUM(CASE WHEN c.revoked_at IS NULL AND c.used_count < GREATEST(c.max_uses, 1)
              AND c.valid_until IS NOT NULL AND c.valid_until < NOW() THEN 1 ELSE 0 END) AS expired_count,
SUM(CASE WHEN c.revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked_count,
SUM(c.used_count) AS total_used_count,
SUM(GREATEST(c.max_uses, 1)) AS total_max_uses,
MIN(c.grant_kind) AS grant_kind,
MIN(c.grant_tier) AS grant_tier,
MIN(c.grant_days) AS grant_days,
MIN(CASE WHEN c.grant_unit IN ('month','year') THEN c.grant_unit ELSE 'day' END) AS grant_unit,
MIN(c.grant_credits) AS grant_credits,
MIN(c.credit_kind) AS credit_kind,
MIN(c.credit_validity_days) AS credit_validity_days,
MIN(GREATEST(c.max_uses, 1)) AS max_uses,
MIN(c.valid_until) AS valid_until,
MIN(COALESCE(c.note, '')) AS note,
MIN(c.created_by) AS created_by,
MIN(c.created_at) AS created_at,
` + batchConfigVariantSQL + ` AS config_variant_count`

	rows := make([]CodeBatchSummary, 0)
	// 筛选只选 batch_id，外层按入选 ID 重新聚合整批全部码。
	listQ := r.db.Table("vip_redemption_codes AS c").
		Where(batchIDSQL+" IN (?)", matchingCodeBatchIDs(r.db, filter))
	if err := listQ.Select(selectSQL).
		Group(batchIDSQL).
		Order("created_at DESC, MIN(c.id) DESC").
		Limit(limit).Offset(offset).Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	for i := range rows {
		rows[i].GrantUnit = NormGrantUnit(rows[i].GrantUnit)
		rows[i].Mixed = rows[i].ConfigVariantCount > 1
	}
	return rows, total, nil
}

func legacyCodeIDFromBatchID(batchID string) (uint64, bool) {
	if !strings.HasPrefix(batchID, legacyCodeBatchPrefix) {
		return 0, false
	}
	id, err := strconv.ParseUint(strings.TrimPrefix(batchID, legacyCodeBatchPrefix), 10, 64)
	return id, err == nil && id > 0
}

// ListCodesByBatch 取整批。OR 分支只是部署窗口兼容：若旧 backend 在 0115 跑完后、
// 新 backend 切换前又插入了 batch_id='' 的码，它仍以「一码一批」被访问。
func (r *Repository) ListCodesByBatch(batchID string) ([]RedemptionCode, error) {
	q := r.db.Model(&RedemptionCode{})
	if legacyID, ok := legacyCodeIDFromBatchID(batchID); ok {
		q = q.Where("batch_id = ? OR (COALESCE(batch_id, '') = '' AND id = ?)", batchID, legacyID)
	} else {
		q = q.Where("batch_id = ?", batchID)
	}
	var rows []RedemptionCode
	if err := q.Order("id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// ListCodeBatches 管理端批次分页。
func (s *Service) ListCodeBatches(filter CodeBatchFilter, page, pageSize int) ([]CodeBatchSummary, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 30
	}
	return s.repo.ListCodeBatches(filter, pageSize, (page-1)*pageSize)
}

// GetCodeBatch 返回整批码与用同一时刻计算的摘要。
func (s *Service) GetCodeBatch(batchID string) (*CodeBatchDetail, error) {
	batchID = strings.TrimSpace(batchID)
	if batchID == "" || len(batchID) > 64 {
		return nil, ErrCodeBatchNotFound
	}
	codes, err := s.repo.ListCodesByBatch(batchID)
	if err != nil {
		return nil, err
	}
	if len(codes) == 0 {
		return nil, ErrCodeBatchNotFound
	}
	summary := summarizeCodeBatch(batchID, codes, time.Now())
	return &CodeBatchDetail{Batch: &summary, Codes: codes, Total: len(codes)}, nil
}
