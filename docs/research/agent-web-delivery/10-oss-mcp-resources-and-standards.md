# Standards for Agent→User Artifact/Resource Handoff: MCP, Claude Agent/Managed Agents, AG-UI, and the Vercel AI SDK

> **Category:** external

## Summary

There is no single dominant "the agent published a file, render it for the user" standard yet; the space splits into three layers with distinct ownership. (1) MCP standardizes content-addressing: a server exposes addressable content as **resources** (URI + mimeType + text/blob), and **tool results** can either embed a resource inline (`type:"resource"`) or hand back a pointer (`type:"resource_link"`) — this is the cleanest "agent publishes a generated artifact, client renders it" primitive, and resources are explicitly "application-driven" (meant for the host UI, not just the model). (2) The agent→browser streaming layer (Vercel AI SDK 5/6, AG-UI) standardizes how typed tool outputs / data parts / file parts stream over SSE and map to rich UI components client-side. (3) Anthropic's own stack has NO first-class "artifact" type in the Claude Agent SDK (files are just `tool_result` content blocks + a `SDKFilesPersistedEvent` confirmation), but **Claude Managed Agents** does define a concrete convention: anything written to `/mnt/session/outputs/` is persisted and retrievable via the Files API with `scope_id=<session_id>`. For Scholar's claw agent, the recommendation is to model artifacts as MCP-style resources (stable URI + mimeType + audience annotation) and stream them to the SPA as Vercel-AI-SDK-shaped `file`/`data-artifact` parts, rather than inventing a bespoke envelope.

---

## Scope

Research on emerging standards for an agent handing a generated artifact (a file / rich output) to a user-facing app, centered on the Model Context Protocol (MCP), and cross-checked against the Claude Agent SDK, Claude Managed Agents, the AG-UI protocol, and the Vercel AI SDK. All field names and JSON shapes below are quoted from primary sources (linked).

The key conceptual split: **two different "handoffs" are being conflated** in most discussions, and the standards bodies actually separate them.

- **Handoff A — content addressing / referencing** ("here is an addressable thing the agent produced or can produce"): this is what MCP **resources** + **resource_link / embedded resource** tool results are for.
- **Handoff B — transport + rendering** ("stream that thing to a browser and turn it into a UI component"): this is what the Vercel AI SDK stream protocol and AG-UI events are for.

A robust delivery mechanism needs both, and they compose: MCP describes *what* the artifact is; AG-UI / Vercel AI SDK describe *how it reaches and renders in the SPA*.

---

## 1. MCP `resources` — the addressable-content primitive

Source: [MCP Resources spec, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)

### How a server exposes addressable content

A resource is **uniquely identified by a URI** (RFC 3986). The server advertises a `resources` capability, optionally with `subscribe` and `listChanged`:

```json
{ "capabilities": { "resources": { "subscribe": true, "listChanged": true } } }
```

Discovery + read methods:
- `resources/list` → array of `Resource` descriptors (paginated)
- `resources/templates/list` → parameterized resources via **RFC 6570 URI templates** (e.g. `"uriTemplate": "file:///{path}"`)
- `resources/read` (params: `{ "uri": "..." }`) → `result.contents[]`
- `resources/subscribe` + `notifications/resources/updated` (per-resource change push)
- `notifications/resources/list_changed` (catalog change push)

### The `Resource` descriptor shape

```
uri          // unique identifier (REQUIRED)
name         // machine name
title        // optional human-readable display name
description  // optional
mimeType     // optional
size         // optional, bytes
annotations  // optional (audience / priority / lastModified)
```

### Resource contents — text vs binary

`resources/read` returns `contents[]` where each entry is either:

```json
{ "uri": "file:///example.txt", "mimeType": "text/plain", "text": "Resource content" }
```
or (binary):
```json
{ "uri": "file:///example.png", "mimeType": "image/png", "blob": "base64-encoded-data" }
```

So an artifact is always: **URI + mimeType + (text | base64 blob)** — exactly the envelope you need for "a generated file."

### Standard URI schemes

`https://` (client SHOULD fetch directly only if it can load it itself), `file://` (filesystem-like, need not be a real FS), `git://`, plus **custom schemes are explicitly allowed** (RFC 3986). This matters for Scholar: you can mint a custom scheme like `claw://artifact/<id>` and have the host resolve it through your own backend.

