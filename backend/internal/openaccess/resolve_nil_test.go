package openaccess

import (
	"context"
	"testing"

	appconfig "scholar-backend/internal/common/config"
)

// fetchUnpaywall 的**任何**返回路径都不得返回 nil *Result。
//
// 背景:Resolve 在拿到结果后无条件执行 `res.DOI = doi`(openaccess.go 的 Resolve),
// 所以只要有一条路径返回 nil,那条路径就是必然的空指针 panic。
// 2026-08-13 真的引入过一次:「未配置礼貌池邮箱就跳过 Unpaywall」这条新分支写成了
// `return nil, false`,而它的触发条件恰好是新环境的默认状态(SUPPORT_EMAIL 与
// CROSSREF_EMAIL 都留空)—— 等于新环境一访问论文详情页的 OA 探测就 500。
//
// 这条测试钉死的是「非 nil」这个不变式本身,不是某一条分支的实现细节。
func TestResolveDoesNotPanicWithoutPoliteEmail(t *testing.T) {
	// 制造「两个邮箱都为空」的环境 —— 这正是 .env.example 给非生产环境的推荐配置。
	prev := appconfig.AppConfig
	t.Cleanup(func() { appconfig.AppConfig = prev })
	appconfig.AppConfig = &appconfig.Config{}

	if got := politeEmail(); got != "" {
		t.Fatalf("前置条件不成立:politeEmail() 应为空,实际 %q", got)
	}

	res, definitive := fetchUnpaywall(context.Background(), "10.1000/xyz123")
	if res == nil {
		t.Fatal("fetchUnpaywall 返回了 nil *Result —— Resolve 会在 res.DOI = doi 处 panic")
	}
	if res.IsOA {
		t.Error("没有礼貌池邮箱时不该声称找到了 OA 全文")
	}
	if definitive {
		t.Error("跳过查询的结果不是「确定」的,不应被缓存 —— 否则配好邮箱后仍要清缓存才恢复")
	}
}

// AppConfig 为 nil(某些单测 / 裸跑路径)时 politeEmail 不能 panic。
func TestPoliteEmailHandlesNilAppConfig(t *testing.T) {
	prev := appconfig.AppConfig
	t.Cleanup(func() { appconfig.AppConfig = prev })
	appconfig.AppConfig = nil

	if got := politeEmail(); got != "" {
		t.Errorf("AppConfig 为 nil 时应返回空串,实际 %q", got)
	}
}
