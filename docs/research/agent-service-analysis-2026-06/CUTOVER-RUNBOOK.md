# Scholar Agent 重构 · 切流 Runbook(P4a→P6)+ 切流前缺口分析

> 状态:**未执行**。executor steps 1-8 已建+测,但 step 9(切流到 executor 当主、删 fork)
> **不在本轮执行** —— 下面的「切流前硬缺口」必须先补齐 + 你点头(P6 删 fork 不可逆)。
> 本文是把 fork 真正下线前要走的清单与回滚路径。

---

## 为什么现在不能直接切

executor 已被证明是 **smart_search 交互流** 的可用 drop-in(WS+HTTP 契约、工具/MCP、权限、
标题、记忆、reconcile parity=YES)。但把任一 feature 的 **live 流量** 切到 executor 当主,
有几个**对抗性复盘查出的硬缺口**:

### 缺口 H1(阻断):history-on-reload 丢失
- executor 的会话内 history 在**进程内存**(`sessions.ts` meta.messages),WS 重连/容器重启即丢。
- fork 有 jsonl,重连能 resume;executor 没有。
- 用户刷新页面 → 前端读 `GetSessionMessages` → executor 返回内存视图(重连后为空)→ **历史消失**。
- **修法(二选一,都要做+测)**:① 切流同时翻 `AGENT_JOURNAL_READ=<feature>`,让后端从事件溯源
  journal(P0/P1 已落)折叠历史,executor 的 messages 端点不再权威;② executor 启动一轮前先从
  后端 journal 拉 history 喂入(`/api/turn` 的 flatMessages 已支持,WS 路径需加「连接时 seed history」)。
- 注:**P1 读路径还有 MEDIUM-4(thinking 未入 journal)**,翻 READ 前 thinking 在历史回放会缺(见
  P0-P1-REVIEW;不阻断但体验降级)。

### 缺口 H2(阻断 claw 切流):artifact 交付未实现
- claw 的成果文件要落 MinIO + 前端预览(memory: claw-artifact-minio-delivery)。executor 只有
  cwd 文件 op,**没有 MinIO 落地/serve**。claw 切流前必须补。

### 缺口 H3(阻断 prism 切流):编译链未接
- prism 的 LaTeX 编译走独立 `prism_tex` 沙箱容器(network_none)。executor 的 Bash+bwrap(net:none)
  能跑编译,但 **prism_tex 的现有契约/产物回读路径未接**;prism 固化经 `ReadWorkspaceFileFull`
  已通(step 7a),但「编译 loop / 产物」未端到端验。

### 缺口 H4(阻断 peerreview 切流):全流程未端到端验
- peerreview server-side WS(含 `set_runtime_config{modelId}` 切模型)已在 executor 通(step 7),
  但完整审稿流程(方法论会话→4 reviewer→chief→落库)未端到端跑过。**peerreview 是 O1 近不可逆耦合**
  (P5 saga 化),务必单独充分验 + soak。

### 缺口 H5(prod-only):bwrap 未真内核验
- bwrap argv 已审查正确,但本机 LinuxKit 跑不了(无 unprivileged userns)。prod 切 `SANDBOX_MODE=bwrap`
  前必须:① prod 内核允许 unprivileged userns(`sysctl kernel.unprivileged_userns_clone=1` 或等价);
  ② executor 容器的 `cap_drop/no-new-privileges` 要放开到能建 userns(当前 cap_drop ALL 会挡)。

---

## 切流阶梯(每步 soak 过 parity/无回归才进下一步;逐 feature,不一次全切)

### P4a — smart_search 金丝雀切流(最先,因已证最完整)
1. **先补 H1**:加 executor「连接时 seed history from journal」**或**翻 `AGENT_JOURNAL_READ=smart_search`。
2. 切流机制(接缝已就位):bootstrap 让 smart_search 的 bridge client 指向 executor。最小实现 = 让
   `agent.LoadFromEnv` 支持 per-feature base_url,或加一个 executor client 让 bridge 按 feature 路由。
   **默认仍 fork**;flag `AGENT_EXECUTOR_FEATURES=smart_search` 才切。
3. 上线后 reconcile harness 持续比对 N 天(offline 已有;可加 live 影子)。parity 掉 → 立即翻回 flag。
4. **回滚**:`AGENT_EXECUTOR_FEATURES=` 清空 → 秒回 fork(executor 仍并存)。

### P4b — bwrap(独立、prod-only、可回滚)
- 补 H5 → prod 设 `EXECUTOR_SANDBOX_MODE=bwrap` → 冒烟(claw 跑一条 bash;prism 跑一次编译)。
- 回滚:`EXECUTOR_SANDBOX_MODE=none`。

### P4c — claw / prism 切流
- 先补 H2(claw artifact→MinIO)、H3(prism 编译 loop 端到端)。各自金丝雀 + soak。

### P5 — peerreview 切流 + saga 化
- 补 H4(全流程端到端验)。peerreview server-side 切到 executor。debt#4 的临时 stitch 换成
  `agent_saga_steps` 引擎(迁移 0048/0049 契约已就位)。**O1:近不可逆,充分 soak。**

### P6 — 删 fork(**不可逆,需 owner 点头**)
- 前置:P4a–P5 全部 soak 过 parity + 无回归 + 你确认。
- 动作:删 `agent/`(`docker-compose.yml` 去掉 `agent` 服务 + 删源)、去掉 executor 的临时 host 端口
  `3460:3456`、(可选)executor 翻 2 副本(此时已无 jsonl 单写墙)。
- **执行前务必**:`git` 留可回滚点;先停 `agent` 服务观察一周再删源,别一步到位。

---

## 当前可回退状态(本轮结束时)
- 三大能力**全部仍跑 fork**(默认);executor 容器**并存且 healthy**,不接 live 流量。
- 所有改造 opt-in:清 `AGENT_TURN_JOURNAL` 回 P0 前;`AGENT_JOURNAL_READ` 空=daemon 权威;
  executor 是独立新服务,不影响 fork。**没有任何 live 路径被改。**
