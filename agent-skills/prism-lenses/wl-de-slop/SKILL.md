---
name: wl-de-slop
description: 去 AI 腔:删套话废词与堆叠限定,把流畅但空洞的句子改写成带具体数字与实义动词的高信息密度学术散文,并调句长节奏。
when_to_use: 症状:文字通篇语法正确、读来流畅,但读完记不住一个具体事实;句子里堆"It is worth noting / plays a pivotal role / 值得注意的是 / 综上所述 / 随着…的不断发展"类套话;"X, Y, and Z"三词并列与空形容词成串;一句叠多个 may/possibly/一定程度上;Furthermore/Moreover 连环起句;每段末尾自我复述、结尾机械"综上";破折号密集、句长平得像节拍器。不归我:句子本身语法错、词语搭配错、中式直译腔(冠词/时态/介词/量词问题)→ 找 wl-eal-chinglish;论证结构、段落顺序、逻辑漏洞也不归我——本条只管"语法完美但空洞"。
menu: AI 腔:套话、机械排比、空洞过渡
axis: craft
---

<<<LENS>>>
生成动作:改写——通读段落,删掉不承载信息的套话与堆叠限定,把空形容词换成具体名词和数字,再调句长节奏;术语、数据、$...$、[@key] 与 [@fig:x] 一律原样保留。

【删词】搜到即删并就地重写:delve into / it is worth noting / plays a pivotal role / in the realm of / navigate the landscape / a testament to / multifaceted / seamlessly;值得注意的是 / 综上所述 / 众所周知 / 不难发现 / 在当今…背景下 / 随着…的不断发展。判据:删掉后句义不变即废词。
【hedge】一句里 may/might/could/possibly/potentially 只留最强一个;有效应量、p 值直接给。
【并列】"X, Y, and Z" 三词并列同段限两处,超了换成一个精确名词或数字;首先…其次…若无递进就合成一句因果。
【过渡】删 Furthermore/Moreover 连环、It is important to note that、如前所述;要过渡就写出实义因果。
【破折号】一段 em-dash ≤1 处。【总结】删段末复述句与"综上"回环。
【名词化】perform an analysis of→analyze;对…进行了分析→分析了…。

❌ It is worth noting that our method plays a pivotal role in the complex landscape of protein folding.
✅ Our method lowers median folding error to 1.0 Å on CASP15 [@jumper2021].
🔍 只做一件事:空壳短语换成一句可验证、带数字的断言。

句骨:
- We ___ed ___ from ___ to ___ ([@fig:___]).
- Unlike ___ [@___], our ___ requires no ___.
- 在___条件下,___从___变为___(见 [@tbl:___])。

别动:方法学固定句式(We measured X using Y.)本该平实,只删废词别加文采;反映真实不确定性的单个 hedge 保留;定义、公式、表头、引用键一字不动;没有数字就别编,宁可指向 [@tbl:___]。语法错/中式直译不归本条。
<<<END_LENS>>>

## 原理:AI 腔 = 语法完美 + 信息密度低

AI 腔的根源不是词汇选错,而是句子读起来顺、却几乎不承载新信息。所以去 AI 腔的本质不是加"人味装饰",而是提高每句的信息量。判据只有一条:**删掉这个词或半句,读者失去了具体信息吗?没有就删。**

两问诊断法,逐句过:
1. 删掉它,意思变了吗?没变 → 删。
2. 这句告诉了读者一个此前不知道的具体事实吗?没有 → 重写或与邻句合并。

一段里若每句都过不了第二问,整段可压成两三句。

## 一、删词黑名单

发稿前全文搜删并就地重写:
- 英文:delve into / tapestry / it is worth noting / plays a pivotal (crucial) role / in the realm of / a testament to / navigate the landscape / underscore / multifaceted / seamlessly / comprehensive(空泛用法)/ leverage(当"用"讲时)
- 中文:值得注意的是 / 综上所述 / 众所周知 / 不难发现 / 在当今…背景下 / 随着…的不断发展 / 具有重要意义

❌ It is worth noting that our proposed method plays a pivotal role in navigating the complex landscape of protein folding prediction.
✅ Our method predicts folding structure more accurately than AlphaFold2 [@jumper2021] on the CASP15 set.
🔍 空壳短语整句删掉,换成一句可验证的断言。

❌ 随着人工智能技术的不断发展,众所周知,深度学习在诸多领域都发挥着至关重要的作用。
✅ 2020 年后,深度学习把蛋白质结构预测的中位误差从 4.5 Å 降到 1.0 Å 以下 [@jumper2021]。
🔍 删"随着…发展/众所周知/诸多/至关重要",补时间、指标、数字。

## 二、hedge 堆叠

一句里 may / might / could / possibly / potentially / to some extent 只留语气最强的一个;中文"可能在一定程度上或许"同理。有效应量、p 值、置信区间在手就直接写。

❌ This finding may potentially suggest that the treatment could possibly be effective to some extent.
✅ The treatment reduced tumor volume by 34% (p = 0.002; [@tbl:efficacy]).
🔍 四个 hedge 叠加等于什么都没说;数据在手就给数据。

