package wikimcp

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestModernDiscoverAndToolCatalog(t *testing.T) {
	handler := NewHandler()
	discover := performModernRequest(t, handler, "server/discover", "", map[string]any{})
	if discover.Code != http.StatusOK {
		t.Fatalf("discover status=%d body=%s", discover.Code, discover.Body.String())
	}
	result := responseResult(t, discover)
	if result["resultType"] != "complete" {
		t.Fatalf("modern resultType=%v", result["resultType"])
	}
	versions := result["supportedVersions"].([]any)
	if len(versions) != 1 || versions[0] != modernProtocolVersion {
		t.Fatalf("supportedVersions=%v", versions)
	}
	if result["cacheScope"] != "public" {
		t.Fatalf("discover cacheScope=%v", result["cacheScope"])
	}

	listed := performModernRequest(t, handler, "tools/list", "", map[string]any{})
	tools := responseResult(t, listed)["tools"].([]any)
	if len(tools) != 3 {
		t.Fatalf("expected list/search/read tools, got %d", len(tools))
	}
	want := map[string]bool{
		"list_wiki_articles": false,
		"search_wiki":        false,
		"read_wiki_article":  false,
	}
	for _, item := range tools {
		tool := item.(map[string]any)
		want[tool["name"].(string)] = true
		annotations := tool["annotations"].(map[string]any)
		if annotations["readOnlyHint"] != true || annotations["destructiveHint"] != false {
			t.Fatalf("tool annotations are not read-only: %v", annotations)
		}
	}
	for name, found := range want {
		if !found {
			t.Fatalf("missing tool %q", name)
		}
	}
}

func TestPublicEndpointPathAndGETBehavior(t *testing.T) {
	if PublicEndpointPath != "/api/v1/public/wiki/mcp" {
		t.Fatalf("unexpected public endpoint path %q", PublicEndpointPath)
	}
	handler := NewHandler()
	request := httptest.NewRequest(http.MethodGet, PublicEndpointPath, nil)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	handler.Handle(context)
	if recorder.Code != http.StatusMethodNotAllowed || recorder.Header().Get("Allow") != http.MethodPost {
		t.Fatalf("GET status=%d allow=%q body=%s", recorder.Code, recorder.Header().Get("Allow"), recorder.Body.String())
	}
}

func TestCurlWireSmoke(t *testing.T) {
	curl, err := exec.LookPath("curl")
	if err != nil {
		t.Skip("curl is not installed")
	}
	handler := NewHandler()
	router := gin.New()
	router.POST(PublicEndpointPath, handler.Handle)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	payload := string(mustJSON(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      "curl-smoke",
		"method":  "server/discover",
		"params":  modernParams(map[string]any{}),
	}))
	command := exec.Command(curl,
		"--silent", "--show-error", "--fail-with-body",
		"--request", http.MethodPost,
		"--header", "Content-Type: application/json",
		"--header", "Accept: application/json, text/event-stream",
		"--header", "MCP-Protocol-Version: "+modernProtocolVersion,
		"--header", "Mcp-Method: server/discover",
		"--data-binary", payload,
		server.URL+PublicEndpointPath,
	)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("curl MCP discover: %v\n%s", err, output)
	}
	var response map[string]any
	if err := json.Unmarshal(output, &response); err != nil {
		t.Fatalf("decode curl response %s: %v", output, err)
	}
	result := response["result"].(map[string]any)
	if result["resultType"] != "complete" || result["cacheScope"] != "public" {
		t.Fatalf("unexpected curl discover result: %s", output)
	}
}