### Annotations — the rendering/routing hints

Resources, resource templates, **and tool-result content blocks** all support the same annotation block:
- `audience`: array of `"user"` / `"assistant"` — i.e., *is this artifact for the human to see, the model to read, or both*
- `priority`: 0.0–1.0
- `lastModified`: ISO-8601

`audience: ["user"]` is the closest thing in any standard to "this is a deliverable for the end user, render it."

### "Application-driven" — resources are for the host UI

> "Resources in MCP are designed to be **application-driven**, with host applications determining how to incorporate context based on their needs." — [resources spec, §User Interaction Model](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)

The spec contrasts the three primitives by who controls them: **resources = application-controlled**, **tools = model-controlled**, **prompts = user-controlled** ([prompts spec](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)). Resources are explicitly the primitive whose consumer is the host app (which may render them in a tree/picker, or attach to context). This is a strong signal that "agent publishes a generated file as a resource" is an intended use.

### 2025-11-25 addition relevant to rendering

[Changelog 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog): **SEP-973** added **`icons` metadata for tools, resources, resource templates, and prompts** — i.e. the spec is actively adding *display* metadata to resources, reinforcing that resources are a UI-facing primitive. Also added: experimental **Tasks** (SEP-1686, "call-now, fetch-later" durable requests with polling) — useful when artifact generation is long-running; and JSON Schema 2020-12 as the default dialect (SEP-1613).

### Verdict for question 1

**Yes — MCP resources are a clean fit for "agent publishes a generated file as a resource."** The artifact maps to a `Resource` (stable URI, mimeType, size, `audience:["user"]` annotation), the bytes come back from `resources/read` as `text` or `blob`, change-push is built in (`resources/updated`), and the primitive is defined as application-/UI-facing. The only gap is that MCP itself says nothing about *how the host renders it* — that is Handoff B.

---

## 2. MCP tool results that embed/link resources

