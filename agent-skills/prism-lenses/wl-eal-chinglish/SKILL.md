---
name: wl-eal-chinglish
description: 非母语作者英文稿的中式表达纠正:冠词漏/滥、时态漂移、虚动词+名词化赘余等语法层翻译腔,就地改写为地道紧凑的学术英语,不动术语与主张。
when_to_use: 句子层面能指认的语法性翻译腔找我:可数单数名词裸奔或 the 滥加(the research shows / in the Figure 2)、同一段时态过去/现在来回跳、虚动词+名词化(conduct an analysis of / make an improvement to)、As for X, it… 式垫词开场、Because…so… / Although…but… 双连词成对出现、discuss about 式介词误加。不归我的:语法全对但排比过齐、delve/leverage 套话密、空洞万能句的 AI 腔 → 去 wl-de-slop;论证顺序、段落组织问题 → 结构类 lens;术语选用与领域惯例问题不属语言皮肤层。
menu: 非母语英文:冠词/时态/中式表达
axis: craft
---

<<<LENS>>>
生成动作:修订稿中带翻译腔的英文句子——诊断冠词、时态、赘余动词化三类中式痕迹,就地改写为地道紧凑的学术英语,只动语言皮肤,不动术语、数据与主张。

❌ We conduct an analysis of the results and make a comparison with the baseline.
✅ We analyzed the results and compared them with the baseline ([@fig:x]).
🔍 只改一处特征:「虚动词(conduct/make/perform)+名词化」还原成实义动词,并钉回过去式;内容与主张一字未增删。

高频句骨(空位可填 [@key]/[@fig:x]):
- 首现→回指:We propose a ___ that ___. The ___ then ___.
- 方法过去式:We trained ___ on ___ and measured ___.
- 图表现在式:[@fig:x] shows that ___.
- 综述现在完成:Prior work has shown that ___ [@key].
- 去垫词:As for ___, it ___ → 主语直接顶上:___ ___。
- 双连词删一半:Because ___, (so) ___;Although ___, (but) ___。

速查:make an improvement to→improve;has the ability to→can;in order to→to;due to the fact that→because;a total of 30 samples→30 samples;the research shows→research shows;in the Figure 2→in Figure 2(专名零冠词,[@fig:x] 同理)。

别动/豁免:
- 术语性名词化(regularization、classification、optimization)是学科词,别拆成动词;
- 定义、定理、极限条件句该长就长,别为句长护栏硬拆;
- 数学 $...$ 内、表格结构、[@key]/[@fig:x] 键名、直接引语一律不碰;
- 语法无误但套话密、排比过齐的 AI 腔不在此处治(归 wl-de-slop);
- 作者刻意的分裂句(It is X that…)与方法段常规被动语态,语法正确就保留。
<<<END_LENS>>>

## 深入

母语非英语的作者写英文稿,读者最先感到的往往不是内容问题,而是「翻译腔」:每句都能懂,但每句都在提醒读者「这不是英文原生的」。根源几乎都是把中文的语法习惯逐字搬进了英文。这份指南按第一性原理拆开每一类痕迹,给出就地改写的路径——目标是让语言隐形、让内容凸显。全程只动句子皮肤,不动术语、数据、主张,也不碰数学 $...$、表格结构和 [@fig:x] / [@key] 引用键。

### 一、冠词:英语强制标记「这一个还是这一类」

中文没有冠词,所以冠词最容易漏、也最容易滥加。判定链三步:

1. 这个名词可数吗?可数单数 → 必须有限定词(a/an/the/this/its…),裸奔的单数名词几乎总是错。
2. 读者能锁定是哪一个吗?上文提过、被 of 短语限定("the accuracy of the model")、唯一或最高级 → the。
3. 第一次出现的某一个 → a/an;抽象不可数、复数泛指、领域名 → 零冠词。

❌ We propose model to solve problem. The deep learning is powerful. Results are shown in the Figure 3.
✅ We propose a model to solve the problem. Deep learning is powerful. Results are shown in Figure 3.
🔍 三处各归各位:首现可数单数戴 a;领域名零冠词;Figure 3 是专名不加 the——交叉引用 [@fig:x] 渲染出的 Figure N 同理,写 "as shown in [@fig:x]",别写 "in the [@fig:x]"。

回指链示范:首现 a,回指 the——"We collected a dataset of 5k images. The dataset covers three domains." 两句间的 a→the 就是英文的「这个」。

### 二、时态:同一段落钉在同一时间轴上

中文靠「了/已经」表完成,英文靠动词形态,漏标就飘。三条硬线:

1. 你在这项工作里做过的事 → 过去式:We trained the model. Participants completed the trial.
2. 普遍为真、此刻仍成立、图表正在展示 → 现在式:[@fig:x] shows…;Attention improves recall.
3. 「迄今研究已…」的综述 → 现在完成:Prior work has shown that … [@key].

❌ We use three datasets and the accuracy is 92%.
✅ We used three datasets, and the accuracy was 92%.
🔍 方法与实验结果是「做过的事」,整段钉在过去式;别一句 trained 一句 train 来回跳。

引述的精细切分:引述动词用过去、被引的普遍规律用现在——"Smith [@key] found that memory declines with age." found 是那次研究的动作,declines 是至今成立的规律。这是母语者的默认切法,照抄即可。

### 三、赘余动词化:把动作还给动词(中式臃肿的最大来源)

