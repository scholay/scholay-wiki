# The "final_answer / deliver" Tool Pattern Across Agent Frameworks — and a Minimal deliver_artifact() for Claw

> **Category:** external

## Summary

Across agent frameworks there is a consistent pattern: the agent must EXPLICITLY hand back its result through a dedicated tool call rather than leave output implicit in chat text or on disk. HuggingFace smolagents makes this most literal — a `FinalAnswerTool` (name `final_answer`, input `answer: any`) whose only job is to return its argument; the agent loop runs until that tool is called, and the system prompt explicitly teaches "In the end you have to return a final answer using the `final_answer` tool." The same idea appears as ReAct's `Finish[answer]` action, AutoGPT's `finish(reason, suggested_next_task)` command, CrewAI's `output_pydantic`/`output_json`/`output_file` task contract + `TaskOutput`, and LangGraph's `Command(update=, goto=)` for state-update-plus-handoff. The crucial mechanism is that the TOOL'S DESCRIPTION/SCHEMA is what teaches the model the contract — and several frameworks let final_answer carry rich payloads (smolagents `AgentImage`/`AgentAudio`/`AgentText`, CrewAI files/Pydantic). For Claw, the cleanest minimal adoption is a `deliver_artifact(path, title, description)` tool whose very existence + docstring makes the agent self-aware that local files are NOT auto-delivered and must be explicitly handed off.

---

## The "explicit deliver" tool pattern across agent frameworks

The unifying idea: **an agent's output is not whatever it happened to print, nor whatever it left on disk — it is whatever it explicitly passes to a designated "I'm done, here is the result" tool/action.** This converts "finishing" from an implicit, fuzzy event into a typed, inspectable, validatable tool call. Frameworks differ in how strictly they enforce it and how rich the payload can be, but they all converge on the same contract.

Below, each framework, then the four questions answered, then the concrete Claw proposal.

---

### 1. HuggingFace smolagents — `final_answer` (the canonical, most literal case)

This is the cleanest example of the pattern because the tool is *the* loop-termination mechanism.

**The tool itself** (`src/smolagents/default_tools.py`, verified against source):

```python
class FinalAnswerTool(Tool):
    name = "final_answer"
    description = "Provides a final answer to the given problem."
    inputs = {"answer": {"type": "any", "description": "The final answer to the problem"}}
    output_type = "any"

    def forward(self, answer: Any) -> Any:
        return answer
```

