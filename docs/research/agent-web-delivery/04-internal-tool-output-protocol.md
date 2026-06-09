# Scholar Agent Protocol for Artifact Delivery: WS Events, Tool Registration & Permission Interception Template

> **Category:** internal

## Summary

This research maps the Scholar agent's WebSocket protocol (ServerMessage types), tool architecture, and the backend permission-request interception pattern to identify where an agent-native "deliver/present artifact" signal could integrate. The protocol defines 19 ServerMessage types with content_delta (streaming), tool_use_complete (structured tool invocation), and message_complete (usage metadata). Tools register via dynamic imports in tools.ts and expose input schemas. The backend intercepts permission_request frames mid-stream, auto-approves or denies based on tool+path validation, and replies with permission_response — this is the template for custom delivery signals. Four design options are available: (a) a built-in Publish tool following tool registry patterns, (b) an MCP resource/capability via preinstalled-mcp.json, (c) a structured output convention (JSON in tool_result), and (d) tool_use interception (high coupling). Options (a) and (b) are production-ready; (c) requires agent cooperation; (d) is fragile.

---

# Scholar Agent Delivery Protocol Research

## Executive Summary

The Scholar agent system provides multiple seams for an agent-native "deliver/present artifact" signal to plug in:

1. **WS Protocol**: Fully documented ServerMessage types (19 variants) flow through the middleware pipeline
2. **Tool Architecture**: Built-in tools register dynamically; custom tools can be added following the same pattern
3. **Backend Permission Interception**: The `decidePermission()` template in `ws.go:459` shows precisely how to intercept mid-stream frames, make a decision, and reply inline
4. **MCP Capability Layer**: Pre-installed MCP servers can expose resources via `preinstalled-mcp.json`

The backend has an existing pattern for mid-stream decision-making (**permission_request → decidePermission → permission_response**) that can be adapted for delivery signals.

---

## Part 1: WebSocket Event Protocol Catalog

**File**: `/Users/youngp/mypro/fuck_副本/scholar/agent/src/server/ws/events.ts`

### Server → Client Messages (ServerMessage type)

| Type | Purpose | Contains | Location in Pipeline |
|------|---------|----------|----------------------|
| `connected` | Session established | `sessionId` | handshake (handler.ts:222) |
| `status` | Agent state change | `state` (idle\|thinking\|tool_executing\|streaming\|permission_pending), `verb`, `elapsed`, `tokens` | polling, tool execution |
| `thinking` | Extended thinking (Claude only) | `text` | mid-stream generation |
| `content_start` | Begin text/tool block | `blockType` (text\|tool_use), `toolName`, `toolUseId`, `parentToolUseId` | tool invocation start |
| `content_delta` | Streaming token | `text` or `toolInput` (partial JSON) | token-by-token emission |
| `tool_use_complete` | Tool invocation complete | `toolName`, `toolUseId`, `input` (full JSON), `parentToolUseId` | after tool input fully streamed |
| `tool_result` | Tool execution result | `toolUseId`, `content` (any), `isError`, `parentToolUseId` | post-execution |
| **`permission_request`** | Ask user approval | `requestId`, `toolName`, `toolUseId`, `input`, `description` | **INTERCEPTED BY BACKEND** (ws.go:376) |
| `message_complete` | Turn finished | `usage` (TokenUsage w/ model field), `cache_read_tokens`, `cache_creation_tokens` | end-of-turn (handler.ts:355) |
| `error` | Failure | `message`, `code`, `retryable` | error conditions |
| `system_notification` | Meta event | `subtype`, `message`, `data` | cleanup, session ops |
| `pong` | Keepalive response | — | keepalive (handler.ts:277) |
| `session_title_updated` | Title auto-generated | `sessionId`, `title` | title service |
| `task_update` | Task progress | `taskId`, `status`, `progress` | task-based work |
| `team_update`, `team_created`, `team_deleted` | Multi-agent events | `teamName`, `members` | coordinated agents |
| `computer_use_permission_request` | Screen/input permission | `requestId`, `request` (ComputerUsePermissionRequest) | desktop automation |
| `resync_start`, `resync_user`, `resync_end` | Reconnection replay | session buffers | disconnect recovery (handler.ts:79-81) |

