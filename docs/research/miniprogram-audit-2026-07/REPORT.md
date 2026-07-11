# 微信小程序全面体检报告(2026-07)

范围:`miniprogram/`(原生微信小程序,TS/WXML/WXSS,无构建步骤,源码≈产物)。
规模:47 TS / 5398 行、16 WXML / 744 行、18 WXSS / 2023 行、零第三方库、15 页。
方法:5 维并行审计(架构 / 冗余封装 / 性能 / 加载速度 / 网络数据层)+ 对每条高危发现做对抗式验证(尽力证伪、纠正夸大)。性能维度子代理失败后由主审补做。

---

## 执行摘要

**总体健康度:良好。没有 critical、没有真正的 high。** 分层清爽无环、网络咽喉规整、claw 的性能设计(diff-setData + 记忆化 + 模块级非响应式态)是全仓标杆。

两个初判 high 的发现经对抗验证**都被下修为 low**,这点很重要,避免过度整改:

| 初判 | 发现 | 验证结论 | 修正 |
|---|---|---|---|
| High | claw 873 行 agent 编排"焊死"、新 feature 无法复用 | 只有 1 个 agent 页(claw),`agent-socket`(267 行)已是通用控制器、`agent-chat` 折叠零耦合,真正困在页里的可复用代码只 ~100 行不是 300 行。**单一消费者做 FeatureSpec 抽象是过早抽象(YAGNI)** | **Low** |
| High | 未开 `lazyCodeLoading`,冷启注入求值整包 | 事实属实且开启零风险,但"100-300ms 固定税"夸大——文件几乎全是定义、JSCore 惰性编译,真实成本是解析 ~80KB 文本(个位到几十 ms);包总量仅 263KB(单包上限 13%)| **Low(但值得一行开)** |

真正值得动手的是:**一处性能硬伤(feed 无窗口化)** + **一批中危可维护性债(列表脚手架/骨架/样式三处系统性 copy-paste、无共享错误助手)** + **一批高性价比加载/性能快赢**。

**分维度评分**:

| 维度 | 评分 | 一句话 |
|---|---|---|
| 架构设计 | A- | 分层无环、职责清晰;债在契约漂移 + 会话事件缺位 + 网络边界有 4 个绕过口 |
| 封装冗余 | B | 纯逻辑层封装天花板级,但"列表页 UI"零封装设施 → 三处 copy-paste 已开始视觉漂移 |
| 性能优化 | B | claw 已优化到标杆;但 **feed swiper 无窗口化**、列表分页全量 setData 是普遍未优化点 |
| 加载速度 | A- | 无阻断级问题;lazyCodeLoading/并行请求/持久化秒开是打磨型快赢 |
| 网络数据层 | B+ | request.ts 是规整咽喉;缺口=4 个非 JSON 通道绕过 + 契约无守卫 + 无缓存/超时 |

---

## 一、架构设计

### 做得好的
- **分层无环**:grep 证实无 page→page 互相 import;lib 依赖线性 `agent-chat→markdown→math-cache`;services/api 不反向依赖 pages/lib;`getCurrentPages` 只在 tabbar/share 两处只读栈顶。
- **request.ts 是规整 JSON 咽喉**:统一 baseURL+前缀、Bearer 注入、信封 `{code,message,data}` 解封、401/409→clearToken、抛出同时带业务 code 与 httpStatus 的类型化 `ApiError`。
- **claw 模块级 `const S` 是正确的 load-bearing 取舍**:把 `AgentSocket`/Set/Map/base64 数学图挡在 `this.data` 之外,避免 setData 跨桥序列化;配套 vmCache/lastVMs 引用比较 diff-setData 是深思的性能设计。
- **纯函数 lib 与 Web `shared/` 同构可测**:feed-plan `(seed,page)` 确定性、agent-chat 实时 fold 与历史 replay 同构。
- **平台边界决策有注释**:wx.request 不支持 PATCH → 走后端 POST 别名;store/auth 内存缓存 + 明确"单一真源=storage"。

### 发现

**A1 · [Low,初判 High]** claw.ts 873 行混装 ~15 类职责(连接/折叠/公式管道/记忆化/内容安全/多会话/模型/上传/引用/产出下载)。
- 验证纠正:真正被困的可复用代码仅 math 管道(~57 行)+ vmCache 记忆化(~44 行)≈ 100 行;socket/fold 两块最难的已通用。**当前只有 1 个 agent 页,做 FeatureSpec 化控制器是过早抽象**。
- 建议(低优):先把 math 渲染管道 + vm 记忆化拆成 `lib/agent-render.ts`,让 claw 页瘦身、也为将来第二个 agent 页留好接口。**别为单消费者上大抽象。** · effort: medium(拆管道)/ large(全控制器)

