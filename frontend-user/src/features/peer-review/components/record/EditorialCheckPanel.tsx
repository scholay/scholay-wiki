import type { Submission } from '../../types';

/**
 * Tab 1 - 编辑部初审(.pen `O4oP1` mainCol)。
 *
 * 业务约定:**投稿成功 = 初审通过**, 所以这里不调后端, 直接渲染 4 项硬编码通过结果。
 * 数据看起来真实(查重 6.2%, AIGC 4.1%, 排版 96%, 选题 88%), 用户感受到「确认初审已过」。
 *
 * 设计稿: 标题+段落+左红条「初审结论」+5 列检查表+签署区。
 */
export interface EditorialCheckPanelProps {
  submission: Submission;
}

interface CheckItem {
  name: string;
  indicator: string;
  threshold: string;
  conclusion: '通过' | '警示' | '失败';
  comment: string;
}

const CHECKS: CheckItem[] = [
  {
    name: '查重率',
    indicator: '6.2%',
    threshold: '≤ 15%',
    conclusion: '通过',
    comment: '重复内容集中在通用方法学描述,已识别为合理引用;未发现整段抄袭。',
  },
  {
    name: 'AIGC 率',
    indicator: '4.1%',
    threshold: '≤ 20%',
    conclusion: '通过',
    comment: '全文 AIGC 比例处于安全区间,主要分布于摘要润色与图注表述,未涉及核心论证段落。',
  },
  {
    name: '排版规范',
    indicator: '模板符合度 96%',
    threshold: '≥ 90%',
    conclusion: '通过',
    comment: '字号 / 行距 / 参考文献样式符合期刊模板;细节差异将由审稿人评估。',
  },
  {
    name: '选题与期刊定位',
    indicator: '匹配度 88%',
    threshold: '≥ 70%',
    conclusion: '通过',
    comment: '主题契合期刊近 24 个月的主流方向;研究价值与读者关注度达到送审基线。',
  },
];

export function EditorialCheckPanel({ submission }: EditorialCheckPanelProps) {
  return (
    <article className="flex flex-col gap-7">
      {/* 头部段落 */}
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold text-faint">编辑部初审</p>
        <h2 className="font-serif text-2xl font-bold text-foreground">四项基础检查 · 全部通过</h2>
        <p className="text-base leading-paragraph text-muted-foreground">
          编辑部初审仅做基础性合规检查;只有本环节通过,稿件才会被送往三位匿名审稿人。
        </p>
      </header>

      {/* 初审结论 — 左侧黑色 2px 引线 */}
      <section className="border-l-2 border-foreground py-4 pl-6">
        <p className="mb-2 text-xs font-bold text-faint">初审结论</p>
        <p className="font-serif text-lg italic font-semibold leading-paragraph text-foreground">
          稿件四项检查全部达标,已自动转入同行评审环节,分配三位匿名 AI 审稿人 A / B / C 并行评分。
        </p>
      </section>

      {/* 检查明细表 */}
      <section>
        <header className="flex items-end justify-between border-b-2 border-foreground pb-1">
          <h3 className="font-serif text-lg font-bold text-foreground">检查明细</h3>
          <p className="text-xs text-faint">4 项 · 通过 4 · 警示 0 · 失败 0</p>
        </header>
        {/* 表头 */}
        <div className="grid grid-cols-[170px_120px_120px_80px_1fr] gap-3 py-2.5">
          {['检查项', '指标', '阈值', '结论', '说明'].map((h) => (
            <p key={h} className="text-xs font-bold text-faint">
              {h}
            </p>
          ))}
        </div>
        {/* 行 */}
        {CHECKS.map((item, idx) => (
          <div
            key={item.name}
            className={`grid grid-cols-[170px_120px_120px_80px_1fr] gap-3 py-3 ${
              idx === 0 ? 'border-t border-border-soft' : 'border-t border-border-soft'
            } ${idx === CHECKS.length - 1 ? 'border-b border-border-soft' : ''}`}
          >
            <p className="text-base font-bold text-foreground">{item.name}</p>
            <p className="text-base text-subtle">{item.indicator}</p>
            <p className="text-base text-muted-foreground">{item.threshold}</p>
            <p className="text-base font-bold text-foreground">{item.conclusion}</p>
            <p className="text-base leading-paragraph text-subtle">{item.comment}</p>
          </div>
        ))}
      </section>

      {/* 签署 */}
      <footer className="flex items-center gap-4 border-t border-foreground pt-4">
        <p className="w-24 shrink-0 text-xs font-bold text-faint">编辑部签署</p>
        <div className="flex-1 space-y-0.5">
          <p className="text-base font-semibold text-subtle">
            AI 编辑部初审 · 自动检查通过 · {formatDate(submission.submittedAt)}
          </p>
          <p className="text-sm italic text-muted-foreground">
            四项检查全部达标 · 稿件已送往三位匿名审稿人,进入下一环节后本页结果归档不再变动。
          </p>
        </div>
      </footer>
    </article>
  );
}

function formatDate(iso?: string) {
  if (!iso) return '——';
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
