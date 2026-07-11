---
name: wl-blank-page
description: 空白节起草:从一句意图长出 topic-sentence 骨架再逐段填肉,不确定的事实一律 %TODO 占位——绝不编造、绝不留空节,并提供六类学术 move 的可填空句骨与写不下去时的解锁法。
when_to_use: 可观测症状:某节只有标题或整节空白;光标停在空行写不出第一句;作者说"这节还没写/帮我起个头/不知从何下笔";或某节只有零散要点、从未成过段。不归我:节已有成段草稿只是啰嗦难读或用词不当(那是句段改写打磨类的事);段落齐全但顺序与逻辑衔接乱(去结构重排类);正文已在、缺的只是具体数字/引用键/图表(去事实与引用补全类);数学推导本身推不下去(不属写作阻塞,任何写作 lens 都不治)。
menu: 空白节不知从何下笔,要从零起草
axis: craft
---

<<<LENS>>>
生成动作:对还没写的节起草——从一句意图出发,先铺 topic sentences 骨架,再逐段填肉;不确定的事实一律 %TODO 占位,绝不编造、绝不留空节。

五步:①一句话写下"读完这节读者该相信什么";②按说服顺序写 3-6 句 topic sentences(每句=一段的主张);③挑最有把握的一段先写满;④其余段套 move 句骨填空;⑤数字/引文/未查证处全部插 %TODO 并写明缺什么。

❌ ## Related Work(下面整节空白)
✅ ## Related Work
Existing approaches to ___ fall into two lines: ___ [@key1] and ___ [@key2]. %TODO 确认是否漏第三条线
However, both assume ___, which breaks down when ___.
We instead ___, trading ___ for ___.
🔍 只改一件事:把"零"变成能继续写的 topic-sentence 骨架——每句是一段的种子,缺口全部 %TODO 挂牌,没有一个编造的事实。

六类 move 句骨(填空即用,更多见正文):
- 建立领域:___ has attracted growing attention in ___, driven by ___ [@key].
- 指出缺口:However, prior work on ___ typically assumes ___, which fails when ___.
- 宣示贡献:We address this gap by ___, which enables ___.
- 描述方法:To ___, we ___ in three stages: first ___, then ___, finally ___.
- 报告结果:As shown in [@fig:x], ___ outperforms ___ by %TODO 数字 on ___.
- 解释意义:These findings suggest that ___, with implications for ___.

写不下去:先口语化写一遍("其实我们想说的是……"),再逐句学术化;或跳过开头,从方法/结果等最熟的段起笔。

别动/豁免:已有成段草稿的节(那是改写不是起草,别骨架化覆盖);%TODO 已占位的数字,任何时候不许填猜测值;摘要与结论依赖全文,最后写,空白不算症状;作者手写的事实句照原样保留;引用键不确定时写 %TODO 待补引用,不要发明像真的 [@key]。
<<<END_LENS>>>

# 空白节起草:从一句意图到一节可继续的草稿

## 为什么会卡住:两个决定挤在了一起

面对空白节,阻塞多数不是"没想法",而是同时在做两个决定:这节要说什么(论证结构)和这句话怎么说(措辞)。两件事各自都不难,挤在一起就互相锁死——想措辞时怕结构错,想结构时被一个词绊住。解法是硬拆成两个阶段:骨架阶段只管结构,句子允许丑;填肉阶段只管措辞,不再迷路。

第二个阻塞源是"怕写错事实":一个数字记不清、一篇文献没读完,整段就停在那里。解法不是查完再写,而是 %TODO 哨兵——凡不确定的数字、引文、结论,当场占位并写明缺什么,写作不中断,事实不编造。

## 主流程:五步

**第一步:一句意图。** 逼自己用一句话回答"读完这节,读者应该相信什么"。注意是"相信什么",不是"这节讲什么":