### Client → Server Messages (ClientMessage type)

| Type | Schema | Handler |
|------|--------|---------|
| `user_message` | `{type, content, attachments?}` | `handleUserMessage()` (handler.ts:334-449) |
| `permission_response` | `{type, requestId, allowed, rule?, updatedInput?}` | `handlePermissionResponse()` (handler.ts:252) |
| `computer_use_permission_response` | `{type, requestId, response}` | `handleComputerUsePermissionResponse()` (handler.ts:256) |
| `set_permission_mode` | `{type, mode}` | `handleSetPermissionMode()` (handler.ts:260) |
| `set_runtime_config` | `{type, providerId, modelId}` | `handleSetRuntimeConfig()` (handler.ts:264) |
| `prewarm_session` | `{type}` | `handlePrewarmSession()` (handler.ts:268) |
| `stop_generation` | `{type}` | `handleStopGeneration()` (handler.ts:272) |
| `ping` | `{type}` | responds `pong` (handler.ts:277) |

### Typical Event Flow (Annotated)

```
WS connect → connected
user sends: user_message

status(thinking)
content_start(blockType:text)
content_delta(text:"I'll read")
content_delta(text:" that file")

content_start(blockType:tool_use, toolName:Read, toolUseId:tu-1)
content_delta(toolInput:"{") → toolInput:"file_path"  → toolInput:"...}")
tool_use_complete(toolName:Read, toolUseId:tu-1, input:{file_path:...})
[BACKEND INTERCEPTS HERE IF permission_request WAS SENT]

status(tool_executing)
tool_result(toolUseId:tu-1, content:"file contents", isError:false)

content_start(blockType:text)
content_delta(text:"Based on file...")
content_delta(text:" conclusion.")

message_complete(usage:{input_tokens:1234, output_tokens:567, model:"claude-3-5-sonnet"})
status(idle)
```

---

## Part 2: Tool Architecture & Registration

**File**: `/Users/youngp/mypro/fuck_副本/scholar/agent/src/tools.ts` (tool registry)

### Tool Registration Pattern

All tools are registered in `tools.ts` via dynamic import + conditional feature gates:

```typescript
// Static imports (always available)
import { BashTool } from './tools/BashTool/BashTool.js'
import { FileReadTool } from './tools/FileReadTool/FileReadTool.js'
import { WebFetchTool } from './tools/WebFetchTool/WebFetchTool.js'

// Conditional imports (feature-gated)
const SendUserFileTool = feature('KAIROS')
  ? require('./tools/SendUserFileTool/SendUserFileTool.js').SendUserFileTool
  : null

const PushNotificationTool = feature('KAIROS') || feature('KAIROS_PUSH_NOTIFICATION')
  ? require('./tools/PushNotificationTool/PushNotificationTool.js').PushNotificationTool
  : null

// Lazy imports (break circular dependencies)
const getSendMessageTool = () =>
  require('./tools/SendMessageTool/SendMessageTool.js').SendMessageTool
```

### Tool Interface (ToolUseBlockParam)

Each tool exposes:
- **Name**: string identifier (e.g., "Read", "Write", "Bash")
- **Description**: human-readable purpose
- **Input Schema**: JSON Schema (ToolInputJSONSchema) defining parameters
- **Execute Handler**: `(input, context) => Promise<ToolResult>`

From `Tool.ts` (ToolUseContext):
```typescript
export type ToolUseContext = {
  options: {
    tools: Tools  // Map of tool name → Tool definition
    mcpClients: MCPServerConnection[]
    mcpResources: Record<string, ServerResource[]>  // MCP resources by server
    // ...
  }
  // ...
}
```

### How Tools Reach the Claude API

