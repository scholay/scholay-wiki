#!/usr/bin/env bash
# =============================================================================
# 学术情报(news_items)本地测试数据种子 —— 【仅限本地开发环境】
# -----------------------------------------------------------------------------
# 生产环境的 news_items 由 Minicod 的 webhook 推送(server-to-server + HMAC),
# 本脚本是给本地调首页情报区 UI 用的假数据,**不要在任何非本地环境执行**。
#
# 用法:
#   ./scripts/seed-news-local.sh          # 写入 12 条 + 打开功能开关
#   ./scripts/seed-news-local.sh --clean  # 只清空本脚本写入的数据(按 id 前缀)
#
# 幂等:所有 INSERT 走 ON DUPLICATE KEY UPDATE,重复执行只刷新内容不产生重复行。
# 所有种子行的 id 以 `seed-` 开头,--clean 只删这些,不碰真实 webhook 落库的数据。
# =============================================================================
set -euo pipefail

CONTAINER="${MYSQL_CONTAINER:-scholar_mysql}"
DB="${MYSQL_DATABASE:-scholar}"
USER="${MYSQL_USER:-scholar_user}"
PASS="${MYSQL_PASSWORD:-scholar_pass}"

# ── 本地环境护栏 ─────────────────────────────────────────────────────────────
# 这脚本会写业务表。只允许在本机 docker 里跑,且容器名必须是本地那套。
if [[ "${ALLOW_NON_LOCAL_SEED:-}" != "1" ]]; then
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "✗ 找不到本地 MySQL 容器 '$CONTAINER' —— 本脚本仅供本地开发环境使用。" >&2
    exit 1
  fi
fi

mysql_exec() {
  docker exec -i "$CONTAINER" mysql -u"$USER" -p"$PASS" "$DB" \
    --default-character-set=utf8mb4 "$@"
}

if [[ "${1:-}" == "--clean" ]]; then
  mysql_exec <<'SQL'
DELETE FROM news_items WHERE id LIKE 'seed-%';
SQL
  echo "✓ 已清除 seed-* 测试情报"
  mysql_exec -N -e "SELECT CONCAT('  剩余 news_items: ', COUNT(*)) FROM news_items;"
  exit 0
fi

# ── 打开功能开关 ─────────────────────────────────────────────────────────────
# handler 的 Enabled() 读 news_webhook_config.enabled;关闭时列表/热榜接口一律返空,
# 首页情报区会整块不渲染 —— 不打开的话种子数据看不见。
mysql_exec <<'SQL'
INSERT INTO news_webhook_config (id, enabled) VALUES (1, 1)
  ON DUPLICATE KEY UPDATE enabled = 1;
SQL

# ── 种子数据 ─────────────────────────────────────────────────────────────────
# 覆盖四个 section(含一条 22 天前的,用来看「相对时间→绝对日期」的切换)、快讯/今日要览两种 report_type、头条/普通、热度飙升/回落,
# 让首页左栏卡片与右栏热榜的各种分支都能看到。
# published_at 用相对 NOW() 的偏移,保证「近 7 天」的热榜过滤永远命中。
# cover_image 一律留空:上游图床有跨站 CORP 策略,本地填外链只会得到裂图。
mysql_exec <<'SQL'
SET NAMES utf8mb4;

INSERT INTO news_items
  (id, slug, url, report_id, report_type, section, section_label,
   title, summary, body_md, body_html, credibility_note, cover_image,
   original_date, published_at, sources, status, is_featured, score,
   view_count, heat_external, heat_trend, heat_measured_at,
   upstream_created_at, upstream_updated_at)
