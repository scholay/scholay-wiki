//go:build integration

package vip

import "testing"

// TestIntegrationCodeBatchQueries 用真 MySQL 覆盖 GORM 的「先选批次、再聚合整批」子查询。
// 默认 go test 不运行；日常无 DB 覆盖在 code_batch_test.go。
func TestIntegrationCodeBatchQueries(t *testing.T) {
	db := openDB(t)
	svc := NewService(NewRepository(db))
	created, err := svc.GenerateCodeBatch(GenerateCodesInput{
		Count: 2, GrantKind: GrantKindTier, Tier: TierPro,
		GrantDays: 1, GrantUnit: GrantUnitMonth, MaxUses: 1, ValidDays: 7,
		Note: "integration batch query",
	}, nil)
	if err != nil {
		t.Fatalf("GenerateCodeBatch: %v", err)
	}
	defer db.Exec("DELETE FROM vip_redemption_codes WHERE batch_id = ?", created.BatchID)

	rows, total, err := svc.ListCodeBatches(CodeBatchFilter{
		Keyword: created.BatchID, GrantKind: GrantKindTier, Tier: TierPro,
	}, 1, 30)
	if err != nil {
		t.Fatalf("ListCodeBatches: %v", err)
	}
	if total != 1 || len(rows) != 1 || rows[0].CodeCount != 2 || rows[0].ConfigVariantCount != 1 {
		t.Fatalf("unexpected initial batch summary: total=%d rows=%+v", total, rows)
	}

	detail, err := svc.GetCodeBatch(created.BatchID)
	if err != nil {
		t.Fatalf("GetCodeBatch: %v", err)
	}
	if detail.Total != 2 || len(detail.Codes) != 2 {
		t.Fatalf("detail must return the whole batch: %+v", detail)
	}

	// 模拟历史单码「改时长」：用 tier 筛选仍应统计整批 2 张，并暴露 mixed。
	if err := db.Model(&RedemptionCode{}).Where("id = ?", detail.Codes[0].ID).
		Update("grant_days", 2).Error; err != nil {
		t.Fatalf("diverge one code: %v", err)
	}
	rows, total, err = svc.ListCodeBatches(CodeBatchFilter{
		Keyword: created.BatchID, GrantKind: GrantKindTier, Tier: TierPro,
	}, 1, 30)
	if err != nil {
		t.Fatalf("ListCodeBatches after divergence: %v", err)
	}
	if total != 1 || len(rows) != 1 || rows[0].CodeCount != 2 || !rows[0].Mixed || rows[0].ConfigVariantCount != 2 {
		t.Fatalf("filtered summary must retain the whole mixed batch: total=%d rows=%+v", total, rows)
	}
}
