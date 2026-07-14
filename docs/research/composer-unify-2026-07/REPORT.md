# 三 agent 输入框统一 · 调研总报告

> 2026-07-14 · 范围:智能文献搜索 / 智能助手 / 智能写作的 composer 样式与交互统一
> (模型选择、上下文容量、+号菜单、上传图片/文件、快捷引用文献集、粘贴直传、附件 chips + 预览)
> 侦察明细:recon-fe-composer.md / recon-upload-chain.md / recon-agent-capability.md / recon-industry.md / recon-backend-library.md

## 一、总判断

**这不是「做一套新输入框」,而是「把 claw 已经做完的能力抽成共享层 + 修两个真窟窿」。**

- 输入框核心壳(Composer.tsx)、附件 chips、lightbox、引用 chips、模型选择器、上下文水位 —— **shared 已全部存在**;
- claw 的 ChatComposer 已实现 owner 要的几乎全部交互(选择/拖拽/粘贴上传、chips、点击预览、引用文献集、上传即传、有附件可空文本发送);
- smart-search / prism 缺的只是「装配」;
- 但调研揪出**两个能力真窟窿**,不修的话统一 UI 是空壳:

### 窟窿 ① attachments 通知断链(P0,影响现网 claw)
executor web-native 重写时丢了老链路的 `materializeAttachments`(@"path" 前缀注入)。现在 `user_message.attachments[].path`
发出去后**全链路无人消费**(hub 原样转发、executor 只读 content 字符串)。活体验证:模型靠 `Glob *` 列目录才自救找到文件 ——
依赖用户口头提及 + feature 放开 Glob + 模型主动性,且历史回放的附件 chips 因无前缀而消失。
**修法(小)**:executor 恢复附件清单注入(user 文本前拼 `@"path"` 前缀,与前端既有剥离逻辑 `agent-history.ts:340` 天然同构)。

### 窟窿 ② 图片没有 vision 通道(决定「上传图片」是否成立)
现 executor Read 工具**仅 UTF-8 文本**、tool_result 无 image block、user_message 无块数组、OpenAI 适配器 image 0 处理、
模型目录无 vision 标志、默认模型 DeepSeek 本身无视觉。**用户今天在 claw 传图,模型根本看不见** ——
ChatComposer 里"5MB vision 上限"注释是老链路遗迹。
**修法(中等工程)**:executor user content 支持图片块(attachments image → base64 内嵌)+ OpenAI 适配器翻译 image_url
+ 目录加 `vision` 列 + 无视觉模型的 UI 降级(入口置灰/提示切模型)。

## 二、能力矩阵(现状)

| 能力 | claw | smart-search | prism |
|---|---|---|---|
| 模型选择 / 上下文水位 | ✅ / ✅ | ✅ / ✅ | ✅ / ✅ |
| 文件上传(选/拖/粘) | ✅(链路降级可用,见窟窿①) | ❌ | ❌ |
| 图片上传 | UI ✅ / 能力 ❌(窟窿②) | ❌ | ❌ |
| 附件 chips + lightbox | ✅ | ❌ | ❌ |
| 引用文献集 | ✅(链路完整) | ❌ | ❌ |
| 选区引用 | — | — | ✅(prism 特有,保留) |
| +号聚合菜单 | ❌(并排双图标) | ❌ | ❌ |
| 上传进度/失败重试 chip | ❌(仅整体 pending + toast) | — | — |

## 三、分期方案(建议)

### P0 修断链(半天,独立先行,现网 claw 受益)
executor:user_message 读 attachments[].path → 拼 `@"path"` 前缀进 content(与历史回放剥离逻辑同构);
补一条约定:前缀后跟随附件类型/名字的中文清单行(模型不再靠猜)。回归:上传→不提示文件名→模型直接 Read 出内容;刷新后气泡 chips 还原。

### P1 统一装配层(核心交付,2~3 天)
1. **抽共享**:claw 的 addFiles/拖拽/粘贴/chips/pending 态 → `shared/hooks/useComposerAttachments` + 装配组件;
   LibraryReferencePicker + library-browse api 上提 shared(依赖已零 claw 耦合);AttachmentDTO 等类型上提 shared/types。
2. **+号菜单**:DropdownMenu 向上弹(上传文件/上传图片/引用文献集),三家统一底栏排布
   `[+][模型][feature特有钮] … [水位][发送]`;claw 双图标收编。
3. **backend 泛化**:internal/claw 的 upload.go/references.go 提为 FeatureBridge 参数化公共件,
   smart-search/prism 各挂 `/upload` `/reference` 薄路由(带 UploadLimitMiddleware);library-reference skill 三家注入。
4. **prism 特殊处理**:上传落 cwd `uploads/` 子目录(不污染 LaTeX 编译);保留选区引用 chip 与写作菜单。
5. **smart-search 文件类型**:因禁 Bash,accept 先收窄为文本/代码/CSV/MD(PDF 待决策,见 Q2)。

### P2 图片 vision 通道(中等工程,建议单独一期)
executor 图片块内嵌 + OpenAI 适配器 image_url 翻译 + 目录 vision 列(admin 表单勾选)+ hub 消息前校验 + 前端入口按模型能力启停。
不做 P2 之前,P1 的「上传图片」入口只在有视觉能力的会话模型下开放(目录没标志前先全隐藏图片项,只开文件)。

### P3 打磨(可后置)
每 chip 上传进度/失败重试、粘贴超长文本转附件、文件 chip 预览抽屉、移动端触屏目标放大、附件数量上限。

## 四、待 owner 拍板

1. **图片 vision(P2)做不做、何时做?** 不做则 P1 阶段图片入口隐藏(诚实 UI);做则默认端点 DeepSeek 无视觉,
   实际「能看图」的只有 gpt-4o-mini 等自配模型 —— 产品价值取决于你后续接什么模型。
2. **smart-search 的 PDF**:a) 只收文本类(最省) b) backend 用 pdfparse 抽文本再落 cwd(方案A局部回潮,能用但有损)
   c) 给 smart-search 开受限 Bash(安全面扩大,不推荐)。建议 a,文献场景 PDF 需求引导走「引用文献集」(那条链自带 PDF)。
3. **暂存区作为引用源**(smart-search):建议 P3,首期只做文献集。
4. P0 是否立即开工(独立于 UI 统一,修的是现网 claw 的真实退化)。