中文爱说「进行分析 / 做出改进 / 开展实验」,直译成英文就是「虚动词(make / conduct / perform / carry out / give)+名词化」。动作藏进名词后,句子平均多三四个词,却没多任何信息。压缩规则:找到那个名词化,还原成动词,虚动词整个删掉。

- make an improvement to the algorithm → improve the algorithm
- conduct a comprehensive analysis of the data → analyze the data
- perform the measurement of temperature → measure the temperature
- carry out an experiment on ___ → experiment on ___ / test ___
- give a description of → describe;give an explanation for → explain
- has the ability to detect → can detect
- 连带清掉套话:in order to → to;due to the fact that → because;a total of 30 samples → 30 samples;the process of training → training

❌ We conducted an investigation of the effect of dropout and made a comparison between the two settings.
✅ We investigated the effect of dropout and compared the two settings.
🔍 只做一件事:两处「虚动词+名词化」还原为 investigated / compared;主张、对象、范围一字未动。

### 四、主题冗余:中文「至于X,它…」的话题结构

中文习惯先亮话题再评述,直译就是空转的 As for / When it comes to / It is worth noting that / There exists a phenomenon that。英文把真正的主语直接顶到句首。

❌ As for the running time, it was reduced by half. There exists a problem that the model overfits on small datasets.
✅ The running time was halved. The model overfits on small datasets.
🔍 删垫词、主语上位;信息一点没少,字数掉了近一半。

同族清理:"It is well known that / As we all know" 直接删;"It can be seen from [@fig:x] that X" → "[@fig:x] shows X"。

### 五、句长与信息流:一句只扛一个主张

中文可以用逗号串七八个分句,直译成英文就是 run-on。护栏:一个句子一个核心断言;超过约 40 词、或串了 3 个以上 and / which / 逗号,就拆。拆完用 given→new 排信息:每句开头接上句已知的旧信息,新信息压句尾,段落读起来才有链条。

❌ The proposed method uses attention to capture dependencies and it was tested on three datasets and the results show it outperforms baselines which proves its effectiveness.
✅ The proposed method uses attention to capture long-range dependencies. We tested it on three datasets. It outperforms all baselines.
🔍 一条 40 词长串拆成三句,每句一个主张;"which proves its effectiveness" 这类自我表扬挂件顺手删掉——结论让数字自己说。

另一个坏习惯是把长状语全堆句首:"In order to verify the effectiveness of the proposed method under different conditions, we…"。先给主干再挂条件:"We verified the method under three conditions: …"。

### 六、介词与搭配:记组合,不推逻辑

介词错不影响理解,但一眼露怯。高频正确搭配:research on X、the effect/impact of A on B、consist of、be composed of、based on、compared with/to、an increase/decrease in、superior/inferior to、differ from、depend on、contribute to、account for、an approach to (doing) sth。常见误加介词:discuss about→discuss;emphasize on→emphasize;investigate about→investigate;mention about→mention。

### 七、单复数与主谓一致

data、research、information、evidence、literature、equipment、software 在学术英语里不可数(data 传统上取复数动词:"these data are";求稳可改写成 dataset)。反向:泛指多种时要复数,method→methods、experiment→experiments。主谓一致盯真实主语,别被插入短语带偏:"The set of parameters was tuned"(不是 were——主语是 set)。

### 八、语序与双重连词:重铸,不直译

- 配对连词只留一半:"Because it rained, so we stopped" → 删 so;"Although the model is small, but it works" → 删 but。because/although 已标了关系,再加 so/but 是双重标记。
- "With the development of… / With the rapid growth of…" 万能开场少用,直接说因果主体。
- "more and more" → increasingly / a growing number of;"As we all know" 直接删。
- "we firstly… secondly…" → First, … Second, …;"In this paper, we mainly propose" 的 mainly 常是多余的。
- 时间/地点状语英文默认句尾,别一律前置。

❌ With the rapid development of AI, more and more people pay attention to it, and because it is useful, so it is widely used.
✅ As AI advances, it is attracting growing attention; because it is useful, it is now widely used.
🔍 三处中式骨架各换一处:万能开场从句化、more and more→growing、because…so 删 so。句意零损耗。

### 九、在文档里的落点

- 交叉引用 [@fig:x]、[@tbl:x]、[@eq:x] 渲染成专名(Figure N / Table N),前面零冠词:"as shown in [@fig:x]"。
- 文献键 [@key] 挂句尾或作者名后:"… has been widely studied [@key]" / "Smith et al. [@key] found…";改时态、拆句时别把键挪丢。
- 数学 $...$ 内是符号不是英文,一个字符都别动;表格单元格里的短语可修冠词与搭配,但别改表格结构与表头对应关系。

### 十、分寸与豁免

润色是让语言隐形,不是把每句都改短、改成一个味。三条底线:

1. 术语性名词化是学科词:classification、regularization、optimization、segmentation——别硬拆成动词。"conduct an optimization of" 要压成 optimize,但 "the optimization objective" 原样保留。
2. 定义、定理、极限条件、精确限定该长就长;为「40 词护栏」把一条定义拆碎,精度受损比翻译腔更糟。
3. 语法正确的刻意结构保留:分裂句(It is the sampling strategy that matters)、方法段常规被动语态,都不是病。

改完通读一遍,只自查三样:每个可数单数是否都戴了限定词;同一段时态是否钉在同一轴上;还有没有「虚动词+名词化」。这三样清了,翻译腔基本就散了。最后一条边界:如果句子语法全对、但排比过齐、满是 delve/leverage 式套话,那是另一种病,不在此处治。
