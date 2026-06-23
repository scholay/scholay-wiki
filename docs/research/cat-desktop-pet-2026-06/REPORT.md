# 桌面猫咪宠物陪伴应用(桌宠)技术与产品立项调研报告

> 范围:独立桌面桌宠(Windows 优先 + macOS 必须兼容),纯换装/收集定位(无养成数值、无经济系统),核心 = 猫咪皮肤系统 + 猫舍陈列 + 桌面互动动画。
> 说明:文中所有"已核实/确认"的结论均经过对抗式核查(verdict=confirmed);凡核查为 partially-correct / uncertain 的硬约束(尤其 Live2D 授权、跨平台点击穿透、各类报价),均已就地标注不确定性并给出修正值。

---

## 1. 执行摘要

**做不做:建议做,且存在清晰的差异化窗口。** 桌宠是 2024–2026 在 Steam 上被官方认证复兴的细分品类(Bongo Cat 截至 2026-06 仍有 ~13–15 万并发、10 万+ 条"好评如潮"评测——注意:并发"长期 9.5–15 万"是 2025 年中旧快照,现已更高;评测"约 2.7 万"是英文子集误读,全语言实为 10.4 万)。市场已经很拥挤,但**没有任何一款产品精确同时满足「猫专精 + 海量皮肤收集 + 专门猫舍房间 + 纯换装零养成/零经济」这套完整组合**——差异化窗口在于这个精确定位,而非"品类空白"(品类已不空白)。

**怎么做(三个最关键结论):**

1. **美术形态:MVP 锁 2D 帧动画/像素,主力收集靠 palette swap + 部件复用;Live2D 作为 V1 旗舰表现力升级的候选,但必须先向 Live2D 官方书面确认授权归类。** 三形态里 2D 帧动画零运行时授权、换皮门槛最低、最适合"海量皮肤";Live2D 表现力/成本比最优,但本产品的"换装+猫舍"形态**很可能被判定为 Live2D 的 "Expandable Application"**,一旦命中则**无论收入多少、即便零收入都需事先审批并签 Publication License**——这会击穿"个人/小企业免费"的前提,是 Live2D 路线的头号风险。3D 对纯换装贴桌面角落的定位不划算,排除为主力。

