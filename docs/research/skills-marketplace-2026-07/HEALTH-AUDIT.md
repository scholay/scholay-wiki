# Skills 市场 · 全量健康审计报告(2026-07-11)

> 11 代理工作流(5 维度 finder → 对抗验证 → 合成),零误报。P0/P1 已修复并 live 验证(见文末修复状态)。

# Skills 市场 + claw 集成 · 健康报告

审计范围:后端 `internal/skillmarket/`、claw 接线(agentbridge/claw/executor)、前端 `features/skills/`。五个维度均经「初审 → 对抗验证」两轮,标注 **[live]** 的为已在 http://localhost:5411 实栈复现。零误报:所有初审发现在对抗轮全部 CONFIRMED 或如实降级。

---

## ① 总体结论

**问题1(市场健全度:展示/上传/分享/跨 agent 拉取)——「有硬伤,基本能用」。**
安全地基扎实(注入面、路径穿越、枚举、制品完整性均已验证防护到位),但**四条硬伤直接击穿「便捷且真能用」这一核心诉求**:① 任一用户 3 次举报即可下架任意已过审 skill([live] 复现);② 复制出的跨 agent 安装 `curl` 命令丢端口,默认 5411 部署下**装不上**([live]);③ macOS 用户上传几乎必带的 `.DS_Store` 让整包硬失败([live]);④ SLUG BUG 使所有中文名 skill 退化成 `skill`/`skill-2`,贯穿分享链/安装目录名/marketplace/claw 菜单。**评分感:6/10** —— 能跑通 happy path,但真实用户的第一步(上传)和最后一步(分享安装)都会踩雷。

**问题2(claw 上是否好用、是否正常生效)——「基本能用,一个静默陷阱」。**
名字物化链路(materialize → buildSkillMenu → skillTool)**逻辑闭环、多租户隔离无洞**([live] 确认写入 + 过滤生效)。核心隐患只有一条但很典型:**前端「启用」无上限,后端建会话时静默只取最近 5 个**,第 6 个起永不加载且面板全绿无提示 → 经典「我启用了 AI 却不理」投诉。其余为低危 UX 打磨。**评分感:7.5/10**。

---

## ② 已确认问题(严重度排序)