**A2 · [Medium]** 4 个非 JSON 通道绕过 request.ts 手搓 URL+token 且都不清 token:`claw.ts` 上传(wx.uploadFile)、`translate.ts` 流式(enableChunked)、`agent-socket.ts` WS、`claw.ts` 产出下载(wx.downloadFile)。translate 甚至自己重写 429/401 映射。
- 影响:这些通道 401 时不清本地 token,前端仍以为已登录;"拼 authed URL/注 token/处理 401"复制 4 份。
- 建议:services 层加 `authedUrl(path)` + `authHeader()` + `handleAuthFailure(status)` 小工具,四处统一调用并 401 时同样 clearToken。 · effort: small

**A3 · [Medium]** 无全局登录/会话事件:request.ts 401 清 token 但不通知任何页;各页 `isLoggedIn()` 读取时机不一(me 每次 onShow refresh 能恢复;claw 用 `if(!S.inited)` 门控,登录后回 claw 仍显示未登录;library 只 onLoad 读一次)。login 页是孤儿(全仓无一处跳转到它)。
- 影响:会话中途过期后 UI 仍是登录态直到下次 onShow;内联 ensureLogin 登录成功后 claw/library 不自动恢复,需重启。
- 建议:极小的 auth 观察者(store/auth 维护订阅者)在 setToken/clearToken 广播;各页 onShow 统一 reconcile 登录态(claw 去掉 S.inited 对登录态的门控)。 · effort: medium

**A4 · [Medium]** ~10 个 api 模块手写镜像 Go struct,漂移守卫明确被推迟,已靠防御式可选链兜底(papers.ts 搜索响应三层嵌套 `{data?:{data?:Paper[]}}`、references `X[]|{data:X[]}` 联合运行时判 Array)。
- 影响:后端改字段/嵌套层数时小程序静默拿 undefined 走空态,无任何告警(与 Web 端 ~330 手写 interface 同类风险的缩小版)。
- 建议:选关键响应(papers.search / journals / billing.overview / claw DTO)落一层轻量运行时校验,形状异常时打点,别只靠可选链吞。 · effort: medium

**A5 · [Low]** 模块级缓存跨账号不失效:feed 的 `folderCache`/fav 状态登出/换号无重置 → 收藏选夹弹层显示旧账号的夹。建议在 auth 广播里清、或 folderCache 加 TTL/收藏成功后失效。 · effort: small

**A6 · [Low]** 无共享 toast/错误助手,`(e as Error).message` 直吐在 11 页各写一遍;错误处理分叉成"整页 setData({error})" vs "toast"两风格无约定;多数页忽略 `ApiError.code` 只吐 message。呼应 Web 铁律 `friendly-error-messages`(用户面绝不回显 err.Error、隐藏 5xx 保留 4xx)。建议 `lib/feedback.ts: errMsg(e)/toastError(e)` 单一执行点。 · effort: small

**A7 · [Low/Trivial]** `MathImg` 接口在 `lib/math-cache.ts` 与 `services/api/render.ts` 双声明,靠结构化类型互通 → render.ts 直接 `import { MathImg } from '../../lib/math-cache'`。 · effort: trivial

---

## 二、封装冗余

### 做得好的
- 纯逻辑/工具层封装到位:request 信封解封、format/citation/search-filters、anim.closeAnimated、tabbar.syncTabBar、share.currentPagePath 都是真·单一真源。
- **`styles/detail.wxss` 是好的共享 WXSS 先例**:5 个详情页 `@import` 复用全套 `.detail/.state/.badge/.metric/.sheet`——这正是列表页该照抄的模式。
- 骨架屏/动效 token 全部集中在 app.wxss,页面只引类不重定义。
- `search-filters.ts` 把整套搜索 taxonomy 1:1 对齐 Web 集中管理,是本仓封装质量天花板。

### 发现(核心:"列表页 UI"零封装设施——15 页 `usingComponents` 全空、无 components/、无 `<template>`、无共享列表样式)

**R1 · [Medium]** 分页脚手架(`loadingMore/hasMore/page/onReachBottom/fetchPage(reset)`)在 search/library/tools **逐字重写**、billing 半抄:`const items = reset ? vms : this.data.X.concat(vms)` … `hasMore: items.length < total`,onReachBottom 守卫也逐字相同。
- 建议:`lib/paged.ts` 暴露 `makePager<T>({ pageSize, fetch(page) })` → `{ 初始 data, reload(), loadMore() }`;四页各砍 ~30 行。**与性能项 P2 一起做**(pager 内置追加式 setData)。 · effort: medium

