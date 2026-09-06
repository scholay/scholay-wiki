# Scholay 内容源仓库

## 内容原则

- 用户手写正文是第一手底稿。未经明确要求，不润色、扩写、替换或重新从线上覆盖正文。
- `wiki/pages/**/*.md` 是唯一的长期正文；`wiki/catalog.json` 管理稳定 slug、分类与线上导航。XMind 是同一内容的可编辑视图，GitHub Wiki 是下游镜像。
- 初始结构来自 2026-09-06 线上 Wiki：16 组导航、8 个内容分类。以后按用户修改演进，线上新内容只比较，不直接覆盖本地。
- 不引入 scholay_video_cut 等其他项目的内容。只借鉴其双工具维护方式。
- `sources/online/2026-09-06/` 是不可覆盖的导入证据，包括官方 Markdown 和原生 API 数据。网页交互示意只有文字提示，不能声称为本地图片。
- 保留根 README 的既有产品介绍与 assets。

## 修改与同步

1. 修改前运行 `python3 tools/wiki/sync.py status`，检查 Markdown 和 XMind 是否均有未同步修改。
2. 如果用户在 XMind 中修改了词条 Note，先 `from-xmind` 回收。两端都改时停止覆盖，逐篇核对并保留双方版本。
3. 修改 Markdown 后运行 `to-xmind`；只改内容的页，保持未改文件字节不变。
4. `python3 tools/wiki/sync.py verify` 必须通过。同步器的自动入口仅支持正文 Note 回写；结构、标题、导航变化需核对 catalog 后处理，不能忽略后覆盖。
5. 新增/移除正文需同步更新 catalog 的 articles；更新标题需同时更新 YAML title、H1、catalog title。然后运行 `python3 tools/wiki/export.py` 更新入口。
6. 不要在 XMind 文件仍有未保存编辑时从外部重建；XMind 保存后再同步，外部生成后重新打开文件。

## GitHub Wiki

- `python3 tools/wiki/export.py --github` 只生成本地 `build/github-wiki/`，不代表发布。
- `python3 tools/wiki/prepare-github.py` 拉取可用的 Wiki 远端并准备本地 diff；不会提交或推送。
- 主仓库与 GitHub Wiki 是两个独立 Git 仓库。不得把主仓库 push 当成 Wiki 同步完成。
- 用户当前要求先搭建本地底稿，维护完成后再同步 GitHub Wiki。后续发布按用户当次指令执行；未获发布指令不主动推送。
- 同步前检查远端的新修改，避免覆盖用户在 GitHub 上的改动；保留未被本仓库管理的其他页。同步后用远端 SHA 和页面回读验证。
