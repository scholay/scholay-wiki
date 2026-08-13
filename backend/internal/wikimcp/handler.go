package wikimcp

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	// RoutePath is mounted below the backend's /api/v1 group.
	RoutePath             = "/public/wiki/mcp"
	PublicEndpointPath    = "/api/v1" + RoutePath
	modernProtocolVersion = "2026-07-28"
	legacyProtocolVersion = "2025-11-25"
	maxRequestBodyBytes   = 1 << 20
	publicCacheTTLMillis  = 60 * 60 * 1000

	headerMismatchCode             = -32020
	unsupportedProtocolVersionCode = -32022
)

var supportedLegacyVersions = map[string]struct{}{
	"2025-03-26": {},
	"2025-06-18": {},
	"2025-11-25": {},
}

type Handler struct {
	service *Service
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

type parsedRequest struct {
	request rpcRequest
	id      json.RawMessage
	hasID   bool
	params  map[string]any
	modern  bool
}

func NewHandler() *Handler {
	return &Handler{service: newService(mustLoadCatalog())}
}

func newHandlerWithCatalog(catalog *Catalog) *Handler {
	return &Handler{service: newService(catalog)}
}

// Handle implements a stateless, read-only Streamable HTTP endpoint. MCP uses
// its own JSON-RPC envelope, so this handler intentionally bypasses the
// repository's normal REST response wrapper.
func (handler *Handler) Handle(c *gin.Context) {
	if c.Request.Method != http.MethodPost {
		handler.MethodNotAllowed(c)
		return
	}
	if !validOrigin(c.Request) {
		writeRPCError(c, http.StatusForbidden, nil, -32600, "Forbidden origin", nil)
		return
	}
	mediaType, _, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeRPCError(c, http.StatusUnsupportedMediaType, nil, -32600, "Content-Type must be application/json", nil)
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxRequestBodyBytes)
	parsed, parseErr := parseRequest(c.Request.Body)
	if parseErr != nil {
		status := http.StatusBadRequest
		message := "Parse error: invalid JSON"
		code := -32700
		if errors.Is(parseErr, errInvalidRequest) {
			message = "Invalid JSON-RPC request"
			code = -32600
		}
		writeRPCError(c, status, nil, code, message, nil)
		return
	}

	parsed.modern = isModernRequest(c.Request, parsed)
	if parsed.modern {
		if status, rpcErr := validateModernRequest(c.Request, parsed); rpcErr != nil {
			writeRPCError(c, status, parsed.id, rpcErr.Code, rpcErr.Message, rpcErr.Data)
			return
		}
	} else if status, rpcErr := validateLegacyRequest(c.Request, parsed); rpcErr != nil {
		writeRPCError(c, status, parsed.id, rpcErr.Code, rpcErr.Message, rpcErr.Data)
		return
	}

	if !parsed.hasID {
		// The service has no mutating notifications. Syntactically valid legacy
		// initialized/cancelled notifications are accepted without server state.
		c.Status(http.StatusAccepted)
		return
	}

	result, status, rpcErr := handler.dispatch(parsed)
	if rpcErr != nil {
		if parsed.modern && rpcErr.Code == -32601 {
			status = http.StatusNotFound
		}
		writeRPCError(c, status, parsed.id, rpcErr.Code, rpcErr.Message, rpcErr.Data)
		return
	}
	if isCacheableMethod(parsed.request.Method) {
		c.Header("Cache-Control", "public, max-age=3600")
	} else {
		c.Header("Cache-Control", "no-store")
	}
	writeRPCResult(c, status, parsed.id, result)
}

func (handler *Handler) MethodNotAllowed(c *gin.Context) {
	if !validOrigin(c.Request) {
		writeRPCError(c, http.StatusForbidden, nil, -32600, "Forbidden origin", nil)
		return
	}
	c.Header("Allow", http.MethodPost)
	writeRPCError(c, http.StatusMethodNotAllowed, nil, -32600, "MCP endpoint accepts POST only", nil)
}

