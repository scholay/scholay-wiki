---
name: wl-rl-reproducibility
description: 帮作者把方法/可得性/材料写到"陌生同行照着能独立重跑":样本量依据·随机化盲法·软件版本(方法管道)+数据代码DOI/许可/拒绝available-on-request(可得性)+RRID/accession/版本(溯源),缺项就地插TODO占位,绝不编数或编号。
when_to_use: 症状域=「别人照着做不出来 / 材料拿不到、认不准」时叠加。

找我(可观测症状):① 读者或审稿意见说"照你的方法重跑不出来 / 说不清怎么复现";② 方法段出现"足够/适当/标准的方法/必要的预处理"这类空心词,动词后没有可核对的参数(招多少、按什么阈值剔、用哪个检验、种子几);③ 声称开源却只写"available on request",或只贴 GitHub 链接、没版本没 DOI 没许可;④ 列了试剂/细胞系/抗体/数据集/软件/模型却缺目录号、RRID、accession 或版本号;⑤ 全文缺 data/code availability 声明或声明是空头支票。

不归我(去别处):检验选得对不对、统计推断是否成立 → 统计/方法严谨性视角;结论是否超出证据支撑、因果话说过头 → 主张-证据匹配视角;伦理审查与知情同意的论证是否充分 → 研究伦理视角;句子读不顺、术语没定义 → 写作清晰度视角。一句话分界:我只管"能不能被重跑、材料能不能被拿到并确认是同一个",不管"做得对不对、结论站不站得住"。
menu: 别人照着做不出来:方法/数据代码/材料
axis: rigor
---

<<<LENS>>>
【可复现三件套 · 自查清单】判据只有一句:一个从没接触过你数据的同行,拿你的方法段加公开材料、不联系你,就能独立重跑并得到统计相容的结果。逐条判是/否,答"否"就地插 `[TODO: …]` 精确标出缺口去补——绝不用"足够/适当/标准/必要"糊,也绝不替作者编一个数或一个编号。

一 · 方法管道(采集/生成了数据才查):
□ 样本量给了依据?(功效分析:α、目标功效、预期效应量→最小n;或明确的可得性约束)否→插TODO,别只写 n=120
□ 随机化写了单位+方法(区组/分层)+谁生成序列+分配是否隐藏?
□ 盲法写了谁不知情(参与者/操作者/评定者),或明写"未设盲"及因由?
□ 纳入/排除+从初始到最终的流转数(N→n)?
□ 确切检验名+软件及版本(写"双侧配对 $t$ 检验"+R 4.3.1,不写"做了统计分析")?
□ 预处理规则与顺序(先剔除还是先变换会改结果)?
□ 计算类:超参+优化器+学习率+写死的种子+运行次数+算力?

二 · 数据/代码可得性(有可共享材料时):
□ 落在带 DOI 的仓库/accession(Zenodo/GEO/SRA/PDB),不是个人主页网盘?
□ 版本钉到 release tag(v1.2.0)或 commit 哈希,不是"最新版"?
□ 每份材料写了许可(数据 CC0/CC-BY,代码 MIT/Apache-2.0/GPL)?
□ 有没有"available on request"?约93%不兑现=等于没声明,改成不依赖作者本人的获取途径
□ 环境钉死版本(numpy==1.26.4 非 numpy)+种子+构件对应(哪脚本重生成哪图)?
无可共享数据也明写"本研究未产生新数据集"。

三 · 材料溯源(关键试剂/细胞系/抗体/数据集/软件/模型):
□ 来源:厂家+目录号+批号(lot)/accession?
□ 唯一标识:RRID:AB_… / CVCL_… / SCR_…、Addgene#、GEO/PDB 真号(非占位)+锁版本?
□ 鉴定:细胞系 STR+支原体阴性+传代;抗体克隆号+稀释比+验证;模型架构+训练数据+权重可得性?
细节收进关键资源表,正文只留叙事。
<<<END_LENS>>>

### 判据:能不能被独立重跑
可复现的判据只有一句:一个从没接触过你数据的同行,拿你的方法段加公开材料、不联系你,就能独立重跑一遍并得到统计上相容的结果。三件套(方法管道、可得性、材料溯源)是这句判据的三个断链点——方法写全了但数据拿不到,断;数据拿到了但试剂是哪一批不知道,断;试剂标识全了但预处理顺序没写,还是断。逐条自查,答"否"的地方就是断链处:能补数就补,补不了就地插 `[TODO: …]` 精确标出缺口,绝不用空心词糊,也绝不替作者编数或编号。一个诚实的占位比一句听着完整实则空心的话有价值——它提醒作者回填,避免下一轮才发现漏洞。