Tools are serialized to Anthropic SDK's `ToolUseBlockParam` format before sending to Claude. The agent maintains a `Tools` object (map of name → definition + handler). When sending messages via `Anthropic.messages.create()`, tools are passed in the `tools` parameter. The API responds with `tool_use` content blocks containing tool name + input; the agent routes these to the appropriate handler.

**Key point**: Tool definitions flow through the middleware without modification; they are agent-native and fully controlled by the agent codebase.

---

## Part 3: Backend Permission Interception Template

**File**: `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentbridge/ws.go:361-507`

This is the **critical seam** where the backend intercepts and acts on a WS frame mid-stream.

### The Permission Interception Pattern (agent → front direction)

**Location**: `ws.go:362-401` — the `agent2front` goroutine

```go
// agent → front: 拦截 permission_request 自动 approve / 解析 message_complete usage
safego.Go("agentbridge-ws-agent2front:"+f.spec.Key, func() {
  defer func() { done <- struct{}{} }()
  for {
    _ = agentSide.SetReadDeadline(time.Now().Add(agentReadDeadline))
    mt, data, err := agentSide.ReadMessage()  // Read frame from agent
    if err != nil { /* close both */ return }
    if mt == gorillaws.TextMessage {
      // === INTERCEPTION POINT A: permission_request ===
      if f.spec.AutoApprovePermission {
        sessionWorkDir := path.Join(agentSessionWorkdirRoot(), sessionID)
        if reply, ok := decidePermission(data, sessionWorkDir, specDeny(f.spec)); ok {
          // Frame WAS a permission_request → generate permission_response
          if err := writeAgent(gorillaws.TextMessage, reply); err != nil {
            return
          }
        }
      }
      // === INTERCEPTION POINT B: message_complete (extract usage) ===
      if f.spec.OnMessageComplete != nil {
        if usage, ok := extractMessageCompleteUsage(data); ok {
          hook(hookCtx, userID, usage)  // async hook
        }
      }
    }
    // Forward to front (pass-through if not intercepted)
    if err := writeFront(mt, data); err != nil { return }
  }
})
```

### The Decision Function: `decidePermission()` (ws.go:459-507)

```go
func decidePermission(raw []byte, sessionWorkDir string, denyTools []string) ([]byte, bool) {
  // Parse frame as permission_request
  var probe struct {
    Type      string          `json:"type"`
    RequestID string          `json:"requestId"`
    ToolName  string          `json:"toolName"`
    Input     json.RawMessage `json:"input"`
  }
  if err := json.Unmarshal(raw, &probe); err != nil {
    return nil, false  // Not JSON → not a permission_request
  }
  if probe.Type != "permission_request" || probe.RequestID == "" {
    return nil, false  // Different frame type → pass-through
  }

  // === DECISION LOGIC ===
  allowed := permissionAllowed(probe.ToolName, probe.Input, sessionWorkDir, denyTools)
  
  // === BUILD REPLY ===
  reply, err := json.Marshal(struct {
    Type      string `json:"type"`
    RequestID string `json:"requestId"`
    Allowed   bool   `json:"allowed"`
  }{
    Type:      "permission_response",
    RequestID: probe.RequestID,
    Allowed:   allowed,
  })
  return reply, true  // Consumed this frame
}
```

### Permission Decision Logic: `permissionAllowed()` (ws.go:515-555)

1. **Explicit deny-list** (highest priority): if tool in `denyTools` → reject
2. **MCP tools** (strings.HasPrefix(toolName, "mcp__")) → allow
3. **Web tools** (WebFetch, WebSearch) → allow (egress proxy controls)
4. **Bash** → allow (local cwd isolation + sandbox assumption)
5. **File tools** (Read/Write/Edit/Glob/Grep) → parse path from input, validate it's within `sessionWorkDir`
6. **Default** → deny

### Key Architectural Properties