**R2 · [Medium]** loading/empty/more 三态 WXML 骨架整段复制:sk-detail(~470 字符)× 6 页、sk-list(~220)× 5 页、`.more` 两行块 × 4 处 ≈ 4600 字符重复(profile-edit 明明不是详情页也贴了详情骨架=复制惯性)。
- 建议:`templates/states.wxml` 内含 `<template name="sk-detail/sk-list/list-more">`,各页 `<import>` 后 `<template is="sk-list"/>` 一行替换。 · effort: medium

**R3 · [Medium]** `.state/.more/.row*/.badge/.cover/.search-*` 在 7 张 WXSS 各写且**已漂移**:`.more` 三处字节全同;`.row-title` line-height 1.4 vs 1.45;`.search-input` 高度 72 vs 68rpx、圆角 36 vs 34。copy-paste 失控实锤。
- 建议:仿 detail.wxss 建 `styles/list.wxss` 收公共列表类,列表页 `@import`,只留各自差异。可删 ~80-100 行 WXSS。 · effort: small

**R4 · [Low]** `wx.setClipboardData + wx.showToast` 复制模式重复 ~7 处(paper/author/tool-detail/news)→ `lib/clipboard.ts: copyText(data, toast)`。 · effort: trivial

**R5 · [Low]** 作者名→展示行 `map(a=>a.name).filter.join + 等N位` 在 5 处各造轮子且口径不一("等 N 位作者"/"等"/"et al.")→ `lib/format.ts: authorsLine(authors, opts)`。 · effort: small

**R6 · [Low]** querystring 手拼 3 种写法(裸拼 vs tools 自造 push vs authors limit/offset)→ request.ts 导出 `qs(params)`(跳空值 + encodeURIComponent)。 · effort: small

**R7 · [Low]** onShareAppMessage 分享 taxonomy 5 详情页同型(path 已抽好,只剩品牌尾巴散 5 处)→ `lib/share.ts: shareCurrent(title, fallback)`。价值低,顺手做。 · effort: trivial

---

## 三、性能优化(主审补做)

### 做得好的
- **claw 是性能标杆**:diff-setData(引用比较只 path-set 变化的轮)+ decorateOne 记忆化 + 模块级非响应式态,长会话重渲染只发变化轮,避免含 base64 的历史每帧整包过桥。
- **agent-socket 定时器卫生到位**:ping/stall/reconnect/flush 四个 timer 都在 `close()` 里清(clearInterval/clearTimeout),claw onUnload 调 close。
- tab 页模块级内存缓存 → 切 tab 秒回;feed-plan `(seed,page)` 确定性重规划 cheap。

### 发现

**P1 · [Medium-High] ★最大性能问题:feed swiper 无窗口化,累积到最多 600 个 swiper-item 全渲染在 DOM。**
- 证据:`FEED_PAGE_SIZE=10 × FEED_MAX_PAGES=60 = 600`;feed.wxml `<swiper><swiper-item wx:for="{{papers}}">` 把**全部** papers 渲染成 swiper-item(swiper 不虚拟化,所有 item 常驻 DOM);feed.ts 每页 `setData({papers: cache.papers.slice()})` 又全量重发整个增长数组。
- 影响:抖音式 feed 越滑内存/DOM 节点越多(每卡含 badges/metrics),随滚动无界增长到 600;这是全仓最明确的内存/渲染热点。**mobile-web 的 feed 早已窗口化(见记忆 mobile-m1-paper-feed),小程序没跟上。**
- 建议:窗口化——只保留 `current` 附近 ~7 个 swiper-item(渲染窗口 slice + 映射 current 索引),或改追加式 setData + 窗口切片。 · effort: medium

**P2 · [Medium]** 列表页(search/library/tools)分页 `concat` 后**全量 setData 整个增长数组**:search 12/页,10 页=120 项,每次 loadMore 把全部 120 项重新序列化过桥(claw 之前的老毛病,这几页没做 diff)。
- 建议:追加式 path-set `setData({['papers['+len+']']: item})` 逐项追加,或 R1 的 pager 内置追加模式。 · effort: small

**P3 · [Medium]** 无长列表虚拟化(无 recycle-view):search/library/tools 列表行全留 DOM,长列表(100+)全渲染。与 P2 叠加。
- 建议:先做 P2 追加式 setData;列表可能很长时引入 `recycle-view`。优先级次于 P1/P2。 · effort: medium