func (handler *Handler) dispatch(parsed *parsedRequest) (map[string]any, int, *rpcError) {
	switch parsed.request.Method {
	case "server/discover":
		if !parsed.modern {
			return nil, http.StatusOK, methodNotFound("server/discover")
		}
		return completeResult(true, map[string]any{
			"supportedVersions": []string{modernProtocolVersion},
			"capabilities":      serverCapabilities(),
			"instructions":      serverInstructions(),
			"ttlMs":             publicCacheTTLMillis,
			"cacheScope":        "public",
		}), http.StatusOK, nil
	case "initialize":
		if parsed.modern {
			return nil, http.StatusNotFound, methodNotFound("initialize")
		}
		version := legacyProtocolVersion
		if requested, ok := parsed.params["protocolVersion"].(string); ok {
			if _, supported := supportedLegacyVersions[requested]; supported {
				version = requested
			}
		}
		return map[string]any{
			"protocolVersion": version,
			"capabilities":    serverCapabilities(),
			"serverInfo":      serverInfo(),
			"instructions":    serverInstructions(),
		}, http.StatusOK, nil
	case "ping":
		return completeResult(parsed.modern, map[string]any{}), http.StatusOK, nil
	case "tools/list":
		cursor, err := optionalString(parsed.params, "cursor")
		if err != nil {
			return nil, http.StatusOK, invalidParams("cursor must be a string")
		}
		tools, err := handler.service.listTools(cursor)
		if err != nil {
			return nil, http.StatusOK, invalidParams("Invalid cursor")
		}
		result := map[string]any{"tools": tools}
		addPublicCacheHints(result, parsed.modern)
		return completeResult(parsed.modern, result), http.StatusOK, nil
	case "tools/call":
		return handler.callTool(parsed)
	case "resources/list":
		cursor, err := optionalString(parsed.params, "cursor")
		if err != nil {
			return nil, http.StatusOK, invalidParams("cursor must be a string")
		}
		resources, nextCursor, err := handler.service.listResources(cursor)
		if err != nil {
			return nil, http.StatusOK, invalidParams("Invalid cursor")
		}
		result := map[string]any{"resources": resources}
		if nextCursor != "" {
			result["nextCursor"] = nextCursor
		}
		addPublicCacheHints(result, parsed.modern)
		return completeResult(parsed.modern, result), http.StatusOK, nil
	case "resources/read":
		uri, err := requiredString(parsed.params, "uri")
		if err != nil {
			return nil, http.StatusOK, invalidParams("uri is required")
		}
		article, err := handler.service.readResource(uri)
		if err != nil {
			if !parsed.modern {
				// Legacy revisions used the MCP-specific ResourceNotFound code.
				// Modern 2026-07-28 requests use standard Invalid Params (-32602).
				return nil, http.StatusOK, &rpcError{Code: -32002, Message: "Resource not found", Data: map[string]any{"uri": uri}}
			}
			return nil, http.StatusOK, invalidParams("Unknown Wiki resource")
		}
		result := map[string]any{
			"contents": []map[string]any{{
				"uri":      article.ResourceURI,
				"mimeType": "text/markdown; charset=utf-8",
				"text":     article.ContentMarkdown,
			}},
		}
		addPublicCacheHints(result, parsed.modern)
		return completeResult(parsed.modern, result), http.StatusOK, nil
	default:
		return nil, http.StatusOK, methodNotFound(parsed.request.Method)
	}
}

