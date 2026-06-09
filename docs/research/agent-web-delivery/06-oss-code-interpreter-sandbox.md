# Surfacing Sandbox-Generated Files to Web Users: The Code Interpreter Pattern (OpenAI, E2B, Daytona, Jupyter Runners)

> **Category:** external

## Summary

Across OpenAI Code Interpreter (Assistants + Responses APIs), E2B, Daytona, and Jupyter-kernel agent runners (AutoGen, Qwen-Agent), the same three-stage pattern recurs for getting files out of an ephemeral sandbox: (1) the model writes files into a known output directory (canonically /mnt/data on OpenAI, /home/user on E2B, the sandbox home on Daytona); (2) files reach the user via one of two channels — inline rich results captured from the Jupyter kernel's display protocol (base64 PNG, returned automatically), or out-of-band file references the platform resolves by either parsing model-emitted annotations (file_path / container_file_citation) OR by directly listing the output directory and downloading every file; (3) the platform turns these into download links / inline previews and (crucially) persists them off-box because the container is ephemeral (OpenAI containers expire after 20 min idle; ChatGPT sessions ~60 min). The model is told where to save files via a one-line system-prompt convention ("The drive at '/mnt/data' can be used to save and persist user files"), but practitioners found annotation-based surfacing unreliable and converged on directly listing the container's file directory as the robust contract. Our claw agent already implements the per-file read half (GetWorkspaceFile by known path) but is missing the "list output dir" half — adding a workspace directory-listing endpoint would let us adopt the same list-then-present contract without relying on the model to announce filenames.

---

## Surfacing Sandbox-Generated Files to Web Users — the "Code Interpreter / sandbox" pattern

This report documents how five families of systems surface files that an agent generates inside an **ephemeral** sandbox to a web user, with primary-source citations. It then maps the convergent contract onto our `claw` agent.

---

## 0. The convergent 3-stage flow (TL;DR)

Every system below implements some variant of:

```
[1] Agent/model runs code in sandbox
       └─ writes files into a KNOWN output dir
              OpenAI:  /mnt/data         (Assistants) → container fs (Responses)
              E2B:     /home/user        (default cwd)
              Daytona: sandbox home (/home/<user>/...)
              Jupyter: output_dir / cwd

[2] Files surface to the platform via TWO channels:
    (a) INLINE rich results — captured from the Jupyter kernel display
        protocol (image/png etc.) and returned automatically as base64.
        (matplotlib plots; no model action needed)
    (b) OUT-OF-BAND file references — resolved one of two ways:
        (b1) parse model-emitted ANNOTATIONS in the message
             (file_path.file_id  /  container_file_citation)
        (b2) IGNORE the model and LIST THE OUTPUT DIR directly,
             then download every entry  ← what practitioners converged on

[3] Platform → web user:
    - download links (Files API / signed URL / proxied bytes)
    - inline previews (decode base64 PNG → <img>)
    - PERSIST off-box: container is EPHEMERAL (auto-expiry)
```

The interesting tension: OpenAI's *documented* path is annotation-based (b1), but the *robust* path the community settled on is directory-listing (b2). E2B/Daytona only ever offered (b2)-style explicit list+download plus (a) inline results. That convergence is the directly-adoptable contract (see §4).

---

## 1. How each system does it, concretely

### 1.1 OpenAI — Code Interpreter (two API generations)

**Assistants API (older).** The model creates files during Python execution; it cites them in the next message's `annotations`. Two annotation/content shapes:

Generated *data* files → `file_path` annotation embedded in the assistant text:
```json
{
  "type": "file_path",
  "text": "sandbox:/mnt/data/shuffled_file.csv",
  "start_index": 167,
  "end_index": 202,
  "file_path": { "file_id": "file-abc123" }
}
```
Generated *images* → an `image_file` content block (not a text annotation):
```json
{ "type": "image_file", "image_file": { "file_id": "file-abc123" } }
```
Download via the Files API using `file_id`:
```bash
curl https://api.openai.com/v1/files/file-abc123/content \
  -H "Authorization: Bearer $OPENAI_API_KEY" --output image.png
# or: client.files.content("file-abc123")
```
Source: https://developers.openai.com/api/docs/assistants/tools/code-interpreter — "When [Code Interpreter] references a file path … it appears as an annotation … The key field is `file_path.file_id`."

