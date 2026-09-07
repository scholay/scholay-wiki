# Scholay 内容源仓库

## 内容原则

- 用户手写正文是第一手底稿。未经明确要求，不润色、扩写、替换或重新从线上覆盖正文。
- `wiki/pages/**/*.md` 是唯一的长期正文；`wiki/catalog.json` 管理稳定 slug、分类与线上导航。Excalidraw 是以节点、层级和连线引用正文的可编辑结构视图，GitHub Wiki 是下游镜像。
- 初始结构来自 2026-09-06 线上 Wiki：16 组导航、8 个内容分类。以后按用户修改演进，线上新内容只比较，不直接覆盖本地。
- 不引入 scholay_video_cut 等其他项目的内容。只借鉴其双工具维护方式。
- `sources/online/2026-09-06/` 是不可覆盖的导入证据，包括官方 Markdown 和原生 API 数据。网页交互示意只有文字提示，不能声称为本地图片。
- 保留根 README 的既有产品介绍与 assets。

## 修改与视图维护

1. 修改前运行 `python3 tools/wiki/sync.py status`；先解决生成节点标题/链接冲突。
2. Excalidraw 以原生绑定节点与连线展示研究路径、16组功能树和8类主题树，节点链接 Markdown，不保存正文副本。两种视图直接编辑同一份文件，禁止实现正文复制回写。
3. 日常修改正文不需要刷新画布。新增/移除词条或修改分类、标题、导航时同步更新 catalog 与 wiki/structure.json；标题需保持 YAML title、H1、catalog title 一致。
4. 保存并关闭画布后运行 `sync.py refresh`，再运行 `export.py` 更新入口、`sync.py verify` 校验。
5. 日常 refresh 保留用户画布布局、连线、批注和附件。生成节点的标题/链接发生冲突时停止覆盖，人工核对 catalog；用户自由图形不受管理。显式要求重排时可用 `refresh --layout` 恢复生成节点布局并备份；生成连线的目标变更需先核对结构。
6. `wiki/Scholay.xmind` 与 `tools/wiki/legacy-xmind/` 是迁移前历史快照，不再运行旧同步流程。不得从旧 XMind 覆盖现行正文。
7. `.obsidian/plugins/` 中的插件安装文件和个人插件设置不提交；新电脑通过 Obsidian 社区插件市场安装 Excalidraw。画布本身随 Git 管理。

## 项目内工作台

- `tools/workbench/` 提供本地 Excalidraw 和 Markdown 编辑界面。API 直接读写 catalog 登记的现有词条，不建立正文副本。
- 正文保留 YAML 属性与 H1；写入必须检查文件 revision，并备份，冲突不能自动覆盖。返回本次提交的精确内容和 revision，不能以写入后另一次读取充当保存回执。
- 异步读取不得覆盖期间产生的新输入或较新的保存结果。测试应覆盖保存、轮询、冲突选择的交错请求。
- 画布需与 Obsidian `.excalidraw.md` 格式兼容，保留未知字段、附件映射、文本分隔符和用户批注；图片附件从 vault 读取，不越过仓库路径。
- 运行 `python3 tools/workbench/test_server.py`、`npm test --prefix tools/workbench`、`npm run build --prefix tools/workbench` 和现有 wiki 校验。仅在本机运行，不通过 Sites/GitHub 发布本地文件服务。

## GitHub Wiki

- `python3 tools/wiki/export.py --github` 只生成本地 `build/github-wiki/`，不代表发布。
- `python3 tools/wiki/prepare-github.py` 拉取可用的 Wiki 远端并准备本地 diff；不会提交或推送。
- 主仓库与 GitHub Wiki 是两个独立 Git 仓库。不得把主仓库 push 当成 Wiki 同步完成。
- 用户当前要求先搭建本地底稿，维护完成后再同步 GitHub Wiki。后续发布按用户当次指令执行；未获发布指令不主动推送。
- 同步前检查远端的新修改，避免覆盖用户在 GitHub 上的改动；保留未被本仓库管理的其他页。同步后用远端 SHA 和页面回读验证。

## Obsidian 原生关系图

- 核心 Graph View 已启用，默认只显示 `wiki/pages/` 和 `wiki/topics/`；按8个 category 着色。
- `tools/wiki/links.py refresh` 将 catalog.related 中能解析的目标写入 `scholay_related`，将 structure 主题归属写入 `scholay_topics`。两者都是带引号的 YAML wikilink 列表，不修改正文段落或原有属性。
- `wiki/topics/` 的45个索引只保存分类、主题和文章入口，不复制正文。生成属性/主题索引被人工改动时必须报冲突；移除已知过期索引前核验、备份，禁止保留过期关系而声称已校验。
- 缺失 related 目标保留在 catalog，不创建虚假页面；检查记录位于 `.local/graph-links/report.json`。手工双链可写在正文或其他属性中，原生图自动识别。
- 结构维护后运行 `python3 tools/wiki/links.py refresh` 和 `verify`；运行 `python3 tools/wiki/test_links.py` 验证正文不变、人工修改保护和主题改名。
