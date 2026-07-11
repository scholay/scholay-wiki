---
name: wl-voice-register
description: 改写/续写前先采样同节 2-3 段作者原文作声纹样本,提取并镜像句长分布、人称、hedge 习惯、术语与连接词,让新文字读起来仍像作者本人写的。
when_to_use: 症状找我:作者反馈「改完/续写的不像我写的」;新段与相邻原文一拼就风格断裂——句长节奏突变、we 主动与被动混杂、hedge 密度忽高忽低、同义术语两套并用(participants/subjects)、半篇 -ize 半篇 -ise、冒出作者从未用过的段首连接词;作者的一句话被润色成三句铺垫。不归我:整篇无作者底稿、通篇流畅空洞的套话腔要 humanize→wl-de-slop;单句歧义看不懂→wl-clarity;中式英语表达→wl-eal-chinglish;hedge 强度与证据不匹配的对错问题→wl-rl-claim-calibration。
menu: 改写后不像作者写的,要匹配原文嗓音
axis: craft
---

<<<LENS>>>
生成动作:动笔改写或续写前,先到同节或最邻近的 2-3 段作者原文里采样,提出一张声纹卡,让新文字镜像它;只改被点名要改的地方,其余措辞照留。

【声纹卡(采样后填空)】句长:短/中/长句约 __:__:__,最长约 __ 词|人称:we 主动 / 被动为主 = __|hedge:惯用 __(may/suggest/可能),一句最多 __ 个|术语:作者写 __、不写 __(同义词二选一跟作者)|拼写:-ize/-ise、data set/dataset = __|连接词:段首爱用 __,句间爱用 __。

【镜像四律】① 新句长落在作者分布内,别连写三句超过作者最长句;② 作者没用过的腔调词(moreover/notably/值得注意的是)一个不引入;③ 作者一句一个 hedge,你也只放一个;④ 作者一句说完的,你也一句说完——简洁是声纹,不是缺文采,别替作者铺陈。

❌(邻段作者原文是 "We report accuracy only; F1 shows the same trend." 式的短促 we 主动句)续写成:It is worth noting that, in addition to accuracy, the F1 score was also carefully examined, and a similar trend could be observed.
✅ We also examined F1; it shows the same trend ([@fig:___]).
🔍 只改一个特征:收回作者的「we + 短主动句」,长度与邻句持平——信息一字未少。

【续写句骨】先填作者的惯用词再落笔:We ___(作者惯用动词)the ___, which ___(作者惯用连接词或 hedge)___(图表挂 [@fig:___],文献挂 [@___])。

【别动/豁免】作者点名要改的措辞按点名改,不算破坏声纹;明显语法错、术语错照改;[@key] 与 [@fig:x] 锚原样保留;方法节固定句式本就平实,别为镜像硬加起伏;镜像的是分布不是句子,别逐句仿写成复读;整篇尚无作者底稿(从零代写)时无纹可采,本条不适用,按领域惯例写。
<<<END_LENS>>>

## 深入

**第一性原理**:论文署的是作者的名,读它的人——导师、合作者、审稿人——对"换了个人写"的接缝比对内容瑕疵更敏感。你的默认文风是平均腔:偏长的复合句、成对的腔调副词、每步都铺垫;作者的文风是多年习惯:也许短促,也许德式长句,也许通篇被动。二者一拼接,读者三行内就能听出来。所以基准从来不是"写得更好",而是"像这位作者写的、更好的版本"。一段"客观上更漂亮"却不像作者的改写,大概率被整段回滚——等于白写,还消耗信任。

**为什么采样自家原文**:最可靠的风格说明不是任何守则,是作者自己已经写下的段落。就近取样:同节 2-3 段 > 同章 > 全文任意段,越近越准——因为语域本身随小节漂移(引言可以活泼,方法必须平实,讨论允许推测)。别采太多:采 5 段以上会把局部语域平均掉,镜像出一种全文哪里都不像的"均值腔"。续写尤其如此:光标前面的那两段,就是你唯一该模仿的对象。

**五个维度,逐一镜像**

一、句长分布。镜像是双向的,不是"一律改短"。
❌ 作者惯写带插入语的长句("The model, once pretrained on the full corpus, transfers to low-resource settings with minimal loss."),你续写却剁成电报:"We test transfer. Loss is small. Results hold."
✅ Fine-tuning, even with a tenth of the labels, preserves this transfer, and the loss stays within one point.
🔍 只改节奏:保住作者的复合句骨架与插入语习惯,信息不变。
反过来,作者是短句派,你就别拼三十词从句。检验法:数一下作者最长句的词数,你的新句不超过它的 ±20%。

