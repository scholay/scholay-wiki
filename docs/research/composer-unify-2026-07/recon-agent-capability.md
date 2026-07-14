# 侦察:agent/executor 对图片与文件的真实能力

> 2026-07-14 · owner 点名要查的维度,结论直接影响「+号上传图片」是否成立

## 1. 图片:当前 executor **没有任何 vision 通道** ⚠️

逐层核实:

| 层 | 现状 | 证据 |
|---|---|---|
| user_message 帧 | 只收 `content` 字符串,无块数组支持 | `agent/src/server/ws.ts:182` `String(frame.content)` |
| 会话 history | `{role:"user", content: string}`,不能承载 image block | `ws.ts:241` |
| Read 工具 | **仅 UTF-8 文本**;二进制(含图片)明确拒绝,提示走 Bash 转换 | `agent/src/tools/registry.ts:70-95`(description 原文:"Binary files … NOT supported") |
| tool_result | runTools 返回文本内容块,无 image block 构造 | tools/registry.ts 全文件 0 处 image |
| OpenAI 出口适配器 | `toOpenAIMessages` user 分支只处理 `tool_result`/`text`,**image 块静默丢弃**;全文件 0 处 image | `agent/src/openai/adapter.ts:81-97` |
| seed_history 回放 | convertFlatToAnthropic 同样文本形 | `server/shadowTurn.ts:38` |

**claw ChatComposer 里「图片 5MB = Anthropic vision API 硬上限」的注释(L33)是老 cc-haha 链路的遗迹** ——
老链路曾把图片 base64 成 vision block(types.ts:5 注释残留),重写后无人做这件事。
**现状:用户在 claw 上传图片 → 文件落 cwd → 模型 Read 被拒 → 顶多 Bash 跑转换(容器内无 OCR 工具链)→ 实际上模型看不见图。**

### 若要真支持图片,需要的改造清单(按层)
1. **executor**:user_message 支持 attachments 中的 image → 读文件 base64 → user content 变块数组
   `[{type:"image", source:{type:"base64", media_type, data}}, {type:"text", …}]`;history/窗口裁剪/journal 需兼容块数组(H5 windowMessages 按回合切,块数组不破坏结构,但 token 估算要计图);
   或者走工具路线:Read 支持图片返回 image block 的 tool_result(Anthropic 原生支持)—— 改造面更小,但模型要先"想到"去 Read。推荐**消息内嵌**(业界习惯:图随消息直达)。
2. **OpenAI 适配器**:image block → `{type:"image_url", image_url:{url:"data:<mime>;base64,…"}}`(chat/completions 多模态形);
   tool_result 里的 image 在 OpenAI 方言下无对应(role:tool 只收字符串)→ 若走工具路线还需「tool 消息后补 user image 消息」的变形,又一个坑 —— 再支持消息内嵌路线。
3. **上游能力差异**:DeepSeek(默认端点)**无视觉**;gpt-4o-mini/claude 系有。→ 模型目录必须加 `vision` 能力标志
   (`agent_models` 现有列:model_id/display_name/…/speed_class/…,**无 vision 字段**,SHOW COLUMNS 核实),
   前端据此:无视觉模型时禁用图片上传入口(或上传时提示"当前模型不识图,建议切换")。hub 消息前校验同理。
4. **计费**:vision token 计入 usage 由上游返回,现有链路无需改。

## 2. 文件:靠「cwd 落盘 + 模型工具自读」,能力分层

| 文件类型 | claw(有 Bash) | smart-search / prism(禁 Bash) |
|---|---|---|
| UTF-8 文本/代码/md/csv | ✅ Read 直读(2000 行/次上限,registry.ts:42) | ✅ Read 直读 |
| PDF | ✅ Bash `pdftotext` 转后读(registry.ts:92 提示语) | ❌ 无转换路径 |
| Office(docx/xlsx/pptx) | ✅ Bash python-docx/openpyxl 转(容器预装) | ❌ |
| 图片 | ❌(见上) | ❌ |

→ smart-search/prism 若接上传,**要么限制 accept 类型为文本类,要么在 backend 抽文本(内部有 pdfparse 模块),要么给受限 Bash**。须 owner 拍板。

## 3. 上下文容量(ContextMeter 数据源)
- 三家都有 context 端点:`/smart-search/session/context`、`/claw/session/context`、prism `projects/:id/session/context`(routes_user.go:195,265,279),口径 = 会话累计 usage 估算 vs 模型窗口(P2 起随 pinned 模型的 context_window 定界)。
- 附件/引用的 token 占用:**落盘文件不直接进上下文**(模型 Read 才消耗,且计入下一轮 usage)→ 水位天然涵盖,无需特殊处理。图片若走消息内嵌 base64,则发送轮即计入(vision token 由上游 usage 返回)。

## 4. 结论(能力红线)
1. 「上传图片给模型看」**当前是空头支票** —— 不做 vision 通道就不该在 UI 提供图片入口(或明确降级文案)。
2. 文件能力在 claw 是真实的(靠 Bash 转换),在另两家受限;
3. attachments 通知断链(见 upload-chain 报告)是独立于 vision 的 P0,先修它文件链路才算闭环。
