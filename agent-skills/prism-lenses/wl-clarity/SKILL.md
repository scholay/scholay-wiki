---
name: wl-clarity
description: 单句清晰度——把绕、名词化、主谓相隔太远、一句多事的病句,按角色-动作与读者期待改写成一读就顺的学术句;只动句内语序与用词。
when_to_use: 症状=某个句子要回读两遍才懂:动作被藏进 -tion/「…性/…化」抽象名词再配 perform/进行 类弱动词;主语和动词之间隔着一长串插入语或从句;一句话焊了两三件事;读完发现全句最重的新信息没落在句尾;开头挂着 It is important to note that 之类空转引子。不归我:句子各自都顺但连起来断裂、连接词硬缝、段落主张句位置不对(→wl-paragraph-flow);内容整体太冗长要砍篇幅或太单薄要扩写(→wl-expand-compress)。
menu: 单句绕、名词化、主谓远、一句多事,读两遍才懂
axis: craft
---

<<<LENS>>>
生成动作:改写单句——把要回读才懂的句子(绕、名词化、主谓远、一句多事)重排成「干事的角色作主语、真动作作动词、最重的新信息落句尾」的直读句;只动散文的语序与用词,不动任何标记。

五个下手点:
1) 角色当主语、动作当动词:动作若被藏进 -tion/-ment/「…性/…化」再配 perform/conduct/进行/实现 等弱动词,还原成动词。
2) 主谓相邻:主语与动词之间超过约 8–10 词的插入成分,整体挪到句首或句尾。
3) 一句一主张:一句焊了两三件事就断句;出现第二个 and/而/但 的转折处落句号。
4) 句尾强调位:本句最想让读者记住的新信息放句尾,句首留给已知语境。
5) 删空转引子:It is important to note that/值得注意的是 这类不载信息的引子直接删,句子从事实开始。

❌ An improvement in accuracy was achieved through the implementation of the method in [@key].
✅ The method in [@key] improved accuracy.
🔍 只改一个特征:把藏在 improvement/implementation 里的动作还原成真动词 improved,让方法自己当主语——引用键与其余内容原样保留。

句骨(照填):
- 还原名词化:「___(角色/方法)___(动词)了___(对象)」,替代「the ___ of ___ was ___ed」;
- 挪插入语:「___(限定成分),___(主语)___(动词)___。」;
- 断句:「___(第一件事)。为此,___(第二件事),见 [@fig:___]。」;
- 收强调位:「在___(已知条件)下,___(主语)___(动词)出___(本句新发现)。」

别动/豁免:
- 领域术语式名词化(regression/ablation/扩散/磷酸化)是在命名概念,不是藏动作,保留;
- 「谁做的」不重要或已知时被动更好(Samples were stored at −80 °C),别硬改主动;
- $...$ 数学、[@fig:x]/[@tbl:x]/[@key]、表格与题注一律原样保留,只改散文;
- 定义句、定理陈述等固定句式别为「生动」硬改;
- 句与句接不上、段落节奏问题不归本条;整段冗长要压篇幅也不归本条。
<<<END_LENS>>>

## 深入

清晰不是用词简单,而是让读者一遍读顺、不必回读。本条只管**单句内部**——一个句子里的动词选择、主谓距离、论点数量与信息位置。句子各自都顺但连起来断裂,是另一回事(见文末边界速查)。

## 0. 一遍扫描的诊断顺序

对要改的每个句子,按序自问:
1. 本句的主动作在哪?是动词,还是被埋进了抽象名词?
2. 主语是干这件事的角色吗?
3. 主语到动词隔了几个词?
4. 这一句在推进几个论点?
5. 句尾放的是不是本句最重的新信息?

命中任何一条就动手;一条都没中,这句不归本条管——别为改而改。

## 1. 角色-动作(Williams)

最有力的句子把「谁」放主语、「做了什么」放动词。学术写作的通病是把动作名词化,再配一个苍白的通用动词(perform/conduct/carry out/achieve/进行/开展/实现)撑住句子。

- before: The implementation of the algorithm resulted in an improvement in accuracy.
- after: The algorithm improved accuracy.

- before: Measurement of the samples was carried out by two independent raters.
- after: Two independent raters measured the samples.(顺带把无角色的被动改成有角色的主动。)

中文同病同治:
- before: 对模型进行了训练与评估,并实现了对推理延迟的降低。
- after: 我们训练并评估了模型,降低了推理延迟。

被动语态本身不是错——当「谁做的」不重要或已知时被动更好:Samples were stored at −80 °C;数据集按 [@key] 的划分方式切分。真正要修的是「无角色主语 + 名词化动作 + 弱动词」这一组合。

## 2. 名词化:诊断三问与豁免

名词化=把动词/形容词变成抽象名词(reduce→reduction,able→ability,「稳定」→「稳定性」)。它让句子变重、动作消失。

诊断三问:这个抽象名词是不是本句的主要动作?它前后是不是挂着 of/「的」?句子是不是被迫用弱动词(is/was/led to/resulted in/得到了)来接它?三问皆「是」,还原成动词。

- before: There was a failure of the system in the detection of anomalies.
- after: The system failed to detect anomalies.

- before: led to a reduction in error
- after: reduced error

- before: 通过对采样策略的调整的实施,完成了对方差的抑制。
- after: 调整采样策略后,我们抑制了方差。

豁免判据:删掉这个名词,句子是否就没法指称一个东西了?是,则它在命名概念而非藏动作,保留——regression、diffusion、annotation、ablation、attention、磷酸化、正则化(作术语时)都属此列。同一个词两种身份要分开:「we applied regularization」是术语,留;「the regularization of the loss was performed」是藏动作,改成「we regularized the loss」。