func (handler *Handler) callTool(parsed *parsedRequest) (map[string]any, int, *rpcError) {
	name, err := requiredString(parsed.params, "name")
	if err != nil {
		return nil, http.StatusOK, invalidParams("tool name is required")
	}
	arguments, err := objectValue(parsed.params, "arguments")
	if err != nil {
		return nil, http.StatusOK, invalidParams("tool arguments must be an object")
	}

	var structured any
	var text string
	switch name {
	case "list_wiki_articles":
		if err := rejectUnknownArguments(arguments, "category", "cursor", "limit"); err != nil {
			return nil, http.StatusOK, invalidParams(err.Error())
		}
		category, categoryErr := stringArgument(arguments, "category")
		cursor, cursorErr := stringArgument(arguments, "cursor")
		limit, limitErr := intArgument(arguments, "limit")
		if categoryErr != nil || cursorErr != nil || limitErr != nil {
			return nil, http.StatusOK, invalidParams("invalid list arguments")
		}
		result, err := handler.service.listArticles(listArguments{Category: category, Cursor: cursor, Limit: limit})
		if err != nil {
			return nil, http.StatusOK, invalidParams(err.Error())
		}
		structured = result
		text = prettyJSON(result)
	case "search_wiki":
		if err := rejectUnknownArguments(arguments, "query", "category", "cursor", "limit"); err != nil {
			return nil, http.StatusOK, invalidParams(err.Error())
		}
		query, queryErr := stringArgument(arguments, "query")
		category, categoryErr := stringArgument(arguments, "category")
		cursor, cursorErr := stringArgument(arguments, "cursor")
		limit, limitErr := intArgument(arguments, "limit")
		if queryErr != nil || categoryErr != nil || cursorErr != nil || limitErr != nil {
			return nil, http.StatusOK, invalidParams("invalid search arguments")
		}
		result, err := handler.service.searchArticles(searchArguments{Query: query, Category: category, Cursor: cursor, Limit: limit})
		if err != nil {
			return nil, http.StatusOK, invalidParams(err.Error())
		}
		structured = result
		text = prettyJSON(result)
	case "read_wiki_article":
		if err := rejectUnknownArguments(arguments, "slug", "section_id"); err != nil {
			return nil, http.StatusOK, invalidParams(err.Error())
		}
		slug, slugErr := stringArgument(arguments, "slug")
		sectionID, sectionErr := stringArgument(arguments, "section_id")
		if slugErr != nil || sectionErr != nil || slug == "" {
			return nil, http.StatusOK, invalidParams("slug is required")
		}
		article, err := handler.service.readArticle(readArguments{Slug: slug, SectionID: sectionID})
		if err != nil {
			return nil, http.StatusOK, invalidParams(err.Error())
		}
		structured = map[string]any{"article": article}
		text = article.ContentMarkdown
	default:
		return nil, http.StatusOK, invalidParams(fmt.Sprintf("Unknown tool: %s", name))
	}

	return completeResult(parsed.modern, map[string]any{
		"content":           []map[string]any{{"type": "text", "text": text}},
		"structuredContent": structured,
		"isError":           false,
	}), http.StatusOK, nil
}

func parseRequest(body io.Reader) (*parsedRequest, error) {
	decoder := json.NewDecoder(body)
	decoder.UseNumber()
	var envelope map[string]json.RawMessage
	if err := decoder.Decode(&envelope); err != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			return nil, errInvalidRequest
		}
		return nil, err
	}
	if err := ensureEOF(decoder); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(envelope)
	if err != nil {
		return nil, err
	}
	var request rpcRequest
	if err := json.Unmarshal(encoded, &request); err != nil {
		return nil, errInvalidRequest
	}
	if request.JSONRPC != "2.0" || request.Method == "" {
		return nil, errInvalidRequest
	}
	id, hasID := envelope["id"]
	if hasID && !validRequestID(id) {
		return nil, errInvalidRequest
	}
	params, err := decodeObject(request.Params)
	if err != nil {
		return nil, errInvalidRequest
	}
	return &parsedRequest{request: request, id: id, hasID: hasID, params: params}, nil
}

var errInvalidRequest = errors.New("invalid JSON-RPC request")

func ensureEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errInvalidRequest
		}
		return err
	}
	return nil
}

func validRequestID(raw json.RawMessage) bool {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return false
	}
	switch value.(type) {
	case string, json.Number:
		return true
	default:
		return false
	}
}

func decodeObject(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return map[string]any{}, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil || value == nil {
		return nil, errInvalidRequest
	}
	return value, nil
}

func isModernRequest(request *http.Request, parsed *parsedRequest) bool {
	if parsed.request.Method == "initialize" {
		if request.Header.Get("MCP-Protocol-Version") == modernProtocolVersion || request.Header.Get("Mcp-Method") != "" {
			return true
		}
		if version, exists := requestMetaProtocol(parsed.params); exists {
			return version != ""
		}
		return false
	}
	if parsed.request.Method == "server/discover" || request.Header.Get("Mcp-Method") != "" {
		return true
	}
	if version, exists := requestMetaProtocol(parsed.params); exists {
		return version != ""
	}
	return request.Header.Get("MCP-Protocol-Version") == modernProtocolVersion
}

