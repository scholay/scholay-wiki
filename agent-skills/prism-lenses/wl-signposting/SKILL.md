---
name: wl-signposting
description: 节与节之间的读者导航:引言 roadmap、节首 frame、节间接缝承上启下、真锚交叉引用;每个路标过删除测试,少而承重。
when_to_use: 症状=跨节读起来像换了篇文章:节开头冷启动直接扎进细节、引言读完不知全文怎么走(缺 roadmap)、正文有「如上所述/见上文/下文详述/as mentioned earlier」却没有 [@sec:x]/[@fig:y] 真锚、图表贴了没被正文点名、前指承诺没兑现。不归我:同一段内句子接不上、句级连接词糊逻辑(→wl-paragraph-flow);一节内部段落顺序乱、该拆该合(→wl-structure)。
menu: 节间过渡生硬/缺 roadmap/交叉引用导航弱
axis: craft
---

<<<LENS>>>
生成动作:补写并改写节与节之间的导航——为引言末生成 roadmap,为节开头生成 frame 句,把「如上所述/下文详述」这类模糊指代改写成 [@sec:x]/[@fig:y]/[@tbl:z] 真锚,并在节间接缝写一句承上启下(上一节得到什么→本节为何跟上)。

❌ The remainder of this paper is organized as follows. Section 2 reviews related work. Section 3 describes our approach. Section 4 reports experiments.
✅ [@sec:method] formalizes retrieval as constrained ranking and derives a closed-form reranker; [@sec:exp] shows it recovers 4 nDCG points on two benchmarks; [@sec:disc] traces when the gains vanish.
🔍 只改一处:每个分句从「节名+presents」升级为「做了什么、得到什么」,并用 [@sec:x] 真锚替代写死的节号。

高频句骨(填空):
- roadmap:[@sec:___] 提出___并证明___;[@sec:___] 在___上验证___;[@sec:___] 讨论___的代价。
- 节首 frame:本节先___,再___,最后说明___何时失效。
- 节间接缝:[@sec:___] 表明___,但___仍未回答;本节通过___补上这一环。
- 回指换锚:如 [@fig:___] 所示,___。/ 回顾 [@sec:___] 中的定义,___表示___。
- 前指:___的局限我们在 [@sec:___] 讨论——写了必须在那一节真的兑现。

每个路标做删除测试:删了读者会迷路才留。

别动/豁免:
- 同一段内的句子衔接、句级连接词不归这里;一节内部的段落顺序、拆并同样别碰。
- 4 页左右短文或结构与领域惯例完全一致时,roadmap 整个省略。
- 不给每节结尾加「下一节我们将…」式目录复读;已承重的路标不加倍。
- [@key] 引文键与图表锚名本身不改,只补正文对 [@fig:x]/[@tbl:x] 的点名。
- 数学推导、表格数据、图题注内容不动。
<<<END_LENS>>>

## 原理:读者在节的边界处最容易走丢

读者是在有限的工作记忆里重建你的论证结构,而**节与节的边界是重建成本最高的地方**——上一节的语境刚被清空,新一节的语境还没建立。路标(roadmap、节首 frame、承上启下句、交叉引用)的唯一职责,就是在这些边界处告诉读者三件事:你在哪、要去哪、这一步和上一步是什么关系。

由此得出唯一的判定尺:**删除测试**。把这个路标删掉,读者会不会在节的边界处迷路?会 → 它承重,留;不会 → 它是仪式性噪声,稀释真正的内容,删。改写时要在两个失败模式之间走钢丝:一边是「跨节像换了一篇文章」,读者自己拼地图;另一边是路标泛滥,每节都「首先…值得注意的是…综上」,内容被埋。

边界提醒:本条只管节与节之间——引言的全文地图、每节的入口、节间的接缝、跨节的指与被指。同一段里句子怎么咬合、一节内部段落怎么排,不在这里动。

### 1. 引言末的 roadmap:一到两句,报「做了什么、得到什么」

放在引言最后,摊牌全文怎么组织。它不是目录复述,而是给读者一张「接下来会发生什么、值不值得往下读」的地图。两条硬规则:节名用 [@sec:x] 真锚(节号会漂,写死「第 3 节」迟早失配);每一节都带上它的**动作和产出**,而不是复读标题。

❌ This paper is organized as follows. Section 2 presents related work. Section 3 presents the method. Section 4 presents experiments. Section 5 concludes.
✅ [@sec:method] formalizes long-horizon prediction as constrained ranking and derives a closed-form reranker; [@sec:exp] shows it recovers 4 nDCG points on TREC-DL and BEIR; [@sec:disc] traces where and why the gains vanish.
🔍 只改一处:每个分句从「节名 + presents」升级为「节名 + 做了什么 + 得到什么」——信息增量是 roadmap 的存在理由,读者读完就知道值不值得往下看。