Source: [MCP Tools spec, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

A `tools/call` returns `CallToolResult`: `{ content: [...], structuredContent?: {...}, isError: bool }`. The `content[]` array is a polymorphic list. The two artifact-relevant block types:

### Resource link (a pointer the client can fetch/subscribe)

```json
{
  "type": "resource_link",
  "uri": "file:///project/src/main.rs",
  "name": "main.rs",
  "description": "Primary application entry point",
  "mimeType": "text/x-rust",
  "annotations": { "audience": ["assistant"], "priority": 0.9 }
}
```
> "A tool MAY return links to Resources... the tool will return a URI that can be subscribed to or fetched by the client." Note: resource links returned by tools are **not guaranteed** to appear in `resources/list`.

### Embedded resource (bytes inline)

```json
{
  "type": "resource",
  "resource": {
    "uri": "file:///project/src/main.rs",
    "mimeType": "text/x-rust",
    "text": "fn main() {...}",
    "annotations": { "audience": ["user","assistant"], "priority": 0.7, "lastModified": "2025-05-03T14:30:00Z" }
  }
}
```

**Design rule from the ecosystem:** prefer `resource_link` when content is large or reused (let the client fetch/cache once); embed only small/one-shot content ([Wix Engineering, "MCP Resources: all you need to know"](https://medium.com/wix-engineering/mcp-resources-all-you-need-to-know-34435249a451)). This is exactly the large-PDF / generated-report tradeoff Scholar faces.

Tool results also support `structuredContent` (validated against the tool's optional `outputSchema`); for backward-compat a tool returning structured content SHOULD also serialize it into a `text` block.

**Important nuance:** tool results are primarily fed back to the *model* (tools are model-controlled). The `audience` annotation is the mechanism that says "this particular block is actually for the user, render it." So the standards-aligned pattern is: tool returns a `resource_link` (or embedded `resource`) with `annotations.audience: ["user"]`, and the host UI renders any user-audience resource block.

MCP prompts can *also* carry embedded resources (a `PromptMessage.content` of `type:"resource"`), but prompts are user-invoked templates, not an artifact-out channel — not relevant to delivery ([prompts spec](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)).

---

## 3. Vercel AI SDK (5/6) — the agent→browser streaming + render convention

Sources: [AI SDK 5 announcement](https://vercel.com/blog/ai-sdk-5), [Streaming Custom Data](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data), [Generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces), [Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol), [UIMessage reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message)

This is the de-facto JS/TS standard for Handoff B (rendering arbitrary agent output in a web chat).

### Transport
AI SDK 5 standardized on **Server-Sent Events (SSE)** as the stream protocol (native browser support, debuggable). The client `useChat` hook reconstructs a `UIMessage` whose `parts[]` array is "the source of truth for application state."

### `UIMessage.parts[]` part types (the render surface)
- `text`
- `reasoning`
- **`file`** — a first-class file part: `{ type: 'file', filename, mediaType, url }`. In v5, file parts use `.url` (often a `data:` URL) and `mediaType` (renamed from `mimeType`). This is the closest thing to a native "attachment/artifact" message part in the web layer.
- `source-url` / `source-document` — RAG citations
- **`tool-${toolName}`** — typed tool-call parts
- **`data-${name}`** — typed custom data parts
- `dynamic-tool` — generic part for runtime-unknown tools (e.g. MCP tools whose names aren't known at build time)

### Data parts — stream arbitrary typed data, render as component
Server writes via a UI message stream writer; reconciliation is by `id` (write same id again to update in place):
```ts
writer.write({ type: 'data-weather', id: 'weather-1', data: { city: 'SF', status: 'loading' } });
// later, same id → updates in place
```
Client filters `message.parts` for `data-weather` and renders. **Transient** data parts (status/progress) are delivered only via the `onData` callback and are *not* persisted to message history.

### Tool parts — generative UI with a state machine
A `tool-${toolName}` part carries a `state`: `input-streaming` → `input-available` → `output-available` (or `output-error` with `errorText`). The render pattern spreads the tool's structured output straight into a React component:
```tsx
if (part.type === 'tool-displayWeather') {
  switch (part.state) {
    case 'input-available': return <Loading/>;
    case 'output-available': return <Weather {...part.output} />;
    case 'output-error':     return <Err msg={part.errorText}/>;
  }
}
```

### Takeaway for question 2
Arbitrary tool outputs / data become rich UI via **typed parts** (`tool-*`, `data-*`, `file`) streamed over SSE, with `id`-based reconciliation for progressive updates and a `state` enum for tool lifecycle. There is no separate "artifact protocol" — an artifact is just a `file` part or a `data-artifact` part. This is the most directly reusable convention for a custom web chat.

---

## 4. AG-UI — the framework-agnostic agent↔UI event protocol

Sources: [AG-UI introduction](https://docs.ag-ui.com/introduction), [Events reference](https://docs.ag-ui.com/sdk/js/core/events), [CopilotKit: 17 event types](https://www.copilotkit.ai/blog/master-the-17-ag-ui-event-types-for-building-agents-the-right-way), [GitHub ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui)

AG-UI is an open, lightweight, **event-based** protocol over HTTP/SSE/WebSockets standardizing agent↔frontend comms. ~16–25 event types across five categories:

- **Lifecycle:** `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`, `STEP_STARTED`, `STEP_FINISHED`
- **Text:** `TEXT_MESSAGE_START` / `_CONTENT` / `_END`
- **Tool calls:** `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT` (`{ messageId, toolCallId, content, role? }`)
- **State:** `STATE_SNAPSHOT` (`{ snapshot }`), `STATE_DELTA` (`{ delta: JSON-Patch[] }`, RFC 6902), `MESSAGES_SNAPSHOT`
- **Special:** `RAW`, `CUSTOM` (`{ name, value }`)

### Artifacts in AG-UI
**There is no dedicated artifact/file event type.** Per the events reference, artifact delivery is done via:
- `STATE_SNAPSHOT` / `STATE_DELTA` — shared, event-sourced state the UI mirrors (good for a live-updating artifact like a document being edited),
- `TOOL_CALL_RESULT` — tool-produced content,
- `CUSTOM` — escape hatch for app-specific artifact payloads.

AG-UI does support **generative UI** ("agents propose component trees / constraints, app validates and mounts") and "backend tool rendering" — but artifact *typing* is left to the application. **(Inference)** AG-UI's `STATE_*` model is a better fit than chat-message parts when the artifact is a single evolving document (the agent emits JSON-Patch deltas; the UI re-renders), whereas Vercel's parts model fits append-only chat attachments better.

---

## 5. Claude Agent SDK & Claude Managed Agents — Anthropic's own artifact story

### Claude Agent SDK: NO first-class artifacts
Source: [Agent SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)

The SDK surfaces a `SDKMessage` union. Relevant members:
- `SDKAssistantMessage` → `message: BetaMessage` whose `content[]` is standard Anthropic content blocks: `{type:"text"}`, `{type:"tool_use", id, name, input}`, `{type:"tool_result", tool_use_id, content[]}`.
- `SDKResultMessage` (`type:"result"`) → final result with `result: string`, `structured_output?: unknown`, `usage`, `total_cost_usd`, `terminal_reason`, etc.
- `SDKPartialAssistantMessage`, `SDKToolProgressMessage` (tool progress), and notably **`SDKFilesPersistedEvent`** — "File write confirmations."

> "**No First-Class Artifacts** — Unlike some interfaces, the SDK doesn't have a dedicated 'artifacts' concept. File outputs and generated content are surfaced through: (1) Tool Results... `tool_result` content blocks, (2) Structured Output via `structured_output`, (3) File Operations tracked via `SDKFilesPersistedEvent`."

And: MCP tool resource_links / embedded resources are "represented as standard content blocks returned by MCP tools. The SDK does not have special artifact handling — resources are embedded as content blocks within tool results." So in the Agent SDK, an artifact = a `tool_result` content block (which can itself be an MCP `resource`/`resource_link`), plus an out-of-band `SDKFilesPersistedEvent` telling the host a file was written to the working directory.

### Claude Managed Agents: a concrete artifact convention
Sources: [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview), [Data analyst cookbook](https://platform.claude.com/cookbook/managed-agents-data-analyst-agent)

This is the **most concrete file-handoff convention in the Anthropic ecosystem**:

> "Anything the agent writes to `/mnt/session/outputs/` is persisted and surfaced via the **Files API** with `scope_id=<session_id>`. Files written elsewhere in the container are not persisted."

Retrieval pattern (Python):
```python
outputs = client.beta.files.list(scope_id=session.id, betas=["managed-agents-2026-04-01"])
for f in outputs.data:        # each f: { filename, size_bytes, id, ... }
    print(f.filename, f.size_bytes)
report = next(f for f in outputs.data if f.filename == "report.html")
content = client.beta.files.download(report.id)   # byte stream
```

**Notable gap:** the event stream does **not** emit a structured "file created" event — you poll the Files API after `session.status_idle` (the agent may also narrate "Saved: report.html" in `agent.message` text). So even Anthropic's most artifact-aware product uses an **out-of-band catalog (Files API scoped by session) + polling**, not an inline message part. This validates the "addressable resource + list/fetch" model over "stuff the bytes in the chat stream."

---

## 6. Which standard should a delivery mechanism align to?

There is no one standard that covers both halves, so align to **two complementary ones** and avoid a bespoke envelope:

1. **Model the artifact as an MCP resource (Handoff A).** Give every generated deliverable a stable URI (custom scheme is fine, e.g. `claw://artifact/<id>`), `mimeType`, `size`, and `annotations.audience:["user"]` + `lastModified`. Where the agent produces it inside a tool, return a **`resource_link`** in the tool result for anything large/reused, and an embedded **`resource`** only for small inline output. This is the closest thing to a cross-vendor standard for "addressable agent output," it's what Anthropic/Google/OpenAI are all converging on, and `resources/read` + `resources/updated` give you fetch + change-push for free. **(Inference, well-supported):** resources are the right *semantic* home for artifacts even if you don't run a full MCP server — you can mirror the shape.

2. **Stream + render using the Vercel AI SDK part convention (Handoff B), or AG-UI if you want framework-agnostic.** Deliver to the SPA as a typed part over SSE: a `file` part (`{type:'file', filename, mediaType, url}`) for downloadable artifacts, or a `data-artifact` part (reconciled by `id`) for live/structured artifacts that the client maps to a custom React renderer by mimeType. This is already the dominant JS/TS web-chat convention and is what your shared `shared/components/chat` stack should speak. If you ever need to interop with non-React frontends or multiple agent backends, AG-UI's `STATE_SNAPSHOT`/`STATE_DELTA` + `CUSTOM` events are the framework-neutral equivalent (use `STATE_*` for an evolving single document; `CUSTOM`/tool-result for append-only deliverables).

**What NOT to do:** don't invent a one-off `{kind:"artifact", blob:...}` envelope embedded ad-hoc in your WS stream. Both the MCP resource shape (uri/mimeType/text|blob/annotations) and the Vercel `file`/`data-*` part shape are stable, documented, and already understood by tooling and by future you. Reuse the field names.

**(Inference)** Given Scholar already proxies a `scholar_agent` (cc-haha) container over a WS pipe and treats the agent as a black box, the Managed-Agents pattern is the most directly analogous precedent: a **session-scoped artifact catalog** (the backend lists/serves files the agent wrote to a known output dir) + a **typed part** announced over the existing WS to tell the SPA "artifact ready, here's its URI/mimeType." That gives you MCP-resource semantics on the data and Vercel-part semantics on the wire without adopting either SDK wholesale.

## Key Patterns

### MCP resource = URI + mimeType + (text|blob) + annotations
An artifact is exposed as an addressable Resource: unique URI, optional name/title/description/mimeType/size, and contents returned by resources/read as either {uri,mimeType,text} or {uri,mimeType,blob:base64}. Change push via notifications/resources/updated (subscribe) and notifications/resources/list_changed.

- **How the agent is made aware:** Server declares the 'resources' capability in the MCP handshake; the client/host (not the model) discovers via resources/list and reads via resources/read. Resources are 'application-driven' — the host UI decides how to render/attach them.
- **Source:** https://modelcontextprotocol.io/specification/2025-06-18/server/resources

### Tool result resource_link vs embedded resource
A tool's CallToolResult.content[] can include {type:'resource_link', uri, name, mimeType, annotations} (a fetchable/subscribable pointer; not guaranteed in resources/list) or {type:'resource', resource:{uri,mimeType,text|blob,annotations}} (bytes inline). Convention: link for large/reused content, embed for small one-shot.

- **How the agent is made aware:** Tools are model-controlled; the model invokes tools/call and the server returns these content blocks. The host renders blocks whose annotations.audience includes 'user'.
- **Source:** https://modelcontextprotocol.io/specification/2025-06-18/server/tools

### audience annotation routes a content block to user vs model
Resources, resource templates, and tool/prompt content blocks all carry annotations {audience:['user'|'assistant'], priority:0..1, lastModified:ISO8601}. audience:['user'] is the standard signal that a block is a deliverable to render for the human rather than context for the model.

- **How the agent is made aware:** Server/agent sets annotations on emitted content; client reads them to filter, prioritize, sort, and decide rendering.
- **Source:** https://modelcontextprotocol.io/specification/2025-06-18/server/resources

### Vercel AI SDK typed message parts (file / data-* / tool-*) over SSE
UIMessage.parts[] is the render source-of-truth. Part types: text, reasoning, file ({type:'file',filename,mediaType,url}), source-url, tool-${name} (state: input-streaming→input-available→output-available/output-error), data-${name} (reconciled by id; transient variant only via onData), dynamic-tool for MCP tools. Client maps each part type to a React component.

- **How the agent is made aware:** Server emits parts via a UI message stream writer (writer.write({type,id,data})); SSE transport; client useChat reconstructs parts[] and switches on part.type/part.state.
- **Source:** https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data

### AG-UI STATE_SNAPSHOT/STATE_DELTA (JSON Patch) + CUSTOM for artifacts
Event-based protocol over SSE/WS. No dedicated artifact event; artifacts ride on STATE_SNAPSHOT {snapshot}, STATE_DELTA {delta: RFC6902 JSON-Patch[]} (shared evolving state the UI mirrors), TOOL_CALL_RESULT {messageId,toolCallId,content}, or CUSTOM {name,value}. ~17 event types in 5 categories (lifecycle/text/tool/state/special).

- **How the agent is made aware:** Agent backend emits typed events; frontend SDK applies STATE_DELTA patches to a mirrored state object and re-renders. CUSTOM is the documented escape hatch.
- **Source:** https://docs.ag-ui.com/sdk/js/core/events

### Claude Managed Agents: /mnt/session/outputs/ → Files API scope_id=session
Files the agent writes to /mnt/session/outputs/ are persisted and surfaced via the Files API filtered by scope_id=<session_id>. Host lists with client.beta.files.list(scope_id=session.id) (objects have filename, size_bytes, id) and downloads with client.beta.files.download(file.id). No structured 'file created' event — host polls after session goes idle.

- **How the agent is made aware:** Convention is enforced by the managed harness (only that dir persists). The agent is told via system prompt/skill to write deliverables there; the host learns of them by querying the Files API out-of-band.
- **Source:** https://platform.claude.com/cookbook/managed-agents-data-analyst-agent

### Claude Agent SDK has no first-class artifact; files = tool_result blocks + SDKFilesPersistedEvent
SDKMessage union surfaces outputs as standard Anthropic content blocks (text/tool_use/tool_result) inside SDKAssistantMessage.message.content, plus structured_output on SDKResultMessage, plus an out-of-band SDKFilesPersistedEvent confirming file writes. MCP resource_link/embedded resource results appear as ordinary tool_result content blocks with no special handling.

- **How the agent is made aware:** Host iterates the SDKMessage stream; there is no artifact type to opt into — it must interpret tool_result blocks and SDKFilesPersistedEvent itself.
- **Source:** https://code.claude.com/docs/en/agent-sdk/typescript

### MCP 2025-11-25 icons + Tasks for artifact display & long-running generation
SEP-973 adds 'icons' display metadata to tools/resources/resource templates/prompts (resources are UI-facing). SEP-1686 adds experimental Tasks: any request can become 'call-now, fetch-later' with polling + deferred result retrieval — useful when artifact generation is slow. JSON Schema 2020-12 is now the default dialect (SEP-1613).

- **How the agent is made aware:** Negotiated via capabilities/spec revision; server attaches icons metadata and may return a task handle the client polls.
- **Source:** https://modelcontextprotocol.io/specification/2025-11-25/changelog


## Relevance to Claw (web-delivery design)

Scholar's claw agent runs as a black-box scholar_agent (cc-haha) container piped over a WS bridge (agentbridge), with file uploads already handled by pushing originals to the agent's session-isolated cwd. For the reverse direction (agent→user artifact handoff), the research points to a concrete, non-bespoke design that mirrors what Anthropic's own Managed Agents does: (1) Establish a session-scoped output convention — have the agent write deliverables to a known dir in its isolated cwd (the exact analogue of /mnt/session/outputs/), and have the backend expose a session-scoped artifact catalog (list + download) keyed by the agent_sessions mapping you already maintain (owner_kind/owner_id + feature_key). (2) Model each artifact with MCP-resource field names — stable URI (e.g. claw://artifact/<sessionId>/<name> or a backend /api/.../artifacts/<id> URL), mimeType, size, lastModified, and audience:['user'] — so the shape is documented/standard rather than invented. (3) Announce artifacts to the SPA over the existing WS using Vercel-AI-SDK part shapes: emit a 'file' part ({type:'file',filename,mediaType,url}) for downloadable deliverables, or a 'data-artifact' part (reconciled by id) for live/structured ones, which your shared/components/chat + shared/lib/agent-stream can fold into a renderer keyed by mimeType — fitting the existing typed-part rendering already used for tool_result/permission events. This keeps delivery aligned with two real standards (MCP resource semantics on the data, Vercel/AG-UI part/event semantics on the wire) and avoids a one-off envelope. Two caveats surfaced by the research that apply directly: even Anthropic emits NO structured 'file ready' event (they poll), so claw should add an explicit artifact-ready frame to its WS rather than forcing the SPA to poll; and large artifacts should be delivered as a fetchable link (resource_link pattern / backend URL), not base64-embedded in the WS stream, matching the MCP large-vs-small guidance and avoiding bloating the agent transcript/jsonl.

## Sources Consulted

- https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
- https://modelcontextprotocol.io/specification/2025-11-25/changelog
- https://modelcontextprotocol.io/docs/concepts/resources
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://platform.claude.com/docs/en/managed-agents/overview
- https://platform.claude.com/cookbook/managed-agents-data-analyst-agent
- https://platform.claude.com/docs/en/agent-sdk/hosting
- https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data
- https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces
- https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message
- https://vercel.com/blog/ai-sdk-5
- https://docs.ag-ui.com/introduction
- https://docs.ag-ui.com/sdk/js/core/events
- https://www.copilotkit.ai/blog/master-the-17-ag-ui-event-types-for-building-agents-the-right-way
- https://github.com/ag-ui-protocol/ag-ui
- https://medium.com/wix-engineering/mcp-resources-all-you-need-to-know-34435249a451
- https://workos.com/blog/mcp-2025-11-25-spec-update
