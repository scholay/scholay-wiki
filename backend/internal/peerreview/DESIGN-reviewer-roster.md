# 审稿人 skill 库 roster 设计(待审定)

> 状态:**设计待审定**(2026-06-02)。源库 = `/Users/youngp/mypro/openscholay/academic-skills-a/academic-skills-done`(206 顶层 + 多个子目录,高质量审稿/领域 skill)。
> 审定后再按此造文件。**不动后端/compose/DB**(只往 `agent/data/claude/reviewer-skills/` 丢 SKILL.md + restart agent;backend 每次审稿实时重扫目录)。

## "审稿人 = 一个或多个 skill" 的落法

我们的模型:一个审稿人 = 一个 `rv-<slug>/SKILL.md`,两层两阶段:
- **frontmatter + 选择期 blurb** —— Skill-开 的方法论/选择轮读(可命名源 skill/工具)。
- **`<<<SCORING_PERSONA>>>…<<<END_SCORING_PERSONA>>>`** —— backend 原样读出注入 **Skill-关** 的评分轮,**lint 强制无 skill/invoke/agent/mcp__ 字样**。

因此"一个审稿人由一个或多个 skill 组成"= **作者时合成**:写每个 rv-* 时,把一个或多个源 skill 的关注点/红线/严重度词汇**蒸馏进一段自包含的 SCORING_PERSONA**(~200-400 字)。运行时不做 skill 解析。运行时的"多 skill"价值只在选择轮(Skill-开):reviewer-roster 选 slug、被选审稿人可用 Read + minicod 做实时文献核查。

## 通用审稿人 ×5(`fit_subjects=[]`,永远兜底)

| slug | 名称 | 蒸馏自 |
|---|---|---|
| `rv-methodology` | 方法学严苛派 | academic-paper-reviewer(Methodology persona)+ peer-review(A/B/C/D 严重度)+ scientific-critical-thinking + statistical-analysis + scholar-evaluation + quant-experiment-review |
| `rv-novelty` | 创新性与定位 | novelty-check(反谄媚/overlap%)+ academic-paper-reviewer(Domain/EIC)+ paper-claim-audit(夸大红线) |
| `rv-reproducibility` | 可复现性把关 | audit-reproducibility + paper-verification + critical-code-reviewer(三级严重度)+ experiment-audit |
| `rv-writing` | 写作与呈现 | paper-self-review(6 维 desk-reject)+ scholar-evaluation(写作/呈现维度)+ academic-paper-reviewer(Perspective) |
| `rv-integrity` 🆕 | 诚信/伦理/AI痕迹 | ethics-review(Belmont/Helsinki/IRB)+ paper-claim-audit + paper-verification(引用真支撑)+ COI + ai-check(AI 文本=风险非证据) |

> 注:现有 `rv-methodology`/`rv-reproducibility` 的 fit_subjects 要从 ML/CS **改成 []**(否则它们会跳过非定量论文,失去兜底作用)。`rv-theory` 现状是"近通用"(fit 列了 theory/math)——**待你定**留作第 6 个近通用还是改名 `rv-domain-theory` 当专科。

## 专攻审稿人 ×17(按 `fit_subjects` 匹配优先)