func TestModernSearchReadAndResourceRead(t *testing.T) {
	handler := NewHandler()
	search := performModernRequest(t, handler, "tools/call", "search_wiki", map[string]any{
		"name": "search_wiki",
		"arguments": map[string]any{
			"query": "智能搜索",
			"limit": 3,
		},
	})
	if search.Code != http.StatusOK {
		t.Fatalf("search status=%d body=%s", search.Code, search.Body.String())
	}
	searchResult := responseResult(t, search)
	structured := searchResult["structuredContent"].(map[string]any)
	articles := structured["articles"].([]any)
	if len(articles) == 0 || len(articles) > 3 {
		t.Fatalf("bounded search returned %d articles", len(articles))
	}
	slug := articles[0].(map[string]any)["slug"].(string)

	read := performModernRequest(t, handler, "tools/call", "read_wiki_article", map[string]any{
		"name":      "read_wiki_article",
		"arguments": map[string]any{"slug": slug},
	})
	readResult := responseResult(t, read)
	content := readResult["content"].([]any)
	if len(content) != 1 || content[0].(map[string]any)["text"] == "" {
		t.Fatal("read_wiki_article did not return Markdown content")
	}
	article := readResult["structuredContent"].(map[string]any)["article"].(map[string]any)
	uri := article["resource_uri"].(string)

	resource := performModernRequest(t, handler, "resources/read", uri, map[string]any{"uri": uri})
	resourceResult := responseResult(t, resource)
	if resourceResult["cacheScope"] != "public" {
		t.Fatalf("resource cacheScope=%v", resourceResult["cacheScope"])
	}
	contents := resourceResult["contents"].([]any)
	if len(contents) != 1 || contents[0].(map[string]any)["text"] == "" {
		t.Fatal("resources/read did not return Wiki Markdown")
	}
}

func TestListToolAndResourcePagination(t *testing.T) {
	handler := NewHandler()
	first := performModernRequest(t, handler, "tools/call", "list_wiki_articles", map[string]any{
		"name":      "list_wiki_articles",
		"arguments": map[string]any{"limit": 7},
	})
	firstStructured := responseResult(t, first)["structuredContent"].(map[string]any)
	firstArticles := firstStructured["articles"].([]any)
	if len(firstArticles) != 7 || firstStructured["next_cursor"] == "" {
		t.Fatalf("unexpected first list page: %v", firstStructured)
	}
	second := performModernRequest(t, handler, "tools/call", "list_wiki_articles", map[string]any{
		"name": "list_wiki_articles",
		"arguments": map[string]any{
			"limit":  7,
			"cursor": firstStructured["next_cursor"],
		},
	})
	secondArticles := responseResult(t, second)["structuredContent"].(map[string]any)["articles"].([]any)
	if firstArticles[0].(map[string]any)["slug"] == secondArticles[0].(map[string]any)["slug"] {
		t.Fatal("list cursor repeated the first page")
	}

	resources := performModernRequest(t, handler, "resources/list", "", map[string]any{})
	resourceResult := responseResult(t, resources)
	if len(resourceResult["resources"].([]any)) != resourcePageSize || resourceResult["nextCursor"] == "" {
		t.Fatalf("unexpected resources page: %v", resourceResult)
	}
}

