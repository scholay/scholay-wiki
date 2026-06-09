# How Coding/Workspace Agents Surface Work and Model Their Own Environment (OpenHands, SWE-agent, aider, Cline/Roo, Devin)

> **Category:** external

## Summary

Coding agents split sharply into two layers: (1) the agent-facing interface, which is deliberately NOT the human view, and (2) the human-facing surfacing of the agent's work. SWE-agent's ACI paper is the clearest articulation that "LM agents are a new category of end user" needing a non-human interface — concise feedback, a 100-line file viewer, linting guardrails — and it explicitly argues human IDEs are unsuitable for agents. None of the five systems put live "the user is watching your screen" framing in the agent prompt; instead, human-awareness is encoded at handoff boundaries: aider auto-commits every edit as a Conventional-Commit with "(aider)" attribution (commits ARE the deliverable), Cline writes every tool step into a shadow git repo so the user can diff/restore checkpoints, OpenHands streams typed Action/Observation events to a React SPA and requires an explicit "AI disclosure" note when posting content humans will read, and Devin exposes a 4-tab workspace (Shell/Browser/Editor/Planner) with a "Following" mode and delivers via PRs. For a chat-style research assistant, the adoptable core is: model your own output as a deliverable that will be surfaced/handed off to a human (commit/cite/disclose), keep the agent's internal interface concise and machine-optimized, and surface artifacts as diffable/restorable units rather than a live mirror.

---

## Scope & method

Researched five coding/workspace agents from primary sources (GitHub repos, official docs, the SWE-agent NeurIPS paper PDF, aider docs/blog). Two questions structure everything below:

- **Agent-facing layer** — the interface the *model* sees (tools, observations, file views).
- **Human-facing layer** — how the agent's work is *surfaced* to the user (file tree, diffs, commits, live mirror).

