// 内网 Bearer 鉴权 —— 镜像 fork:backend 经 Authorization: Bearer <AGENT_INTERNAL_TOKEN> 调用,
// 执行器据 EXECUTOR_AUTH_TOKEN(同值)校验。
//
// H5 加固:① 常量时间比较(防 bearer timing 侧信道);② 生产(NODE_ENV=production,容器一律设)
// 下空 token = fail-closed(拒绝),只在本地裸 bun(无 NODE_ENV)才开放。容器 compose 必设 token。

import { timingSafeEqual } from "node:crypto";

const TOKEN = process.env.EXECUTOR_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || "";
const PROD = process.env.NODE_ENV === "production";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function authOK(req: Request): boolean {
  if (!TOKEN) {
    if (PROD) return false; // 生产无 token → fail-closed(绝不静默开放)
    return true; // 本地 dev(裸 bun,无 NODE_ENV)开放
  }
  const h = req.headers.get("authorization") || "";
  return safeEqual(h, "Bearer " + TOKEN);
}

export function tokenConfigured(): boolean {
  return TOKEN !== "";
}