func TestModernTransportSecurityAndHeaderValidation(t *testing.T) {
	handler := NewHandler()
	params := modernParams(map[string]any{})
	body := mustJSON(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/list",
		"params":  params,
	})

	request := httptest.NewRequest(http.MethodPost, "/api/v1/public/wiki/mcp", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json, text/event-stream")
	request.Header.Set("MCP-Protocol-Version", modernProtocolVersion)
	// Deliberately omit Mcp-Method.
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	handler.Handle(context)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("missing mirrored header status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if responseErrorCode(t, recorder) != headerMismatchCode {
		t.Fatalf("missing mirrored header code=%d", responseErrorCode(t, recorder))
	}

	request = httptest.NewRequest(http.MethodPost, "/api/v1/public/wiki/mcp", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "https://attacker.example")
	recorder = httptest.NewRecorder()
	context, _ = gin.CreateTestContext(recorder)
	context.Request = request
	handler.Handle(context)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("foreign Origin status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestRejectsJSONRPCBatchRequests(t *testing.T) {
	handler := NewHandler()
	request := httptest.NewRequest(http.MethodPost, PublicEndpointPath, bytes.NewBufferString(`[{"jsonrpc":"2.0","id":1,"method":"tools/list"}]`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	handler.Handle(context)
	if recorder.Code != http.StatusBadRequest || responseErrorCode(t, recorder) != -32600 {
		t.Fatalf("batch status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestLegacyInitializeCompatibility(t *testing.T) {
	handler := NewHandler()
	body := mustJSON(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      "init-1",
		"method":  "initialize",
		"params": map[string]any{
			"protocolVersion": "2025-06-18",
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": "legacy-test", "version": "1.0.0"},
		},
	})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/public/wiki/mcp", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	handler.Handle(context)
	result := responseResult(t, recorder)
	if result["protocolVersion"] != "2025-06-18" {
		t.Fatalf("legacy protocolVersion=%v", result["protocolVersion"])
	}
	if _, modernOnly := result["resultType"]; modernOnly {
		t.Fatal("legacy initialize response must not include modern resultType")
	}
}

func TestMissingResourceUsesEraSpecificErrorCode(t *testing.T) {
	handler := NewHandler()
	missingURI := "scholay://wiki/article/not-a-real-entry"
	modern := performModernRequest(t, handler, "resources/read", missingURI, map[string]any{"uri": missingURI})
	if responseErrorCode(t, modern) != -32602 {
		t.Fatalf("modern missing resource error=%s", modern.Body.String())
	}

	body := mustJSON(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "resources/read",
		"params":  map[string]any{"uri": missingURI},
	})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/public/wiki/mcp", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("MCP-Protocol-Version", "2025-06-18")
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	handler.Handle(context)
	if responseErrorCode(t, recorder) != -32002 {
		t.Fatalf("legacy missing resource error=%s", recorder.Body.String())
	}
}

func TestToolAndQueryBounds(t *testing.T) {
	handler := NewHandler()
	tooMany := performModernRequest(t, handler, "tools/call", "search_wiki", map[string]any{
		"name": "search_wiki",
		"arguments": map[string]any{
			"query": "搜索",
			"limit": maxSearchLimit + 1,
		},
	})
	if responseErrorCode(t, tooMany) != -32602 {
		t.Fatalf("unbounded limit error=%s", tooMany.Body.String())
	}

	unknown := performModernRequest(t, handler, "tools/call", "delete_everything", map[string]any{
		"name":      "delete_everything",
		"arguments": map[string]any{},
	})
	if responseErrorCode(t, unknown) != -32602 {
		t.Fatalf("unknown tool error=%s", unknown.Body.String())
	}
}

func performModernRequest(t *testing.T, handler *Handler, method, name string, params map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body := mustJSON(t, map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  method,
		"params":  modernParams(params),
	})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/public/wiki/mcp", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json, text/event-stream")
	request.Header.Set("MCP-Protocol-Version", modernProtocolVersion)
	request.Header.Set("Mcp-Method", method)
	if name != "" {
		request.Header.Set("Mcp-Name", name)
	}
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	handler.Handle(context)
	return recorder
}

func modernParams(params map[string]any) map[string]any {
	copy := make(map[string]any, len(params)+1)
	for key, value := range params {
		copy[key] = value
	}
	copy["_meta"] = map[string]any{
		"io.modelcontextprotocol/protocolVersion":    modernProtocolVersion,
		"io.modelcontextprotocol/clientInfo":         map[string]any{"name": "wiki-test", "version": "1.0.0"},
		"io.modelcontextprotocol/clientCapabilities": map[string]any{},
	}
	return copy
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal test request: %v", err)
	}
	return data
}

func responseResult(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var response map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response status=%d body=%s: %v", recorder.Code, recorder.Body.String(), err)
	}
	result, ok := response["result"].(map[string]any)
	if !ok {
		t.Fatalf("response has no result: %s", recorder.Body.String())
	}
	return result
}

func responseErrorCode(t *testing.T, recorder *httptest.ResponseRecorder) int {
	t.Helper()
	var response struct {
		Error struct {
			Code int `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	return response.Error.Code
}
