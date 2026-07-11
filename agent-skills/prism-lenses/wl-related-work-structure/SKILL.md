---
name: wl-related-work-structure
description: 把相关工作一节从逐篇流水账改写(或起草)成"主题簇 + 每簇定位句 + 宽→窄→本文漏斗"的论证结构,消灭书目背诵式罗列
when_to_use: 相关工作一节出现这些可观测症状时找我:连续多句以"某某 et al."或引用键开头(A做X。B做Y。C做Z。);段落把别人的工作讲完就换段,通篇不出现"与之不同/然而本文";排序只是年份或会议顺序而本文贡献并非时间演进;读完整节仍看不出本文占的空位在哪。不归我的症状:担心漏掉强相关或同期工作、稻草人式贬低他人、基线对比是否公平——这些公正诚实问题去 wl-rl-related-work-fairness;单段内部的主题句/衔接问题去段落层的对应条目。
menu: 相关工作流水账/无定位句/不知怎么分组
axis: craft
---

<<<LENS>>>
生成动作:把相关工作一节改写(或起草)成"主题簇 + 每簇定位句 + 宽→窄→本文漏斗"的论证结构——按共享思路/假设分簇,簇内先给共性再给本文位置,消灭逐篇罗列。

核心 moves:
- 簇是论点不是收纳盒:每簇对应本文的一个对照面(这簇共享某假设,本文正在此点不同);撑不出共性、又与本文无对照的堆不单独成簇。
- 开簇句骨(可直接填):"处理___的方法多以___为共同思路 [@key1; @key2; @key3],其共同前提是___;这在___场景下失效(见 [@fig:x]/§_)。本文改用___,正面处理这一失效。"
- 簇间过渡句骨(收上簇、引下簇):"___绕开了上述___的代价 [@key1; @key2],却把___一并丢掉——而这正是___场景的硬约束。"
- 漏斗方向恒定宽→窄→本文:排序按"离本文由远及近",让空位读起来是被逼出来的,不是突然宣布的。

❌ Smith et al. [@smith] proposed a CNN for X. Jones et al. [@jones] used an LSTM. Chen et al. [@chen] applied a transformer. Our method uses a graph network.
✅ Neural approaches to X differ mainly in the encoder—convolutional [@smith], recurrent [@jones], or attention-based [@chen]—but share the assumption that labels are independent given the encoding, which breaks under long-range dependencies ([@fig:dep]). Our model reasons over an explicit dependency graph, targeting exactly this failure.
🔍 只改了一件事:三篇散点压成"共享同一假设"的一个簇,再用该簇的共同软肋接出本文位置——引用一个没删。

阈值:簇 3-5 个;每簇 2-5 句(共性 1 + 代表工作 1-2 + 局限/定位 1-2);单篇独占整句只留给最贴近的近邻工作。

别动/豁免:
- 本文贡献本身是"追溯演进/指出领域弯路"时,时间序即论证,保留年份排序。
- 综述型稿件分类法即贡献,簇可更多更细,但每簇仍要一句"为何这样切"。
- 已有清晰分组 + 定位句的段落别为改而改;定位句只陈述差异与位置,不夹带贬低。是否漏引、对比是否公平不归这里。
<<<END_LENS>>>

# 相关工作的结构:从名录到论证

相关工作不是文献名录,是一次论证:你要在读者心里搭出一张"已有方法的地图",然后指出地图上本文占据的那块尚未被填的空地。逐篇罗列之所以失败,是因为它把这项论证外包给了读者——你把一堆点扔在桌上,让读者自己连线、自己判断谁和谁一类、自己发现哪里有缝。分组 + 定位,就是替读者把这条线连好。

## 第一性原理

- **簇是论点,不是收纳盒**。每个主题簇的存在理由,是它对应本文的一个对照面:这簇方法共享某个思路或假设,而本文正是在这一点上不同。若一个簇既撑不出共性判断、又跟本文没有对照关系,它就不该单独成簇——降级成一句带过,或并入邻簇。
- **定位句是每簇的主题句**。段落层要求 claim-first;相关工作层同理:每簇先给"这簇是什么、共同软肋在哪",最后给"本文站在哪"。没有定位句的簇,等于把该簇的贡献白白背书了一遍,却没换来任何对本文的支撑。
- **漏斗方向恒定:宽 → 窄 → 本文**。读者读完应当觉得"空位是被逼出来的",而不是"作者读到最后突然宣布要做别的"。排序依据不是年份、不是字母序,而是"离本文由远及近"。

## 从零起草的顺序

1. 把要引的文献按"共享什么思路/假设"分堆(不是按作者、不是按年份)。
2. 给每堆写一句共性判断——写不出共性的堆,说明分错了,重分。
3. 给每堆写一句"本文站在哪":与这簇的差异点是什么、这个差异为什么重要。
4. 按"离本文由远及近"给簇排序,最贴近的近邻工作放最后、给最多篇幅。
5. 补簇间过渡句,让上一簇的局限自然引出下一簇(或引出本文)。

## 改写流水账的对症手法

