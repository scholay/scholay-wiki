export interface PlazaDataset {
  id: string;
  name: string;
  field: string;
  tagline: string;
  description: string;
  tags: string[];
  license: string;
  href: string;
  provider: string;
  scale: string;
  access: string;
}

export const PLAZA_DATASETS: PlazaDataset[] = [
  {
    id: 'imagenet',
    name: 'ImageNet',
    field: '计算机视觉',
    tagline: '大规模图像分类基准,覆盖 2 万余类、逾千万标注图片。',
    description:
      'ImageNet 是计算机视觉最常用的大规模图像分类基准之一。完整集合覆盖两万余个 WordNet 同义词集、逾千万张标注图片;常用的 ILSVRC 子集约 1000 类、128 万训练图,至今仍是预训练与迁移学习的标准起点。',
    tags: ['图像', '分类'],
    license: '研究使用',
    href: 'https://www.image-net.org/',
    provider: 'Stanford / Princeton',
    scale: '约 1400 万张图 · 2 万余类',
    access: '官网申请下载;ILSVRC 子集可经学术镜像获取。仅限非商业研究。',
  },
  {
    id: 'mimic-iii',
    name: 'MIMIC-III',
    field: '医学信息',
    tagline: '重症监护电子病历公开集,含生命体征、检验与临床笔记。',
    description:
      'MIMIC-III 收录 Beth Israel Deaconess 医疗中心 ICU 去标识病历,覆盖生命体征、用药、实验室检查与自由文本临床笔记。后续 MIMIC-IV 在同一框架上更新了年份与表结构,仍是临床 NLP 与预后建模的常用公开集。',
    tags: ['ICU', '病历'],
    license: 'PhysioNet',
    href: 'https://physionet.org/content/mimiciii/',
    provider: 'MIT LCP / PhysioNet',
    scale: '约 4 万次住院 · 2001–2012',
    access: '需完成 CITI 人类受试者培训,经 PhysioNet 资质审核后下载。',
  },
  {
    id: 'glue',
    name: 'GLUE',
    field: '自然语言处理',
    tagline: '九项英语理解任务的通用评测套件,BERT 时代的标准入口。',
    description:
      'GLUE 把 SST-2、MNLI、QQP 等九项英语理解任务收成一套排行榜,曾是 BERT 之后句子表征的默认评测入口。更难的 SuperGLUE 与各领域专用套件已出现,但 GLUE 仍适合作为 NLU 微调的第一站。',
    tags: ['NLU', '评测'],
    license: '各任务自有',
    href: 'https://gluebenchmark.com/',
    provider: 'NYU / UW / DeepMind',
    scale: '9 项英语任务',
    access: '官网或 Hugging Face datasets 直接拉取;提交成绩走官方评测服务器。',
  },
  {
    id: 's2orc',
    name: 'S2ORC',
    field: '学术文献',
    tagline: 'Semantic Scholar 开放研究语料,含全文解析与引用图。',
    description:
      'S2ORC 是 Semantic Scholar 开放的研究语料,提供论文元数据、解析后的全文、参考文献与引用图。适合文献挖掘、引用预测和科学领域语言模型预训练。',
    tags: ['论文', '引用'],
    license: 'ODC-By',
    href: 'https://github.com/allenai/s2orc',
    provider: 'Allen Institute for AI',
    scale: '数千万篇论文记录',
    access: 'GitHub 发布页申请并下载分片;遵守 ODC-By 署名要求。',
  },
  {
    id: 'uk-biobank',
    name: 'UK Biobank',
    field: '生物医学',
    tagline: '约 50 万人的基因型、影像与长期健康随访队列。',
    description:
      'UK Biobank 跟踪约 50 万英国参与者,整合基因型、多模态影像、血液生化与长期健康结局。是遗传流行病学、影像组学和多组学关联研究的核心队列,数据不能公开镜像。',
    tags: ['队列', '基因型'],
    license: '申请准入',
    href: 'https://www.ukbiobank.ac.uk/',
    provider: 'UK Biobank',
    scale: '约 50 万参与者',
    access: '注册研究项目、通过 Access Management System 审批后按项目下载。',
  },
  {
    id: 'pdb',
    name: 'Protein Data Bank',
    field: '结构生物学',
    tagline: '蛋白质与核酸三维结构的全球存档,实验测定条目持续更新。',
    description:
      'Protein Data Bank 是蛋白质、核酸及其复合物三维结构的全球存档,条目来自 X 射线、冷冻电镜和核磁等实验。RCSB PDB、PDBe、PDBj 同步镜像,并提供序列/结构检索与可视化。',
    tags: ['结构', '蛋白'],
    license: '公开',
    href: 'https://www.rcsb.org/',
    provider: 'wwPDB / RCSB',
    scale: '20 万+ 实验结构条目',
    access: '网站浏览或 FTP/HTTPS 批量下载;无需申请。',
  },
  {
    id: 'common-crawl',
    name: 'Common Crawl',
    field: '网络语料',
    tagline: '定期抓取的开放网页快照,大规模预训练语料的常见来源。',
    description:
      'Common Crawl 定期抓取公开网页并免费提供 WARC / WAT / WET 快照,是 GPT 类模型网页语料的常见上游。使用时需自行去重、语言识别,并遵守站点 robots 与版权约束。',
    tags: ['网页', '预训练'],
    license: '公开',
    href: 'https://commoncrawl.org/',
    provider: 'Common Crawl Foundation',
    scale: 'PB 级周期性快照',
    access: 'S3 / HTTPS 按月快照下载;计算端需自行准备过滤流水线。',
  },
  {
    id: 'openalex',
    name: 'OpenAlex',
    field: '学术文献',
    tagline: '开放学术知识图谱:论文、作者、机构、期刊与主题。',
    description:
      'OpenAlex 是 MAG 停更后的开放学术知识图谱,覆盖论文、作者、机构、期刊与主题,并提供 REST API 与完整数据快照。适合做文献计量、机构画像和开放引用分析。',
    tags: ['文献', '图谱'],
    license: 'CC0',
    href: 'https://openalex.org/',
    provider: 'OurResearch',
    scale: '2 亿+ 作品记录',
    access: 'API 免费(需礼貌限速);完整快照可从官方文档下载。',
  },
];