The tool *does nothing* but return its argument. Its entire value is semantic: calling it is the only way to exit the agent loop. From the docs: "When the 'final_answer' tool is called, it returns the argument given to it" and otherwise "execution logs are stored in memory and the agent keeps running." (https://github.com/huggingface/smolagents/blob/main/src/smolagents/default_tools.py)

**How the model is taught the contract — the system prompt.** This is the load-bearing part. The default `CodeAgent` system prompt (from `tutorials/building_good_agents.md`) literally says:

> "In the end you have to return a final answer using the `final_answer` tool."

and rule #7: "Don't name any new variable with the same name as a tool: for instance don't name a variable 'final_answer'." Every one of the ~7 few-shot examples in the prompt ends with a `final_answer(...)` call (e.g. `final_answer("Shanghai")`, `final_answer(pope_current_age)`, `final_answer(image)`). So the model learns the contract from (a) the tool's name+description injected into the toolbox listing, AND (b) the explicit system-prompt instruction + worked examples. (https://huggingface.co/docs/smolagents/en/tutorials/building_good_agents)

**Rich return payloads.** `output_type="any"` and smolagents' typed wrappers mean `final_answer` can carry more than text. The valid types for any tool's `inputs`/`output_type` are `["string","boolean","integer","number","image","audio","array","object","any","null"]` (https://huggingface.co/docs/smolagents/en/tutorials/tools). When a tool/observation is an `AgentImage` or `AgentAudio`, the loop handles it specially — an `AgentImage` is stored as `image.png` in the agent state with a log line "Stored 'image.png' in memory", and `final_answer(image)` returns the actual image object (the docs show `final_answer(image)` after `image_generator(...)`). The wrapper classes (`AgentImage`/`AgentAudio`/`AgentText`) "behave as they initially did — a text object behaves as a string, an image object behaves as a PIL.Image" so the delivered object is both rich AND inspectable. (https://huggingface.co/docs/smolagents/en/tutorials/tools)

**A cautionary tale directly relevant to Claw.** The docs include a debugging story where the agent generated an image, then did `final_answer("/var/.../652f...png")` — handing back *the path string instead of the image*. "The user sees, instead of an image being returned, a path being returned to them... the LLM brain did the mistake of not saving the image output into a variable." This is *exactly* the failure mode Claw's web-delivery faces: the artifact exists on disk but the agent hands back a path/mention instead of triggering real delivery. (https://huggingface.co/docs/smolagents/en/tutorials/building_good_agents)

**Validation hook — `final_answer_checks`.** smolagents lets you pass a list of validators that run *before* the answer is accepted; each takes `(final_answer, memory)` and raises on failure, and "if any check fails... the agent will log the error message and continue the run" rather than accept a bad deliverable. This is a clean precedent for gating delivery (e.g. "reject delivery if the file doesn't exist / is empty / wrong type"). (https://github.com/huggingface/smolagents/blob/main/src/smolagents/agents.py)

```python
def max_length_final_answer_check(final_answer, memory):
    if isinstance(final_answer, str) and len(final_answer) > 100:
        raise ValueError("Answer is too long")
agent = ToolCallingAgent(final_answer_checks=[max_length_final_answer_check], ...)
```

---

### 2. ReAct — the `Finish[answer]` action (the academic root)

ReAct (Yao et al., 2022, Google/Princeton) interleaves Thought → Action → Observation, and the loop terminates on a special terminal action. In the original prompting format the agent emits `Action: Finish[answer]` (a.k.a. the "Final Answer:" line). The Finish action "is a special tool that signals the agent has completed the task and should output the final response." This is the conceptual ancestor of every `final_answer`/`finish`/`submit` tool — finishing is itself an *action the model chooses*, not a side effect. (Inference: the modern tool-based versions are direct descendants of this textual action.) (https://agent-patterns.readthedocs.io/en/stable/patterns/react.html)

---

### 3. AutoGPT — the `finish` command (`reason` + `suggested_next_task`)

AutoGPT's `FinishComponent` exposes a `finish` command, described to the LLM as:

> "Use this to shut down once you have completed your task, or when there are insurmountable problems that make it impossible for you to finish your task."

Parameters: `reason` (required) — "A summary to the user of how the goals were accomplished"; `suggested_next_task` (optional) — "An optional suggested follow-up task based on what was accomplished". Internally `finish()` raises `AgentFinished` (terminating the loop). (https://github.com/Significant-Gravitas/AutoGPT/blob/master/classic/forge/forge/components/system/system.py)

Notable: AutoGPT frames its whole prompt as a *contract* with the model ("constraints, capabilities, performance evaluation"), and `finish` is one clause of that contract — the agent is told up front that terminating is an explicit, reasoned act with a user-facing summary, not just stopping. The deliverable framing is "include details about the desired output files" in the goals; the `reason` field becomes the human-readable handoff. (https://community.openai.com/t/dissecting-auto-gpts-prompt/163892)

---

### 4. CrewAI — task-level output contract (`output_pydantic` / `output_json` / `output_file`) + `TaskOutput`

CrewAI puts the "deliver" contract at the **task** level rather than as a tool the agent calls mid-loop. A `Task` can declare:
- `output_pydantic`: a Pydantic model the output "should conform to" — validated and exposed as `result.pydantic` (type-safe attributes, required-field/type/custom validation).
- `output_json`: same idea, yields a dict at `result.json_dict`.
- `output_file`: saves the result to disk (e.g. `"report.md"`), with `create_directory` controlling auto-mkdir.

The result is wrapped in `TaskOutput` with `.raw`, `.pydantic`, `.json_dict`, `.description`, `.summary`. The schema is communicated to the agent via instruction injection (the docs note that with `markdown=True` "the agent will receive additional instructions to format the output"; structured-output schemas are injected similarly — *inference* that the same mechanism applies to pydantic/json schemas). The contract here is "your final answer must fit this shape / land in this file," enforced after generation. (https://docs.crewai.com/en/concepts/tasks)

---

### 5. LangChain / LangGraph — `Command` (state update + handoff) and `create_agent` structured output

LangGraph splits the pattern two ways:

**(a) `Command` — deliver-as-handoff.** A tool or node can return a `Command` object that *simultaneously* updates shared state and routes control:

```python
return Command(
    update={"messages": [response]},  # the deliverable, written into state
    goto="my_other_node",             # where control goes next (or END)
)
```

> "A special type that when returned from a node specifies not only the update to the state (as usual) but also which node to go to next." (https://www.langchain.com/blog/command-a-new-tool-for-multi-agent-architectures-in-langgraph)

For a tool returning `Command`, the `messages` field must include a `ToolMessage` to keep history valid. This is the *handoff* flavour of "deliver": the result is explicitly written into a known state key and control is explicitly routed — nothing is implicit. (https://docs.langchain.com/oss/python/langgraph/use-graph-api)

**(b) Structured final output.** `create_agent` accepts a desired output schema; when the model emits the structured data it is "captured, validated, and returned in the `structured_response` key of the agent's state." For models without native structured output, LangChain "uses tool calling to achieve the same result" — i.e. it manufactures a synthetic tool whose schema IS the deliverable shape, forcing the model to call it to finish. That synthetic tool is the moral equivalent of `final_answer` with a typed `answer`. (https://docs.langchain.com/oss/python/langchain/structured-output)

---

### 6. gptme / Open Interpreter — file-producing tools (the "leave it on disk" end of the spectrum)

These are the contrast cases that show *why* an explicit deliver tool matters.

**gptme** ships file tools — `save` ("Create or overwrite a file with the given content"; confirms "Saved to `filename`"), `patch` (git-conflict-marker edits), `append`, plus `shell`/`python`. The model learns to use them from their tool descriptions + examples in the system prompt. But note: these tools deliver to *disk*, and the "handoff to the user" is implicit — the user sees the confirmation line, and is expected to go look at the file. There is no single typed "here is the deliverable" call; the deliverable is wherever `save` put it. (https://gptme.org/docs/tools.html)

**Open Interpreter** is even more implicit: `interpreter.computer` executes code and streams output as Markdown; `.chat()` returns the message list. Files written by executed code are just files — the contract is "the user reads the streamed output / inspects the working dir." No dedicated deliver action. (https://docs.openinterpreter.com/settings/all-settings)

**The takeaway for Claw:** gptme/OI represent exactly the failure surface Claw wants to avoid — artifacts on disk with no explicit, structured handoff. smolagents/AutoGPT/CrewAI/LangGraph represent the fix — a typed terminal/deliver action.

---

## Answers to the four questions

**Q1 — How do frameworks force/encourage a clean final deliverable, and how is the tool DESCRIBED to the model?**
Two enforcement styles: (i) **loop-terminating tool** (smolagents `final_answer`, AutoGPT `finish`, ReAct `Finish`) — the agent literally cannot end without calling it; (ii) **post-hoc output contract** (CrewAI `output_pydantic`/`output_file`, LangGraph structured output) — generation continues normally but the result is coerced/validated into a declared shape. The teaching is *always* via the tool's metadata + system prompt, never magic: smolagents injects each tool's name/description into the toolbox listing AND adds the explicit rule "In the end you have to return a final answer using the `final_answer` tool" with worked examples; AutoGPT injects the `finish` command description ("Use this to shut down once you have completed your task..."); LangChain manufactures a synthetic schema-tool the model must call. **The docstring/schema is the lesson** — the agent's behavior is downstream of how the tool describes itself.

**Q2 — Can final_answer return rich objects (files/images/structured data)?**
Yes, in several. smolagents: `output_type="any"` + typed wrappers (`AgentImage`/`AgentAudio`/`AgentText`) let `final_answer(image)` return an actual PIL image (stored as `image.png` in state); valid types include `image`/`audio`/`object`/`array`. CrewAI: `output_pydantic` returns a validated model instance, `output_json` a dict, `output_file` writes to disk. LangGraph: `Command(update=...)` writes any structured payload into typed state keys; `structured_response` holds a validated schema object. So the deliverable can be a file path, an image object, or a validated struct — not just a string.

**Q3 — How is "the contract includes an explicit deliver action" baked into the agent's self-model?**
Via the **toolset + system prompt jointly**. The tool's *presence* in the toolbox tells the model the action exists; the tool's *description* tells the model when/how to use it; the system prompt's *rules + few-shot examples* make using it mandatory and demonstrate the exact form. smolagents is the textbook case: the toolbox lists `final_answer` with its description, the prompt mandates ending with it, and every example ends with it — so the model's internal "what does finishing look like?" is anchored to that call. AutoGPT frames the whole thing as a signed "contract" with `finish` as a clause. The agent's self-model of "I am done" becomes synonymous with "I called the deliver tool."

**Q4 — Cleanest minimal version for Claw: `deliver_artifact(path, title, description)`.**
A single tool, defined once, whose schema + docstring teach the agent that on-disk files are NOT auto-delivered. See proposal below.

---

## Proposed minimal tool for Claw: `deliver_artifact`

**Schema (MCP-style):**

```json
{
  "name": "deliver_artifact",
  "description": "Hand a finished local file off to the user. IMPORTANT: files you create on disk are NOT visible or downloadable to the user until you deliver them with this tool. The user does not have shell/filesystem access — your working directory is invisible to them. Call this once per file you want the user to receive (e.g. a generated PDF, image, .tex, .zip). Call it AFTER the file is fully written. Returns a user-facing download URL.",
  "inputs": {
    "path":        {"type": "string", "description": "Absolute path to the finished file in your working directory."},
    "title":       {"type": "string", "description": "Short human-facing name shown to the user, e.g. 'Annotated review report'."},
    "description": {"type": "string", "description": "One sentence telling the user what this file is and what to do with it."}
  },
  "output_type": "object"
}
```

**Why this exact shape works (lessons applied):**
1. **Existence + description = the lesson** (smolagents/AutoGPT principle). The description explicitly states the negative fact the model otherwise wouldn't infer: "files on disk are NOT visible/downloadable until delivered." That single sentence is what reprograms the agent's self-model. This directly counters the smolagents "returned the path instead of the image" bug.
2. **It's the web-delivery analogue of `final_answer`.** Where smolagents `forward()` just returns the arg, Claw's `forward()` does the real web work (upload to MinIO / mint a signed URL / push over the WS to the frontend) and returns the URL — same contract surface, real side effect.
3. **Validation gate (smolagents `final_answer_checks` precedent).** The handler should reject delivery if the path doesn't exist / is empty / is outside the session cwd, returning a corrective error so the agent retries — exactly how `final_answer_checks` raises and lets the loop continue. This also enforces Claw's per-session cwd isolation (see MEMORY: agent-file-handling-planB).
4. **Reinforce in the system prompt, don't rely on the schema alone.** Mirror smolagents: add a one-liner to the agent's system prompt — "Any file the user should receive MUST be handed off with `deliver_artifact`; do not just mention the path." and, if you want hard enforcement, refuse to treat a turn as complete if the agent described producing a file but never called `deliver_artifact` (a Claw-side equivalent of smolagents' "keep running until final_answer").
5. **Rich-payload ready.** `title`/`description` give the frontend enough to render a proper download card (like CrewAI's `TaskOutput` metadata) rather than a bare link; the structured object return means the WS pipe can render an artifact chip instead of inline text.

**Optional stricter variants (graded by how much you want to force it):**
- *Soft:* tool exists; system prompt encourages it. (Lowest friction.)
- *Medium:* post-turn check — if the transcript references a created file path that was never delivered, inject a nudge observation ("You created X but didn't deliver it; call deliver_artifact"). Mirrors AutoGPT/ smolagents loop continuation.
- *Hard:* make `deliver_artifact` (or a `finish`-style tool that *includes* an artifacts list) the only sanctioned way to end a turn that produced files, à la smolagents `final_answer` being the sole loop exit.

## Key Patterns

### final_answer as sole loop-exit tool
A no-op tool (`name=final_answer`, `inputs={answer: any}`, `forward` just returns its arg) is the ONLY way to terminate the agent loop; until it's called, observations accumulate and the agent keeps running. Converts 'finishing' into an explicit typed action.

- **How the agent is made aware:** Tool name+description injected into the toolbox listing AND the system prompt explicitly states 'In the end you have to return a final answer using the `final_answer` tool', with every few-shot example ending in final_answer(...).
- **Source:** https://github.com/huggingface/smolagents/blob/main/src/smolagents/default_tools.py

### Rich/typed deliverables via final_answer
final_answer accepts output_type='any'; smolagents typed wrappers (AgentImage/AgentAudio/AgentText) let it return real images/audio (an AgentImage is stored as image.png in state). Deliverable can be a file/image/struct, not just text.

- **How the agent is made aware:** Tool inputs/output_type enumerate valid types ['string','image','audio','object','array',...]; few-shot example shows final_answer(image) after image_generator(...).
- **Source:** https://huggingface.co/docs/smolagents/en/tutorials/tools

### final_answer_checks validation gate
A list of validators run before a final answer is accepted; each takes (final_answer, memory) and raises on failure, and the agent logs the error and CONTINUES the run instead of accepting a bad deliverable. Precedent for gating delivery (file exists/non-empty/correct type).

- **How the agent is made aware:** Not described to the model directly — it's a host-side guard; the model only sees the resulting corrective error observation and retries.
- **Source:** https://github.com/huggingface/smolagents/blob/main/src/smolagents/agents.py

### Path-instead-of-object delivery bug
Documented smolagents failure: agent generated an image but did final_answer('/tmp/xxx.png'), handing back a path string instead of the image. Root cause: not saving the artifact into a variable. Exactly the 'artifact on disk, not handed off' failure Claw must avoid.

- **How the agent is made aware:** N/A — it's a failure case; the fix is a stronger model and/or more explicit tool/prompt instructions.
- **Source:** https://huggingface.co/docs/smolagents/en/tutorials/building_good_agents

### finish command with reason + suggested_next_task
AutoGPT's FinishComponent exposes `finish(reason, suggested_next_task)`; finish() raises AgentFinished to end the loop. The `reason` is a user-facing summary of how goals were accomplished — the human-readable handoff.

- **How the agent is made aware:** Command description injected into prompt: 'Use this to shut down once you have completed your task, or when there are insurmountable problems...'; AutoGPT frames the whole prompt as a contract with the model.
- **Source:** https://github.com/Significant-Gravitas/AutoGPT/blob/master/classic/forge/forge/components/system/system.py

### Task-level output contract (pydantic/json/file)
CrewAI declares the deliverable shape on the Task: output_pydantic (validated model -> result.pydantic), output_json (dict -> result.json_dict), output_file (writes to disk). Result wrapped in TaskOutput with raw/pydantic/json_dict/description/summary.

- **How the agent is made aware:** Schema/format instructions are injected into the agent's instructions (docs confirm markdown=True injects formatting instructions; structured schemas injected similarly — inferred).
- **Source:** https://docs.crewai.com/en/concepts/tasks

### Command(update, goto) deliver-as-handoff
A LangGraph tool/node returns Command to simultaneously write the deliverable into shared state (update) and route control (goto, possibly END or another agent). Tool-returned Commands must include a ToolMessage in messages.

- **How the agent is made aware:** The model calls a normal tool; the Command return is host-side control flow. For structured final output, LangChain manufactures a synthetic schema-tool the model MUST call to finish (that tool's schema teaches the deliverable shape).
- **Source:** https://www.langchain.com/blog/command-a-new-tool-for-multi-agent-architectures-in-langgraph

### Synthetic schema-tool for structured output
For models without native structured output, LangChain create_agent forces the deliverable shape by exposing a tool whose schema IS the output schema; the model must call it, and the result lands in state key `structured_response`. Equivalent to a typed final_answer.

- **How the agent is made aware:** The schema-derived tool appears in the toolset with its field schema as description; calling it is required to finish.
- **Source:** https://docs.langchain.com/oss/python/langchain/structured-output

### File-tools-only delivery (anti-pattern for handoff)
gptme (save/patch/append) and Open Interpreter deliver by writing to disk / streaming output with no dedicated typed handoff action; the user is expected to inspect files or read streamed output. Shows the gap a deliver tool closes.

- **How the agent is made aware:** Tools learned from their descriptions + system-prompt examples (e.g. save: 'Create or overwrite a file with the given content'); no instruction that disk files need explicit handoff.
- **Source:** https://gptme.org/docs/tools.html

### ReAct Finish[answer] terminal action
The academic root: ReAct interleaves Thought/Action/Observation and ends on a special Finish[answer] (a.k.a. 'Final Answer:') action. Finishing is itself a chosen action, not a side effect — ancestor of all final_answer/finish/submit tools.

- **How the agent is made aware:** Prompt format + few-shot trajectories that always end in 'Action: Finish[...]' / 'Final Answer: ...'.
- **Source:** https://agent-patterns.readthedocs.io/en/stable/patterns/react.html


## Relevance to Claw (web-delivery design)

Claw's web-delivery problem is the exact failure mode smolagents documents: the agent creates a file in its sandboxed per-session cwd, then 'hands back' a path string or a chat mention instead of triggering real delivery — and the user (who has no filesystem/shell access) never receives it. Every studied framework fixes this by making 'deliver' an explicit, typed action whose tool description IS the teaching mechanism. Concrete adoption: add ONE tool, `deliver_artifact(path, title, description)`, whose description states the negative fact the model can't infer ('files on disk are NOT visible/downloadable to the user until you deliver them; the user has no filesystem access') — this single sentence reprograms the agent's self-model exactly as smolagents' system-prompt line 'In the end you have to return a final answer using the final_answer tool' does. The handler does Claw's real web work (MinIO upload / signed URL / WS artifact chip) and returns the URL, making it the web-delivery analogue of smolagents' return-the-arg final_answer. Borrow smolagents' final_answer_checks as a validation gate (reject if path missing/empty/outside session cwd — which also reinforces Claw's existing per-session cwd isolation from the agent-file-handling-planB memory) and AutoGPT's reason field as user-facing description. Reinforce in the agent's system prompt (don't rely on schema alone) and, for hard enforcement, refuse to treat a turn as complete when the agent described producing a file but never called deliver_artifact — Claw's equivalent of 'keep running until final_answer.' This fits Claw's existing agentbridge architecture (the tool can be a Minicod-style MCP tool the scholar_agent container exposes, with the backend handler doing delivery), and the title/description give the frontend enough to render a real download card over the WS pipe instead of a bare path.

## Sources Consulted

- https://github.com/huggingface/smolagents/blob/main/src/smolagents/default_tools.py
- https://github.com/huggingface/smolagents/blob/main/src/smolagents/agents.py
- https://huggingface.co/docs/smolagents/en/tutorials/building_good_agents
- https://huggingface.co/docs/smolagents/en/tutorials/tools
- https://huggingface.co/docs/smolagents/en/guided_tour
- https://github.com/Significant-Gravitas/AutoGPT/blob/master/classic/forge/forge/components/system/system.py
- https://community.openai.com/t/dissecting-auto-gpts-prompt/163892
- https://docs.crewai.com/en/concepts/tasks
- https://www.langchain.com/blog/command-a-new-tool-for-multi-agent-architectures-in-langgraph
- https://docs.langchain.com/oss/python/langgraph/use-graph-api
- https://docs.langchain.com/oss/python/langchain/structured-output
- https://gptme.org/docs/tools.html
- https://docs.openinterpreter.com/settings/all-settings
- https://agent-patterns.readthedocs.io/en/stable/patterns/react.html
