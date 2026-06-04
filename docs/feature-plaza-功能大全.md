# 功能大全(学术工具黄页)— 实现交付说明

> 夜间自主实现。早上验收看这一份即可。涉及取舍/待办都在文末。

## 一、做了什么(端到端)

数据流:**外部采集 → admin 导入(任务管理)→ feature_tools 落库 → 前端渲染;任一工具 增/改/删 → webhook 通知下游(enterscholar discourse 等)同步**。

三块全部落地、**后端编译 + 前端 tsc/vite build 均已通过**:

1. **数据**:从 enterscholar `c/navi/21` 抓的 202 条种子,联网富集成结构化 JSON(每条:名称/简介/详细描述/分类/标签/价格类型/形式/官网/厂商/成立年份/国家/开源/平台/版本/FAQ/使用场景/替代品/网盘链接+提取码…)。
2. **后端**:新模块 `backend/internal/featuretool`(model/repo/service/handler/webhook)+ 迁移 `0010_feature_tools.sql`(4 张表)+ 路由(公开浏览 + 后台 CRUD/导入/任务/webhook)。
3. **前端**:
   - 用户端 `frontend-user/src/features/tools`:**功能大全目录页**(左栏 12 分类 + 搜索 + 形式/价格筛选 + 卡片网格 + 分页)、**工具详情页**(按设计稿:头部+CTA、这是什么、典型场景、功能详情、FAQ、获取方式(网盘+提取码)、厂商、价格、替代品、教程)。
   - 后台 `frontend-user/src/features/admin`:**功能大全列表**(搜索/分类/状态筛选 + 编辑 + 删除)、**导入工具**(粘贴/上传 JSON + 进度)、**导入任务**(历史 + 逐条结果)、**Webhook 同步**(订阅 CRUD + 测试投递 + 投递记录)。

## 图片处理(logo)→ 走 MinIO,不外链

- **现状问题**:富集抓到的 logo 是外链(对方官网),会被防盗链/CORS/404 搞成图裂;且 162/201 根本没图。
- **新方案**:每个工具一张图(26 个真实 logo 下载 + 175 个"分类配色+首字母"自适应 SVG),放进冷数据包的 `images/<slug>.{svg,png}`。导入 zip 时,后端把这些图**上传到 MinIO**(bucket `scholar-feature-tools`,env `MINIO_BUCKET_FEATURE_TOOLS`),并把每条工具的 `logo` 改成我们自己服务的稳定地址 `GET /api/v1/public/tools/logo/<slug>`(从 MinIO 流式读、永久缓存)。**彻底不外链 → 不图裂**。
- json 里 `logo` 字段是空的;若只导 json 不导 zip,logo 留空 → 前端用首字母方块兜底,也不图裂。
- logo 维护脚本:`scripts/normalize-tool-logos.mjs`(把冷数据包 `images/` 每张图合成白底测可见度 → 可见的转白底 PNG、白/空/坏的换成彩色首字母 SVG;消灭图裂与白底重叠)。原下载真 logo 的 `gen-tool-logos.mjs` 已随 `seed-data/` 删除。
- 标题也清洗过:`scripts/`(workflow)去掉版本号/汉化/原版/安装版噪声,版本进 `spec.version`。

## 二、关键设计决策

### 1. 分类:设计稿 9 类不适配 → 改用精炼 12 类
设计稿是"现代学术工作流"导向(AI写作/检索/管理/投稿/社交/求职),但 202 条种子是**学科软件**为主(统计/化学材料/生物信息/绘图/工程)。逐条验证后改用 12 类(分类清单见 `internal/featuretool/model.go` 的 `Categories`)。如不认可可在 admin 改每条 `category`,或改 `internal/featuretool/model.go` 的 `Categories` + 前端 `types/feature-tool.ts`。

### 2. "形式"分类(你提的"有些网站有些云盘")
统一为 `access_type`:`website`(在线)/ `download`(网盘安装包)/ `both`。详情页 CTA 按它切换:website→"访问官网",download→"获取下载"(展示百度网盘链接 + 可复制提取码)。

### 3. Webhook 同步
- 工具 增/改/删 → 异步推送 `{event, tool, timestamp}` 给所有启用的订阅,带 `X-Scholay-Signature: sha256=<hmac>` 签名,投递记录入库,回写订阅 `last_status`。
- **默认没有任何订阅 → 不会推**。需在 admin「功能大全 → Webhook」里新建(填下游 enterscholar 的接收地址 + 密钥)。
- **导入时是否通知下游**有开关,冷数据首次导入**默认关闭**(避免一次性 201 条 spam 下游)。

### 4. 字段 schema
完整字段设计见 `backend/internal/featuretool/model.go` 与前端 `frontend-user/src/types/feature-tool.ts`(冷数据制作期的 SCHEMA.md/TAXONOMY.md 已随 `seed-data/` 一并删除)。

## 三、上线步骤(需要你操作,部署归你)

```bash
# 1. 重建并起服(自动跑迁移 0010 建表 + 新后端 + 新前端)
docker-compose up -d --build

# 2. 确认迁移成功
docker logs scholar_schema_sync | tail
```

