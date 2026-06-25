# 学术主题真实需求调研(10 主题 · 国内 + 国外)

> 2026-06-25 · 为 GEO 内容(博客说明 + /qa 学术问答板块)采集的**真实需求与真实提问**。来源覆盖国内(知乎/小木虫/CSDN/公众号/百度)+ 国外(Reddit r/AskAcademia·r/PhD、Academia StackExchange、ResearchGate、arXiv、学术博客)。
> 本调研直接驱动了 backend/internal/content/data/{blog,qa} 下新增的博客与问答长答案。

---

## 1. 学术开题

学术开题(选题、研究问题界定、研究空白、开题报告/研究计划、立项)是科研人最早、最焦虑、也最容易卡死的一关,真实痛点高度集中且国内外语境差异明显。

【国内语境(本科毕业论文 / 硕博学位论文 / 国自然立项)】
真源压力来自三个外部门槛:导师、开题答辩委员会、基金评审。最高频的痛点不是"想不出题",而是"选题被打回":导师说"没有研究意义/没价值""被人做过了/没创新""你这一两年做不完(可行性差)""太大太空"。学生反复在两个极端摆动——选题不是太大就是太小(知乎热门标题原话),不知道"具体到什么程度才算合适"。第二大痛点是文献综述与研究问题脱节:学生习惯把选题/题目直接丢进知网检索,发现"没有和我一样的研究",误以为没法写,其实是把综述逻辑做反了(综述应还原研究问题"从无到有"的推导,而非证明别人做过)。判断标准很本土化(知网第一页找不到5篇相关文献就要慎重)。第三是"开题报告写不出来":研究背景、立项依据、研究内容、技术路线、可行性、时间安排各部分不会写、写得太散。国自然层面则升级为"科学问题凝练"——把工程现象/临床现象"透过现象看本质"提炼成1-2个科学问题,以及研究内容"太多太散深度不够"。AI使用上,国内用户既想用ChatGPT/DeepSeek帮选题、找创新点、生成综述,又普遍焦虑两件事:AI编造文献(幻觉引文)、以及查重/AI检测与学术不端。