**Responses API (current).** Files live in a *container*; the model cites them with a new annotation type `container_file_citation`:
```json
{
  "type": "container_file_citation",
  "file_id":      "cfile_682d514b2e00819184b9b07e13557f82",
  "container_id": "cntr_682d513bb0c48191b10bd4f8b0b3312200e64562acc2e0af",
  "filename":     "cfile_682d514b2e00819184b9b07e13557f82.png"
}
```
Download endpoint:
```
GET /v1/containers/{container_id}/files/{file_id}/content
```
Docs explicitly state the container is ephemeral and you must persist outputs yourself:
> "We highly recommend you treat containers as ephemeral and store all data related to the use of this tool on your own systems."
> "A container expires if it is not used for 20 minutes … all data associated with the container will be discarded from our systems and not recoverable."

Source: https://developers.openai.com/api/docs/guides/tools-code-interpreter

**The reliability caveat (important).** The OpenAI developer forum documents that annotations are *not reliable* — only files the model bothers to mention get cited, but **all** generated files exist in the container regardless:
> "whether or not these files are actually cited or are otherwise available after the run is a bit of a crapshoot."
> "any generated files should be available in the container no matter if the model is annotating them in the response."

Canonical robust retrieval = **list the container, don't trust annotations**:
```
GET /v1/containers/{container_id}/files            # list ALL files
GET /v1/containers/{container_id}/files/{id}/content  # download each
```
Source: https://community.openai.com/t/reliably-retrieving-code-interpreter-files-from-the-container/1288268 ; container files list API: https://platform.openai.com/docs/api-reference/container-files

### 1.2 E2B (e2b.dev code interpreter SDK)

Two distinct surfacing channels:

**(a) Inline results from the kernel.** E2B auto-detects matplotlib/IPython display outputs and returns them as base64 on `execution.results[]`. Default sandbox cwd is `/home/user`.
```js
const execution = await sandbox.runCode(codeToRun)
const firstResult = execution.results[0]
if (firstResult.png) {                       // base64 PNG
  fs.writeFileSync('chart.png', firstResult.png, { encoding: 'base64' })
}
```
```python
execution = sandbox.run_code(code_to_run)
first_result = execution.results[0]
if first_result.png:
    with open('chart.png', 'wb') as f:
        f.write(base64.b64decode(first_result.png))
```
`Execution` has `.results` (list of cell results), `.logs` (stdout/stderr), `.error`. Each `Result` carries typed fields (`png`, `jpeg`, `text`, …) mirroring the IPython kernel display data. Source: https://e2b.dev/docs/code-interpreting/create-charts-visualizations/static-charts ; SDK ref `create_code_context(cwd="/home/user")`: https://e2b.dev/docs/sdk-reference/code-interpreter-python-sdk/v1.0.5/sandbox

**(b) Explicit filesystem list + download.** For arbitrary generated files (not just kernel display), the SDK exposes a filesystem API:
```js
const files = await sbx.files.list('/')              // → EntryInfo[] {name,path,type}
const content = await sandbox.files.read('/path/in/sandbox')
```
`files.list(path, depth=1)` returns `List[EntryInfo]` with `name`, `path`, `type` (dir vs file). Source: https://e2b.dev/docs/quickstart ; https://e2b.dev/docs/sdk-reference/js-sdk/v1.0.1/filesystem