### 一 · 方法管道:把动词还原成参数
逐句扫方法段,把每个模糊动词摊成"谁·对什么·用什么规则或数值·得到什么流转数"。摊不开的,要么补数要么插 TODO。

**样本量+依据**(最常被省、最要命):
- 坏:我们招募了足够数量的被试。
- 好:样本量由功效分析确定——以 $\alpha=.05$、双侧、目标功效 $.80$、基于前测的中等效应 $d=0.5$,每组需 64 人;计入 15% 流失,最终每组招募 75 人。

**确切检验+软件版本**:
- 坏:使用 SPSS 对数据进行了统计分析,结果显著。
- 好:组间差异用双侧独立样本 $t$ 检验评估($\alpha=.05$);方差齐性先用 Levene 检验核验,不齐改用 Welch 校正。分析在 R 4.3.1(stats、car 3.1-2)中完成。

**预处理**(顺序也要写,先剔除还是先变换会改结果):
- 坏:对数据做了必要的预处理。
- 好:预处理按序进行:先剔除响应时间 <200 ms 或偏离均值 3 个标准差以上的试次(占 2.1%),再对右偏反应时做对数变换,最后按每被试均值填补缺失值。

**超参+随机种子**(计算类):
- 坏:模型用标准超参训练至收敛。
- 好:模型用 AdamW(学习率 $2\times10^{-4}$、权重衰减 0.01)训练 20 个 epoch,batch 32;随机种子固定为 42;每配置独立跑 5 次,报告均值 ± 标准差,硬件为单张 A100。

**随机化+盲法**:
- 坏:被试被随机分到两组,实验在双盲下进行。
- 好:被试按计算机生成的随机序列(区组大小 4、按性别分层)分到干预组或对照组;序列由不参与招募的研究者生成,分配信息密封至干预结束。参与者与结果评定者对分组均不知情;因干预形式可辨,操作者未设盲。

**纳入/排除+流转数**:把招入条件、剔除条件、从初始到最终的流转一条线写清(N=180 筛选 → 12 不合标准 → 8 中途退出 → n=160 进入分析)。

### 二 · 数据/代码可得性:FAIR,不留空头支票
每句过一遍"我现在照着做,能到手吗"。判据 FAIR:有持久标识、有明确途径与许可、标准格式、有版本环境说明。凡把最后一步落在"作者善意"上的都是空头支票。

**URL≠存档**:数据存带 DOI 的仓库(Zenodo/Dryad/OSF;领域给 accession:GEO/SRA/PDB/GenBank),别用个人主页网盘(会失效)。代码:GitHub 是活的开发地址,发表时打一个 release、把 tag 快照推 Zenodo 换 DOI,URL 与 DOI 都给;版本钉到 release tag(v1.2.0)或 commit 短哈希,别"最新版"。

**每份材料给许可**:无许可=默认保留所有权利,读者法律上不能重用。数据 CC0/CC-BY,代码 MIT/Apache-2.0/GPL,把许可名写进声明。