VALUES
 ('seed-0001','2026-07-27-alphafold-rna-structure','https://example.local/news/alphafold-rna','seed-rep-daily','daily','major-event','重大事件',
  'DeepMind 发布 AlphaFold-RNA:首次将核酸三维结构预测精度推入实验可用区间',
  '新模型在 CASP16 的 RNA 赛道上把中位 RMSD 压到 2.1 Å,较上一代提升约 40%。团队同时开源了推理权重与一套 12 万条的合成训练集。',
  '## 摘要\n\n新模型在 CASP16 的 RNA 赛道上把中位 RMSD 压到 2.1 Å。',
  '<h2>摘要</h2><p>新模型在 CASP16 的 RNA 赛道上把中位 RMSD 压到 2.1 Å,较上一代提升约 40%。</p><p>团队同时开源了推理权重与一套 12 万条的合成训练集,并在附录中给出了失败案例分析。</p>',
  '基于官方博客与 CASP16 组委会公布的盲测榜单交叉核对。','',
  '2026-07-26', DATE_SUB(NOW(), INTERVAL 3 HOUR),
  '[{"url":"https://example.local/deepmind-blog","label":"DeepMind 官方博客"},{"url":"https://example.local/casp16","label":"CASP16 榜单"}]',
  'published', 1, 9.40, 1284, 96.50, 18.20, NOW(), DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR)),

 ('seed-0002','2026-07-27-nsfc-2027-guideline','https://example.local/news/nsfc-2027','seed-rep-daily','daily','china-policy','中国政策',
  '国自然 2027 年度项目指南征求意见:交叉学部拟新增「智能实验自动化」申请代码',
  '征求意见稿显示,交叉科学部将在 T01 下增设自动化实验平台相关代码,并首次明确 AI 生成内容在申请书中的披露要求。',
  '## 要点\n\n交叉科学部将在 T01 下增设自动化实验平台相关代码。',
  '<h2>要点</h2><ul><li>T01 下增设「智能实验自动化」申请代码</li><li>首次明确 AI 生成内容的披露要求</li><li>意见反馈截止 2026-08-15</li></ul>',
  '来源为基金委官网公示页面,截稿时尚未形成正式文件。','',
  '2026-07-25', DATE_SUB(NOW(), INTERVAL 9 HOUR),
  '[{"url":"https://example.local/nsfc","label":"国家自然科学基金委"}]',
  'published', 1, 8.90, 2016, 91.00, 6.40, NOW(), DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_SUB(NOW(), INTERVAL 9 HOUR)),

 ('seed-0003','2026-07-27-nature-room-temp-superconductor-retraction','https://example.local/news/nature-retraction','seed-rep-hourly','hourly','top-journal','顶刊动态',
  'Nature 撤回一篇室温超导论文:第三方复现失败 + 原始数据无法提供',
  '编辑部说明指出,通讯作者未能提供 2024 年那批样品的原始电阻曲线,三个独立实验室的复现均未观察到零电阻转变。',
  '## 撤稿说明\n\n三个独立实验室的复现均未观察到零电阻转变。',
  '<h2>撤稿说明</h2><p>编辑部指出通讯作者未能提供原始电阻曲线。</p><p>这是该团队近三年内第二篇被撤回的相关论文。</p>',
  '依据 Nature 官方撤稿声明原文。','',
  '2026-07-27', DATE_SUB(NOW(), INTERVAL 1 HOUR),
  '[{"url":"https://example.local/nature-retraction","label":"Nature 撤稿声明，2026-07-27 09:15"},{"url":"https://example.local/retraction-watch","label":"Retraction Watch"}]',
  'published', 0, 9.10, 3421, 88.75, 31.60, NOW(), DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR)),

 ('seed-0004','2026-07-26-cell-single-cell-atlas','https://example.local/news/cell-atlas','seed-rep-daily','daily','top-journal','顶刊动态',
  'Cell 封面:人类胚胎着床期单细胞图谱补上第 7-14 天的空白',
  '研究团队用体外培养模型重建了着床窗口期的转录组轨迹,鉴定出两类此前未被描述的滋养层亚群。',
  '## 概要\n\n鉴定出两类此前未被描述的滋养层亚群。',
  '<h2>概要</h2><p>研究团队用体外培养模型重建了着床窗口期的转录组轨迹。</p>',
  '论文已通过同行评审并在 Cell 正式见刊。','',
  '2026-07-24', DATE_SUB(NOW(), INTERVAL 1 DAY),
  '[{"url":"https://example.local/cell-paper","label":"Cell 原文"}]',
  'published', 0, 8.30, 1105, 74.20, -3.10, NOW(), DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)),

 ('seed-0005','2026-07-26-arxiv-moderation-policy','https://example.local/news/arxiv-policy','seed-rep-hourly','hourly','other','其他',
  'arXiv 收紧综述类投稿:cs.LG 起要求附上系统性检索协议',
  '新规自 9 月 1 日生效,未附检索式与筛选流程图的综述将被直接退回,不进入 moderation 队列。',
  '## 新规要点\n\n未附检索式与筛选流程图的综述将被直接退回。',
  '<h2>新规要点</h2><p>自 9 月 1 日生效,先在 cs.LG 试行,后续扩展到 cs 全域。</p>',
  '来源为 arXiv 官方公告邮件列表。','',
  '2026-07-26', DATE_SUB(NOW(), INTERVAL 2 DAY),
  '[{"url":"https://example.local/arxiv-announce","label":"arXiv 公告"}]',
  'published', 0, 7.10, 642, 61.30, 4.80, NOW(), DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)),

 ('seed-0006','2026-07-25-china-lab-animal-welfare','https://example.local/news/lab-animal','seed-rep-daily','daily','china-policy','中国政策',
  '科技部发布实验动物福利伦理审查新版指南,首次覆盖类器官与嵌合体研究',
  '新版指南把类器官、脑类器官与人-动物嵌合体纳入审查范围,并要求机构在 2027 年前完成伦理委员会重组。',
  '## 覆盖范围\n\n类器官、脑类器官与人-动物嵌合体纳入审查。',
  '<h2>覆盖范围</h2><p>要求机构在 2027 年前完成伦理委员会重组。</p>',
  '依据科技部官网发布的正式文件。','',
  '2026-07-25', DATE_SUB(NOW(), INTERVAL 2 DAY),
  '[{"url":"https://example.local/most","label":"科学技术部"}]',
  'published', 0, 7.80, 913, 58.90, 1.20, NOW(), DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)),

 ('seed-0007','2026-07-24-science-fusion-milestone','https://example.local/news/fusion','seed-rep-daily','daily','major-event','重大事件',
  'Science:商业聚变装置首次实现连续 30 分钟净能量增益',
  'Q 值稳定在 1.6 以上并维持 1800 秒,是托卡马克路线首次在分钟量级以上保持净增益。',
  '## 数据\n\nQ 值稳定在 1.6 以上并维持 1800 秒。',
  '<h2>数据</h2><p>是托卡马克路线首次在分钟量级以上保持净增益。</p>',
  '论文数据经 Science 同行评审;第三方尚未复现。','',
  '2026-07-23', DATE_SUB(NOW(), INTERVAL 3 DAY),
  '[{"url":"https://example.local/science-fusion","label":"Science 原文"}]',
  'published', 0, 9.20, 5230, 84.10, -12.50, NOW(), DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),

 ('seed-0008','2026-07-24-openreview-outage','https://example.local/news/openreview','seed-rep-hourly','hourly','other','其他',
  'OpenReview 大面积超时影响 NeurIPS rebuttal,组委会延长 48 小时',
  '故障持续约 6 小时,期间提交接口间歇性 502。组委会已宣布 rebuttal 截止时间统一顺延。',
  '## 影响\n\n提交接口间歇性 502,持续约 6 小时。',
  '<h2>影响</h2><p>组委会已宣布 rebuttal 截止时间统一顺延 48 小时。</p>',
  '依据组委会公告与状态页历史记录。','',
  '2026-07-24', DATE_SUB(NOW(), INTERVAL 3 DAY),
  '[{"url":"https://example.local/neurips","label":"NeurIPS 组委会公告"}]',
  'published', 0, 6.40, 1876, 52.60, 9.70, NOW(), DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),

 ('seed-0009','2026-07-23-lancet-gut-brain','https://example.local/news/lancet-gut','seed-rep-daily','daily','top-journal','顶刊动态',
  'Lancet 子刊:大规模队列未能重现「肠道菌群-抑郁」关联',
  '在 12 万人的前瞻队列里,校正饮食与用药后原有的显著关联消失,作者呼吁重新审视既往小样本结论。',
  '## 结论\n\n校正饮食与用药后原有的显著关联消失。',
  '<h2>结论</h2><p>作者呼吁重新审视既往小样本结论。</p>',
  '队列数据来源与统计方法已在补充材料中公开。','',
  '2026-07-22', DATE_SUB(NOW(), INTERVAL 4 DAY),
  '[{"url":"https://example.local/lancet","label":"The Lancet 子刊"}]',
  'published', 0, 8.00, 774, 47.30, -1.90, NOW(), DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY)),

 ('seed-0010','2026-07-22-eu-open-access','https://example.local/news/eu-oa','seed-rep-daily','daily','other','其他',
  '欧盟 Horizon 后续框架计划拟强制即时开放获取,取消 12 个月禁售期',
  '草案要求受资助论文见刊即开放,且不得由作者承担 APC —— 转而由出版协议在机构层面统一结算。',
  '## 草案要点\n\n受资助论文见刊即开放,不得由作者承担 APC。',
  '<h2>草案要点</h2><p>转而由出版协议在机构层面统一结算。</p>',
  '草案尚在议会审议阶段,条款可能变动。','',
  '2026-07-21', DATE_SUB(NOW(), INTERVAL 5 DAY),
  '[{"url":"https://example.local/eu-horizon","label":"欧盟委员会"}]',
  'published', 0, 7.50, 501, 39.80, 2.30, NOW(), DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)),

 ('seed-0011','2026-07-21-preprint-peer-review-ai','https://example.local/news/ai-review','seed-rep-hourly','hourly','major-event','重大事件',
  '预印本:AI 审稿意见与人类审稿人一致性达 71%,但在方法学缺陷上系统性漏检',
  '研究比对了 3200 份配对意见,AI 在写作与新颖性判断上接近人类,却漏掉了 62% 的统计功效问题。',
  '## 发现\n\nAI 漏掉了 62% 的统计功效问题。',
  '<h2>发现</h2><p>研究比对了 3200 份配对意见。</p>',
  '预印本尚未经过同行评审。','',
  '2026-07-20', DATE_SUB(NOW(), INTERVAL 6 DAY),
  '[{"url":"https://example.local/preprint","label":"bioRxiv 预印本"}]',
  'published', 0, 7.90, 2288, 66.40, 14.10, NOW(), DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),

 ('seed-0013','2026-07-05-icml-desk-reject','https://example.local/news/icml-desk','seed-rep-daily','daily','other','其他',
  'ICML 2027 桌拒率升至 18%:格式与利益冲突声明成主要退稿原因',
  '组委会公布的统计显示,今年桌拒里有六成源于未申报的利益冲突,而非篇幅或格式问题。',
  '## 统计\n\n六成桌拒源于未申报的利益冲突。',
  '<h2>统计</h2><p>组委会同时表示明年将引入自动化的 COI 交叉核验。</p>',
  '数据来自组委会公开的评审统计报告。','',
  '2026-07-05', DATE_SUB(NOW(), INTERVAL 22 DAY),
  '[{"url":"https://example.local/icml","label":"ICML 组委会统计报告 2026-07-05"}]',
  'published', 0, 6.90, 1432, 22.40, -0.80, NOW(), DATE_SUB(NOW(), INTERVAL 22 DAY), DATE_SUB(NOW(), INTERVAL 22 DAY)),

 ('seed-0012','2026-07-20-cas-journal-tiering','https://example.local/news/cas-tier','seed-rep-daily','daily','china-policy','中国政策',
  '中科院分区表 2026 升级版发布:新增 41 本期刊进入 Top,17 本被标记为「预警」',
  '本次调整加大了对自引率与超常发文量的惩罚权重,部分大体量综述刊分区下滑。',
  '## 变化\n\n加大了对自引率与超常发文量的惩罚权重。',
  '<h2>变化</h2><p>部分大体量综述刊分区下滑。</p>',
  '依据文献情报中心正式发布的分区表。','',
  '2026-07-19', DATE_SUB(NOW(), INTERVAL 7 DAY),
  '[{"url":"https://example.local/cas","label":"中科院文献情报中心"}]',
  'published', 0, 8.60, 6142, 79.50, -5.40, NOW(), DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY))

ON DUPLICATE KEY UPDATE
  slug = VALUES(slug), title = VALUES(title), summary = VALUES(summary),
  body_md = VALUES(body_md), body_html = VALUES(body_html),
  section = VALUES(section), section_label = VALUES(section_label),
  report_type = VALUES(report_type), sources = VALUES(sources),
  published_at = VALUES(published_at), is_featured = VALUES(is_featured),
  score = VALUES(score), view_count = VALUES(view_count),
  heat_external = VALUES(heat_external), heat_trend = VALUES(heat_trend),
  heat_measured_at = VALUES(heat_measured_at), status = VALUES(status);
SQL

echo "✓ 学术情报测试数据已写入(本地)"
mysql_exec -N -e "
SELECT CONCAT('  news_items 总数: ', COUNT(*)) FROM news_items;
SELECT CONCAT('  其中 seed-*   : ', COUNT(*)) FROM news_items WHERE id LIKE 'seed-%';
SELECT CONCAT('  功能开关 enabled: ', enabled) FROM news_webhook_config WHERE id = 1;"
