// 当前日期/时间单一真源 —— TodayDate 工具与 turnLoop dateLine 共用。
//
// 铁律:不自定义时区、不做 UTC 偏移换算,直接读**本地** Date 分量,跟随容器 TZ。
// 本容器已在 docker-compose 的 agent 服务显式设 TZ=Asia/Shanghai(IANA 名形式)——
// Bun/JavaScriptCore(ICU)认这种形式并实测本地 `Date` 方法返回北京时间,故
// new Date().getFullYear()/getHours() 等即当地(北京)时刻,无需任何手动偏移或 getUTC*。
// 时区只在 docker 层定义;若容器 TZ 改成别的地区,这里会透明跟随,不再假死在 +8。

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// 运行时从环境解析出的时区名(跟随容器 TZ),仅用作展示标签,不参与任何时间运算。
// TZ=Asia/Shanghai 时得 "Asia/Shanghai";TZ 换区则自动跟随。解析失败留空(不硬编码)。
const TZ_LABEL = ((): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
})();

export interface LocalNow {
  isoDate: string; // 2026-07-08
  dateCN: string; // 2026年7月8日
  weekday: string; // 星期三
  time: string; // 14:32
  tz: string; // Asia/Shanghai(跟随容器 TZ,可能为空)
}

// 直接读本地 Date 分量(容器 TZ 定义"本地"),不做 UTC 转换/偏移。
export function localNow(now: Date = new Date()): LocalNow {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return {
    isoDate: `${y}-${pad(m)}-${pad(d)}`,
    dateCN: `${y}年${m}月${d}日`,
    weekday: "星期" + WEEKDAYS[now.getDay()],
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    tz: TZ_LABEL,
  };
}

// 本地时区 ISO-8601 时间戳(带偏移,如 2026-07-18T00:41:05+08:00)—— 跟随容器 TZ,
// 供需机器可解析、又不能用 UTC 的时间字段用(会话 createdAt / 健康探针 timestamp 等)。
// 不用 toISOString()(那是 UTC 'Z');偏移取自当前本地时区,与后端 Go Format(RFC3339) 的
// 本地 +08:00 输出同构(非 UTC 转换,只是把本地时刻标注上其所在时区偏移)。
export function localISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = -now.getTimezoneOffset(); // 分钟,东为正(北京 = +480)
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

// buildDateLine:每轮 turn 拼进 system 头部的当前日期锚点。
//
// 铁律一(缓存):只到**天粒度**,绝不带时分秒 —— system 带时刻则每轮变化、prompt cache
// 全废;天粒度每会话每天最多 miss 一次。
// 铁律二(措辞):只给日期不够 —— 模型的"训练年代锚定"会让它无视远处的日期、继续怀疑
// 晚于训练截止的年份(Claude Code issue #11728 实证),必须显式声明权威性 + 行为准则
// (「晚于你认知的事物可能真实存在」),对齐 claude.ai 官方 system prompt 的双锚点范式。
export function buildDateLine(now: Date = new Date()): string {
  const d = localNow(now);
  const tzHint = d.tz ? `,${d.tz}` : "";
  return (
    `【当前日期】今天是 ${d.dateCN}(${d.weekday}${tzHint})。` +
    `这是系统提供的权威日期,即使与你的训练知识冲突也以它为准;需要精确时刻可调用 TodayDate 工具。` +
    `你的训练知识截止时间早于今天:在其之后发生的事(包括新发表的文献、新版本、新事件)你可能不知道,` +
    `但它们可能真实存在 —— 不要用训练知识推断"现在是哪一年",也不要仅因年份晚于你的认知就断言某文献或事件不存在。`
  );
}
