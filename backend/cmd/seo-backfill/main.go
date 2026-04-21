// ============================================================================
// Scholay学术 V1.0
// 一次性脚本：把历史 hot_papers 的高质量数据回填到 seo_papers
//
// 只做一件事：扫 hot_papers → 映射为 PaperSeed → 走 seo.Service.RecordDetailClick
// 走 tier=1 通道，和真实详情点击共用同一条 upsert 路径，保证：
//   - 幂等：slug unique 索引兜底，重复运行不会重复写入
//   - 字段对齐：走同一个 UpsertDetail，未来模型字段变动不用改这里
//   - 不污染 search 曝光池：手动走 tier=1
//
// 用法：
//   docker exec scholar_backend /app/seo-backfill
//   或本地: go run ./cmd/seo-backfill
// ============================================================================

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/seo"
)

func main() {
	batchSize := flag.Int("batch", 500, "每批读取 hot_papers 的行数")
	dryRun := flag.Bool("dry-run", false, "只打印不写入")
	flag.Parse()

	cfg := appconfig.Load()
	if err := database.Initialize(cfg); err != nil {
		slog.Error("db init failed", "err", err)
		os.Exit(1)
	}
	db := database.GetDB()

	seoRepo := seo.NewRepository(db)
	seoService := seo.NewService(seoRepo)

	var total int64
	if err := db.Model(&hotcontent.HotPaper{}).Count(&total).Error; err != nil {
		slog.Error("count hot_papers failed", "err", err)
		os.Exit(1)
	}
	slog.Info("backfill start", "hot_papers_total", total, "batch", *batchSize, "dry_run", *dryRun)

	start := time.Now()
	written, skipped, failed := 0, 0, 0
	var lastID uint64 = 0

	for {
		var rows []hotcontent.HotPaper
		if err := db.Where("id > ?", lastID).Order("id").Limit(*batchSize).Find(&rows).Error; err != nil {
			slog.Error("scan hot_papers failed", "after_id", lastID, "err", err)
			break
		}
		if len(rows) == 0 {
			break
		}
		for _, r := range rows {
			lastID = r.ID
			seed := toSeed(&r)
			if seed == nil {
				skipped++
				continue
			}
			if *dryRun {
				written++
				continue
			}
			if err := seoService.RecordDetailClick(seed); err != nil {
				slog.Warn("record detail click failed", "paper_id", seed.PaperID, "err", err)
				failed++
				continue
			}
			written++
		}
		slog.Info("batch done", "last_id", lastID, "written", written, "skipped", skipped, "failed", failed)
	}

	if !*dryRun {
		if _, err := seoRepo.BackfillSitemapPage(); err != nil {
			slog.Warn("sitemap page backfill failed", "err", err)
		}
	}

	slog.Info("backfill complete",
		"written", written, "skipped", skipped, "failed", failed,
		"elapsed", time.Since(start).String(),
	)
	fmt.Printf("DONE: written=%d skipped=%d failed=%d elapsed=%s\n",
		written, skipped, failed, time.Since(start))
}

// toSeed 把 HotPaper 映射为 seo.PaperSeed。
// 丢弃条件：paper_id 或 title 为空（RecordDetailClick 也会挡）。
func toSeed(h *hotcontent.HotPaper) *seo.PaperSeed {
	if h == nil || h.PaperID == "" || h.Title == nil || *h.Title == "" {
		return nil
	}
	seed := &seo.PaperSeed{
		PaperID: h.PaperID,
		Title:   *h.Title,
	}
	if h.DOI != nil {
		seed.DOI = *h.DOI
	}
	if h.Abstract != nil {
		seed.Abstract = *h.Abstract
	}
	if h.Year != nil {
		y := *h.Year
		seed.Year = &y
	}
	if h.Venue != nil {
		seed.Venue = *h.Venue
	}
	if h.Authors != nil && *h.Authors != "" {
		seed.Authors = parseAuthors(*h.Authors)
	}
	return seed
}

// parseAuthors 尝试按 JSON 数组解析；失败就逗号切分兜底。
// hot_papers.authors 是 TEXT 字段，历史上可能同时存在两种格式。
func parseAuthors(raw string) []seo.Author {
	var arr []seo.Author
	if err := json.Unmarshal([]byte(raw), &arr); err == nil && len(arr) > 0 {
		return arr
	}
	// 兼容 [{"name":"...","author_id":"..."}] 旧字段名
	var rawArr []map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &rawArr); err == nil {
		out := make([]seo.Author, 0, len(rawArr))
		for _, m := range rawArr {
			name, _ := m["name"].(string)
			id, _ := m["author_id"].(string)
			if id == "" {
				id, _ = m["authorId"].(string)
			}
			if name != "" {
				out = append(out, seo.Author{Name: name, AuthorID: id})
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return nil
}