func validateModernRequest(request *http.Request, parsed *parsedRequest) (int, *rpcError) {
	meta, ok := parsed.params["_meta"].(map[string]any)
	if !ok {
		return http.StatusBadRequest, invalidParams("params._meta is required")
	}
	bodyVersion, ok := meta["io.modelcontextprotocol/protocolVersion"].(string)
	if !ok || bodyVersion == "" {
		return http.StatusBadRequest, invalidParams("protocolVersion metadata is required")
	}
	headerVersion := request.Header.Get("MCP-Protocol-Version")
	if headerVersion == "" || headerVersion != bodyVersion {
		return http.StatusBadRequest, &rpcError{Code: headerMismatchCode, Message: "Header mismatch: MCP-Protocol-Version must match request metadata"}
	}
	if bodyVersion != modernProtocolVersion {
		return http.StatusBadRequest, &rpcError{
			Code:    unsupportedProtocolVersionCode,
			Message: "Unsupported protocol version",
			Data:    map[string]any{"supported": []string{modernProtocolVersion}, "requested": bodyVersion},
		}
	}
	if _, ok := meta["io.modelcontextprotocol/clientCapabilities"].(map[string]any); !ok {
		return http.StatusBadRequest, invalidParams("clientCapabilities metadata is required")
	}
	if client, exists := meta["io.modelcontextprotocol/clientInfo"]; exists {
		info, ok := client.(map[string]any)
		name, nameOK := info["name"].(string)
		version, versionOK := info["version"].(string)
		if !ok || !nameOK || !versionOK || name == "" || version == "" {
			return http.StatusBadRequest, invalidParams("clientInfo metadata is malformed")
		}
	}
	if request.Header.Get("Mcp-Method") != parsed.request.Method {
		return http.StatusBadRequest, &rpcError{Code: headerMismatchCode, Message: "Header mismatch: Mcp-Method must match the JSON-RPC method"}
	}
	if name, required := mirroredName(parsed); required {
		headerName, err := decodeMirroredHeader(request.Header.Get("Mcp-Name"))
		if err != nil || headerName == "" || headerName != name {
			return http.StatusBadRequest, &rpcError{Code: headerMismatchCode, Message: "Header mismatch: Mcp-Name must match the request body"}
		}
	}
	accept := request.Header.Get("Accept")
	if !strings.Contains(accept, "application/json") || !strings.Contains(accept, "text/event-stream") {
		return http.StatusNotAcceptable, &rpcError{Code: -32600, Message: "Accept must include application/json and text/event-stream"}
	}
	return http.StatusOK, nil
}

func validateLegacyRequest(request *http.Request, parsed *parsedRequest) (int, *rpcError) {
	headerVersion := request.Header.Get("MCP-Protocol-Version")
	if headerVersion == "" {
		return http.StatusOK, nil
	}
	if _, supported := supportedLegacyVersions[headerVersion]; supported {
		return http.StatusOK, nil
	}
	return http.StatusBadRequest, &rpcError{
		Code:    unsupportedProtocolVersionCode,
		Message: "Unsupported protocol version",
		Data: map[string]any{
			"supported": []string{legacyProtocolVersion, "2025-06-18", "2025-03-26", modernProtocolVersion},
			"requested": headerVersion,
		},
	}
}

func requestMetaProtocol(params map[string]any) (string, bool) {
	meta, ok := params["_meta"].(map[string]any)
	if !ok {
		return "", false
	}
	version, ok := meta["io.modelcontextprotocol/protocolVersion"].(string)
	return version, ok
}

func mirroredName(parsed *parsedRequest) (string, bool) {
	switch parsed.request.Method {
	case "tools/call", "prompts/get":
		value, _ := parsed.params["name"].(string)
		return value, true
	case "resources/read":
		value, _ := parsed.params["uri"].(string)
		return value, true
	default:
		return "", false
	}
}

func decodeMirroredHeader(value string) (string, error) {
	if strings.HasPrefix(value, "=?base64?") && strings.HasSuffix(value, "?=") {
		encoded := strings.TrimSuffix(strings.TrimPrefix(value, "=?base64?"), "?=")
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(decoded) == 0 {
			return "", errors.New("invalid base64 header")
		}
		return string(decoded), nil
	}
	if strings.TrimSpace(value) != value {
		return "", errors.New("invalid header whitespace")
	}
	for _, character := range []byte(value) {
		if character < 0x20 || character > 0x7e {
			return "", errors.New("invalid header character")
		}
	}
	return value, nil
}

