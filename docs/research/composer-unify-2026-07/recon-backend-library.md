# 侦察:backend 桥接面与文献集引用数据源

> 2026-07-14

## 1. 上传/引用端点现状(全是 claw 专属挂载)

| 端点 | Handler | 泛化难点 |
|---|---|---|
| `POST /user/claw/upload` | internal/claw/upload.go(multipart → 校验 → GetOrCreateSession → PushSessionFile) | 逻辑与 claw 无耦合,仅 FeatureBridge 是 claw 的;抽成按 `*agentbridge.FeatureBridge` 参数化的公共件即可三家复用 |
| `POST /user/claw/reference` | internal/claw/references.go(物化 references/:paper-<id>.md + PDF + INDEX.md) | 同上;另有配套 library-reference skill 教模型读 references/(skill 注入按 feature 配,推广时三家都要挂) |
| 上传体积闸 | 路由级 `UploadLimitMiddleware(UploadMaxBodySize)`(routes_user.go:289) | 新路由记得同样包(历史坑:全局 BodyLimit 10MB 会架空,multipart 已放行) |
| executor 文件接收 | `POST /api/sessions/:id/files`(agent/src/server/http.ts:222,230) | 通用,任何 feature 的 session 都能推 |

**结论:backend 泛化是搬运级工作** —— 把 upload.go/references.go 从 internal/claw 提到公共位置(建议 internal/agentattach 或并入 agentbridge),
handler 接收 FeatureBridge 注入,三 feature 各挂 `/upload` `/reference` 两条薄路由。

## 2. 文献集数据源(引用选择器要用的)
- 选择器数据 = **通用 library 端点**(非 claw 专属):`GET /user/library/folders`、`GET /user/library`(分页+关键词),
  claw 的 `api/library-browse.ts` 只是薄封装(L26,53)。
- PDF 取流:references.go 从 MinIO 拉该论文用户上传的 PDF 推进 cwd —— 依赖 library 的存储结构,已封装在 claw references 实现内,泛化时一起搬。
- **暂存区(检索工作区)**:smart-search 场景天然有 staging(`user_staging_*` 表);把暂存区作为可引用源是合理扩展,
  但 staging 条目不一定有 PDF/摘要落库 —— 引用价值 = 元数据行。建议 P2 再做,首期只做文献集。

## 3. 前端分层(遵守 frontend-user/CLAUMD.md 禁跨 feature import)
- `LibraryReferencePicker` 现在 features/claw/components/chat/ 下,smart-search/prism 不能直接 import →
  **上提到 shared/components/**(它的依赖已全是 shared 件 + 通用 API,无 claw 业务耦合;library-browse api 一并上提 shared/api/library-browse.ts)。
- 附件装配层(addFiles/drag/paste/chips/lightbox/上传 mutation 注入)同理抽 shared:
  建议 `shared/hooks/useComposerAttachments.ts`(纯交互逻辑,upload mutation 由 feature 注入)+
  `shared/components/chat/ComposerAttachmentSlots.tsx`(topSlot/overlay/leftActions 三件套的装配帮手)。
- AttachmentDTO/ReferenceItemDTO 类型上提 shared/types/chat.ts(TurnReference 已在那)。

## 4. 各 feature 会话前置条件
| feature | 会话模型 | 上传前 ensure |
|---|---|---|
| claw | 多会话(sessionId 显式传,空则新建=「添加文件即开会话」) | 已实现 onSessionEnsured adopt |
| smart-search | 单会话 get-or-create(`GET /smart-search/session`) | 上传前调 session 接口 ensure 即可,无 adopt 复杂度 |
| prism | 项目绑定会话(projects/:id/session) | 同上;**上传落 cwd 的 uploads/ 子目录**(避免污染 LaTeX 编译目录,见 upload-chain) |