❌ 意图:"这节介绍我们的相关工作。"
✅ 意图:"现有方法都在精度和延迟之间二选一,而我们的分层设计不必。"
🔍 只改一件事:把"这节是什么体裁"换成"这节要读者信什么主张"——后者能直接长出 topic sentences,前者长不出任何东西。

写不出这句意图,说明这节现在不该写:先去写你已经想清楚的节,回头它往往自己冒出来。

**第二步:topic sentences 骨架。** 按说服顺序写 3-6 句,每句 = 未来一段的主张。此时不查文献、不抠措辞、不展开细节。检验标准:把这几句连起来读,应当已经是一个说得通的微型论证;哪句接不上,是结构问题,现在改最便宜。

❌(直接从第一段第一个词开写,写两行删一行)
✅ ## Method
Our approach has two components: ___ and ___.
The first component ___ by ___, avoiding ___.
The second component ___, which requires only ___.
Together they ___ ([@fig:x] gives an overview). %TODO 画总览图后补 fig 键
🔍 只改一件事:先把"段落的地图"铺出来再写字——每一句都还没有血肉,但整节的走向已经定了,后面每段只需回答"怎么展开这一句"。

**第三步:先写最有把握的一段。** 骨架里挑你闭着眼也能写满的那段先填——通常是方法细节、你亲手做的实验,或你最熟的一条对比。这不是偷懒,是校音:有了一段像样的血肉,其余段落的详略、语气就有了基准,而且"已经写出一段"本身就瓦解阻塞。

**第四步:其余段套 move 句骨。** 学术段落的开局高度程式化,不必每段都原创。下文给出六类 move 的可填空句骨,以及 They Say / I Say 的论证句形。填空时留不下的空,就是 %TODO。

**第五步:%TODO 收口。** 通读一遍,把所有"我记得大概是""好像有一篇论文说过"全部显式换成 %TODO+待办内容。收口之后这节应满足:没有空段、没有编造、每个 %TODO 都可执行。

## %TODO 哨兵纪律:三条铁规

**一、绝不编造。** 数字、别人论文的结论、引用键,没把握就占位,哪怕"看起来八九不离十"。写一个编造的 38.2% 比留一个 %TODO 贵一百倍:后者你自己会处理,前者要靠审稿人替你抓。引用键同理——不确定时写 %TODO 待补引用,不要发明一个像真的 [@smith2023]。

**二、绝不留空节。** 哪怕全节只有 topic sentences 加满屏 %TODO,也比一个光秃秃的标题强:骨架随时能继续,空白只会让下次打开时重新阻塞一遍。

**三、%TODO 必须可执行。** 占位符要自带"缺什么、去哪补":

❌ %TODO 补
✅ %TODO 查 [@lee2024] 表 3 的确切 F1,替换本句占位;若低于我们的 0.91 这段论证才成立
🔍 只改一件事:让占位符携带下一步动作和判断条件,回头处理时不用重新回忆当时在想什么。

## They Say / I Say:学术论证的基本句形

学术段落有个通用形状:先复述领域里已有的声音(They say),再放进自己的立场(I say)。空白期直接套用:

They say(概述共识):A number of studies have shown that ___ [@key1; @key2].
They say(转述一家):___ [@key] argue that ___, attributing ___ to ___.
I say(同意并推进):Building on this view, we contend that ___ also ___.
I say(有限异议):While this holds for ___, it overlooks ___; we show that ___.
I say(让步后立论):Granted, ___. Nevertheless, our results ([@fig:x]) indicate that ___.

中文稿件同构照搬:"已有研究表明___[@key],但这一结论建立在___之上;本文证明,当___时,___。"

## 六类 move 句骨(每类再给几个,填空即用)

**建立领域**
- ___ has become central to ___, as evidenced by ___ [@key].
- A key challenge in ___ is ___, which underpins applications such as ___.
- Recent advances in ___ have made it possible to ___ [@key1; @key2].

**指出缺口**
- Despite this progress, little is known about ___.
- However, existing approaches typically assume ___, which breaks down when ___.
- What remains unclear is whether ___ generalizes to ___.