The central finding is that mature systems treat these as **two distinct interfaces**, and the strongest design literature (SWE-agent's ACI) is explicitly about *not* conflating them.

---

## 1. How each surfaces generated/modified files to the user

| System | Human-facing surfacing mechanism |
|---|---|
| **SWE-agent** | None for an end user — it is a benchmark/autonomy harness. The "file viewer" is *agent-facing* (100-line window), and the deliverable is a **patch file** auto-submitted at the end of the run. ([paper p.4-7](https://arxiv.org/pdf/2405.15793v1)) |
| **OpenHands** | Typed **Action/Observation events** stream through a central EventStream pub/sub hub to a **single-page React app + REST API**; a VSCode plugin is exposed via host port mapping (`http://localhost:{port}/?tkn=...&folder=...`) so the user sees the live workspace. File changes propagate as events in real time. ([runtime docs](https://docs.openhands.dev/usage/architecture/runtime), [README](https://github.com/OpenHands/OpenHands)) |
| **aider** | **Git commits.** Every edit is auto-committed with a descriptive Conventional-Commit message; `/diff` shows changes since the last message; `/undo` reverts AI changes. The git history *is* the surfaced record. ([git docs](https://aider.chat/docs/git.html)) |
| **Cline / Roo** | **VS Code/JetBrains diff view** per edit ("every edit shows up as a diff you can review, modify, or revert"), gated by **per-edit/per-command approval**. Plus **checkpoints**: a *shadow git repo* commits the workspace after each tool use, giving a timeline with Compare/Restore (Roo shows side-by-side diffs; Cline historically rewrote whole files). ([Cline README](https://github.com/cline/cline), [checkpoints docs](https://docs.cline.bot/features/checkpoints)) |
| **Devin** | **4-tab cloud workspace** — Shell, Browser, Editor, Planner — that the user can watch switch in real time via a **"Following" toggle**. The Editor adds "code diffs from previous state," a **"Global Work View"** of all modified files, and download. Final handoff is a **PR ready for review**. ([Devin docs](https://docs.devin.ai/get-started/devin-intro), [intro blog](https://cognition.ai/blog/introducing-devin)) |

**Pattern axis:** live-mirror (Devin, OpenHands) ←→ commit/diff-as-record (aider, Cline checkpoints) ←→ final-artifact (SWE-agent patch). The trend in *human-collaborative* tools is diff-gated + checkpointed, not raw live streaming.

---

## 2. Does the agent's prompt/architecture encode awareness that its workspace is presented to a human?

This is the most important and most nuanced finding. **The answer is split by layer.**

### SWE-agent: explicitly the OPPOSITE — the interface is NOT for humans

The ACI paper is the canonical statement that an agent's interface should be *de-humanized*:

> "Existing application interfaces to perform software engineering have naturally been designed around the human user... These interfaces have rich visual components and feedback that make them powerful tools for humans, but may not be as suited to LMs." ([p.3](https://arxiv.org/pdf/2405.15793v1))

> "LM agents represent a new category of end users with their own needs and abilities." (abstract / [ACI docs](https://swe-agent.com/0.7/background/aci/))

> "Human user interfaces are not always suitable as agent-computer interfaces." (Fig. 4 caption text, p.6)

It gives **four ACI design principles** (p.3) — note these optimize for the *model* as the audience, not a watching human:
1. **Actions should be simple and easy to understand** (concise docs, few options).
2. **Actions should be efficient** (consolidate operations: edit + auto-refresh in one step).
3. **Environment feedback should be informative** "without providing unnecessary details" — e.g. after an edit, show the revised file; on empty output, emit *"Your command ran successfully and did not produce any output"* to avoid silent-success confusion.
4. **Guardrails mitigate error propagation** — a linter rejects syntactically-broken edits before they apply.

Concrete agent-facing (not human-facing) mechanics: file viewer shows **≤100 lines** with `scroll_up`/`scroll_down`/`goto`; search returns **≤50 results** as a file list (more → "write a more specific query"); old observations beyond the last 5 are collapsed to one line "to avoid showing outdated file content." Ablations proved this matters: 100-line window scored 18.0% vs 30-line 14.3% and full-file 12.7%; linting added +3.0pts. So **awareness of audience exists, but the modeled audience is the LLM itself**, and the design goal is token/cognition efficiency.

### OpenHands: human-awareness encoded at HANDOFF boundaries, not as ambient "you're being watched"

The full system prompt ([system_prompt.j2](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/agent/prompts/system_prompt.j2)) opens with *"You are OpenHands agent, a helpful AI assistant that can interact with a computer to solve tasks."* It contains **no line saying the user is live-watching the workspace.** Instead human-presentation is encoded where work *leaves* the agent:

- **AI disclosure at external surfaces** (the key quote):
  > "When posting messages, comments, issues, or any content to external services **that will be read by humans** (e.g., Slack messages, GitHub/GitLab comments, PR/MR descriptions...), always include a brief note indicating the content was generated by an AI agent on behalf of the user."
- **Attribution in commits:** default git identity `openhands <openhands@all-hands.dev>` + `Co-authored-by` trailer.
- **Consult-the-human gates:** "Do not push to remote branch and/or start a pull request unless explicitly asked"; if a plan hits a major issue, "propose a new plan and confirm with the user before proceeding."
- **`AGENTS.md` as persistent memory** ("Use `AGENTS.md` under the repository root as your persistent memory") — a *durable, human-readable* artifact, not ephemeral scratch.

So OpenHands models a human reviewer who exists **at commit/post/PR boundaries**, and the *runtime* (not the prompt) handles live visibility via the event stream.

### Cline/Roo: awareness encoded in the architecture (approval + checkpoints), not the prompt

The human-in-the-loop is structural: "Every file edit and terminal command requires your approval" and "All changes are tracked with checkpoints." The agent operates knowing each step becomes a reviewable diff/restorable checkpoint, but this is enforced by the harness rather than asserted in a "user is watching" sentence. ([README](https://github.com/cline/cline))

### Devin: live-watch is a UI feature ("Following"), handoff is the PR

The "Following" toggle and 4-tab workspace make watching a *user* affordance; public write-ups don't expose a prompt asserting "narrate because a human is watching." ([docs](https://docs.devin.ai/get-started/devin-intro))

**Synthesis (inference, marked):** Across all five, the modeled human is a *reviewer of artifacts and handoffs*, not a *live spectator the agent must perform for*. The "presented to a human" awareness lives in: (a) attribution/disclosure rules, (b) approval/consult gates, and (c) durable artifacts (commits, AGENTS.md, PRs). Live-mirroring is delegated to the runtime/UI, deliberately kept out of the agent's cognitive loop to preserve the concise machine-facing interface SWE-agent argues for.

---

## 3. The git-as-delivery pattern (aider): commits ARE the handoff

aider is the purest expression of "ephemeral local execution, but committed/surfaced":

- **Every edit auto-commits.** "Whenever aider edits a file, it commits those changes with a descriptive commit message." It first commits any pre-existing dirty changes separately, so AI work is isolated from human work. ([git docs](https://aider.chat/docs/git.html))
- **Messages are model-generated** (sends the `--weak-model` the diffs + chat history) and follow **Conventional Commits** by default.
- **Attribution is baked into git metadata:** `(aider)` appended to author *and* committer name when aider authored; committer-only when it merely committed dirty files. Optional `Co-authored-by` trailers.
- **Reviewable & reversible:** `/diff`, `/undo`, `/commit`. **`git push` is left to the human** — aider commits but never pushes.

Why this matters for "ephemeral local but committed/surfaced": the working tree is transient and the agent's *internal* reasoning is discarded, but **the commit is a permanent, attributed, human-legible handoff unit**. The deliverable isn't a chat transcript — it's a sequence of atomic, labeled, undoable commits that drop straight into the user's existing review workflow. Cline generalizes the same idea with a **shadow git repo** (checkpoints capture *everything, including untracked files*) so the surfaced record exists even when the user doesn't want it polluting real history.

**Companion mechanism — the repo map (aider):** to *understand* the repo cheaply, aider builds a tree-sitter AST of definitions/references, forms a graph (files=nodes, references=edges), and runs `nx.pagerank()` with a **personalization vector** biased toward chat files + mentioned identifiers, ranking `(file, identifier)` pairs to fit `--map-tokens` (default 1k). ([repomap docs](https://aider.chat/docs/repomap.html), [tree-sitter blog](https://aider.chat/2023/10/22/repomap.html), [DeepWiki](https://deepwiki.com/Aider-AI/aider/4.1-repository-mapping-system)). This is the *input* analogue to commits-as-output: a compressed, machine-optimized view of the workspace.

---

## 4. What's adoptable for a chat-style research assistant (not a full IDE)

Mapping these patterns onto the claw/scholar context (a chat assistant that produces research artifacts, not an IDE):

1. **Model the agent's output as a deliverable that will be handed off, not just chat.** aider's lesson: the durable, attributed unit (a commit) is the product. For a research assistant the analogue is a **cited, attributed artifact** (a saved report, a library entry, a LaTeX doc revision) — the agent should "commit" results into a persistent store with provenance, not leave them only in the transcript. The scholar codebase already has this shape (LaTeX `latex_documents` versions, `user_library_*`), so the adoptable framing is: *teach the agent it is producing a deliverable that lands in a durable, user-reviewable place.*

2. **Two-layer interface discipline (SWE-agent's core lesson).** Keep the agent's *internal* tool I/O concise and machine-optimized (windowed/ranked context, "no output → say so explicitly", suppress huge dumps, lint/validate before committing a structured result) — and keep that separate from the *human* presentation. Don't make the agent narrate for a spectator; make the surfacing layer (UI/diff/citation render) do that.

3. **Surface artifacts as diffable + restorable units, not a live mirror.** Cline's checkpoint/shadow-repo pattern beats raw live streaming for a chat tool: snapshot each artifact-producing step so the user can Compare/Restore. For research output this means **versioned artifacts with a "what changed since last turn" diff** and an undo — cheaper and more reviewable than streaming every keystroke.

4. **Encode human-awareness at handoff boundaries, in the prompt.** Adopt OpenHands' pattern literally: when the agent produces content a human will read/act on, instruct it to (a) include provenance/citation, (b) flag AI-generated content where appropriate, and (c) **consult before irreversible/external actions** rather than asserting "the user is watching." This is lighter-weight and more honest than a "you're on screen" framing.

5. **Use a repo-map-style compressed environment view.** The agent should be given a *ranked, token-budgeted summary* of the user's existing materials (library, staging area, prior docs) — analogous to aider's PageRank repo map — so it has whole-corpus awareness without dumping everything. This is directly portable to surfacing "what's in the user's library/workspace" to the model.

6. **Disclosure + attribution as a default.** aider's `(aider)`/`Co-authored-by` and OpenHands' AI-disclosure rule are cheap, high-trust patterns: tag agent-produced artifacts as agent-produced. For a research assistant, attaching "generated by [assistant], sources: [...]" to every saved artifact is the equivalent of the commit attribution.

---

## Cross-cutting takeaway

The defining insight from these five systems: **the agent's environment-as-observed-by-a-user is a separate, downstream concern from the agent's environment-as-operated-by-the-agent.** SWE-agent proves the agent's own interface should be *de-humanized* for efficiency; aider/Cline/OpenHands/Devin prove the *human* view should be artifact-centric (commits, diffs, checkpoints, PRs) with human-awareness injected only at handoff boundaries (attribution, disclosure, approval). A chat research assistant should self-understand its "web delivery" the same way: it is producing **durable, attributed, reviewable deliverables for a human reviewer**, while its internal working interface stays concise and machine-optimized.

## Key Patterns

### Agent-Computer Interface (ACI) — interface for the model, not the human
Deliberately separate the agent-facing interface from human interfaces. Four principles: actions simple, actions efficient (consolidate edit+auto-refresh), feedback informative-but-concise (100-line file viewer, ≤50 search results, explicit 'no output' message, collapse stale observations), guardrails (linter rejects broken edits). Ablations: 100-line window 18.0% vs full-file 12.7%; linting +3.0pts. Explicitly: human IDEs are 'not always suitable as agent-computer interfaces.'

- **How the agent is made aware:** Encoded entirely in the tool/command set and observation format the model sees — the agent learns the interface by using it; no prose system-prompt line asserts it. The design lives in the ACI tooling itself.
- **Source:** https://arxiv.org/pdf/2405.15793v1 (p.3-7); https://swe-agent.com/0.7/background/aci/

### Auto-commit as deliverable handoff (git-as-delivery)
Every agent edit is auto-committed with a model-generated Conventional-Commit message; pre-existing dirty work is committed separately first. The commit — atomic, labeled, undoable (/undo, /diff) — IS the deliverable. Push is left to the human. Working tree + agent reasoning are ephemeral; the commit is the permanent, surfaced handoff.

- **How the agent is made aware:** Behavioral: the harness commits after each edit; commit-message generation is a separate weak-model call fed the diff+chat history. Not a prompt instruction to the main agent — it's an architectural convention.
- **Source:** https://aider.chat/docs/git.html

### Attribution baked into the artifact
aider appends '(aider)' to git author/committer name metadata (or Co-authored-by trailer); OpenHands defaults git identity to 'openhands <openhands@all-hands.dev>' + Co-authored-by trailer. The deliverable carries machine-readable provenance that it was agent-produced.

- **How the agent is made aware:** aider: harness-enforced git config. OpenHands: explicit system-prompt instruction in <VERSION_CONTROL>.
- **Source:** https://aider.chat/docs/git.html; https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/agent/prompts/system_prompt.j2

### AI disclosure at external/human boundaries
When posting content 'that will be read by humans' (Slack, GitHub comments, PR descriptions, emails), the agent must include a note that content was AI-generated on behalf of the user. Human-awareness is encoded at the handoff boundary, not as ambient 'you are being watched.'

- **How the agent is made aware:** Explicit <EXTERNAL_SERVICES> section in the OpenHands system prompt.
- **Source:** https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/agent/prompts/system_prompt.j2

### Shadow-git checkpoints for diff/restore
A shadow Git repo (separate from project history) commits the full workspace after each tool use — capturing even untracked files. The user gets a timeline with Compare (diff view) and three Restore modes (files only / task only / both). Surfaces agent work as reviewable, reversible units without polluting real history.

- **How the agent is made aware:** Harness/IDE feature; the agent doesn't manage it. Awareness of review is structural (every edit needs approval) rather than prompted.
- **Source:** https://docs.cline.bot/features/checkpoints; https://github.com/cline/cline

### Per-edit/per-command human-in-the-loop approval
Each file edit and terminal command renders as a diff/command preview the user must approve before it applies; auto-approve is opt-in. Makes the agent's work visible and gated by default.

- **How the agent is made aware:** Harness-enforced gating, not prompt-level. The agent emits a proposed action; the UI intercepts for approval.
- **Source:** https://github.com/cline/cline; https://www.qodo.ai/blog/roo-code-vs-cline/

### Typed Action/Observation event stream to UI
All agent-environment interaction flows as immutable typed events (CmdRunAction, FileWriteAction, etc.) through a central EventStream pub/sub hub; the runtime executes in a Docker sandbox and returns Observations over REST; events stream to a React SPA in real time, enabling replay/pause/resume. Workspace also exposed via a VSCode plugin port.

- **How the agent is made aware:** Architectural — the runtime client mediates; the agent only emits Actions and consumes Observations and is unaware of the UI rendering layer.
- **Source:** https://docs.openhands.dev/usage/architecture/runtime; https://github.com/OpenHands/OpenHands

### Live-watch workspace with Following mode + PR handoff
Devin exposes a 4-tab workspace (Shell/Browser/Editor/Planner); a 'Following' toggle lets the user watch tabs switch in real time and take over. Editor adds code-diffs-from-previous-state and a 'Global Work View' of all modified files. Final handoff is a draft PR for review.

- **How the agent is made aware:** UI affordance for the user; not exposed as agent-prompt framing in public write-ups (inference).
- **Source:** https://docs.devin.ai/get-started/devin-intro; https://cognition.ai/blog/introducing-devin

### PageRank repo map — compressed machine-facing environment view
tree-sitter ASTs extract definitions/references; a graph (files=nodes, references=edges) is ranked with nx.pagerank() using a personalization vector biased toward chat/mentioned files+identifiers, producing ranked (file, identifier) pairs fit to a token budget (default 1k). Gives whole-repo awareness without sending full files.

- **How the agent is made aware:** Injected into the LLM context with each request as a 'repo map' block; computed by the harness, not the agent.
- **Source:** https://aider.chat/docs/repomap.html; https://aider.chat/2023/10/22/repomap.html; https://deepwiki.com/Aider-AI/aider/4.1-repository-mapping-system

### AGENTS.md as durable, human-readable persistent memory
The agent is told to use AGENTS.md at repo root as persistent memory across sessions, adding insights/patterns — a durable, human-legible artifact rather than ephemeral scratch.

- **How the agent is made aware:** Explicit <MEMORY> section in the OpenHands system prompt.
- **Source:** https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/agent/prompts/system_prompt.j2


## Relevance to Claw (web-delivery design)

For making the claw agent self-understand 'web delivery': the strongest transferable principle is the two-layer split proven by SWE-agent — keep the agent's internal tool interface concise/machine-optimized while treating the human-facing surface as a separate artifact-delivery concern. Concretely adoptable: (1) Teach the claw agent (via system prompt, like OpenHands' <EXTERNAL_SERVICES>/<VERSION_CONTROL>) that its outputs are DELIVERABLES handed off to a human reviewer — attach provenance/citations and disclose AI-generation on saved artifacts, and consult before irreversible/external actions, rather than framing it as 'a user is watching your screen.' (2) Surface results as diffable + restorable versioned artifacts (the scholar codebase already has latex_documents versions and user_library entries) — mirror Cline's checkpoint Compare/Restore so users see 'what changed this turn' with undo, instead of streaming raw activity. (3) aider's git-as-delivery maps to claw's 'ephemeral local but committed/surfaced': the agent's working state and reasoning can be transient, but the committed/saved artifact is the permanent, attributed handoff that lands in the user's durable store. (4) Give the agent a repo-map-style compressed, ranked view of the user's existing corpus (library/staging area) so it has whole-workspace awareness without dumping everything — directly portable to how scholar could surface the user's materials to the model. (5) Use AGENTS.md-style durable human-readable memory for cross-session context. The meta-lesson: human-awareness belongs at handoff boundaries (attribution, disclosure, approval gates, durable artifacts), and live presentation should be delegated to the surfacing/UI layer to keep the agent's cognitive loop clean.

## Sources Consulted

- https://arxiv.org/abs/2405.15793
- https://arxiv.org/pdf/2405.15793v1
- https://swe-agent.com/0.7/background/aci/
- https://github.com/SWE-agent/SWE-agent/blob/main/docs/background/aci.md
- https://aider.chat/docs/git.html
- https://aider.chat/docs/repomap.html
- https://aider.chat/2023/10/22/repomap.html
- https://deepwiki.com/Aider-AI/aider/4.1-repository-mapping-system
- https://github.com/OpenHands/OpenHands
- https://docs.openhands.dev/usage/architecture/runtime
- https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/agent/prompts/system_prompt.j2
- https://raw.githubusercontent.com/OpenHands/software-agent-sdk/main/openhands-sdk/openhands/sdk/agent/prompts/system_prompt.j2
- https://github.com/cline/cline
- https://docs.cline.bot/features/checkpoints
- https://www.qodo.ai/blog/roo-code-vs-cline/
- https://docs.devin.ai/get-started/devin-intro
- https://cognition.ai/blog/introducing-devin