二、人称与语态。作者的方法节通篇被动("Samples were incubated at 37 °C…"),哪怕教科书都说 we 主动更好,你在第四段突然写 "We then measured the absorbance" 就是一道接缝。
❌ 前三段全被动,你续写:We measured the absorbance at 450 nm.
✅ The absorbance was measured at 450 nm.
🔍 只改人称:跟随本节既有语态,教科书偏好让位于连贯。要不要全节改主动,那是作者的决定——可以建议,不能顺手代做。

三、hedge 习惯。有的作者一篇只用三次 may,断言干脆("demonstrates / shows");有的每个结论都垫 suggest。两种都合法,你要做的是数出频率、沿用词表。
❌ 作者通篇 "Our results show…",你补写的讨论句成了 "These findings may potentially suggest a possible association…"
✅ These results show the association holds across both cohorts ([@fig:___])。
🔍 只改限定强度:回到作者的断言档位,hedge 数从三个降回零。
边界:如果证据确实撑不起作者档位的断言——比如相关数据被写成因果——那是对错问题不是声纹问题,该弱化就弱化,但用作者自己的 hedge 词(他惯用 suggest 就别写 might conceivably),并在交付时说明为什么降档。

四、术语与拼写。作者选过的词是选择,不是疏漏。participants 还是 subjects,模型还是网络,方法还是算法,-ize 还是 -ise,dataset 还是 data set——同义词二选一,永远跟作者已有的那个。最伤的是半篇 colour 半篇 color:审稿人立刻知道有第二只手。声纹卡里"作者写 __、不写 __"这一栏,就是为了在动笔前把这类对子锁死。

五、连接词风格。作者转折只用 However 起句,你就别引入 Nevertheless / That said / 值得注意的是;作者句间用朴素的 and / but 串联,你就别升级成 furthermore / moreover。连接词是最高频的指纹——一段里冒出一个作者从未用过的段首副词,比整段重写还显眼。

**最常见的破声纹:把简洁改成铺陈**
❌ 作者原句:Ablations confirm both components matter ([@fig:___]).
   被"润色"成:In order to further validate the individual contribution of each component, a comprehensive series of ablation experiments was conducted, the results of which, as illustrated in [@fig:___], clearly confirm that both components play an important role.
✅ Ablations confirm both components matter; removing either costs at least two points ([@fig:___]).
🔍 唯一合法的扩写方向:加信息(掉几个点),不加铺垫。字数可以变多,套话密度不能变高。作者用一句话说完的事,改完还是一句话。

**改写的最小 diff 原则**:被点名的句子才是工作区。作者说"把这段的语法修一下",你修语法;顺手把 participants 换成 subjects、把两个短句并成从句、给结论补一个 hedge——都是事故。
❌ 点名修语法,交回去的段落却换了三处措辞、并了两个句子。
✅ 只改动词时态与主谓一致,其余逐字保留,连作者那个有点口语的 "a big drop" 都留着。
🔍 没被点名的措辞是作者的声音,不是你的改进机会;真觉得该改,单独提出来让作者拍板。

**动笔前 60 秒的流程**
1. 定位:新文字会插在哪两段之间/接在哪段后面。
2. 采样:取同节最近的 2-3 段作者原文(改写则取被改段的前后邻段)。
3. 填卡:句长比例与最长句词数、人称、hedge 词表与密度、术语对子、拼写系、段首与句间连接词——六栏填完再动笔。
4. 起草:套【续写句骨】,动词、连接词、hedge 全部从卡上取。
5. 连读:把新段和它的前一段连起来读一遍,听接缝。

**交稿前镜像检查表**
- 新段最长句 ≤ 作者最长句 ±20%?短句派没被拼成长从句?
- 人称/语态与邻段一致?没有半段 we 半段被动?
- 引入了作者没用过的段首连接词或腔调副词吗?有就删。
- 每句 hedge 数 ≤ 作者惯例?断言档位没被悄悄调高或调低?
- 同义术语、拼写系与作者已有用法一致?
- [@key] 与 [@fig:x] 全部原样保留、新增的挂在正确位置?
- 连读测试:接缝处能听出换人吗?能就回炉。

**豁免与边界**:作者明说"帮我去掉 AI 腔/写得更学术",指的就是改变声纹,按指令来,本条让位;作者底稿本身通篇套话时,镜像套话没有意义——先问作者要哪种声音。语法错、拼写错、术语误用照改:镜像习惯,不镜像错误。从零代写、文档里还没有作者的字:无纹可采,按目标期刊与领域惯例写,等作者改过一轮后再回来采样。最后,镜像的是统计特征——句长分布、词表、密度——不是句子本身;把邻段句式逐句套用会写出自我复读,那是另一种不像人写的。