func validOrigin(request *http.Request) bool {
	raw := request.Header.Get("Origin")
	if raw == "" {
		return true
	}
	origin, err := url.Parse(raw)
	if err != nil || origin.Scheme == "" || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		return false
	}
	requestHost := hostname(request.Host)
	if isLoopbackHost(requestHost) && isLoopbackHost(origin.Hostname()) {
		return true
	}
	allowed := []string{"https://www.scholay.com", "https://scholay.com"}
	if configured := strings.TrimSpace(os.Getenv("SITE_URL")); configured != "" {
		allowed = append(allowed, strings.TrimSuffix(configured, "/"))
	}
	canonicalOrigin := strings.ToLower(origin.Scheme + "://" + origin.Host)
	for _, candidate := range allowed {
		parsed, parseErr := url.Parse(candidate)
		if parseErr == nil && strings.ToLower(parsed.Scheme+"://"+parsed.Host) == canonicalOrigin {
			return true
		}
	}
	return false
}

func hostname(hostport string) string {
	host, _, err := net.SplitHostPort(hostport)
	if err == nil {
		return strings.Trim(host, "[]")
	}
	return strings.Trim(hostport, "[]")
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func completeResult(modern bool, result map[string]any) map[string]any {
	if modern {
		result["resultType"] = "complete"
		result["_meta"] = map[string]any{"io.modelcontextprotocol/serverInfo": serverInfo()}
	}
	return result
}

func addPublicCacheHints(result map[string]any, modern bool) {
	if modern {
		result["ttlMs"] = publicCacheTTLMillis
		result["cacheScope"] = "public"
	}
}

func serverCapabilities() map[string]any {
	return map[string]any{
		"tools":     map[string]any{"listChanged": false},
		"resources": map[string]any{"subscribe": false, "listChanged": false},
	}
}

func serverInfo() map[string]any {
	return map[string]any{
		"name":        "scholay-wiki",
		"title":       "Scholay Wiki",
		"version":     "1.0.0",
		"description": "Scholay 全站 Wiki 的公开只读 MCP 服务。",
		"websiteUrl":  "https://www.scholay.com/wiki",
	}
}

func serverInstructions() string {
	return "这是 Scholay Wiki 的公开只读知识服务。先用 search_wiki 定位相关词条，用 read_wiki_article 读取全文；需要遍历目录时使用 list_wiki_articles 或 resources/list。内容描述产品功能、界面元素、规则与研究工作流，不执行账户或业务操作。"
}

func isCacheableMethod(method string) bool {
	switch method {
	case "server/discover", "tools/list", "resources/list", "resources/read":
		return true
	default:
		return false
	}
}

func methodNotFound(method string) *rpcError {
	return &rpcError{Code: -32601, Message: fmt.Sprintf("Method not found: %s", method)}
}

func invalidParams(message string) *rpcError {
	return &rpcError{Code: -32602, Message: message}
}

func optionalString(values map[string]any, key string) (string, error) {
	value, exists := values[key]
	if !exists {
		return "", nil
	}
	text, ok := value.(string)
	if !ok || len(text) > maxCursorLength {
		return "", errInvalidParams
	}
	return text, nil
}

func requiredString(values map[string]any, key string) (string, error) {
	value, err := optionalString(values, key)
	if err != nil || value == "" {
		return "", errInvalidParams
	}
	return value, nil
}

func objectValue(values map[string]any, key string) (map[string]any, error) {
	value, exists := values[key]
	if !exists {
		return map[string]any{}, nil
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, errInvalidParams
	}
	return object, nil
}

func prettyJSON(value any) string {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(data)
}

func writeRPCResult(c *gin.Context, status int, id json.RawMessage, result any) {
	writeRPC(c, status, rpcResponse{JSONRPC: "2.0", ID: responseID(id), Result: result})
}

func writeRPCError(c *gin.Context, status int, id json.RawMessage, code int, message string, data any) {
	writeRPC(c, status, rpcResponse{
		JSONRPC: "2.0",
		ID:      responseID(id),
		Error:   &rpcError{Code: code, Message: message, Data: data},
	})
}

func responseID(id json.RawMessage) json.RawMessage {
	if len(id) == 0 {
		return json.RawMessage("null")
	}
	return id
}

func writeRPC(c *gin.Context, status int, response rpcResponse) {
	data, err := json.Marshal(response)
	if err != nil {
		data = []byte(`{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"Internal error"}}`)
		status = http.StatusInternalServerError
	}
	c.Data(status, "application/json; charset=utf-8", data)
}
