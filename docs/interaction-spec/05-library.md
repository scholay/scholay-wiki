# 05 · 文献集 交互明细

> 列定义见 [README](README.md)。Ground truth = 前端代码实际行为（非设计图）。

## PART 1 — 页面/流程概要

- **路由**：`/library` 与 `/library/:libraryId`。`LibraryPage` 通过 `useParams().libraryId` 取激活集；未带参数时默认取 `libraries[0]?.id`（`LibraryPage.tsx:19-21`）。
- **整体布局**：左右两栏 flex 布局。左为侧栏（`LibrarySidebar`，固定 `w-60`），右为内容区（工具栏 + 论文表格/空态/加载/错误）。详情抽屉、添加弹窗、PDF 导入向导、对比矩阵、批量条、导入进度 Toast 均为浮层，挂在页面根节点（`LibraryPage.tsx:67-167`）。

### 区域
1. **侧栏文献集树**（`LibrarySidebar`）：标题「我的文献集」+ 新建按钮；内联新建表单；文献集列表（Link 跳转 + 激活态 + 篇数角标）。
2. **工具栏**（`LibraryToolbar`）：集名 + 篇数；搜索框；排序下拉；列设置菜单（`ColumnsMenu`）；矩阵开关；导入 PDF；添加文献。
3. **论文表格**：表头全选复选框 + 动态列；`PaperRow` 行（行内复选框 + 各列单元格 + 状态/标签 chip）。
4. **详情抽屉**（`PaperDetailDrawer`）：右侧 480px，标题 + 3 个 tab（摘要/笔记/引用）+ 底部原文/PDF 链接。
5. **对比矩阵**（`MatrixPanel`）：右侧 640px 面板，固定 4 维度（方法/数据集/指标/结论）表格。
6. **批量条**（`BatchActionsBar`）：选中 >0 时浮于底部居中，含 标签/导出/删除/取消。
7. **添加文献弹窗**（`AddPaperDialog`）：DOI / 手动录入两模式。
8. **PDF 导入向导**（`PdfImportWizard`）：3 步（选择文件 → 确认信息 → 导入）。
9. **导入进度 Toast**（`ImportProgressToast`）：右下角浮层，列出导入任务。

### 核心流程
- **新建文献集**：侧栏 + → 内联输入 → 创建（`useCreateLibrary` mutation）→ 成功后清空并收起表单 + 失效 `libraries` 查询。
- **添加论文**：工具栏/空态「添加文献」→ 弹窗选 DOI 或手动 → 提交（`useAddPaper` mutation）→ 成功后关闭弹窗 + 失效论文查询。
- **PDF 导入向导**：工具栏「导入 PDF」→ 选文件（仅 application/pdf）→ 确认/编辑标题、移除 → 开始导入（`startImport` 模拟进度）→ Step3 完成。
- **批量操作**：勾选行 → 底部批量条 → 标签/导出/删除（删除仅清空选中，导出/标签为空函数）。
- **打开抽屉**：点击行单元格 → 抽屉展示，切 tab，Esc/遮罩/×关闭。
- **列设置**：列菜单勾选/取消列，按 `ALL_COLUMNS` 顺序保序。
- **矩阵**：工具栏「矩阵」开关右侧对比面板。

### 实现状态
- **全部数据为 mock**：`api/libraries.ts`、`api/papers.ts` 顶部明确注释「Mock data — no real backend wired up yet (TODO: replace with API client)」，用 `setTimeout` 模拟延迟。
- **react-query** 已接线（`useLibraries`/`useCreateLibrary`/`useLibraryPapers`/`useAddPaper`），但 queryFn 指向 mock。
- **导入进度** 为纯前端 `useSyncExternalStore` + `setInterval` 模拟，无后端（`useImportProgress.ts:40`）。
- **未实现/空操作**：批量删除/导出/加标签、笔记保存（textarea 仅 defaultValue 无保存）、搜索仅前端过滤、排序仅前端、PDF 拖拽（label 仅 click，无 drop handler）。

