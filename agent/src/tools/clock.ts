// 当前时间单一真源(Asia/Shanghai)—— TodayDate 工具与 turnLoop dateLine 共用。
//
// 为什么手动 +8 而不用 Intl/toLocale*:本容器基于 oven/bun:1-slim,无 tzdata,
// TZ=":/etc/localtime" 指向的文件默认也不存在(docker-compose 需另行挂载),裸调
// new Date() 的本地化输出实际是 UTC —— 北京时间每天 0:00-8:00 会差一天。
// Asia/Shanghai 自 1991 年起无夏令时,固定 UTC+8,手动偏移即精确值,零环境依赖。

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export interface BeijingNow {
  isoDate: string; // 2026-07-08
  dateCN: string; // 2026年7月8日
  weekday: string; // 星期三
  time: string; // 14:32
}

export function beijingNow(now: Date = new Date()): BeijingNow {
  const t = new Date(now.getTime() + BEIJING_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth() + 1;
  const d = t.getUTCDate();
  return {
    isoDate: `${y}-${pad(m)}-${pad(d)}`,
    dateCN: `${y}年${m}月${d}日`,
    weekday: "星期" + WEEKDAYS[t.getUTCDay()],
    time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`,
  };
}

// buildDateLine:每轮 turn 拼进 system 头部的当前日期锚点。
//
// 铁律一(缓存):只到**天粒度**,绝不带时分秒 —— system 带时刻则每轮变化、prompt cache
// 全废;天粒度每会话每天最多 miss 一次。
// 铁律二(措辞):只给日期不够 —— 模型的"训练年代锚定"会让它无视远处的日期、继续怀疑
// 晚于训练截止的年份(Claude Code issue #11728 实证),必须显式声明权威性 + 行为准则
// (「晚于你认知的事物可能真实存在」),对齐 claude.ai 官方 system prompt 的双锚点范式。
export function buildDateLine(now: Date = new Date()): string {
  const d = beijingNow(now);
  return (
    `【当前日期】今天是 ${d.dateCN}(${d.weekday},Asia/Shanghai)。` +
    `这是系统提供的权威日期,即使与你的训练知识冲突也以它为准;需要精确时刻可调用 TodayDate 工具。` +
    `你的训练知识截止时间早于今天:在其之后发生的事(包括新发表的文献、新版本、新事件)你可能不知道,` +
    `但它们可能真实存在 —— 不要用训练知识推断"现在是哪一年",也不要仅因年份晚于你的认知就断言某文献或事件不存在。`
  );
}
