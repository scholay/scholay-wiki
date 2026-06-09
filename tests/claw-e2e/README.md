# Claw 智能助手 — 测试套件

覆盖 claw(智能助手)整条会话链路与「成果交付(./out 产物)」新功能。分两层:

```
确定性层 (无需起 stack, 必跑, 已全绿)        E2E 场景层 (需起 stack + agent, 跑真实对话)
backend/internal/claw/*_test.go              tests/claw-e2e/{driver,run}.mjs + scenarios.json
  - artifactRelPath 路径白名单(安全命门)       - 132 个学术对话场景 (workflow 生成)
  - parseArtifactManifest / shouldListArtifact - 13 类: search/analysis/data/writing/venue/
  - decodeDataURL / allowedRasterMIME(XSS门)    citation/review/delivery/multiturn/i18n/
  - upload 类型嗅探 (isImage/isPDF/...)          edge/boundary/adversarial
```

---

## 1. 确定性单元测试(已全部通过)

钉死两个安全门(产物路径白名单 `out/<basename>`、内联光栅图 MIME 白名单)+ manifest 解析 + 上传类型嗅探。**纯函数, 不依赖 MySQL/Redis/agent**。

本机无 Go,用容器跑(项目约定):

```bash
cd backend
docker run --rm -v "$PWD":/app -w /app \
  -v scholar_go_mod:/go/pkg/mod -v scholar_go_build:/root/.cache/go-build \
  -e GOPROXY=https://goproxy.cn,https://mirrors.aliyun.com/goproxy/,direct \
  golang:1.21-alpine sh -c "go test ./internal/claw/ -v"
```

---

## 2. E2E 场景套件

真实驱动 claw 的 HTTP + WebSocket API,逐场景断言**结构性不变量**并记录观测信号。
**不评判 LLM 文本质量(非确定)**——它回答的是「系统对这类(含奇葩/对抗)学术对话是否健壮:不卡死、不 5xx、WS 不崩、拿到终态帧、该出产物的出了产物、不泄露内部实现」。

### 前置
1. 整套 stack 起着且 agent 配好可用 provider/key:`docker compose up -d`
2. 一个可登录账号(普通用户即可跑大部分场景)

### 运行(用 bun,零依赖:原生 fetch + WebSocket)
```bash
CLAW_E2E_BASE=http://localhost:5411 \
CLAW_E2E_EMAIL=you@example.com \
CLAW_E2E_PASSWORD=yourpass \
bun tests/claw-e2e/run.mjs

# 或直接给 JWT 跳过登录:  CLAW_E2E_TOKEN=eyJ...
# 调试单类:               CLAW_E2E_ONLY=adversarial   (子串匹配 id/category/domain)
# 限跑前 N 个:             CLAW_E2E_MAX=10
```
报告写到 `tests/claw-e2e/last-report.json`;有 `FAIL` 时退出码 1(供 CI)。

### 每个场景断言什么(自动)
- WS 用 30s 一次性 ws_token 升级成功;每轮在超时内拿到**恰好一个** `message_complete` 或 `error`(不挂死)。
- 非对抗场景出现 `error` 帧 → WARN;对抗/边界场景的 error 在预期内。
- 交付类场景(category=delivery 或断言提及产物)→ `GET /session/artifacts` 应非空。
- **数据源/内部实现泄露黑名单**:助手文本含 `mcp__minicod__`/系统提示词片段 → FAIL;含真实库名(PubMed/OpenAlex…)→ WARN(留人工复核,防论文标题误报)。
- 记录每轮 frames/toolUses、产物文件名,连同场景声明的 `structuralAssertions` 一并落报告,供人工对照。

### 还需补的 fixture / 编排(catalog 里已含、harness 待扩)
当前 `run.mjs` 跑通**对话 + 交付 + 泄露**层;以下安全/边界场景在 `scenarios.json` 里有,但要跑全需补编排(见 `scenarios.json.meta.harnessDesign`):
- **跨会话越权(IDOR)**:需第二个用户(userB),用 A 的 session_id 配 B 的 token 访问 → 期望 403/404。
- **配额边界**:需 DB 播种 free 用户 + 跑前 `redis-cli DEL` 配额键,发到第 11 条 → 期望 `quota_exceeded` 帧且 WS 不关。
- **上传拒绝**:SVG / >30MB / >5MB 图片 → 期望 HTTP400 body code 4001。
- **ws-ticket 矩阵**:同票升级两次(第 2 次 401)、错配 session(403)、无票(401)。
- **真实附件**:PDF/图片/docx/xlsx(当前 `synthUpload` 用文本占位代替)。
这些点的**确定性安全门**(路径白名单、MIME 白名单)已在第 1 层单测钉死。

---

## 3. 场景目录 `scenarios.json`
由 `claw-test-scenarios` workflow 生成(10 域并行枚举 → 去重合并)。结构:
`{ globalInvariants[], meta{summary,coverageMatrix,harnessDesign,unitTestPlan}, scenarios[] }`。
每个 scenario:`{ id, domain, category, userMessages[], needsUpload, uploadHint, expectedBehavior, structuralAssertions[], weirdness }`。
重新生成:`/workflows` 里的 `claw-test-scenarios`(脚本在 session workflows 目录)。
