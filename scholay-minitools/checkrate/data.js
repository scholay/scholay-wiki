/* 查重率 / AIGC 率合格标准速查 · 内嵌数据(蒸馏自 Scholay 学术百科,离线)
   ⚠️ 全部数值为行业常见区间,非全国统一标准。同校不同学院、不同年份都可能调整。
   一律以「本校研究生院/教务处最新文件、目标期刊投稿须知、官方数据库」为准。
   lineMax 为仪表盘用的数值(总重复率合格线上限,%),供渲染,非官方承诺值。 */
window.CHECKRATE_DATA = {
  scaleMax: 40, // 仪表盘量程(%)

  disclaimer: '以下红线均为行业常见区间,非官方统一标准。请以本校教务/研究生院最新文件、目标期刊投稿须知、官方检测系统结果为准;查重率与 AIGC 率是两套独立报告、两条红线,需分别达标。',

  groups: [
    {
      id: 'thesis', label: '毕业论文', icon: '🎓',
      items: [
        { id: 'zk', name: '专科 / 高职', sub: '专科毕业', lineMax: 30, zone: 'loose',
          total: '25–30%', noquote: '—', single: '—', aigc: '多数暂未强制,个别 ≤40%',
          system: '知网 PMLC / 维普 / 大雅',
          tip: '要求相对宽松,红线多为 30%;大段照搬教材/模板仍会超标,需改写。' },
        { id: 'bkp', name: '本科', sub: '普通院校', lineMax: 30, zone: 'loose',
          total: '20–30%', noquote: '按去引用后栏更接近原创度', single: '—', aigc: '≤30–40%,逐年收紧,部分 ≤20%',
          system: '知网 PMLC(含大学生联合比对库)/ 维普',
          tip: 'PMLC 独家收录往届本科生论文,抄学长学姐必中;最常见红线 20% 或 30%。' },
        { id: 'bk985', name: '本科', sub: '双一流·985/211', lineMax: 20, zone: 'mid',
          total: '≤15–20%', noquote: '—', single: '—', aigc: '≤20–30%(名校普遍收紧)',
          system: '知网 PMLC',
          tip: '名校多收紧到 15%,校优更低;合格 ≠ 稳过,还要过 AIGC 与盲审。' },
        { id: 'ssx', name: '硕士', sub: '学术型学硕', lineMax: 15, zone: 'mid',
          total: '≤10–15%', noquote: '文献综述章常单列 ≤5–10%', single: '—', aigc: '≤20–30%(超30%多警示)',
          system: '知网 VIP5.3 / TMLC2',
          tip: '学硕普遍 ≤15%,部分 985 ≤10%;单章与全文常分别卡线。' },
        { id: 'ssz', name: '硕士', sub: '专业型专硕', lineMax: 20, zone: 'mid',
          total: '≤15–20%', noquote: '—', single: '—', aigc: '≤20–30%',
          system: '知网 VIP5.3 / TMLC2',
          tip: '专硕可比学硕略放宽到 20%,但很多校学硕专硕同标准,以研究生院文件为准。' },
        { id: 'bs', name: '博士', sub: '学位论文', lineMax: 10, zone: 'strict',
          total: '≤5–10%', noquote: '部分要求去引用 ≤3% / 单章 ≤12%', single: '—', aigc: '≤10–20%(趋严)',
          system: '知网 VIP5.3 / TMLC2',
          tip: '最严,顶尖院校甚至要求近乎「全文无异常标红」;经院初审+校盲审+教育部抽检三级。' },
        { id: 'mba', name: 'MBA / EMBA', sub: '专业学位', lineMax: 20, zone: 'mid',
          total: '≤15–20%', noquote: '—', single: '—', aigc: '≤20–30%',
          system: '知网 VIP5.3 / TMLC2',
          tip: '多数商学院红线 15%,超 15–20% 即预警;案例、访谈实录引用需规范标注。' },
        { id: 'tdxl', name: '同等学力·在职', sub: '申硕/在职硕', lineMax: 20, zone: 'mid',
          total: '≤15–20%', noquote: '—', single: '—', aigc: '按主办校研究生院要求',
          system: '知网 VIP5.3',
          tip: '与全日制同系统同库,别以为在职就宽松;多数 ≤20%,个别 ≤15%。' },
        { id: 'crbk', name: '成人 / 自考本科', sub: '成教/函授/自考', lineMax: 40, zone: 'loose',
          total: '25–40%', noquote: '—', single: '—', aigc: '多数暂未强制',
          system: '知网 PMLC / 维普 / 大雅',
          tip: '红线普遍宽到 30%(个别 40%),但仍禁大段照搬;主考院校标准差异大。' },
        { id: 'xy', name: '校级优秀', sub: '评优', lineMax: 15, zone: 'strict',
          total: '<10–15%', noquote: '—', single: '—', aigc: '≤10–20%(评优加严)',
          system: '知网 VIP / PMLC',
          tip: '在合格线上再压一档:本科常 <15%、研究生 <10%;AIGC 超 20% 多不得参评。' },
        { id: 'yy', name: '院级优秀', sub: '评优', lineMax: 20, zone: 'mid',
          total: '<15–20%', noquote: '—', single: '—', aigc: '≤15–20%',
          system: '知网',
          tip: '略宽于校优但高于普通合格线;名额有限,卡得比通知写的更细。' }
      ]
    },
    {
      id: 'cnjournal', label: '中文期刊', icon: '📰',
      items: [
        { id: 'cnp', name: '普通期刊', sub: '普刊/学报', lineMax: 30, zone: 'loose',
          total: '≤20–30%', noquote: '—', single: '—', aigc: '部分刊开始要求 ≤20–30%',
          system: '知网 AMLC/SMLC · 维普 · 万方',
          tip: '普刊多 ≤30%,学报类常 ≤20%;不查重直投易因超标退稿。' },
        { id: 'kjhx', name: '科技核心', sub: '统计源核心', lineMax: 15, zone: 'mid',
          total: '≤10–15%', noquote: '—', single: '—', aigc: '编辑部逐步引入',
          system: '知网 AMLC(科技期刊库)',
          tip: '比普刊严;方法、公式等固定表述也算重复,需重述而非同义替换。' },
        { id: 'bdhx', name: '北大核心', sub: '北核', lineMax: 10, zone: 'strict',
          total: '≤10%', noquote: '—', single: '—', aigc: '部分要求提供 AI 使用说明',
          system: '知网 AMLC / 学术不端检测',
          tip: '多 ≤10%,热门刊卡更死;一稿多投、自我抄袭同样致命。' },
        { id: 'cssci', name: 'CSSCI', sub: '南大核心·C刊', lineMax: 10, zone: 'strict',
          total: '≤5–10%', noquote: '—', single: '—', aigc: '趋严,个别要求作者声明',
          system: '知网 AMLC(社科)',
          tip: '社科顶格,普遍 ≤10% 甚至 ≤5%;综述引用多的更要压单一来源占比。' },
        { id: 'cscd', name: 'CSCD', sub: '中科院·理科C刊', lineMax: 10, zone: 'strict',
          total: '≤5–10%', noquote: '—', single: '—', aigc: '编辑部酌情',
          system: '知网 AMLC(科技)',
          tip: '认可度仅次 SCI/EI;实验方法段落最易踩雷,须换成自己的表述。' },
        { id: 'review', name: '综述 / Review', sub: '中英文综述', lineMax: 20, zone: 'mid',
          total: '天然偏高,重点看去引用后', noquote: '以此栏为准', single: '单篇来源尽量 <3–5%', aigc: '—',
          system: '知网 / iThenticate',
          tip: '综述引用多、总重复必高,编辑更看「去引用后」和单一来源;别让某一篇撑爆。' }
      ]
    },
    {
      id: 'intljournal', label: '国际期刊', icon: '🌐',
      items: [
        { id: 'sci', name: 'SCI / SCIE', sub: '通用', lineMax: 20, zone: 'mid',
          total: '<15–20%', noquote: '—', single: '单篇来源 <3–5%', aigc: '多数要求披露 AI 使用',
          system: 'iThenticate(CrossCheck)',
          tip: '总 <20%、单篇来源 <3% 是通行安全线;方法/仪器描述重复多,可自引并改写。' },
        { id: 'q1', name: '顶刊 / 一区 Q1', sub: 'Top / Q1', lineMax: 15, zone: 'strict',
          total: '<10–15%', noquote: '—', single: '单篇来源 <2–3%', aigc: '严格披露,个别拒用 AI',
          system: 'iThenticate',
          tip: '建议总 <15%、单篇 <2%;对 self-plagiarism 和图表复用近乎零容忍。' },
        { id: 'ei', name: 'EI 期刊', sub: '工程索引', lineMax: 20, zone: 'mid',
          total: '<15–20%', noquote: '—', single: '单篇 <3%', aigc: '按出版商政策',
          system: 'iThenticate / Turnitin',
          tip: '与 SCI 量级相近,多 ≤20%;Elsevier/IEEE 各有红线,投前查 Guide for Authors。' },
        { id: 'conf', name: '学术会议', sub: 'EI / CPCI / IEEE', lineMax: 30, zone: 'mid',
          total: '<20–30%', noquote: '—', single: '单篇 <5%', aigc: '按会议 CFP',
          system: 'CrossCheck(iThenticate)',
          tip: 'IEEE 等常以 30% 为送审阈值、超 30% 不予收录;建议压到 25% 以内并规范引用。' }
      ]
    },
    {
      id: 'overseas', label: '国外院校', icon: '🏛️',
      items: [
        { id: 'ug', name: '本科', sub: 'Essay / Coursework', lineMax: 20, zone: 'mid',
          total: '一般 <15–20%(无固定红线)', noquote: '—', single: '—', aigc: 'Turnitin 可给 AI 分,政策各校不一',
          system: 'Turnitin',
          tip: '导师看的是「为什么重复」;直接引用要引号+出处,>20% 常触发人工核查。' },
        { id: 'pg', name: '硕士', sub: 'Dissertation', lineMax: 20, zone: 'mid',
          total: '一般 <15–20%', noquote: '—', single: '—', aigc: '注意提交 AI 使用声明',
          system: 'Turnitin',
          tip: '可到 20%(依赖文献多),但连续大段匹配比总分更危险;善用 Similarity 报告自查。' },
        { id: 'phd', name: '博士', sub: 'Thesis', lineMax: 10, zone: 'strict',
          total: '建议 <10%(常引 10–15% 经验区间)', noquote: '—', single: '—', aigc: 'Turnitin AI 指标 + 答辩核查',
          system: 'Turnitin / iThenticate',
          tip: '原创性要求最高,直接引用外多应为原创;仍以系/院 viva 规定为准。' }
      ]
    }
  ],

  systems: [
    { name: '知网 · 本科', code: '知网 PMLC', aigc: '有(AIGC 检测独立报告)',
      lib: '独家含「大学生论文联合比对库」(往届本科生论文)+ 学术期刊/学位论文/互联网库',
      note: '国内本科定稿主流;PaperPass/维普结果只作趋势参考,不能替代它。' },
    { name: '知网 · 硕博', code: '知网 VIP5.3 / TMLC2', aigc: '有',
      lib: '含「学术论文联合比对库」+ 学位论文全文库;VIP5.3(科研院所)与 TMLC2(高校)库与算法相同',
      note: '99% 高校硕博定稿用它;单章与全文分别卡线。' },
    { name: '知网 · 期刊', code: '知网 AMLC / SMLC', aigc: '有',
      lib: '期刊社/编辑部用的「学术不端文献检测系统」:科技 AMLC、社科 SMLC',
      note: '中文期刊投稿方查重多走这套。' },
    { name: '维普', code: '维普 VPCS', aigc: '有,疑似 AI 标蓝',
      lib: '自建期刊+学位+网络库;对「AI 写作语言特征」更敏感',
      note: '不少高校指定为第二检测系统;与知网结果常有出入。' },
    { name: '万方', code: '万方 WFSD', aigc: '有,按字数计费(红=AI 概率>85%,黄=50–85%)',
      lib: '万方期刊/学位/会议库',
      note: '结果通常偏低,自查看趋势用,不能替代学校指定系统。' },
    { name: 'Turnitin', code: 'Turnitin', aigc: 'AI Writing 指标(单独百分比)',
      lib: '全球最大:学生作业库+期刊+互联网+出版物,跨语言比对',
      note: '英文世界主流;官方称「没有一个通用的合格相似度」,须结合上下文解读。' },
    { name: 'iThenticate', code: 'iThenticate(CrossCheck)', aigc: '有(iThenticate AI)',
      lib: 'Crossref 出版物+期刊全文;投稿方专用、稿件不入库',
      note: 'SCI/EI 期刊与 IEEE 会议官方查重工具;看 Overall Similarity + Top Sources。' },
    { name: '其他自查工具', code: 'Grammarly / Copyleaks / GPTZero 等', aigc: 'AI 检测为主',
      lib: '互联网+自建库;侧重语法与 AI 识别',
      note: '仅自查参考,准确率不稳、假阳性多,切勿作为定稿依据。' }
  ],

  aigc: {
    intro: 'AIGC 率(AI 生成内容占比)是 2024 年起高校新增的独立指标,和「重复率」是两套报告、两条红线。重复率查「和别人重不重」,AIGC 率查「像不像 AI 写的」,都合格才算过。',
    thresholds: [
      { scene: '较严高校 / 评优', val: '≤10–20%' },
      { scene: '多数高校 2025 合格线', val: '≤20–30%' },
      { scene: '较宽 / 早期标准(如天大)', val: '≤40%' },
      { scene: '检测值超 30%', val: '多数警示/复检,个别不予通过' },
      { scene: '中文期刊', val: '编辑部陆续要求披露 AI 使用' },
      { scene: 'SCI / EI(国际)', val: '要求声明 AI 使用,一般不给固定百分比' }
    ],
    whyMisjudged: 'AI 检测靠「文本可预测性(困惑度/突发性)」猜测,不是证据。用词朴素、句式规整、母语非英语的写法,本就和 AI 特征重叠——Stanford 研究里 7 款检测器把 61.3% 的非母语 TOEFL 作文误判为 AI 代写(母语样本仅约 5.1%);把作文改得「更像母语者」后误判率降到 11.6%。所以高 AIGC 率 ≠ 你真的用了 AI。',
    howToProve: [
      '保留全过程草稿与版本记录(Word 修订、Git、云文档历史、时间戳)',
      '留存文献阅读笔记、实验/调研原始数据与记录本',
      '保存搜索、构思、提纲等中间产物,能还原思路演进',
      '录屏或分段提交,证明是逐步写成而非一次性生成',
      '如被误判,按学校「学术申诉/诚信复核」程序申请人工复核',
      '换用学校指定系统复测——不同工具结果差异大,别只认一次分数'
    ]
  },

  reduce: [
    '先规范引用:该加引号加引号、著录格式统一,让「去引用后重复率」扣掉合理引用',
    '理解后用自己的话重写(而非同义词替换),打乱句子结构、长短句交替',
    '把长直述句拆成短句,主动被动语态互换,调整语序与信息顺序',
    '用图、表、公式承载可视化信息,替代能改写的大段文字',
    '专业术语、法条、方法/仪器等固定表述无法改写的,减少连续照搬、穿插自己的解释',
    '增加原创分析、个人观点与实证内容,用增量原创稀释重复占比',
    '控制单一来源占比:别让某一篇文献贡献过多重复,分散并深加工',
    '降 AIGC 率靠「写得更像你自己」:加入个人经验、具体细节、领域判断,别堆术语和完美排比',
    '定稿只用学校指定系统自查一次,切勿把终稿传到来路不明的免费查重站(有留存/倒卖风险)'
  ],

  facts: [
    { h: '总重复率 ≠ 去除引用后重复率',
      p: '报告里有两个数字。规范标注的引用能在「去引用」里被扣除,更接近你真正的原创度;引用格式不规范(没加引号/著录乱)会被当抄袭计入,拉高总重复率。' },
    { h: '连续约 13 字相似易标红,但非铁律',
      p: '知网早期经验阈值(约 13 字符 ≈ 6–7 个汉字),且需该来源在本段占比超约 5% 才触发;现主流系统已升级为「语义+上下文+AI 识别」,不再是简单数字数。' },
    { h: '重复率和 AIGC 率是两套报告',
      p: '一个查「和已有文献重不重」,一个查「像不像 AI 写的」;两条红线各自达标才算过。降重降不下 AI 率,降 AI 率也不等于降重复。' },
    { h: 'AI 检测有大量假阳性',
      p: 'Stanford 研究:7 款检测器把 61.3% 的非母语 TOEFL 作文误判为 AI 代写(母语样本仅约 5.1%)。被误判别只认分数,留好草稿版本与写作过程,申请人工复核。' },
    { h: '自查分数和学校终检会差',
      p: 'PaperPass/维普/万方等比对库和学校最终用的知网不同,常差 5–8%,只作趋势参考;PMLC 还独家收录往届本科生论文,抄学长学姐必中。' },
    { h: '引用格式不规范 = 白引',
      p: '该加引号没加、著录乱、参考文献格式错,系统识别不了「引用」,会当抄袭计入总重复率;规范标注才能在「去引用」里被扣除。' },
    { h: '自我抄袭同样违规',
      p: '复用自己已发表/已提交的文字(self-plagiarism),期刊和学校一样判重;硕博用到本科或小论文的内容,也要重写并标注。' }
  ],

  faqs: [
    { q: '查重率和 AIGC 率是一回事吗?',
      a: '不是。查重率 = 和已有文献的重复占比;AIGC 率 = 被判定像 AI 生成的占比。两份独立报告、两条红线,都合格才能过。' },
    { q: '本硕博红线大概多少?',
      a: '常见:本科 20% 或 30%(名校收紧到 15%)、硕士 ≤10–15%、博士 ≤5–10%;一律以本校研究生院/教务处最新文件为准。' },
    { q: '知网连续 13 个字重复就标红是真的吗?',
      a: '是早期经验规律(约 13 字符 ≈ 6–7 汉字),还要该来源在本段占比超约 5% 才触发;现在已升级为语义+上下文判断,不是死数字数。' },
    { q: '自己用 PaperPass/维普查过很低,知网会不会翻车?',
      a: '会。各家比对库不同,常差 5–8%;知网本科 PMLC 还独家收录往届本科论文。定稿务必用学校指定系统再查一次。' },
    { q: '论文是我纯手写的,AIGC 率却很高怎么办?',
      a: 'AI 检测有大量假阳性(Stanford:非母语作文误判率 61.3%)。保留草稿版本、笔记、数据和修改痕迹,按学校学术申诉程序申请人工复核。' },
    { q: 'AIGC 率多少算合格?',
      a: '2025 年多数高校合格线在 20–30%,较严的 10–20%,超 30% 常触发警示或复检;评优通常更低。没有全国统一数字。' },
    { q: '引用了很多文献,重复率一定高吗?',
      a: '不一定。规范标注(引号+正确著录)的引用能在「去除引用后重复率」里被扣除;格式不规范才会被当抄袭。综述类更要看去引用后和单一来源占比。' },
    { q: 'SCI 投稿重复率怎么算安全?',
      a: '通行安全线:总重复 <20%、单篇来源 <3%;一区/顶刊建议总 <15%、单篇 <2%。用 iThenticate 自查,重点看 Overall Similarity 和 Top Sources。' },
    { q: '免费查重网站能用吗?',
      a: '自查早期版本可以,但绝不要把完整终稿传到来路不明的免费站点——有被留存、倒卖甚至提前「入库」导致正式检测暴涨的风险。' },
    { q: '降重就是把词换成同义词吗?',
      a: '不是,同义词替换容易被识破还降不下 AI 率。要理解后用自己的话重写、调整句子结构、增加原创分析,并规范引用。' }
  ]
};
