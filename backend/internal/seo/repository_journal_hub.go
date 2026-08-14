// ============================================================================
// SEO Journal Hub Repository —— 枢纽页(发现层)聚合查询
//
// 与 repository_journal_ingest.go 尾部的 publishedJournalRows / journalHubScope
// 同族:全部查询以「published + active」为硬前置(staged 行经计数/列表泄漏 =
// 绕过发布闸门;journal_hub_test.go 以 dry-run SQL 钉住)。
//
// 只读查询,绝不触碰 updated_at —— hub 消费不构成内容变化。
// ============================================================================

package seo

import (
	"time"

	"gorm.io/gorm"
)

// JournalGroupCount 分组聚合行(大类 / 国家共用):
// Key = 分组键原值;LastMod = 该组最新 updated_at(hub sitemap 的诚实 lastmod)。
type JournalGroupCount struct {
	Key     string    `gorm:"column:k"`
	Count   int64     `gorm:"column:n"`
	LastMod time.Time `gorm:"column:last_mod"`
}

// journalHubCategoryCountsQuery 大类分组(0126 idx_seo_journals_fqb_major 覆盖)。
// 拆出 query builder 供 dry-run 测试直接钉 SQL。
func (r *Repository) journalHubCategoryCountsQuery() *gorm.DB {
	return r.publishedJournalRows().
		Select("fqb_major_category AS k, COUNT(*) AS n, MAX(updated_at) AS last_mod").
		Where("TRIM(COALESCE(fqb_major_category, '')) <> ''").
		Group("fqb_major_category")
}

// ListJournalCategoryCounts 各中科院大类的已发布刊数(刊数降序,同数按名称稳定)。
func (r *Repository) ListJournalCategoryCounts() ([]JournalGroupCount, error) {
	var out []JournalGroupCount
	err := r.journalHubCategoryCountsQuery().
		Order("n DESC, k ASC").
		Find(&out).Error
	return out, err
}

// journalHubCountryCountsQuery 国家分组(country 索引覆盖;两位 openalex 码)。
func (r *Repository) journalHubCountryCountsQuery() *gorm.DB {
	return r.publishedJournalRows().
		Select("country AS k, COUNT(*) AS n, MAX(updated_at) AS last_mod").
		Where("TRIM(COALESCE(country, '')) <> ''").
		Group("country")
}

// ListJournalCountryCounts 各国家/地区的已发布刊数(刊数降序)。
func (r *Repository) ListJournalCountryCounts() ([]JournalGroupCount, error) {
	var out []JournalGroupCount
	err := r.journalHubCountryCountsQuery().
		Order("n DESC, k ASC").
		Find(&out).Error
	return out, err
}

// CountJournalsForHub 单维度总数 + 集合最新 updated_at(概览计数 / hub sitemap 共用)。
// 空 filter = 全体已发布期刊。
func (r *Repository) CountJournalsForHub(filter JournalHubFilter) (int64, time.Time, error) {
	var row struct {
		N       int64     `gorm:"column:n"`
		LastMod time.Time `gorm:"column:last_mod"`
	}
	err := r.journalHubScope(filter).
		Select("COUNT(*) AS n, MAX(updated_at) AS last_mod").
		Scan(&row).Error
	return row.N, row.LastMod, err
}

// latestPublishedJournalsQuery 「本周新增期刊」:按入库时间(created_at)降序 ——
// created_at 是行真正「新增」的时刻;发布批次让老库存重见天日时,updated_at 会动
// 而 created_at 不动,用 updated_at 会把 30 万存量当「新增」轮播。
func (r *Repository) latestPublishedJournalsQuery(limit int) *gorm.DB {
	return r.publishedJournalRows().
		Order("created_at DESC, journal_id DESC").
		Limit(limit)
}

// ListLatestPublishedJournals 最近新增的已发布期刊(概览「本周新增」板块)。
func (r *Repository) ListLatestPublishedJournals(limit int) ([]SEOJournal, error) {
	if limit <= 0 {
		return nil, nil
	}
	var out []SEOJournal
	err := r.latestPublishedJournalsQuery(limit).Find(&out).Error
	return out, err
}