**(b, browser-direct) Pre-signed download URLs.** For letting an unauthenticated browser pull a file straight from the sandbox, create the sandbox with `secure: true` and mint a signed URL:
```js
const sandbox = await Sandbox.create(template, { secure: true })
const publicUrl = await sandbox.downloadUrl('demo.txt', {
  useSignatureExpiration: 10_000,  // ms
})
const res = await fetch(publicUrl)
```
```python
sandbox = Sandbox.create(timeout=12_000, secure=True)
signed_url = sbx.download_url(path="demo.txt", user="user",
                             use_signature_expiration=10_000)
```
Source: https://e2b.dev/docs/filesystem/download — "let users from unauthorized environments, like browsers, download files from the sandbox using pre-signed URLs."

**Full agent loop (data-analyst reference).** LLM writes code → `codeInterpreter.notebook.execCell(code)` → extract `result.png` → save/render → feed the base64 image back into the next GPT-4o turn as an image input so the model can "see" its own chart. Source: https://e2b.dev/blog/build-ai-data-analyst-with-sandboxed-code-execution-using-typescript-and-gpt-4o

### 1.3 Daytona

Daytona only offers the explicit list+download model (no annotation magic). Filesystem ops live under `sandbox.fs`:
```python
files = sandbox.fs.list_files("workspace")   # defaults to sandbox working dir if no path
for f in files:
    print(f.name, f.is_dir, f.size, f.mod_time)
sandbox.fs.download_file(path)               # single file
sandbox.fs.download_files([...])             # bulk; per-file content-or-error
sandbox.fs.upload_file(...) / upload_files(...)
```
- `list_files()` / `listFiles()`: "If the path is not provided, the method will list the files and directories in the sandbox working directory."
- Default working dir = the sandbox user's home: "`workspace` implies `/home/[username]/workspace`"; absolute paths need a leading `/`.
- Typed errors: missing → not-found, dir-as-file → validation, perms → authorization.
Sources: https://www.daytona.io/docs/en/file-system-operations/ ; https://www.daytona.io/docs/en/typescript-sdk/file-system/

### 1.4 Jupyter-kernel agent runners (AutoGen, Qwen-Agent, Open Interpreter)

These don't have a hosted file-id system; they lean on **the Jupyter display protocol + an output_dir**:

- **AutoGen `JupyterCodeExecutor`**: "When Jupyter outputs an image, this is saved as a file into the `output_dir` of the `JupyterCodeExecutor` … By default this is the current working directory." So inline `display_data` (e.g. `image/png`) is materialized to disk in a known dir. Source: https://microsoft.github.io/autogen/0.2/docs/topics/code-execution/jupyter-code-executor/
- **Qwen-Agent code interpreter**: "Matplotlib plots and other image outputs are saved to disk and returned as URLs or file paths. Stdout, stderr, and execution results are captured and formatted as code blocks." Source: https://deepwiki.com/QwenLM/Qwen-Agent/5.1-code-interpreter-tool

Mechanism in both: the kernel emits `display_data` / `execute_result` messages carrying MIME bundles (`image/png` base64, `text/html`, etc.); the runner intercepts those and either keeps them inline or writes them into `output_dir`. This is exactly E2B's `results[]` channel, just self-hosted.

---

## 2. How the MODEL is told to surface files (system-prompt conventions)

**OpenAI / ChatGPT (the canonical convention).** The python-tool system prompt — quoted verbatim from a leaked-prompt analysis:
> "When you send a message containing Python code to python, it will be executed in a stateful Jupyter notebook environment. python will respond with the output of the execution or time out after 60.0 seconds. **The drive at '/mnt/data' can be used to save and persist user files.** Internet access for this session is disabled. Do not make external web requests or API calls as they will fail."

It also nudges *presentation* helpers:
> "Use ace_tools.display_dataframe_to_user(name: str, dataframe: pandas.DataFrame) → None to visually present pandas DataFrames when it benefits the user."

Source: https://sawradip.medium.com/chatgpt-system-prompts-analysis-how-openai-llms-use-persistent-memory-tool-usage-code-e6022cd8c2ea ; corroborated by https://0din.ai/blog/prompt-injecting-your-way-to-shell-openai-s-containerized-chatgpt-environment ("a dedicated directory, `/mnt/data/`") and https://fast.io/resources/code-interpreter-file-storage/

