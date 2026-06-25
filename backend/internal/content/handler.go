package content

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler 暴露公开内容 API(无鉴权),供前端文章列表 / 详情页取数。
// 数据是 go:embed 的静态内容,故无需 service / repository 层。
type Handler struct{}

// NewHandler 构造内容 API handler。
func NewHandler() *Handler { return &Handler{} }

func validKind(kind string) bool {
	for _, k := range Kinds {
		if k == kind {
			return true
		}
	}
	return false
}

// articleCard 列表项(不含 sections,瘦身)。
type articleCard struct {
	Slug        string   `json:"slug"`
	Title       string   `json:"title"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags"`
	Excerpt     string   `json:"excerpt"`
	ReadTime    string   `json:"readTime"`
	Date        string   `json:"date"`
	UpdatedDate string   `json:"updatedDate"`
	Author      *Author  `json:"author"`
}

// ListArticles GET /api/v1/content/:kind —— 文章卡片列表(lastmod 倒序)。
func (h *Handler) ListArticles(c *gin.Context) {
	kind := c.Param("kind")
	if !validKind(kind) {
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown content kind"})
		return
	}
	items := List(kind)
	out := make([]articleCard, 0, len(items))
	for _, a := range items {
		out = append(out, articleCard{
			Slug: a.Slug, Title: a.Title, Category: a.Category, Tags: a.Tags,
			Excerpt: a.Excerpt, ReadTime: a.ReadTime, Date: a.Date,
			UpdatedDate: a.UpdatedDate, Author: a.Author,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": out})
}

// GetArticle GET /api/v1/content/:kind/:slug —— 单篇全文(含 sections)。
func (h *Handler) GetArticle(c *gin.Context) {
	kind := c.Param("kind")
	if !validKind(kind) {
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown content kind"})
		return
	}
	a, ok := Get(kind, c.Param("slug"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "article not found"})
		return
	}
	c.JSON(http.StatusOK, a)
}
