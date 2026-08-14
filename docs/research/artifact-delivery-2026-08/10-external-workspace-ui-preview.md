# 10 · agent「工作区」的前端呈现范式 与 文档预览技术选型

> 调研日期：2026-08-07 · 范围：外部产品范式（v0 / bolt.new / Lovable / Replit / Manus / Canvas / Artifacts）
> ＋ 浏览器文档预览开源方案选型 ＋ 服务端缩略图 ＋ 交付出口
> 口径：所有数字均为**本次实测**（npm registry / bundlephobia / 运行中的 `scholar_agent` 容器），
> 不引用二手博客里的体积与性能声称。外部产品的交互结论标注 URL。

---

## 〇、结论先行

五条，按可执行性排序：

| # | 结论 | 依据强度 |
|---|---|---|
| 1 | **文件树是错的解法。** 竞品里最接近我们用户画像的 Lovable，其官方文档明说「most people never open the code editor」。我们的用户是科研工作者，不是开发者 —— 给他们一棵 `out/` 树只会把内部组织逻辑更彻底地暴露出去 | 高（官方文档原文） |
| 2 | **`docx-preview` 应当直接替换 `mammoth`。** 47KB gzip vs 120KB gzip（**更小 61%**）、1 个依赖 vs 10 个、保真度更高（分页/页眉页脚/脚注/编号）、Apache-2.0、周下载 133 万。这是本次调研唯一一个「体积更小 + 保真更高 + 合规门槛全过」的严格占优替换 | 高（实测 bundlephobia + npm） |
| 3 | **服务端缩略图今天就能做，零新依赖。** 运行中的 `scholar_agent` 已装 `pdftoppm 25.03.0` + `pandoc 3.10.1` + `weasyprint` + `chromium`，且**没有** LibreOffice。实测 docx→pdf 1951ms、pdf→png **33ms**。不要引入 LibreOffice/Gotenberg（+1GB 镜像，且 LibreOffice 实例**无法并行**） | 高（容器内实测计时） |
| 4 | **版本化目前被数据库物理阻塞。** `agent_artifacts` 的 `UNIQUE KEY uk_dedup(dedup_anchor)`（= `sha256(session_id\0rel_path)`）＋ `Upsert` 的 `DoUpdates` 覆盖 `content_sha256`/`storage_key` ⇒ 同一路径每次改写**原地销毁前一版**，MinIO 对象也同 key 覆盖。用户说的「修改不到 / 改错了」在当前架构下**不可恢复** | 高（迁移 SQL + Go 代码） |
| 5 | **`out/` 泄漏的清洗函数存在明显盲区。** `strip-container-paths.ts` 只处理 `./out/` 与容器绝对根，**刻意不处理裸 `out/`**；而用户投诉的原话「输出到 out 目录下」正好落在盲区里 | 高（代码 + 注释自陈） |

---

## 一、现状基线（本仓库实测，作为选型前提）

### 1.1 已有的预览子系统

`frontend-user/src/features/claw/components/preview/` 已经是一套完整的分派式预览器，不是空白：

| 文件 | 行数 | 职责 |
|---|---|---|
| `ClawArtifactPreview.tsx` | 361 | 按 category 分派渲染器 + 头部工具条（下载/导出） |
| `ClawArtifactPanel.tsx` | 113 | 右侧「扩展区」：列表态 ↔ 预览态两态切换 |
| `artifact-format.ts` | 130 | 纯函数：`kind`+MIME+扩展名 → `ArtifactCategory` |
| `DocxPreview.tsx` | 57 | mammoth 动态 import → HTML → DOMPurify |
| `SpreadsheetPreview.tsx` | 88 | SheetJS `sheet_to_json` → 只读表格 |

已覆盖的 category（`artifact-format.ts:8-21`）：
`image / svg / figure / pdf / html / markdown / spreadsheet / docx / json / code / text / archive / unpreviewable`

**懒加载纪律做得是对的**：`ClawArtifactPreview.tsx:24-33` 把 `PdfViewer`、`SpreadsheetPreview`、`FigureView`
用 `React.lazy` 切出去，`DocxPreview.tsx:19` 内部再动态 `import('mammoth')`。注释（`:21-23`）明确写了
理由「大多数会话从不打开这两类交付物」—— 这条纪律在下面的选型里必须保持。

### 1.2 三个真实缺口

**缺口 A — pptx 完全无预览。**
`artifact-format.ts:80-115` 的 `artifactCategory()` 分支里**没有任何 pptx 分支**，
`presentationml` 这个 MIME 串在整个文件里不出现。pptx 落到 `:114` 的 `return 'unpreviewable'`，
UI 显示「该文件类型暂不支持预览，请下载查看」（`ClawArtifactPreview.tsx:183`）。

