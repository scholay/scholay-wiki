# Scholar Agent File I/O Lifecycle: Complete Flow Analysis

> **Category:** internal

## Summary

The Scholar system implements a "Plan B" file architecture where the backend pushes raw files into the agent's session-isolated work directory (~/sessions/<sessionId>/), and the agent's native file tools (Read/Write/Edit/etc.) operate within this sandbox. Content egress flows through three channels: direct preview reading (text ≤1MB, images as dataUrl base64), full reads with full=1 bypass for large text, and GET /claw/session/file for image proxying. Permission gating happens bidirectionally: backend validates session ownership via OwnsSession, agent sandbox via pathWithin checks in agentbridge WS handler. The agent itself lacks awareness of file endpoints but gains implicit capability through permissionAllowed rules in the permission_response pipeline.

---

## Schema Overview

The Scholar file I/O system forms a tightly-coupled agent↔backend loop with precise boundary controls:

```
┌─────────────────────────────────┐
│ Backend (Prism/Claw)            │
├─────────────────────────────────┤
│ 1. Upload request from user     │ → POST /claw/upload/
│ 2. Validate file size/MIME      │
│ 3. GetOrCreate session          │
│ 4. PushSessionFile() ──────────────→ POST /api/sessions/:id/files
│ 5. Store path in user_message   │
│    attachments[].path           │
└─────────────────────────────────┘
            ↓ (WS to agent)
┌─────────────────────────────────┐
│ Agent (Claude Code in container)│
├─────────────────────────────────┤
│ Session cwd isolation:          │
│   ~/sessions/<sessionId>/       │
│                                 │
│ • Receives attachments[].path   │
│ • Read tool consumes it         │
│ • Large files: permission ask → │
│   backend pathWithin check      │
└─────────────────────────────────┘
            ↓ (WS response)
┌─────────────────────────────────┐
│ Backend permission gate         │
├─────────────────────────────────┤
│ permission_request from agent   │
│ ↓                               │
│ decidePermission() checks:      │
│ • Explicit tool denylist        │
│ • pathWithin(p, sessionWorkDir) │
│ ↓                               │
│ permission_response auto-reply  │
│ (if AutoApprovePermission=true) │
└─────────────────────────────────┘
            ↓
┌─────────────────────────────────┐
│ Content egress (3 paths)        │
├─────────────────────────────────┤
│ Path 1: Direct read (WS)        │
│   Agent's Read tool → message   │
│   content embedded (≤1MB clip)  │
│                                 │
│ Path 2: Full read bypass        │
│   GET /workspace/file?full=1    │
│   Response: content (full text) │
│   (for Prism latency fixup)     │
│                                 │
│ Path 3: Image proxy (HTTP)      │
│   GET /claw/session/file        │
│   OwnsSession + pathWithin      │
│   Returns: raw bytes + MIME     │
│   (for <img src> replay)        │
└─────────────────────────────────┘
```

---

## Question 1: Exact Content Egress Mechanism

### 1.1 Text Files (≤1MB Default)

**File:** `/Users/youngp/mypro/fuck_副本/scholar/agent/src/server/services/workspaceService.ts:392-479`

The agent's `readFile()` endpoint truncates at 1MB by default:

```typescript
// workspaceService.ts:423-428
if (!imageMimeType && !options?.full && stat.stat.size > MAX_PREVIEW_BYTES) {
  const fileHandle = await fs.open(resolvedPath.absolutePath, 'r')
  try {
    const previewBuffer = Buffer.alloc(MAX_PREVIEW_BYTES)  // 1MB = 1024*1024
    const { bytesRead } = await fileHandle.read(previewBuffer, 0, MAX_PREVIEW_BYTES, 0)
    content = previewBuffer.subarray(0, bytesRead)
```

**Response shape** (`WorkspaceReadFileResult`):
```typescript
{
  state: 'ok',
  path: 'relative/path.md',          // relPath normalized with /
  previewType: 'text',
  content: '...',                     // UTF-8 string (truncated at 1MB if no full=1)
  language: 'markdown',
  size: 1234567,                      // actual file size (may be > content.length)
  truncated: true,                    // indicates was clipped
  readBytes: 1048576,                 // bytes actually read
}
```