**宣示贡献**
- We address this gap by ___, which yields ___.
- Our key insight is that ___, enabling ___.
- In this paper, we present ___, the first to ___. %TODO 核实 "the first" 是否站得住,站不住就删

**描述方法**
- We formulate ___ as ___, where ___ denotes ___.
- Unlike ___ [@key], our approach ___ without requiring ___.
- To ___, we proceed in three stages: first ___, then ___, and finally ___.

**报告结果**
- As shown in [@fig:x], ___ improves ___ by %TODO 数字 over ___.
- Across all settings ([@tbl:x]), ___ remains ___, suggesting robustness to ___.
- The gap widens as ___ increases, consistent with our claim that ___.

**解释意义**
- These findings suggest that ___, with implications for ___.
- One interpretation is that ___; an alternative we cannot rule out is ___. %TODO 是否需要补实验区分两种解释
- Taken together, the results indicate that ___ matters more than ___ for ___.

句骨是脚手架不是牢笼:填完空以后如果读着别扭,改句式随意,move 的功能(它替这段完成的论证动作)保住就行。同一类 move 连用两句以上时换句形,避免整节一个腔调。

## 解锁法一:口语化→学术化,两遍写

第一遍只对自己说人话,把这段想说的用聊天口吻倒出来;第二遍逐句升格。升格三招:口语判断落到机制;绝对词换成范围限定;"我觉得"换成证据做主语。

❌(第一遍,口语)我们的方法快很多,因为不用重复算那些特征,别人的方法都得算。
✅(第二遍)Our method avoids recomputing ___ features at each step—a cost that dominates the runtime of prior approaches [@key]—reducing end-to-end latency by %TODO 数字.
🔍 只改一件事:把"快很多"落到机制(避免了哪笔计算)加一个可查证的数字位——口语里的感叹变成了可核验的因果句,而数字在查证前老老实实占位。

口语稿不要删着写:先让它完整存在,再整体升格。两遍法的价值恰恰在于第一遍零压力。

## 解锁法二:换一段先写

开头段是全节最难的(它要压缩整节),从它开始写等于把最难的放在最没状态的时候。骨架铺好后,写作顺序完全自由:先方法后动机、先结果后设置都合法,读者看到的顺序由骨架保证,与你的写作顺序无关。

## 各节骨架配方(速查)

- **Introduction**:建立领域 ×1-2 → 指出缺口 ×1 → 宣示贡献 ×1 → 结果预告 ×1(可指向首图 [@fig:x])。
- **Related Work**:按"研究线"分段而不是按"论文"分段,每段 = 一条线的共同假设 + 末句回指本文与它的差异。
- **Method**:总述一句(几个组件、什么关系)→ 按数据流或阶段分段,每段首句回答"这一步做什么、为什么必须有它"。
- **Results**:每段 = 一个问题("___ 是否 ___?")→ 指向证据 [@fig:x]/[@tbl:x] → 一句解读;数字未跑出来的全部 %TODO。
- **Discussion**:最强发现的意义 → 诚实但限定范围的局限 → 未来方向。
- **摘要与结论**:最后写,从各节 topic sentences 蒸馏而成;空白期硬写只会产出注水句。

## 别动/豁免(展开)

- **已有成段草稿的节**:那是改写不是起草。骨架化覆盖会毁掉作者已有的措辞和事实,哪怕草稿很糙也只能在原文上改。
- **作者手写的事实句**:起草时围绕它搭骨架,不要为了句骨整齐改动它陈述的内容。
- **%TODO 已占位的数字**:后续任何一轮都不许顺手填"合理猜测值",只能填查证过的值,或保持占位。
- **摘要、结论、致谢**:依赖全文定稿,它们的空白是正常写作顺序,不是要治的症状。
- **引用与交叉引用键**:[@key]、[@fig:x] 不确定就 %TODO,永远不发明。
- **数学推导的空缺**:公式序列里缺的一步不适用本流程——骨架法治"没话说",不治"没推出来"。
