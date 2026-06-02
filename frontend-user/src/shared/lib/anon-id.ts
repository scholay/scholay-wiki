// 匿名访客稳定标识 —— localStorage 里的 uuid, 用于后端"独立匿名访客"去重统计。
// 随每个 API 请求 (http 实例注入 X-Anon-Id 头) + 前端 fire-and-forget 上报一起送。
// 放 shared/lib (纯 TS、无依赖), 供 http 实例与 usage-stat 共用, 不互相耦合。
const ANON_KEY = 'scholay.anon_id';

/** 取/生成匿名访客标识; 隐私模式 localStorage 抛错时返空串 (后端按"无 anon"处理)。 */
export function getAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}
