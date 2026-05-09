// ============================================================================
// Scholay学术 V1.0
// 跨模块适配器定义
//
// 这里定义的 4 个 adapter 都是 producer ↔ consumer 的 DTO 转换桥，
// 放在 main 包而不是任一被适配包，是为了避免 import 循环：
//
//   producer(user/usagelog/conversation/peerreview) 暴露自身领域模型；
//   consumer(feedback/config/user) 用接口声明自己需要的 DTO；
//   adapter 由组装者（main）实现，把 producer 的值映射到 consumer 的 DTO。
//
// 如果未来要删除某个 adapter，要么该 consumer 不再需要依赖反转，
// 要么引入共享 DTO 包（注意会拉大"公共类型"表面积）。
// ============================================================================

package main

import (
	"context"
	"encoding/json"
	"time"

	"scholar-backend/internal/config"
	"scholar-backend/internal/conversation"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seosubmit"
	"scholar-backend/internal/usagelog"
	"scholar-backend/internal/user"
)

// feedbackUserRepoAdapter 将 user.Repository 适配为 feedback.UserRepository 接口
type feedbackUserRepoAdapter struct {
	userRepo *user.Repository
}

func (a *feedbackUserRepoAdapter) FindByID(id uint) (*feedback.UserInfo, error) {
	u, err := a.userRepo.FindByID(id)
	if err != nil || u == nil {
		return nil, err
	}
	return &feedback.UserInfo{
		ID:        u.ID,
		Username:  u.Username,
		Email:     u.Email,
		Phone:     u.Phone,
		AvatarURL: u.AvatarURL,
	}, nil
}

func (a *feedbackUserRepoAdapter) FindByIDs(ids []uint) (map[uint]*feedback.UserInfo, error) {
	users, err := a.userRepo.FindByIDs(ids)
	if err != nil {
		return nil, err
	}
	result := make(map[uint]*feedback.UserInfo)
	for id, u := range users {
		result[id] = &feedback.UserInfo{
			ID:        u.ID,
			Username:  u.Username,
			Email:     u.Email,
			Phone:     u.Phone,
			AvatarURL: u.AvatarURL,
		}
	}
	return result, nil
}

// seoRecorderAdapter 将 seo.Service 适配为 usagelog.SEORecorder 接口
// 跨域边界上做一次字段平移：usagelog 不直接依赖 seo 的类型。
type seoRecorderAdapter struct {
	svc *seo.Service
}

func (a *seoRecorderAdapter) RecordDetailClick(seed *usagelog.SEOSeed) error {
	if seed == nil {
		return nil
	}
	authors := make([]seo.Author, 0, len(seed.Authors))
	for _, au := range seed.Authors {
		authors = append(authors, seo.Author{Name: au.Name, AuthorID: au.AuthorID})
	}
	return a.svc.RecordDetailClick(&seo.PaperSeed{
		PaperID:       seed.PaperID,
		DOI:           seed.DOI,
		Title:         seed.Title,
		Abstract:      seed.Abstract,
		Authors:       authors,
		Year:          seed.Year,
		Venue:         seed.Venue,
		CitationCount: seed.CitationCount,
		FieldsOfStudy: seed.FieldsOfStudy,
		Source:        seed.Source,
	})
}

// paperSEOProviderAdapter 将 seo.Service 适配为 config.PaperSEOProvider（SSR /paper/:slug）
type paperSEOProviderAdapter struct {
	svc *seo.Service
}

func (a *paperSEOProviderAdapter) ResolveSlug(slug string) (*config.PaperSEOMeta, error) {
	p, err := a.svc.GetBySlug(slug)
	if err != nil || p == nil {
		return nil, err
	}
	meta := &config.PaperSEOMeta{
		PaperID:  p.PaperID,
		Title:    p.Title,
		Abstract: p.Abstract,
		Venue:    p.Venue,
		DOI:      p.DOI,
	}
	if p.Year != nil {
		y := *p.Year
		meta.Year = &y
	}
	// 作者解析 authors_json 失败不致命，降级为空列表
	if p.AuthorsJSON != "" {
		var authors []seo.Author
		if err := json.Unmarshal([]byte(p.AuthorsJSON), &authors); err == nil {
			for _, au := range authors {
				if au.Name != "" {
					meta.Authors = append(meta.Authors, au.Name)
				}
			}
		}
	}
	return meta, nil
}

// seoSeedSourceAdapter 给 seosubmit.Service 启动期 seed 用 ——
// 把"哪些 URL 应该一次性入队"拼起来:静态/博客/资源 + 数据库里已有的 paper/author。
type seoSeedSourceAdapter struct {
	seoSvc *seo.Service
}