**拒绝 available on request**:大规模复查显示承诺"可向作者索取"的约 93% 不兑现,与没声明等效。当作**未完成**处理:能公开就直接给地址;不能全公开也给一条不依赖作者本人的受控途径。
- 弱:*Data are available from the corresponding author upon reasonable request.*
- 强:*The processed dataset (n = 1,240) is archived at Zenodo (https://doi.org/10.5281/zenodo.〈id〉) under a CC-BY-4.0 license. Raw sequencing reads are deposited in the Sequence Read Archive under accession 〈PRJNA…〉.*
- 弱(代码):*Our code is available on GitHub.*
- 强:*Analysis code is available at https://github.com/〈lab〉/〈project〉 (release v1.2.0, commit a1b2c3d) and archived at Zenodo (https://doi.org/10.5281/zenodo.〈id〉) under the MIT license. A Dockerfile pinning all dependencies (Python 3.11, PyTorch 2.1.0) and the fixed random seeds are included.*

**敏感/涉人数据=切换受控通道,不是终止句**:给去标识衍生数据 + 正式受控获取(EGA/dbGaP + DUA + 审批时长 + 伦理批号),必要时附合成数据让读者跑通流程。
- 弱:*Patient data cannot be shared due to privacy concerns.*
- 强:*Individual-level clinical data cannot be shared publicly to protect participant privacy. De-identified data underlying the main analyses are available via controlled access through the European Genome-phenome Archive (accession 〈EGAS…〉), subject to a Data Access Agreement approved by the Data Access Committee; requests are typically reviewed within 〈N〉 weeks. The study was approved by 〈IRB/伦理委员会〉 (protocol 〈#〉).*

**环境要能重跑**:依赖钉死版本(写 numpy==1.26.4 不写 numpy)、随机种子、硬件/OS;写清构件对应(*`bash run_all.sh` regenerates Figures 2–4 and Table 1; seeds are fixed in `config.yaml`*)。

### 三 · 材料溯源:每个关键资源过三关
**先圈"关键"**:换一个来源/批次/版本会不会改变结论?会,就是关键——抗体、细胞系、模式生物、质粒、核心试剂盒、数据集、分析软件、模型;缓冲液常规化学品可略。每个关键资源过三关:
① **来源(可得性)**:厂家 + 目录号 + 批号(lot,尤其抗体/血清批间差大),化学品加 CAS 号,质粒给 Addgene#。自制材料落到具体保藏地/联系人,别只撂"available on request"。
② **标识(唯一)**:抗体 RRID:AB_…、细胞系 CVCL_…、软件/数据库 SCR_…、质粒 Addgene#、数据集仓库+登录号(GEO GSE…/SRA PRJNA…/PDB 四位码/Zenodo DOI)并锁版本。**登录号必须是已公开可访问的真号,不是占位。**
③ **鉴定(表征)**:细胞系 STR 鉴定+支原体阴性+传代数(≤Pxx);抗体克隆号+宿主+稀释比+验证方式;试剂纯度%/级别;模式生物品系+性别+周龄+遗传背景;数据集样本量+纳排+采集窗;模型架构+参数量+训练数据来源规模+许可+权重是否公开(模型卡/数据卡意识)。

**归拢成一张关键资源表**,正文只留"怎么用、为什么这样用"的叙事:
`| 类别 | 名称 | 来源(目录号/批号) | 标识符 | 关键备注 |`
图若展示某试剂结果,题注点回表中条目,用 [@tbl:resources] 交叉引用。

**before→after,逐类各一**:
- 抗体坏:*Western blots were probed with an anti-GAPDH antibody.* 好:以 anti-GAPDH(Abcam ab8245,RRID:AB_2107448,小鼠单克隆 6C5,1:5000)孵育;敲除样本无信号,证实特异性。
- 细胞系坏:*Experiments used HEK293 cells.* 好:HEK293T(RRID:CVCL_0063;STR 鉴定与来源一致,支原体阴性,使用 P8–P18)。
- 数据集坏:*We downloaded a publicly available RNA-seq dataset.* 好:分析 GEO GSE134420(SRA PRJNA555637)中 24 例乳腺癌 RNA-seq;剔除 2 例文库量 <10M reads,余 22 例入分析。
- 软件坏:*Statistical analyses were performed in R.* 好:统计在 R 4.3.1 完成,用 lme4 1.1-35(RRID:SCR_015654)拟合混合模型;分析脚本存于 Zenodo(DOI:10.5281/zenodo.〈id〉)。
- 模型坏:*We fine-tuned a pretrained language model.* 好:以 BERT-base(110M 参数,BookCorpus+英文维基预训练)为底,在本文语料(§2.1,4.2 万句)上微调;权重与训练配置公开于 Zenodo(DOI:〈id〉),含数据构成与已知偏差说明。

### 占位纪律
只要作者没提供某个关键项,别用"采用了恰当的方法"这类听着完整实则空心的话糊过去,也别替作者凭空编数或编号——就地插带标签的占位,如 `[TODO: 报告随机化的具体方法与分配是否隐藏]`。声明段留占位待用户核实,绝不填一个看起来像真的 DOI/accession/伦理批号。

### 声明段模板(留占位待填)
> **Data availability.** The data supporting this study are openly available at 〈仓库+DOI/accession〉 under 〈许可〉. 〈受限一句:… available via controlled access through 〈受控库〉 subject to 〈DUA/条件 + 审批时长〉.〉
> **Code availability.** Code is available at 〈URL〉 (〈release/commit〉) and archived at 〈DOI〉 under 〈许可〉. The computational environment is specified in 〈Dockerfile/依赖清单〉; 〈脚本〉 reproduces 〈图/表〉.

### 阈值与例外
- "足够/适当/标准/必要/一定程度上"在方法段几乎总是信息黑洞,一律换成数值或明确规则。
- 纯理论/思辨/形式证明类没有实证管道,不必硬塞;综述/二手数据写它的可复现版(数据库、检索式、时间窗、PRISMA 式 N→n),同样一项不落。
- 没有可共享数据/代码也要明写"本研究未产生新数据集/代码"或"数据为第三方持有,不可再分发",别留空。
- 找不到 RRID:先在 antibodyregistry / Cellosaurus / SciCrunch 检索,确无再注册一个,别因"没有"就省掉标识这一维。
- 某项确实不适用(如无对照就谈不上分配隐藏),明写"不适用"并附一句因由,别留空让读者替你猜是漏了还是不需要。
