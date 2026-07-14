# 侦察:业界 AI 对话 composer 交互规范(设计输入)

> 2026-07-14 · 基于对 ChatGPT / Claude.ai / Cursor / Gemini / Kimi 等主流产品的形态认知(截至 2026 上半年);
> owner 已明确「样式采用业界常用做法」,本文直接给可执行规范。置信度:主干形态高(多产品趋同),细节标注取舍。

## 1. 「+」号聚合菜单(ChatGPT/Claude/Gemini 均收敛到此形态)
- **位置**:输入框左下角第一个位子(模型选择器可在其右或右下角,Cursor 左下、Claude 右下 —— 我们已定左下 modelSlot,+号放最左)。
- **形态**:圆形/方圆 ghost 按钮,点击向上弹 DropdownMenu(Radix `side="top" align="start"`)。
- **菜单项**(按我们的场景):
  1. 上传文件(图标 Paperclip / FileUp)
  2. 上传图片(图标 Image)—— 仅当会话模型有视觉能力时可用,否则置灰+tooltip「当前模型不支持识图」
  3. 引用文献集(图标 Library)
  4. (smart-search 可选)引用暂存区
- 直接点回形针的单击快捷路径可以保留为菜单第一项,不再并排多图标(节省底栏空间,和 modelSlot/重置钮共存)。

## 2. 附件 chips(输入框内上方,业界一致)
- **图片**:56~64px 方形缩略图,圆角 md,点击开 lightbox;右上角常驻 X(移动端无 hover,不要 group-hover 才显示 —— claw 现实现已正确)。
- **文件**:横向卡片 = 类型图标块 + 文件名(truncate)+ 副信息(扩展名 · 大小);点击行为:文本类可弹预览(可选,P2)。
- **上传中**:该 chip 位置放骨架卡 + spinner + 进度(至少不确定态);**失败**:卡片红边 + 重试/移除两个动作(业界 ChatGPT 形态)。claw 现状只有整体「上传中…」,失败只有 toast —— 差距点。
- **数量约束**:单条消息附件数上限(建议 10)+ 超限 toast。

## 3. 粘贴 / 拖拽(业界标准行为)
- 粘贴:`clipboardData.items` 里有 file → 拦截默认行为转上传;纯文本正常粘贴(claw 已实现,推广即可)。
  可选(Claude.ai 特色,P2):粘贴超长文本(>数千字)自动转 .txt 附件。
- 拖拽:拖入时输入框(或整个对话区)显示虚线高亮蒙层「松开上传」;dragenter/leave 计数防子元素抖动(claw 已实现)。
- 多文件:一次选/拖多个,逐个上传逐个出 chip(claw 已实现,注意首个文件创建会话后复用 sessionId —— 已处理)。

## 4. 预览
- 图片:点击 chip → 全屏 lightbox(shared AttachmentLightbox 已有,ESC/点击遮罩关闭)。
- 已发送消息里的附件:气泡内同样 chips(claw MessageTurn 已有);历史回放要能还原(依赖链路修复,见 upload-chain)。
- 文件预览:P2 —— 文本类可开抽屉预览;PDF 可复用库内 react-pdf。业界(ChatGPT)文件 chip 不可预览,仅展示,做到这层即可及格。

## 5. 位置惯例总结(我们的定稿建议)
```
[ +号菜单 ][ 模型选择器 ][ feature特有钮(重置/新对话/能力菜单) ] ──空间── [ 上下文水位 ][ 发送/停止 ]
     chips 行(附件+引用)在 textarea 上方(topSlot,已有)
```
- 与 claw 现状的差异仅:回形针+文献两图标 → 收进 +号菜单;模型选择器保持第二位。
- smart-search 的重置钮、prism 的新对话/能力菜单按原位保留在 feature 特有区。

## 6. 移动端与无障碍
- 触屏目标 ≥44px(现按钮 h-8=32px 偏小,业界移动端普遍 40+;建议移动端断点放大或维持现状但增大点击热区)。
- 粘贴上传在 iOS Safari 支持有限(clipboard file 常为空)→ 移动端主路径是 +号菜单调 `<input type=file capture>`。
- lightbox 支持手势关闭可后置;`aria-label` 全按钮覆盖(claw 现实现已基本做到)。