| # | 严重度 | 类别 | 现象 / 位置 | 影响 | 修复 |
|---|---|---|---|---|---|
| 1 | **HIGH** | 授权/滥用 | **单用户 3 次举报下架任意 skill** [live]。`service.go:488-507` `Report` 不校验可见性/归属/自举报;去重键 `(skill_id, reporter, reason)` 含 reason,enum 有 6 个 reason → 一个账号可合法插 6 行;`report_count>=3`(`model.go:54`)即置 `ModFlagged` | `flagged≠approved`,而 market 列表/下载/匿名详情/claw 物化全要求 `approved`。任一用户可把任意 public skill 从市场移除、download/install/claw 全部 404,直到管理员手动复审。因走裸自增 id,还能 flag 自己看不到的 private/unlisted | 去重键改 `(skill_id, reporter)` 与 reason 无关;阈值按**不同举报人数**;`Report` 前校验可见性 + 排除 owner 自举报;`flagged` 只进人工队列、不直接等同下架 |
| 2 | **HIGH** | 上传健壮性 | **`.DS_Store` 让整包硬失败** [live]。`bundle.go:82-84,122-124` 命中非白名单扩展名即 `return ErrBundleBadExt`,zip 与文件夹上传均 400,且报错不指名文件 | macOS Finder 压缩/`webkitdirectory` 选目录几乎必带 `.DS_Store`,最普遍的上传路径整包失败,用户无从下手 | 解析阶段对 `.DS_Store`/`__MACOSX/`/`Thumbs.db`/`._*` **静默跳过**而非拒绝;前端 `pickFolder`/`onDrop` 同步过滤 |
| 3 | **HIGH** | 跨 agent 可用性 | **绝对 URL 丢端口** [live]。nginx `conf.d/user.conf` `proxy_set_header Host $host`(不含端口)+ `handler.go:426` `baseURLFrom=c.Request.Host`。返回 `shareUrl/downloadUrl/claudeCodeCurl` 全是 `http://localhost/...`(丢 `:5411`);`Host: x.com:9999` → 端口同样被吞 | 默认对外端口就是 5411。复制的 `curl … | tar -xz` 指向 `:80`,**默认部署直接装不上**;分享落地页 404。这正是功能核心价值 | nginx 改 `proxy_set_header Host $http_host`(保端口),或加 `X-Forwarded-Host` 且后端优先读它 |
| 4 | **HIGH(横切)** | 命名 | **SLUG BUG**(主 finding,已知)[live]。中文名「引用守卫」→ `slug=skill`;下载的 SKILL.md `name` 被覆写成 slug | 连带爆炸:分享链 `/skills/skill`、解压目录 `~/.claude/skills/skill/`、下载文件名 `skill.tar.gz`、marketplace `plugins[].name="skill"`、claw 菜单 `u1-skill`(对模型不可辨识)。多个中文 skill 观感撞名。**注**:`frontmatter.go:95-101` 已优先用 frontmatter name 派生 slug,但 name 本身也是中文/缺失时仍退化 | 优先用 frontmatter `name` 派生 slug;name 非 ASCII 时用音译/拼音或 `skill-<短hash>` 而非纯序号;raw/预览/菜单统一用清洗后 slug |
| 5 | MEDIUM | 契约/UX | **claw「启用」无上限,建会话静默只取 5 个** [live]。`SetEnabled`(`service.go:448`)/`Install` 无 cap;`MaterializeForUser`(:566-599)按 `updated_at DESC` 取满 5(`MaxEnabledPerSession`)即 `break`;executor `sessions.ts:39` 第二道静默截断。live 有 7 条 `enabled:true`;`ClawSkillPanel.tsx` 无计数/上限文案 | 启用 ≥6 个时只加载最近 5 个,其余静默不进菜单,面板全绿却「AI 不理」;哪 5 个由 install 行 `updated_at` 决定,不可预测不可控 | `SetEnabled` 启用时校验计数 >5 返 `ErrQuotaExceeded`(点开关那刻可感知);或面板显示「已启用 X/5」+ 超限置灰 |
| 6 | MEDIUM | 缓存/交互 | **详情页安装/卸载后按钮态不刷新**。`skills.ts:362-398` 两 mutation `onSuccess` 只失效 `['skills','installed']`+`['skills','market']`,**漏 `['skills','detail']`**;按钮三态读 `skill.installed`(detail key) | 点「加入我的」toast 成功但按钮不变,再点重发安装请求;卸载同理,同页操作像没生效 | 两 mutation `onSuccess` 追加失效 `['skills','detail']`,或乐观翻转 `installed` |
| 7 | MEDIUM | 错误处理 | **加载失败被渲染成空态**(三处)。`SkillsMarketPage.tsx:25`、`MySkillsPage.tsx:32`、`SkillReviewPage.tsx:43` 均只解构 `data/isLoading`,丢弃 `isError`。对照 `SkillDetailPage.tsx:69` 已有正解 | 后端 500/网络故障时误导「市场空/我没 skill/无待审」,无重试入口;**审核页管理员漏审**(合规意味) | 解构 `isError`+`refetch`,加 `isError → <ResourceError onRetry={refetch}/>` 分支 |
| 8 | MEDIUM | 正确性/完整性 | **下载 tar.gz basename 退化 → 多文件 bundle 静默丢文件**。`bundle.go:238-247` `relTo` 对 SKILL.md 子树外文件退化成 `path.Base`;`pkg/notes.md` 与 `other/notes.md` 都写成 `slug/notes.md`,tar 重复头解压后覆盖 | 外部下载者拿到的制品 ≠ 作者上传,附带文件被静默吞;同名不同内容还可误导 | 保留完整相对路径;或子树外文件命名空间化;或拒绝 SKILL.md 目录外的文件 |
| 9 | MEDIUM | 信息暴露 | **unlisted 正文可枚举读取**。`service.go:324-343` `GetDetail` 只 404 了 private / public-未过审;**unlisted 对任意登录用户返回完整 `SkillMD`**;`resolveSkill` 接受自增数字 id | unlisted 的「不可猜」保护被 id 自增 + SLUG 退化(可预测 slug)显著削弱,登录用户可枚举读到未公开列出的全文 | unlisted 用不可猜随机 token 作访问键,不接受裸 id/slug |
| 10 | MEDIUM | 安全/审核 | **SKILL.md 预览把不可信围栏块当 live 渲染**。`SkillDetailPage.tsx:213`/审核页用共享 `MarkdownRenderer`,```html→iframe、```svg→注入 SVG、```mermaid→图。**非可执行 XSS**(iframe 无 allow-scripts、SVG 过 DOMPurify、mermaid strict——已核对) | 剩余风险:(a) **审核失真**——审核员默认看渲染结果非源码(svg/mermaid 无源码切换),恶意作者可让「人审视图 ≠ claw 吞入的原文」;(b) **外链 IP 探针**——围栏内 `<img src=远程>` 在审核员/匿名访客打开页时向作者服务器发请求泄露 IP/UA | 给不可信预览加 `untrusted/plainFences` 开关,市场/审核页把围栏块降级为源码 `<CodeBlock>`;订正各处「安全靠不开 rehype-raw」的注释 |
| 11 | MEDIUM | 功能缺失 | **创建后 UI 无法编辑元数据/传新版本**。`routes.tsx` 无 edit 路由;`useUpdateSkillMeta`/`useUpdateSkillContent` **零调用点**(后端 `PATCH /:id`、`PUT /:id/content` 齐备) | 用户改不了 name/tagline、修不了 SKILL.md 错字、推不了新版本,唯一途径是删掉重建(丢 slug/install_count/历史版本) | MySkillsPage/详情页加「编辑/上传新版本」入口,接现有 hook |
| 12 | MEDIUM | 正确性(latent) | **`useUpdateSkillContent` 即便接线也发不出文件**。`buildSkillForm`(`skills.ts:190-218`)不处理 `file` 字段,`useUpdateSkillContent` 入参的 `file` 被静默丢弃 → 后端落到「请上传含 SKILL.md」400 | 更新版本一旦接线,用 zip/文件更新必失败(当前被 #11 无入口遮蔽) | `buildSkillForm` 增补 `if(input.file) fd.append('file', input.file)`,或统一入参形状 |
| 13 | MEDIUM | 生产配置 | **HTTPS 生产生成 http:// 链接**。`user.conf` `X-Forwarded-Proto $scheme`(本 nginx 只 listen 80,恒 http)覆盖外层传入值 [live: 发 `X-Forwarded-Proto: https` 仍回 http] | 栈外终结 TLS 的生产,分享链/下载命令/marketplace `source` 全 `http://`,触发混合内容拦截或 301 降级。与 #3 叠加 | `map $http_x_forwarded_proto` 透传,或本层 `listen 443 ssl` |
| 14 | LOW | 文案/死码 | **超限报错写死「2MB」**。`handler.go:441` `ErrBundleTooLarge→"文件超过 2MB 上限"`,实际 30MB(`model.go:47`);`handler.go:451-454` 同错误重复列出(死分支);`routes_user.go:322` 注释「≤2MB」陈旧 | 撞 30MB 上限时被告知「2MB」,信息误导 | 改「30MB」或直接回显 `err.Error()`;删死分支与陈旧注释 |
| 15 | LOW | UX | **拖拽「文件夹」不工作但 UI 邀请**。`SkillCreatePage.tsx:150-163` 读 `dataTransfer.files`(不递归目录),拖拽区文案却写「拖拽含 SKILL.md 的文件夹」 | 用户按提示拖文件夹 → 「未找到 SKILL.md」失败 | 用 `webkitGetAsEntry` 递归,或改文案「拖 zip,或点『选择文件夹』」 |
| 16 | LOW | 制品污染 | **`__MACOSX/._SKILL.md` 被收录并随下载分发** [live]。`._SKILL.md` basename≠`SKILL.md` 不触发多 SKILL.md 校验,后缀 `.md` 过白名单,进 `fileManifest` 并打进 tar.gz | 与 #2 割裂的诡异行为(`.DS_Store` 硬拒、`__MACOSX` 放行);外部 agent 拿到含二进制垃圾的包 | 解析时统一剥 `__MACOSX/` 与 `._*` AppleDouble |
| 17 | LOW | 安全卫生 | **白名单放行 `.env` 与双扩展名**。`bundle.go:36` 含 `.env`;`allowedExt` 取最后一个点 → `payload.php.txt`/`.env` 放行 | 平台不执行,但把密钥文件/伪装脚本原样再分发,下载者误重命名即可执行 | 白名单去掉 `.env`;危险 stem(`.php`/`.sh`)按需收紧 |
| 18 | LOW | 一致性 | **预览 skillMd 泄漏内部名 `u<userId>-<slug>`** [live]。`service.go:368` 直接 body=`v.SkillMD`(未 `renameSkillMdName`),raw 端点与 tar 内都已清成 `name: skill` | 匿名访客从分享页反推作者数字 user_id + guides 命名规则 | `buildDetailDTO` 对 body 也走 `renameSkillMdName`,与 raw 统一 |
| 19 | LOW | 文档准确性 | **install.md 的 `/reload-plugins` 非真实 skill 命令**。`service.go:676` + `SkillInstallPanel.tsx:46` 照抄;skill 放进 `~/.claude/skills/` 由 Claude Code 自动发现 | 用户照做得「未知命令」,靠「或开新会话」兜底自救 | 改「重开一个会话即可生效」,去掉 `/reload-plugins` |
| 20 | LOW | 契约 | **claw「持有上限」只管自建,安装他人不受限**。`CreateSkill` 有 `capFor`(统计自建数),`Install` 无 cap。`MaxSkillsFree=10` 名不副实 | 仅 DB 行增长(受 #5 的 5-cap 保护无资源耗尽),属文案/语义不一致 | 「持有」明确=自建+已装,`Install` 也走 `capFor`;或常量改名 `MaxOwnedSkills` |
| 21 | LOW | UX | **claw 面板对 `available:false`(下架/删)项无移除入口** [live]。`ClawSkillPanel.tsx` 只渲染 Switch,`useUninstallSkill` 未接线;live 7 条 install 有 5 条已 deleted 仍渲染可交互开关 | 死条目堆积,开关误导可启用(`AlertTriangle` 提示已到位) | 对 `available:false` 禁用 Switch + 加「移除」按钮接 `useUninstallSkill` |

---

## ③ 设计权衡与非目标(诚实说明)

- **marketplace.json 对原生 Claude Code 不可用**(share F3):生成的 `plugins[].source` 是裸 tar.gz URL,而原生 `/plugin marketplace add` 只吃 git 仓库/本地目录且需 plugin 结构;`InstallCommands.MarketplaceAdd=""` 代码注释已自认这是「发现用/未来 git 镜像」的占位物。**但 install.md 面向用户仍称其「Claude Code marketplace 格式」——属对外宣传过头**,用户照抄会失败。建议文案降级为「技能发现目录(非原生插件市场)」。当前主推的 `curl | tar -xz` 路径是真能用的(修好 #3 端口后)。

- **tier-1 执行模型**:附带 `.py/.js` 只分发不在本平台跑,claw 只吃 SKILL.md 指令——这是明确的安全边界,不是缺陷。SKILL.md Body 未净化是**已声明的 tier-1 提示注入面**(`model.go` 有说明,靠 `staticScan` 降噪 + 人工审核),属接受的设计;可补:`staticScan` 不扫描附带文件且非阻断。

- **executor 重启漂移**(claw F3):老会话在 executor 重启后按**当前**启用集重算,与面板「仅对新对话生效」文案在极端场景矛盾。这是 live-provider(无 per-session skill 快照)的固有代价,概率低、非安全问题。建议接受 + 面板文案补一句,而非投入 journal 落快照的高成本改造。

- **MinIO 建版本时故障 → downloadKey 永久空**(share F6):tar.gz 只在建版本时打包,DB 不存字节;MinIO 恢复也不懒重建,详情页仍渲染会 503 的 curl。当前 live MinIO 正常,仅潜在故障面。修复宜在详情页「制品缺失时隐藏安装命令」(DB 未存附带文件字节,无法完整懒重建)。

- **无字节配额**(security F5):仅按数量限额(免费 10 skill × 20 version × ~30MB ≈ 6GB 理论上限),受全局 IP 限流约束,非 DoS。

**已验证扎实、无需动的地基**:slug 严格 `^[a-z0-9][a-z0-9-]*$` 约束下的注入面(shell/JSON/MD/CRLF/Content-Disposition 全封死)、路径穿越/符号链接(`safeBundlePath` + 服务端重打包)、解压炸弹(per-file 10MB + 总 30MB + 50 文件三重上限)、公开端点鉴权与防枚举(不存在/未过审/私有一律 404)、claw 多租户物化隔离(`materializable` 只放行自建或 public+approved)、backend-only 帧拒绝浏览器自带 skills 字段、clone-before-mutate 防跨租户污染——**均已 [live] 或读码核对**。

---

## ④ 修复优先级

**P0(必修,阻断核心价值 / 可被滥用):**
1. **#1 举报 griefing**(HIGH)——去重键去掉 reason、阈值改「不同举报人数」、`Report` 校验可见性 + 排除自举报、`flagged` 不直接下架。**这是唯一可被单账号武器化下架他人内容的洞。**
2. **#3 URL 丢端口**(HIGH)——nginx 一行 `$host→$http_host`,让跨 agent 安装命令在默认部署真能用。
3. **#2 `.DS_Store` 硬失败**(HIGH)——垃圾文件静默跳过,解锁最普遍的 macOS 上传路径。
4. **#4 SLUG BUG**(HIGH 横切)——name 非 ASCII 时改用拼音/hash 派生,一并修好分享链/目录名/marketplace/claw 菜单命名。

**P1(应修,影响日常体验与正确性):**
5. **#5 claw 静默 5-cap**——启用时校验返错 或 面板显示「X/5」,消除「启用了却不生效」。
6. **#11 + #12** 编辑/新版本入口 + `buildSkillForm` 补 `file`——否则改错字只能删库重建。
7. **#6 按钮态不刷新**、**#7 错误态渲染成空态**——两处 react-query 小改,消除「操作没生效/东西丢了」错觉;#7 含审核漏审。
8. **#8 tar.gz 丢文件**、**#9 unlisted 枚举**、**#13 HTTPS 降级**——正确性/暴露/生产配置。
9. **#10 预览 live 渲染**——审核页加 `plainFences` 降级,恢复审核降噪层可信度。

**P2(可选,打磨与一致性):**
- #14 文案「2MB→30MB」+ 删死分支、#15 拖拽文案、#16 `__MACOSX` 剥离、#17 白名单去 `.env`、#18 预览泄漏内部名、#19 `/reload-plugins` 文案、#20 持有上限语义、#21 claw 面板移除入口。
- marketplace.json 文案降级(见 ③);MinIO 缺失时隐藏安装命令;`staticScan` 扩展到附带文件。

---

**一句话交付**:市场的**安全地基可信**,但**上传第一步(#2)、分享最后一步(#3)、抗滥用(#1)、命名(#4)四道 P0 未过关前,不建议对外主推「跨 agent 便捷分享」**;claw 集成**逻辑正确、隔离无洞**,修掉静默 5-cap(#5)即可放心用。