讽刺的是 `shared/lib/agent-history.ts:427` 里**明确登记了** pptx 的 MIME，
`useComposerAttachments.ts:28` 也把 `.pptx` 列进上传白名单 —— 也就是说：
**用户可以上传 pptx、agent 可以产出 pptx，唯独没人能在站内看一眼。**

**缺口 B — 数据模型里没有任何版本/时间/缩略图字段。**
`api/artifacts.ts:19-35` 的 `ClawArtifact` 接口全部字段：
`id / path / name / kind / mime / size / title / description`。
没有 `created_at`、没有 `version`、没有 `thumbnail_url`、没有 `sha256`。
前端就算想做版本条也无米下锅。

**缺口 C — `path` 字段把容器内部路径直接发给前端。**
`api/artifacts.ts:23` 的注释自陈：`/** 相对会话 cwd: 文件 out/xxx.md, 目录 out/proj; ... */`。
这个 `path` 同时是 `TurnArtifacts.tsx` 的 React `key`（`key={a.path}`）和下载 URL 的查询参数
（`agentArtifactUrl` → `params.set('path', path)`），属于**协议层就把 `out/` 焊进去了**。

### 1.3 `out/` 清洗函数的盲区（用户投诉直接命中）

`shared/lib/strip-container-paths.ts` 的两条正则：

```
:14  const REL_OUT = /`?\.\/out\/([^\s`)）]+)`?/g;          // 要求显式 ./ 前缀
:16  const ABS_CONTAINER = /`?\/(?:home|workspace|app|root|srv|mnt|data)\/[^\s`)）]+`?/g;
```

`:9-10` 的注释是**主动声明**的取舍：

> 「**不碰裸 `out/`**（可能是 checkout/ layout/ 的一部分）、不碰普通 prose」

于是：

| agent 实际会说的话 | 是否被清洗 |
|---|---|
| `已保存到 ./out/综述.md` | ✅ 清洗 |
| `/home/bun/session/out/a.csv` | ✅ 清洗 |
| **`文件已输出到 out 目录下`** | ❌ **原样透出** ← 用户投诉原话 |
| **`保存在 out/report.docx`** | ❌ 原样透出（快路径判 `/out/` 需要 out 前面有斜杠） |
| `请查看 out 文件夹` | ❌ 原样透出 |

快路径判据 `:28` 是 `text.indexOf('/out/') < 0`，对 `out/report.docx` 而言 `/out/`
子串**不存在**（out 前面没有斜杠），因此连正则都不会跑。

清洗只挂在 3 个渲染点（`MessageTurn.tsx:291,321`、`PrismMessageTurn.tsx:113,128`、
`ToolCallBlock.tsx:230`），**不覆盖 artifact 卡片本身**，而卡片的 `path` 恰恰就是 `out/xxx`。

> 📌 这条属于「机制正确但覆盖不足」，不是设计失误。注释里写的「宁可漏清洗，不可误伤正文」
> 是合理取舍。但它把**兜底**当成了**主机制**在用 —— 注释 `:4-6` 自己说主机制是
> 「提示词铁律（禁念路径）」，而提示词对微调固化表达无法 100% 根治，这一点注释也承认了。
> **真正的解法不是加正则，是让 `out/` 这个概念根本不进入协议层**（见 §七）。

---

## 二、外部产品的「工作区」呈现范式

### 2.1 四家的做法

| 产品 | 文件呈现 | 预览 | 面向谁 |
|---|---|---|---|
| **bolt.new** | 完整文件树 + 编辑器 + 终端，全部跑在浏览器内的 WebContainer 虚拟机 | 右侧实时运行中的 app | 开发者 |
| **v0 (Vercel)** | 不给文件树，给 **Blocks**：聊天内直接预览渲染结果，代码在侧栏可切换 | 「live preview instantly，代码在 side panel」 | 半技术 |
| **Lovable** | 有 Code 视图（左侧文件树 + 展开/折叠全部 + 标签页 + Cmd+Shift+F 全局搜索），但**默认不打开** | 实时 app 预览 + Visual Edits（Figma 式点选改样式） | **非技术** |
| **Replit Agent** | 完整 IDE | 运行中的 app | 开发者 |