- **Frame-level granularity**: Interception happens on raw JSON, before agent sees the reply
- **Synchronous decision**: Backend makes decision, replies to agent immediately on same TCP stream
- **Opaque to agent**: Agent doesn't know backend auto-approved; it just sees `permission_response` on its WS as if frontend sent it
- **Metadata-driven**: Logic branches on tool name + input shape, not on agent internal state
- **Lockless**: Uses goroutine-local read/write mutexes (frontWriteMu, writeMu) to protect concurrent streams

---

## Part 4: MCP Resources Concept

**File**: `/Users/youngp/mypro/fuck_副本/scholar/agent/src/services/mcp/types.ts:229-256`

MCP (Model Context Protocol) servers can expose **resources** — read-only artifacts or data sources.

```typescript
export type ServerResource = Resource & { server: string }

export type ToolUseContext = {
  options: {
    mcpResources: Record<string, ServerResource[]>  // grouped by server name
    // ...
  }
}
```

Currently used for:
- **Preinstalled MCP servers**: `preinstalled-mcp.json` configures built-in servers (minicod)
- **List/Read operations**: Tools can enumerate and read MCP resources
- **Resource capability**: MCP spec allows servers to declare resources; agent can surface them

**Delivery potential**: An MCP server could expose `publish_artifact` or `web_resource` capability, declaring that it accepts deliverables. Agent would discover it via `ListMcpResourcesTool` or call a custom tool bound to that capability.

---

## Part 5: Four Delivery Signal Options

### Option A: Built-in "Publish" Tool (RECOMMENDED)

**Model**: Add a new tool to `agent/src/tools/PublishArtifactTool/` following the existing pattern.

**Registration** (`tools.ts`):
```typescript
import { PublishArtifactTool } from './tools/PublishArtifactTool/PublishArtifactTool.js'
```

**Tool definition**:
```typescript
{
  name: "PublishArtifact",
  description: "Deliver generated content to the web/user",
  input_schema: {
    type: "object",
    properties: {
      artifact_id: { type: "string", description: "Unique ID for this artifact" },
      title: { type: "string" },
      content_type: { enum: ["html", "markdown", "json", "pdf", "binary"] },
      content: { type: "string" },  // base64 if binary
      metadata: { 
        type: "object",
        additionalProperties: true,  // tags, source, version, etc.
      }
    },
    required: ["artifact_id", "title", "content"]
  }
}
```

**Execution flow**:
1. Agent calls: `{ "type": "tool_use", "toolName": "PublishArtifact", "toolUseId": "tu-X", "input": {...} }`
2. Agent emits: `{ "type": "content_start", "blockType": "tool_use", "toolName": "PublishArtifact", ... }`
3. Agent emits: `{ "type": "content_delta", "toolInput": "..." }` (streaming JSON)
4. Agent emits: `{ "type": "tool_use_complete", "toolName": "PublishArtifact", "input": {...} }`
5. Backend intercepts in `agent2front` loop or passes through to frontend
6. Agent executes tool: stores artifact, returns URL + metadata
7. Agent emits: `{ "type": "tool_result", "toolUseId": "tu-X", "content": {url, ...}, "isError": false }`

**Backend integration** (optional auto-delivery):
- If `decidePermission` sees `toolName == "PublishArtifact"`, can auto-approve or inject delivery hook
- Can extract artifact metadata and store in database before even sending to frontend

**Pros**:
- Fully agent-controlled (agent decides when to call)
- Integrated with existing tool permission model
- Clear visibility in tool use chain
- Easy to compose with other tools (e.g., "publish after editing")

**Cons**:
- Requires agent to know about the tool (needs system prompt hints)
- Tool execution is sequential (only after LLM decides to call it)

---

### Option B: MCP Resource-Based Delivery (MEDIUM)

**Model**: Pre-install an MCP server that exposes `publish_artifact` resource or tool.

**Config** (`preinstalled-mcp.json`):
```json
{
  "mcpServers": {
    "web-delivery": {
      "command": "node",
      "args": ["/app/mcp-servers/web-delivery.js"],
      "env": {
        "FEATURE_KEYS": "claw,prism",
        "BACKEND_URL": "http://backend:3000"
      }
    }
  }
}
```

