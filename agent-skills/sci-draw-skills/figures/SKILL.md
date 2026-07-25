---
name: figures
description: 把信号通路/机制/细胞过程/流程图输出成「细胞图配方 JSON」(隔室+实体+关系,无需坐标),系统渲染成分层隔室的论文级 SVG。当用户要画这类"图解结构"的科研图时遵循本技能。
when_to_use: 当用户要画信号通路、分子机制、细胞过程、代谢通路、免疫/发育机制、实验流程、技术路线、关系图等"图解结构"的科研图时。
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep
---

# 科研绘图 · 细胞图配方(compartment spec)

你**不画坐标、不画 SVG**。你只输出一份**结构化配方 JSON**(有哪些隔室、每个隔室里有哪些实体、实体之间什么关系),写到 `out/<名字>.fig.json`。系统的确定性渲染器会把它排成**分层隔室的论文级细胞图 SVG**(细胞外/膜/胞质/核 分层背景 + 专业图标按生物位置摆 + 信号箭头 + elkjs 自动布局)。

> 这样你专注**生物学结构**(你擅长),布局/图标/箭头/坐标全交给渲染器(它擅长)——出来的是"细胞图"而不是"流程图"。

⚠️ **铁律:产物是 `out/<名字>.fig.json`(配方 JSON),不是 .svg、不是坐标图。绝不自己写坐标或 SVG。**

## 三步走(照做)

1. **列隔室**:这张图涉及哪些"空间区域"?常见:`extracellular`(细胞外)、`membrane`(细胞膜)、`cytoplasm`(细胞质)、`nucleus`(细胞核),还可有 `organelle`(线粒体/内质网等细胞器)、`region`(泛用分区,给非细胞图/流程图用)。**信号通路几乎都有 膜 + 胞质 + 核**。
2. **把实体放进隔室**:每个实体(配体/受体/激酶/分子/转录因子/基因…)属于哪个隔室?**有对应图标就填 iconKey**(见下方目录),没有的抽象激酶/复合物只填 label + color。
3. **连关系**:实体间 edges(谁激活/抑制/转运谁),按信号流方向 source→target。

## 配方 schema(严格照此,写到 out/<名字>.fig.json)

```json
{
  "title": "RTK–RAS–MAPK 信号通路",
  "subtitle": "Receptor Tyrosine Kinase → MAPK Signaling",
  "compartments": [
    { "id": "ext",  "kind": "extracellular", "label": "细胞外 · Extracellular" },
    { "id": "mem",  "kind": "membrane",      "label": "细胞膜" },
    { "id": "cyto", "kind": "cytoplasm",     "label": "细胞质 · Cytoplasm" },
    { "id": "nuc",  "kind": "nucleus",       "label": "细胞核 · Nucleus" }
  ],
  "entities": [
    { "id": "gf",   "compartment": "ext",  "iconKey": "protein", "label": "生长因子" },
    { "id": "rtk",  "compartment": "mem",  "iconKey": "membrane_receptor", "label": "RTK 受体" },
    { "id": "grb2", "compartment": "cyto", "label": "GRB2/SOS", "color": "blue" },
    { "id": "ras",  "compartment": "cyto", "label": "RAS-GTP", "color": "green" },
    { "id": "raf",  "compartment": "cyto", "label": "RAF", "color": "green" },
    { "id": "mek",  "compartment": "cyto", "label": "MEK", "color": "green" },
    { "id": "erk",  "compartment": "cyto", "label": "ERK", "color": "orange" },
    { "id": "tf",   "compartment": "nuc",  "label": "转录因子", "color": "purple" },
    { "id": "dna",  "compartment": "nuc",  "iconKey": "dna", "label": "靶基因" },
    { "id": "gene", "compartment": "nuc",  "label": "IL-2 等基因", "color": "purple" }
  ],
  "edges": [
    { "source": "gf",   "target": "rtk",  "label": "结合" },
    { "source": "rtk",  "target": "grb2", "label": "磷酸化招募", "type": "activate" },
    { "source": "grb2", "target": "ras" },
    { "source": "ras",  "target": "raf" },
    { "source": "raf",  "target": "mek" },
    { "source": "mek",  "target": "erk" },
    { "source": "erk",  "target": "tf",   "label": "入核", "type": "transport" },
    { "source": "tf",   "target": "gene" }
  ]
}
```