## PART 2 — 元素级交互表

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| LIB-001 | 侧栏 | 「新建文献集」+ 按钮 | 点击 | — | 切换内联新建表单显隐（`setCreating(v=>!v)`） | — | 纯前端 | `LibrarySidebar.tsx:37` |
| LIB-002 | 侧栏 | 新建名称输入框 | 输入 | 表单已展开 | 更新 `name` state | — | 纯前端 | autoFocus；`LibrarySidebar.tsx:46-56` |
| LIB-003 | 侧栏 | 新建名称输入框 | 按 Enter | 表单已展开 | 调用 `handleCreate`（同创建按钮） | name 为空（trim 后）直接 return 不提交 | `useCreateLibrary` mutation（mock） | `LibrarySidebar.tsx:51` |
| LIB-004 | 侧栏 | 新建名称输入框 | 按 Esc | 表单已展开 | 收起表单（`setCreating(false)`） | 不清空 name | 纯前端 | `LibrarySidebar.tsx:52` |
| LIB-005 | 侧栏 | 「创建」按钮 | 点击 | 表单已展开 | 触发 createLibrary mutation；成功后清空 name + 收起表单 | name 空或 isPending 时按钮 disabled（`opacity-50`）；空名 trim 后 return | `useCreateLibrary`→`createLibrary`（mock，延迟 300ms，invalidate `['libraries']`） | mock；文案 isPending 时显示「创建中…」；`LibrarySidebar.tsx:58-65` |
| LIB-006 | 侧栏 | 「取消」按钮 | 点击 | 表单已展开 | 收起表单（`setCreating(false)`） | 不清空 name | 纯前端 | `LibrarySidebar.tsx:66-72` |
| LIB-007 | 侧栏 | 文献集列表项（Link） | 点击 | 列表非空 | 路由跳转 `/library/{lib.id}`，该项变激活态（`bg-primary/10`+FolderOpen 图标） | — | mock `useLibraries` 数据 | `LibrarySidebar.tsx:87-103` |
| LIB-008 | 侧栏 | 文献集列表区 | 加载 | librariesLoading=true | 显示旋转 Loader2 +「加载中…」 | — | `useLibraries` isLoading | `LibrarySidebar.tsx:77-80` |
| LIB-009 | 侧栏 | 文献集列表区 | 空数据 | libraries.length=0 | 显示「暂无文献集」 | — | `useLibraries` | `LibrarySidebar.tsx:81-82` |
| LIB-010 | 侧栏 | 列表项篇数角标 | 展示 | — | 显示 `lib.paperCount ?? 0` | paperCount 缺省显示 0 | mock | `LibrarySidebar.tsx:100-102` |
| LIB-011 | 工具栏 | 集名 + 篇数 | 展示 | — | 显示 `library?.name ?? '文献集'` 与 `paperCount ?? 0 篇文献` | 无激活集时回退「文献集」/0 | mock `activeLibrary` | `LibraryToolbar.tsx:36-41` |
| LIB-012 | 工具栏 | 搜索框 | 输入 | — | 更新 `query`，论文表格按标题/作者前端过滤（toLowerCase includes） | 空 query 不过滤；过滤后为空走空态 | 纯前端（`filteredPapers` useMemo） | `LibraryToolbar.tsx:45-50`；`LibraryPage.tsx:37-46` |
| LIB-013 | 工具栏 | 排序下拉 | 选择「最近添加」 | — | 按 `addedAt` 倒序（localeCompare） | addedAt 缺省按 '' 比较 | 纯前端 | 默认值 addedAt；`LibraryPage.tsx:50` |
| LIB-014 | 工具栏 | 排序下拉 | 选择「标题」 | — | 按 `title` 升序 localeCompare | — | 纯前端 | `LibraryPage.tsx:48` |
| LIB-015 | 工具栏 | 排序下拉 | 选择「年份」 | — | 按 `year` 倒序（`(b.year??0)-(a.year??0)`） | year 缺省按 0 | 纯前端 | `LibraryPage.tsx:49` |
| LIB-016 | 工具栏 | 列设置「列」按钮 | 点击 | — | 切换列菜单下拉显隐 | — | 纯前端 | `ColumnsMenu.tsx:29` |
| LIB-017 | 工具栏 | 列菜单遮罩层 | 点击 | 菜单已打开 | 关闭菜单（`setOpen(false)`） | — | 纯前端 | fixed inset-0 透明层；`ColumnsMenu.tsx:36` |
| LIB-018 | 工具栏 | 列菜单某列项（已显示） | 点击 | 该列在 visibleColumns | 移除该列（filter 掉），表格隐藏该列；右侧 Check 消失 | 可移除至全空（无下限保护） | 纯前端（`visibleColumns` state） | `ColumnsMenu.tsx:15-16` |
| LIB-019 | 工具栏 | 列菜单某列项（未显示） | 点击 | 该列不在 visibleColumns | 加入该列，并按 `ALL_COLUMNS` 顺序重排所有可见列 | — | 纯前端 | 保序逻辑 `ColumnsMenu.tsx:18-21` |
| LIB-020 | 工具栏 | 「矩阵」按钮 | 点击 | — | 切换 `matrixOpen`；开时按钮高亮（`bg-primary/10`）并打开右侧矩阵面板 | — | 纯前端 | `LibraryToolbar.tsx:62-70`；`LibraryPage.tsx:85` |
| LIB-021 | 工具栏 | 「导入 PDF」按钮 | 点击 | — | 打开 PDF 导入向导（`wizardOpen=true`） | — | 纯前端 | `LibraryToolbar.tsx:71-77` |
| LIB-022 | 工具栏 | 「添加文献」按钮 | 点击 | — | 打开添加文献弹窗（`addOpen=true`） | — | 纯前端 | `LibraryToolbar.tsx:78-84` |
| LIB-023 | 表格 | 表头全选复选框 | 勾选 | filteredPapers 非空且未全选 | 选中全部当前过滤行（`selectedIds`=全部 id） | filteredPapers 为空时 allSelected=false | 纯前端 | `LibraryPage.tsx:54-63,104-109` |
| LIB-024 | 表格 | 表头全选复选框 | 取消勾选 | 当前已全选 | 清空选中（`new Set()`） | — | 纯前端 | `LibraryPage.tsx:58-59` |
| LIB-025 | 表格 | 行复选框 | 勾选/取消 | — | 切换该行选中（`toggleOne`），行背景 `bg-primary/5`；选中数变化驱动批量条显隐 | 单元格 onClick stopPropagation，不触发打开抽屉 | 纯前端 | `PaperRow.tsx:19-25` |
| LIB-026 | 表格 | 论文行数据单元格 | 点击 | — | 打开详情抽屉（`setDrawerPaperId(paper.id)`） | 复选框单元格被 stopPropagation 排除 | 纯前端 | `PaperRow.tsx:28-31`；`LibraryPage.tsx:126` |
| LIB-027 | 表格 | 标题列单元格 | 展示 | 列 title 可见 | 显示标题（粗体）+ 作者（逗号拼接，灰色小字） | — | mock paper | `PaperRow.tsx:33-40` |
| LIB-028 | 表格 | 年份列单元格 | 展示 | 列 year 可见 | 显示 `paper.year ?? '—'` | year 缺省显示 — | mock | `PaperRow.tsx:41` |
| LIB-029 | 表格 | 状态列单元格 | 展示 | 列 status 可见 | 渲染 StatusChip（未读/在读/已读/归档 配色） | 未知/缺省 status 回退「未读」 | mock | `PaperRow.tsx:42`；`StatusChip.tsx:1-13` |
| LIB-030 | 表格 | 标签列单元格 | 展示 | 列 tags 可见 | 渲染各 TagChip（圆角灰底） | tags 空则不渲染 | mock | `PaperRow.tsx:43-47`；`TagChip.tsx` |
| LIB-031 | 表格 | 来源列单元格 | 展示 | 列 venue 可见 | 显示 `paper.venue ?? '—'` | 缺省 — | mock | `PaperRow.tsx:60-62` |
| LIB-032 | 表格 | 添加时间列单元格 | 展示 | 列 addedAt 可见 | 显示 `addedAt.slice(0,10) ?? '—'`（仅日期） | 缺省 — | mock | `PaperRow.tsx:63-67` |
| LIB-033 | 内容区 | 论文列表区 | 加载 | papersLoading=true | 显示居中「加载中…」 | — | `useLibraryPapers` isLoading | `LibraryPage.tsx:88-92` |
| LIB-034 | 内容区 | 论文列表区 | 错误 | papersError=true | 显示居中「加载失败，请重试」（destructive 色） | — | `useLibraryPapers` isError | `LibraryPage.tsx:92-95` |
| LIB-035 | 内容区 | 空态 EmptyLibrary | 展示 | filteredPapers.length=0 且非加载/错误 | 显示 FolderPlus 图标 +「这个文献集还没有文献」+「添加文献」按钮 | 搜索过滤后为空也走此空态 | 纯前端 | `LibraryPage.tsx:96-97`；`EmptyLibrary.tsx` |
| LIB-036 | 空态 | 「添加文献」按钮 | 点击 | 空态展示中 | 打开添加文献弹窗（`addOpen=true`） | — | 纯前端 | `EmptyLibrary.tsx:17-23` |
| LIB-037 | 添加弹窗 | 「DOI 添加」标签按钮 | 点击 | 弹窗打开 | 切换到 doi 模式，显示 DOI 输入框；按钮高亮 | — | 纯前端 | 默认 mode='doi'；`AddPaperDialog.tsx:53-61` |
| LIB-038 | 添加弹窗 | 「手动录入」标签按钮 | 点击 | 弹窗打开 | 切换到 manual 模式，显示 标题/作者/年份 三输入框 | — | 纯前端 | `AddPaperDialog.tsx:62-70` |
| LIB-039 | 添加弹窗 | DOI 输入框 | 输入 | doi 模式 | 更新 `doi` state | — | 纯前端 | autoFocus；`AddPaperDialog.tsx:73-79` |
| LIB-040 | 添加弹窗 | 标题/作者/年份输入框 | 输入 | manual 模式 | 更新对应 state（作者逗号分隔，年份转 Number） | 作者按 `,` split + trim + filter；年份空则 undefined | 纯前端 | `AddPaperDialog.tsx:81-101,34-36` |
| LIB-041 | 添加弹窗 | 「添加」提交按钮 | 点击（DOI 模式） | doi 模式 | 提交 `{doi}`，成功后关闭弹窗 + 失效论文查询 | doi 空 trim 后 return 不提交；isPending 时 disabled 并显示 Loader2；`doi==='fail'` 抛错 | `useAddPaper`→`addPaper`（mock，延迟 500ms） | mock；`AddPaperDialog.tsx:24-29,114-125` |
| LIB-042 | 添加弹窗 | 「添加」提交按钮 | 点击（手动模式） | manual 模式 | 提交 `{title,authors,year}`，成功后关闭弹窗 + 失效论文查询 | title 空 trim 后 return；isPending disabled+Loader2 | `useAddPaper`（mock 500ms invalidate papers） | mock；`AddPaperDialog.tsx:30-40` |
| LIB-043 | 添加弹窗 | 错误提示 | 展示 | addPaper.isError | 显示「添加失败，请检查输入」（destructive） | — | mutation isError | `AddPaperDialog.tsx:103-105` |
| LIB-044 | 添加弹窗 | 「取消」按钮 / × | 点击 | 弹窗打开 | 关闭弹窗（`onClose`） | 不重置表单 state（再次打开保留旧值） | 纯前端 | `AddPaperDialog.tsx:48-50,107-112` |
| LIB-045 | 详情抽屉 | 抽屉容器 | 打开 | drawerPaperId 非 null 且 paper 存在 | 右侧 480px 抽屉显示标题/tab/chips/作者年份/底部链接 | paper 为 null 或 open=false 时不渲染（return null） | mock paper（`papers.find`） | `PaperDetailDrawer.tsx:28-37` |
| LIB-046 | 详情抽屉 | 遮罩层 | 点击 | 抽屉打开 | 关闭抽屉（`onClose`） | — | 纯前端 | `PaperDetailDrawer.tsx:32-36` |
| LIB-047 | 详情抽屉 | × 关闭按钮 | 点击 | 抽屉打开 | 关闭抽屉 | — | 纯前端 | `PaperDetailDrawer.tsx:40-47` |
| LIB-048 | 详情抽屉 | 键盘 Esc | 按下 | 抽屉打开 | 关闭抽屉（window keydown 监听） | 仅 open 时挂监听 | 纯前端 | `PaperDetailDrawer.tsx:20-26` |
| LIB-049 | 详情抽屉 | tab「摘要」 | 点击 | 抽屉打开 | 切到摘要，显示 `abstract ?? '暂无摘要'` | 缺省显示「暂无摘要」 | mock | 默认 tab；`PaperDetailDrawer.tsx:77-81` |
| LIB-050 | 详情抽屉 | tab「笔记」 | 点击 | 抽屉打开 | 切到笔记，显示 textarea（defaultValue=notes） | textarea 仅 defaultValue，无保存逻辑 | mock | 笔记编辑未持久化；`PaperDetailDrawer.tsx:82-88` |
| LIB-051 | 详情抽屉 | tab「引用」 | 点击 | 抽屉打开 | 切到引用，显示 `citation ?? '暂无引用格式'`（等宽字体框） | 缺省「暂无引用格式」 | mock | `PaperDetailDrawer.tsx:89-93` |
| LIB-052 | 详情抽屉 | chips 区 | 展示 | 抽屉打开 | 显示 StatusChip + 各 TagChip | — | mock | `PaperDetailDrawer.tsx:68-73` |
| LIB-053 | 详情抽屉 | 「原文链接」按钮 | 点击 | `paper.url` 存在 | 新标签打开 url（target=_blank） | url 缺省则不渲染该按钮 | mock | `PaperDetailDrawer.tsx:96-105` |
| LIB-054 | 详情抽屉 | 「PDF」按钮 | 点击 | `paper.pdfUrl` 存在 | 新标签打开 pdfUrl | pdfUrl 缺省则不渲染 | mock | `PaperDetailDrawer.tsx:106-115` |
| LIB-055 | 批量条 | 批量条容器 | 展示 | selectedIds.size > 0 | 底部居中浮出，显示「{n} 已选择」+ 操作按钮 | size=0 时整体不渲染 | 纯前端 | `LibraryPage.tsx:134-144`；`BatchActionsBar.tsx:19-20` |
| LIB-056 | 批量条 | 「标签」按钮 | 点击 | 有选中 | 调用 onAddTag（空函数） | 无实际行为（TODO 未实现） | 纯前端 | 空操作 `LibraryPage.tsx:142` |
| LIB-057 | 批量条 | 「导出」按钮 | 点击 | 有选中 | 调用 onExport（空函数） | 无实际行为（TODO 未实现） | 纯前端 | 空操作 `LibraryPage.tsx:141` |
| LIB-058 | 批量条 | 「删除」按钮 | 点击 | 有选中 | 调用 onDelete：仅清空选中（`setSelectedIds(new Set())`），不删数据 | 未真正删除论文（仅清选） | 纯前端 | `LibraryPage.tsx:138-140` |
| LIB-059 | 批量条 | 「取消选择」× 按钮 | 点击 | 有选中 | 清空选中，批量条隐藏 | — | 纯前端 | `LibraryPage.tsx:137`；`BatchActionsBar.tsx:43-50` |
| LIB-060 | 矩阵面板 | 面板容器 | 打开 | matrixOpen=true | 右侧 640px 面板显示「对比矩阵」+ 表格 | open=false 时不渲染 | mock papers | `MatrixPanel.tsx:12-16` |
| LIB-061 | 矩阵面板 | × 关闭按钮 | 点击 | 面板打开 | 关闭面板（`onClose`，matrixOpen=false） | — | 纯前端 | `MatrixPanel.tsx:19-26` |
| LIB-062 | 矩阵面板 | 矩阵表格 | 展示 | papers 非空 | 每行一篇文献，列为固定 4 维度（方法/数据集/指标/结论），取 `paper.matrix?.[d] ?? '—'` | matrix 缺维度显示 —；papers 为空显示「暂无可对比的文献」 | mock | `MatrixPanel.tsx:28-56` |
| LIB-063 | 导入向导 | 向导容器 | 打开 | wizardOpen=true | 680×560 弹窗，显示步骤指示器（3 步）+ 当前步内容 | open=false 时不渲染 | 纯前端 | `PdfImportWizard.tsx:24,49-51` |
| LIB-064 | 导入向导 | × 关闭按钮 | 点击 | 向导打开 | 重置（step=1,files=[]）并关闭 | — | 纯前端 | `PdfImportWizard.tsx:44-47,54` |
| LIB-065 | 导入向导 Step1 | 文件选择区（label+input） | 点击选择 PDF | step=1 | 仅接收 `application/pdf` 文件，追加到 files（标题取文件名去 .pdf） | 非 PDF 被 filter 过滤掉；list 为 null 直接 return；拖拽无 drop handler（仅样式） | 纯前端 | `PdfImportWizard.tsx:26-32,79-92` |
| LIB-066 | 导入向导 Step1 | 「下一步」按钮 | 点击 | step=1 | 进入 step2（`setStep(2)`） | files 为空时按钮 disabled（`opacity-50`） | 纯前端 | `PdfImportWizard.tsx:152-153,158` |
| LIB-067 | 导入向导 Step1 | 「取消」按钮 | 点击 | step=1 | 重置并关闭向导 | — | 纯前端 | `PdfImportWizard.tsx:143` |
| LIB-068 | 导入向导 Step2 | 文件标题输入框 | 输入 | step=2，有文件 | 编辑对应文件的 title | — | 纯前端 | `PdfImportWizard.tsx:105-115` |
| LIB-069 | 导入向导 Step2 | 文件「移除」× 按钮 | 点击 | step=2 | 从 files 移除该项 | 移除全部后显示「未选择任何文件」 | 纯前端 | `PdfImportWizard.tsx:116-124,96-97` |
| LIB-070 | 导入向导 Step2 | 「上一步」按钮 | 点击 | step=2 | 回到 step1（`setStep(s-1)`） | — | 纯前端 | `PdfImportWizard.tsx:143` |
| LIB-071 | 导入向导 Step2 | 「开始导入」按钮 | 点击 | step=2 | 对每个文件调用 `startImport(fileName, libraryId)`，进入 step3 | 即使 files 空也可点（按钮无 disabled） | `useImportProgress.startImport`（纯前端模拟，setInterval 每 600ms +20%） | mock；`PdfImportWizard.tsx:34-37,154-156` |
| LIB-072 | 导入向导 Step3 | 完成态 | 展示 | step=3 | 显示绿色 Check +「导入已开始」+「可在右下角查看解析进度」 | — | 纯前端 | `PdfImportWizard.tsx:130-138` |
| LIB-073 | 导入向导 Step3 | 「完成」按钮 | 点击 | step=3 | 重置并关闭向导 | — | 纯前端 | `PdfImportWizard.tsx:164-170` |
| LIB-074 | 导入向导 | 步骤指示器 | 展示 | — | 步骤圆点：当前/已过显示 primary；已完成步显示 Check，否则数字 | — | 纯前端 | `PdfImportWizard.tsx:58-76` |
| LIB-075 | 导入进度 Toast | Toast 容器 | 展示 | jobs.length > 0 | 右下角列出各导入任务卡片 | jobs 空时不渲染（return null） | `useImportProgress` jobs（纯前端模拟） | mock；`ImportProgressToast.tsx:7-10` |
| LIB-076 | 导入进度 Toast | 任务卡片状态 | 展示/轮询 | 有 job | processing：旋转图标 +「解析中… {progress}%」；done：绿 Check +「已添加到文献集」；error：红 XCircle +「{error ?? 解析失败}」 | 模拟进度每 600ms +20%，到 100% 转 done；mock 无 error 分支触发路径 | mock setInterval | `ImportProgressToast.tsx:16-32`；`useImportProgress.ts:41-56` |
| LIB-077 | 导入进度 Toast | 任务 × 关闭按钮 | 点击 | 有 job | 从 jobs 移除该任务（`dismiss(id)`） | — | `useImportProgress.dismiss`（纯前端） | `ImportProgressToast.tsx:33-40` |