豁免:4 页左右的短文、或结构与领域惯例完全一致(引言—方法—实验—结论,无任何变体)时,roadmap 本身通不过删除测试,整个省掉。

### 2. 节首 frame:入口处先给地图,再落细节

每个新章节、每个超过三四段的小节,开头一句 frame:本节要做什么、按什么顺序展开。让读者带着预期读,而不是读到一半回头拼。

❌ (某节第一句)The threshold τ is set to 0.7. We compute the gradient of the surrogate loss using...
✅ We first define the threshold τ, then derive an upper bound on its estimation error, and finally show where the bound breaks. The threshold τ is set to 0.7 because...
🔍 只改一处:细节前插一句三步地图;细节本身一字未动。

生成 frame 的句骨:本节先___,再___,最后___。/ This section proceeds in three steps: ___, ___, and ___。frame 只写到节和大块小节的入口为止;一段内部要不要点明并列结构,不归这里。

### 3. 节间接缝:用上一节的结论当本节的动机

跨节最生硬的写法是「冷启动」——上一节刚给出结论,下一节第一句与它零关联,读者被迫自己猜这两节的关系。改法是在新节开头(可并入 frame 句)接住上一节的产出,并说明为什么它逼出了本节。

❌ (实验节开头)In this section, we describe our experimental setup.
✅ The bound in [@sec:method] holds only under Assumption 2; this section tests whether that assumption survives contact with real data.
🔍 只改一处:把「本节做什么」升级为「上一节留下什么缺口 → 本节补哪一环」,并用 [@sec:x] 把接缝钉死。

句骨:[@sec:___] 表明___,但___仍未回答;本节通过___补上这一环。/ Having established ___ in [@sec:___], we now ___。

注意接缝句仍要过删除测试:如果两节关系一眼可见(相邻的「相关工作→方法」),硬塞一句承上启下反而是噪声。

### 4. 跨节指与被指:每个指代落在真锚上

回指(向前文)与前指(向后文)都必须落在**真锚**,而不是让读者回翻猜位置。

❌ As mentioned earlier, training is unstable.
✅ As shown in [@fig:loss], training diverges after roughly 3k steps.
🔍 只改一处:模糊的 earlier 换成一跳即达的 [@fig:loss],顺手把「不稳定」落成可核对的现象。

三条配套规则:

- **前指是支票**。写了 we return to this limitation in [@sec:disc],就必须在那一节真的兑现;没兑现的前指比不写更伤读者信任。生成前指的同时,立即到目标节补上兑现句,一次改两处。
- **图表必须被正文点名**。每个 [@fig:x]、[@tbl:x] 至少在正文被叫到一次,并替读者读出它承载的论点:
  ❌ 从 [@tbl:main] 中可以看出很多东西。
  ✅ [@tbl:main] 显示,方法 A 在低资源设定下反超方法 B(38.1 vs 35.4)。
  🔍 只改一处:从「让读者自己看」改为读出这张表支撑的那一个论断——图表不是贴上去自证的,是被正文牵着手介绍给读者的。
- **回指按需**。只在概念首次出现已隔了几节、读者可能忘时才回指(Recall from [@sec:setup] that τ denotes ___);上一段刚讲过的不回指。

### 5. 剂量:少而准,不要机械

- **同层不泛滥**:一篇文章 roadmap 一处就够;不要每节结尾都「下一节我们将…」——那是把目录抄进正文,删。
- **序数壳只在真有顺序时用**:「首先/其次/再者」只在读者需要记住这条顺序时保留;标题和分段已把结构讲清时,删壳留肉。
- **预告克制**:前指少放,放了就兑现;回指只补在读者可能忘的位置。
- 一句能引导就别写一段:frame、接缝、roadmap 各自压到一到两句。

### 改写流程(对一篇既有稿子过一遍)

1. 看引言末:有 roadmap 吗?有 → 逐分句检查是否报「做了什么、得到什么」且用 [@sec:x];无 → 先做删除测试,通过才补。
2. 逐节看第一句:冷启动 → 补接缝句或 frame;已有 → 检查是否真的接住上一节的产出,还是只在报菜名。
3. 全文搜「如上所述/前面提到/上文/下文/见前/earlier/above/below/as mentioned」:逐个换成 [@sec:x]/[@fig:y]/[@eq:z] 真锚;换不出锚的,说明指代本身悬空,把那句话改写到有真锚可指为止。
4. 清点每个 [@fig:x]/[@tbl:x]:是否被正文点名并读出论点。
5. 清点所有前指:是否在目标节兑现。
6. 删除测试收尾:砍掉不承重的序数壳、重复预告与仪式性「综上」。

目标是一篇跨节读起来「始终知道自己在哪、且从不被提醒得心烦」的稿子。