**MCP server exposes**:
```typescript
// ListResourcesRequest → ["publish_artifact" resource type]
// CallToolRequest("publish_artifact") → executes publish
// Or: ReadResourceRequest → reads artifact metadata
```

**Agent discovery**: `ListMcpResourcesTool` or `ReadMcpResourceTool` can list/access it.

**Pros**:
- Decouples delivery from agent core tools
- Can be feature-gated or multi-tenant per MCP config
- Aligns with MCP ecosystem patterns

**Cons**:
- Requires running a separate process
- Adds observability/debugging complexity
- Agent must know about MCP resource patterns

---

### Option C: Structured Output Convention (LOW)

**Model**: Agent writes JSON to `tool_result` content, backend parses for delivery markers.

**Convention**:
```json
{
  "type": "tool_result",
  "toolUseId": "tu-X",
  "content": {
    "__delivery__": {
      "artifact_id": "...",
      "url": "...",
      "title": "..."
    },
    "primary_response": "Here is the artifact..."
  },
  "isError": false
}
```

**Backend extraction** (in `agent2front` loop, similar to permission_request):
```go
if f.spec.OnArtifactDelivery != nil {
  if artifact, ok := extractDeliveryMarker(data); ok {
    hook(hookCtx, userID, artifact)  // async
  }
}
```

**Pros**:
- No changes to tool infrastructure
- Can work with any tool (Write, Custom, etc.)
- Lightweight, agent self-documents via convention

**Cons**:
- Fragile (relies on agent following convention)
- No schema validation
- Hard to discover or standardize

---

### Option D: Tool-Use Interception (NOT RECOMMENDED)

**Model**: Backend intercepts any `tool_use_complete` frame with specific `toolName` (e.g., "Write" targeting certain paths).

**Example**:
```go
if toolUseComplete.ToolName == "Write" {
  if strings.HasPrefix(toolUseComplete.Input.Path, "/delivery/") {
    // This is a delivery artifact, intercept
    artifact := parseAsArtifact(toolUseComplete.Input)
    // ...
  }
}
```

**Pros**:
- Reuses existing tools (no new tool to define)

**Cons**:
- Tight coupling to tool names and path conventions
- Agent is not aware of delivery semantics (just writing files)
- Hard to standardize across features
- Brittle to agent refactoring

---

## Summary: Recommended Architecture

**Primary recommendation**: **Option A (Built-in Publish Tool)**

1. **Agent side**: Add `PublishArtifactTool` to tools.ts, gated by feature flag
2. **Tool definition**: Minimal, just `{artifact_id, title, content_type, content, metadata}`
3. **Execution**: Agent calls it when ready to deliver (after generation, editing, etc.)
4. **Backend integration**: 
   - Optional auto-approval in `decidePermission()` 
   - Optional delivery hook in `agent2front` loop (similar to `OnMessageComplete`)
   - Extract metadata and store in database before frontend
5. **Frontend**: Renders artifact metadata/link in message or artifact panel

**Fallback (Option C)**: For rapid prototyping, use structured JSON convention without tooling.

**Advanced (Option B)**: For multi-tenant or ecosystem-scale delivery, use MCP server model after Option A stabilizes.

---

## Appendix: Code File References

### Agent-Side Files
- `/Users/youngp/mypro/fuck_副本/scholar/agent/src/server/ws/events.ts` — ServerMessage & ClientMessage type defs (lines 43-81)
- `/Users/youngp/mypro/fuck_副本/scholar/agent/src/server/ws/handler.ts` — WS event routing, live turn buffering (lines 190-328)
- `/Users/youngp/mypro/fuck_副本/scholar/agent/src/tools.ts` — Tool registry (line 1-100+)
- `/Users/youngp/mypro/fuck_副本/scholar/agent/src/Tool.ts` — Tool type definitions & execution context (lines 1-250)
- `/Users/youngp/mypro/fuck_副本/scholar/agent/preinstalled-mcp.json` — MCP server config (lines 1-13)