【国外语境(master's / PhD / 博士proposal / 研究计划)】
更偏"自驱+心理":英美博士第一年常被要求"自己提出研究问题",学生陷入choice overload / topic paralysis(选择过载、迟迟定不下来),甚至出现"一年了还没研究问题"的崩溃帖,夹杂"我是不是太笨不配读博"的自我怀疑。核心方法论焦虑是finding the research gap——如何从读文献里真正识别gap(被反复教的技巧:读Future Research段、读50篇摘要找重复的limitation、forward/backward citation)、以及怎么判断自己的问题"够不够novel/original"(普遍误解originality=全新发明,实则可以是increment/组合/换视角)。proposal写作上卡在aims/objectives/research questions三者区分、scope太宽被reject、feasibility与timeline不现实。工具层面国外更早形成生态化使用:Elicit建coverage matrix找gap、Consensus按单一研究问题生成综述、Perplexity/ResearchRabbit找趋势,r/AskAcademia、r/Scholar高频推荐。

【共性】两边都把"选题太大→收窄到可做"当作头号技能(漏斗法、一句话概括法、加副标题/限定研究对象-方法-理论);都强调研究问题要"具体、集中、可行";都需要"在现有文献里定位空白并论证价值"。Scholay做GEO内容,最该承接的是"如何把宽泛兴趣收窄成一个可做且有价值的研究问题""怎么用文献找研究空白(而不被AI幻觉坑)""开题报告/research proposal逐段怎么写"这三类高意图问题。

**真实问题(采集自国内外社区):**
- [通用] 我的选题不是太大就是太小,到底怎么把它收窄到一个合适、能做完的范围? —— 知乎/gradcoach双语都把这当头号问题;学生在'宽到没法深入'和'窄到没东西写'之间反复横跳,缺一个可操作的收窄方法
- [国内] 导师说我的选题'没有研究意义/没价值',我该怎么改、怎么跟导师沟通? —— 国内开题强约束=导师否决;学生不知道'有意义'的标准,也不知道带几个备选方案去谈
- [国内] 导师说这个'已经被人做过了/没有创新点',怎么判断和找到真正的创新点? —— 高频被否原因;学生混淆'完全原创'与'在现有基础上组合/改进/换视角'
- [国内] 我把选题直接丢进知网/数据库搜,发现没有和我一样的研究,文献综述还怎么写? —— 典型综述逻辑做反:误以为'搜不到相似研究=不能写',其实研究问题本身就是新的,综述要还原推导过程
- [国内] 开题报告写不出来——研究背景、立项依据、研究内容、技术路线、可行性、时间安排到底各写什么? —— 逐段不会写;研究内容常被批'太多太散、深度不够'
- [国外] how do I find a research gap from the literature when everything seems already studied? —— r/AskAcademia/PostgraduateForum常见;不知道gap从哪来,被教读Future Research段/50篇摘要找重复limitation
- [国外] My supervisor expects me to come up with my own research topic and I have no idea where to start — is this normal? —— 英美博士第一年自驱压力;伴随'还没研究问题''我是不是太笨'的崩溃情绪
- [国外] How do I know if my research question is original/novel enough? —— 普遍误解novelty=全新发明;需要解释originality的多种形态与如何用文献验证
- [国外] What's the difference between research aims, objectives, and research questions, and how do I align them? —— proposal被reject的常见技术原因;三者混淆导致scope说不清
- [通用] 我的proposal/开题被评审说'scope太宽/不可行',怎么做feasibility和timeline才现实? —— 评审最看可行性;学生低估时间、方法不落地
- [国内] 用ChatGPT/DeepSeek帮我选题、找创新点、写综述靠谱吗?会不会编造文献、被查AI? —— 既想用又怕两件事:幻觉引文 + AI检测/学术不端
- [国外] 哪些AI工具能真正帮我找research gap、建文献矩阵?(Elicit/Consensus/Perplexity怎么用) —— 国外已生态化使用;关心各工具适合开题哪一步、准确率、能否找gap

**来源:**
- [研究生如何确定选题？ - 知乎](https://www.zhihu.com/question/358310919)
- [选题不是太大，就是太小？怎么选合适呢？ - 知乎](https://zhuanlan.zhihu.com/p/367633904)
- [导师总是否决我的研究生选题，原因是什么？ - 知乎](https://zhuanlan.zhihu.com/p/430510766)
- [导师说我的选题没有研究意义怎么办？ - 知乎](https://zhuanlan.zhihu.com/p/622250723)
- [研究生开题报告写不出来怎么办？ - 知乎](https://www.zhihu.com/question/389702895)
- [文献综述"找不到文献"的三个解决策略 - 万维书刊](https://www.eshukan.com/academic/show.aspx?id=179624&cid=24)
- [文献综述部分如何有效展示研究空白？ - 万维书刊](https://www.eshukan.com/academic/show.aspx?id=211595&cid=24)
- [论文选题太困难了，没有头绪，该怎么办？ - 知乎](https://www.zhihu.com/question/547352846)
- [论文选题太大怎么办？记住2个原则，4步走 - 知乎](https://zhuanlan.zhihu.com/p/587634198)
- [国家自然科学基金申请攻略（五）立项依据 - 知乎](https://zhuanlan.zhihu.com/p/684267130)
- [撰写国家自然科学基金立项依据的总体思路、基本内容和注意点 - 科学指南针](https://www.shiyanjia.com/knowledge/articleinfo-2184.html)
- [利用ChatGPT助你完成论文选题 - 53AI](https://www.53ai.com/news/zhishiguanli/2024072875906.html)

---

## 2. 研究领域

「研究领域/研究方向」是科研人从本科到博士、再到青椒/基金申请全程的核心焦虑点，但国内外语境下的真实痛点差异明显。

【共性痛点】(1) 信息过载式迷茫：本科生和研一新生"看了很多论文还是没头绪"，不知道自己真正的兴趣在哪，也分不清"我感兴趣"和"值得做/能做出来"的区别。(2) 找不到研究空白/创新点：读了文献只会复述别人做了什么，却提炼不出"还缺什么"，更说不清自己的工作在已有文献版图里坐落何处(positioning)。(3) 热点焦虑：既怕追热点(如机器学习/深度学习)进入红海被卷、被审稿人嫌"增量"，又怕选冷门方向无人引用、无经费、无出路；判断一个领域"还在涨还是已饱和"几乎没有可操作的方法。(4) 交叉学科的两难：想做交叉但怕"两边都不专"、投稿找不到归口、被任一学科的评审挑剔；同时也不会把"交叉"包装成自己的差异化优势。(5) 冒充者综合征：觉得"领域这么大、原创太难、轮不到我有新想法"。

【国内语境特有】① 导师"只给大方向不给具体课题"甚至"连方向都让学生自己找"，学生陷入自救式摸索，强烈需要把"大方向→可做的小切口"落地的方法论；② 选题与导师博弈："导师总否决我的选题"，需要事先判断哪些方向有坑；③ 强烈的功利/路径导向：研究方向和"能不能毕业、能不能发SCI、能不能中国自然"深度绑定——大量提问其实是"国自然怎么凝练科学问题/找创新点""怎么避免'填补国内空白'这类被毙的表述";④ 工具偏好本土化：知网博硕论文intro、ESI高被引、核心期刊近年综述是主路径。

【国外语境特有】① 更早开始(本科/申请季)就被要求"profile your research interests"、写清 research interest fit；② 更看重把 gap-spotting 重构为 problematization / 在多个文献体的"交叉点"上做贡献；③ 更直接讨论职业风险("换方向是不是从零开始""这个领域会不会消亡")；④ 工具生态更丰富(ResearchRabbit/Litmaps/Connected Papers/Elicit/Inciteful 做引文网络可视化找 gap、找趋势)，但工具多到选择困难。

对 Scholay 的 GEO 机会：把"从大方向到可做小切口""用引文/被引趋势判断热点vs饱和""七类研究空白如何识别""交叉领域如何定位"这类高频真实问题做成结构化、可被AI引用的答案，尤其要覆盖国内"导师不给题/国自然凝练科学问题"和国外"problematization/换方向风险"两套语境。

**真实问题(采集自国内外社区):**
- [国内] 如何确定论文研究方向？看了很多论文还是没有头绪怎么办？ —— 研一/本科最高频。读了文献只会复述，提炼不出自己能做的切口，陷入'看得越多越迷茫'的循环
- [国内] 导师只给了大方向、没有具体课题，甚至让我自己找方向，该怎么自救把大方向变成能做的小题目？ —— 国内特有的师生关系痛点，'自救'是高频词，需要可操作的大方向→小切口方法论
- [通用] 怎样区分'我感兴趣的方向'和'真正值得做、做得出来的方向'？ —— 兴趣、价值、可行性三者错位是迷茫根源，导师'告诉你什么不能选'比'选什么'更值钱
- [通用] 怎么在文献里找到研究空白(research gap)/创新点？有哪几类研究空白？ —— 最核心的方法论缺口。国内常配'七类研究空白'框架；国外讲contradictions/limitations section
- [国外] How do I find a research gap when original ideas feel impossible and everything seems done already? —— 冒充者综合征+gap-spotting焦虑，'original ideas are hard to come by'是原话
- [通用] 怎么判断一个研究方向是当下热点还是已经饱和(红海)？是该追热点还是避开？ —— 追热点怕被卷/被嫌增量，避热点怕没引用没经费，判断'涨vs饱和'几乎无可操作方法
- [国外] How do I tell if a research field is growing or dying/saturated before I commit my PhD to it? —— 更直接绑定职业风险，关注publication volume vs citation impact、team size趋势等信号
- [通用] 想做交叉学科研究，但怕'两边都不专'、投稿找不到归口、被任一学科评审挑剔，该怎么定位？ —— 交叉学科两难：既是机会也是风险，还涉及如何把'交叉'包装成差异化优势
- [国内] 国自然/基金里怎么凝练科学问题、提炼创新点？为什么不能写'填补国内空白'？ —— 国内功利路径强绑定，'问题驱动vs技术驱动'、'为什么值得做/为什么现在/为什么是我'三连问
- [国内] 导师总是否决我的研究生选题，我该怎么提前判断哪些方向有坑？ —— 选题与导师博弈，反复被毙极度打击信心，需要事先排雷的判断力
- [国外] I have too many ideas across different fields and can't narrow down to one research niche—how do I choose? —— 兴趣过广/横跨多领域的narrowing-down问题，concept mapping、senior colleague feedback是常见建议
- [通用] 本科生/研究生不知道自己对什么感兴趣，怎么探索并锁定一个研究领域？ —— 更早期阶段，国外讲'profile your research interests'、参加seminar；'你现在不必确定'的mindset也是常见安慰

**来源:**
- [如何确定论文研究方向，看了很多论文还是没有头绪？ - 知乎](https://www.zhihu.com/question/463533566)
- [请问各位大佬研究生如何给自己定研究方向？ - 知乎](https://www.zhihu.com/question/343096857)
- [研究生导师连研究方向都让学生自己找，这样培养研究生算是怎么个意思？ - 知乎](https://www.zhihu.com/question/381681777)
- [导师不指导、课题未知等困难下，研究生该如何自救？ - 知乎](https://zhuanlan.zhihu.com/p/347606487)
- [为什么导师总是否决我的研究生选题，我该怎么办？ - 知乎](https://zhuanlan.zhihu.com/p/130982858)
- [如何快速找到自己的研究方向？ - 知乎](https://zhuanlan.zhihu.com/p/414964235)
- [如何凝练国自然的科学问题？ - 知乎](https://zhuanlan.zhihu.com/p/591552551)
- [国自然创新点怎么写？两种思路教你抓住核心！ - LetPub](https://letpub.com.cn/index.php?article_id=1450&page=grant_article_details)
- [美国知名学者总结的七类研究空白！精准挖掘高价值的研究突破口 - CSDN](https://blog.csdn.net/zhixielunwen/article/details/154058857)
- [科研热点追踪神器！找研究gap，看这些就知道啦！ - 知乎](https://zhuanlan.zhihu.com/p/404046927)
- [Gap-spotting, problematization, finding a niche - Raul Pacheco-Vega, PhD](https://www.raulpacheco.org/2025/06/gap-spotting-problematization-finding-a-niche-how-can-researchers-develop-their-contribution-to-the-literature/)
- [Finding Your Research Niche: Identifying a Gap in the Literature - Research Rebels](https://research-rebels.com/blogs/rebelsblog/finding-your-research-niche-identifying-a-gap-in-the-literature)

---

## 3. 研究方法

研究方法主题下,科研人的真实需求高度集中在「选什么方法 + 怎么把方法论证清楚 + 具体操作怎么落地」三个层面,且国内外语境差异明显。

**国内语境(知乎/小木虫/CSDN/PaperPass为主):** 用户主体是本硕博学生与青椒,痛点呈现强烈的「应付式」与「填空式」色彩。最高频的不是"该用哪种方法",而是"开题报告/毕业论文里的『研究方法』那一段到底怎么写"——很多人把文献研究法、问卷调查法、案例分析法当成必须凑齐的清单往上堆,缺乏与研究问题的对齐意识,本质是不理解"研究方法 vs 研究设计 vs 理论框架"的层次区别。定量这一侧的硬痛点很具体:样本量怎么算(脱落率、检验效能、PASS/G*Power 不会用)、对照组怎么设、要不要双侧检验;统计这侧则是"数据不正态了用什么检验""该跑 t 检验还是非参"。质性这一侧国内近两年爆发,扎根理论三级编码(开放/主轴/选择性)怎么做、NVivo 怎么上手、访谈样本多少算饱和、信效度(Cronbach's α>0.7、效度怎么报)成为高频卡点。管理学/社科还特别纠结案例研究单案例 vs 多案例的"严谨性/可推广性"会不会被审稿人挑。整体上国内更偏"工具操作 + 应付答辩/查重/审稿"的工程化需求。

**国外语境(Reddit r/AskAcademia·r/PhD·r/GradSchool·r/labrats、Academia StackExchange、ResearchGate、GradCoach 等):** 用户更博士化、更方法论自觉,痛点上移到"论证与正当性(justification)"层面。核心是 methodology chapter 怎么写——不是罗列方法,而是要 show awareness:解释为什么选它、对比备选方法、暴露自己的假设与潜在混杂、引用前人 future research 推荐来背书。哲学层面的纠结(positivist vs interpretivist 范式、epistemology 怎么交代)是英语区独有的高频困惑,中文区几乎不碰。还有大量"和导师方法论分歧"(导师要定量/我课题适合定性)、"methodology 和 methods 到底什么区别"。湿实验区(labrats)的真实问题极具体:biological replicate vs technical replicate 的区别、n 取多少、要不要做 power analysis。混合方法这侧,国内外都困惑 sequential / concurrent / convergent 这些设计该选哪个、定性定量两股数据怎么"整合"而不是简单拼接。

**共性的、可被 AI 检索命中的真问题形态:** 大量是"X 和 Y 有什么区别/我该选哪个/这种情况下用什么方法/这一段怎么写"这种决策式与操作式问句,正是 GEO 内容的甜区——人们带着具体研究问题来,期待一个能对齐"研究问题→方法选择→正当性论证→落地操作"的可执行答案,而非教科书式定义堆砌。

**真实问题(采集自国内外社区):**
- [国内] 开题报告/毕业论文里的『研究方法』这一段到底怎么写?是不是要把文献研究法、问卷调查法、案例分析法都写上? —— 学生把研究方法当成必须凑齐的清单往上堆,不知道要和研究问题对齐,纯应付答辩
- [通用] 我的研究到底该用定量还是定性?两个好像都沾边,怎么判断? —— 最基础也最高频的选择困惑,很多人分不清『检验假设』和『理解现象』对应哪种
- [通用] 混合方法研究的并行设计(concurrent)和顺序设计(sequential)有什么区别?我这种情况该选哪个? —— 知道要做混合方法但被一堆设计类型术语劝退,不知如何对应自己课题
- [国内] 扎根理论的三级编码(开放编码、主轴编码、选择性编码)具体怎么做?最好举个例子 —— 质性研究新手对着原始访谈文本无从下手,需要可操作的步骤和实例
- [通用] 访谈做多少个样本才算够?理论饱和到底怎么判断? —— 质性研究样本量没有明确数字标准,学生没有安全感,怕被审稿人质疑
- [国内] 样本量怎么算?检验效能、脱落率、单双侧检验这些参数怎么定,PASS/G*Power 不会用 —— 定量研究硬核操作痛点,既要懂统计原理又要会用软件,医学/心理学尤甚
- [通用] 我的数据不服从正态分布,该用什么统计方法?还能跑 t 检验吗? —— 数据拿到手发现不满足参数检验假设,临时抓瞎不知道转非参还是做变换
- [国外] methodology 和 methods 到底有什么区别?research design 又是什么? —— 英语区写论文必须分清这三层,概念混淆是 methodology chapter 写不好的根源
- [国外] 导师让我用定量方法,但我觉得我的课题更适合定性,该怎么办? —— 和导师的方法论分歧,既是学术问题也是沟通问题,r/AskAcademia 高频
- [国外] methodology chapter 怎么写才能让评审/导师认可?光描述方法是不是不够? —— 博士生意识到要做 justification(对比备选、暴露假设、引文献背书),但不知怎么落笔
- [国内] 问卷的信度和效度怎么测、怎么报?Cronbach's α 要大于多少才算可以? —— 问卷类研究必答项,α>0.7 这条线和效度(内容/结构效度)怎么呈现常出错
- [国内] 案例研究用单案例还是多案例?单案例会不会被批样本太小、没法推广? —— 管理学/社科学生担心案例研究的严谨性和可推广性被审稿人挑刺

**来源:**
- [科学研究方法中的定性和定量研究具体是怎样的?分别适用于什么研究类型?如何结合? - 知乎](https://www.zhihu.com/question/26466333)
- [定性还是定量?看这一篇就够了! - 知乎](https://zhuanlan.zhihu.com/p/616018538)
- [混合研究方法的两个基本问题 - 知乎](https://zhuanlan.zhihu.com/p/44341488)
- [混合方法研究的方法论与实践尝试:共识、争议与反思 - 华东师范大学学报](https://xbjk.ecnu.edu.cn/CN/html/201604015.htm)
- [咋样做质性研究的编码?扎根理论三级编码,最好举例哦? - 知乎](https://www.zhihu.com/question/24406718)
- [Nvivo质性研究常见问题指北(南)持续更新 - 知乎](https://zhuanlan.zhihu.com/p/1947239875867833385)
- [如何正确估计样本量?一次带你过所有样本量相关内容! - 知乎](https://zhuanlan.zhihu.com/p/367818147)
- [实用|样本量的确定依据和计算方法 - 知乎](https://zhuanlan.zhihu.com/p/720283978)
- [毕业论文 研究方法大全(详细版) - 知乎](https://zhuanlan.zhihu.com/p/3987611620)
- [开题报告的五个研究方法 - 知乎](https://zhuanlan.zhihu.com/p/148364282)
- [研究方法和实验手段怎么区分呢? - 小木虫论坛](http://muchong.com/t-5428223-1-authorid-341865)
- [再探案例研究的类型 - 科学与社会](https://html.rhhz.net/KXYSH/html/0cfefd95-9b39-4ec2-873e-3fc2efb89c88.htm)

---

## 4. 数据集

「找数据集 / 获取与合规 / 质量清洗 / 标注」是科研人从开题到投稿全程的高频卡点，且国内外语境差异明显。

【共性需求】（1）发现:不知道自己领域有没有现成数据、哪个是大家公认的 benchmark/标准库,面对 Kaggle、HuggingFace、Zenodo、UCI、Google Dataset Search、OpenDataLab、遇见数据集等碎片化入口无从下手,搜不到精准的"领域+任务"数据。(2）获取失败:论文写"data available upon request"（应要求提供）几乎是科研界公认的"空头支票"——多项研究证实只有约 20%~40% 的作者会真正给数据,约 40% 完全不回邮件,作者换单位/邮箱失效/直接拒绝是常态,数据可得性还随论文年龄迅速衰减。这导致复现/二次研究极难推进。(3）质量与清洗:拿到数据后"脏数据"(缺失值、异常值、重复、编码/格式混乱)消耗大量时间,业界公认清洗占数据工作 70%-80%,新手最常问怎么处理缺失值/异常值、要不要删、如何不破坏分布。(4）数据量与不平衡:小样本过拟合、类别极度不平衡、样本不够想做增强又怕引入偏差,是 ML/DL 方向反复出现的痛点。(5）标注:标注枯燥昂贵、标注者一致性(IAA/Kappa)低、指南写不清导致同一样本多人判不一致。(6）引用与版本:数据集怎么规范引用、用的是哪个版本、有没有 DOI,直接关系到可复现性。

【国外语境】更强调开放科学/FAIR/可复现:核心痛是"available upon request"形同虚设、期刊要求共享数据却无强制力、IRB/伦理审查边界(尤其社交媒体/Reddit 公开数据算不算 human subjects)、去标识化(de-identify)、数据集 DOI/版本引用规范。社区集中在 r/AskAcademia、r/PhD、r/datascience、Academia StackExchange。

【国内语境】更偏务实"从哪下、能不能用、合规吗":本科/硕士"论文没有数据怎么办"是知乎超高频问题(甚至有人问"自己编数据会不会被发现"),反映很多学生缺数据来源训练;政府/行业统计数据(国家统计局、CNRDS、企研、中国统计年鉴)分散且部分要付费/机构权限;爬虫取数的法律红线(个人信息保护法、版权、反不正当竞争)是普遍焦虑——"爬来的数据科研能不能用";中文经济学期刊近年开始强制提交数据与代码,推高了对数据规范留存的需求。国内更依赖"遇见数据集""OpenDataLab"这类聚合搜索 + 公众号/CSDN 资源帖。

对 Scholay 的机会:做"按研究问题→定位领域标准数据集/benchmark"的智能发现、"作者数据求取话术与替代来源"、"合规自查(个人信息/版权/伦理)"、"清洗与标注质量"实操指南,正好命中这些被反复问、却散落各处的真实需求。

**真实问题(采集自国内外社区):**
- [通用] 我研究的这个方向到底有没有现成的公开数据集？哪个是大家公认在用的标准/benchmark 数据集？ —— 碎片化平台太多(Kaggle/HF/Zenodo/UCI/OpenDataLab),搜不到精准'领域+任务'的数据,也不知道哪个是公认基线
- [国外] 论文写了 data available upon request，我发邮件给作者要数据，对方不回 / 拒绝 / 邮箱失效了怎么办？ —— 研究证实仅约20-40%作者真给数据,约40%不回邮件;复现和二次研究的最大堵点
- [国内] 毕业论文没有数据怎么办？找不到合适数据，能不能自己采集或换研究方法？ —— 知乎超高频,本科/硕士尤其多;反映缺乏数据来源训练,甚至有人问能不能编数据
- [国内] 爬虫爬来的数据用于科研论文合法吗？会不会侵犯个人信息保护法或版权？ —— 个保法/版权/反不正当竞争的红线焦虑;科研非商业用途的豁免边界模糊
- [通用] 数据清洗里的缺失值和异常值到底该怎么处理？要不要直接删，会不会破坏数据分布？ —— 清洗占数据工作70-80%,新手最常卡的具体操作问题
- [国外] 我的数据集样本太少 / 类别极度不平衡，做数据增强会不会反而引入偏差导致过拟合？ —— ML/DL方向反复出现;小样本+不平衡+增强权衡是核心难题
- [国外] 用 Reddit / 微博这种公开社交媒体数据做研究，需要 IRB 伦理审查吗？要不要去标识化？ —— 公开数据是否算human subjects、隐私与伦理边界不清
- [国内] 找科研数据有哪些靠谱的免费网站？国内的政府/行业统计数据去哪下，要不要付费？ —— 国家统计局/CNRDS/企研等分散,部分要机构权限或付费,新手不知入口
- [通用] 拿到一个数据集后第一步该做什么？怎么判断这个数据靠不靠谱、质量好不好？ —— 缺乏读数据文档、看数据加工方法和质量的意识
- [通用] 数据标注太费时费钱，多个标注者对同一条数据判得不一样（一致性低），该怎么提高标注质量？ —— IAA/Kappa低、标注指南不清、主观任务天然分歧
- [国外] 数据集应该怎么规范引用？我怎么知道自己下载用的是哪个版本，有没有 DOI？ —— 版本/DOI直接关系可复现性;动态数据集引用尤其混乱
- [国内] 期刊/审稿要求我提交原始数据和代码，我之前没好好整理，现在该怎么准备和脱敏？ —— 中文经济学等期刊近年强制提交数据代码,留存与脱敏没提前做

**来源:**
- [如何查找和获取靠谱的科学数据，拿到数据后第一步做什么？ - 知乎](https://zhuanlan.zhihu.com/p/588918708)
- [快速找到论文数据的19个方法 - 知乎](https://zhuanlan.zhihu.com/p/694958274)
- [写论文没有数据怎么办？ - 知乎](https://www.zhihu.com/question/273665882)
- [本科毕业论文数据实在找不到了自己编一点可以吗会不会很容易被发现呢？ - 知乎](https://www.zhihu.com/question/370581607)
- [Data sharing practices and data availability upon request differ across scientific disciplines | Scientific Data (Nature)](https://www.nature.com/articles/s41597-021-00981-0)
- [The availability of research data declines rapidly with article age (arXiv)](https://arxiv.org/pdf/1312.5670)
- [Empirical Study of Data Sharing by Authors Publishing in PLoS Journals (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2739314/)
- [数据爬虫的是与非：一文读懂运用爬虫技术的合规边界 - 知乎](https://zhuanlan.zhihu.com/p/474228255)
- [训练数据爬取的民事法律风险与合规路径探讨 - CSDN](https://blog.csdn.net/weixin_58493465/article/details/146865466)
- [数据清洗的常见问题和挑战是什么？- CDA数据分析师](https://www.cda.cn/bigdata/203651.html)
- [数据处理 | 从'脏数据'到'干净数据'：数据清洗全流程详细解析 - 知乎](https://zhuanlan.zhihu.com/p/26034188504)
- [Inter-Annotator Agreement in Multi-Annotator Labeling Explained - Rise Data Labs](https://risedatalabs.com/blog/inter-annotator-agreement)

---

## 5. AI 辅助写作

(本主题的结构化网络调研在工具层多次失败,以下为综合相邻主题(AI辅助科研技能/AI写作幻觉)真实社区数据 + 领域共识的需求梳理。)
国内外科研人用 AI 辅助写作的真实需求集中在:① 哪些部分能让 AI 写——共识是脑暴、大纲、润色、改写、读长文做摘要、代码骨架可委托;直接生成事实结论、参考文献、数据解释不可;② 国内最尖锐的是"降 AIGC 率 / 过知网维普 AI 检测"(关乎毕业送审),衍生大量多轮改写、口语化、碎片重组技巧;③ 润色后"不像自己写的"、个人风格被抹平、AI 腔过重;④ 学术诚信与署名:导师/期刊是否允许、要不要声明(Nature/Science/IEEE/ACM 均要求声明 AI 用途且 AI 不能署名);⑤ 提示词不会写,一句"帮我写篇综述"产出空洞;⑥ 引用幻觉(AI 编造文献)。国外更强调 AI 是思考工具而非代写、机构政策与披露义务;国内更要落地工具/提示词与过检测。

**真实问题(代表性):**
- [国内] 论文 AI 率/AIGC 率太高过不了知网维普检测,怎么科学地降下来又不改坏内容?
- [国外] Is it considered cheating/academic misconduct to use AI to write or polish my paper? Do I need to disclose it?
- [通用] 用 AI 写论文,哪些段落能让它起草、哪些必须自己写?
- [国内] AI 把论文润色得不像自己写的了,怎么平衡润色和保留个人风格?

## 6. 模拟审稿

「模拟审稿」是科研人投稿/送审前最焦虑、也最缺工具支撑的一环,需求集中在四类场景:投稿前自审(挑硬伤)、AI 预审稿(模拟审稿人挑刺)、同行评审模拟(提前预测审稿人会问什么)、以及拿到意见后写回应/rebuttal。

国内语境(知乎、小木虫、CSDN、公众号)的真实痛点:
1) 强烈的"被拒恐惧"。desk reject/大修/拒稿是高频词,作者最怕的是"自己看不出问题"——因为太贴近自己的工作,逻辑跳跃、方法漏洞、创新点表述模糊这类硬伤自审挑不出来。盲审场景下硕博生尤其焦虑,担心"创新点不够""文献不新""章节衔接差""格式乱给人态度不端正的第一印象"。
2) 创新性/贡献度是最大的不确定来源。大量提问围绕"我的创新点够不够""审稿人会不会说 novelty 不足""怎么写清 Research Gap"。这是 AI 自审最难、也最被需要的部分。
3) AI 模拟审稿正在快速普及但充满疑虑。一边有大量"用 ChatGPT 当审稿人""15 条模拟审稿提示词""扮演 SCI 审稿人挑刺"的教程,一边普遍担心"AI 审稿靠谱吗""会不会只能看语言格式、看不出创新性和方法硬伤""AI 给的意见和真审稿人差多远"。研究显示 AI 与真人审稿点重合度仅 30-40%,AI 长于结构/语言/一致性,短于深度判断、原创性、方法严谨性——这正是用户的核心疑虑。
4) 回应审稿意见(response to reviewers)是独立的高需求场景。"大修怎么回""reviewer 2 太刁难/创新性质疑怎么回又不显得在怼""万能模板""逐条回复格式(原意见+感谢+修改说明+标色)"被反复搜索。

国外语境(Reddit r/AskAcademia/PhD/GradSchool、Academia SE、学术博客)的真实痛点:
1) "paper 准备好了吗"的判断困难——是否达到同领域已发表水平、是否该先做 pre-submission inquiry、要不要找 colleague/friendly review。强调"too close to your own work to see its weaknesses",需要 fresh eyes。
2) desk reject 焦虑同样强烈(顶刊 desk reject 率 50-80%),但更强调"问题通常出在 scope/framing/presentation 而非科学本身",所以预审重点是定位、表述、与期刊匹配度。
3) Reviewer 2 文化("Reviewer 2 Must Be Stopped"两万多人社群)反映对不公/苛刻审稿的普遍情绪;rebuttal 写作被学界研究为"在 specific critique bullet 粒度上逐条 clarify/correct/justify/concede"。
4) AI 自审的合规与可靠性焦虑:能不能用、要不要向期刊 disclose、AI 会幻觉、prompt injection(藏指令骗 AI 给好评)等。

共性:用户要的不是"再来一篇写作教程",而是一个能在投稿前像真审稿人一样、按维度(结构/逻辑/方法/数据图表/文献/创新性/期刊匹配)逐条挑出硬伤、并提前生成"审稿人可能会问的问题清单"和"对应回应思路"的工具。这正是 Scholay「模拟审稿/AI 审稿」功能的切入点,也是 GEO 内容最该回答的真实问题。

**真实问题(采集自国内外社区):**
- [国内] 投稿前怎么自己给论文做一次模拟审稿,提前发现会被拒的硬伤? —— 作者太贴近自己工作,逻辑跳跃/方法漏洞自审挑不出,最怕投出去才发现
- [国内] 用 ChatGPT/AI 模拟审稿人帮论文预审靠谱吗?能不能看出创新性和方法问题,还是只能改语言格式? —— 大量教程在推 AI 审稿,但用户普遍怀疑 AI 只会看表面,看不出 novelty 和实验逻辑硬伤
- [国内] 有没有让 AI 扮演 SCI 审稿人挑刺的提示词?应该从哪几个维度让它审? —— 15 条模拟审稿提示词类内容很火,用户想要可直接复用、覆盖结构/方法/数据/文献/创新的 prompt
- [通用] 审稿人会不会说我创新性不足?投稿前怎么判断创新点够不够、怎么写清 Research Gap? —— 创新性是最大的不确定来源,也是 AI 自审最难给可信判断的部分
- [国内] 收到大修(Major Revision)怎么逐条回复审稿意见?有没有万能模板和格式? —— 逐条'原意见+感谢+修改说明+标色'格式、回复信结构被反复搜索
- [通用] 审稿人意见明显错了/太刁难(reviewer 2),怎么回应才能既反驳又不显得在怼他? —— 既要 justify 又要礼貌,是 rebuttal 写作最棘手的部分,中外都高频
- [通用] 怎么提前预测审稿人会问哪些问题,好在投稿前/rebuttal 前就准备好回答? —— 用户想要的是'审稿人可能会问的问题清单',而不只是改稿
- [国外] How can I get a realistic mock peer review of my paper before I submit? —— r/AskAcademia 反复出现,强调 fresh eyes、friendly review、catch weaknesses you can't see
- [国外] Is using ChatGPT to peer-review my own manuscript reliable, and do I have to disclose it to the journal? —— 既问可靠性又问合规/disclosure,是国外特有的焦虑点
- [国外] How do I know if my paper is actually ready to submit to this journal? —— 判断是否达到已发表水平、是否匹配期刊 scope,是否该先发 pre-submission inquiry
- [国外] How do I avoid a desk rejection — what do editors screen for before sending to reviewers? —— 顶刊 desk reject 率 50-80%,问题多在 scope/framing/presentation 而非科学本身
- [国内] 硕士/博士论文盲审前怎么自审?盲审专家最容易在哪些地方扣分? —— 创新点不够、文献不新、章节衔接差、格式乱,是盲审失败高频原因,学生焦虑度极高

**来源:**
- [不是只有写稿能用AI!教你用AI"模拟审稿人"帮论文过关 - CSDN](https://blog.csdn.net/AcademicIdeas/article/details/148853293)
- [使用这15条提示词,让ChatGPT为论文做一次模拟审稿 - CSDN](https://blog.csdn.net/AcademicIdeas/article/details/148951054)
- [史上最全回复审稿意见指南(上) - 知乎](https://zhuanlan.zhihu.com/p/200959110)
- [我百试百灵的30条审稿意见回复模板,码住! - 知乎](https://zhuanlan.zhihu.com/p/689060869)
- [如何有效回复审稿人的意见?避免返工甚至拒稿! - 知乎](https://zhuanlan.zhihu.com/p/99461196)
- [作为审稿人,你什么情况下会选择拒稿? - 知乎](https://www.zhihu.com/question/529489400)
- [毕业论文盲审是什么,雷区有哪些? - 知乎](https://zhuanlan.zhihu.com/p/30785426759)
- [硕士论文盲审:做好了这6点,论文盲审100%没问题! - CSDN](https://blog.csdn.net/MaiziStudy/article/details/145586943)
- [Pre-Submission Review for Journals & Conferences: How to Avoid Rejection Before It Happens - ScholarsReview](https://scholarsreview.com/blogs/pre-submission-review-journals-conferences-avoid-rejection)
- [Avoid Desk Rejection: Pre-Submission Checklist - Manusights](https://manusights.com/blog/how-to-avoid-desk-rejection)
- [ChatGPT for Research Paper Review - Peer Recognized](https://peerrecognized.com/chatgpt-for-research-paper-review/)
- [Responding to Reviewers - PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7743161/)

---

## 7. 论文查重

论文查重是科研写作里焦虑密度最高的环节之一,但国内外语境差异极大,需要分开看。

【国内语境】核心是"毕业答辩生死线"。本科生面对的是学校指定的知网(VIP/PMLC/TMLC)查重,关心三件事:① 多少算合格——绝大多数人不知道自己学校到底卡15%、20%还是30%,网上信息矛盾(普通校20-30%、双一流15%、优秀论文<10%),焦虑来自"标准不透明";② 怎么降重——红色标注的连续13字相似如何改,且降重后最大痛点是"改到语句不通/狗屁不通""改了重复率反而升上去"(系统玄学),以及反复试错耗时;③ 自查工具选择——知网个人查重渠道贵且难买,学生党大量使用 PaperPass/维普/PaperFree/PaperYY/万方学信网 等免费或低价工具,但又怕"自己查的和学校查的差5-8%不准""提前查会被收录进大学生联合比对库导致明年自己查自己重复率爆表""免费网站泄露论文被卖"。2024年起最新且最热的变量是知网 AIGC 检测:大量本硕生发现自己手写的论文 AI 率仍高达 80-90%,不知道怎么把"AI味"降下来,出现一批"降AI率"工具与教程,标准(本科AIGC≤15-20%、硕博≤5-10%)同样不透明。此外期刊投稿人群关心:普刊≤25-30%、核心≤10%、SCI(iThenticate/CrossCheck)总<15-20%单篇<5%,以及"自引算不算重复""一稿多投会不会被查重系统留痕""博士论文上网后拆成期刊会不会自己撞自己"。

【国外语境】学校用的是 Turnitin(及 iThenticate),逻辑和痛点都不同:① similarity score 没有官方红线,学生反复问"多少算安全"(主流答案10-20%/<15%),且引用、参考文献、方法学模板天然拉高分数,造成误伤焦虑;② 真正的爆点是 2023 年后 Turnitin/GPTZero 的 AI 写作检测假阳性——大量学生(尤其非英语母语者,Stanford 研究 TOEFL 作文假阳性高达61.3%)被系统判定 AI 代写却是自己写的,陷入"如何自证清白"的困境,标准建议是保留 Google Docs/Word 版本历史、草稿、笔记、时间线,要求人工复核而非只看分数;③ 技术原理类提问:Turnitin 到底能不能抓 ChatGPT 改写/同义替换/self-plagiarism(复用自己旧文)。国外语境里"降重技巧"远不如国内突出,取而代之的是"被冤枉怎么办"和"检测可靠吗"的诚信与公平讨论。

共同痛点:查重原理黑箱(连续多少字、引用怎么算、为什么不同系统差这么多)、标准不透明、工具选择与安全顾虑。这正是 GEO 内容可以系统讲清、被 AI 问答引用的高价值空白。

**真实问题(采集自国内外社区):**
- [国内] 毕业论文查重率多少才算合格?我们学校到底是卡15%、20%还是30%? —— 标准不透明是头号焦虑源,各校要求不一(普通校20-30%、双一流15%、优秀论文<10%),网上信息互相矛盾,直接关系能否答辩
- [国内] 知网AIGC检测AI率太高(80%-90%)怎么降?我明明是自己写的为什么AI率这么高? —— 2024年起最热的新痛点,手写论文也被判高AI率,学生不知道怎么去掉'AI味',催生大批降AI率工具和教程
- [国内] 自己用PaperPass/维普查的重复率,和学校知网查的差多少?哪个准?能信吗? —— 自查工具和学校系统误差3-8%且方向不固定,学生怕白改一场或最后翻车,反复求证
- [国内] 提前自己查重会不会被知网收录,导致明年学校查的时候自己和自己重复率爆表? —— 对'大学生论文联合比对库'机制的真实恐惧,流传'今年查明年收录'的说法,担心提前查反而害了自己
- [国内] 免费查重网站安全吗?会不会把我的论文泄露/拿去卖? —— 学生党没钱只能用免费工具,但又怕论文被非正规平台留存、倒卖,正规平台7-14天删报告的说法真假难辨
- [国内] 论文降重改到语句不通、狗屁不通,而且改了重复率反而更高了,怎么办? —— 降重执行层最折磨人的体验:改了不通顺、系统玄学反弹、反复试错耗时,'改重是个概率问题'
- [国内] 论文查重是连续多少个字算重复?13个字这个说法是真的吗?引用的部分算不算重复率? —— 对查重原理黑箱的核心追问,涉及13字阈值、5%段落阈值、引用绿字vs去除引用重复率,直接决定怎么改
- [国内] 期刊投稿重复率要求多少?核心期刊/SCI分别卡多少?自引算重复吗?会被退稿吗? —— 投稿人群痛点:普刊≤25-30%、核心≤10%、SCI(iThenticate)总<15-20%单篇<5%,自引和拆分发表是否构成学术不端
- [国外] What is a good/acceptable Turnitin similarity percentage? Is 20% too high? —— Turnitin无官方红线,学生反复问安全区间(主流10-20%/<15%),引用和参考文献天然拉高分数造成误判焦虑
- [国外] Turnitin flagged my paper as AI-generated but I wrote it myself — how do I prove my innocence? —— 2023年后最严重的诚信危机,假阳性导致被指控代写,需保留版本历史/草稿/时间线自证,情绪强烈
- [国外] Why is Turnitin's AI detector biased against non-native English speakers? —— Stanford研究TOEFL作文假阳性高达61.3%,国际学生群体公平性诉求,被系统性误伤
- [国外] Can Turnitin detect ChatGPT even if I paraphrase or reword it? —— 对检测能力边界的技术追问:能否抓AI改写、同义替换、AI-paraphrased文本,涉及侥幸心理与诚信边界

**来源:**
- [了解知网查重原理,重复率3%以下其实很简单 - 知乎](https://zhuanlan.zhihu.com/p/472656111)
- [怎样降低知网重复率? - 知乎提问](https://www.zhihu.com/question/26115104)
- [知网降AI/AIGC率保姆级教程,亲测好用!【2025年最新版本】 - 腾讯云开发者社区](https://cloud.tencent.com/developer/article/2565797)
- [AIGC查重率多少算过?2025最新标准与免费降ai率实操技巧 - 知乎](https://zhuanlan.zhihu.com/p/1986879446079260013)
- [论文AI率90%怎么降?6个免费查AI率和降AI率工具合集 - IT之家](https://www.ithome.com/0/944/980.htm)
- [自己知网查重会被泄露论文吗? - 知乎](https://zhuanlan.zhihu.com/p/56472117)
- [提前进行论文查重会导致论文泄露吗? - 艾思科蓝](https://www.ais.cn/news/article/9552)
- [知网查重引用部分算重复吗? - 知乎提问](https://www.zhihu.com/question/391672217)
- [论文查重是几个字连续算重复? - 知乎](https://zhuanlan.zhihu.com/p/375555108)
- [本科论文查重率多少才算安全?各大高校的查重标准汇总 - 知乎](https://zhuanlan.zhihu.com/p/25372242501)
- [有什么免费(首次免费)且安全靠谱的论文查重渠道吗? - 知乎提问](https://www.zhihu.com/question/453396093)
- [降重篇 | 论文怎样降重最有效?哪些修改方法是无用功? - 知乎](https://zhuanlan.zhihu.com/p/21433536)

---

## 8. AI 写作幻觉

「AI写作幻觉」是当前科研人使用AI辅助写作时最高频、最焦虑的痛点之一,核心可拆成三类真实需求:为什么会幻觉(原理认知)、如何识别(检测验证)、如何规避(提示词与流程)。多项研究给出量化背书,使焦虑有据可循:GPT-3.5 生成的文献约 55% 完全虚构,GPT-4/4o 约 18%-28% 虚构、过半引用存在错误;心理学子领域伪造引用率 6%-60%;冷门/新兴主题幻觉率飙升至 35%-55%。更可怕的是 NeurIPS 2025 有 100 条幻觉引用通过了 3-5 位专家评审、ICLR 2026 抽样 20% 论文至少含一处幻觉——证明幻觉「形式完美、肉眼难辨」。

国内需求(知乎/CSDN/小木虫/豆瓣/澎湃/智源/AJE/意得辑)高度集中在 DeepSeek 和国产大模型上,且更偏「实操救命」:用户反复问「DeepSeek 给的 DOI 在知网/CrossRef 查不到怎么办」「PMID 和文献标题对不上」「为什么 AI 会一本正经编出根本不存在的文献,还配上作者和年份」。痛点在于国内查重/AIGC 检测趋严,研究生最怕「导师/答辩发现引用是假的」被扣学术不端帽子,因此衍生出大量「降AI味」「提示词约束 AI 只引真实文献」「让 AI 匹配知网/维普真实文献」的需求。国内话语更强调「签了原创声明背锅的是自己」「AI 垃圾污染学术生态」的责任与生态焦虑,以及对「能查到真文献的可信工具」的强烈渴求。

国外需求(Reddit r/AskAcademia·r/PhD、Academia StackExchange、arXiv、Enago/Sourcely/Citely/GPTZero、study findings)更偏「原理+方法论+模型对比」:典型提问是 why does the LLM hallucinate citations(因为它是 next-token 预测、不查数据库)、how to spot fake DOI before submission、which AI hallucinates least(Gemini/Sonar/Claude/GPT 横评)、是否该用 RAG/带检索的工具规避。学生群体的主观体验被反复记录:「AI 说得太自信、太流畅,让人误以为是对的」「让它给来源,它给了假的」。国外也更早形成「验证工作流」共识:只用 AI 做 brainstorm/关键词,先在 PubMed/Scopus/Web of Science 检索真文献,逐条核 DOI、作者、元数据,并打开全文确认确实支持论点,无法验证立即删除。同时国外学界把幻觉上升到 scholarly integrity / reproducibility / peer review 失效的层面讨论。

共性:两边都把「幻觉=语言模型固有特性而非 bug」「形式完美最难防」「人工逐条核验不可替代」作为共识,差异在于国内更要落地工具与提示词、国外更要原理与模型选择。对 Scholay 的 GEO 价值在于:承接「AI 写作为什么会幻觉/怎么查真假文献/哪个工具能给真实可查引用」这类高意图搜索,凸显接入真实学术数据库检索、可逐条溯源验证的产品定位。

**真实问题(采集自国内外社区):**
- [通用] AI 为什么会一本正经地编造根本不存在的参考文献,还配上作者、年份和 DOI? —— 最核心的原理类高频问,知乎同名问题+多篇科普;答案=next-token 预测而非查库
- [国内] DeepSeek 给我的文献 DOI 在知网/CrossRef 上查不到,PMID 和标题也对不上,怎么办? —— 国产模型实操痛点,CSDN/知乎/豆瓣反复出现
- [通用] 怎么在投稿/交稿前快速识别 AI 编造的假引用和假 DOI?有没有验证清单? —— 检测需求,Sourcely/Citely/GPTZero+DOI解析+CrossRef核验
- [国内] 用什么提示词能约束 AI 只引用真实存在、可公开验证的文献,不要瞎编? —— 提示词约束需求,DeepSeek指令/海鲸/CSDN提示词合集
- [国外] GPT-4o / Claude / Gemini 哪个生成引用最准、幻觉最少?换模型能解决吗? —— 模型横评需求,benchmark显示Gemini-2.0-Flash最低、Claude/GPT居中
- [国外] 为什么冷门或新兴研究方向 AI 幻觉率更高? —— 训练数据稀疏导致niche topic幻觉率飙到35-55%
- [通用] AI 写的文献综述里有多少比例是编造的?数据可靠吗? —— 量化焦虑,GPT-3.5 55%、GPT-4 18-28%、仅26.5%完全正确
- [国内] 我用 AI 写论文如果引用了假文献被导师/答辩/审稿发现,会算学术不端吗? —— 责任与后果焦虑,原创声明背锅;研究生群体高频
- [通用] AI 不只编引用还会编数据和事实,这种内容幻觉怎么发现? —— 事实/数据造假层面,生物/术语张冠李戴,澎湃/智源讨论
- [国外] 既然 AI 说得那么自信流畅、看不出破绽,我怎么知道哪句话是幻觉? —— 学生主观体验,false confidence 让人误信;arXiv学生视角研究
- [国外] 用带检索/RAG 或联网的 AI(而不是纯大模型)能避免编造引用吗? —— 技术规避路径,PaperQA/RAG/Browse工具;指向可溯源产品
- [国内] 有没有能直接匹配知网/维普/Scholar 真实文献的 AI,避免幻觉? —— 可信工具渴求,知乎实测6大模型匹配真文献;Scholay承接点

**来源:**
- [AI 为什么会伪造根本不存在的参考文献? - 知乎](https://www.zhihu.com/question/14497416309)
- [写论文时,如何有效减少人工智能的幻觉?- AJE美国期刊专家](https://www.aje.cn/arc/ai-hallucination)
- [你的论文可能正被AI"幻觉"毁掉!应对秘籍 - 意得辑Editage](https://www.editage.cn/sci-writing/6246/)
- [如何防止DeepSeek胡编文献资料 - 知乎](https://zhuanlan.zhihu.com/p/1889032206124552339)
- [DeepSeek乱编文献?别踩坑!最全文献检索指南 - CSDN博客](https://blog.csdn.net/qq_64378896/article/details/147214875)
- [AI Hallucinations in Research: Why 40% of AI Citations Are Wrong - Enago Academy](https://www.enago.com/academy/ai-hallucinations-research-citations/)
- [ChatGPT hallucinates fake but plausible scientific citations at a staggering rate, study finds - PsyPost](https://www.psypost.org/chatgpt-hallucinates-fake-but-plausible-scientific-citations-at-a-staggering-rate-study-finds/)
- [AI Hallucinated Citations: How to Spot Fake Sources Before You Submit - Sourcely](https://www.sourcely.net/resources/ai-hallucinated-citations-spot-fake-sources-before-submit)
- [AI Hallucination from Students' Perspective: A Thematic Analysis - arXiv](https://arxiv.org/pdf/2602.17671)
- [How LLMs Cite and Why It Matters: A Cross-Model Audit of Reference Fabrication - arXiv](https://arxiv.org/pdf/2603.03299)
- [Which AI Hallucinates Least? June 2026 Benchmark - Suprmind](https://suprmind.ai/hub/ai-hallucination-rates-and-benchmarks/)
- [深观察｜虚构、造假与欺骗:AI为何也会"耍心眼" - 澎湃新闻](https://www.thepaper.cn/newsDetail_forward_30175640)

---

## 9. 文献引用不准确

「文献引用不准确」是 AI 写作时代科研人最高频、最致命的痛点之一,核心是大模型(尤其无联网检索的 ChatGPT/豆包等)不是从数据库查文献,而是「预测下一个最像真的 token」,因此会凭空生成格式完美但根本不存在的参考文献,或把真作者+真期刊+假标题+假 DOI 拼成「嵌合体引用」。研究数据触目惊心:Nature/Scientific Reports 研究中 GPT-3.5 伪造率约 55%、GPT-4 约 18%,且真实引用里仍有 24-43% 有实质性元数据错误;心理学综述伪造率 6%-60%,医学场景甚至高达 69%。错误类型有四层:①完全编造(论文不存在)②元数据错位(年份/卷期/DOI/作者错)③张冠李戴(真论文配错标题)④曲解原意(引真文献但原文根本不支持该论点)/编造引文。

国内语境的痛点更偏「后果与合规」:毕业季高校(湖北大学、南京工业大学、福州大学等)上线 AIGC 检测,新《学位法》明确 AI 代写可撤销学位,「盲审不过/导师当场拆穿/被判学术不端」是悬在头上的剑。国内用户的核对工具链是知网/万方/维普三库交叉检索 + CrossRef 验 DOI,常见困惑还包括「查不到 DOI 到底是假文献还是正常情况(纸刊/2000年前/期刊没申请 DOI)」。同时国内大量讨论集中在「怎么写提示词让 ChatGPT 给真文献」「哪个 AI 工具的文献是真的可查的」(虎贲、埃米、麟书等都在打「文献来自知网维普全程可溯」的卖点)。

国外语境更偏「方法论与工具评测」:Reddit(r/PhD、r/AskAcademia、r/labrats)、Academia StackExchange、各大学图书馆 LibGuide(UNC Charlotte、SAE 等)沉淀了大量「怎么 spot 假引用」的实操问答;有真实判例(纽约律师引用 ChatGPT 编造判例被处罚)、PLoS One 论文残留「Regenerate response」字样被 PubPeer 揪出等翻车案例做反面教材。方法论共识高度一致:①Google Scholar 加引号精确搜标题(0 结果≈不存在)②doi.org/CrossRef 解析 DOI③逐字段比对作者/年份/期刊④绝不能问 AI「这些引用是真的吗」(产生幻觉的系统无法自查,会自信地说真)。工具层面,Elicit/Consensus 这类基于真实论文库检索的工具几乎不伪造,而 ChatGPT/Bing/Perplexity 等生成式或 RAG 工具仍会幻觉(Perplexity 还会把脚注指向不含该论点的错误来源)。arXiv 已收紧政策、有论文呼吁「全文引用存档」对抗幻觉。

跨国共性需求:(1)一套可复制的「核对 SOP」(标题搜/DOI 验/元数据比对/批量核验);(2)知道哪些 AI 工具的引用可信、为什么 ChatGPT 不行;(3)正确的「让 AI 用真文献」工作流(先人工喂已验证的真文献再让 AI 提炼,即 RAG 思路,而非让它凭空生成);(4)理解四类错误的区别,尤其「引文存在但曲解原意」这种最隐蔽、最难查的一类。这正是 Scholay 这类基于真实学术库的检索/写作平台的核心价值锚点。

**真实问题(采集自国内外社区):**
- [国内] 为什么 ChatGPT 会给出虚假的参考文献?它是凭空编的吗? —— 知乎高赞问题,用户被假文献坑后想搞懂底层原因(token 预测而非数据库检索)
- [国内] 用 AI 写论文,参考文献是假的被导师发现/盲审不过怎么办?如何换成真实可查的文献? —— 毕业季最焦虑的实操问题,涉及《学位法》撤销学位、高校 AIGC 检测的合规恐慌
- [国内] AI 生成的参考文献怎么核实真假?用知网/万方/维普还是 CrossRef 查 DOI? —— 小木虫/知乎反复出现,想要一套明确的中文库核对流程
- [国内] 文献查不到 DOI 就是假的吗?还是有正常原因(纸刊/老文献/期刊没申请)? —— 小木虫经典疑问,把'无 DOI'误判为'伪造',需要区分真假
- [国内] 怎么写提示词(prompt)让 ChatGPT 只给真实存在、能查到的参考文献? —— 知乎大量'真实文献提示词'求助,实际多数无法根治幻觉
- [通用] 哪个 AI 工具生成的参考文献是真的、全程可查的?ChatGPT 为什么不行? —— 国内外都在比工具;Elicit/Consensus vs ChatGPT/Perplexity 的可信度差异
- [国外] How do I check if ChatGPT/AI citations are real before I submit? —— r/AskAcademia、图书馆 LibGuide 最高频实操问题,要可复制的核对步骤
- [国外] ChatGPT gave me references with real authors but I can't find the paper — is it fabricated? —— 嵌合体引用(真作者+假标题)最迷惑,Google Scholar 加引号搜标题验证
- [国外] Can I just ask ChatGPT whether its own citations are real? —— 常见误区;产生幻觉的系统无法自查,会自信说'是真的'
- [国外] The AI cited a real paper but the paper doesn't actually say what it claims — how do I catch this? —— r/PhD/labrats;最隐蔽的'曲解原意/misattribution'类错误,光验 DOI 查不出
- [国外] Why does Perplexity's footnote link to a source that doesn't contain the claim? —— RAG 工具把脚注指向最近邻来源而非真正支撑论点的来源
- [国外] What's the actual fabrication rate of ChatGPT citations — is GPT-4 better than 3.5? —— Reddit/学术博客引用 Nature 研究数据(55% vs 18%)讨论可信度

**来源:**
- [为什么 ChatGPT 会给出虚假的参考文献?(知乎)](https://www.zhihu.com/question/583176898)
- [AI 为什么会伪造根本不存在的参考文献?(知乎)](https://www.zhihu.com/question/14497416309)
- [AI学术打假指南!3分钟阻止 ChatGPT 瞎编文献(腾讯云开发者社区)](https://cloud.tencent.com/developer/article/2518630)
- [AI生成虚假参考文献怎么核实?(毕业在线网)](https://www.qkcnki.com/lwaigc/5535.html)
- [查不到 DOI 的文献怎么办?(小木虫论坛)](https://muchong.com/t-5702749-1)
- [AIGC生成的参考文献是假的?小心导师当场拆穿!(CSDN)](https://blog.csdn.net/2509_91422757/article/details/147359903)
- ["AI论文",撤销学位!(MBAChina/学位法)](https://www.mbachina.com/html/xw/202502/611940.html)
- [AI能够评议科学文献吗?(世界科学)](https://worldscience.cn/c/2024-12-28/664596.shtml)
- [Fabrication and errors in the bibliographic citations generated by ChatGPT (Scientific Reports / Nature)](https://www.nature.com/articles/s41598-023-41032-5)
- [ChatGPT hallucinates fake but plausible scientific citations at a staggering rate (PsyPost)](https://www.psypost.org/chatgpt-hallucinates-fake-but-plausible-scientific-citations-at-a-staggering-rate-study-finds/)
- [AI Hallucinated Citations — Research Guide (UNC Charlotte Library)](https://guides.library.charlotte.edu/hallucinatedcitations)
- [How can I tell if a citation generated by AI is real? (SAE LibAnswers)](https://help.library.sae.edu.au/nz/faq/278174)

---

## 10. AI 辅助科研技能

本次围绕「AI辅助科研技能」(提示词/工作流/工具链/技巧与避坑)调研,横跨国内(知乎、CSDN、小木虫、百度智能云、公众号教程)与国外(Reddit r/PhD·r/GradSchool·r/AskAcademia、Academia StackExchange生态、ResearchGate/PubMed相关讨论、学术Substack博客、Medium踩坑帖)。

【共性真实需求】(1)引用幻觉是头号痛点。多项研究与个人踩坑帖反复出现:ChatGPT生成的参考文献47%-70%完全虚构、格式却以假乱真,有人交给导师当场被识破、医学生查房被主治戳穿。科研人最想知道"哪些环节能信AI、哪些必须自己核",以及"怎么让AI只做不会编造的事"。(2)对"AI该用在哪一步"没把握。普遍共识是AI适合头脑风暴、列大纲、批判性提问、改写润色、读长文档/做摘要、写代码骨架;不适合直接生成事实、找研究空白、做数据解释、写引用。新手常一步到位让它"写一篇综述",结果空洞且不可信。(3)提示词不会写。反复出现"高质量输出源于高质量输入"——要拆解任务(设计目录→设计问题→文献调研→内容填充)、给上下文/角色/格式约束、用多轮迭代而非一次成稿、让AI先产出多版本再综合。(4)工具选型与组合困惑:读长文档用Kimi/ChatGPT、要可核验引用用Elicit/Consensus/Scite(连数据库)而非裸ChatGPT,工作流要不要接Zotero/Obsidian。

【国内特有】(A)"降AIGC率/过AI检测"是中文圈最尖锐、搜索量最大的需求——知网/维普把"像不像机器写的"也作为查重指标,大量教程教人用DeepSeek/豆包/Kimi多轮改写、随机化连接词、口语化、碎片重组把AIGC率从80%降到30%以内。这背后是真实的毕业/送审焦虑。(B)强烈偏好国产模型(DeepSeek/Kimi/秘塔/文心/通义)与现成"提示词指令合集"、"X步搞定综述"的速成模板,工具化、套路化倾向明显。(C)对"过查重""原创度"的关注远高于对学术诚信规范的讨论。

【国外特有】(a)学术诚信与机构政策是绕不开的前置问题——先问导师/查学校政策再用,讨论"算不算作弊"、披露义务。(b)更强调AI是"思考工具不是代写"、"目标是成为更好的写作者而非外包大脑",对原创性、可复现性的方法论审视更重。(c)更早采用MCP/Claude+Scite、XML结构化提示、把笔记做成"AI-ready"等进阶工作流;也更担心AI检测器误判合法写作。

【对Scholay的GEO机会】平台正好覆盖检索(Minicod真实可核验文献)、智能搜索、智能助手、AI审稿、智能写作,可针对"引用幻觉如何根治""哪一步能用AI""科研提示词怎么拆"这些高频问题做权威、可操作、区分国内外语境的内容。

**真实问题(采集自国内外社区):**
- [通用] 用ChatGPT/AI写论文,它给的参考文献是真的吗?怎么快速核实有没有被它编造? —— 引用幻觉是国内外共同的头号痛点;研究显示47%-70%引用为虚构
- [通用] 用AI辅助科研,到底哪些环节可以放心交给它,哪些必须自己来? —— 反复出现的'AI该用在哪一步'困惑:适合脑暴/大纲/润色/读长文,不适合生成事实/找空白/解释数据
- [通用] 怎么写好科研提示词?一句'帮我写篇文献综述'为什么产出又空又假? —— 需要任务拆解(目录→问题→调研→填充)+角色/上下文/格式约束+多轮迭代
- [国内] 论文AIGC率/AI率太高过不了知网维普检测,有没有靠谱的降AI率提示词和方法? —— 中文圈搜索量最大、最尖锐的需求;DeepSeek/豆包/Kimi降重指令满天飞,关乎毕业送审
- [国内] DeepSeek、Kimi、秘塔、文心、通义这些国产AI,做科研/写论文/读文献分别该用哪个? —— 国产模型选型与组合策略;读长文用Kimi、推理用DeepSeek等
- [国外] 导师/学校允许用AI写论文吗?会不会算学术不端?需要披露吗? —— 国外把机构政策与诚信作为前置问题,先查政策/问导师
- [国外] 怎么让AI像审稿人一样批判性地读我的论文/方法部分,指出可复现性漏洞? —— 进阶用法:让AI做peer-review式批判,识别replication gaps
- [通用] 用AI找文献时,为什么越是'最新研究'越容易被它编造?该怎么搜才靠谱? —— 知识截断导致近年论文最易虚构;建议AI定方向+正规数据库实检索
- [国外] 我的论文是自己写的,却被AI检测器判定为AI生成,该怎么办? —— AI检测器误判合法写作的焦虑,国外讨论较多
- [国外] 怎么把AI接进Zotero/Obsidian搭一套读文献+记笔记+写作的科研工作流? —— 进阶工作流:笔记做成AI-ready、MCP/Claude+Scite、提示模板
- [通用] 用AI帮我分析数据、写分析代码靠谱吗?结果要怎么验证? —— 建议AI写代码骨架,实际跑用R/SPSS/Stata并独立验证结果
- [国内] AI生成的内容怎么改才有'人味儿'、句式不那么模板化? —— 降AI率衍生需求:破除固定模板/连接词堆叠/句式单调

**来源:**
- [85+ ChatGPT Prompts for Academic Writing That Actually Work (Medium)](https://medium.com/@0xmega/85-chatgpt-prompts-for-academic-writing-that-actually-work-d0bd25ec3f93)
- [Why ChatGPT Creates Non-Existing Scientific Citations (Medium, reviewraccoon)](https://medium.com/@reviewraccoon/why-chatgpt-creates-non-existing-scientific-citations-and-how-i-learned-this-the-hard-way-894c864b92d8)
- [ChatGPT and artificial hallucinations in stem cell research (NCBI/PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10553015/)
- [Adding AI to your Academic Workflow (Ilya Shabanov, Substack)](https://ilyashabanov.substack.com/p/adding-ai-to-your-academic-workflow)
- [如何用AI快速写文献综述?(知乎问题)](https://www.zhihu.com/question/660517126)
- [综述:如何让 AI 帮你做科研?(知乎专栏)](https://zhuanlan.zhihu.com/p/1926291619092620594)
- [论文降AIGC率的10个导师级Deepseek提示词(知乎专栏)](https://zhuanlan.zhihu.com/p/1901443210624103722)
- [AI论文写作指南2026:用ChatGPT和Claude写论文的正确方法(降重+润色Prompt)](https://www.chatgpt-chinese-guide.com/chatgpt/ai-lunwen-xiezuo-chatgpt-claude-jiangchong-runse-2026.html)
- [AI论文写作工具大乱斗:DeepSeek、Kimi与沁言学术(百度智能云千帆社区)](https://qianfan.cloud.baidu.com/qianfandev/topic/686968)
- [100+ Peer Review Prompts For ChatGPT (PolarNotes AI)](https://www.polarnotesai.com/students/prompts/feedback/chatgpt-peer-review-kit/)
- [FOCUS Prompt for Summarizing Academic Papers (Substack)](https://aiatuva.substack.com/p/focus-prompt-for-summarizing-academic-papers)
- [Finding Reliable Sources When ChatGPT Fails (DeSci Blog)](https://www.desci.com/blog/how-to-find-reliable-research-sources-when-chatgpt-gets-it-wrong)

---