**Key insight on the convention:** the only *instruction* the model gets is "save files to /mnt/data." There is **no** model instruction that produces the annotations — annotations are emitted by the tool runtime when the model *references* a path like `sandbox:/mnt/data/foo.csv` in its text (Assistants) or are attached by the container runtime (Responses). The model is never asked to list files or build download links; the platform does that. (Inference, well-supported by the forum threads: because the model isn't reliably told to *announce* every file, annotation coverage is partial — hence the directory-listing fallback.)

**E2B / Daytona / Jupyter runners:** there is no fixed model-facing convention; the *integrator's* prompt typically tells the model the cwd (`/home/user`) and that plots/files will be captured. Surfacing is the host app's job, not the model's. (Inference from SDK design — these are libraries, the prompt is up to the developer.)

---

## 3. How file references propagate back into chat

| System | Channel | Identifier carried into chat | How user gets the file |
|---|---|---|---|
| OpenAI Assistants | message annotation | `file_path.file_id` (data) / `image_file.file_id` (image) | `GET /v1/files/{id}/content` |
| OpenAI Responses | message annotation | `container_file_citation` → `container_id`+`file_id`+`filename` | `GET /v1/containers/{cid}/files/{fid}/content` |
| OpenAI (robust) | **none** (bypass model) | list endpoint result | `GET /v1/containers/{cid}/files` then `/content` |
| E2B | inline result | `execution.results[i].png` (base64) | decode → `<img>` / save |
| E2B | filesystem | path string from `files.list()` | `files.read(path)` or signed `downloadUrl(path)` |
| Daytona | filesystem | `EntryInfo.name/path` from `list_files()` | `download_file(path)` |
| Jupyter runners | inline `display_data` | MIME bundle / saved path in `output_dir` | base64 inline or file path |

Two propagation philosophies:
1. **Model-driven (annotations / citations):** chat-native, lets the model write "here's your chart ↓" with the file inline, but coverage is partial and order-dependent (the forum notes "subsequent files in the same container are created but not annotated").
2. **Platform-driven (list the dir):** deterministic, complete, but the chat UI has to decide *where* to render the files (usually a "Files generated" tray + inline previews for images).

In practice most production code-interpreter UIs do **both**: render annotated/inline images where the model placed them, AND list the output dir to expose anything the model forgot to mention.

---

## 4. Directly adoptable: the cleanest "list output dir + present" contract

The contract these systems converged on, stripped to essentials:

```
SANDBOX SIDE (per ephemeral cwd / container):
  GET  {sandbox}/files            → list entries {name, path, type, size, mtime}
  GET  {sandbox}/files/{path}     → bytes (or {mime, dataUrl/base64})
  (optional) signed download URL for direct browser pulls

PLATFORM SIDE (after each agent turn / on demand):
  1. list the output dir
  2. diff against what was there before the turn  (→ "files this turn produced")
  3. for images: inline preview (decode base64 → <img>)
     for everything else: a download link (proxied bytes or signed URL)
  4. PERSIST anything the user needs off-box, because the cwd is ephemeral
```

Why directory-listing beats annotation-parsing for us: it removes the dependency on the model emitting a correct, complete `file_path`/citation for every artifact (the exact failure mode OpenAI's own forum documents). The model just needs the one-line convention "save outputs to your working directory"; the platform enumerates and presents.

The minimal, battle-tested primitives to copy:
- **A known output dir** the model is told about (one system-prompt line, à la `/mnt/data`).
- **A list endpoint** returning typed entries (E2B `EntryInfo{name,path,type}` / Daytona `{name,is_dir,size,mod_time}`).
- **A per-file fetch** that returns `{mime, bytes/base64}` so the platform can pick inline-vs-download by MIME (exactly what E2B's `Result.png` and our existing `WorkspaceFile.previewType` already model).
- **A "diff the dir per turn"** step so the UI can attribute new files to the turn that made them (inference: none of the docs name this explicitly, but it's the obvious way to map dir contents → per-message file trays, and matches how annotations are scoped to "the next message").
- **Off-box persistence + ephemerality awareness** (OpenAI's strongest stated guidance).


## Key Patterns

### Known output directory convention (/mnt/data)
The model is told via a single system-prompt line that a specific directory is the place to write files the user should get. OpenAI uses /mnt/data; E2B defaults cwd to /home/user; Daytona uses the sandbox home; Jupyter runners use output_dir/cwd. The model only needs to know WHERE to save; the platform handles surfacing.

- **How the agent is made aware:** System prompt convention, quoted verbatim for ChatGPT: "The drive at '/mnt/data' can be used to save and persist user files." For SDK-based systems (E2B/Daytona) the integrator's own prompt states the cwd; surfacing is not the model's job.
- **Source:** https://sawradip.medium.com/chatgpt-system-prompts-analysis-how-openai-llms-use-persistent-memory-tool-usage-code-e6022cd8c2ea

### Annotation/citation file references in chat
When the model references a generated path, the tool runtime attaches a typed annotation carrying a file id the platform resolves to bytes. Assistants: file_path.file_id + image_file.file_id. Responses: container_file_citation with container_id+file_id+filename.

- **How the agent is made aware:** Emergent from the model writing a sandbox: path in its text (Assistants) or attached by the container runtime (Responses). The model is NOT explicitly instructed to produce annotations — they are a runtime output convention, which is why coverage is partial.
- **Source:** https://developers.openai.com/api/docs/guides/tools-code-interpreter

### Directory-listing over annotation-parsing (robust retrieval)
Because annotations only cover files the model bothers to mention, the reliable contract is to list the container/output dir directly (GET /v1/containers/{cid}/files) and download every entry, ignoring annotations. This is the deterministic, complete path practitioners converged on.

- **How the agent is made aware:** N/A — this is a platform-side behavior, invisible to the model. The model just saves files; the host enumerates them.
- **Source:** https://community.openai.com/t/reliably-retrieving-code-interpreter-files-from-the-container/1288268

### Inline rich results via the Jupyter display protocol
matplotlib/IPython display outputs are auto-captured from the kernel's display_data/execute_result MIME bundles and returned as base64 (e.g. execution.results[i].png) or written to output_dir — no model action and no annotations needed. E2B, AutoGen JupyterCodeExecutor, and Qwen-Agent all do this.

- **How the agent is made aware:** N/A — automatic kernel-output interception; the model just calls plt.show()/display().
- **Source:** https://e2b.dev/docs/code-interpreting/create-charts-visualizations/static-charts

### Pre-signed download URLs for direct browser pulls
To let an unauthenticated browser download a sandbox file without proxying through the backend, mint a short-lived signed URL bound to the file path. E2B: Sandbox.create({secure:true}) + downloadUrl(path,{useSignatureExpiration}).

- **How the agent is made aware:** N/A — host/SDK feature, not model-facing.
- **Source:** https://e2b.dev/docs/filesystem/download

### Typed list-entry + per-file fetch primitives
List returns typed entries (E2B EntryInfo{name,path,type}; Daytona {name,is_dir,size,mod_time}); per-file fetch returns bytes or {mime,base64}. The platform then picks inline-preview-vs-download by MIME. This list+fetch pair is the minimal surfacing API.

- **How the agent is made aware:** N/A — SDK/host API surface.
- **Source:** https://www.daytona.io/docs/en/file-system-operations/

### Ephemeral-container persistence mandate
Sandboxes auto-expire (OpenAI containers after 20 min idle; ChatGPT sessions ~60 min) and all data is then unrecoverable, so the platform must download/persist any needed outputs off-box during the active window.

- **How the agent is made aware:** Stated in OpenAI docs as integrator guidance, not a model instruction: "treat containers as ephemeral and store all data … on your own systems."
- **Source:** https://developers.openai.com/api/docs/guides/tools-code-interpreter


## Relevance to Claw (web-delivery design)

Our claw agent already runs in an ephemeral, per-session isolated cwd and already implements the per-file READ half of the contract: backend/internal/agent/client.go GetWorkspaceFile() hits the agent's GET /api/sessions/:id/workspace/file?path=, returning {state, previewType: text|image, content, dataUrl(base64), mimeType, size} — which maps almost 1:1 onto E2B's Result/WorkspaceFile shape and the {mime, base64} per-file fetch primitive. backend/internal/claw/file.go (GetSessionFile) then proxies image bytes to an <img> with the right MIME/XSS hardening. We also have PutWorkspaceFile/DeleteWorkspaceFile.\n\nThe MISSING half is exactly the half all five external systems converged on as the robust contract: a LIST endpoint for the session cwd. Today claw can only surface a file if the frontend already knows its path (it reconstructs paths from transcript @\"path\" text — the annotation-style, model-driven approach, with the same fragility OpenAI's forum documents). To adopt the deterministic \"list output dir + present\" contract we should: (1) add an agent endpoint GET /api/sessions/:id/workspace/files (recursive list returning {name,path,type,size,mtime}) and a Go client method ListWorkspaceFiles mirroring E2B's files.list/Daytona's list_files; (2) after each agent turn, diff the dir to attribute newly-generated files to that turn and render a \"generated files\" tray (images inline via the existing GetSessionFile proxy, other types as download links); (3) keep the one-line model convention telling the agent where to save outputs (we already inject prompts.ClawSystemPrompt via StaticPicker — add a \"save deliverables to your working directory\" sentence rather than relying on the model to announce filenames); (4) persist user-facing deliverables to MinIO (internal/storage) before the session/cwd is reclaimed, matching OpenAI's ephemerality mandate. For browser-direct downloads of large/binary files we could mirror E2B's signed-URL idea, but our existing cookie-authenticated proxy (GetSessionFile, with OwnsSession + basename-only + nosniff + raster whitelist) is already a safe equivalent for images and can be generalized to a download endpoint with Content-Disposition: attachment.

## Sources Consulted

- https://developers.openai.com/api/docs/assistants/tools/code-interpreter
- https://developers.openai.com/api/docs/guides/tools-code-interpreter
- https://platform.openai.com/docs/api-reference/container-files
- https://community.openai.com/t/reliably-retrieving-code-interpreter-files-from-the-container/1288268
- https://community.openai.com/t/missing-file-annotation-for-subsequent-files-in-code-interpreter/1351340
- https://sawradip.medium.com/chatgpt-system-prompts-analysis-how-openai-llms-use-persistent-memory-tool-usage-code-e6022cd8c2ea
- https://0din.ai/blog/prompt-injecting-your-way-to-shell-openai-s-containerized-chatgpt-environment
- https://fast.io/resources/code-interpreter-file-storage/
- https://e2b.dev/docs/quickstart
- https://e2b.dev/docs/code-interpreting/create-charts-visualizations/static-charts
- https://e2b.dev/docs/filesystem/download
- https://e2b.dev/docs/sdk-reference/code-interpreter-python-sdk/v1.0.5/sandbox
- https://e2b.dev/docs/sdk-reference/js-sdk/v1.0.1/filesystem
- https://e2b.dev/blog/build-ai-data-analyst-with-sandboxed-code-execution-using-typescript-and-gpt-4o
- https://github.com/e2b-dev/code-interpreter
- https://www.daytona.io/docs/en/file-system-operations/
- https://www.daytona.io/docs/en/typescript-sdk/file-system/
- https://microsoft.github.io/autogen/0.2/docs/topics/code-execution/jupyter-code-executor/
- https://deepwiki.com/QwenLM/Qwen-Agent/5.1-code-interpreter-tool
- backend/internal/agent/client.go:243
- backend/internal/claw/file.go
- backend/internal/claw/spec.go
- agent/docs/api.md:86