来源：
[bolt.new/WebContainer](https://newsletter.posthog.com/p/from-0-to-40m-arr-inside-the-tech) ·
[v0 Blocks](https://v0.dev/faq) ·
[Lovable Code Mode](https://docs.lovable.dev/features/code-mode) ·
[Lovable Visual Edits](https://lovable.dev/blog/introducing-visual-edits)

### 2.2 🔴 最重要的一条结论

Lovable 是这四家里唯一明确把「非技术用户」写进产品定位的，它的官方文档在描述代码视图时说：

> **"most people never open the code editor"** —— 并进一步说明理解代码是不必要的，
> 代码编辑器是**可选的检查/协作工具，不是使用产品的前提**。
> （[docs.lovable.dev/features/code-mode](https://docs.lovable.dev/features/code-mode)）

也就是说：**连一个「产物本身就是代码」的产品，都不指望用户看文件树。**

我们的产物是综述、三线表、演示稿、科研图 —— 文件系统对用户的信息价值比 Lovable 那边**更低**。
把「加一棵文件树」当作「让用户看得到文件」的解法，方向是反的：
它会让 `out/` 这个内部概念从「偶尔在正文里漏出来」升级成「常驻 UI 一等公民」。

> ⚠️ 因此 `frontend-user/CLAUDE.md:107` 表里那条「树 → `react-arborist`」在本场景**不该被触发**。
> 另注：`react-arborist` 虽在必用表里，但**当前并未安装**（`package.json` 里搜不到，
> `src/` 下零引用）—— 表里列的是「若要做树则用它」，不是「已经在用」。

### 2.3 Manus 的 Library：更贴近我们的范式

Manus 1.5 引入的 **Library**：

> "The new Library provides a centralized location for all your generated files and artifacts,
> making it easier to organize and access your work."
> （[manus.im/blog/manus-1.5-release](https://manus.im/blog/manus-1.5-release)）

配合其三栏布局（左=会话列表 / 中=工作区 / 右=实时预览与产物输出），检索到的描述提到
Library 具备**跨会话聚合、类型筛选、搜索、收藏、预览、跳回来源任务**。

**这才是我们该抄的形态**：不是「会话内的文件树」，而是「**跨会话的成果库**」——
产物是**用户的东西**，不该跟着 agent 会话的生命周期走。

> 🔴 对照本仓库：`api/artifacts.ts:5` 注释写着
> 「生命周期 = 会话生命周期 (会话删/重置即清)」。
> 用户辛苦生成的综述，会话一重置就没了 —— 这与「成果库」范式直接冲突。

---

## 三、产物版本化

### 3.1 外部交互形态对照

| 产品 | 版本创建 | 切换 UI | 回滚 | 差异展示 |
|---|---|---|---|---|
| **ChatGPT Canvas** | 每次编辑自动 | 左右箭头「上一版/下一版」 | 底部「Restore this version」 | 时钟图标「Show changes」：删除=红色划掉，新增=绿色高亮 |
| **Claude Artifacts** | 每次迭代自动存前一版 | 版本历史面板 | 「restore an earlier version」 | 「compare an earlier version with the current one」 |
| **v0** | 每次迭代 | 右上角「Version N」下拉 | 回滚到任意早期版本**且不丢后续工作** | 每条 config 消息带 Revert 按钮 |
| **Lovable (History 2.0)** | 自动 + 手动书签 | 历史视图 | 一键还原 | 「what changed and when」 |

来源：
[Canvas 版本历史](https://zapier.com/blog/chatgpt-canvas/) ·
[Claude Artifacts 版本历史](https://support.claude.com/en/articles/14729249-use-live-artifacts-in-claude-cowork) ·
[v0 版本回滚](https://vercel.com/academy/vercel-foundations/v0-way) ·
[Lovable History 2.0](https://lovable.dev/blog/versioning-dev-mode)

**共性提炼（四家全有）**：
1. 版本**自动产生**，不要求用户主动保存 —— 用户不会记得存
2. 切换是**线性时间轴**（前/后箭头或下拉），不是 git 式 DAG
3. 「恢复」是**新增一版**而非截断历史（v0 明说「without losing later work」）
4. **差异可视化是标配**，且是"红删绿增"的朴素形态，不是 git diff 三路合并

### 3.2 🔴 我们的硬阻塞：数据库层就不允许存在第二版

`docker/mysql/migrations/0025_agent_artifacts.sql`：

```sql
`rel_path`       VARCHAR(512) NOT NULL   COMMENT '相对会话 cwd 的路径,如 out/report.md(收割键)',
`content_sha256` CHAR(64)     NOT NULL DEFAULT ''  COMMENT '内容 sha256,用于跳过未变更文件的重传',
`storage_key`    VARCHAR(640) NOT NULL DEFAULT ''  COMMENT 'MinIO 对象 key(owner/session/relpath)',
`dedup_anchor`   CHAR(64)     NOT NULL   COMMENT 'sha256(session_id\0rel_path),Go 侧算,做唯一收割键',
...
UNIQUE KEY `uk_dedup` (`dedup_anchor`),
```

配合 `backend/internal/agentartifact/repository.go:26-34`：

```go
func (r *Repository) Upsert(a *Artifact) error {
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "dedup_anchor"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"filename", "mime", "size_bytes", "content_sha256", "source_sig",
			"storage_key", "title", "description", "kind", "updated_at",
		}),
	}).Create(a).Error
}
```

**推论链**：
1. `dedup_anchor = sha256(session_id ‖ rel_path)` 与内容无关 ⇒ 同一路径永远同一个 anchor
2. `uk_dedup` 是 UNIQUE ⇒ 同一 (session, path) **物理上只能有一行**
3. `DoUpdates` 覆盖 `content_sha256` ⇒ 旧版本的内容指纹被抹掉
4. `storage_key` 注释写明是 `owner/session/relpath` —— **确定性路径、非内容寻址** ⇒
   MinIO 对象在同一 key 上被覆盖，旧字节也没了

**结论**：agent 第二次 `Write out/report.docx` 时，**行被改、对象被覆盖，前一版在 DB 和 MinIO 两侧同时消失**。
用户说的「进行编辑文件也容易出现错误，修改不到」——
即使我们把编辑做对了，**改坏了也没有任何退路**，因为退路在存储层就不存在。

**这是做版本化的第一块必须搬开的石头，且它是 schema 级改动，不是 UI 改动。**

修法方向（最小侵入）：把 `storage_key` 改成**内容寻址**（`owner/session/<sha256>`），
`agent_artifacts` 拆成 `artifact`(身份) + `artifact_version`(版本) 两张表，
`uk_dedup` 从 artifact 表退化为「当前指针」。内容寻址还顺带白拿去重
（同一份字节在多会话/多版本只存一份）。

---

## 四、文档预览技术选型

### 4.1 候选对照表（**全部为本次实测**）

> gzip 体积来自 bundlephobia API（含依赖打包）；周下载来自 `api.npmjs.org`；
> 许可证/最后发布来自 `npm view`。测量时间 2026-08-07。

| 库 | 目标格式 | gzip | 依赖数 | 许可证 | 周下载 | 最后发布 | 门槛(§2) |
|---|---|---|---|---|---|---|---|
| **docx-preview** | docx | **47 KB** | 1 (jszip) | Apache-2.0 | **1,328,588** | 2026-07-07 | ✅ 全过（甚至 ≤50KB 免动态 import） |
| mammoth *(已装)* | docx | 120 KB | 10 | BSD-2-Clause | 7,142,003 | 2026-03-12 | ⚠️ 超 50KB，需动态 import（已做） |
| **pptxviewjs** | pptx | 144 KB | **0** | MIT | 40,539 | 2026-03-22 | ✅ 过（需动态 import） |
| pptx-preview | pptx | 383 KB | 5 | ISC | 81,521 | **2025-10-17** | ❌ **超 6 个月未更新** |
| pptx-previewer | pptx | — | — | MIT | **2** | 2026-03-24 | ❌ 周下载 2，远低于 10k |
| xlsx *(已装)* | xlsx/csv | ~250 KB | — | Apache-2.0 | (CDN 分发) | — | ⚠️ 已装，走动态 import |
| xlsx-preview | 带样式 xlsx | — | — | MIT | 6,536 | 2026-01-24 | ❌ 周下载 <10k |
| exceljs | 带样式 xlsx | 250 KB | 9 | MIT | 13,070,602 | — | ✅ 过（需动态 import） |
| @js-preview/* | 全家桶 | — | — | MIT | — | — | ❌ Vue 组件库，与 React 栈不符 |
| react-pdf *(已装)* | pdf | ~800KB(含 pdfjs) | — | MIT | — | — | ✅ 已装并已 lazy |

### 4.2 选型建议

#### 🟢 建议 1：`mammoth` → `docx-preview`（严格占优，优先级最高）

| 维度 | mammoth（现状） | docx-preview（建议） | 结论 |
|---|---|---|---|
| gzip 体积 | 120 KB | **47 KB** | **-61%** |
| 依赖数 | 10 | 1 | 供应链面收窄 |
| 许可证 | BSD-2-Clause | Apache-2.0 | 均可商用；Apache-2.0 另带专利授权 |
| 保真度 | 「牺牲复杂版式换内容准确」，产出**语义化 HTML** | **分页 / 页眉页脚 / 脚注尾注 / 编号 / 表格 / 图片 / 修订** | 见下 |
| 周下载 | 714 万 | 133 万 | 均远超门槛 |
| 维护 | 2026-03 | **2026-07** | 更活跃 |

**保真度差异为什么对我们特别关键**：
我们的 docx 产物是 **stat_lab 的三线表**和综述稿 ——
`mammoth` 的设计目标是「提取干净的 HTML/纯文本」，它会**主动丢弃**表格边框样式、
页眉页脚、分页。用户打开预览看到的东西**和他下载后在 Word 里看到的不是一回事**，
而「结果 → 合规交付物」正是这条产品线的卖点。

`docx-preview` 官方 README 列明支持：pages / headers & footers / footnotes & endnotes /
numbering / 分页（手动与编辑器插入的断点）/ 修订标记（实验）。
（[README](https://github.com/VolodymyrBaydalka/docxjs#readme)）

**已知限制（必须写进代码注释）**：
- 不支持目录（TOC）生成 —— 缺少 field 支持
- **不含缩略图能力**（README 明说 "Thumbnails aren't part of the library"）→ 缩略图必须服务端做，见 §五
- 不做实时分页（性能考量），依赖文档内已有的分页符

**迁移成本极低**：`mammoth` 全仓**唯一调用点**是 `DocxPreview.tsx:19-21`（已实测 grep 确认），
57 行的组件，API 从 `convertToHtml({arrayBuffer})` 换成 `renderAsync(blob, container, styleContainer, opts)`。

> ⚠️ 一个必须处理的差异：`docx-preview` 是**直接往 DOM 容器里渲染**（`renderAsync` 收 container 元素），
> 而不是返回 HTML 字符串。现有 `DocxPreview.tsx` 的
> 「mammoth → HTML 字符串 → DOMPurify → dangerouslySetInnerHTML」链路要改成 ref 容器模式。
> **安全性反而更好**（不再拼 HTML 字符串），但要确认 docx-preview 自身对恶意 docx 的转义
> —— 它渲染的是我们 agent 自己产出的文件，风险等级低于用户上传，但 stat_lab 会读用户数据，
> 建议保留一层 `sandbox` 或在 `renderAsync` 后对容器做一次 DOMPurify 清扫。

#### 🟡 建议 2：pptx 预览 —— **不要装库，走服务端转 PDF 复用现有 PdfViewer**

三个候选都不理想：

- `pptx-preview` 383KB gzip 且**近 10 个月未发布**，直接卡在 `CLAUDE.md:120`「近 6 个月有 commit」这条门槛上
- `pptx-previewer` 周下载 **2 次**，卡在 `:119` 的 10k 门槛
- `pptxviewjs` 各项达标（144KB / MIT / 40.5k周下载 / 2026-03），是**唯一合规的纯前端选项**，
  但 Canvas 渲染 pptx 的保真度是出了名的难保证（字体替换、SmartArt、动画一律丢失）

**更好的路**：我们**已经有** `react-pdf` + `pdfjs-dist`（已装、已 lazy、已配 CJK CMap）。
pptx → PDF 在服务端做（§五证明零新依赖且很快），前端**一行新代码都不用写**
—— 只需在 `artifact-format.ts` 加一个分支，让 pptx 走 `pdf` 渲染器 + 一个 `preview_pdf_url` 字段。

| 方案 | 前端新增体积 | 保真度 | CJK 字体 | 新依赖 |
|---|---|---|---|---|
| pptxviewjs | +144 KB gzip | 中（Canvas 重绘） | 靠浏览器字体，易替换错 | 1 个 npm 包 |
| **服务端转 PDF + 复用 PdfViewer** | **0** | **高**（PDF 内嵌字体） | 容器已装 `fonts-noto-cjk` | **0** |

对一个中文科研产品，**CJK 字体这一条就足以定案**。

#### 🟡 建议 3：xlsx 保持 SheetJS，但知道它丢了什么

`SpreadsheetPreview.tsx:31` 用的是：

```ts
XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' });
```

`sheet_to_json` **只取值**，丢弃：合并单元格、数字格式（小数位/百分号）、边框、填充色、列宽。
对**三线表**而言，「三条线」正是它唯一的视觉规范 —— 预览里全丢了。

> 注：这不是用法错误，是 SheetJS **CE 版（Apache-2.0）刻意不含样式解析**（样式在付费的 Pro 版）。
> 已实测本仓库装的是 `xlsx@0.20.3 / Apache-2.0`，且从 `cdn.sheetjs.com` tarball 装
> （`package.json` 的 `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`）
> —— SheetJS 已撤出 npm registry，这条 URL 依赖是**供应链单点**，值得单独留意。

若要样式保真：`exceljs`（250KB gzip / MIT / 1307万周下载）能读 fills/borders/numFmt。
但 250KB 只为了给表格画三条线，**性价比不高**。
更划算的是**在生成侧解决**：既然三线表是我们自己用 pandoc/python 产出的，
让它**同时**产出一份 PDF/PNG 预览版即可 —— 与建议 2 同一个机制，一次投入两处受益。

#### 🔴 建议 4：不要引入 `@js-preview/*` 全家桶

`@js-preview/docx`(553KB unpacked) / `excel`(3.4MB) / `pdf`(4.7MB) 都是 MIT，看起来省事，
但它是 **Vue 2/3 组件库**（`vue-office` 项目），与我们 React 19 栈不符，
且 `pdf` 那个内部自带一份 pdfjs —— **会和已装的 `pdfjs-dist` 双份并存**。

---

## 五、缩略图 / 首屏预览图的服务端生成

### 5.1 🟢 实测结论：今天就能做，零新依赖

在**运行中的** `scholar_agent` 容器里实测（`docker exec scholar_agent`）：

```
/usr/bin/pdftoppm          ← pdftoppm version 25.03.0
/usr/bin/pdftocairo
/usr/local/bin/pandoc      ← 3.10.1（vendor 进仓库的上游版）
/usr/bin/chromium
/usr/bin/weasyprint
（soffice / libreoffice → 未安装）
```

Dockerfile 的对应依据：
- `agent/Dockerfile:20` — `bubblewrap ca-certificates poppler-utils pandoc python3 ...`
- `agent/Dockerfile:21` — `chromium fonts-noto-cjk`
- `agent/Dockerfile:144` — `weasyprint`
- `agent/Dockerfile:156-160` — vendor pandoc 3.10.1，并在构建期 `grep -qx pptx` / `grep -qx xlsx`
  **硬校验输入 reader 存在**（注释 `:147-149` 记录了 Debian apt 版 3.1 只有 writer 没有 reader 的坑）

**端到端计时实测**（同容器内，中文 + 表格样本）：

| 步骤 | 命令 | 耗时 | 产物 |
|---|---|---|---|
| md → docx | `pandoc s.md -o d.docx` | — | 10,648 B |
| **docx → pdf** | `pandoc d.docx --pdf-engine=weasyprint -o d.pdf` | **1951 ms** | 160,866 B |
| **pdf → png 缩略图** | `pdftoppm -png -r 50 -f 1 -l 1 -scale-to-x 400 d.pdf th` | **33 ms** | 4,426 B |
| md → pptx | `pandoc s.md -o p.pptx` | — | 27,897 B |
| **pptx → pdf** | `pandoc p.pptx --pdf-engine=weasyprint -o p.pdf` | ✅ 成功 | 160,854 B |
| pptx-pdf → png | `pdftoppm ... p.pdf pth` | **18 ms** | 4,051 B |

**光栅化那一步只要 18~33ms、产物 4KB** —— 缩略图这件事本身几乎免费，
成本全在「转 PDF」的 ~2s，而且那一步**天然可缓存**（内容寻址后按 sha256 缓存，同一版只转一次）。

### 5.2 各来源的最优路径

| 产物来源 | 缩略图路径 | 新增成本 |
|---|---|---|
| **PDF**（已有） | `pdftoppm` 直接取第 1 页 | **0**，33ms |
| **HTML 演示稿**（boltslides） | `agent/src/render/deckpptx.ts` **已经在逐张 chromium 截图**（`:76`、`:133` 的 `--screenshot=`），第 1 张 PNG 白拿 | **0** |
| **docx**（stat_lab 三线表 / 综述） | pandoc→weasyprint→pdftoppm | 0 新依赖，~2s，可缓存 |
| **pptx** | 同上（pandoc 3.10.1 有 pptx reader，已实测通过） | 0 新依赖 |
| **图片 / SVG** | 本身即缩略图 | 0 |
| **xlsx** | pandoc 有 xlsx reader（Dockerfile:160 已硬校验）→ 同链路 | 0 新依赖 |

> ⚠️ **诚实标注一个保真度折扣**：`pandoc docx→pdf` 走的是 pandoc 自己的语义重排（docx→HTML→weasyprint），
> **不是** docx 原始版式的忠实再现。字体、页边距、表格线宽都会与 Word 里不同。
> 作为**缩略图**（400px 宽、给用户一个「这是张表 / 这是段文字」的形状感知）完全够用；
> 作为**全文预览的替代**则不够 —— 全文预览仍应由 `docx-preview` 在前端做（§4.2 建议 1）。
> 两者是互补关系，不是二选一。

### 5.3 🔴 为什么不要 LibreOffice / Gotenberg

调研里 Gotenberg 被普遍推荐（12k+ star，事实标准），但对我们是**负收益**：

| 维度 | 引入 Gotenberg/LibreOffice | 现有链路 |
|---|---|---|
| 镜像体积 | 全镜像捆绑 Chromium + LibreOffice + QPDF + pdfcpu + PDFtk + ExifTool | 已有，+0 |
| 内存 | 官方建议**最低 1024 MB** | +0 |
| **并发** | 🔴 官方文档明说 **"a LibreOffice instance cannot execute parallel operations"**，靠队列串行，扩容只能加实例 | pdftoppm/pandoc 均可并行 |
| 运维 | 多一个容器、多一套健康检查与配额 | 复用 scholar_agent |
| 网络 | 生产环境 clash fake-ip 拉镜像本就吃力（`Dockerfile:13` 注释记录过 pandoc 拉取超时） | 无新拉取 |

来源：[Gotenberg 配置文档](https://gotenberg.dev/docs/configuration)

LibreOffice 的**唯一真实优势**是「对 Office 原生版式的高保真」。
但我们 95% 的 Office 产物**是我们自己生成的**（pandoc / python-docx / pptxgenjs）——
我们完全知道它们长什么样，不需要一个通用高保真引擎去逆向理解它们。
只有「用户上传的第三方 docx/pptx」才真需要 LibreOffice，而那是**低频、且已有 pandoc 读取兜底**的场景。

**结论：不引入。** 若将来确有需要，优先选 `gotenberg:8-libreoffice` 变体（比全镜像小 ~38%），
而不是全镜像。

---

## 六、「下载」之外的交付出口

用户是中国科研人员，Google Drive / Dropbox 这类出口价值极低。按 ROI 排序：

| 出口 | 复用什么 | 新增成本 | 价值 |
|---|---|---|---|
| **① 存进文献集 / 成果库** | `internal/library` 已有完整的文件集 + 文件夹模型 | 中 | 🟢 **最高**：直接解决 §2.3 的「会话删即清」，产物变成用户资产 |
| **② 分享链接** | 🟢 **已经有现成的**：`library` 分享（提取码 + 过期 + 转存，migration 0032 + `/s/:token` 路由） | **低** | 🟢 高：科研协作强需求（发给导师/合作者） |
| **③ 站内信 / 邮件送达** | `internal/message`（站内信）+ `internal/support`（已接 IMAP/邮件） | 低 | 🟡 中：长任务完成通知的天然载体 |
| **④ 打包整会话产物 zip** | `agentArtifactZipUrl` 已实现目录打包（`api/artifacts.ts:99-106`） | **≈0** | 🟡 中：只需把「整个会话」也做成一个可打包单元 |
| ⑤ 微信 / 企微推送 | `internal/wechatofficial` 有公众号通道 | 中 | 🟡 中：但公众号被动回复有 5s 限制（见记忆），需模板消息 |
| ⑥ 第三方网盘 | 无 | 高 | 🔴 低：OAuth 逐家对接，国内网盘 API 门槛高 |

> 🟢 **②是本次调研发现的最大「白拿」**：分享链路（提取码/过期/转存）在
> `library` 里已经是生产可用的完整实现，把 artifact 接进同一套分享模型，
> 边际成本主要是接线，不是从零设计。

---

## 七、建议架构

### 7.1 核心主张

> **不要做「文件浏览器」，要做「成果卡」。**
> 用户要的不是「看到 out 目录」，是「看到我要的那份东西，并且能带走它」。

三条设计原则：

1. **`out/` 不是用户概念，不进协议层。**
   彻底修法不是加正则清洗，而是**在后端出口就把 `rel_path` 换成不透明 ID**
   （artifact 已经有 `id`，前端也已经优先走 `/artifact/:id`）。
   把 `ClawArtifact.path` 从 DTO 里**删掉**，`TurnArtifacts` 的 React key 换成 `id`，
   下载 URL 只留 by-id 形态 —— 泄漏面在结构上消失，正则清洗退化为纯兜底。
   （注：`path` 目前还承担「storage 未启用时的实时回退」，需先确认该回退路径的存废。）

2. **产物脱离会话生命周期。**
   `agent_artifacts` 挂 `owner_id` 已经有了，缺的是「不随会话删除而清」的语义 + 一个跨会话的成果库入口。
   这同时解决 §2.3 与出口①。

3. **版本是自动的、线性的、可比较的。**
   照抄 Canvas/v0 的最小集：前后箭头 + 「恢复此版本」+ 红删绿增 diff。
   不做 git 式分支。

### 7.2 分期

**P0 — 止血（不动 schema，成本最低，直接对上用户三条投诉）**

| 项 | 动作 | 对应投诉 |
|---|---|---|
| P0-1 | `artifact-format.ts` 加 pptx 分支 + 后端出 `preview_pdf_url`（pandoc→pdf，§5 已验证），复用 `PdfViewer` | 「看不到」 |
| P0-2 | `mammoth` → `docx-preview`（-73KB gzip，保真更高） | 「看不到」（看到的和下载的不一样） |
| P0-3 | 补 `strip-container-paths` 的裸 `out/` 盲区 + **扩到 artifact 卡片渲染路径** | 「out 目录暴露」 |
| P0-4 | DTO 去 `path`，全量走 by-id | 「out 目录暴露」（根因） |

**P1 — 版本化（需 schema 手术）**

| 项 | 动作 |
|---|---|
| P1-1 | `storage_key` 改内容寻址（`owner/session/<sha256>`），顺带白拿跨版本去重 |
| P1-2 | 拆 `agent_artifacts` → `artifact` + `artifact_version`，`uk_dedup` 退化为「当前版本指针」 |
| P1-3 | 版本条 UI：前后箭头 + 恢复（恢复=新增一版，不截断） |
| P1-4 | 文本类产物的红删绿增 diff（`diff@9` **已在 package.json**，零新依赖） |

**P2 — 成果库与出口**

| 项 | 动作 |
|---|---|
| P2-1 | 缩略图流水线（§5 链路）+ `thumbnail_key` 字段，成果卡从「文件名一行」升级为「带首屏图的卡」 |
| P2-2 | 跨会话成果库页（Manus Library 范式：类型筛选 / 搜索 / 收藏 / 跳回来源会话） |
| P2-3 | 接 `library` 现成分享链路（提取码 + 过期 + 转存） |

### 7.3 不做的事（及理由）

| 不做 | 理由 |
|---|---|
| 文件树（`react-arborist`） | §2.2：连 Lovable 都说「most people never open the code editor」；文件树会把 `out/` 升级成一等公民 |
| LibreOffice / Gotenberg | §5.3：+1GB 镜像 + 1GB 内存 + **LibreOffice 无法并行**，换来的高保真我们用不上（产物是自己生成的） |
| pptx 前端渲染库 | §4.2：唯一合规的 pptxviewjs 也要 +144KB 且 CJK 字体易错；服务端转 PDF 前端零新增 |
| `exceljs` 换 SheetJS | §4.2：250KB 只为画三条线；应在生成侧出预览版 |
| `@js-preview/*` | Vue 组件库，且内嵌第二份 pdfjs |
| git 式分支版本 | 四家竞品无一这么做，用户心智不匹配 |

---

## 附录 A · 数据来源与复现命令

```bash
# 体积（bundlephobia，含依赖打包）
curl -s "https://bundlephobia.com/api/size?package=docx-preview" -H 'User-Agent: Mozilla/5.0'

# 周下载
curl -s "https://api.npmjs.org/downloads/point/last-week/docx-preview"

# 许可证 / 最后发布
npm view docx-preview license time.modified

# 容器内工具链（需 scholar_agent 在跑）
docker exec scholar_agent sh -c 'which pdftoppm pdftocairo pandoc chromium weasyprint soffice libreoffice'

# 缩略图链路端到端复现
docker exec scholar_agent sh -c '
cd /tmp && mkdir -p tt && cd tt
printf "# 标题\n\n正文中文测试.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n" > s.md
pandoc s.md -o d.docx
pandoc d.docx --pdf-engine=weasyprint -o d.pdf
pdftoppm -png -r 50 -f 1 -l 1 -scale-to-x 400 -scale-to-y -1 d.pdf th
ls -l th-1.png'
```

## 附录 B · 外部来源

- [Lovable — Code Mode 文档](https://docs.lovable.dev/features/code-mode)（「most people never open the code editor」）
- [Lovable — Visual Edits](https://lovable.dev/blog/introducing-visual-edits)
- [Lovable — History 2.0 / Dev Mode](https://lovable.dev/blog/versioning-dev-mode)
- [bolt.new 技术内幕（PostHog）](https://newsletter.posthog.com/p/from-0-to-40m-arr-inside-the-tech)
- [v0 FAQ — Blocks](https://v0.dev/faq)
- [v0 版本与回滚（Vercel Academy）](https://vercel.com/academy/vercel-foundations/v0-way)
- [ChatGPT Canvas 版本历史（Zapier）](https://zapier.com/blog/chatgpt-canvas/)
- [Claude Artifacts 版本历史](https://support.claude.com/en/articles/14729249-use-live-artifacts-in-claude-cowork)
- [Manus 1.5 发布（Library）](https://manus.im/blog/manus-1.5-release)
- [Gotenberg 配置文档（LibreOffice 并发限制）](https://gotenberg.dev/docs/configuration)
- [docx-preview README](https://github.com/VolodymyrBaydalka/docxjs#readme)