| slug | 领域 | 蒸馏自(节选) |
|---|---|---|
| `rv-domain-biomed` | 生物医学/临床 | peer-review(CONSORT/PRISMA/ARRIVE/STARD/SPIRIT)+ GRADE/RoB2/NOS + clinical-decision-support |
| `rv-domain-ml` | 机器学习/深度学习 | seven-pass-review + scikit-learn + shap + quant-experiment-review(泄漏/多重检验)+ experiment-audit |
| `rv-domain-nlp-llm` | NLP/LLM/可解释性 | transformer-lens + ai-peer-review(红队+arXiv 查重+禁造引用)+ experiment-audit(评测污染) |
| `rv-domain-cheminformatics` | 化学信息学/药物发现 | rdkit/deepchem/torchdrug/diffdock/medchem/pytdc(标准划分)/molfeat |
| `rv-domain-singlecell` | 单细胞/转录组 | scanpy/scvi-tools/harmony/celltypist/scvelo/mofa+/cellchat |
| `rv-domain-genomics` | 基因组/生信流程 | biopython/bwa/samtools/bcftools/plink2/snpeff/pydeseq2/gsea/crispr |
| `rv-domain-proteomics` | 蛋白质组/结构生物 | pyopenms/maxquant/matchms/esm/alphafold/uniprot/string |
| `rv-domain-materials` | 材料/计算材料 | pymatgen/dft(VASP)/molecular-dynamics/torch-geometric-gnn |
| `rv-domain-physics-sim` | 物理/流体/数值仿真 | fluidsim/molecular-dynamics/simpy/sympy(量纲一致)/jax |
| `rv-domain-astronomy` | 天文/天体物理 | astropy/jax-bandflux/gwosc/nasa-ads |
| `rv-domain-quantum` | 量子计算/QML | qiskit/cirq/pennylane/qutip |
| `rv-domain-clinical-ai` | 临床AI/医学影像 | pyhealth/clinical-decision-support/pydicom/biosig-ecg/decision-curve/external-validation |
| `rv-domain-rct` | RCT/实验设计 | rct-core-design/power-calc(MDE/ICC)/randomization/RoB2/preregister |
| `rv-domain-econometrics` | 计量经济/因果推断 | causal-inference(DiD/IV/RDD/SCM)/panel-data/r-econometrics/regression-diagnostics |
| `rv-domain-biostat` | 生物统计/预测模型 | statistical-analysis/pymc(R-hat/先验敏感)/cox/外部验证/校准曲线/PROBAST |
| `rv-domain-evidence-synthesis` | 系统综述/Meta分析 | meta-analysis/systematic-review-screener/funnel/RoB/PROSPERO/QUADAS-2/PROBAST |
| `rv-domain-epidemiology` | 流行病/药物警戒 | FAERS 失衡分析/孟德尔随机化/NHANES/QTL 共定位/NOS |

> 故意**没放**:geospatial(地理空间)、robotics/embodied-AI —— 若在范围内可加。

## 选择逻辑(specialized-first → general-fallback)

