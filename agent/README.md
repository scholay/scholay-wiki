# agent-executor

Scholay 自有的 **clean-room、web-native、provider-agnostic** agent 执行器。基于 raw
`@anthropic-ai/sdk` 的 tool-runner + 手写 turn loop + `@modelcontextprotocol/sdk` 从零实现。

行为以当前代码和测试为准；历史设计稿已从仓库移除。

## 它是什么 / 不是什么

- **是**:替换 fork(`agent/`,cc-haha)的下一代执行后端。后端(Go)拥有会话 state(事件溯源
  journal,migrations 0046+);执行器**按轮无状态** —— history 由后端喂入,执行器不自管 jsonl。
- **不是**:不是 Claude Code CLI / cc-haha / Codex 的衍生。无 jsonl 真源、无 REPL、无 Ink/vim、
  无 bundled CLI 子进程、无桌面单用户记忆设施。
- **provider-agnostic**:绑 Anthropic Messages API **协议**(非 Anthropic 厂商)。上游经
  `PushConfig` 注入 `base_url + token + 4 model 槽位`,运行时可切(当前实例 = DeepSeek)。

## 增量落地状态(详见设计 §9)

- [x] step 1 — `executor.go` 接缝(Go interface,fork `*agent.Client` 满足)
- [x] step 2 — journal 中性化 + validator tool 维度(HIGH-1/2/3)
- [x] step 3 — scaffold:`/health` + `/api/providers*` + `/api/models`(provider 管道)
- [x] step 4 — `anthropic/client` + `turn/turnLoop` + `mcp/minicodClient` + built-in tools(conformance PASS)
- [x] step 5 — `server/ws` 全 frame map + `runTools` permission(WS 集成测试 PASS)
- [x] step 6 — offline reconcile harness on smart_search(parity=YES)
- [x] step 7 — workspace op + model override + 标题 + 记忆抽取 + seam(messages/patch/list)(全测过)
- [x] step 8 — `sandbox/bwrap` + `egress`(argv 审查 + none 直跑测过;**bwrap 仅生产真内核**,本机 LinuxKit 跑不了)
- [x] H1 history-on-reload — `seed_history`(journal 喂入)+ Go per-feature 路由 + 配置 push/resync。重连历史不丢 PASS。
- [x] H2 claw artifact — 走 executor workspace op + 后端 harvest;修 mtimeMs float→int。PASS。
- [x] H6 skill 加载 — `src/skills/loader.ts` 读 addDirs 的 CLAUDE.md + SKILL.md 进 system;compose 挂 /claw-add 等。
- [x] **P4a 切流:smart_search + claw 已切到 executor 当主**(`AGENT_EXECUTOR_FEATURES=smart_search,claw`)。实测全过。fork 保留可秒回退(清空 flag)。
- [ ] **prism / peerreview:暂留 fork(deferred)** — peerreview `ServerSideChatStreaming` 未按 feature 路由 + 全流程需 soak;prism 持久 cwd 语义需端到端验。
- [ ] P4b bwrap(仅生产真内核)/ P6 删 fork(不可逆,需 4 feature 全切 + owner 点头)

## 本地

```bash
bun install
bun run src/index.ts          # :3456
bun run typecheck
```

容器经 docker-compose 的 `agent-executor` 服务运行(与 fork `agent` 并存,直到 P6)。