**Truncation flag semantics:**
- `truncated: true` + `readBytes < size` = file was 1MB-clipped
- Agent learns content is incomplete → can request `?full=1` if critical
- BUT: There's no explicit agent tool call to request full; rather, agent-side code must use the full query param

### 1.2 The full=1 Bypass (Prism Use Case)

**File:** `/Users/youngp/mypro/fuck_副本/scholar/agent/src/server/api/sessions.ts:328-332`

```typescript
case 'file':
  return await runWorkspaceRequest(() => workspaceService.readFile(
    sessionId,
    requireWorkspacePath(url, 'file'),
    { full: url.searchParams.get('full') === '1' },  // ← bypass truncation
  ))
```

When `?full=1` query param is present, `MAX_PREVIEW_BYTES` check is skipped:

```typescript
// workspaceService.ts:423
if (!imageMimeType && !options?.full && stat.stat.size > MAX_PREVIEW_BYTES) {
  // ↑ skipped if options.full=true
```

**Who calls full=1?** Backend client in `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agent/client.go:283-303`:

```go
// ReadWorkspaceFileFull — for Prism latency fixup
// Called when: backend writes session state to agent cwd, needs to read back full content
// for DB persistence (avoid silent truncation loss)
func (c *Client) ReadWorkspaceFileFull(ctx context.Context, sessionID, relPath string) (*WorkspaceFile, error) {
  path := "/api/sessions/" + sessionID + "/workspace/file?path=" + url.QueryEscape(relPath) + "&full=1"
  var out WorkspaceFile
  if err := c.doJSON(ctx, http.MethodGet, path, nil, &out); err != nil {
    // error handling
  }
  return &out, nil
}
```

### 1.3 Image Files (Always Base64 DataURL)

For images, **regardless of size** (up to 12MB in claw/file.go maxProxyImageBytes), content is always returned as base64 dataUrl:

```typescript
// workspaceService.ts:448-457
if (imageMimeType) {
  return {
    state: 'ok',
    path: resolvedPath.relativePath,
    previewType: 'image',
    dataUrl: `data:${imageMimeType};base64,${content.toString('base64')}`,
    mimeType: imageMimeType,
    language: 'image',
    size: stat.stat.size,
  }
}
```

Image MIME types detected:
```typescript
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  apng: 'image/apng',
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}
```

### 1.4 Binary Files

Non-image binary files return no content, only metadata:

```typescript
// workspaceService.ts:460-467
if (content.includes(0)) {
  return {
    state: 'binary',
    path: resolvedPath.relativePath,
    language: 'binary',
    size: stat.stat.size,
    // ← no content/dataUrl
  }
}
```

### 1.5 Image Proxy Path (GET /claw/session/file)

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/claw/file.go:50-121`

This is the **egress point for history replay** (displaying past uploaded images in browser):

```go
// GET /claw/session/file?session_id=<id>&path=<basename>
// ① UserAuthMiddleware validates via cookie/header
// ② OwnsSession(userID, sessionID) — prevents cross-user read
// ③ filepath.Base(rawPath) — only basename allowed (prevents ../ escape)
// ④ AgentClient.GetWorkspaceFile(ctx, sessionID, relPath)
//    ↓ calls agent GET /workspace/file
//    ↓ receives WorkspaceFile with dataUrl (base64)
// ⑤ decodeDataURL() → mime, bytes
// ⑥ Whitelist check: only raster images allowed (not SVG due to XSS risk)
// ⑦ c.Data(http.StatusOK, mimeType, payload) — direct binary response