**不进后端 Go**(后端只 menu + 校验 + 兜底),全在选择轮(Skill-开)用 prompt/skill 文本实现:
1. **reviewer-roster/SKILL.md body** 加策略:判断论文领域 → Glob+读全部 rv-* 的 fit_subjects → **先用 fit_subjects 与本文学科有交集的 rv-domain-* 填槽(最匹配优先),剩余槽用通用审稿人(fit=[])按互补性补满;若无任何领域匹配 → 选 3 个最相关的通用审稿人**。禁选 3 个同质。
2. **buildMethodologyPrompt 菜单分两组**:`【领域专家(优先按本文领域匹配)】`(rv-domain-*,显示 domain+fit_subjects)+ `【通用审稿人(无匹配兜底)】`(fit=[])。`reviewerMenuEntry` 加 fit_subjects 字段以便分组展示。
- 机制不变:agent 仍输出末尾 ```json `{reviewers:[{slug,why_chosen}]}` 恰好 3 个;parseSelection/resolveReviewerChoices 装载+校验+兜底不变。

## 改编要点(造文件时)

- SCORING_PERSONA = identity(`你是一位…审稿人,强项:…`)+ 3-5 条编号审稿重点 + 收尾语气/二级严重度(`影响结论成立(致命)` vs `可改进`),~200-400 字,镜像现有 rv-methodology。
- **lint 雷区**:段内禁 `skill/task/agent/subagent/invoke/mcp__/调用skill|技能`(`\bagent\b` 会命中裸 "agent"→写"审稿人");**别写源 skill 名**(写"数据泄漏检查"不写"paper-claim-audit")。**标准名是纯文本可保留**(CONSORT/PRISMA/QUADAS-2/RoB2/GRADE/Belmont)。minicod/检索措辞 OK。
- frontmatter:name==目录名(`^rv-[a-z0-9-]+$`)、user-invocable:false、disable-model-invocation:false、model:opus、effort:high(rv-writing medium)、allowed-tools: Read + 相关 mcp__minicod__*、domain 自由文本、**fit_subjects 是选择驱动**(通用必须 []、专科列具体小写连字符 tag)。
- sentinel 上方的"选择期 blurb"无约束(可命名源 skill),写"reviewer-roster 在论文涉及 X 时优先选我"。
- 上线:丢文件 → `python3 scripts/lint-reviewer-skills.py` 全绿 → `docker-compose restart agent`(skill 加载有 memoization);backend 实时重扫无需重启。

## 受控学科词表(canonical fit_subjects,已定)

所有专攻审稿人的 `fit_subjects` **只能用下列规范 tag**(小写连字符);通用审稿人 `fit_subjects: []`。
方法论/选择轮里,reviewer-roster 让 agent 把本文映射到这些 tag 再与各专攻 fit_subjects 求交集。

```
# 计算机/AI
machine-learning deep-learning artificial-intelligence reinforcement-learning representation-learning optimization ml-systems
natural-language-processing large-language-models computational-linguistics interpretability mechanistic-interpretability
computer-vision speech robotics embodied-ai
computer-science systems distributed-systems databases networking security software-engineering
# 生命科学/医学
medicine clinical-medicine surgery oncology cardiology neuroscience radiology public-health nursing immunology pharmacology
biology life-sciences molecular-biology cell-biology genetics microbiology
single-cell scrna-seq transcriptomics spatial-transcriptomics multi-omics
genomics bioinformatics gwas variant-calling rna-seq epigenomics computational-biology statistical-genetics
proteomics mass-spectrometry structural-biology protein-structure protein-language-models ppi
clinical-ai medical-imaging health-informatics ehr clinical-decision-support digital-health
epidemiology pharmacovigilance genetic-epidemiology mendelian-randomization drug-safety observational-epidemiology
# 化学/材料/物理
cheminformatics drug-discovery computational-chemistry medicinal-chemistry molecular-docking qsar
materials-science computational-materials condensed-matter dft molecular-dynamics crystallography materials-informatics
physics fluid-dynamics cfd computational-physics numerical-methods simulation applied-mathematics
astronomy astrophysics cosmology gravitational-waves observational-astronomy
quantum-computing quantum-information quantum-machine-learning quantum-algorithms
# 社科/经济/统计/方法
econometrics causal-inference economics empirical-economics panel-data policy-evaluation quantitative-social
biostatistics survival-analysis prediction-models clinical-prediction prognostic-modeling
systematic-review meta-analysis evidence-synthesis risk-of-bias-assessment
randomized-controlled-trial clinical-trial experimental-design intervention-study
statistics theory mathematics theoretical-computer-science algorithms
qualitative-research social-science
```

(注:`theory/mathematics/...` 既可作 rv-theory 的近通用 fit,也供将来 rv-domain-theory 用。)

## 待你拍板

1. **专科数量**:全 18(biomed + 17 新)还是收到 ~12-15 核心?(可砍/合并:physics-sim 并入 materials、epidemiology 并入 biostat/evidence-synthesis、astronomy/quantum 若不在范围则砍)。要不要加 geospatial / robotics?
2. **subject-tag 词表**:先定一份**受控词表**(与方法论阶段 agent 推断论文学科对齐 → 匹配可靠)还是先用自由 tag(快但匹配较模糊)?
3. **rv-theory**:留作第 6 个近通用,还是改 `rv-domain-theory` 当专科?
4. **rv-integrity** 新通用是否要(把伦理从 biomed 抽成横切),还是伦理只留 biomed 内?
5. 重叠去重(biostat↔methodology、clinical-ai↔biomed、econometrics↔biostat、evidence-synthesis↔epidemiology)是否靠 prompt 互补规则即可,还是要硬互斥?
6. AI 检测:折进 rv-integrity(风险非证据)够不够,还是独立 / 移出审稿?
