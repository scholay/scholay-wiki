# Scholay 本地内容工作台

在项目内编辑 Excalidraw 结构图，节点打开的正文直接读写 Obsidian 使用的 `wiki/pages/**/*.md`。不发布本地文件服务。

```bash
python3 tools/workbench/launch.py
```

默认地址为 `http://127.0.0.1:8765`。macOS 可双击根目录 `打开内容工作台.command`。首次需要 Python 3、Node.js 和 npm；启动器按 lockfile 安装依赖、构建前端并复用当前仓库的运行实例。后台日志/PID 位于 `.local/workbench/`。

开发时分两个终端运行：

```bash
python3 tools/workbench/server.py
npm run dev --prefix tools/workbench
```

开发页面是 `http://127.0.0.1:5176`，生产本地服务直接提供 `dist/`。Python 服务更新后需重启；前端生产版本改动后运行 `npm run build --prefix tools/workbench` 并刷新页面。

## 数据与编辑

- 正文保存只替换 body，保留文件中的 YAML 属性；一级标题必须与 catalog 一致。
- 画布保存兼容 Obsidian Excalidraw Markdown，保留场景属性和元数据，并规范化新元素 ID。
- 默认约 650 ms 自动保存正文，750 ms 保存画布，1.2 s 轮询外部版本。
- 所有写入使用 SHA-256 revision 检查、备份和原子文件替换。发现外部修改返回 409，用户明确选择后才能继续。
- 未保存草稿保存在当前浏览器本地存储中，刷新后可恢复；关闭页面有未保存内容时给出浏览器提示。关闭浏览器/清除存储前先确认保存成功。
- 默认打开研究路径总览，包含流程箭头和支持分支。16组功能树保留导航层级，8类主题树覆盖96词条；点击节点打开右侧正文，顶部主题按钮聚焦对应分支。点击「整理结构」可拖动节点、调整连线和批注。
- 画布布局不自动转换为 catalog 结构；正式改名、分类变更遵守主维护流程。
- 图片处理支持 scene 内数据及 Obsidian 已拆分的 PNG/JPEG/GIF/WebP/SVG 附件。其他 Obsidian 专用嵌入保留元数据，但不在此渲染。
- 精确的 Obsidian 内部分隔符不能作为画布文本写入；校验失败会保留草稿并显示错误，普通标题、换行与批注可正常保存。

## 验证

```bash
python3 tools/workbench/test_server.py
npm test --prefix tools/workbench
python3 tools/wiki/test_sync.py
python3 tools/wiki/sync.py verify
python3 tools/wiki/test_links.py
python3 tools/wiki/links.py verify
npm run build --prefix tools/workbench
```

测试覆盖同文件写入、属性保留、备份、外部修改检测、过期版本拒绝、标题校验、文本/图片兼容，以及保存/轮询/冲突处理发生交错时的新输入保护。只验证已保存文件之间的交换；Obsidian 尚未写盘的编辑由其自身保存机制管理。

## 原生 Graph View

Obsidian 左侧关系图图标打开原生关系网络。它读取文章里的 `scholay_related` / `scholay_topics` 内部链接以及 `wiki/topics/` 主题索引；画布、导入快照和导出副本不进入默认关系图。正文中的手工双链也会被自动识别。Excalidraw 表达可人工维护的层级与任务流程；Graph View 表达实际文件链接，二者不通过画布坐标互相改写。