var allowedRasterMIME = map[string]bool{
  "image/png":  true,
  "image/jpeg": true,
  "image/webp": true,
  "image/gif":  true,
  "image/bmp":  true,
}
// image/svg+xml explicitly excluded (can contain <script> → stored XSS if inlined)
```

---

## Question 2: Directory Listing Capability

### Current Capability: readTree

**File:** `/Users/youngp/mypro/fuck_副本/scholar/agent/src/server/services/workspaceService.ts:520-541`

**Endpoint:** `GET /api/sessions/:id/workspace/tree?path=<relative_path>`

```typescript
async readTree(
  sessionId: string,
  treePath = '',
): Promise<WorkspaceTreeResult> {
  const resolvedPath = await this.resolveWorkspacePath(sessionId, treePath)
  // ... stat checks ...
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(resolvedPath.absolutePath, { withFileTypes: true })
```

**Response shape:**
```typescript
export type WorkspaceTreeResult = {
  state: 'ok' | 'missing' | 'error'
  path: string                    // relative path of directory
  entries: WorkspaceTreeEntry[]   // children
  error?: string
}

export type WorkspaceTreeEntry = {
  name: string                    // filename/dirname
  path: string                    // full relative path
  isDirectory: boolean
}
```

### Agent's Access to Directory Listing

**The agent's built-in Read tool does NOT know about readTree.** The agent only has:
- Read: read single file
- Write: write single file  
- Edit/MultiEdit: modify files
- Glob: find by pattern (shell-based via Bash)
- LS: list directory (also Bash-based)
- Grep: search in files

The `readTree` HTTP endpoint exists but **is not automatically exposed as an agent tool.** It's used by the Prism workspace UI backend, not by the agent directly.

### Minimal Addition for Agent Self-Discovery

To give the agent a tool to "list files in session cwd", there are two approaches:

**Option A: New workspace endpoint** (smallest change)
```
GET /api/sessions/:id/workspace/list?path=<dir>&recursive=<0|1>
```
Returns filtered directory tree in a format the agent tool can consume (JSON array of paths).

**Option B: Harvest from tool_use stream** (architectural approach)
Currently, all agent file operations go through these channels:
1. **Direct tool calls** (Read/Write/Edit) → permission_request gate → agent sees success/failure
2. **Bash tool** → reads from container, no backend gating (⚠️ already disabled in Scholay, see ws.go permissionAllowed)

Could intercept tool_result frames from:
- `Bash`: `ls -la <path>` output
- `Glob`: `<pattern>` results
- `LS`: `<dir>` listing

And synthesize a "session directory contents" log. But this is indirect and lossy.

**Recommendation:** Option A with GET /api/sessions/:id/workspace/tree already implemented. Agent just needs HTTP client to call it. Backend may expose it as a new tool definition or agent runtime can auto-discover via OPTIONS.

---

## Question 3: Security Invariants We Must Preserve

### 3.1 Core Principle: Session Isolation

Every file I/O is **session-scoped**. A user's agent can only read/write files in `~/sessions/<sessionId>/` where `sessionId` belongs to that user.

**Invariant 1: OwnsSession**

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/claw/file.go:69-77`

```go
owns, err := h.feature.OwnsSession(userID, sessionID)
if err != nil {
  utils.InternalError(c, codeAgentUnreachable, "会话校验失败,请稍后重试", err)
  return
}
if !owns {
  utils.Error(c, 4404, "会话不存在或不属于你")
  return
}
```

**Where checked:**
- ✅ claw/file.go GET /claw/session/file (history image replay)
- ✅ claw/upload.go POST /upload (file upload ownership before push)
- ? Agent endpoint POST /api/sessions/:id/files — agent itself doesn't check, assumes backend vetted in WS auth

**Invariant 2: pathWithin subtree check**

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentbridge/ws.go:576-590`

Two-layer pathWithin enforced:

```go
// Layer 1: Agent-side in resolveWorkspacePath
func (w *WorkspaceService) isWithinRoot(targetPath string, rootPath string): boolean {
  const target = this.normalizeComparableAbsolutePath(targetPath)
  const root = this.normalizeComparableAbsolutePath(rootPath)
  return target === root || target.startsWith(`${root}${path.sep}`)
}
// Called in: workspaceService.ts:1092

// Layer 2: Backend permission gate if agent asks for out-of-cwd paths
func pathWithin(p, workDir string) bool {
  if workDir == "" {
    return false  // 没有 workdir 信息时保守拒绝
  }
  if !path.IsAbs(p) {
    // 相对路径 = 相对 cwd, 清理后若仍以 ".." 开头说明逃逸出 cwd → 拒
    cleaned := path.Clean(p)
    return !strings.HasPrefix(cleaned, "..")
  }
  cleaned := path.Clean(p)
  root := path.Clean(workDir)
  return cleaned == root || strings.HasPrefix(cleaned, root+"/")
}
```

**Semantics:**
- Relative paths (e.g., `../../../etc/passwd`) → Clean → check for leading `..` → REJECT if present
- Absolute paths → resolve symlinks, canonicalize, check prefix match against workDir

**Design note:** pathWithin uses string prefix match, NOT filepath.Base. This is intentional:
- `filepath.Base("/home/user/sessions/abc123/file.txt")` → "file.txt" (WRONG, loses directory info)
- `path.Clean(...) + "/".HasPrefix(...)` → preserves full path safety

### 3.2 Tool-level Gating

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentbridge/ws.go:512-555`

Permission check in decidePermission():

```go
func permissionAllowed(toolName string, input json.RawMessage, sessionWorkDir string, denyTools []string) bool {
  // 1. Explicit denylist (per-session/per-feature)
  for _, d := range denyTools {
    if d == toolName {
      return false
    }
  }
  
  // 2. MCP tools always allowed (read-only academic search)
  if strings.HasPrefix(toolName, "mcp__") {
    return true
  }
  
  // 3. Bash allowed (but risky — should be sandboxed in production via bubblewrap)
  if toolName == "Bash" || toolName == "BashOutput" || toolName == "KillShell" {
    return true
  }
  
  // 4. Web/Skill tools allowed (backend firewalled via egress proxy)
  if toolName == "WebFetch" || toolName == "WebSearch" || toolName == "Skill" {
    return true
  }
  
  // 5. File tools — path-checked
  switch toolName {
  case "Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS", "Ls":
    p := extractPathFromInput(input)
    if p == "" {
      return toolName == "Glob" || toolName == "Grep"  // Glob/Grep default to cwd → safe
    }
    return pathWithin(p, sessionWorkDir)
  default:
    return false  // fallthrough: deny unknown tools
  }
}
```

**Invariant 3: Path field extraction**

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentbridge/ws.go:509-574`

All file tools must have path in one of these fields (Claude Code spec):

```go
var fileToolPathKeys = []string{"file_path", "path", "notebook_path", "filePath", "notebookPath"}

func extractPathFromInput(input json.RawMessage) string {
  var obj map[string]any
  if err := json.Unmarshal(input, &obj); err != nil {
    return ""
  }
  for _, k := range fileToolPathKeys {
    if v, ok := obj[k]; ok {
      if s, ok := v.(string); ok && s != "" {
        return s
      }
    }
  }
  return ""
}
```

### 3.3 MIME/XSS Protection

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/claw/file.go:39-48`

Image proxy whitelist (raster only):

```go
var allowedRasterMIME = map[string]bool{
  "image/png":  true,
  "image/jpeg": true,
  "image/webp": true,
  "image/gif":  true,
  "image/bmp":  true,
  // image/svg+xml deliberately excluded
}

// In GetSessionFile():
if !allowedRasterMIME[strings.ToLower(strings.TrimSpace(mimeType))] {
  utils.Error(c, 4404, "不支持的图片类型")
  return
}
```

**Rationale:** SVG can contain `<script>` tags. If proxied as image/svg+xml and inlined in same-origin page, becomes stored XSS (can read `localStorage.auth_token` or `scholay_token` cookie).

**Invariant 4: SVG upload rejection**

**File:** `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/claw/upload.go:85-89`

At upload time, SVG is rejected outright:

```go
// SVG 安全限制: SVG 可含 <script>, 历史回放代理若按 image/svg+xml 内联会变同源 XSS。
// 入口直接拒 —— 不论它被嗅探成图片还是当成 XML 文本分类 (proxy 侧白名单是最终兜底)。
if ext == ".svg" || mime == "image/svg+xml" {
  return nil, errors.New("暂不支持 SVG 文件 (安全限制)")
}
```

### 3.4 Size Caps

**File upload limits** (`claw/upload.go:42-45`):
```go
const (
  MaxFileBytes   = 30 * 1024 * 1024  // 30 MB for non-image files
  MaxImageBytes  = 5 * 1024 * 1024   // 5 MB for images (Anthropic vision hard limit)
  pushFileTimeout = 30 * time.Second
)
```

**Image proxy limits** (`claw/file.go:36-37`):
```go
const maxProxyImageBytes = 12 * 1024 * 1024  // 12 MB (margin for anomalies)
```

**Workspace text preview limits** (`workspaceService.ts:10`):
```typescript
const MAX_PREVIEW_BYTES = 1024 * 1024  // 1 MB text preview (truncation point)
```

---

## Question 4: Agent Awareness of Endpoints

### What the Agent Knows

**The agent is OPAQUE to these endpoints.** It:
- Does NOT know about POST /api/sessions/:id/files
- Does NOT know about GET/PUT/DELETE /api/sessions/:id/workspace/file
- Does NOT know about GET /claw/session/file
- Does NOT know it's running in a "session-isolated" cwd

**Inference route:** The agent deduces its runtime constraints empirically:

1. **File tools hit permission_request** when accessing paths outside its cwd
2. **Backend auto-responds** (if AutoApprovePermission=true in spec)
3. **Agent learns**: "I can read/write under this cwd, but not elsewhere"
4. **System prompt** (injected by backend via agentbridge) can optionally tell it: "You have a session workspace at /home/bun/sessions/<id>/"

### Could Agent Be Given a "Publish" Tool?

**Architectural gap:** Currently:
- **Plan A (today):** Backend reads from agent's filesystem asynchronously
  - Agent writes file to cwd
  - Backend polls GET /api/sessions/:id/workspace/file
  - Backend stores result in DB or proxies to user
  
- **Plan B (proposed):** Agent given explicit "publish file" tool
  - Agent calls `PublishFile(path, metadata)` tool
  - Backend intercepts, validates, stores
  - Reduces latency (explicit signaling vs. polling)
  - Gives agent control over "what gets persisted"

**Example interface:**
```typescript
// If agent had this tool:
{
  name: "PublishFile",
  description: "Publish a file from session cwd to backend for persistence/sharing",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "relative path in session cwd" },
      target: { type: "string", enum: ["db", "export", "share"] },
      metadata: { type: "object", description: "optional: title, description, etc" }
    },
    required: ["path", "target"]
  }
}
```

**Pros:**
- Agent intentionality: only publishes what it explicitly marks
- Reduced backend polling
- Explicit versioning/tagging possible

**Cons:**
- Adds new tool surface area (more permission logic)
- Breaks "Claude Code as-is" premise (custom tool not standard)
- Backend must still validate pathWithin anyway

**Current architecture likely sufficient:** Backend's latency fixup (full=1 reads + caching) handles most use cases. Only needed if agent needs low-latency feedback (e.g., "did my output file save correctly?" → read back immediately).

---

## Data Flow Diagrams

### Upload → Agent Read Path

```
User browser
  ↓
POST /claw/upload/
  ↓ (multipart file)
backend/claw/upload.go:HandleUpload()
  ├─ Validate: size, MIME, not SVG
  ├─ OwnsSession(userID, sessionID) check
  ├─ Call feature.AgentClient().PushSessionFile()
  │   ↓
  │   POST /api/sessions/:id/files (multipart "file")
  │   ↓ (to agent container)
  │   agent/api/sessions.ts:uploadSessionFile()
  │   ├─ Get isolatedSessionWorkDir(sessionId)
  │   ├─ basename + sanitize filename
  │   ├─ UUID prefix: crypto.randomUUID()-${safeName}
  │   ├─ Write to disk: await fs.writeFile(dest, buf)
  │   └─ Return { path, name, size }
  │   ↓
  │   Response to backend: PushedFile{path, name, size}
  │
  └─ Embed path in attachments[]:
    { path: "/home/bun/sessions/abc123/uuid-photo.png", ... }
    ↓
    Return AttachmentDTO{sessionId, type, name, mimeType, size, path}
    ↓
    Frontend stores in active chat, ready to send as user_message

Agent receives user_message with attachments[].path
  ↓
Agent calls Read(file_path="/home/bun/sessions/abc123/uuid-photo.png")
  ├─ If path is outside agent's cwd:
  │   → permission_request → WS to backend
  │   → decidePermission() checks pathWithin()
  │   → permission_response auto-reply (if AutoApprovePermission=true)
  │
  └─ If within cwd:
    Agent's Read tool directly opens file
    ├─ Max 1MB text preview (without full=1)
    ├─ Image → base64 dataUrl
    ├─ Binary → metadata only
    └─ Returns content via WS
```

### Prism Latency Fixup (full=1 Path)

```
Prism backend (after writing changes to agent cwd)
  ↓
Call agent.Client.ReadWorkspaceFileFull(sessionID, relPath)
  ↓
GET /api/sessions/:id/workspace/file?path=relPath&full=1
  ↓ (to agent)
agent/api/sessions.ts:handleSessionWorkspaceRoute()
  ├─ workspaceService.readFile(sessionId, relPath, {full: true})
  │   ↓
  │   Skip the 1MB truncation check (options.full=true bypasses MAX_PREVIEW_BYTES)
  │   ↓
  │   Read entire file (no matter size)
  │   ↓
  │   Return WorkspaceReadFileResult{state: "ok", content: full_text, truncated: false, ...}
  │
  └─ Response to backend
    ↓
    Backend stores in DB without lossy truncation
```

### Image Replay (GET /claw/session/file)

```
Frontend <img src="/claw/session/file?session_id=abc123&path=uuid-photo.png">
  ↓
backend/claw/file.go:GetSessionFile()
  ├─ Extract userID from cookie/header (UserAuthMiddleware)
  ├─ OwnsSession(userID, sessionID) check ✓
  ├─ filepath.Base(rawPath) = "uuid-photo.png" (prevent ../ escape)
  ├─ Call agent.Client.GetWorkspaceFile(sessionID, "uuid-photo.png")
  │   ↓
  │   GET /api/sessions/:id/workspace/file?path=uuid-photo.png
  │   ↓ (to agent)
  │   agent workspaceService.readFile()
  │   ├─ Image detected by extension
  │   ├─ Read full file (image size cap 5MB upload, proxied up to 12MB)
  │   ├─ base64 encode
  │   └─ Return WorkspaceFile{dataUrl: "data:image/png;base64,..."}
  │   ↓
  │   Response to backend: WorkspaceFile{dataUrl, mimeType, size, ...}
  │
  ├─ decodeDataURL(dataUrl) → mime, bytes
  ├─ Whitelist check: is mime in allowedRasterMIME?
  │   (image/png, image/jpeg, image/webp, image/gif, image/bmp only)
  ├─ Set response headers:
  │   Content-Type: image/png
  │   X-Content-Type-Options: nosniff  (prevent MIME sniffing XSS)
  │   Cache-Control: private, max-age=3600
  │
  └─ c.Data(http.StatusOK, mimeType, bytes) → raw image to browser
```

---

## Request/Response JSON Shapes

### POST /api/sessions/:id/files (multipart upload)

**Request:**
```
Content-Type: multipart/form-data

file: <binary bytes of file>
```

**Response:**
```json
{
  "path": "/home/bun/sessions/abc123/550e8400-e29b-41d4-a716-446655440000-document.pdf",
  "name": "document.pdf",
  "size": 2097152
}
```

### GET /api/sessions/:id/workspace/file?path=<relpath>

**Query params:**
```
path=relative/path/to/file.md    (required; URL-encoded)
full=1                            (optional; bypass 1MB truncation)
```

**Response (text file):**
```json
{
  "state": "ok",
  "path": "relative/path/to/file.md",
  "previewType": "text",
  "content": "# Document\n\nContent here...",
  "language": "markdown",
  "size": 12345,
  "truncated": false,
  "readBytes": 12345
}
```

**Response (truncated text file, without full=1):**
```json
{
  "state": "ok",
  "path": "large_file.txt",
  "previewType": "text",
  "content": "First 1MB of content...",
  "language": "text",
  "size": 50000000,
  "truncated": true,
  "readBytes": 1048576
}
```

**Response (image file):**
```json
{
  "state": "ok",
  "path": "photo.png",
  "previewType": "image",
  "dataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA...",
  "mimeType": "image/png",
  "language": "image",
  "size": 524288
}
```

**Response (binary file):**
```json
{
  "state": "binary",
  "path": "archive.bin",
  "language": "binary",
  "size": 1024000
}
```

**Response (file not found):**
```json
{
  "state": "missing",
  "path": "nonexistent.txt",
  "language": "text",
  "size": 0
}
```

### PUT /api/sessions/:id/workspace/file?path=<relpath>

**Request:**
```
Content-Type: text/plain; charset=utf-8
Body: <file content as UTF-8 text>
```

**Response:**
```json
{
  "path": "relative/path/to/file.md",
  "size": 12345
}
```

### DELETE /api/sessions/:id/workspace/file?path=<relpath>

**Request:**
```
(no body)
```

**Response:**
```json
{
  "path": "relative/path/to/file.md"
}
```

### GET /api/sessions/:id/workspace/tree?path=<relpath>

**Query params:**
```
path=relative/dir    (optional; defaults to cwd root)
```

**Response:**
```json
{
  "state": "ok",
  "path": "relative/dir",
  "entries": [
    {
      "name": "file.md",
      "path": "relative/dir/file.md",
      "isDirectory": false
    },
    {
      "name": "subdir",
      "path": "relative/dir/subdir",
      "isDirectory": true
    }
  ]
}
```

### WS permission_request (agent → backend)

**Agent sends:**
```json
{
  "type": "permission_request",
  "requestId": "uuid",
  "toolName": "Read",
  "input": {
    "file_path": "/home/bun/sessions/abc123/../../etc/passwd"
  }
}
```

**Backend auto-responds:**
```json
{
  "type": "permission_response",
  "requestId": "uuid",
  "allowed": false
}
```

(In this example, path traversal detected by pathWithin, request DENIED)

---

## Session Directory Structure

Agent side:
```
/home/bun/sessions/
├── abc123-session-1/
│   ├── uploaded_image_1.png
│   ├── 550e8400-e29b-41d4-a716-446655440000-document.pdf
│   ├── workspace_file.md
│   └── subdir/
│       └── nested_output.txt
├── abc123-session-2/
│   └── ...
└── ...
```

Backend tracks:
- Session ownership: `user_id:feature_key:session_id` triplet in DB
- File metadata: `session_id:relative_path` with upload timestamp, MIME type
- Permissions: perSession denylist of tools (e.g., Prism disables Bash/Write/Edit)

---

## Invariant Summary Table

| Invariant | Where Enforced | Rule | Bypass? |
|-----------|----------------|------|---------|
| OwnsSession | claw/file.go, claw/upload.go | user_id must match session owner | None (hard block) |
| pathWithin relative | ws.go, workspaceService.ts | relative paths must not escape with `..` | None (hard block) |
| pathWithin absolute | ws.go | absolute paths must be under sessionWorkDir | None (hard block) |
| MIME whitelist (proxy) | claw/file.go | image/svg+xml explicitly rejected | Can upload as XML, can't proxy |
| SVG upload reject | claw/upload.go | SVG files rejected at upload | None |
| File size cap | claw/upload.go | 30MB files, 5MB images | Backend validation only |
| Text truncation | workspaceService.ts | 1MB preview default | full=1 query param (backend-only) |
| Tool denylist | ws.go | per-session disallowedTools | Prism hardcodes Bash/Write/Edit/etc. |



## Key Patterns

### Session-Isolated cwd + File Tool Gating
Every agent session gets isolated ~/sessions/<sessionId>/ directory. File operations (Read/Write/Edit) are blocked at permission gate if target path isn't within session cwd. Two-layer validation: agent-side resolveWorkspacePath + backend pathWithin check in WS permission_response handler.

- **How the agent is made aware:** Agent learns implicitly via permission_request→permission_response cycle. System prompt may optionally mention session workspace path.
- **Source:** agent/src/server/services/workspaceService.ts:1078-1112, backend/internal/agentbridge/ws.go:576-590

### Dual-channel Content Egress (WS + HTTP)
Text/binary via WS (embedded in message), images via HTTP GET /claw/session/file. Text truncates at 1MB default (full=1 bypasses for backend latency fixup). Images always base64 dataUrl in workspace read response, but HTTP proxy decodes and returns raw bytes for browser <img> tags.

- **How the agent is made aware:** Agent sees truncated content flag in readFile response, could request full=1 (but doesn't have explicit tool for this). Backend initiates full=1 reads for DB fixup.
- **Source:** agent/src/server/services/workspaceService.ts:392-479, backend/internal/agent/client.go:283-303, backend/internal/claw/file.go:50-121

### UUID Prefixing + basename-only Sanitization
Uploaded files get UUID-prefixed names (crypto.randomUUID()-${safeName}) to avoid collisions. Backend proxy uses filepath.Base(path) to reject ../ escapes. Filenames sanitized by removing non-word chars and leading dots.

- **How the agent is made aware:** Not aware; backend handles naming, passes absolute path in attachments[].path
- **Source:** agent/src/server/api/sessions.ts:231-250, backend/internal/claw/file.go:62-67

### SVG as Dual Rejection (Upload + Proxy Whitelist)
SVG rejected at upload time in backend/claw/upload.go. If somehow uploaded as XML/text, proxy whitelist in file.go explicitly excludes image/svg+xml (prevents inlined <script> XSS). Only raster images (png/jpeg/webp/gif/bmp) allowed in proxy responses.

- **How the agent is made aware:** None; backend policy only
- **Source:** backend/internal/claw/upload.go:85-89, backend/internal/claw/file.go:39-48

### Permissionable Tools + Denylist
Agent permission model: explicit per-session disallowedTools (e.g., Prism disables Bash/Write/Edit). MCP tools auto-approved. Bash/Web tools approved (but Bash risky without sandbox). File tools path-checked via pathWithin. Unknown tools denied by default.

- **How the agent is made aware:** Agent sees permission_response with allowed:true/false. System prompt may mention which tools are available.
- **Source:** backend/internal/agentbridge/ws.go:512-555

### WorkspaceReadFileResult Polymorphism
Single endpoint returns different shapes: text file has content field; image has dataUrl+mimeType; binary has no content; error state includes error message. Truncated flag signals if content clipped at 1MB. Client uses state + previewType to dispatch UI rendering.

- **How the agent is made aware:** Agent reads JSON response, interprets state/previewType/truncated to understand what it got back
- **Source:** agent/src/server/services/workspaceService.ts:78-90

### pathWithin Algorithm (relative + absolute branches)
Relative paths (e.g., ../etc/passwd) cleaned and rejected if start with `..` (escape attempt). Absolute paths resolved with path.Clean(), then checked to be == root or prefix-match root+'/'. Prevents both directory traversal and symlink escape.

- **How the agent is made aware:** Not aware; backend validation only
- **Source:** backend/internal/agentbridge/ws.go:576-590


## Relevance to Claw (web-delivery design)

This research directly informs self-understanding of Claw's web delivery layer. Key takeaways for agent self-awareness:

1. **Claw is unaware it's sandboxed** — The agent discovers constraints empirically via permission_request denials. Could be made explicit by: (a) injecting session-awareness into system prompt, (b) adding a discoverable ReadFilesFull or ListSessionDir tool, (c) exposing workspace schema via OPTIONS /api/sessions/:id/workspace.

2. **Full=1 bypass is backend-only** — Claw agent cannot itself request full content of large files (no "read full" tool). Backend owns this policy. If agent needed low-latency write-read-verify loops, would need explicit PublishFile tool to signal intent.

3. **Double validation is correct** — Both agent-side resolveWorkspacePath + backend pathWithin. Agent can be compromised/misled; backend remains gatekeeper. Don't rely on agent-side check alone.

4. **SVG strategy is sound but narrow** — Works for proxy use case (history replay). Doesn't prevent agent from receiving SVG as attachment and processing it (e.g., passing to vision model). If agent needs to serve SVG to users, would need separate egress path (signed download link, not inlined proxy).

5. **Missing "list directory" tool** — Agent can Glob/Grep/LS but those are Bash-based. Explicit GET /workspace/tree endpoint exists for Prism UI, could be exposed as agent tool for session self-discovery (minimal feature).

6. **Session metadata could be auto-injected** — Include in system prompt: "Your session directory is ~/sessions/<id>/. Files uploaded are here. You can Read/Write freely within it, cannot escape." Makes constraints explicit rather than inferred from denials.

## Sources Consulted

- agent/src/server/api/sessions.ts:154-242
- agent/src/server/api/sessions.ts:284-341
- agent/src/server/api/sessions.ts:407-427
- agent/src/server/services/workspaceService.ts:32-35
- agent/src/server/services/workspaceService.ts:78-90
- agent/src/server/services/workspaceService.ts:392-479
- agent/src/server/services/workspaceService.ts:520-541
- agent/src/server/services/workspaceService.ts:1078-1112
- backend/internal/agent/client.go:181-241
- backend/internal/agent/client.go:243-303
- backend/internal/claw/file.go:36-121
- backend/internal/claw/upload.go:47-155
- backend/internal/agentbridge/ws.go:31-39
- backend/internal/agentbridge/ws.go:459-507
- backend/internal/agentbridge/ws.go:512-555
- backend/internal/agentbridge/ws.go:576-590