然后导入种子数据:
- 进 admin 后台(默认 http://localhost:5455)→ 左栏「内容运营 → 功能大全」→ 右上「导入工具」
- **支持两种上传**:① 直接传 `.json`(工具数组);② 传 `.zip`(后端自动解包,读里面所有 `.json` 合并导入,自动跳过 index.json / `_` 开头的元数据文件)
- 现成冷数据包:[`feature-tools-coldstart/`](../feature-tools-coldstart/) 文件夹(含 `feature-tools.json` 201 条 + README),或已打好的 [`feature-tools-coldstart.zip`](../feature-tools-coldstart.zip) 直接传
- "导入时通知下游 webhook" **保持关闭**,点导入 → 看「导入任务」进度
- 导入完到「功能大全」列表能看到工具;前台 http://localhost:5411/tools 浏览

> 导入是按 `source_topic_id` / `slug` **幂等 upsert**,重复导入不会重复建。

## 四、API 一览

公开:`GET /api/v1/public/tools`(列表/筛选)、`/public/tools/categories`、`/public/tools/detail/:idOrSlug`
后台:`/api/v1/admin/tools`(GET/POST)、`/admin/tools/items/:id`(GET/PUT/DELETE)、`/admin/tools/categories`、`/admin/tools/import`、`/admin/tools/import-jobs[/:id]`、`/admin/tools/webhooks[...]`

## 五、已知取舍 / 待办(明早可定方向)

- **评分 / 用户评价 / 相似工具 / 收藏数**:设计稿有,但这些是上线后用户产生的 runtime 数据,种子期一律空/null,**没有造假**。后续可接热度统计 pipeline 回填,详情页/卡片已留位。
- **logo**:富集尽力找了官网 logo,但不少工具(尤其国产老软件)没有可靠透明 logo → 缺省用首字母方块。可后续在 admin 逐个补。
- **详细描述**目前按纯文本(`whitespace-pre-line`)渲染,未走 react-markdown(降低构建风险);如需富文本可切。
- **数据条数**:抓到 202,排除 1 条"板块说明帖",富集 201 条。其中约 39 条是通用工具(WinRAR/Office 等非纯科研),按你的要求**全量保留**,未做"科研/非科研"标记,后续人工筛。
- **导入数据已就绪**:[`feature-tools-coldstart/`](../feature-tools-coldstart/)(`feature-tools.json` 201 条 + `images/` logo)或打包好的 [`feature-tools-coldstart.zip`](../feature-tools-coldstart.zip),直接在 admin 导入。logo 已统一规整为白底 PNG / 首字母 SVG(见 `scripts/normalize-tool-logos.mjs`)。原 `seed-data/` 爬取+富集源料已删除,不再重爬。
- **16 条低置信度**(obscure 老软件 / 标题歧义,如 `jade`→被识别成 Pug 模板引擎,可能应是 MDI Jade)建议导入后在 admin 抽查校正(冷数据每条的 `data_quality.needs_review/needs_enrich` 字段有标注)。

## 七、git 状态(重要)

- 本功能全是**新增文件**为主,未提交(working tree)。我没有 commit/push(按约定)。
- 树里**还有一批与本功能无关的未提交改动是「智能写作 Prism」的在建代码**(`backend/internal/prism/` 整个目录、`vip/`+`agentbridge/`+`routes_user.go`+`storage.go` 等的 prism 相关改动)——**不是我加的**,提交时请和功能大全的改动分开,别混作一笔。
- 属于「功能大全」的改动:`backend/internal/featuretool/`、`docker/mysql/migrations/0010_feature_tools.sql`、`backend/cmd/server/{routes.go,routes_admin.go,routes_scholar.go,bootstrap.go}`(后 4 个是在已有文件里加了功能大全的几行)、`frontend-user/src/{types/feature-tool.ts,features/tools/*,features/admin/{api/feature-tools.ts,pages/FeatureTool*.tsx,routes.tsx,nav.ts}}`、`feature-tools-coldstart/`(冷数据导入包)、`scripts/normalize-tool-logos.mjs`、本文档。

## 六、相关文件

- 后端:`backend/internal/featuretool/`、`backend/cmd/server/{routes.go,routes_admin.go,routes_scholar.go,bootstrap.go}`、`docker/mysql/migrations/0010_feature_tools.sql`
- 前端:`frontend-user/src/features/tools/`、`frontend-user/src/features/admin/{pages/FeatureTool*.tsx,api/feature-tools.ts,routes.tsx,nav.ts}`、`frontend-user/src/types/feature-tool.ts`
- 数据:[`feature-tools-coldstart/`](../feature-tools-coldstart/) + `feature-tools-coldstart.zip`(导入包)、`scripts/normalize-tool-logos.mjs`(logo 规整)。原 `seed-data/` 源料与 `scripts/{scrape-enterscholar-navi,normalize-feature-tools}.sh` / `strip-emoji.mjs` / `gen-tool-logos.mjs` 已删除(不再重爬)。