**P4 · [Low]** claw onUnload 只 `S.socket?.close()`,未清 `S.mathRebuildTimer`;`anim.closeAnimated` 的 setTimeout 未在卸载时清 → 卸载后可能 setData 一次(无害,claw 是 tab 页鲜少卸载)。建议 onUnload 补 `clearTimeout(S.mathRebuildTimer)`。 · effort: trivial

---

## 四、页面加载速度 / 冷启动

### 做得好的
- app.ts onLaunch 空、不阻塞;访客免登录即可看内容;claw 重活按 `S.inited` 懒初始化不拖累启动。
- 骨架屏覆盖 11 页首屏感知快;tab 图标内联 SVG data URI 零网络请求;syncTabBar 只 `setData({selected})` 成本极低。

### 发现

**L1 · [Low,初判 High]** 未开 `lazyCodeLoading: "requiredComponents"`,冷启注入求值整包(claw 独占 ~80KB 在非 claw 落地页也被求值)。
- 验证:事实属实、开启零风险(usingComponents 全空、app.ts 空、模块顶层全是纯定义/惰性缓存),**但收益被夸大**(真实是解析几十 ms 量级,非 100-300ms)。
- 建议:app.json 加一行 `"lazyCodeLoading": "requiredComponents"`。零风险快赢。 · effort: trivial

**L2 · [Medium]** "我的" tab:onShow 每次串行拉 `getProfile` 然后 `getBillingOverview`(互不依赖却串行)+ 无缓存秒开 + 无骨架(空壳闪)。
- 建议:① `Promise.all` 并行;② onShow 先用 `store/auth.getUser()` 缓存秒画头像昵称再后台刷新(SWR);③ 加 sk-detail 骨架。 · effort: small

**L3 · [Low]** claw 首屏 `getClawSession → getClawHistory` 两跳串行(history 依赖 sessionId 属必要串行)→ 后端可选内联返最近 N 条 history 省一跳。 · effort: medium

**L4 · [Low]** 无分包/preloadRule(claw 独占 80KB 压主包)→ 收益有限(总量 263KB 仅上限 13%),排 L1 之后,非必须。 · effort: medium

**L5 · [Low]** feed 首屏仅内存缓存,冷启(含分享直达)每次重拉无持久化 → 上次首页卡片落 wx.storage 冷启先出屏再后台刷(SWR)。 · effort: small

**L6 · [Low/Trivial]** request.ts wx.request 未设 timeout(默认 60s),弱网/后端卡时首屏骨架最坏挂 60s → 首屏读类设 15s timeout,超时走既有 ApiError 错误态。 · effort: trivial

**L7 · [Low]** author 详情 `getAuthorDetail → getAuthorPapers` 仅共享 id 却串行 → 可并发。 · effort: trivial

---

## 五、优先级路线图

### 🟢 立即做(trivial/small,高性价比;半天内)
1. **feed 窗口化(P1)** —— 最大性能收益,防内存无界增长
2. app.json 加 `lazyCodeLoading`(L1)—— 一行零风险
3. request.ts wx.request 加 15s timeout(L6)
4. "我的" tab 并行请求 + getUser 缓存秒开 + 骨架(L2)
5. 列表页追加式 setData(P2)
6. MathImg 单声明(A7)、`lib/clipboard.ts`(R4)、`authorsLine`(R5)、`qs()`(R6)—— 顺手清

### 🟡 中期(medium,减债;1-2 天)
7. `lib/paged.ts` 分页收口(R1)+ 追加式 setData(P2 合并做)
8. `templates/states.wxml` + `styles/list.wxss` 骨架/样式收口(R2/R3)—— 消除已发生的视觉漂移
9. `lib/feedback.ts` 错误助手 + 落 Web `friendly-error-messages` 铁律(A6)
10. 网络边界 `authedUrl/authHeader/handleAuthFailure`(A2)
11. auth 会话观察者 + onShow reconcile(A3)
12. 关键响应轻量运行时校验(A4)

### 🔵 可选 / 观望(large;第二个 agent 页出现再做)
13. claw 拆 `lib/agent-render.ts`(math 管道 + 记忆化)先瘦身(A1 的 medium 版);**全控制器 FeatureSpec 化等真有第二个 agent 页再上,别过早抽象**

---

## 附:方法与置信度
- 5 维中架构/冗余/加载速度来自并行子代理审计并对高危项对抗验证;性能维度子代理失败、由主审补做;网络数据层子代理返回退化响应,其议题已被架构维度(A2/A3/A4)覆盖。
- 两个初判 high 均经对抗验证下修——报告如实反映,**避免过度整改**。
- 所有 file:line 证据可回溯;严重度按"对用户/性能/维护的真实影响 + 触发概率"评定。