### Backend-Side Files
- `/Users/youngp/mypro/fuck_副本/scholar/backend/internal/agentbridge/ws.go` — Permission interception & decision logic (lines 361-507)

### API Documentation
- `/Users/youngp/mypro/fuck_副本/scholar/agent/docs/api.md` — REST/WS protocol (lines 263-318 for WS event flow)

---

## Key Insights

1. **The permission_request → permission_response pattern is the production template**: It shows exactly where to hook mid-stream decisions without blocking tool execution or agent logic.

2. **Tool registration is fully dynamic**: New tools can be added by importing in `tools.ts`, no centralized registry needed. This makes Option A straightforward.

3. **Backend can act transparently**: Via `agent2front` goroutine, the backend can intercept, log, store, or transform artifact metadata before it reaches the frontend — all without the agent knowing.

4. **MCP is an option but not required**: The codebase already has `mcpResources` and `ListMcpResourcesTool`, but delivery can work without it via a built-in tool.

5. **Features are already gated**: The tools.ts uses `feature()` flags extensively; delivery tool can be `feature('CLAW')` gated.



## Key Patterns

### ServerMessage Protocol
WS protocol defines 19 ServerMessage types (connected, status, content_start, content_delta, tool_use_complete, tool_result, permission_request, message_complete, thinking, error, system_notification, pong, session_title_updated, task_update, team_*, computer_use_*, resync_*). Agent emits these during turn execution. Frontend consumes them to render chat/tool UI. Each type carries specific metadata (tool names, token usage, error codes) that backend can intercept or parse.

- **How the agent is made aware:** Defined in agent/src/server/ws/events.ts ServerMessage union type. Handler.ts routes incoming ClientMessage and forwards ServerMessage via sendMessage() or sendToSession(). API documentation in agent/docs/api.md lists typical flow.
- **Source:** agent/src/server/ws/events.ts:43-81; agent/docs/api.md:263-318

### Backend Mid-Stream Interception (permission_request → permission_response)
Backend reads frames from agent WS in agent2front goroutine (ws.go:362). For each TextMessage, checks if frame is permission_request JSON. If yes, calls decidePermission(). This function parses tool name + input, makes allow/deny decision, marshals permission_response JSON, and writes it back to agent TCP stream. Agent receives response as if frontend sent it. Entire operation is synchronous, lock-protected, and transparent to agent logic.

- **How the agent is made aware:** Agent side doesn't know backend intercepted. Frontend may be configured to auto-approve, frontend may not be listening. Backend decision is made on tool name + path validation. Backend can also extract metadata (OnMessageComplete hook) from message_complete frames asynchronously.
- **Source:** backend/internal/agentbridge/ws.go:361-507 (decidePermission), ws.go:515-555 (permissionAllowed)

### Tool Registry Pattern (Dynamic Imports + Feature Gates)
All tools register in agent/src/tools.ts via static or lazy require() imports, with optional feature gates (feature('KAIROS')). Each tool is a class exporting name, description, input schema, and async execute() handler. Tools are collected into a Tools map. When sending to Claude API, tools array is serialized as ToolUseBlockParam[]. New tools can be added by creating folder in agent/src/tools/, exporting the class, and importing in tools.ts. No centralized registry or bootstrap file needed.

- **How the agent is made aware:** tools.ts imports define which tools are available. When agent starts, ToolUseContext.options.tools has the map. Agent passes tools[] to Anthropic API. API responds with tool_use blocks; agent routes to matching handler via tools map.
- **Source:** agent/src/tools.ts:1-100 (imports and feature gates); agent/src/Tool.ts:157-178 (ToolUseContext.options.tools)

### Live Turn Buffering & Reconnection Resync
Handler.ts maintains liveTurnBuffers (Map<sessionId, ServerMessage[]>) and liveTurnUserText. As agent emits messages during a turn, forwarding callback pushes REPLAYABLE_TYPES to buffer. If client disconnects, CLI subprocess continues running; buffer accumulates. On reconnect, resyncSessionOutput() replays entire buffer (resync_start → resync_user → buffered messages → resync_end) letting frontend rebuild turn from scratch. This ensures delivery content isn't lost even if user closes browser mid-generation.

