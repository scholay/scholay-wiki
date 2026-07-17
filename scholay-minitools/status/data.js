window.STATUS_DATA = {
  disclaimer:
    '各投稿系统的状态措辞会随版本更新，不同期刊还会自定义流程与叫法，同一状态在不同刊含义也可能不同。本词典为通用对照与经验参考，具体含义与时间一律以「目标期刊 / 投稿系统官方说明 / 编辑部答复」的最新规定为准。',

  systems: [
    {
      name: 'Editorial Manager（EM）',
      vendor: 'Aries Systems（现属 Elsevier）；被 Elsevier、PLOS、Springer 部分刊、Hindawi、Wolters Kluwer 及大量学会刊采用',
      note: '使用最广、状态措辞最统一的系统之一。经典链路：Submitted to Journal → With Editor → Under Review → Required Reviews Completed → Decision in Process → Revise / Accept。'
    },
    {
      name: 'ScholarOne Manuscripts（Manuscript Central）',
      vendor: 'Clarivate；被 Wiley（旧刊）、IEEE 多刊、Taylor & Francis、SAGE、Oxford University Press 及大量学会刊采用',
      note: '常出现「双状态」（如 ADM 与 AE 并列），反映行政编辑与责任编辑并行处理。措辞随版本每 2-3 月可能微调，各刊定制差异大。'
    },
    {
      name: 'Springer Nature SNAPP',
      vendor: 'Springer Nature；Springer、Nature 系列、BMC 部分刊逐步迁入',
      note: '措辞较简洁：Under review / Awaiting reviewer assignment / Decision pending 等。Nature 旗下刊正逐步从旧系统迁到 SNAPP。'
    },
    {
      name: 'Frontiers（自研平台）',
      vendor: 'Frontiers in… 全系列开放获取刊',
      note: '独有「互动审稿（Interactive Review）」论坛，审稿人报告齐后作者可与审稿人在线直接对话。链路：Validation → Editorial assignment → Independent review → Interactive review → Review finalized → Final validation。'
    },
    {
      name: 'MDPI SuSy（susy.mdpi.com）',
      vendor: 'MDPI 全部刊（Sensors、IJMS、Sustainability、Materials 等）',
      note: '流程高度模块化、状态直白、速度快。链路：Submitted → 送编辑 → 邀请审稿人 → Under Review → Awaiting recommendation → Accept → In proofreading / Copy-editing。'
    },
    {
      name: 'IEEE Author Portal',
      vendor: 'IEEE 部分新迁刊；IEEE 另有大量刊仍在 ScholarOne 上',
      note: 'IEEE 生态两套系统混用，状态叫法以具体刊为准。工程/CS 审稿普遍偏慢，IEEE Access 等开放刊则很快。'
    },
    {
      name: 'Wiley Research Exchange（REX）',
      vendor: 'Atypon（Wiley）；正逐步取代 Wiley 旗下的 ScholarOne',
      note: '较新的系统。可在 My Submissions → Submission overview 里查看状态与「编辑联系人（Editorial Contact）」。Under Review 涵盖大量子步骤。'
    },
    {
      name: 'eLife（自研 · 新模式）',
      vendor: 'eLife',
      note: '2023 起新模式：不再有传统 accept/reject。编辑先决定是否送审；凡送外审的稿件都以「Reviewed Preprint（评审预印本）」发表，附审稿意见、作者回应与 eLife Assessment。审稿人之间会先互读、协商再定稿。'
    },
    {
      name: 'OJS（Open Journal Systems）',
      vendor: 'PKP（公共知识计划，开源）；大量高校学报、学会刊与开放获取小刊',
      note: '四大编辑阶段清晰：Submission（收稿/初审）→ Review（外审+返修）→ Copyediting（编校）→ Production（排版/校样/上线）。'
    }
  ],

  stages: [
    {
      id: 'received',
      step: '收稿 · 行政初审排队',
      icon: '📥',
      em: 'Submitted to Journal',
      s1: 'Awaiting Admin Processing / ADM: Assigned',
      other: 'SNAPP: Submitted｜MDPI: Submitted｜Wiley REX: Submitted｜Frontiers: Validation｜OJS: Submission 阶段｜PLOS: Initial Quality Check',
      meaning: '编辑部做行政预审：文件完整性、格式、查重、作者与利益冲突声明、伦理/数据可得性等，尚未进入学术评估。',
      wait: '1-7 天',
      normal: 'ok',
      action: '耐心等待，别催。若被系统标为需补材料（Needs Approval / Sent Back to Author）则尽快补齐。'
    },
    {
      id: 'with-editor',
      step: '编辑分派 · 桌面初审',
      icon: '🧭',
      em: 'With Editor',
      s1: 'Awaiting AE Assignment / AE: Assigned',
      other: 'SNAPP: Editor assigned｜MDPI: 送交编辑｜Frontiers: Editorial assignment｜PLOS: Editorial Assignment｜Wiley REX: With Editor｜OJS: Review 阶段',
      meaning: '主编/责任编辑（AE）接手，做桌面初审，判断是否对口、是否达到送外审门槛——此阶段可能直接「桌拒」。',
      wait: '3 天 - 3 周',
      normal: 'ok',
      action: '正常等待。若长期停在此阶段，多是在找审稿人或将桌拒。'
    },
    {
      id: 'reviewers-invited',
      step: '邀请审稿人（最易卡壳）',
      icon: '📨',
      em: 'Reviewer Invited',
      s1: 'Awaiting Reviewer Selection / Awaiting Reviewer Invitation',
      other: 'SNAPP: Awaiting reviewer assignment｜MDPI: 邀请审稿人｜Frontiers: Independent review（招募中）｜OJS: 指派审稿人',
      meaning: '编辑在物色并邀请合适审稿人，常需多轮邀请才凑齐（通常 2-3 人同意）。这是全流程最容易长时间停留的一步。',
      wait: '1-6 周',
      normal: 'ok',
      action: '4 周内属正常。停留久多因约不到审稿人；超 6 周可礼貌询问，并主动推荐 2-3 位候选审稿人帮编辑破局。'
    },
    {
      id: 'under-review',
      step: '外审中 · 审稿人评阅',
      icon: '🔬',
      em: 'Under Review',
      s1: 'Under Review / Awaiting Reviewer Scores',
      other: 'SNAPP: Under review｜MDPI: Under Review｜Frontiers: Independent review｜Wiley REX: Under review｜PLOS: Under Review｜OJS: In Review',
      meaning: '足够审稿人已就位并正在评阅、撰写意见。这是最核心也最漫长的阶段，措辞本身不含任何决定信息。',
      wait: '3-10 周（按学科差异大）',
      normal: 'ok',
      action: '到「平均周期基线」之前别催。到期后可发一封简短礼貌的状态询问（附稿号+题目）。'
    },
    {
      id: 'reviews-in',
      step: '审稿意见齐 · 编辑综合',
      icon: '📋',
      em: 'Required Reviews Completed',
      s1: 'Awaiting AE Recommendation',
      other: 'Frontiers: Review finalized｜MDPI: Awaiting recommendation｜SNAPP: Decision pending（部分）',
      meaning: '已达到所需审稿意见数，责任编辑开始阅读、综合各方意见。若某份意见被判质量不足，编辑可能补招审稿人（状态或短暂回退）。',
      wait: '数天 - 2 周',
      normal: 'ok',
      action: '快了，静候。此阶段一般无需催稿。'
    },
    {
      id: 'ae-recommend',
      step: 'AE 形成推荐意见',
      icon: '✍️',
      em: 'Decision in Process（部分）',
      s1: 'Awaiting AE Recommendation / Awaiting AE Decision',
      other: 'SNAPP: Decision pending｜Frontiers: Endorse/Recommend｜MDPI: Awaiting recommendation',
      meaning: '责任编辑（AE）在综合审稿意见、形成对主编的推荐（接收/返修/拒稿）。',
      wait: '数天 - 2 周',
      normal: 'ok',
      action: '静候。'
    },
    {
      id: 'eic-decision',
      step: '主编（EIC）定夺',
      icon: '👑',
      em: 'Decision in Process',
      s1: 'Awaiting EIC Decision / Awaiting Final Decision',
      other: 'SNAPP: Decision pending｜Frontiers: Final validation｜MDPI: Awaiting EIC decision',
      meaning: 'AE 把推荐意见交给主编（Editor-in-Chief），主编做最终决定。也可能出现「双状态」表示多角色并行。',
      wait: '数天 - 2 周',
      normal: 'ok',
      action: '很快出结果，静候决定信。'
    },
    {
      id: 'decision-processing',
      step: '决定生成中',
      icon: '⚖️',
      em: 'Decision in Process',
      s1: 'Awaiting Final Decision',
      other: 'SNAPP: Decision pending｜通用: Decision Letter Being Drafted',
      meaning: '决定已定，系统在生成/寄送决定信。切记：Decision in Process 不必然是拒稿，结果可能是接收、返修或拒稿。',
      wait: '1-7 天',
      normal: 'ok',
      action: '别过度解读，静候决定信到邮箱。'
    },
    {
      id: 'revision',
      step: '返修 · 球在你这边',
      icon: '🔧',
      em: 'Revise（Minor / Major）',
      s1: 'Awaiting Revision / Minor（Major）Revision',
      other: 'MDPI: Reconsider after minor/major revision｜Frontiers: 在 Interactive Review 论坛回应｜OJS: Revisions Requested｜SNAPP: Revision requested',
      meaning: '需按审稿意见修改后重投——能返修就是好消息，说明有戏。此时进度由你掌控。',
      wait: '你的球：按系统给的截止期（常 2-8 周）',
      normal: 'warn',
      action: '认真逐条回复、别超期。如确实来不及，提前邮件向编辑申请延期（多数可批）。'
    },
    {
      id: 'revision-review',
      step: '返修稿再审',
      icon: '🔁',
      em: 'Under Review（with revision）',
      s1: 'Revision — Under Review Again',
      other: 'MDPI: Revised version under review｜Frontiers: Interactive review（第二轮）｜OJS: Review（Round 2）',
      meaning: '返修稿在评估中。小修多由编辑直接定夺；大修通常回到原审稿人再审，可能多轮。',
      wait: '2 周 - 2 月',
      normal: 'ok',
      action: '静候。到期未动再礼貌询问返修稿评审进展。'
    },
    {
      id: 'accept',
      step: '接收',
      icon: '🎉',
      em: 'Completed – Accept',
      s1: 'Accepted / Accept',
      other: 'MDPI: Accept｜Frontiers: Accepted｜SNAPP: Accepted｜OJS: 进入 Copyediting｜Wiley REX: Accepted',
      meaning: '恭喜！稿件被正式接收。',
      wait: '—',
      normal: 'ok',
      action: '及时签署版权/许可协议、准备回应校样。'
    },
    {
      id: 'production',
      step: '生产 · 排版校样',
      icon: '🖨️',
      em: 'In Production',
      s1: 'In Production / In Press',
      other: 'OJS: Production｜MDPI: In proofreading / Copy-editing｜通用: Uncorrected Proof / In Press',
      meaning: '进入排版、语言润色、校样与 DOI 分配，随后正式上线（Online First / Version of Record）。',
      wait: '2-8 周',
      normal: 'ok',
      action: '及时、仔细地确认校样（proof），只改排版/事实性错误，避免大改。'
    }
  ],

  decisions: [
    {
      name: 'Accept（直接接收）',
      meaning: '无需修改直接接收。首轮就直接接收极为罕见，多出现在返修后。',
      whatToDo: '走版权协议与校样流程，尽快确认 proof。'
    },
    {
      name: 'Accept with Minor Revisions / Minor Revision（小修）',
      meaning: '大方向已获认可，仅需修文字、补细节、澄清个别问题；通常不再送外审，由编辑复核。',
      whatToDo: '几天内快速逐条修改并附简短回应信，接收概率很高。'
    },
    {
      name: 'Major Revision（大修）',
      meaning: '有较大机会被接收，但方法/数据/结构需实质性改进；修回后通常至少回到一位原审稿人再审。',
      whatToDo: '认真大改 + 写详尽的「逐条回应信（point-by-point）」，按截止期返回，别超期。'
    },
    {
      name: 'Reject & Resubmit（拒稿但欢迎重投）',
      meaning: '本轮拒稿，但编辑认为大幅重做后仍有价值，允许作为「新稿」重投——会给新编号、走全新一轮评审。门槛高于大修。',
      whatToDo: '权衡是否值得投入重大重做；若做，就当作全新投稿对待，并附上对前次意见的回应。'
    },
    {
      name: 'Reject（拒稿）',
      meaning: '本刊不再考虑。可能因创新性/严谨性不足或不够对口。',
      whatToDo: '别气馁——认真吸收审稿意见改进后转投更匹配的期刊，很多好文章都被拒过。'
    },
    {
      name: 'Desk Reject（编辑桌拒）',
      meaning: '未送外审即被主编拒绝，常在几天到 1-2 周内。多因不对口、达不到门槛或格式/伦理硬伤。',
      whatToDo: '几乎无时间损失，快速换更匹配的期刊重投；先核对是否有可快速修复的硬伤。'
    },
    {
      name: 'Transfer / Transfer Offer（转投姊妹刊）',
      meaning: '本刊拒稿，但出版社推荐把稿件与审稿意见一并转投同社更合适的姊妹刊，常给约 10 天决定期。',
      whatToDo: '评估目标刊是否对口、影响因子/开放获取费用是否可接受，可接受可拒绝（拒绝后可自行另投他刊）。'
    }
  ],

  adviceTable: [
    { case: '「Submitted / 收稿」停留 > 10 天', normal: 'warn', action: '可礼貌向编辑部确认是否已收到、是否缺材料（不同刊行政预审 1-7 天）。' },
    { case: '「With Editor / 编辑分派」停留 > 3-4 周', normal: 'warn', action: '可能在找审稿人或将桌拒；可发一封简短状态询问。' },
    { case: '「邀请审稿人 / Awaiting Reviewer Selection」停留 > 6 周', normal: 'warn', action: '多为约不到审稿人；礼貌询问并主动推荐 2-3 位候选审稿人。' },
    { case: '「Under Review」未到平均基线（如 < 8 周）', normal: 'ok', action: '完全正常，继续等待，勿催。' },
    { case: '「Under Review」超基线 2 周以上仍无动静', normal: 'warn', action: '发一封简短礼貌询问，附稿号+题目+投稿日期。' },
    { case: '「Required Reviews Completed / Decision in Process」停留 > 3 周', normal: 'warn', action: '可礼貌询问预计的决定时间。' },
    { case: '状态从 Under Review 退回 Submitted / With Editor', normal: 'warn', action: '常是审稿人退出需重招，属正常波动；先别慌，1-2 周后再观察。' },
    { case: '「返修稿再审」已投 > 8 周无动静', normal: 'warn', action: '礼貌询问返修稿的评审进展。' },
    { case: '「Accepted」后 > 6 周仍无校样', normal: 'warn', action: '联系生产编辑（production editor）确认排版进度。' }
  ],

  bench: {
    note: '以下为「首轮决定（first decision）」的经验基线，仅用于判断「是否该催」。真实周期受学科、审稿人可得性、稿件质量影响极大，且期刊官网公布的处理周期永远优先。',
    byField: [
      { name: '医学 / 公共卫生', time: '约 6-9 周' },
      { name: '工程 / 自然科学 / 心理学', time: '约 11-14 周' },
      { name: '经济 / 商科 / 社会科学', time: '约 16-18 周' },
      { name: '数学 / 计算机', time: '约 16-18 周（顶会另计）' },
      { name: '人文学科', time: '约 20-30+ 周（季刊常见）' }
    ],
    bySystem: [
      { name: 'MDPI（SuSy）', time: '约 4-8 周' },
      { name: 'IEEE Access 等开放快刊', time: '约 4-6 周' },
      { name: 'Frontiers / PLOS ONE', time: '约 8-12 周（PLOS ONE 中位约 29 天起）' },
      { name: 'Elsevier（EM）', time: '约 60-90 天' },
      { name: 'Springer / SNAPP', time: '约 62-85 天' },
      { name: '传统订阅制期刊', time: '约 12-20 周' }
    ]
  },

  backNote:
    '状态偶尔「倒退」到更早阶段（如 Under Review → Submitted / With Editor，或 Awaiting Reviewer Assignment → Awaiting Reviewer Selection）通常不是坏消息：多因某位审稿人中途退出、意见质量不足需补招，编辑便把稿件退回相应阶段重走流程。属正常波动，一般不必立即催稿，可 1-2 周后再观察。',

  templates: {
    statusZh:
      '尊敬的[编辑 / 编辑部]：\n\n' +
      '您好！我于 [投稿日期] 投稿贵刊，稿件编号 [XXXX-2026-0000]，题目《[论文题目]》。目前系统状态已在「[当前状态]」停留约 [N] 周。冒昧致信，想礼貌请教稿件当前的审稿进展，以及大致可预期的决定时间，以便我们合理安排后续工作。\n\n' +
      '若需要我方补充任何材料，请随时告知。感谢您与各位审稿人的时间和付出！\n\n' +
      '顺颂时祺\n[姓名 / 单位 / 邮箱]',
    statusEn:
      'Dear [Editor / Editorial Office],\n\n' +
      'I hope this message finds you well. I am writing to kindly inquire about the status of our manuscript "[Title]" (Manuscript ID: [XXXX-2026-0000]), submitted on [date]. The status has shown "[current status]" for about [N] weeks now. We would be grateful for any update on the review progress and an estimated timeline for a decision, so that we can plan accordingly.\n\n' +
      'Please let me know if any additional information is needed from our side. Thank you very much for your time and for the reviewers\' efforts.\n\n' +
      'Best regards,\n[Name, Affiliation, Email]',
    reviseReplyZh:
      '尊敬的编辑、各位审稿人：\n\n' +
      '衷心感谢编辑与各位审稿人对本文投入的宝贵时间与建设性意见，这些意见对提升文章质量帮助很大。我们已逐条认真修改，并在下文以「审稿意见 → 回应 → 修改位置」的形式一一说明；正文中的修改处已用[修订模式 / 颜色]标出。以下为逐条回应：\n\n' +
      '【审稿人 1 · 意见 1】（原文引用审稿意见）\n' +
      '【回应】感谢指出。我们已……（说明如何修改）。相关修改见修改稿第 X 页第 Y 段。\n\n' +
      '【审稿人 1 · 意见 2】……'
  },

  etiquette: [
    '先查期刊官网 / 投稿须知公布的「平均处理周期」，以此为催稿基准线——别凭感觉催。',
    '未到基线别催：过早催稿只会打扰编辑，并不会加速审稿。',
    '催稿邮件发给「责任编辑或编辑部（editorial office）」，务必带上稿号、题目、作者与投稿日期；正文简短、礼貌，只问进展。',
    '同一编辑最多礼貌跟进两次（每次间隔 7-14 天）；两次未回再转编辑部，别对同一人第三次追问。',
    '语气始终客气，别在邮件里表达不满或施压；可顺带推荐 2-3 位合适的候选审稿人帮编辑破局。',
    '状态「倒退」多是审稿人退出需重招，不是被拒的信号，先别慌。'
  ],

  faqs: [
    {
      q: 'Under Review 一直不动，是不是被拒了？',
      a: '不是。Under Review 只说明稿件在外审，措辞本身不含任何决定信息；审稿人写意见慢、编辑约人难都很常见。到平均基线后再礼貌询问即可。'
    },
    {
      q: '状态从 Under Review 退回 Submitted / With Editor 了，怎么办？',
      a: '多为某位审稿人中途退出、编辑需重新邀请或补招审稿人，系统便退回相应阶段。属正常波动，1-2 周后再看，别急着催。'
    },
    {
      q: 'Decision in Process 是不是要拒我？',
      a: '不必然。它只表示编辑已开始在系统里做决定，结果可能是接收、返修或拒稿三者之一，别过度解读。'
    },
    {
      q: 'ScholarOne 上出现两个状态（如 ADM 和 AE 并列）是什么意思？',
      a: '「双状态」反映不同角色并行处理：ADM（行政编辑）做格式/对口初检，AE（责任编辑）做学术评估；也可能是分别在等不同人。各刊定制不同，以本刊实际流程为准。'
    },
    {
      q: '「邀请审稿人 / Awaiting Reviewer Selection」卡了一个多月正常吗？',
      a: '这是全流程最容易卡的一步，多因约不到合适的审稿人。超 6 周可礼貌询问，并主动推荐 2-3 位候选审稿人帮编辑破局。'
    },
    {
      q: '多久没消息才适合催稿？',
      a: '以期刊公布的平均周期为准；若未公布，一般 6-8 周后再问较稳妥。快刊（MDPI、IEEE Access 等）更短，人文社科可能要等 3-5 个月。'
    },
    {
      q: 'MDPI / IEEE Access 这类为什么这么快？',
      a: '快刊采用高度流程化 + 密集提醒审稿人 + 并行处理，基线约 4-8 周。快不等于不严，但周期确实短——判断是否该催时要按它自己的短基线。'
    },
    {
      q: 'eLife 为什么没有「接收 / 拒稿」？',
      a: 'eLife 新模式下，凡送外审的稿件都以「Reviewed Preprint（评审预印本）」发表，附审稿意见、作者回应与 eLife Assessment，不再给传统 accept/reject。'
    },
    {
      q: '拒稿后收到「Transfer / 转投」邀请，要接受吗？',
      a: '这是出版社推荐把稿件与审稿意见转投同社姊妹刊，可省去重新排版。评估目标刊是否对口、费用是否可接受再决定；可接受、可拒绝后另投他刊。'
    },
    {
      q: '「Reject & Resubmit」和「Major Revision」有什么区别？',
      a: '大修仍在本轮流程内、接收概率较高、有截止期；Reject & Resubmit 是拒稿后按「新稿」重来（新编号、重大重做、重新走全流程评审），门槛更高。'
    },
    {
      q: '同时投了两个刊（一稿多投）行不行？',
      a: '不行。学术出版通行规则是同一时间只能投一个刊（一稿一投），一稿多投属学术不端，可能被撤稿并列入黑名单。想换刊须先正式撤稿或收到拒信后再投。'
    }
  ]
};