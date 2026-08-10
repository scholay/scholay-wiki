package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"scholar-backend/internal/featuretool"
	"scholar-backend/internal/news"
	"scholar-backend/internal/seo"

	"github.com/gin-gonic/gin"
)

func TestRegisterGETAndHEADPreservesStatusAndHeadersWithoutHeadBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerGETAndHEAD(router, "/sitemap.xml", func(c *gin.Context) {
		c.Header("Content-Type", "application/xml; charset=utf-8")
		c.Header("Cache-Control", "public, max-age=900")
		c.String(http.StatusOK, "<sitemapindex>payload</sitemapindex>")
	})

	responses := make(map[string]*httptest.ResponseRecorder, 2)
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(method, "/sitemap.xml", nil))
		responses[method] = recorder
	}

	get, head := responses[http.MethodGet], responses[http.MethodHead]
	if get.Code != http.StatusOK || head.Code != get.Code {
		t.Fatalf("status GET=%d HEAD=%d, want both 200", get.Code, head.Code)
	}
	for _, header := range []string{"Content-Type", "Cache-Control"} {
		if head.Header().Get(header) != get.Header().Get(header) {
			t.Errorf("%s GET=%q HEAD=%q", header, get.Header().Get(header), head.Header().Get(header))
		}
	}
	if get.Body.Len() == 0 {
		t.Fatal("GET unexpectedly has no body")
	}
	if head.Body.Len() != 0 {
		t.Fatalf("HEAD body = %q, want empty", head.Body.String())
	}
}

func TestAllRobotsAndSitemapRoutesRegisterGETAndHEAD(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerSEOReadRoutes(router, &allHandlers{
		seo:         &seo.Handler{},
		featureTool: &featuretool.Handler{},
		news:        &news.Handler{},
	})

	wantPaths := []string{
		"/sitemap.xml",
		"/sitemap-static.xml",
		"/sitemap-blogs.xml",
		"/sitemap-resources.xml",
		"/sitemap-qa.xml",
		"/sitemap-papers-:page.xml",
		"/sitemap-authors-:page.xml",
		"/sitemap-journals-:page.xml",
		"/sitemap-tools.xml",
		"/sitemap-tools-:page.xml",
		"/sitemap-news.xml",
		"/robots.txt",
	}
	registered := make(map[string]map[string]bool)
	for _, route := range router.Routes() {
		if registered[route.Path] == nil {
			registered[route.Path] = make(map[string]bool)
		}
		registered[route.Path][route.Method] = true
	}
	for _, path := range wantPaths {
		for _, method := range []string{http.MethodGet, http.MethodHead} {
			if !registered[path][method] {
				t.Errorf("missing %s route for %s", method, path)
			}
		}
	}
}