- **How the agent is made aware:** Agent doesn't directly know. Backend maintains state. If delivery signal is a ServerMessage type (e.g., artifact_published event), it must be in REPLAYABLE_TYPES (line 160) to survive reconnect.
- **Source:** agent/src/server/ws/handler.ts:124-169 (liveTurnBuffers setup); handler.ts:160 (REPLAYABLE_TYPES)

### MCP Resource Layer
MCP (Model Context Protocol) servers are configured in preinstalled-mcp.json or user settings. Each server can declare resources (read-only artifacts). Agent accesses them via ListMcpResourcesTool or ReadMcpResourceTool. ToolUseContext carries mcpResources: Record<string, ServerResource[]> grouped by server name. Tools can compose with MCP capabilities (e.g., call an MCP server to publish, then reference the resource).

- **How the agent is made aware:** Agent discovers MCP resources via ListMcpResourcesTool. Can read them via ReadMcpResourceTool. If MCP server exposes 'publish_artifact' capability, agent can list and potentially call it. MCP is optional; it's one layer above built-in tools.
- **Source:** agent/src/services/mcp/types.ts:229-256 (ServerResource); agent/preinstalled-mcp.json (config); agent/src/tools/ListMcpResourcesTool/

### Session-Isolated Workdir & Workspace Access Control
Each session gets isolated cwd at /home/bun/sessions/<sessionId>. Backend's decidePermission() validates all file tool paths against sessionWorkDir. Relative paths are safe (relative to cwd). Absolute paths must be within workdir tree or denied. This prevents agent (or compromised prompt injection) from reading other sessions' data or system files. Bash is allowed for local tools but relies on sandbox (bubblewrap/gVisor) for production hardening.

- **How the agent is made aware:** Agent sees its cwd as $PWD=/home/bun/sessions/<sessionId>. Relative file paths work. Absolute paths outside this tree trigger permission_request → backend denies. Agent can't escape; it's an enforcement seam.
- **Source:** backend/internal/agentbridge/ws.go:32-39 (sessionWorkDir), ws.go:577-590 (pathWithin validation)


## Relevance to Claw (web-delivery design)

To make the claw agent self-understand that it's delivering web content, not just manipulating local files:

1. **Add PublishArtifact tool** (Option A recommended): Register a built-in tool in agent/src/tools/ that claw's system prompt instructs it to call when ready to deliver. This makes delivery an explicit, visible action in the turn log.

2. **Backend delivery hook**: In agentbridge/ws.go's agent2front loop, add logic to intercept PublishArtifact tool_use_complete frames, extract artifact metadata, and store in database before forwarding to frontend. This mirrors the existing OnMessageComplete hook pattern.

3. **System prompt guidance**: Claw's system prompt should explicitly tell the agent: "Your final outputs (reports, documents, analyses) are delivered to the user via PublishArtifact tool. Local files are drafts/intermediate. When you have a final deliverable, call PublishArtifact with the content."

4. **Frontend artifact panel**: Display PublishArtifact calls prominently (alongside or instead of tool_result noise), making it clear to user that agent is consciously delivering, not just running tools.

5. **Metrics/logging**: Backend can track PublishArtifact calls per session to measure "delivery completion rate" for analytics.

This approach shifts the semantic model from "agent writes files, backend extracts them" to "agent explicitly publishes, backend coordinates delivery" — enabling the agent to reason about delivery as a first-class concept in its behavior.


## Sources Consulted

- agent/src/server/ws/events.ts
- agent/src/server/ws/handler.ts
- agent/src/tools.ts
- agent/src/Tool.ts
- agent/docs/api.md
- agent/preinstalled-mcp.json
- agent/src/services/mcp/types.ts
- backend/internal/agentbridge/ws.go