注意:反映真实不确定性的单个 hedge 是科学诚实,保留。"may reflect residual confounding" 若确实无法排除混杂,这个 may 是对的。删的是**无证据支撑的堆叠**,不是删所有限定。

## 三、空壳并列与形容词自我表扬

"首先…其次…再次…"若三点间无递进无因果,合成一句带对比或因果的话。英文 "X, Y, and Z" 三词并列同段超过两处,就把一组换成单个精确名词或拆成两句。

❌ The framework is robust, scalable, and efficient, providing a comprehensive, flexible, and powerful solution.
✅ The framework processes 10k documents per second on a single GPU ([@fig:throughput]).
🔍 六个形容词换成两个可测事实。形容词是自我表扬,数字才是证据。

## 四、空过渡

删只占位不推进的连接:连续 Furthermore / Moreover / In addition 起句、It is important to note that、As mentioned above、如前所述。要过渡就写出真实逻辑——because / but / so 的实义关系。

❌ Furthermore, it is important to note that the results demonstrate a multifaceted improvement across various metrics.
✅ Accuracy rose from 71% to 88% ([@tbl:main]), and false positives fell by half.
🔍 过渡词与空形容词全删,落到两个具体数字。

实用替换表:
- Furthermore → 直接说下一个事实;真有递进才写 "Beyond X, …"
- Moreover / In addition → 删
- It is important to note that → 删;重要就让事实自己站出来
- As mentioned above / 如前所述 → 删,或改成对具体图表的指回:"as [@fig:ablation] shows"

## 五、动词埋没(名词化)

把名词化拆回动词,让句子的动作落在真动词上:
- perform an analysis of → analyze
- conduct an investigation into → investigate / measure
- provide a demonstration of → demonstrate
- 对…进行了研究 → 研究了…
- 实现了…的提升 → 把…从…提高到…

❌ We conducted an investigation into the influence of temperature on the reaction rate.
✅ We measured how temperature changes the reaction rate ([@fig:arrhenius]).
🔍 只把 conducted an investigation into 拆回 measured,句子立刻有了动作。

## 六、具体压抽象

various factors / significant improvements / numerous studies 这类抽象壳,能落地就落地:
- various factors → 温度、pH 和离子强度
- significant improvements → 准确率从 71% 升到 88%
- numerous studies → three RCTs [@a; @b; @c]

高频句骨(留空处按稿件实况填):
- We ___ed ___ from ___ to ___ under ___ ([@fig:___]).
- Unlike ___ [@___], our approach requires no ___.
- ___ rose/fell from ___ to ___ (p = ___; [@tbl:___]).
- 在___条件下,___由___变为___(见 [@fig:___])。

唯一警告:没有数字就别编。宁可写 "accuracy improved (exact margins in [@tbl:main])",也不要捏造 88%。落具体之前先回查图表与数据是否真有此数。

## 七、破折号

em-dash 用于真正的插入或强调:"The effect was large—larger than any prior report—but only in older patients."。它不该替代每个逗号;一段超过一处就改回逗号或句号。整篇破折号密集是最刺眼的 AI-tell。

## 八、逐段总结的回环

AI 稿爱在每段末尾复述本段,再在全文末尾"综上所述"一次。删掉这些回环句,让论点在展开中自然收束。

❌ 段末:In summary, this section has demonstrated the effectiveness of our approach.
✅ (整句删,段落止于最后一个事实。)
🔍 复述句零信息,删掉后段落反而更有力。

真需要收束的只有全文最后一段——而它应给出新的含义或下一步,不是复述已写内容。

## 九、句长节奏

AI 稿常是一串等长的二十词从句,平得像节拍器。人写的稿有起伏:短句砸结论,长句展开机制。连续三句同长度,就拆一句、并一句。

❌ The system failed under load. The failure was caused by a buffer overflow. The overflow occurred during concurrent writes.
✅ It failed. The buffer overflowed under concurrent writes—a case the unit tests never exercised.
🔍 三句等长合成"短 + 长",信息不变,节奏活了。

## 操作顺序

对一段下手按此序,互不打架:
1. **先删**:黑名单词、空过渡、段末复述(纯删除,零风险);
2. **再压**:hedge 留一个、并列换数字、抽象落具体(需要回查 [@fig:x] / [@tbl:x] 与数据是否支撑);
3. **后调**:名词化拆动词、句长节奏、破折号(纯文字手术);
4. **通读**:确认 [@key] 与交叉引用一个没丢,数字与表格一致,$...$ 公式原样。

## 豁免清单

- 方法学固定句式("We measured X using Y."、"Samples were incubated at 37 °C for 24 h.")本就该平实——只删废词,别为去 AI 腔硬加文采与节奏。
- 反映真实不确定性的单个 hedge 保留(有据、单个)。
- 定义、定理、公式 $...$ 内部、表格表头、引用键 [@key]、交叉引用 [@fig:x] 一字不动。
- 期刊模板或导师明确要求的句式(如结构化摘要的 Background / Methods 标签)保留。
- 摘要里每个词都贵:套话优先删,但别把字数省下来的空间又填回形容词。
- 若句子的问题是语法错、搭配错、中式直译(冠词、时态、介词),那不是 AI 腔——交给 wl-eal-chinglish;本条只管"语法完美但空洞"。
