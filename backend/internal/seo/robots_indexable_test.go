package seo

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// 非权威环境(测试 / 预发 / 克隆)的 robots.txt 契约。
//
// 背景:同一套代码 + 同一批镜像会被部署到不止一台机器,区分它们的只有 .env。
// 如果非权威环境照常发放「Allow: / + Sitemap 入口」的 robots,搜索引擎会把它抓成
// 一个与权威站逐字重复的镜像站 —— 这类事故要几周后排名塌了才会被发现、恢复更久,
// 而且过程中没有任何报错。所以这条契约必须被机械钉死,不能靠部署时记得。
//
// 开关取值链:显式 SEO_INDEXABLE > 从 APP_ENV 派生(prod=true / test|dev=false)。

func fetchRobots(t *testing.T) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/robots.txt", nil)
	(&Handler{}).ServeRobotsTxt(ctx)
	return recorder.Body.String()
}

// APP_ENV=test 时整站 Disallow,且**不输出 Sitemap 指令**。
//
// 不输出 Sitemap 是这条契约里容易被忽略的一半:robots.txt 只是对守规矩的爬虫的
// 劝阻,而 Sitemap 那一行是「整份可抓 URL 清单」的地址 —— 对不守 robots 的爬虫,
// 留着它等于在说「别抓,地图在这儿」。
func TestRobotsIsDisallowAllWhenEnvIsNotProd(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("SEO_INDEXABLE", "") // 显式留空 = 走 APP_ENV 派生

	body := fetchRobots(t)

	if !strings.Contains(body, "Disallow: /") {
		t.Fatalf("非权威环境必须整站 Disallow:\n%s", body)
	}
	if strings.Contains(body, "Allow: /") {
		t.Errorf("非权威环境不得出现任何 Allow 规则:\n%s", body)
	}
	if strings.Contains(body, "Sitemap:") {
		t.Errorf("非权威环境不得声明 Sitemap 入口(那是整份 URL 清单的地址):\n%s", body)
	}
}

// 显式 SEO_INDEXABLE 优先于 APP_ENV 派生 —— 两个方向都要能覆盖,
// 否则「派生」就变成了「强制」,而强制会在需要例外时把人逼去改代码。
func TestExplicitSEOIndexableOverridesAppEnv(t *testing.T) {
	t.Run("test 环境显式打开", func(t *testing.T) {
		t.Setenv("APP_ENV", "test")
		t.Setenv("SEO_INDEXABLE", "true")
		if body := fetchRobots(t); !strings.Contains(body, "Sitemap:") {
			t.Errorf("显式 SEO_INDEXABLE=true 应恢复完整 robots:\n%s", body)
		}
	})

	t.Run("prod 环境显式关闭", func(t *testing.T) {
		t.Setenv("APP_ENV", "prod")
		t.Setenv("SEO_INDEXABLE", "false")
		if body := fetchRobots(t); strings.Contains(body, "Sitemap:") {
			t.Errorf("显式 SEO_INDEXABLE=false 应关掉索引:\n%s", body)
		}
	})
}

// APP_ENV 未设置时按 prod 处理。
//
// 这是刻意的向后兼容,也是最贵的一条:APP_ENV 是 2026-08-13 才引入的,已上线站点的
// .env 里没有这一行。若未设置按 test 处理,一次常规升级就会让在跑的站点静默从搜索
// 引擎里掉出去。让「旧配置 = 旧行为」,新环境靠 deploy.sh 的强制检查来保证写上它。
func TestMissingAppEnvKeepsSiteIndexable(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("SEO_INDEXABLE", "")

	body := fetchRobots(t)
	if !strings.Contains(body, "Sitemap:") {
		t.Fatalf("APP_ENV 未设置时必须维持可索引(向后兼容),否则老站升级即掉出索引:\n%s", body)
	}
}
