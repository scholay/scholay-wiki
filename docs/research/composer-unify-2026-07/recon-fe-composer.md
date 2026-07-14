# 侦察:三家 Composer 前端现状与能力矩阵

> 2026-07-14 · 证据均为当日 main 分支代码(未提交工作区无前端改动)

## 1. shared 核心件(已存在,单一真源)

| 组件 | 位置 | 要点 |
|---|---|---|
| Composer | `shared/components/chat/Composer.tsx` | 统一壳:rounded-2xl 柔焦容器、自增高 textarea、Enter 发送(CJK 组字守卫)、三态发送键(发送/停止/登录)。**插槽已齐**:`topSlot`(chips 区)、`leftActions`(左下按钮)、`overlay`(拖拽蒙层)、`containerProps`(drag 事件)、`onPaste`、`canSendEmpty`(有附件可空文本发送)、`context`(水位) |
| ContextMeter | 同目录 | 环形上下文水位,`context` prop 直连,三家均可用 |
| ModelSelector | 同目录 | P2 已上线(Cursor 式,服务端权威 pinned) |
| AttachmentChipList / AttachmentLightbox | 同目录 | 附件 chip 列表 + 图片点击放大 lightbox(**已在 shared**,消费方:claw MessageTurn / ChatComposer) |
| ReferenceChipList | 同目录 | 引用文献 chip(消费方:claw) |

**结论:核心壳与展示件已全部就位,差距全在「feature 装配层」。**

## 2. 三家装配现状

### claw — `features/claw/components/chat/ChatComposer.tsx`(完整样板,458 行)
- ✅ 模型选择器(modelSlot)、上下文水位
- ✅ 文件选择上传(Paperclip 按钮 + hidden input,accept 白名单 L329)
- ✅ 拖拽上传(dragDepth 计数防抖动 L198-219 + 「松开上传」蒙层 overlay)
- ✅ 粘贴上传(clipboardData.items kind==='file' 拦截,纯文本放行 L224-237)
- ✅ 附件 chips:图片 56×56 缩略图(点击 lightbox 放大)/ 文件卡片(图标+名+类型+大小),右上角常驻移除钮(不依赖 hover,照顾移动端)L387-445
- ✅ 引用文献集(Library 按钮 → LibraryReferencePicker 弹窗 → ReferenceChipList chips)
- ✅ 上传即传(选中立即 POST,非发送时才传)、上传中 pending 卡、`canSendEmpty`
- ✅ 「添加文件即开会话」(onSessionEnsured adopt 新会话)
- ❌ 无「+」号聚合菜单 —— 现为两个并排图标(Paperclip + Library)

### smart-search — `features/search/components/smart-search/SmartComposer.tsx`(147 行)
- ✅ 模型选择器(modelSlot)、上下文 chip(contextSnapshot)、重置会话钮、轮播示例 placeholder、hero↔底栏停靠动画
- ❌ 附件上传 / 拖拽 / 粘贴 / chips / lightbox / 引用文献:**全部没有**

### prism — `features/prism/components/PrismChatPanel.tsx`
- ✅ 模型选择器(L163-170)、上下文水位(L146 `context={chat.context}`)、新对话钮、写作能力菜单(PrismWritingMenuButton)、**选区引用 quote chip**(topSlot,编辑器选中文字引用 L148-158)
- ❌ 附件上传 / 拖拽 / 粘贴 / 引用文献集:没有

## 3. 能力矩阵

| 能力 | claw | smart-search | prism |
|---|---|---|---|
| 模型选择器 | ✅ | ✅ | ✅ |
| 上下文水位 | ✅ | ✅(chip 形态) | ✅ |
| 文件上传(选择器) | ✅ | ❌ | ❌ |
| 图片上传 | ✅(但见 agent 能力报告:**模型看不见图**) | ❌ | ❌ |
| 拖拽上传 | ✅ | ❌ | ❌ |
| 粘贴上传 | ✅ | ❌ | ❌ |
| 附件 chips + 预览 | ✅ | ❌ | ❌ |
| 引用文献集 | ✅ | ❌ | ❌ |
| 选区引用 | ❌ | ❌ | ✅(prism 特有) |
| +号聚合菜单 | ❌(并排图标) | ❌ | ❌ |
| 上传进度/失败重试 chip | ❌(只有整体「上传中…」) | — | — |

## 4. 样式一致性差异
- 三家均已走统一 Composer 壳 → 容器/圆角/发送键天然一致。
- 差异在 leftActions 排布:claw=模型+回形针+文献;search=模型+重置;prism=模型+新对话+能力菜单。统一后建议:`[模型选择器][+号菜单][feature 特有钮]`。
- maxHeightPx:claw=140,search 默认 160 —— 统一值需拍板(建议 160)。
- placeholder 文案三家各写各的(可保留 feature 个性,不算问题)。

## 5. 结论
统一路径不是重写,而是**把 claw ChatComposer 的附件/引用/粘贴/拖拽层抽成 shared 复用件**(hook `useComposerAttachments` + 装配组件),smart-search/prism 接入 + 三家把入口收进「+」号菜单。前端工作量集中在抽取与两家接入;真正的硬骨头在链路与 agent 能力(见另两份报告)。
