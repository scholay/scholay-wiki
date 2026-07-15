# claw 成果交付 · 彻底方案设计(产物即带外声明)

2026-07-15。承接 REPORT.md 调研:owner 要"最彻底方案",不打补丁。

## 病根(REPORT.md 已定位)

- **看不到** = 交付发现链路断裂:agent 常写 cwd 根而非 `./out/`(后端只列/收割 `./out/` 顶层);
  轮卡片绑定只认 `WRITE_TOOLS={Write,Edit,MultiEdit}`,漏 ExportDocument/Bash;桌面押在可折叠侧栏、
  移动端只有轮卡;都靠"扫固定目录 + 信正文 + 工具名匹配"。
- **念路径** = 路径卫生缺失:提示词从不禁止念容器路径;"网页 IDE 文件面板"是 prism 概念被 claw 幻觉。

## 彻底方案 = 业界"产物即带外声明"协议(不再扫目录/信正文/匹配工具名)

> 核心转变:**产物由执行器从真实文件写入检测出来,作为结构化 `artifact` 帧带外声明**,
> 覆盖所有产文件的工具;前端据帧渲染第一类卡片,与助手正文彻底解耦。正文只说"做了什么"。

### 1. 执行器:每轮工具后 diff `./out/` → 发 `artifact` 帧(工具无关)

- `snapshotOut(workDir)` → `Map<relPath,{size,mtime}>`(`./out/` 顶层文件 + 一级子目录聚合)。
- turnLoop:seed 后取基线;每轮 `runTools` 后 + 收尾各 diff 一次,新增/变更条目发
  `{type:"artifact", name, path:"out/<...>", kind:"file"|"dir", mime, size}`,更新基线。
- 仅当 `input.deliverArtifacts`(backend 给 claw 置 true)才检测 —— smart_search 只读、prism 另有交付,不受影响。
- **覆盖 Write/Edit/ExportDocument/Bash/Python 全部**(检测的是文件系统结果,不是工具名)。

### 2. 后端 hub:`artifact` 帧 → 记 journal(replay)+ 触发收割 + 转发前端

- Append 一条 turn 事件 `EvArtifact`(journal)→ **重连/刷新回放时产物随轮重建**(不再靠工具名匹配)。
- 异步 `harvestSession`(幂等)把文件落 MinIO + agent_artifacts(耐久 + 二进制可下载),与帧解耦。
- 转发帧给前端 → 卡片**实时**出现在当前轮正下方。
- 层次:claw 专属收割经 `FeatureSpec.OnArtifact` 钩子注入(agentbridge 不反依赖 claw)。

### 3. 前端:fold 认 `artifact` 帧 → 绑当前轮 → 第一类卡片(桌面+移动一致)

- 实时 fold 与历史 replay fold 同构:`case "artifact"` → `turn.artifacts.push(...)`。
- MessageTurn 在回答正下方渲染产物卡(复用现有 ClawArtifactPreview/下载/预览);**桌面移动都给就近卡**,
  侧栏 `ClawArtifactPanel` 降为"全部产物"的次级汇总。
- **删除 WRITE_TOOLS 匹配**(改由 artifact 帧驱动;历史 replay 也走帧);manifest.json 标题仍优先。
- 收到 artifact 帧顺带 invalidate useClawArtifacts(侧栏/耐久列表同步)。

### 4. 路径卫生(双保险)

- 提示词(prompts/claw.go)加**铁律**:产物写 `./out/` 即自动作为卡片交付给用户;
  **严禁在回复正文里提及任何文件系统路径 / 目录 / "文件面板" / "IDE" 等内部概念**,
  只说"已生成《X》,可在下方查看/下载";删 prism 的 IDE 幻觉源。
- **渲染层出口清洗**:前端 markdown 渲染前 strip 容器路径(`/home/bun/...`、`./out/...`、裸 `xxx.svg` 提示)
  → 兜住模型顽固 bias(微调固化,prompt 治不干净)。

### 5. 固定输出根 + 归一兜底

- 输出根固定 `./out/`(模型改不动)。写到 cwd 根的"疑似交付物"由执行器检测层**归一**:
  diff 也扫 cwd 根一层,发现根下新增可交付文件(非草稿/隐藏)→ 记 WARN 并**照常声明为产物**
  (path 仍报真实位置,后端下载按真实相对路径取)—— 宁可多交付,不让用户看不到。

## 分期

- **P0(本次核心)**:执行器检测 + `artifact` 帧 + hub 转发/journal/收割钩子 + 前端 fold+就近卡 + 提示词铁律 + 出口清洗。
- **P1**:根目录归一兜底 + 侧栏更醒目 + storage 未启用的二进制通路。
- **P2**:产物版本化 / 分享。
