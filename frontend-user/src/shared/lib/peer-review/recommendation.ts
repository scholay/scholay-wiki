/**
 * 智能审稿最终状态 —— 内部用"修订严重度"叫法, 对用户/agent 文案展示"编辑决议"叫法 + 配色:
 *
 *   内部值 (agent 输出 / DB)   用户展示名      配色
 *   ──────────────────────────────────────────────────
 *   小修                       (修改后)录用    绿色 (brand-green)
 *   大修                       返修            黄色 (brand-amber)
 *   拒稿                       拒稿            红色 (brand-red)
 *
 * 即: 内部按"还要改多少"(小修/大修/拒稿)记录, 对外按"编辑怎么裁决"((修改后)录用/返修/拒稿)展示。
 * 向后兼容历史数据: 旧值 "录用 / accept" 归入"小修"(绿), "返修(亦即大修对外名) / major_revision"
 * 归入"大修"(黄), 各英文 enum 同义映射。未识别值原样显示、中性配色。
 *
 * 这是 peer-review 内多个展示组件 (RecordsPage / DetailRail / ChiefVerdictPanel /
 * ReviewerDetailPanel / StatusGrid) 共用的唯一真源, 不要再在各文件里散落 switch。
 */

export type RecTier = 'minor' | 'major' | 'reject' | 'unknown';

/** 把任意 recommendation 字符串 (新中文 / 旧中文 / 英文 enum) 归一到 3 档之一。 */
export function recTier(rec?: string | null): RecTier {
  switch ((rec ?? '').trim()) {
    case '小修':
    case 'minor_revision':
    case '录用': // 对外展示名 / 历史值, 归入"小修"
    case '修改后录用':
    case '(修改后)录用':
    case 'accept':
      return 'minor';
    case '大修':
    case '返修': // "返修" 是大修的对外展示名
    case 'major_revision':
      return 'major';
    case '拒稿':
    case 'reject':
      return 'reject';
    default:
      return 'unknown';
  }
}

const LABEL: Record<RecTier, string> = {
  minor: '(修改后)录用',
  major: '返修',
  reject: '拒稿',
  unknown: '',
};

/** 紧凑展示名 (分段状态条 / 窄卡片用, 去掉"修改后"限定语)。 */
const SHORT_LABEL: Record<RecTier, string> = {
  minor: '录用',
  major: '返修',
  reject: '拒稿',
  unknown: '',
};

/** 紧凑展示名; 未识别值原样回显。 */
export function recShortLabel(rec?: string | null): string {
  const t = recTier(rec);
  return t === 'unknown' ? (rec ?? '').trim() : SHORT_LABEL[t];
}

/** 用户友好展示名; 未识别值原样回显。 */
export function recLabel(rec?: string | null): string {
  const t = recTier(rec);
  return t === 'unknown' ? (rec ?? '').trim() : LABEL[t];
}

const TEXT_COLOR: Record<RecTier, string> = {
  minor: 'text-brand-green',
  major: 'text-brand-amber',
  reject: 'text-brand-red',
  unknown: 'text-foreground',
};

/** 纯文字色 (主审决议大字 / 行内强调用)。 */
export function recTextColor(rec?: string | null): string {
  return TEXT_COLOR[recTier(rec)];
}

const BADGE: Record<RecTier, string> = {
  minor: 'bg-brand-green/10 text-brand-green',
  major: 'bg-warning-soft text-brand-amber',
  reject: 'bg-danger-soft text-destructive',
  unknown: 'bg-surface-2 text-muted-foreground',
};

/** 药丸徽章配色 (记录列表用)。 */
export function recBadgeClasses(rec?: string | null): string {
  return BADGE[recTier(rec)];
}

const BORDER: Record<RecTier, string> = {
  minor: 'border border-brand-green bg-brand-green/10 text-brand-green',
  major: 'border border-brand-amber/60 bg-warning-soft text-brand-amber',
  reject: 'border border-brand-red/40 bg-danger-soft text-brand-red',
  unknown: 'border border-border bg-surface-2 text-faint',
};

/** 带边框的强调变体 (审稿人详情推荐标签用)。 */
export function recBorderClasses(rec?: string | null): string {
  return BORDER[recTier(rec)];
}

const AVATAR: Record<RecTier, string> = {
  minor: 'bg-brand-green text-on-brand',
  major: 'bg-brand-amber text-foreground',
  reject: 'bg-brand-red text-on-brand',
  unknown: 'bg-foreground text-on-dark',
};

/** 实心头像/圆点配色 (状态栏审稿人/主审圆形 avatar 按结果上色用)。 */
export function recAvatarClasses(rec?: string | null): string {
  return AVATAR[recTier(rec)];
}

const BORDER_COLOR: Record<RecTier, string> = {
  minor: 'border-brand-green',
  major: 'border-brand-amber',
  reject: 'border-brand-red',
  unknown: 'border-border',
};

/** 纯边框色 (深色主审卡按结果描边时用)。 */
export function recBorderColor(rec?: string | null): string {
  return BORDER_COLOR[recTier(rec)];
}

const FILL_BG: Record<RecTier, string> = {
  minor: 'bg-brand-green',
  major: 'bg-brand-amber',
  reject: 'bg-brand-red',
  unknown: 'bg-foreground',
};

/** 实心填充背景 (主审决议大卡整卡按结果填色)。
 *  ⚠️ 只给底色,前景色由调用方按底色配对 (琥珀实底必须配深字, 白字压琥珀只有 2.11:1)。 */
export function recFillBg(rec?: string | null): string {
  return FILL_BG[recTier(rec)];
}

/**
 * 主审决议三档 ((修改后)录用 → 返修 → 拒稿), 从优到劣排序 —— 分段状态展示控件枚举用。
 * 命中档实心上色(recAvatarClasses), 其余灰描边。窄控件用 short, 普通用 label。
 */
export const REC_TIERS: { tier: RecTier; label: string; short: string }[] = [
  { tier: 'minor', label: LABEL.minor, short: SHORT_LABEL.minor },
  { tier: 'major', label: LABEL.major, short: SHORT_LABEL.major },
  { tier: 'reject', label: LABEL.reject, short: SHORT_LABEL.reject },
];