**症状一:人名/引用键开头的句子三连。** 手法=合并进综合句:找出这几篇的公共维度(编码器不同?数据假设不同?),把差异压进插入语,把共性提成主句。
**症状二:段落讲完别人就换段,没有定位句。** 手法=复述部分不动,只在段尾补一句"共同前提 + 本文位置"(句骨见下)。
**症状三:排序是年份而本文贡献不是时间演进。** 手法=找出真正的对照轴(显式 vs 隐式?全局 vs 局部?),按该轴重排,同一批引用不增不删。

## before → after

### 例一:合并流水账(最常见)

❌ Smith et al. [@smith] proposed a CNN encoder for X. Jones et al. [@jones] used an LSTM for X. Chen et al. [@chen] applied a transformer to X. Wang et al. [@wang] combined convolution and attention. Our method uses a graph network.

✅ Neural approaches to X largely treat it as token-level labeling, differing mainly in the encoder—convolutional [@smith], recurrent [@jones], or attention-based [@chen; @wang]. What they share is a stronger assumption: that labels are conditionally independent given the encoding. This holds for short inputs but degrades under the long-range dependencies documented in [@fig:dep]. Our model instead reasons over an explicit dependency graph, targeting exactly this failure mode.

🔍 四篇压成"共享编码-独立假设"的一个簇(三个引用挤进一句综合句),给出共同软肋,再把软肋接到本文切入点——"our"从此有了逻辑接口。

### 例二:补定位句(最小改动)

❌ Data augmentation for low-resource NER has been explored via back-translation [@aug1], entity substitution [@aug2], and LLM-based synthesis [@aug3]. These methods report consistent gains on standard benchmarks.

✅ Data augmentation for low-resource NER has been explored via back-translation [@aug1], entity substitution [@aug2], and LLM-based synthesis [@aug3]. These methods report consistent gains on standard benchmarks—but all assume the entity inventory is fixed in advance. Our setting removes this assumption: new entity types arrive at test time, which is precisely where substitution-based augmentation collapses.

🔍 复述部分一字未动,只把结尾的中性总结续成"共同前提 + 本文位置"。定位句是这段唯一缺的东西。

### 例三:换排序轴(年份 → 对照轴)

❌ Early work used hand-crafted features [@f1]. Later, neural encoders were adopted [@n1]. Most recently, pretrained models dominate [@p1; @p2]. We also build on pretrained models.

✅ Approaches to X divide by where domain knowledge enters: hand-crafted features encode it explicitly [@f1], while neural and pretrained encoders learn it implicitly [@n1; @p1; @p2]—at the cost of controllability. We keep the pretrained backbone but reintroduce explicit knowledge as constraints, recovering what the implicit line gave up.

🔍 同一批引用,排序轴从时间线换成"知识显式/隐式"的对照轴——"We also"那种搭便车式结尾,变成了有明确差异点的定位。

### 例四:多簇 + 簇间过渡的整节骨架

> 处理 X 的工作可分为两条路线。**基于规则**的方法 [@r1; @r2] 精度高但需人工维护规则库,难以迁移到新领域。**数据驱动**的方法绕开了这一维护成本 [@d1; @d2; @d3],却把可解释性也一并丢掉——在 X 这类高风险场景里这是硬约束。本文取二者之间:用数据学习规则的权重,同时保留规则的可读形式。

注意"却把…一并丢掉"是簇间过渡句:同时收束上一簇、引出下一簇的对照;最后一句是横跨两簇的总定位。写多簇时每个簇间接缝都照此办理。

## 句骨库(留空直接填)

- 开簇:"处理___的方法多以___为共同思路 [@key1; @key2; @key3],其共同前提是___。"
- 收簇定位:"与之不同,本文___,针对的正是这一___(见 [@fig:x] / §_)。"
- 簇间过渡:"___解决了上述___的代价 [@key1],却引入了___——而这正是___场景的硬约束。"
- 近邻工作(可独占整句):"与本文最接近的是 [@key],它同样___;差别在于本文___,这使得___成为可能。"
- 时间线豁免场景专用:"从___到___的十年里,该领域经历了___的转向 [@key1; @key2];本文论证这一转向遗漏了___。"

## 阈值

- **簇数 3-5**:少于 3 通常分组太粗、看不出地图;多于 7 读者记不住,合并或降级为一句带过。
- **每簇 2-5 句**:共性判断 1 句 + 代表工作 1-2 句 + 共同局限/定位 1-2 句。
- **单篇独占整句是例外**:只留给最贴近本文的 1-2 个近邻工作;其余引用并进综合句。

## 别动 / 豁免

- **时间线组织**:仅当本文贡献本身是"追溯某方法的演进"或"指出领域走了弯路"时,时间顺序才承载论证——此时保留年份排序,别硬改成主题簇。
- **综述型稿件**:分类法本身即贡献,簇可以更多、更细,但每簇仍需一句"为何这样切"的判断句,而非无损列举。
- **已经清晰的段落**:已有分组 + 共性 + 定位句的段落,别为了套句骨而重写。
- **定位句的分寸**:定位只陈述"差异与位置"("与之不同,本文…"),不写成对他人工作的贬抑("their naive approach…")。至于是否漏掉了强相关或同期工作、对比基线是否公平、有无稻草人——那是公正诚实的范畴,不在这条里处理,别在结构改写时顺手动那些判断。