func (a *seoSeedSourceAdapter) StaticPaths() []string   { return seo.AllStaticPaths() }
func (a *seoSeedSourceAdapter) BlogPaths() []string     { return seo.AllBlogPaths() }
func (a *seoSeedSourceAdapter) ResourcePaths() []string { return seo.AllResourcePaths() }

func (a *seoSeedSourceAdapter) BootstrapPaperSlugs(_ context.Context, limit int) []string {
	if a.seoSvc == nil {
		return nil
	}
	return a.seoSvc.GetTopPaperSlugs(limit)
}

func (a *seoSeedSourceAdapter) BootstrapAuthorSlugs(_ context.Context, limit int) []string {
	if a.seoSvc == nil {
		return nil
	}
	return a.seoSvc.GetTopAuthorSlugs(limit)
}

// 编译期保证 adapter 满足接口
var _ seosubmit.SeedSource = (*seoSeedSourceAdapter)(nil)

// authorSEORecorderAdapter 将 seo.Service 适配为 minicod.AuthorSEORecorder
// 把 minicod 看到的 seed 平移成 seo.AuthorSeed,跨域不共享类型。
type authorSEORecorderAdapter struct {
	svc *seo.Service
}

func (a *authorSEORecorderAdapter) RecordAuthorDetailClick(seed *minicod.AuthorSEOSeed) error {
	if seed == nil {
		return nil
	}
	return a.svc.RecordAuthorDetailClick(&seo.AuthorSeed{
		AuthorID:      seed.AuthorID,
		Name:          seed.Name,
		Affiliations:  seed.Affiliations,
		Homepage:      seed.Homepage,
		PaperCount:    seed.PaperCount,
		CitationCount: seed.CitationCount,
		HIndex:        seed.HIndex,
		Source:        seed.Source,
	})
}

// authorSEOProviderAdapter 将 seo.Service 适配为 config.AuthorSEOProvider（SSR /author/:slug）
type authorSEOProviderAdapter struct {
	svc *seo.Service
}

func (a *authorSEOProviderAdapter) ResolveAuthorSlug(slug string) (*config.AuthorSEOMeta, error) {
	au, err := a.svc.GetAuthorBySlug(slug)
	if err != nil || au == nil {
		return nil, err
	}
	meta := &config.AuthorSEOMeta{
		AuthorID:      au.AuthorID,
		Name:          au.Name,
		Homepage:      au.Homepage,
		PaperCount:    au.PaperCount,
		CitationCount: au.CitationCount,
	}
	if au.HIndex != nil {
		h := *au.HIndex
		meta.HIndex = &h
	}
	if au.AffiliationsJSON != "" {
		var affs []string
		if err := json.Unmarshal([]byte(au.AffiliationsJSON), &affs); err == nil {
			meta.Affiliations = affs
		}
	}
	return meta, nil
}

// usageLogServiceAdapter 将 usagelog.Service 适配为 config.UsageLogService 接口
type usageLogServiceAdapter struct {
	service *usagelog.Service
}

func (a *usageLogServiceAdapter) GetPopularPaperIDs(days int, limit int) ([]config.PopularPaper, error) {
	papers, err := a.service.GetPopularPaperIDs(days, limit)
	if err != nil {
		return nil, err
	}
	result := make([]config.PopularPaper, len(papers))
	for i, p := range papers {
		result[i] = config.PopularPaper{
			PaperID: p.PaperID,
			Count:   p.Count,
		}
	}
	return result, nil
}

// conversationQueryAdapter 将 conversation.Service 适配为 user.ConversationQueryService
type conversationQueryAdapter struct {
	svc *conversation.Service
}

func (a *conversationQueryAdapter) GetRecentByUser(ctx context.Context, userID uint, convType string, since time.Time) ([]user.ConversationItemDTO, error) {
	items, err := a.svc.GetRecentByUser(ctx, userID, convType, since)
	if err != nil {
		return nil, err
	}
	result := make([]user.ConversationItemDTO, len(items))
	for i, item := range items {
		result[i] = user.ConversationItemDTO{
			ID:        item.ID,
			Title:     item.Title,
			UpdatedAt: item.UpdatedAt,
		}
	}
	return result, nil
}

// peerReviewQueryAdapter 将 peerreview.Service 适配为 user.PeerReviewQueryService
type peerReviewQueryAdapter struct {
	svc *peerreview.Service
}

func (a *peerReviewQueryAdapter) GetRecentNonDraftTasks(userID uint, since time.Time) ([]user.PeerReviewItemDTO, error) {
	items, err := a.svc.GetRecentNonDraftTasks(userID, since)
	if err != nil {
		return nil, err
	}
	result := make([]user.PeerReviewItemDTO, len(items))
	for i, item := range items {
		result[i] = user.PeerReviewItemDTO{
			ID:        item.ID,
			Title:     item.Title,
			Status:    item.Status,
			UpdatedAt: item.UpdatedAt,
		}
	}
	return result, nil
}
