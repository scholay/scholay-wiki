// ============================================================================
// Scholay学术 V1.0
// 跨模块适配器定义
//
// 这里定义的 adapter 都是 producer ↔ consumer 的 DTO 转换桥，
// 放在 main 包而不是任一被适配包，是为了避免 import 循环：
//
//   producer(user/peerreview) 暴露自身领域模型；
//   consumer(feedback/config/user) 用接口声明自己需要的 DTO；
//   adapter 由组装者（main）实现，把 producer 的值映射到 consumer 的 DTO。
//
// 如果未来要删除某个 adapter，要么该 consumer 不再需要依赖反转，
// 要么引入共享 DTO 包（注意会拉大"公共类型"表面积）。
// ============================================================================

package main

import (
	"scholar-backend/internal/feedback"
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

// (SEO adapter 全套 — paperSEOProviderAdapter / authorSEOProviderAdapter /
// journalSEOProviderAdapter / authorSEORecorderAdapter / journalSEORecorderAdapter /
// seoSeedSourceAdapter — 已下线: SEO meta + seed 类型搬到 seo 包, seo.Service
// 直接实现各消费方接口, 不再需要 main 包做翻译桥。详见 backend/internal/seo/ssr_meta.go)

// (usageLogServiceAdapter — 已下线: 旧 usagelog(usage_logs v1) 整体删除, 它唯一的消费方
// config.ServeDynamicSitemap 本就未注册路由、且热门论文查询恒为空。详见 bootstrap.go 注释)

