# 侦察:上传/引用链路端到端(claw 样板)+ 一处断链实锤

> 2026-07-14 · 含活体验证

## 1. 文件上传链路(方案 B:推原始文件,模型原生分析)

```
前端选文件/拖拽/粘贴 (ChatComposer.addFiles)
  → POST /user/claw/upload  multipart          [routes_user.go:289, UploadLimitMiddleware]
  → internal/claw/upload.go: 校验类型+大小(图 5MB/文件 30MB)
      → GetOrCreateSession(添加文件即开会话)
      → agent.Client.PushSessionFile → POST executor /api/sessions/:id/files   [client.go:221 流式]
      → 文件落 /home/bun/sessions/<sid>/<name>(会话隔离 cwd)
  → 返回 AttachmentDTO{sessionId, path, type, name, mimeType, size}
前端把 DTO 放 attachments[] state → 发送时 user_message 帧携带 attachments[].path
  → backend hub handleUserMessage:只做 配额/注入/预算盖章,attachments 字段原样转发   [hub.go:1061-1200]
  → executor ws.ts handleUserMessage:const content = String(frame.content) —— ❌ attachments 字段被忽略
```

## 2. ⚠️ 断链实锤:attachments[].path 全链路无消费方

- 老 executor(cc-haha 血统)有 `materializeAttachments`:把 `@"path"` 前缀拼进 user 文本,模型据此 Read
  (git 1f9ea5776 `conversationService.ts:1440`;前端历史回放至今保留剥离逻辑 `agent-history.ts:340` tokenRe `/^@"([^"]+)"\s*/`)。
- **web-native 重写后的现 executor 没有任何 attachments 处理**(`grep -r attachments agent/src/` 零命中;
  `ws.ts:182` 只取 content 字符串)。claw `api/types.ts:66` 注释「agent 的 materializeAttachments 用 @"path" 引用」已是死文档。

**活体验证(2026-07-14,executor 直连)**:推送 secret-poem.txt → user_message 带 attachments + 文本提示「我刚上传了一个文件」→
模型(deepseek)**靠 `Glob *` 列目录自救**,再 Read 成功读出内容。

**结论:降级可用而非全断** —— 但依赖三个侥幸:
1. 用户文本里口头提到了"上传了文件"(不提模型就不会去找);
2. 该 feature 允许 Glob(claw 允许;若泛化到禁 Bash/Glob 的 feature 则真断);
3. 会话 cwd 里只有该用户的文件(隔离 cwd 保证)。
多轮后历史里也无路径记录,跨轮再问"刚才那个文件"更靠模型自觉。**修复(executor 恢复附件清单注入)应列 P0。**
另:历史回放的附件 chips 依赖 `@"path"` 前缀 —— 现在新消息没有前缀,**上传的附件在刷新后气泡上消失**(fold.ts:152 剥离逻辑空转),属同一断链的 UI 症状。

## 3. 引用文献集链路(claw,链路完整可用)

```
Library 按钮 → LibraryReferencePicker(数据源 = 通用 /user/library/folders + /user/library,claw api/library-browse.ts:26,53)
  → POST /user/claw/reference {paperIds, folderIds}          [routes_user.go:290]
  → internal/claw/references.go:物化进会话 cwd references/
      paper-<id>.md(元数据+摘要,og 覆盖 online)/ <file>.pdf(MinIO 取流 push)/ INDEX.md(清单)
  → 返回 chip 元数据 ReferenceItemDTO[]
发送时:前端把「引用块」文本追加到 content 末尾(buildReferenceBlock,shared/lib/agent-references.ts:29)
  → 模型看见引用块 + 配套 library-reference skill 教它读 ./references/
历史回放:引用块解析回 chip(与附件不同,这条链因为走 content 文本所以是通的)
```

## 4. 粘贴/拖拽现状
- claw:✅ 全有(见 fe-composer 报告)。
- smart-search / prism:❌ 无 onPaste/onDrop(SmartComposer/PrismChatPanel 均未传)。
- 其它 feature(library PDF 导入、peer-review UploadStep、feedback)各有独立上传 UI,与本题无关。

## 5. smart-search / prism 复用该链路的阻塞点

| 阻塞点 | 说明 |
|---|---|
| 上传端点是 claw 专属 | `/user/claw/upload`、`/user/claw/reference` handler 挂在 internal/claw,内部用 claw 的 FeatureBridge get-or-create 会话。泛化 = 把 upload.go/references.go 抽成 agentbridge 层(或公共包)按 FeatureSpec 参数化,每 feature 挂两个薄路由 |
| smart-search 无 Bash | FeatureSpec 禁 Bash(仅 claw 放开)→ PDF/Office 的「Bash 转文本」路不通 → 只能收纯文本/代码类,或给 smart-search 例外,或 backend 侧抽文本(方案 A 回潮),须拍板 |
| prism 的 cwd 语义 | prism 会话 cwd 是文档工作区(AddDirs 挂 LaTeX 项目),用户上传文件与项目文件混放会污染编译目录 → 建议落 `uploads/` 子目录并在注入清单里写明 |
| 「添加文件即开会话」语义 | claw 多会话可懒建;smart-search/prism 是单会话 get-or-create,天然更简单(upload 前先 ensure session 即可) |
| 引用块 + 历史回放 | buildReferenceBlock/剥离逻辑在 shared 已通用,smart-search/prism 接入引用后自动获得回放 chips |