**字段说明**:
- `compartments[].kind`:`extracellular` / `membrane` / `cytoplasm` / `organelle` / `nucleus` / `region`。系统按生物学顺序(外→膜→胞质→细胞器→核)自动分层排布。**膜隔室**会自动画成脂双层。
- `entities[]`:`compartment` = 所属隔室 id;**`iconKey`**(强烈优先,见目录)或 `label`(无图标的实体);`color` ∈ `blue/green/orange/purple/yellow/red/teal/gray`(给无图标节点上色,同类同色)。
- `edges[]`:`source`/`target` = 实体 id;`label` = 边文字(≤5字);`type` ∈ `activate`(实线箭头,默认)/`inhibit`(T 形抑制)/`transport`(虚线,入核/转运)。

## 铁律:图标优先(这是"细胞图 vs 流程图"的关键)

**凡是有匹配 iconKey 的实体,一律填 iconKey,别只用 label 方框。** 一张通路/机制图应有 **≥4 个带 iconKey 的实体**。高频映射:

| 实体 | iconKey | | 实体 | iconKey |
|---|---|---|---|---|
| 膜受体 | `membrane_receptor` | | 细胞核 | `nucleus` |
| 配体/生长因子 | `protein` | | DNA/基因 | `dna` |
| T/B 细胞 | `tcell`/`bcell` | | 线粒体 | `mitochondria` |
| 巨噬细胞 | `macrophage` | | 内质网 | `endoplasmic_reticulum` |
| 抗体 | `antibody` | | 核糖体 | `ribosome_2` |
| 离子/Ca²⁺ | `ion` | | ATP | `atp` |
| 磷脂 | `phospholipid` | | 病毒 | `virus_particle` |
| 神经元 | `pyramidal_neuron` | | 细菌 | `generic_bacterium` |

**内置图标目录**(填 iconKey 用):
- 细胞/免疫:`generic_cell` `tcell` `bcell` `macrophage` `red_blood_cell` `neuron`/`pyramidal_neuron` `virus_particle` `generic_bacterium` `bacteria_swimming`
- 细胞器/结构:`nucleus` `mitochondria` `endoplasmic_reticulum` `ribosome_2` `proteasome` `membrane_receptor` `phospholipid` `histone_complex` `nucleosome`
- 分子:`dna` `rna` `protein` `antibody` `atp` `glucose` `ion` `drug`/`drugs`/`pill` `restriction_enzyme` `crispr_cas9` `plasmid_vector` `single_stranded_dna`
- 器材/其他:`test_tube` `flask`/`erlenmeyer_flask` `petri_dish` `syringe` `microscope` `qpcr_machine` `lab_mouse` `patient` `magnifying_glass`
- 器官示意:`heart` `kidney` `lung` `brain` `liver`

## few-shot:先看金标

**复杂图先 `Read` 本技能目录下 `examples/pathway.fig.json`(信号通路金标配方)**,照着它的隔室划分、图标用法、edge 类型来写你的配方。

## 非细胞图(纯流程/关系图)怎么办

没有细胞空间语义的图(实验流程、技术路线、决策流程),用**一个** `region` 隔室把所有步骤放进去,靠 edges 表达顺序/关系即可,系统会自动流式排布。能用图标的步骤(如"测序仪""小鼠""试管")照样填 iconKey。

## 硬约束

- **图标优先**(见上);无图标实体才用 label+color。
- **不编造数据**:数值图表(散点/柱/KM 曲线)交 matplotlib 车道,别在这里编数。
- **IP/合规**:只画通用科学画风;**绝不**伪造病理/组织学/显微/放射/凝胶blot 等一手证据图(合成即造假,礼貌拒绝);写实肌理超出能力时老实说明是示意图。
- **路径铁律**:写到相对路径 `out/<名字>.fig.json`,**绝不** `/out/...`。JSON 必须合法。

## 工作流小结

1. 三步走:列隔室 → 实体进隔室(图标优先)→ 连关系。复杂图先 Read examples/pathway.fig.json。
2. `Write` 配方到 `out/<名字>.fig.json`。
3. 简述你画了什么 + 可以让你怎么改(加实体/换隔室/改关系/换配色)。