## 3. 主谓相邻

读者读到主语后,工作记忆一直悬着等动词;主谓之间塞的词越多,负担越重。控制在约 8–10 词内,超了就把限定成分(which/that 从句、多重介词短语、插入语)整体挪到句首或句尾,或拆成独立句。

- before: The proteins, which were extracted from six tissue samples collected over two weeks and purified using the standard protocol, degraded rapidly.
- after: Extracted from six tissue samples and purified with the standard protocol, the proteins degraded rapidly.(或拆两句:先交代来源,再说结果。)

- before: 该模型,在经过 40k 对样本的训练并进行了两轮微调之后,最终收敛。
- after: 经 40k 对样本训练、两轮微调后,该模型收敛。

同理,别让主语本身变成一长串堆叠名词(user session timeout configuration parameter/用户会话超时配置参数上限),用 of/「的」拆开,或先命个短名再用。

## 4. 一句一主张

读者靠句号切分论证步骤;把三件事焊进一句,等于让读者自己拆。断句时机:并列超过两三项、出现第二个 and/而/但 的转折、或从句里又套从句时。

❌ We trained the model on 40k pairs, and because the validation loss plateaued we added dropout, which improved F1 by 2 points as shown in [@fig:loss].
✅ We trained the model on 40k pairs. When the validation loss plateaued, we added dropout, which improved F1 by 2 points ([@fig:loss]).
🔍 只改一个特征:在第一处 and 断句,让「训练」「加 dropout 及其效果」各占一句;交叉引用照抄进括号,信息一字不丢。

断出来的短句不是缺点:关键主张用短句收,读者会本能地把注意力给最短的那句。20–25 词以上的长句读一遍,找能落句号的地方。

## 5. 句内信息位置(Gopen–Swan,只取句内部分)

读者默认句首是「我们在谈什么」(话题位,放已知/语境信息),句尾是「关于它最要紧的新话」(强调位)。费解常来自把全句最重的新概念丢在句首、把已知信息压在句尾。

- before: A significant increase in latency was observed when the cache was disabled.
- after: When we disabled the cache, latency increased significantly.(已知的实验操作放句首作语境;新发现 increased significantly 落在强调位。)

- before: 缓存失效风暴是导致 [@fig:latency] 中尾延迟陡增的原因。(若「尾延迟陡增」上文已出现)
- after: [@fig:latency] 中尾延迟的陡增,源于缓存失效风暴。(已知现象开头,新解释收尾。)

注意边界:跨句的「旧→新」链条——上一句句尾抛出的新词由下一句句首接住——是句间衔接的活,不归本条。本条只保证每个句子内部首尾各就各位;改完若句与句仍接不上,交给 wl-paragraph-flow。

## 6. 空转引子与句内死重

这一节删的是让**单句**变绕的死重,不是压缩篇幅(整段砍长度归 wl-expand-compress)。

- 元话语引子整个删:It is important to note that/It should be pointed out that/值得注意的是/需要指出的是——删掉引子,句子从事实开始。确需标记重要性时,用一个词(Notably, Critically)顶格,别用一整个从句。
- 赘余短语替换:due to the fact that→because;in order to→to;in the event that→if;has the ability to→can;a majority of→most;at this point in time→now;通过…的方式→用…;在…的情况下→若…。
- 双重否定改正面:not uncommon→common;not negligible→substantial;并非不可行→可行。
- 空程度词删或换具体:very/quite/relatively/较为/一定程度上——要么删,要么换成带数值的说法(very large→三倍于基线)。

❌ It is important to note that, due to the fact that the dataset was relatively small, a certain degree of overfitting was observed to occur.
✅ Because the dataset was small, the model overfit.
🔍 只改一个特征:剥掉三层不载信息的包装(引子、赘余连词、模糊程度语),事实本身一字未动——22 词变 8 词,信息不减。

## 7. 多病齐发的整句示范

真实病句往往几种病叠加。按诊断顺序逐一处理,每步只治一种:

❌ Utilization of the proposed framework, which integrates the retrieval module described in [@sec:retrieval] and a reranking stage, enables the achievement of significant improvements in answer accuracy.
✅ The proposed framework integrates the retrieval module ([@sec:retrieval]) with a reranking stage, and significantly improves answer accuracy.
🔍 三步各治一病:Utilization/achievement 两处名词化还原成动词;15 词的插入从句提为主干;弱动词 enables 让位给真动作 improves。交叉引用键原样保留。

❌ 通过对基线方法在三个公开数据集上的表现的系统性对比分析的开展,本文所提方法的有效性得到了充分的验证。
✅ 我们在三个公开数据集上将所提方法与基线对比,验证了其有效性(见 [@tbl:main])。
🔍 两步:「对比分析的开展」「得到了验证」还原成「对比」「验证了」;干事的「我们」回到主语位。「充分的」这类空程度词顺手删去。

## 8. 落到 document.md

改写只动散文句子:数学量保持 $...$ 行内表达(「当 $\alpha>0.5$ 时收敛」),别展开也别改写;指代图表用交叉引用([@fig:arch]、[@tbl:results]、[@sec:method])而不是「下图/上表」;文献引用 [@key] 的键逐字保留,位置可随语序调整但不可丢。清晰度的活儿就四样:换动词、重排语序、断句、删死重——信息一个不丢,标记一个不动,数字与结论一个不改。

## 9. 边界速查

- 单句内部读不顺(绕/名词化/主谓远/一句多事)→ 本条。
- 每句都顺但句与句断裂、连接词硬缝、段落主张句埋在中间 → wl-paragraph-flow。
- 内容太冗长要砍篇幅、太单薄要扩写 → wl-expand-compress。