2. **技术栈:Electron 做 MVP(透明/穿透/置顶 API 跨平台最一致、Live2D 与桌宠开源案例最多),把"低资源占用"当后续优化目标而非 MVP 硬指标。** Tauri v2 体积/内存优势巨大(包 ~8MB、RAM 十几到几十 MB)且有 BongoCat 等活跃跨平台桌宠背书,但 **macOS 透明窗口必须用私有 API(放弃 Mac App Store)、生产 .app 透明丢失是仍 OPEN 的 bug(#13415)、点击穿透无 per-region 能力需自写帧循环兜底**——这些是已核实的硬约束,适合在玩法验证后、把省资源作为卖点时再迁移。

3. **皮肤包必须是"数据-only"(声明式 manifest + 资源目录,严禁任何可执行代码),功能扩展只由官方主程序提供。** 这是从 Shimeji(纯数据包,天然安全)和 VPet(Plugin=任意 C# DLL,真实 RCE 雷区)两条参考线收敛出的最优解,对纯换装定位零损失、消除任意代码执行面、避免杀软误报。

---

## 2. 美术形态选型(核心)

### 2.1 横向对比表

| 维度 | 2D 帧动画 / 像素 | Live2D(2D 骨骼/网格变形) | 3D 模型(含 VRM) |
|---|---|---|---|
| **单只起步成本** | 工具 Aseprite **$19.99 买断(已核实,2026 未变)**;现成猫包 $1–20;AI(PixelLab,见下)≈$0;外包旗舰单只 $250–1500(桌宠帧少,远低于游戏角色) | 一只可动猫含建模+绑定外包 $600–2500+(全身,商用加价 1.5–3x);Cubism Editor PRO ~$100/年(可由外包方持有) | 定制带动画单只 **$1000–5000(已核实区间;极简可下探~$500,写实/AAA 可上探 $6k–20k+)**;复用 VRM 生态可近乎 $0 |
| **表现力上限** | 受限于逐帧手绘量;互动平滑过渡难(帧间无插值) | 高:呼吸/眨眼/口型/尾巴耳朵物理摆动,丝滑生命感;2.5D 不能真旋转视角 | 最高:自由旋转、真透视、动态光照——**但纯贴桌面角落用不到** |
| **换皮/海量收集难度** | 整套换 sheet 边际成本不降;**palette swap(换色,边际≈0)+ 部件分层(组合扩展)**可压成本 | 路线 A(同 MOC 多贴图/可显隐部件,贴图成本低)适合大量换色;路线 B(整模型切换)每套=一只新模型的钱 | 换贴图/材质(花色)便宜可复用骨骼;换 mesh(装备/体型)每件需重建模+绑权重,贵 |
| **工具链** | Aseprite + PixiJS,生态最成熟、案例最多 | Cubism Editor;运行时**原版 pixi-live2d-display 已停更(2023-12,不支持 Cubism 5),须用活跃 fork** untitled-pixi-live2d-engine(MIT,2026-06 仍维护,支持 Cubism 2–5 + PixiJS v8) | Unity + UniWindowController + VRoid/UniVRM;或 Blender 出 glTF/FBX |
| **授权** | **零运行时授权**(Aseprite 自身买断、PixiJS MIT) | **高风险**:Cubism Core 闭源须 bundle 不可单独再分发;免费豁免有两条硬约束(见 2.3) | Unity Personal <$20万收入免费,超过 Pro **$2,310/seat/年(已核实:2026-01 起,非旧报的 $2,200)**;VRM 格式本身开放免费;非 Unity 渲染则无此费 |
| **跨平台** | 最省心(纯切图,GPU 近空载,常驻耗电最低) | 强绑 Web 栈(Electron/Tauri),跟随窗口层坑 | Unity+UniWindowController 是唯一较成熟的 Win+Mac 透明逐像素穿透;但被迫 D3D11 BitBlt、禁/特殊处理 HDR(已核实硬限制),常驻 GPU 耗电最高 |

### 2.2 推荐

**首选(MVP):2D 帧动画/像素 + 混合双轨皮肤架构。**
- 旗舰皮肤走"整套换 spritesheet"(表现力拉满,作收集核心稀有物);
- 海量普通变体走"palette swap 调色板替换"(PixiJS ColorReplaceFilter / 自定义 GLSL,一只母版猫秒出几十种花色,边际成本≈0)+"部件分层"做组合扩展。
- 理由:三形态里综合成本最低、零授权风险、最契合"海量收集"、跨平台最省心、常驻耗电最低。
- **AI 铺量**:PixelLab 支持骨架动画/spritesheet 导出,计费按 credit(基础 1 credit/次、高级 40 credits/次;单次帧数随画布尺寸递减,32×32 约 16 帧 / 128×128 约 4 帧)。**订阅区间不是简单 $9–22,而是约 $9–50/月含连续订阅折扣三档(Apprentice/Artisan/Architect),且"真实单价"还需用账户内每档 credit 配额坐实换算**——AI 定位为"铺量+草稿",帧间一致性弱,不能替代旗舰手绘。

**次选(V1 表现力升级):Live2D。** 表现力/成本比最优,与换装收集高度契合。**但上线前必须完成一件事:就本产品的"换装+猫舍(管理多猫/多皮肤)"玩法,直接书面咨询 Live2D 是否被判为 Expandable Application(见 2.3),不要默认享受免费豁免。** 若被判定,Live2D 反而是成本/审批最重的选项。

**排除为主力:3D。** 仅当把"可 360° 旋转的 3D 猫舍展厅"做成差异化核心卖点时才考虑;否则等于付了 3D 全部成本只用到 2D 表现面。若坚持 3D,务必用 Unity + UniWindowController + VRM 生态,绝不从零建模(注意:猫是四足非拟人,VRM humanoid 的现成红利会大幅打折)。

### 2.3 Live2D 授权——必须如实标注的硬约束(核查为 partially-correct,已修正)

> 以下为对抗式核查后的**修正值**,与原始调研摘要中流传的简化说法有出入,立项财务测算请以此为准,并最终以 live2d.com 官方逐字条款 + 官方书面确认为准。

1. **免费豁免有两条硬约束,不是一条门槛:**
   - 规模线:**个人 + 小规模企业(最近财年销售额 < 1000万日元)** 商用发布免签约免费。注意官方两份文档口径不一致——正式 EULA 把签约义务绑在 **<1000万日元(10M JPY)**,而 SDK License 营销页用 **2000万日元(20M JPY)** 作触发线;**应采更保守的 1000万日元口径**。2000万日元那条专指"以应用为主营的 VTuber tracking software"情形,**不是通用的"换装主营即触发"**。
   - **Expandable Application 例外(本产品头号风险)**:官方定义为"通过增删/组合文件生成不定数量模型(如 avatar)"或"一个 title 内含多个/可访问多个作品(如合集/门户)"。**本产品的"多皮肤切换 + 猫舍收藏馆"很可能命中此定义**,一旦命中:即便 <1000万日元也**不再豁免**,须事先审批 + 签特殊 Publication License、须有有效营收模式(完全免费一般不批)、须提交销售报告并按营收分成,Live2D 有权拒批。

2. **发布计划要选对(原调研引用的 G 计划对桌面产品是错的):**
   - Windows/macOS **桌面应用走 Plan F「One-time Purchase – Console/PC」**,不是按月的 G 计划(G 仅限 iOS/Android/HarmonyOS/Web)。
   - Plan F 价格:<1000万日元免费;中型企业(<1亿)一次性 **¥600,000(约 $3,712)** 或按件 ¥40/件;大型(≥1亿)一次性 **¥3,600,000(约 $22,270)**。是一次性/按件买断,非月费。

3. **运行时**:Cubism Core 闭源、必须随 app 打包、不可单独再分发;生产须用支持 Cubism 5 的活跃 fork(untitled-pixi-live2d-engine);moc3 版本须与 Core 匹配(checkMocConsistency 校验)。

---

## 3. 技术栈选型

### 3.1 推荐栈

**MVP 推荐:Electron + PixiJS(2D 帧;Live2D 升级时用 pixi-live2d-display 活跃 fork)。**
**资源敏感后续:Tauri v2(Web 资产大部分可复用)。**
**3D 路线(若走):Unity + UniWindowController + VRM。**

### 3.2 Win + macOS 五项能力可行性与坑(已核实)

| 能力 | Electron | Tauri v2 | 备注/坑(核查结论) |
|---|---|---|---|
| **透明窗口** | 跨平台 API 齐全 | Windows=WebView2(Chromium);**macOS=WKWebView(WebKit),WebGL 行为与 Chromium 有差异需单独验证** | Electron 有**已核实**的透明渲染 bug:macOS vibrancy 随机变白(#31862,长期反复);Windows 透明+resizable 互斥/黑底(#48421/#49173,38/39 近期回归)。四条 issue 现均已 Closed,但**问题家族屡修屡现**,桌宠固定尺寸不缩放可规避大部分。Tauri macOS 透明**必须 macOSPrivateApi=true(放弃 Mac App Store)**,且**生产 .app/DMG 透明丢失变白是仍 OPEN 的 bug #13415(已核实,2025)**——dev 正常≠生产正常。 |
| **点击穿透** | setIgnoreMouseEvents(ignore,{forward:true}),**per-element 而非真逐像素**(已核实) | **无 per-region/per-pixel 能力,是整窗 all-or-nothing 架构限制(非纯 Windows bug,已核实)** | Tauri 需变通:requestAnimationFrame 帧循环 + 逐像素 hit-test + 极淡背景色(rgba(...,0.01))绕过 macOS alpha=0 自动穿透;**注意原调研"60fps 轮询是事实标准"被核查修正为 partially-correct——它是必要 workaround 之一而非唯一/公认标准,CrabNebula 官方桌宠教程用的是"固定 ignore + 全局鼠标钩子"另一条路**。Electron forward 模式也有坑(Windows mouseleave/:hover 不可靠、跨窗口聚焦失效)。真正逐像素命中只有原生 Win32 WM_NCHITTEST,可作兜底 native addon。 |
| **置顶** | alwaysOnTop 成熟 | 成熟 | macOS 浮于全屏 App/所有 Space 需精确配 NSWindow.level + collectionBehavior + Accessory,各栈封装程度不一,易踩坑。 |
| **开机自启** | app.setLoginItemSettings | tauri-plugin-autostart | 两栈均成熟,**非选型痛点**(已核实)。 |
| **托盘** | Tray API | System Tray 插件 | 两栈均成熟一等公民。 |

### 3.3 明确标注:被核查 refuted / 需存疑的论断(不要写成定论)

- **"Tauri Windows 点击穿透必须 60fps 轮询是事实标准"** → **partially-correct**。修正:它是被验证可行的主流 workaround 之一,但存在并行方案(全局鼠标钩子、CSS rAF 逐像素),且本质是**跨平台架构限制**而非 Windows bug;Tauri 桌宠路线本身可落地(有 CrabNebula 官方教程佐证),不可据此判 Tauri 不可行。
- **"Tauri/Electron 内 PixiJS 实测 1000 sprite@60FPS / 4000@30FPS"** → **partially-correct**。修正:这组数字源自**浏览器+中低端设备(iPhone SE/Dell,PixiJS v4/v5)** 的论文基准,**并非 Electron/Tauri 内实测**;官方拒绝给硬阈值因强依赖硬件。结论方向仍成立(桌宠单猫仅数十 sprite,性能绰绰有余),但"猫舍多猫"场景须在**目标最低配机器 + 实际运行时(尤其 Tauri macOS=WebKit)** 上真实压测。
- **"UniWindowController 在 macOS/Apple Silicon 稳定支持透明+逐像素穿透"** → **partially-correct**。修正:官方 README 自述"未充分测试、可能不稳定",且 Apple Silicon 上有过已修复的真实崩溃(Issue #65,v0.9.7 修复);可作主选但**必须真机端到端验证并锁 ≥0.9.7**。
- **Wails(v3 alpha、v2 macOS 透明 bug)** → 不推荐承载桌宠(已核实风险最高)。

**铁律:macOS 透明 + 置顶 + 点击穿透必须在 MVP 第一周就在真机(Sonoma 14 + Sequoia 15,Intel + Apple Silicon,签名/公证后的 .app)上验证,不能等后期、不能仅凭文档判可行。**

---

## 4. 外观/皮肤系统架构

### 4.1 核心原则

**皮肤包 = 声明式 manifest(JSON)+ 资源目录,严禁任何可执行代码。** 功能扩展(新行为逻辑)只由官方主程序实现,UGC 绝不携带代码。理由(已核实):Shimeji 纯数据包天然安全可热加载;VPet 的 Plugin=任意 C# DLL 在宿主进程内同权限执行,是真实 RCE 雷区,且对纯换装定位毫无必要。

### 4.2 皮肤包规范草案

```
skins/<skin_id>/
├── skin.json            # manifest(必须)
├── preview.png          # 缩略图
├── sprites/             # art_type=sprite 时:PNG spritesheet + JSON atlas(Aseprite 导出)
├── model/               # art_type=live2d 时:model3.json + moc3 + textures/ + motions/
└── audio/               # 可选,白名单 .ogg
```

**manifest 关键字段:**
- `schema_version`(版本化,发布即成创作者契约,必须向后兼容)
- `id` / `name` / `author` / `version`
- `art_type`:`sprite | live2d | spine | model3d`(**切换渲染管线的字段,manifest 结构对四形态正交**)
- `preview`
- `states[]`:每项 `key ∈ {idle, walk, sleep, sit, play, touch_head, touch_body, drag, drop, ...}`,映射三选一(`frames` / `motion` / `skin` / `clip`),含 `loop / fps / anchor / segments{start, loop, end}`
- `audio`(可选,白名单)
- **不含任何脚本字段**

**多状态动画约定**:借鉴 VPet 状态命名但**去掉健康/数值维度**,只保留行为态(Default/Move/Sleep/Play)+ 交互态(Touch_Head/Touch_Body/Drag);分段用 `A_Start / B_Loop / C_End` 让起手-循环-收尾自然(VPet 社区常见约定,非官方逐一列出)。

**美术形态对换皮成本的工程排序**:Spine/3D 最优(一套骨骼动画→无限 skin/材质,换皮零重做动画)> Live2D(换整 model3.json 或换 texture)> 2D 帧(每套皮肤重画全部状态帧,包体随状态数线性膨胀)。**若收集库要做大,优先用"骨骼共享/调色板复用"摊薄换皮成本。**

### 4.3 皮肤切换与皮肤库

- 切换:猫舍点选 → 实时预览动画 → 一键"设为出战",带过渡动画。
- 库:支持筛选(美术形态/作者/已解锁)、排序、搜索、收藏夹。
- 热加载:文件监听 / "重新载入"按钮,体验上做成无需重启(优于 Shimeji 重启生效)。

### 4.4 是否开放第三方创作者(创意工坊)

**建议开放,但分阶段且分发优先 Steam 创意工坊(SteamUGC)。** Steam 托管下载/订阅/更新 + 举报审核机制,UGC 风险显著低于裸 zip。裸 zip 导入作离线兜底,但必须自带全套校验(见风险清单 R-UGC)。

> SteamUGC 能力假设(CreateItem/StartItemUpdate/SetItemContent/订阅自动后台下载、需 steam_appid.txt)经核查 **confirmed**。补充已核实约束:预览图 SetItemPreview **<1MB**(流传的 10MB 是 legacy 上传路径单文件上限,非内容总上限);上传前须在 App Admin 勾选 "Enable ISteamUGC for file transfer" 并配 Steam Cloud 配额;查询 API 上限 1000 item/次;steam_appid.txt 上传 depot 前须删。

### 4.5 存储与同步

资源(大、不变)与进度(小、常变)分离:皮肤资源放 `skins/` + 工坊目录;收集进度/收藏/出战配置放小 JSON/SQLite。**云同步只同步进度**(Steam Cloud / ISteamRemoteStorage),避免同步几百 MB 美术资源;换设备时资源按订阅自动拉回。

---

## 5. 猫舍设计

### 5.1 产品形态推荐:"2D 房间陈列 + 列表画廊"双视图(MVP 先做纯列表)

- **MVP**:纯列表画廊(网格卡片,缩略图+名称+解锁状态,未解锁显剪影+解锁条件,顶部完成度进度条)。开发/美术成本最低,先跑通收集闭环。
- **V1 升级**:2D 房间陈列(已解锁的猫/皮肤以立绘陈列在猫窝/书架/窗台等位,点选预览→设为出战)。既有"家"的情感氛围,又保留列表的检索效率。
- **V2(可选)**:可自由摆放的场景编辑器(拖拽多猫+家具装饰,纯展示无数值,可截图分享)。开发最重,放后期;**纯收集定位下要克制别滑向养成/经营**。

### 5.2 与桌面悬浮猫的关系

**"出战 vs 收藏"而非同一对象**:桌面悬浮的是当前出战的 1 只(或少数几只),猫舍是收藏馆(可上架/换出)。

### 5.3 交互要点

- 收集进度用"图鉴"模式:未解锁剪影 + 解锁条件 + 完成度百分比,**纯收集无数值**。
- 新解锁有"开箱式"仪式感(纯收集,不抽卡不付费数值压力)。
- 导入皮肤包给清晰的校验失败原因提示。
- 多窗口/多显示器下出战猫位置记忆(DPI 切换/跨屏移动须纳入测试用例)。

---

## 6. 竞品借鉴与差异化

### 6.1 关键竞品做法清单

| 竞品 | 形态/栈 | 可借鉴点 | 与本产品定位关系 |
|---|---|---|---|
| **Bongo Cat** | 现象级爆款,纯陪伴+换饰品,Win/Mac | 收集闭环:活跃掉落+稀有度(Common→Legendary 1/500000)+集齐10个合成升级+Steam 市场可交易;变现从纯免费转向**付费主题皮肤包**(口碑最友好,明示"支持开发") | 同为"纯换装无养成",但**无猫舍、有按键点数循环**;海量皮肤支柱已被它占满,须差异化 |
| **VPet** | 开源 WPF,5万+评测,Steam 创意工坊 | 创意工坊 UGC 护城河;Info.lps 清单;分状态×分变体动画建模;免费 ModMaker | **有完整养成数值(好感/健康/工作学习)——与本产品相反,作反向对照**;Plugin=DLL 是安全反面教材 |
| **Shimeji** | 开源 Java,img/[NAME]+actions.xml/behaviors.xml | **纯数据皮肤包黄金范本**(零代码、热加载、安全);皮肤包格式设计直接参考 | 换皮范式鼻祖 |
| **Desktop Mate** | Unity/VRM,8966 评价,基础免费+~$15/角色 DLC | 3D 桌面陪伴临场感;基础免费+付费 DLC 模型 | **其成功高度依赖授权 IP(初音等),而非换装玩法本身;原创无 IP 不可照搬其变现假设**(已核实);且为保护 IP 反而禁用户导入 VRM |
| **移动端养猫游戏**(Cat Game 900+猫/Cats Tower/Neko Gacha) | 移动 | **"收集→猫舍分层陈列→换装→串门炫耀"整套机制成熟、强黏性** | **桌面端无人照搬——这正是本产品的核心借鉴源** |
| **WindowPet** | Tauri+React,45+宠物,自定义+收藏窗口 | 跨平台桌宠管理器现成参考(多宠物同屏+设置/收藏 UI) | 验证 Tauri+React 可做带 UI 的桌宠 |

### 6.2 差异化定位

> 核查修正:不要宣称"品类空白"(品类已拥挤,2025–2026 新品扎堆:Desktop Purrfect、Sill Cats、Digital Desktop Cats、Cat On The Desktop、Desktop Cat Cafe 等)。

**差异化锚点(精确措辞):「猫专精 + 海量皮肤收集 + 专门猫舍房间 + 纯换装零养成/零经济」四者合一——这套精确组合截至检索未被任何产品同时满足。** 最接近的竞品各缺一角:Bongo Cat 缺猫舍且有点数循环;Desktop Purrfect 有 idle/养成进度(违反纯换装);Desktop Cat Cafe 是经营/经济驱动。

**立项前必做**:针对性复扫 Steam 新品 / itch.io / 微软商店,重点比对上述竞品是否会去掉养成数值转向纯换装、补齐猫舍支柱。

**"纯换装无养成"是双刃剑**:它是与 VPet 的清晰区隔、契合 2025 cozy/反内卷情绪,但**也可能削弱长期留存**(养成本是黏性来源)——须用"收集进度 + 猫舍陈列成就 + 稀有度炫耀"替代养成提供长期目标,否则可能"好看但很快无事可做"。

---

## 7. 素材获取与变现/发行(深度核查版)

> 本节所有硬数字均经联网核查,括号内为来源;凡未能从一手来源确认的,明确标注「待核实」。信息时效以 2024–2026 为主,截至 2026-06。汇率按 1 USD ≈ 7.2 CNY、1 USD ≈ 155 JPY、1 GBP ≈ 1.27 USD 粗算(仅供量级参考)。

### 7.1 美术素材获取成本(2D 像素/帧 猫为主)

#### 7.1.1 现成商用素材市场:价格与 license 红线

桌宠猫的 2D/像素素材市场极其成熟,**单包价格普遍在 $0–$20**,关键不是价格而是 license 条款。核查的代表样本:

| 来源/包 | 价格 | 内容(状态/动画) | 商用 | 可否再分发/转售 | attribution |
|---|---|---|---|---|---|
| Elthen《2D Pixel Art Cat Sprites》 | name-your-price(可 $0);并入 Animals Bundle #1 = $20 | Idle×2/clean×2/move×2/sleep/paw/jump/scared,32×32 | 允许商用 | 完整条款在其 Patreon,页面未列(待核实) | 鼓励但非强制(itch.io 页) |
| LuizMelo《Pet Cats Pack》 | 免费,**CC0** | 多状态猫 | 允许商用 | CC0 等于可任意使用 | 不要求 |
| seethingswarm《Catset》 | 最低 $19.99 | 多状态 | 允许商用、可改 | **禁止单独转售/赠送** | 可选署名 SeethingSwarm |
| ToffeeCraft《Cat Pixel Mega Pack》 | name-your-price(最低 ~$1.80);并入 Spring 2025 Mega Pack = $8.50 | **10 种花色 × 10 动画**(sleep/run/hurt/attack/idle×2/die×2/jump/sitting)+ 猫窝/碗/玩具等;明示「无 AI 生成」 | 允许商用、可自由编辑 | **禁止再分发/转售** | 习惯署名 |
| CraftPix(整站会员/单品) | 单品 $几~$几十;会员制 | 大量 2D 素材 | 允许商用、可在付费 app 里卖 | **严禁转售源文件或"略改版"** | 不要求(欢迎署名) |

(来源:[Elthen itch](https://elthen.itch.io/2d-pixel-art-cat-sprites)、[ToffeeCraft Mega Pack](https://toffeecraft.itch.io/cat-pixel-mega-pack)、[CraftPix license](https://craftpix.net/file-licenses/)、[itch.io cats tag](https://itch.io/game-assets/tag-cats);Catset/LuizMelo 价格与条款来自 itch.io 搜索摘要)

**对本产品最致命的一条 license 红线(务必内化):**
几乎所有商用素材包都**允许把素材打包进你的成品 app 卖**,但**禁止把素材"以最终用户可再取出/再导出的形式"分发**。CraftPix 的措辞最清楚:不得"以让其它最终用户能取用这些素材文件的方式再分发",也不得做"允许用户保存/导出修改后素材本身"的 app([CraftPix license](https://craftpix.net/file-licenses/))。
→ **直接后果:**「猫舍换装系统」把第三方素材当作可被用户解包的皮肤资源直接发出去,处于灰区。安全做法是把第三方素材**烘焙进打包后的运行时资源(加壳/合图/非明文 PNG)**,或仅把第三方包用于**自绘的二次创作底稿**,旗舰皮肤与"可被工坊导出的素材"应使用 CC0 或自有/外包买断版权的素材。
另外 CraftPix 明确**禁止把其素材用于训练 AI**([CraftPix license](https://craftpix.net/file-licenses/)),若你计划"用买来的猫训练自己的 palette/风格模型",此路不通。

#### 7.1.2 外包定制(像素/帧 vs Live2D)

- **像素/帧外包(Fiverr)**:单个角色的精灵+动画 gig 起价 $10–$40,但**有实战量的成片**:买家反馈"一张像样的 sprite sheet 至少 $120",整体 2D 动画区间 $10–$467([Fiverr sprite-animation](https://www.fiverr.com/gigs/sprite-animation)、[Fiverr 2D 动画成本](https://www.fiverr.com/resources/guides/costs/2d-animation))。
  → **桌宠 vs 游戏角色的便宜幅度**:桌宠单状态帧数少(idle/sleep/walk/几个互动 8–12 帧即可,无战斗连段/受击/方向集),实际工作量约为完整游戏角色的 **1/3–1/2**。据此,**一只多状态桌宠猫的像素外包旗舰约 $150–$400/只**(含 6–10 个状态动画),是合理预期区间(综合 Fiverr 量级 + 桌宠帧数折扣推算,**属推算非报价单**)。
- **Live2D 外包(V1 候选)**:贵一个数量级。仅绑定(rigging-only)$50–$150(头/半身/全身),设计+绑定的全流程 $260–$560 起,商用级一般 **$500–$3,000/角色**;**商用授权通常再 ×1.5–3 倍**([ShiraLive2D 2025 定价](https://shiralive2d.com/live2d/how-much-does-a-live2d-model-cost/)、[VTuber rigging 价格指南](https://vtubergame.com/blog/vtuber-rigging-model-pricing))。
  → 结论印证立项判断:**Live2D 不适合做"皮肤数量支柱"**(单价是 2D 的 3–10 倍),只适合做少量旗舰/招牌角色。

#### 7.1.3 AI 生成(像素/2D 精灵):计费、一致性、版权风险

- **PixelLab**:Tier 1「Pixel Apprentice」**$12/月**(连续订阅最低降到 $9/月),支持到 320×320、动画、骨骼/角色生成器一键出行走等动画与精灵表;免费试用 40 次。基础生成 1 credit/次,部分新模型 40 credits/次;**所有付费档含商用授权**([PixelLab 官网/定价摘要](https://www.pixellab.ai/)、[PixelLab FAQ](https://www.pixellab.ai/docs/faq))。
- **Scenario**:免费 50 credits/天;Starter **$15/月**(1,500 compute units)、Pro **$45/月**(5,000)、Max **$75/月**;**全部付费档含完整商用授权**(可改、可在游戏中出售、无版税),免费档仅个人/试用([Scenario 定价](https://www.scenario.com/pricing))。年付约便宜 33%。
- **单张成本量级**:在 $12–$15/月档、credit 池规模下,**单张精灵的摊销成本 < $0.1**,几乎可忽略;真正的成本是**人工挑选/修帧/对齐**的时间。
- **帧间一致性局限(关键技术风险)**:AI 精灵在**逐帧动画的连续性、palette 稳定、像素网格对齐**上仍易抖动,通常需要人工返修;骨骼/角色生成器能缓解但不能消除。→ **AI 适合"出静态花色变体/单帧底稿",不适合"直接产出可发布的逐帧动画"。**
- **版权/商用归属风险(必须写进风控)**:
  1. 工具侧:PixelLab、Scenario 等**付费档授予商用使用权**(你可商用、可卖)([PixelLab FAQ](https://www.pixellab.ai/docs/faq)、[Scenario 定价](https://www.scenario.com/pricing))。
  2. 法律侧:美国版权局 2025-01-29 报告确认——**纯 AI 生成的输出不可版权登记**,只有"人类做了足够创造性安排/修改"的部分才受保护([U.S. Copyright Office AI](https://www.copyright.gov/ai/))。即你**能卖,但拿不到对纯 AI 图的独占版权**(别人也可仿,你也难以维权)。
  3. 责任侧:多数 AI 工具 ToS 是"你拥有输出、但你为侵权索赔向我方做赔偿担保(indemnify)";终端用户被诉风险目前很低(诉讼集中在 AI 厂商),但**若刻意 prompt 复刻受保护角色/产出与现有作品高度相似并商用,风险显著上升**([VLP Law](https://www.vlplawgroup.com/blog/2025/06/02/copyright-and-ai-generated-images-what-you-need-to-know-a-blog-post-by-michael-whitener/))。
  → **风控落地建议:** AI 仅用于**自有花色/底稿**,产出后**人工二次创作再发布**(既提质量又把"人类创造性"补足,利于权属);**禁止 prompt 任何知名 IP 猫**(招财猫、汤姆、各 VTuber 等)。

#### 7.1.4 palette swap / 部件分层:为何边际≈0

「皮肤数量是支柱」的经济性核心就在这里:一套**带分层/可索引调色板**的母版动画做好后,新增一个花色变体仅需**改色表或换部件图层**,不重画动画帧——**单变体边际工时从"小时级"降到"分钟级",边际成本趋近 0**。这正是 ToffeeCraft 一个包就给到 10 花色 + 节日变体的做法([ToffeeCraft](https://toffeecraft.itch.io/cat-pixel-mega-pack))。
→ **工程前提:** 母版必须**调色板可索引 + 部件可分层**(耳/眼/花纹/配饰独立图层)。这条要在美术规范 MVP 阶段就锁死,否则后期想批量 palette swap 会推倒重来。

#### 7.1.5 启动期「30–50 套首发皮肤 · 最低成本」配比建议

目标:首发 30–50 套皮肤,质量分层,版权可控,总预算可压到 **¥3,000–¥12,000 区间**(约 $450–$1,700)。建议配比:

| 来源 | 数量(套) | 单位成本 | 小计(USD) | 版权/用途定位 |
|---|---|---|---|---|
| **自有母版 + palette swap 变体**(主力) | 20–30 | 边际≈0(算进母版工时) | ~0 | 完全自有版权,可进工坊/可被导出 |
| **AI 出花色底稿 + 人工修整**(扩量) | 8–12 | 摊销 < $1/套 + 修整工时 | $15–$45/月(1–2 月订阅) | 人工二创后发布,**禁知名 IP** |
| **CC0 / 自由商用现成包**(快速铺量) | 5–8 | $0–$20/包 | $0–$60 | 选 CC0(如 LuizMelo)以规避"不可再分发"红线 |
| **外包 1–3 只旗舰整套手绘**(招牌) | 1–3 | $150–$400/只 | $300–$1,200 | 买断版权,作首屏/付费包封面 |

> 推荐落点:**自有 palette swap 做骨架(占 60–70%),AI 扩花色(20%),外包 1–2 只旗舰压封面**。总预算保守 **$400–$800** 即可冷启 30–50 套;若旗舰加到 3 只,上限约 **$1,500–$1,700**。
> ⚠️ 凡"会进创意工坊 / 用户可导出"的皮肤,**只用自有/CC0/买断版权素材**;带"禁再分发"条款的商用包(Catset/ToffeeCraft/CraftPix)只能烘焙进运行时、不可作可导出工坊资源。

### 7.2 变现(纯收集定位,无养成/经济,但要活下去)

#### 7.2.1 适配纯收集的变现组合(优劣)

| 模式 | 机制 | 优 | 劣 / 口碑风险 |
|---|---|---|---|
| **付费主题皮肤包(DLC)** | 核心免费,主题包单独/打包卖 | 与"收集"定位天然契合;可持续上新;对核心体验无侵入 | 数量多易显碎;定价过高遭差评 |
| **一次买断高级版** | 免费版基础皮肤 + 买断解锁全部/Pro | 口碑最干净,无"逼氪"观感 | 上限低,后续无复购 |
| **订阅解锁全皮肤** | 月/年订阅解全部 | 现金流稳;适合持续上新 | 桌宠是"陪伴工具",用户对"订阅一只猫"接受度低,需谨慎 |
| **创意工坊创作者分成** | UGC 皮肤,平台抽成 | 内容自增长;社区粘性强 | 需平台支持(SteamUGC);需审核 IP 侵权 |

> **推荐主轴:核心免费 + 付费主题皮肤包(DLC)为主,叠加一次性"完整版/支持包"**;订阅最多作为"全皮肤通行证"的可选项,不要强制。工坊分成作为 V1+ 的社区增长手段。

#### 7.2.2 真实案例定价与口碑结果(核查)

- **Bongo Cat(免费桌宠,后转向付费皮肤包)**:基础免费、靠活动解锁 cosmetics;曾"完全不打算收费",开发者自述**首月净赚约 $2,000、4 月病毒期峰值 $4,050、6 月回落到 $2,800**(均为 Steam 抽成后),96% 好评(26,982 评)([GameSpot](https://www.gamespot.com/articles/viral-steam-hit-bongo-cat-doesnt-actually-make-any-money/1100-6532777/))。其后**确实上线了付费 DLC 皮肤包**:如「God Pack」(希腊神话 Zeus/Poseidon/Hades 三套皮+帽)售价 **¥1,038 RMB(约 $14;USD 价未在页面直显,待核实)**,且每套可单买、整包打折([Bongo Cat God Pack](https://store.steampowered.com/app/3929900/Bongo_Cat__God_Pack/);单套约 £3.99 来自 GameGrin 报道,**待核实**)。
  → 启示:**纯免费 + 病毒流量 ≠ 能养活**;Bongo Cat 正是从"零变现"补上"付费主题皮肤包"。
- **Desktop Mate(免费基座 + 角色 DLC)**:一周内 1,600+ "好评如潮";角色 DLC(如初音未来)**定价 ¥2,200 JPY(约 $14;Steam 页只显日元)**,含 3D 模型 + 28 动画 + 官方语音;常做 20% 折扣([Desktop Mate 初音 DLC](https://store.steampowered.com/app/3359730/Desktop_Mate__DLC/))。社区普遍反馈 **DLC 偏贵**,但靠 IP 价值仍卖得动。
  → 立项常引用的「~$15/角色 DLC」属实(¥2,200 JPY ≈ $14)。**对无大 IP 的本产品,皮肤包定价应低于此**(建议单包 $1.99–$4.99、整合包 $9.99–$14.99)。
- **VPet(免费 + 开源 + 工坊)**:完全免费、开源、支持 Steam 创意工坊;变现靠**可选付费 add-on**(ModMaker 工具、Pancake Cat 皮肤包等);上线半月在线峰值 8 万、近 9,000 评 98% 好评([VPet Steam](https://store.steampowered.com/app/1920960/VPetSimulator/)、[VPet README](https://github.com/LorisYounger/VPet/blob/main/README_en.md)、[GamerSky 桌宠盘点](https://www.gamersky.com/handbook/202411/1845172.shtml))。
  → 启示:**工坊 + 免费基座**是桌宠口碑与留存的"放大器",付费做"工具/精品皮肤包"而非"逼氪"。

> 综合三例:**桌宠的口碑红线是"核心体验免费、不 paywall 基础陪伴",付费只卖锦上添花的皮肤/主题/IP**。这与本产品"纯收集"定位高度吻合。

#### 7.2.3 不碰可交易经济(Steam 市场/类 gacha)的理由

- **抽成叠加**:Steam 市场交易本身有手续费(游戏内交易普遍 ~15% + 钱包流转),叠加分发抽成,**对纯收集小品类不划算**。
- **合规/监管**:带"概率掉落 + 可交易/可变现"会触及**类 gacha 概率公示监管**(中国大陆要求明示概率;多地对开箱/赌博式机制收紧),合规成本与法务风险陡增。
- **运营负担**:可交易经济=要做反作弊、反洗钱、市场调控、客服纠纷,远超一个"换装桌宠"的运营能力。
- **若要碰的门槛**:必须接入 Steam Inventory Service / 市场、做概率公示、做未成年人保护与防沉迷、配套客服与风控——**与"轻量陪伴工具"定位严重背离,明确建议不碰**。

### 7.3 发行渠道与平台限制(硬约束)

#### 7.3.1 Steam(主战场)

- **上架费**:Steamworks Direct **$100/款**,**不退但可回收**——产品达到 **$1,000 调整后毛收入**后,$100 作为单列项在结算中返还([Steam Direct Fee 官方文档](https://partner.steamgames.com/doc/gettingstarted/appfee))。**仍是 $100,现行有效。**
- **分成阶梯**:**30% / 25% / 20%**,门槛 **$1,000 万 / $5,000 万**(即前 $10M 抽 30%,$10M–$50M 区间抽 25%,超 $50M 抽 20%),适用于游戏本体、DLC、内购([Steam 官方公告](https://steamcommunity.com/groups/steamworks/announcements/detail/1697191267930157838) 标题确认存在该政策;百分比与门槛经 [Meshy 发行指南](https://www.meshy.ai/blog/how-to-publish-a-game-on-steam) 与多方二手来源交叉确认)。对小品类**实际就是 30%**;阶梯门槛高到与本产品无关。
- **品类表现**:桌宠在 Steam 是被验证的活跃品类——VPet 上线半月在线峰值 8 万、98% 好评;Bongo Cat 26,982 评 96% 好评;Desktop Mate 一周 1,600+ 好评如潮([VPet](https://store.steampowered.com/app/1920960/VPetSimulator/)、[GameSpot](https://www.gamespot.com/articles/viral-steam-hit-bongo-cat-doesnt-actually-make-any-money/1100-6532777/))。Steam 还有**算法推荐 + 无额外营销费**,被国内开发者视为比 WeGame 更划算的首发地([知乎讨论](https://www.zhihu.com/question/64699874))。
- **创意工坊(SteamUGC)**:VPet 已证明工坊对桌宠的价值极高——用户自制皮肤/动画/互动并分享,内容自增长 + 社区粘性([VPet 工坊](https://steamcommunity.com/workshop/about/?appid=1920960))。**对"皮肤数量是支柱"的本产品,SteamUGC 是把"数量天花板"交给社区的最佳杠杆**。
  → **结论:Steam 应作首发主渠道**(品类已验证 + 工坊红利 + 30% 可接受 + $100 可回收)。

#### 7.3.2 Mac App Store(MAS)——大概率上不去,需走 Developer ID

桌宠的核心实现(**透明无边框窗口 + 永远置顶 + 监听全局键鼠以触发互动动画**)与 MAS 的强制沙箱**直接冲突**:

- 私有 API 一律拒(`ITMS-90338: Non-public API usage`);桌宠常用的窗口层级/置顶 hack 易踩私有 API。
- 沙箱下**拿不到窗口列表、无法跨窗口控制**;**沙箱内禁辅助功能(Accessibility)权限**,而**全局键鼠监听必须辅助功能权限**——沙箱下该权限弹窗根本不出现、也无法手动添加([Apple 沙箱违规诊断文档](https://developer.apple.com/documentation/security/discovering-and-diagnosing-app-sandbox-violations)、[apps-outside-app-store 分析](https://alinpanaitiu.com/blog/apps-outside-app-store/))。
  → **若桌宠依赖"响应键鼠输入"(像 Bongo Cat),MAS 基本无解。** 若砍掉键鼠监听、只做纯展示/拖拽互动 + 用 `NSWindow` 公开 API 做置顶透明,**理论上可能过审,但属高风险路径,需上架前 POC 验证(待核实)**。
- **现实路径(强烈推荐):Developer ID 签名 + 公证(notarization)+ DMG/官网分发**。Apple 开发者计划 **$99/年**(含签名与公证服务,公证本身不额外收费);macOS 10.15+ 起,App Store 外的 app **必须签名 + 公证**才能正常打开([Apple Developer ID](https://developer.apple.com/developer-id/)、[Apple 公证文档](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution))。
  → **macOS 兼容性靠"官网/DMG + Developer ID 公证"实现,不依赖 MAS。** 也可把 macOS 版直接放上 **Steam(Steam 自带分发,绕开 MAS 审核)**。

#### 7.3.3 Microsoft Store / 自有官网 / 国内渠道(补充)

| 渠道 | 费用 | 分成 | 适配本产品的优劣 |
|---|---|---|---|
| **Microsoft Store** | **个人开发者注册费已于 2025 取消(原 $19 一次性)** | 用 MS 内购:应用 15% / 游戏 12%;**非游戏 app 可自带支付保留 100%** | Windows 优先天然契合;0 注册费 + 可自带支付 = 几乎无成本铺货,**建议作 Windows 补充渠道**([Windows Dev Blog](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/)、[TechRadar](https://www.techradar.com/pro/microsoft-just-dropped-its-store-fees-for-windows-developers)) |
| **自有官网** | 自付支付通道费(Stripe/Paddle 等 ~5%) | 抽成最低,**利润最高** | 适合卖"完整版/皮肤包";但无平台流量,需自引流;macOS 版的 DMG 直接挂官网 |
| **WeGame(腾讯)** | — | 抽成 **30%**(流水超千万降至 ~15%);**另需营销费** | 国内 PC 平台,但需营销费 + 审核,**对独立小品类性价比低于 Steam**([知乎](https://www.zhihu.com/question/656540221)、[GameLook](http://www.gamelook.com.cn/2025/04/568983/)) |
| **TapTap(PC)** | — | **0 分成**(靠厂商营销费盈利) | 国内可作零抽成补充,流量有限([知乎讨论](https://www.zhihu.com/question/64699874)) |

> **渠道总策略:** Windows = **Steam(主)+ Microsoft Store(补,0 费)+ 官网**;macOS = **Steam + 官网 DMG(Developer ID 公证)**,**不押注 MAS**;国内视精力再考虑 WeGame/TapTap。

### 7.4 核查结论与存疑项

**高置信度已确认(可直接写进立项决策):**
- Steam Direct 费 **$100/款**、达 **$1,000** 毛收入后可回收;分成 **30%/25%/20%**、门槛 **$1,000 万/$5,000 万**——现行(官方文档 + 多源交叉)。
- **Microsoft Store 个人开发者注册费 2025 已取消**(原 $19);MS 内购应用 15%/游戏 12%,非游戏可自带支付保 100%(官方博客)。
- **Apple 开发者计划 $99/年**,App Store 外需 Developer ID 签名 + 公证;**沙箱禁辅助功能权限 → 依赖全局键鼠监听的桌宠基本上不了 MAS**(Apple 官方文档支撑)。
- AI 工具商用授权:**PixelLab $9–$12/月起、Scenario $15–$75/月起,付费档含商用授权**(官网)。
- **美国版权局:纯 AI 输出不可版权,只有人类创造性部分受保护**(2025-01 报告,官方)。
- 商用素材包**普遍允许打包进成品卖、但禁止"可被终端用户再取出"的再分发**;CraftPix 还**禁止用于 AI 训练**(CraftPix 官方 license)。
- 案例定价:**Desktop Mate 角色 DLC ¥2,200 JPY(≈$14)**、**Bongo Cat God Pack ¥1,038 RMB**、**VPet 免费 + 付费 add-on**(各 Steam 页)。
- 桌宠在 Steam 是**已验证的活跃品类**,工坊(SteamUGC)价值高(VPet/Bongo Cat 数据)。

**需立项前再向官方/一手二次核实(中低置信度):**
1. **Bongo Cat / Desktop Mate DLC 的 USD 精确价**:Steam 区域页只显本币(¥/JPY/£),USD 价为换算估值,**下单页确认**。
2. **itch.io 个别包的完整 license 全文**(如 Elthen 真实条款在其 Patreon、Catset/LuizMelo 价格)——本节部分来自搜索摘要,**采购前逐包读 license 原文**。
3. **桌宠透明窗口 + 置顶若砍掉键鼠监听能否过 MAS**:属"理论可能、高风险",**需做最小 POC 提审验证**,不要在没验证前把 MAS 写进发行承诺。
4. **外包"一只多状态桌宠猫"的实际报价**:$150–$400/只(像素)是基于 Fiverr 量级 + 桌宠帧数折扣的**推算**,需向 3–5 位画师**实际询价**校准。
5. **Steam 30/25/20 阶梯的官方公告正文**:本次官方页正文未抓到(仅确认标题存在),百分比/门槛由 Meshy 指南等二手源交叉确认,**如需写进合同条款应核对 Steam 分发协议原文**。
6. **AI 素材"可被工坊导出"是否引发权属纠纷**:纯 AI 图不可版权 + 工坊可被仿,**法务建议旗舰/工坊核心皮肤优先用买断版权或 CC0 素材**。

---

## 8. 风险清单(按严重度排序)

| # | 风险 | 严重度 | 缓解措施 |
|---|---|---|---|
| R1 | **macOS 透明+置顶+穿透在生产构建可用性**(Tauri .app 透明丢失 bug #13415 OPEN;Electron vibrancy 变白;无 per-region 穿透需变通)——已核实硬约束 | 极高 | MVP 第一周真机矩阵(Sonoma14/Sequoia15 × Intel/AppleSilicon × 签名公证后 .app)端到端验证;选 Electron 降低 macOS 透明不确定性;备 native addon 做逐像素穿透兜底 |
| R2 | **Live2D 被判 Expandable Application** → 丧失免费豁免、需审批+签约+分成,即便零收入 | 极高(若选 Live2D) | 选型阶段直接书面咨询 Live2D 官方;MVP 先用 2D 帧避开;Live2D 仅作 V1 候选 |
| R3 | **UGC 任意代码执行**(VPet DLL 教训) | 高 | 架构锁死"数据-only 皮肤包",功能扩展只由官方主程序提供;禁 .dll/.exe/.bat/.js/.sh |
| R4 | **裸 zip 导入安全**(zip-slip 路径穿越、解压炸弹) | 高 | manifest 过 JSON Schema 校验;校验条目路径不含 `..`/绝对路径;扩展名白名单(.png/.webp/.json/.model3.json/.moc3/.atlas/.skel/.ogg);限单包大小+图片像素上限;每套独立目录隔离;优先走 Steam 工坊 |
| R5 | **红海正面竞争**(品类拥挤,头部心智已被 Bongo Cat/VPet 占据) | 高 | 差异化标识早立(四合一精确定位);立项前复扫最新竞品 |
| R6 | **"纯换装无养成"削弱长期留存** | 中高 | 用收集进度+猫舍陈列成就+稀有度炫耀+定期上新皮肤替代养成黏性 |
| R7 | **2D 帧海量皮肤成本线性膨胀**(每套重画全状态帧) | 中高 | 大头压在 palette swap/部件复用低成本变体;旗舰才整套手绘;若库要做大可评估骨骼共享形态 |
| R8 | **常驻资源占用**(Electron idle 120–300MB;3D 常驻 GPU 耗电) | 中 | 限帧(idle 30FPS/空闲降帧)、单窗口;V1 后视情迁 Tauri |
| R9 | **运行时库长期维护**(pixi-live2d-display 已停更,依赖社区 fork 单点) | 中(若选 Live2D) | 锁版本,预留自维护能力 |
| R10 | **报价/汇率/授权随时间漂移**(Unity Pro $2,310、Spine、Live2D 日元口径) | 中 | 财务以日元口径锁 Live2D;各报价立项前向官方二次核实 |
| R11 | **Spine 授权门槛**(若选骨骼路线) | 低中 | 已核实:Essential $69 / Professional $379 一次性买断够用;仅年营收 ≥ $500,000(含投融资)才强制 Enterprise $2,499/年起 |

---

## 9. MVP 路线图

### MVP(约 6–10 周):验证"收集 + 陈列 + 桌面互动"闭环
- **范围**:Electron + PixiJS;桌面跑 1 只可换皮的 2D 帧猫(透明/置顶/点击穿透,Win+Mac 真机验证);纯列表画廊猫舍(图鉴模式 + 完成度);10–20 套首发皮肤(现成包 + AI + palette 变体);皮肤包数据-only manifest 加载器 + 本地导入校验;托盘/自启;进度本地 JSON。
- **技术**:Electron + PixiJS + Aseprite 资产 + palette swap。
- **核心验收**:macOS 真机透明穿透通过;收集→陈列→设为出战闭环留存数据。

### V1(约 8–12 周):做成可发布产品
- **范围**:2D 房间陈列双视图;皮肤库筛选/排序/搜索/收藏夹;开箱式解锁仪式;**Steam 创意工坊接入**(SteamUGC)+ Steam Cloud 进度同步;付费主题皮肤包变现;30–50+ 套皮肤(含外包旗舰)。
- **技术**:同栈 + Steamworks SDK。
- **决策点**:是否引入 Live2D 旗舰皮肤(取决于 R2 官方咨询结果)。

### V2(按数据决定):深度与生态
- **范围**:可摆放猫舍场景编辑器(截图分享)、多猫同屏、社交炫耀;若 Live2D 确认可行则上 Live2D 旗舰线;视资源占用反馈决定是否迁 Tauri v2(Web 资产大部分复用)。
- **技术**:Electron→Tauri 迁移评估 / Live2D fork / 场景编辑器。

---

## 10. 悬而未决 / 需用户拍板的决策点

1. **美术形态最终路线**:MVP 锁 2D 帧(本报告推荐)是否认可?Live2D 旗舰线是否值得为其授权审批风险投入?是否完全排除 3D?
2. **Live2D 授权咨询**:是否在立项即向 Live2D 官方书面确认本产品(换装+猫舍)的 Expandable Application 归类?(这是 Live2D 路线能否走的前置闸门)
3. **技术栈**:接受"MVP 用 Electron(资源占用大)、后续视情迁 Tauri"的演进路线,还是把"低资源占用"当 MVP 硬指标直接吃 Tauri 的 macOS 坑?
4. **是否上架 Mac App Store**:若想上 MAS,透明窗口方案需重做(放弃私有 API);若接受直签/官网/Steam 分发则无此约束——发行渠道优先级?
5. **是否开放第三方创意工坊 UGC**:开放时点(V1?)、是否绑定 Steam、非 Steam 渠道 UGC 策略。
6. **变现模型**:核心免费+付费皮肤包(推荐)是否够?是否引入一次买断高级版?是否完全不碰可交易经济?
7. **猫舍深度**:V2 的"可摆放场景编辑器"做不做?如何在不滑向养成/经营的前提下提供长期目标?
8. **冷启动皮肤预算**:首发皮肤多少套、旗舰外包占比、AI/palette 铺量占比的目标配比。