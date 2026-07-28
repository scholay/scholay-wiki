import { HttpResponse } from "msw";
import type { Announcement } from "@/features/admin/api/announcements";
import type { CodeSnippet } from "@/features/admin/api/code-snippets";
import type { Feedback } from "@/features/admin/api/feedback";
import type { ImportJob, Webhook } from "@/features/admin/api/feature-tools";
import type { AdminMessage } from "@/features/admin/api/messages";
import type {
  AgentModel,
  AgentProviderDTO,
} from "@/features/admin/api/model-catalog";
import type {
  AlipayConfig,
  WeChatPayConfig,
} from "@/features/admin/api/payment";
import type { ThirdPartyAccount } from "@/features/admin/api/third-party";
import type { AdminUser, UserVipStatus } from "@/features/admin/api/users";
import type { VipCode } from "@/features/admin/api/vip-codes";
import type { FeatureTool } from "@/types/feature-tool";
import {
  adminMockState as state,
  dateDaysAgo,
  isoDaysAgo,
  nextAdminId,
  persistAdminMockState,
} from "./admin-data";

type JsonRecord = Record<string, unknown>;

const binaryEncoder = new TextEncoder();

const ok = (
  data: unknown = null,
  message = "success",
  status = 200,
): Response => HttpResponse.json({ code: 0, message, data }, { status });

const fail = (status: number, message: string): Response =>
  HttpResponse.json({ code: status, message, data: null }, { status });

const readBody = async (request: Request): Promise<JsonRecord> => {
  try {
    const value: unknown = await request.clone().json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as JsonRecord)
      : {};
  } catch {
    return {};
  }
};

const asNumber = (value: string | null, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const asBoolean = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

const paginate = <T>(items: T[], page: number, pageSize: number): T[] =>
  items.slice((page - 1) * pageSize, page * pageSize);

const includes = (value: unknown, keyword: string): boolean =>
  String(value ?? "")
    .toLocaleLowerCase()
    .includes(keyword.toLocaleLowerCase());

const changed = <T>(value: T): Response => {
  persistAdminMockState();
  return ok(value, "操作成功");
};

const notFound = (label = "记录"): Response => fail(404, `${label}不存在`);

const makeTinyPdf = (title: string): ArrayBuffer => {
  const safeTitle = title.replace(/[()\\]/g, (character) => `\\${character}`);
  const stream = `BT /F1 20 Tf 72 760 Td (${safeTitle}) Tj 0 -34 Td /F1 11 Tf (Scholay admin design mock preview) Tj 0 -22 Td (This file is served by the in-browser mock backend.) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(binaryEncoder.encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = binaryEncoder.encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return binaryEncoder.encode(pdf).buffer;
};

// Valid 1×1 PNG. It is intentionally tiny: the endpoint contract and preview
// branch matter here, while keeping the browser-only mock bundle lightweight.
const mockPreviewPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218,
  99, 100, 248, 15, 0, 1, 5, 1, 1, 39, 24, 227, 102, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]).buffer;

const binaryFile = (
  body: string | ArrayBuffer,
  contentType: string,
  filename: string,
  download: boolean,
): Response => {
  const bytes =
    typeof body === "string" ? binaryEncoder.encode(body).buffer : body;
  const disposition = download ? "attachment" : "inline";
  return HttpResponse.arrayBuffer(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
};

const sessionFilePayload = (
  filename: string,
): { body: string | ArrayBuffer; contentType: string } => {
  const lower = filename.toLocaleLowerCase();
  if (lower.endsWith(".pdf")) {
    return {
      body: makeTinyPdf("Scholay session attachment preview"),
      contentType: "application/pdf",
    };
  }
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) {
    return { body: mockPreviewPng, contentType: "image/png" };
  }
  if (lower.endsWith(".json")) {
    return {
      body: JSON.stringify(
        {
          title: "多模态科研助手资料清单",
          source: "admin session mock",
          papers: 48,
          themes: ["通用多模态模型", "文献智能体", "实验自动化"],
        },
        null,
        2,
      ),
      contentType: "application/json; charset=utf-8",
    };
  }
  if (lower.endsWith(".csv")) {
    return {
      body: "theme,papers,year_from\nmultimodal models,18,2021\nliterature agents,16,2022\nlab automation,14,2020\n",
      contentType: "text/csv; charset=utf-8",
    };
  }
  if (lower.endsWith(".tex")) {
    return {
      body: "\\section{Mock research note}\nThis preview is served from the isolated session workspace.",
      contentType: "application/x-tex; charset=utf-8",
    };
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return {
      body: "# 多模态科研助手 · 会话附件\n\n这是管理后台文件预览的 Mock 内容。\n\n- 48 篇候选论文\n- 3 条主题主线\n- 时间范围：2021–2026\n\n> 文件来自会话隔离工作区，仅供设计调试。",
      contentType: "text/markdown; charset=utf-8",
    };
  }
  return {
    body: "Scholay 管理端会话文件预览\n\n该文件由纯前端 Mock 后端返回，可用于验证文本预览、下载和错误状态布局。",
    contentType: "text/plain; charset=utf-8",
  };
};

const maskRecord = <T extends JsonRecord>(
  source: T,
  showSensitive: boolean,
  fields: string[],
): T => {
  if (showSensitive) return { ...source };
  const next: JsonRecord = { ...source };
  for (const field of fields) {
    if (next[field]) next[field] = "••••••••••••";
  }
  return next as T;
};

const updateConfig = async (
  request: Request,
  target: object,
): Promise<Response> => {
  Object.assign(target, await readBody(request));
  return changed(target);
};

const daysBetween = (iso: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

const dailySeries = (
  days: number,
  base: number,
  swing: number,
): Array<{ date: string; value: number }> =>
  Array.from({ length: days }, (_, index) => ({
    date: dateDaysAgo(days - 1 - index),
    value: Math.max(
      0,
      Math.round(base + Math.sin(index * 0.72) * swing + index * swing * 0.035),
    ),
  }));

const buildDashboard = () => {
  const paid = state.orders.filter((order) => order.status === "paid");
  const revenue = paid.reduce((sum, order) => sum + order.final_amount, 0);
  const revenueToday = paid
    .filter((order) => daysBetween(order.created_at) === 0)
    .reduce((sum, order) => sum + order.final_amount, 0);
  const revenue30 = paid
    .filter((order) => daysBetween(order.created_at) < 30)
    .reduce((sum, order) => sum + order.final_amount, 0);
  const growth = dailySeries(30, 18, 7);
  const revenueTrend = Array.from({ length: 30 }, (_, index) => {
    const date = dateDaysAgo(29 - index);
    const value = paid
      .filter((order) => order.created_at.slice(0, 10) === date)
      .reduce((sum, order) => sum + order.final_amount, 0);
    return {
      date,
      value: Number((value || 68 + Math.sin(index * 0.8) * 38).toFixed(2)),
    };
  });
  return {
    total_users: 12_486,
    new_users_today: growth.at(-1)?.value ?? 0,
    new_users_7d: growth.slice(-7).reduce((sum, item) => sum + item.value, 0),
    new_users_30d: growth.reduce((sum, item) => sum + item.value, 0),
    paid_users: 3_284,
    free_users: 9_202,
    total_revenue: Number((428_650.8 + revenue).toFixed(2)),
    revenue_today: Number((1_286 + revenueToday).toFixed(2)),
    revenue_7d: Number(
      (
        12_840 +
        paid
          .filter((order) => daysBetween(order.created_at) < 7)
          .reduce((sum, order) => sum + order.final_amount, 0)
      ).toFixed(2),
    ),
    revenue_30d: Number((48_920 + revenue30).toFixed(2)),
    total_orders: 8_916 + state.orders.length,
    paid_orders: 8_204 + paid.length,
    pending_orders:
      94 + state.orders.filter((order) => order.status === "pending").length,
    cost_today_yuan: 386.42,
    cost_30d_yuan: 9_842.78,
    total_codes:
      18_640 + state.vipCodes.reduce((sum, code) => sum + code.max_uses, 0),
    redeemed_codes:
      12_906 + state.vipCodes.reduce((sum, code) => sum + code.used_count, 0),
    user_growth_chart: growth,
    revenue_trend_chart: revenueTrend,
    cost_trend_chart: dailySeries(30, 286, 54).map((item) => ({
      ...item,
      value: Number((item.value + 0.42).toFixed(2)),
    })),
  };
};

const handleDashboard = (
  method: string,
  path: string,
): Response | undefined => {
  if (method === "GET" && path === "/admin/dashboard/statistics")
    return ok(buildDashboard());
  return undefined;
};

const handleUsers = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (method === "GET" && path === "/admin/users/metrics") {
    const days = asNumber(query.get("days"), 30);
    const granularity = (query.get("granularity") ?? "day") as
      | "day"
      | "week"
      | "month";
    const pointCount =
      granularity === "month"
        ? Math.min(12, Math.ceil(days / 30))
        : granularity === "week"
          ? Math.ceil(days / 7)
          : days;
    const registrations = dailySeries(
      pointCount,
      granularity === "day" ? 19 : 122,
      7,
    );
    const dailyActive = dailySeries(Math.min(days, 90), 1_380, 260);
    return ok({
      granularity,
      days,
      registrations,
      sources: [
        { name: "微信网页", value: 3_682 },
        { name: "微信小程序", value: 2_941 },
        { name: "邮箱注册", value: 2_206 },
        { name: "GitHub", value: 1_842 },
        { name: "Google", value: 1_126 },
        { name: "ORCID / 其他", value: 689 },
      ],
      hourly_activity: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        value: Math.round(
          90 +
            Math.sin(((hour - 7) / 24) * Math.PI * 2) * 68 +
            (hour >= 9 && hour <= 23 ? 110 : 20),
        ),
      })),
      mau_trend: dailySeries(
        Math.min(12, Math.ceil(days / 30) || 1),
        7_420,
        520,
      ),
      daily_active: dailyActive,
      registrations_total: registrations.reduce(
        (sum, item) => sum + item.value,
        0,
      ),
      active_total: 8_734,
    });
  }

  if (method === "GET" && path === "/admin/users/stats") {
    return ok({
      total: state.users.length,
      active: state.users.filter((user) => user.status === 1).length,
      inactive: state.users.filter((user) => user.status === 0).length,
      frozen: state.users.filter((user) => user.status === 2).length,
      verified: state.users.filter((user) => user.email_verified).length,
      pro: state.users.filter((user) => user.vip_tier === "pro").length,
      max: state.users.filter((user) => user.vip_tier === "max").length,
      new_today: state.users.filter(
        (user) => daysBetween(user.created_at) === 0,
      ).length,
    });
  }

  if (method === "GET" && path === "/admin/users") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    const keyword = (query.get("q") ?? "").trim();
    const role = query.get("role");
    const status = query.get("status");
    const tier = query.get("tier");
    const verified = query.get("email_verified");
    const createdFrom = query.get("created_from");
    const createdTo = query.get("created_to");
    const sortBy = query.get("sort_by") ?? "created_at";
    const sortOrder = query.get("sort_order") === "asc" ? 1 : -1;
    let items = state.users.filter((user) => {
      if (
        keyword &&
        ![user.id, user.username, user.email, user.phone].some((value) =>
          includes(value, keyword),
        )
      )
        return false;
      if (role && user.role !== role) return false;
      if (status != null && status !== "" && user.status !== Number(status))
        return false;
      if (tier && (user.vip_tier ?? "free") !== tier) return false;
      if (verified && Number(user.email_verified) !== Number(verified))
        return false;
      if (createdFrom && user.created_at.slice(0, 10) < createdFrom)
        return false;
      if (createdTo && user.created_at.slice(0, 10) > createdTo) return false;
      return true;
    });
    items = [...items].sort((a, b) => {
      const left = String(a[sortBy as keyof AdminUser] ?? "");
      const right = String(b[sortBy as keyof AdminUser] ?? "");
      return left.localeCompare(right) * sortOrder;
    });
    return ok({
      total: items.length,
      users: paginate(items, page, pageSize),
      page,
      page_size: pageSize,
    });
  }

  if (method === "POST" && path === "/admin/users/batch-delete") {
    const body = await readBody(request);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    state.users = state.users.filter((user) => !ids.includes(user.id));
    return changed({ deleted: ids.length });
  }

  const userMatch = path.match(/^\/admin\/users\/(\d+)(?:\/(.*))?$/);
  if (!userMatch) return undefined;
  const id = Number(userMatch[1]);
  const action = userMatch[2] ?? "";
  const user = state.users.find((item) => item.id === id);
  if (!user) return notFound("用户");

  if (method === "GET" && action === "detail") {
    const providers = [
      {
        provider:
          user.register_source === "email"
            ? "password"
            : user.register_source || "password",
        created_at: user.created_at,
      },
    ];
    if (user.email_verified && providers[0].provider !== "password") {
      providers.push({
        provider: "password",
        created_at: isoDaysAgo(Math.max(1, daysBetween(user.created_at) - 3)),
      });
    }
    return ok({
      id: user.id,
      username: user.username ?? "",
      email: user.email ?? "",
      email_verified: user.email_verified,
      phone: user.phone ?? "",
      phone_verified: user.phone_verified,
      auth_providers: providers,
      register_source: user.register_source,
    });
  }

  if (method === "GET" && action === "vip") return ok(state.userVips[id]);

  if (method === "POST" && action === "vip") {
    const body = await readBody(request);
    const tier = String(body.tier ?? "pro") as UserVipStatus["tier"];
    const days = Number(body.days ?? 30);
    const previous = state.userVips[id];
    const expiry = new Date(
      Math.max(Date.now(), new Date(previous.expires_at ?? 0).getTime()) +
        days * 86_400_000,
    ).toISOString();
    user.vip_tier = tier;
    user.vip_expires_at = expiry;
    state.userVips[id] = {
      ...previous,
      tier,
      cycle:
        body.cycle === "yearly"
          ? "yearly"
          : body.cycle === "monthly"
            ? "monthly"
            : previous.cycle,
      expires_at: expiry,
      token: {
        ...previous.token,
        ceiling:
          tier === "max" ? 9_000_000 : tier === "pro" ? 3_000_000 : 350_000,
      },
    };
    return changed(state.userVips[id]);
  }

  if (method === "DELETE" && action === "vip") {
    user.vip_tier = "free";
    user.vip_expires_at = null;
    state.userVips[id] = {
      ...state.userVips[id],
      tier: "free",
      cycle: undefined,
      expires_at: null,
      token: { ...state.userVips[id].token, ceiling: 350_000 },
    };
    return changed(state.userVips[id]);
  }

  if (method === "POST" && action === "wallet/adjust") {
    const body = await readBody(request);
    const vip = state.userVips[id];
    const amount = Number(body.amount ?? 0);
    const kind = body.kind === "temp" ? "temp" : "perm";
    vip.credit[kind] = Math.max(0, vip.credit[kind] + amount);
    vip.credit.total = vip.credit.temp + vip.credit.perm;
    return changed(vip.credit);
  }

  if (method === "GET" && action === "orders") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 10);
    let items = state.orders.filter((order) => order.user_id === id);
    if (query.get("type"))
      items = items.filter((order) => order.order_type === query.get("type"));
    if (query.get("status"))
      items = items.filter((order) => order.status === query.get("status"));
    return ok({ items: paginate(items, page, pageSize), total: items.length });
  }

  if (method === "GET" && action === "transactions") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 10);
    const rows = Array.from({ length: 14 }, (_, index) => {
      const positive = index % 4 !== 2;
      const amount = positive ? [50, 180, 500][index % 3] : -30;
      return {
        id: id * 100 + index,
        type: positive
          ? index % 3 === 0
            ? "recharge"
            : "grant_subscription"
          : "reset_consume",
        amount,
        temp_after: Math.max(0, 780 - index * 30),
        perm_after: 220,
        ref_type: positive ? "order" : "quota_reset",
        ref_id: `••••${String(8160 + index)}`,
        note: positive ? "会员权益或经费入账" : "管理员触发额度重置",
        created_at: isoDaysAgo(index * 3),
      };
    });
    const type = query.get("type");
    const filtered = type ? rows.filter((row) => row.type === type) : rows;
    return ok({
      items: paginate(filtered, page, pageSize),
      total: filtered.length,
    });
  }

  if (method === "GET" && action === "redemptions") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 10);
    const rows = state.vipCodes
      .filter((code) => code.redeemed_by_user_id === id || code.used_count > 0)
      .slice(0, 8)
      .map((code, index) => ({
        redeemed_at: code.redeemed_at ?? isoDaysAgo(index + 4),
        code: `${code.code.slice(0, 4)}••••${code.code.slice(-3)}`,
        grant_kind: code.grant_kind,
        grant_tier: code.grant_tier,
        grant_days: code.grant_days,
        grant_credits: code.grant_credits,
        credit_kind: code.credit_kind,
        note: code.note,
      }));
    return ok({ items: paginate(rows, page, pageSize), total: rows.length });
  }

  if (method === "PUT" && action === "freeze") {
    user.status = 2;
    user.frozen_at = new Date().toISOString();
    user.frozen_reason = "管理员在 Mock 后台执行冻结";
    return changed(user);
  }
  if (method === "PUT" && action === "unfreeze") {
    user.status = 1;
    user.frozen_at = null;
    user.frozen_reason = "";
    return changed(user);
  }
  if (method === "PUT" && action === "role") {
    const body = await readBody(request);
    if (
      ["user", "operations", "admin", "super_admin"].includes(String(body.role))
    ) {
      user.role = body.role as AdminUser["role"];
    }
    return changed(user);
  }
  if (method === "DELETE" && !action) {
    state.users = state.users.filter((item) => item.id !== id);
    return changed({ id });
  }
  return undefined;
};

const handleOrders = (
  method: string,
  path: string,
  query: URLSearchParams,
): Response | undefined => {
  if (!path.startsWith("/admin/billing/orders") || method !== "GET")
    return undefined;
  const days = asNumber(query.get("days"), 30);
  let items = state.orders.filter(
    (order) => daysBetween(order.created_at) < days,
  );
  const status = query.get("status");
  const type = query.get("type");
  const keyword = (query.get("keyword") ?? "").trim();
  if (status) items = items.filter((order) => order.status === status);
  if (type) items = items.filter((order) => order.order_type === type);
  if (keyword) {
    items = items.filter((order) =>
      [order.user_id, order.username, order.email, order.order_no].some(
        (value) => includes(value, keyword),
      ),
    );
  }

  if (path === "/admin/billing/orders/stats") {
    const paid = items.filter((order) => order.status === "paid");
    const sum = (rows: typeof paid) =>
      Number(
        rows.reduce((total, row) => total + row.final_amount, 0).toFixed(2),
      );
    const byType = (kind: "recharge" | "subscription") =>
      paid.filter((order) => order.order_type === kind);
    const today = paid.filter((order) => daysBetween(order.created_at) === 0);
    const allPaid = state.orders.filter((order) => order.status === "paid");
    return ok({
      days,
      totals: {
        revenue_today: sum(today),
        revenue: sum(paid),
        revenue_all: sum(allPaid),
        recharge_today: sum(
          today.filter((order) => order.order_type === "recharge"),
        ),
        recharge_revenue: sum(byType("recharge")),
        recharge_all: sum(
          allPaid.filter((order) => order.order_type === "recharge"),
        ),
        subscription_today: sum(
          today.filter((order) => order.order_type === "subscription"),
        ),
        subscription_revenue: sum(byType("subscription")),
        subscription_all: sum(
          allPaid.filter((order) => order.order_type === "subscription"),
        ),
        paid_today: today.length,
        paid_count: paid.length,
        paid_all: allPaid.length,
        redeemed_today: 18,
        redeemed_codes: 264,
        redeemed_all: 12_906,
        pending_count: items.filter((order) => order.status === "pending")
          .length,
        expired_count: items.filter((order) => order.status === "expired")
          .length,
      },
      daily: Array.from({ length: days }, (_, index) => {
        const date = dateDaysAgo(days - 1 - index);
        const rows = paid.filter((order) => order.created_at.startsWith(date));
        return {
          date,
          recharge: sum(
            rows.filter((order) => order.order_type === "recharge"),
          ),
          subscription: sum(
            rows.filter((order) => order.order_type === "subscription"),
          ),
          orders: rows.length,
        };
      }),
    });
  }

  if (path === "/admin/billing/orders") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    return ok({ items: paginate(items, page, pageSize), total: items.length });
  }
  return undefined;
};

const handleAnalytics = (
  method: string,
  path: string,
  query: URLSearchParams,
): Response | undefined => {
  if (method !== "GET" || !path.startsWith("/admin/analytics/"))
    return undefined;
  const start = query.get("start") ?? isoDaysAgo(29);
  const end = query.get("end") ?? new Date().toISOString();
  if (path === "/admin/analytics/overview") {
    return ok({
      stats: {
        pageviews: { value: 186_420, prev: 154_860 },
        visits: { value: 92_684, prev: 81_240 },
        visitors: { value: 48_291, prev: 42_778 },
        bounces: { value: 31_984, prev: 30_482 },
        totaltime: { value: 48_882_910, prev: 41_920_400 },
      },
      active: { visitors: 218 },
      start,
      end,
    });
  }
  if (path === "/admin/analytics/active")
    return ok({ visitors: 218 + (Math.floor(Date.now() / 30_000) % 17) });
  if (path === "/admin/analytics/pageviews") {
    const unit = query.get("unit") === "hour" ? "hour" : "day";
    const count = unit === "hour" ? 24 : 30;
    const pageviews = Array.from({ length: count }, (_, index) => ({
      x:
        unit === "hour"
          ? new Date(Date.now() - (count - 1 - index) * 3_600_000).toISOString()
          : dateDaysAgo(count - 1 - index),
      y: Math.round(4_800 + Math.sin(index * 0.68) * 1_420 + index * 42),
    }));
    return ok({
      series: {
        pageviews,
        sessions: pageviews.map((point) => ({
          ...point,
          y: Math.round(point.y * 0.51),
        })),
      },
      unit,
      start,
      end,
    });
  }
  if (path === "/admin/analytics/top") {
    const type = query.get("type") ?? "url";
    const limit = asNumber(query.get("limit"), 10);
    const values: Record<string, string[]> = {
      url: [
        "/search",
        "/claw",
        "/paper/attention-is-all-you-need",
        "/prism",
        "/peer-review",
        "/tools",
        "/pricing",
        "/library",
      ],
      referrer: [
        "Google",
        "直接访问",
        "Bing",
        "微信",
        "enterscholar.com",
        "GitHub",
      ],
      country: [
        "China",
        "United States",
        "Singapore",
        "United Kingdom",
        "Japan",
        "Germany",
      ],
      browser: ["Chrome", "Safari", "Edge", "Firefox", "WeChat"],
      os: ["Windows", "macOS", "iOS", "Android", "Linux"],
      device: ["desktop", "mobile", "tablet"],
    };
    return ok({
      type,
      items: (values[type] ?? values.url).slice(0, limit).map((x, index) => ({
        x,
        y: Math.round(24_820 / (index + 1) + index * 230),
      })),
      start,
      end,
    });
  }
  return undefined;
};

const tokenRows = Array.from({ length: 96 }, (_, index) => {
  const feature = [
    "smart_search",
    "claw",
    "peer_review",
    "matrix",
    "translate",
    "wechat_oa",
    "prism",
  ][index % 7];
  const model = [
    "deepseek-v4-flash",
    "qwen3.7-plus",
    "deepseek-v4-pro",
    "kimi-k3",
  ][index % 4];
  const user =
    index % 11 === 0 ? null : state.users[index % state.users.length];
  const input = 12_000 + (index % 9) * 4_820;
  const output = 2_400 + (index % 7) * 1_140;
  const cacheRead = index % 3 === 0 ? 8_200 + index * 31 : 0;
  return {
    id: index + 1,
    user_id: user?.id ?? null,
    username: user?.username ?? "公众号访客",
    email: user?.email ?? "",
    feature,
    source: index % 5 === 0 ? "project" : "agent",
    provider: model.startsWith("qwen")
      ? "dashscope"
      : model.startsWith("kimi")
        ? "moonshot"
        : "deepseek",
    account_id: model.startsWith("deepseek") ? 1 : 2,
    account_name: model.startsWith("deepseek")
      ? "平台默认端点"
      : "国内模型端点",
    model,
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output + cacheRead,
    cache_read_tokens: cacheRead,
    cache_creation_tokens: index % 8 === 0 ? 2_600 : 0,
    request_id: `req_mock_${String(index + 1).padStart(5, "0")}`,
    created_at: isoDaysAgo(index % 30, 8 + (index % 14)),
  };
});

const filterTokenRows = (query: URLSearchParams) => {
  const days = asNumber(query.get("days"), 30);
  const start = query.get("start_date");
  const end = query.get("end_date");
  const keyword = (query.get("keyword") ?? "").trim();
  return tokenRows.filter((row) => {
    if (!start && daysBetween(row.created_at) >= days) return false;
    if (start && row.created_at.slice(0, 10) < start) return false;
    if (end && row.created_at.slice(0, 10) > end) return false;
    if (query.get("feature") && row.feature !== query.get("feature"))
      return false;
    if (query.get("source") && row.source !== query.get("source")) return false;
    if (query.get("model") && row.model !== query.get("model")) return false;
    if (query.get("provider") && row.provider !== query.get("provider"))
      return false;
    if (query.get("anon") === "1" && row.user_id !== null) return false;
    if (
      keyword &&
      ![row.user_id, row.username, row.email].some((value) =>
        includes(value, keyword),
      )
    )
      return false;
    return true;
  });
};

const sumTokens = (rows: typeof tokenRows) => ({
  total_tokens: rows.reduce((sum, row) => sum + row.total_tokens, 0),
  input_tokens: rows.reduce((sum, row) => sum + row.input_tokens, 0),
  output_tokens: rows.reduce((sum, row) => sum + row.output_tokens, 0),
  cache_read_tokens: rows.reduce((sum, row) => sum + row.cache_read_tokens, 0),
  cache_creation_tokens: rows.reduce(
    (sum, row) => sum + row.cache_creation_tokens,
    0,
  ),
  total_calls: rows.length,
  unique_users: new Set(
    rows.map((row) => row.user_id).filter((id) => id !== null),
  ).size,
  anon_calls: rows.filter((row) => row.user_id === null).length,
  anon_tokens: rows
    .filter((row) => row.user_id === null)
    .reduce((sum, row) => sum + row.total_tokens, 0),
});

const tokenBreakdown = (
  rows: typeof tokenRows,
  key: "feature" | "source" | "model" | "provider",
) =>
  Array.from(new Set(rows.map((row) => row[key])))
    .map((value) => {
      const group = rows.filter((row) => row[key] === value);
      const sums = sumTokens(group);
      return {
        key: value,
        label: value.replaceAll("_", " "),
        total_tokens: sums.total_tokens,
        input_tokens: sums.input_tokens,
        output_tokens: sums.output_tokens,
        cache_read_tokens: sums.cache_read_tokens,
        cache_creation_tokens: sums.cache_creation_tokens,
        calls: group.length,
      };
    })
    .sort((a, b) => b.total_tokens - a.total_tokens);

const handleTokenUsage = (
  method: string,
  path: string,
  query: URLSearchParams,
): Response | undefined => {
  if (method !== "GET" || !path.startsWith("/admin/llm-token-usage/"))
    return undefined;
  const rows = filterTokenRows(query);
  if (path === "/admin/llm-token-usage/logs") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    const sorted = [...rows].sort((a, b) =>
      query.get("sort") === "total_tokens"
        ? b.total_tokens - a.total_tokens
        : b.created_at.localeCompare(a.created_at),
    );
    return ok({ logs: paginate(sorted, page, pageSize), total: sorted.length });
  }
  if (path === "/admin/llm-token-usage/facets") {
    return ok({
      models: [...new Set(tokenRows.map((row) => row.model))],
      providers: [...new Set(tokenRows.map((row) => row.provider))],
      accounts: [
        { id: 1, name: "平台默认端点" },
        { id: 2, name: "国内模型端点" },
      ],
    });
  }
  if (path === "/admin/llm-token-usage/export") {
    const header =
      "id,user_id,username,feature,source,provider,model,input_tokens,output_tokens,total_tokens,created_at";
    const csv = [
      header,
      ...rows.map((row) =>
        [
          row.id,
          row.user_id ?? "",
          `"${row.username}"`,
          row.feature,
          row.source,
          row.provider,
          row.model,
          row.input_tokens,
          row.output_tokens,
          row.total_tokens,
          row.created_at,
        ].join(","),
      ),
    ].join("\n");
    return new HttpResponse(`\ufeff${csv}`, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition":
          'attachment; filename="llm-token-usage-mock.csv"',
      },
    });
  }
  if (path === "/admin/llm-token-usage/summary") {
    const days = asNumber(query.get("days"), 30);
    const byFeature = tokenBreakdown(rows, "feature");
    const byModel = tokenBreakdown(rows, "model");
    const daily = Array.from({ length: days }, (_, index) => {
      const date = dateDaysAgo(days - 1 - index);
      const group = rows.filter((row) => row.created_at.startsWith(date));
      const totals = sumTokens(group);
      return {
        date,
        total_tokens: totals.total_tokens,
        input_tokens: totals.input_tokens,
        output_tokens: totals.output_tokens,
        cache_read_tokens: totals.cache_read_tokens,
        cache_creation_tokens: totals.cache_creation_tokens,
        calls: group.length,
      };
    });
    const dailyBy = (key: "model" | "feature") =>
      daily.flatMap((point) =>
        Array.from(new Set(rows.map((row) => row[key])))
          .map((value) => {
            const group = rows.filter(
              (row) =>
                row.created_at.startsWith(point.date) && row[key] === value,
            );
            const totals = sumTokens(group);
            return {
              date: point.date,
              key: value,
              label: value.replaceAll("_", " "),
              total_tokens: totals.total_tokens,
              input_tokens: totals.input_tokens,
              output_tokens: totals.output_tokens,
              cache_read_tokens: totals.cache_read_tokens,
              cache_creation_tokens: totals.cache_creation_tokens,
              calls: group.length,
            };
          })
          .filter((item) => item.calls > 0),
      );
    const topUsers = Array.from(new Set(rows.map((row) => row.user_id)))
      .map((userId) => {
        const group = rows.filter((row) => row.user_id === userId);
        const totals = sumTokens(group);
        return {
          user_id: userId,
          username: group[0]?.username ?? "",
          email: group[0]?.email ?? "",
          total_tokens: totals.total_tokens,
          input_tokens: totals.input_tokens,
          output_tokens: totals.output_tokens,
          cache_read_tokens: totals.cache_read_tokens,
          cache_creation_tokens: totals.cache_creation_tokens,
          calls: group.length,
        };
      })
      .sort((a, b) => b.total_tokens - a.total_tokens)
      .slice(0, 10);
    return ok({
      days,
      totals: sumTokens(rows),
      daily,
      by_feature: byFeature,
      by_source: tokenBreakdown(rows, "source"),
      by_model: byModel,
      by_provider: tokenBreakdown(rows, "provider"),
      top_users: topUsers,
      daily_by_model: dailyBy("model"),
      daily_by_feature: dailyBy("feature"),
    });
  }
  return undefined;
};

const handleUsageStats = (
  method: string,
  path: string,
  query: URLSearchParams,
): Response | undefined => {
  if (method !== "GET" || !path.startsWith("/admin/usage-stats/"))
    return undefined;
  const start = query.get("start_date");
  const end = query.get("end_date");
  const days =
    start && end
      ? Math.max(
          1,
          Math.round(
            (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000,
          ) + 1,
        )
      : 30;
  if (path === "/admin/usage-stats/summary") {
    const byFeature = [
      ["smart_search", "智能文献搜索", 28_420, 4_982, 2_104],
      ["claw", "智能助手", 19_684, 3_821, 842],
      ["paper_detail", "论文详情", 16_920, 3_108, 4_286],
      ["prism", "智能写作", 8_742, 1_930, 218],
      ["peer_review", "智能审稿", 5_286, 1_142, 82],
      ["matrix", "矩阵分析", 4_810, 1_026, 104],
      ["translate", "论文翻译", 3_942, 928, 182],
    ].map(([feature, featureName, count, uniqueUsers, uniqueAnon]) => ({
      feature,
      feature_name: featureName,
      count,
      unique_users: uniqueUsers,
      unique_anon: uniqueAnon,
    }));
    const daily = dailySeries(days, 2_940, 620).map(({ date, value }) => ({
      date,
      count: value,
    }));
    return ok({
      days,
      total: byFeature.reduce((sum, item) => sum + Number(item.count), 0),
      today: daily.at(-1)?.count ?? 0,
      unique_users: 8_492,
      unique_anon: 5_804,
      by_feature: byFeature,
      daily,
    });
  }
  if (path === "/admin/usage-stats/peer-review-funnel") {
    return ok({
      stages: [
        {
          action: "open",
          label: "打开审稿",
          submissions: 2_480,
          events: 3_120,
        },
        {
          action: "upload",
          label: "上传论文",
          submissions: 1_984,
          events: 2_140,
        },
        {
          action: "metadata",
          label: "完成信息确认",
          submissions: 1_702,
          events: 1_820,
        },
        {
          action: "submit",
          label: "提交审稿",
          submissions: 1_428,
          events: 1_486,
        },
        {
          action: "complete",
          label: "生成完整报告",
          submissions: 1_286,
          events: 1_286,
        },
        {
          action: "export",
          label: "导出报告",
          submissions: 842,
          events: 1_034,
        },
      ],
    });
  }
  return undefined;
};

const handleFeedback = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (method === "GET" && path === "/admin/feedbacks/stats") {
    const counts = Object.fromEntries(
      ["pending", "processed", "replied", "closed"].map((status) => [
        status,
        state.feedbacks.filter((feedback) => feedback.status === status).length,
      ]),
    );
    return ok({
      total: state.feedbacks.length,
      ...counts,
      unassigned: state.feedbacks.filter((feedback) => !feedback.assignedTo)
        .length,
    });
  }
  if (method === "GET" && path === "/admin/feedbacks") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("pageSize"), 20);
    const keyword = (query.get("keyword") ?? "").trim();
    let items = state.feedbacks.filter((feedback) => {
      if (query.get("status") && feedback.status !== query.get("status"))
        return false;
      if (query.get("category") && feedback.category !== query.get("category"))
        return false;
      if (
        query.get("email") &&
        !includes(feedback.email, query.get("email") ?? "")
      )
        return false;
      if (query.get("unassigned") === "true" && feedback.assignedTo)
        return false;
      if (
        keyword &&
        ![feedback.content, feedback.email, feedback.username].some((value) =>
          includes(value, keyword),
        )
      )
        return false;
      return true;
    });
    items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok({
      total: items.length,
      list: paginate(items, page, pageSize),
      page,
      pageSize,
    });
  }
  const match = path.match(/^\/admin\/feedbacks\/(\d+)(?:\/(reply|status))?$/);
  if (!match) return undefined;
  const id = Number(match[1]);
  const action = match[2] ?? "";
  const feedback = state.feedbacks.find((item) => item.id === id);
  if (!feedback) return notFound("反馈");
  if (method === "GET" && !action) {
    return ok({ feedback, attachments: state.feedbackAttachments[id] ?? [] });
  }
  if (method === "DELETE" && !action) {
    state.feedbacks = state.feedbacks.filter((item) => item.id !== id);
    return changed({ id });
  }
  if (method === "POST" && action === "reply") {
    const body = await readBody(request);
    feedback.replyContent = String(body.replyContent ?? "");
    feedback.repliedAt = new Date().toISOString();
    feedback.repliedBy = "Mock 管理员";
    feedback.status = "replied";
    feedback.updatedAt = new Date().toISOString();
    return changed(feedback);
  }
  if (method === "PUT" && action === "status") {
    const body = await readBody(request);
    feedback.status = String(
      body.status ?? feedback.status,
    ) as Feedback["status"];
    feedback.updatedAt = new Date().toISOString();
    return changed(feedback);
  }
  return undefined;
};

const handleVipCodes = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (path === "/admin/vip-codes" && method === "GET") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    const status = query.get("status");
    const tier = query.get("tier");
    const redeemer = (query.get("redeemer") ?? "").trim();
    let rows = state.vipCodes.filter((code) => {
      if (status === "redeemed" && code.used_count === 0) return false;
      if (status === "unredeemed" && code.used_count >= code.max_uses)
        return false;
      if (tier && code.grant_tier !== tier) return false;
      if (redeemer) {
        const user = state.users.find(
          (item) => item.id === code.redeemed_by_user_id,
        );
        if (
          !user ||
          ![user.id, user.username, user.email, user.phone].some((value) =>
            includes(value, redeemer),
          )
        )
          return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return ok({ codes: paginate(rows, page, pageSize), total: rows.length });
  }
  if (path === "/admin/vip-codes" && method === "POST") {
    const body = await readBody(request);
    const count = Math.min(100, Math.max(1, Number(body.count ?? 1)));
    const created: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const id = nextAdminId(state.vipCodes);
      const codeText = `MOCK-${String(Date.now()).slice(-5)}-${String(id).padStart(4, "0")}`;
      const validDays = Number(body.valid_days ?? 7);
      const code: VipCode = {
        id,
        code: codeText,
        grant_kind: String(body.grant_kind ?? "tier"),
        grant_tier: String(body.tier ?? "pro"),
        grant_days: Number(body.grant_days ?? 7),
        grant_credits: Number(body.grant_credits ?? 0),
        credit_kind: String(body.credit_kind ?? "temp"),
        credit_validity_days: Number(body.credit_validity_days ?? 30),
        max_uses: Number(body.max_uses ?? 1),
        used_count: 0,
        revoked_at: null,
        valid_until: new Date(
          Date.now() + validDays * 86_400_000,
        ).toISOString(),
        redeemed_by_user_id: null,
        redeemed_at: null,
        note: String(body.note ?? ""),
        created_by: 1,
        created_at: new Date().toISOString(),
      };
      state.vipCodes.unshift(code);
      created.push(codeText);
    }
    persistAdminMockState();
    return ok({ codes: created, count: created.length });
  }
  const match = path.match(
    /^\/admin\/vip-codes\/(\d+)\/(status|extend|max-uses|grant-days)$/,
  );
  if (!match || method !== "PUT") return undefined;
  const code = state.vipCodes.find((item) => item.id === Number(match[1]));
  if (!code) return notFound("兑换码");
  const body = await readBody(request);
  if (match[2] === "status")
    code.revoked_at = asBoolean(body.revoked) ? new Date().toISOString() : null;
  if (match[2] === "extend") {
    const base = Math.max(
      Date.now(),
      new Date(code.valid_until ?? 0).getTime(),
    );
    code.valid_until = new Date(
      base + Number(body.days ?? 1) * 86_400_000,
    ).toISOString();
  }
  if (match[2] === "max-uses")
    code.max_uses += Math.max(1, Number(body.add ?? 1));
  if (match[2] === "grant-days")
    code.grant_days = Math.max(1, Number(body.days ?? 1));
  return changed(code);
};

const handleContentCrud = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (method === "GET" && path === "/admin/announcements")
    return ok({ items: state.announcements });
  if (method === "POST" && path === "/admin/announcements") {
    const body = await readBody(request);
    const now = new Date().toISOString();
    const item = {
      ...body,
      id: nextAdminId(state.announcements),
      created_by: 1,
      created_at: now,
      updated_at: now,
    } as unknown as Announcement;
    state.announcements.unshift(item);
    return changed(item);
  }
  const announcementMatch = path.match(/^\/admin\/announcements\/(\d+)$/);
  if (announcementMatch) {
    const item = state.announcements.find(
      (entry) => entry.id === Number(announcementMatch[1]),
    );
    if (!item) return notFound("公告");
    if (method === "PUT") {
      Object.assign(item, await readBody(request), {
        updated_at: new Date().toISOString(),
      });
      return changed(item);
    }
    if (method === "DELETE") {
      state.announcements = state.announcements.filter(
        (entry) => entry.id !== item.id,
      );
      return changed({ id: item.id });
    }
  }

  if (method === "GET" && path === "/admin/code-snippets")
    return ok(state.snippets);
  if (method === "POST" && path === "/admin/code-snippets") {
    const body = await readBody(request);
    const now = new Date().toISOString();
    const item = {
      ...body,
      id: nextAdminId(state.snippets),
      created_at: now,
      updated_at: now,
    } as unknown as CodeSnippet;
    state.snippets.unshift(item);
    return changed(item);
  }
  const snippetMatch = path.match(/^\/admin\/code-snippets\/(\d+)$/);
  if (snippetMatch) {
    const item = state.snippets.find(
      (entry) => entry.id === Number(snippetMatch[1]),
    );
    if (!item) return notFound("代码片段");
    if (method === "PUT") {
      Object.assign(item, await readBody(request), {
        updated_at: new Date().toISOString(),
      });
      return changed(item);
    }
    if (method === "DELETE") {
      state.snippets = state.snippets.filter((entry) => entry.id !== item.id);
      return changed({ id: item.id });
    }
  }

  if (method === "GET" && path === "/admin/messages") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    const status = query.get("status");
    const rows = status
      ? state.messages.filter((item) => item.status === status)
      : state.messages;
    return ok({ total: rows.length, list: paginate(rows, page, pageSize) });
  }
  if (method === "POST" && path === "/admin/messages") {
    const body = await readBody(request);
    const now = new Date().toISOString();
    const item = {
      ...body,
      id: nextAdminId(state.messages),
      sender_id: 1,
      sender_name: "Mock 管理员",
      recipient_count: 0,
      read_count: 0,
      created_at: now,
      updated_at: now,
    } as unknown as AdminMessage;
    state.messages.unshift(item);
    return changed(item);
  }
  const sendMatch = path.match(/^\/admin\/messages\/(\d+)\/send$/);
  if (sendMatch && method === "POST") {
    const item = state.messages.find(
      (entry) => entry.id === Number(sendMatch[1]),
    );
    if (!item) return notFound("消息");
    item.status = "sent";
    item.send_at = new Date().toISOString();
    item.recipient_count =
      item.send_type === "all"
        ? 12_486
        : item.send_type === "plans"
          ? 3_284
          : 12;
    item.updated_at = new Date().toISOString();
    return changed(item);
  }
  return undefined;
};

const handleHotContent = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (!path.startsWith("/admin/hot-content/")) return undefined;
  if (method === "GET" && path === "/admin/hot-content/keywords") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 50);
    const type = query.get("search_type");
    const rows = type
      ? state.hotKeywords.filter((item) => item.search_type === type)
      : state.hotKeywords;
    return ok({
      items: paginate(rows, page, pageSize),
      total: rows.length,
      page,
      page_size: pageSize,
    });
  }
  if (method === "GET" && path === "/admin/hot-content/papers") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 50);
    return ok({
      items: paginate(state.hotPapers, page, pageSize),
      total: state.hotPapers.length,
      page,
      page_size: pageSize,
    });
  }
  if (method === "GET" && path === "/admin/hot-content/stats") {
    return ok({
      total_keywords: state.hotKeywords.length,
      total_papers: state.hotPapers.length,
      last_updated: new Date().toISOString(),
    });
  }
  if (path === "/admin/hot-content/config" && method === "GET")
    return ok(state.hotConfig);
  if (path === "/admin/hot-content/config" && method === "PUT") {
    Object.assign(state.hotConfig, await readBody(request), {
      updated_at: new Date().toISOString(),
    });
    return changed(state.hotConfig);
  }
  if (path === "/admin/hot-content/cleanup" && method === "POST") {
    const removed = Math.max(14, Math.round(state.hotKeywords.length * 0.08));
    return ok({ removed_keywords: removed, removed_papers: 6 }, "清理完成");
  }
  return undefined;
};

const handleDimensions = async (
  request: Request,
  method: string,
  path: string,
): Promise<Response | undefined> => {
  if (method === "GET" && path === "/admin/analysis/dimensions") {
    return ok({ dimensions: state.dimensions, total: state.dimensions.length });
  }
  const match = path.match(/^\/admin\/analysis\/dimensions\/(\d+)$/);
  if (!match || method !== "PUT") return undefined;
  const item = state.dimensions.find((entry) => entry.id === Number(match[1]));
  if (!item) return notFound("分析维度");
  Object.assign(item, await readBody(request), {
    updatedAt: new Date().toISOString(),
  });
  return changed(item);
};

const handleEmailLogs = (
  method: string,
  path: string,
  query: URLSearchParams,
): Response | undefined => {
  if (method !== "GET" || path !== "/admin/email-logs") return undefined;
  const page = asNumber(query.get("page"), 1);
  const pageSize = asNumber(query.get("page_size"), 20);
  const search = (query.get("search") ?? "").trim();
  const scoped = state.emailLogs.filter((log) => {
    if (query.get("channel") && log.channel !== query.get("channel"))
      return false;
    if (query.get("status") && log.status !== query.get("status")) return false;
    if (query.get("category") && log.category !== query.get("category"))
      return false;
    if (
      search &&
      ![log.to_email, log.subject, log.from_name].some((value) =>
        includes(value, search),
      )
    )
      return false;
    return true;
  });
  return ok({
    logs: paginate(scoped, page, pageSize),
    total: scoped.length,
    stats: {
      total: scoped.length,
      success: scoped.filter((log) => log.status === "success").length,
      failed: scoped.filter((log) => log.status === "failed").length,
    },
  });
};

const handleModels = async (
  request: Request,
  method: string,
  path: string,
): Promise<Response | undefined> => {
  if (path === "/admin/models" && method === "GET") return ok(state.models);
  if (path === "/admin/models" && method === "POST") {
    const body = await readBody(request);
    const now = new Date().toISOString();
    const item = {
      ...body,
      id: nextAdminId(state.models),
      created_at: now,
      updated_at: now,
    } as unknown as AgentModel;
    state.models.push(item);
    return changed(item);
  }
  const modelMatch = path.match(/^\/admin\/models\/(\d+)$/);
  if (modelMatch) {
    const item = state.models.find(
      (entry) => entry.id === Number(modelMatch[1]),
    );
    if (!item) return notFound("模型");
    if (method === "PUT") {
      Object.assign(item, await readBody(request), {
        updated_at: new Date().toISOString(),
      });
      return changed(item);
    }
    if (method === "DELETE") {
      state.models = state.models.filter((entry) => entry.id !== item.id);
      state.modelBindings.forEach((binding) => {
        if (binding.model_id === item.model_id) {
          binding.effective =
            state.models.find((model) => model.enabled)?.model_id ?? "";
          binding.fallback = true;
        }
      });
      return changed({ id: item.id });
    }
  }
  if (path === "/admin/model-bindings" && method === "GET")
    return ok(state.modelBindings);
  const bindingMatch = path.match(/^\/admin\/model-bindings\/(.+)$/);
  if (bindingMatch && method === "PUT") {
    const purpose = decodeURIComponent(bindingMatch[1]);
    const body = await readBody(request);
    const modelId = String(body.model_id ?? "");
    let binding = state.modelBindings.find((item) => item.purpose === purpose);
    if (!binding) {
      binding = {
        purpose,
        model_id: modelId,
        effective: modelId,
        fallback: false,
      };
      state.modelBindings.push(binding);
    } else {
      binding.model_id = modelId;
      binding.effective =
        modelId || state.models.find((model) => model.enabled)?.model_id || "";
      binding.fallback = !modelId;
    }
    return changed(binding);
  }
  if (path === "/admin/model-providers" && method === "GET")
    return ok(state.modelProviders);
  if (path === "/admin/model-providers" && method === "POST") {
    const body = await readBody(request);
    const item = {
      ...body,
      id: nextAdminId(state.modelProviders),
      push_status: "success",
      push_error: "",
    } as unknown as AgentProviderDTO;
    state.modelProviders.push(item);
    return changed(item);
  }
  const providerMatch = path.match(/^\/admin\/model-providers\/(\d+)$/);
  if (providerMatch) {
    const item = state.modelProviders.find(
      (entry) => entry.id === Number(providerMatch[1]),
    );
    if (!item) return notFound("模型端点");
    if (method === "PUT") {
      Object.assign(item, await readBody(request), {
        push_status: "success",
        push_error: "",
      });
      return changed(item);
    }
    if (method === "DELETE") {
      state.modelProviders = state.modelProviders.filter(
        (entry) => entry.id !== item.id,
      );
      return changed({ id: item.id });
    }
  }
  return undefined;
};

const handleThirdParty = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (path === "/admin/third-party-accounts" && method === "GET") {
    const show = query.get("show_sensitive") === "true";
    const accounts = state.thirdPartyAccounts.map((account) => ({
      ...account,
      config: show
        ? account.config
        : Object.fromEntries(
            Object.entries(account.config).map(([key, value]) => [
              key,
              /key|secret|token|password/i.test(key) && value
                ? "••••••••••••"
                : value,
            ]),
          ),
    }));
    return ok({ accounts, total: accounts.length });
  }
  if (path === "/admin/third-party-accounts" && method === "POST") {
    const body = await readBody(request);
    const now = new Date().toISOString();
    const item = {
      ...body,
      id: nextAdminId(state.thirdPartyAccounts),
      usage_count: 0,
      created_at: now,
      updated_at: now,
      stats: {
        success_rate: 100,
        avg_latency_ms: 0,
        std_dev_ms: 0,
        slow_avg_ms: 0,
        slow_rate: 0,
      },
    } as unknown as ThirdPartyAccount;
    state.thirdPartyAccounts.push(item);
    return changed(item);
  }
  const match = path.match(
    /^\/admin\/third-party-accounts\/(\d+)(?:\/(test|reset-stats))?$/,
  );
  if (!match) return undefined;
  const item = state.thirdPartyAccounts.find(
    (entry) => entry.id === Number(match[1]),
  );
  if (!item) return notFound("第三方账号");
  const action = match[2] ?? "";
  if (method === "PUT" && !action) {
    Object.assign(item, await readBody(request), {
      updated_at: new Date().toISOString(),
    });
    return changed(item);
  }
  if (method === "DELETE" && !action) {
    state.thirdPartyAccounts = state.thirdPartyAccounts.filter(
      (entry) => entry.id !== item.id,
    );
    return changed({ id: item.id });
  }
  if (method === "POST" && action === "test") {
    return ok({
      success: true,
      latency_ms: 186,
      message: "连接成功，凭据与端点可用",
    });
  }
  if (method === "POST" && action === "reset-stats") {
    item.usage_count = 0;
    item.total_requests = 0;
    item.success_count = 0;
    item.fail_count = 0;
    item.stats = {
      success_rate: 0,
      avg_latency_ms: 0,
      std_dev_ms: 0,
      slow_avg_ms: 0,
      slow_rate: 0,
    };
    return changed(item);
  }
  return undefined;
};

const handlePayments = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  const show = query.get("show_sensitive") === "true";
  if (path === "/admin/payment/alipay/configs" && method === "GET") {
    return ok(
      state.alipayConfigs.map((item) =>
        show
          ? item
          : maskRecord(item as unknown as JsonRecord, false, [
              "private_key",
              "alipay_public_key",
            ]),
      ),
    );
  }
  if (path === "/admin/payment/wechat/configs" && method === "GET") {
    return ok(
      state.wechatPayConfigs.map((item) =>
        show
          ? item
          : maskRecord(item as unknown as JsonRecord, false, [
              "api_v3_key",
              "private_key",
            ]),
      ),
    );
  }
  if (path === "/admin/payment/alipay/config" && method === "POST") {
    const body = await readBody(request);
    const now = new Date().toISOString();
    const item = {
      ...body,
      id: nextAdminId(state.alipayConfigs),
      created_at: now,
      updated_at: now,
    } as unknown as AlipayConfig;
    state.alipayConfigs.push(item);
    return changed(item);
  }
  if (path === "/admin/payment/wechat/config" && method === "POST") {
    const body = await readBody(request);
    const now = new Date().toISOString();
    const item = {
      ...body,
      id: nextAdminId(state.wechatPayConfigs),
      created_at: now,
      updated_at: now,
    } as unknown as WeChatPayConfig;
    state.wechatPayConfigs.push(item);
    return changed(item);
  }
  const match = path.match(
    /^\/admin\/payment\/(alipay|wechat)\/config\/(\d+)(?:\/activate)?$/,
  );
  if (!match) return undefined;
  const provider = match[1];
  const id = Number(match[2]);
  const list =
    provider === "alipay" ? state.alipayConfigs : state.wechatPayConfigs;
  const item = list.find((entry) => entry.id === id);
  if (!item) return notFound("支付配置");
  if (method === "PUT") {
    Object.assign(item, await readBody(request), {
      updated_at: new Date().toISOString(),
    });
    return changed(item);
  }
  if (method === "DELETE") {
    if (provider === "alipay")
      state.alipayConfigs = state.alipayConfigs.filter(
        (entry) => entry.id !== id,
      );
    else
      state.wechatPayConfigs = state.wechatPayConfigs.filter(
        (entry) => entry.id !== id,
      );
    return changed({ id });
  }
  if (method === "POST" && path.endsWith("/activate")) {
    list.forEach((entry) => {
      entry.is_active = entry.id === id;
    });
    return changed(item);
  }
  return undefined;
};

const sensitiveConfigResponse = (
  value: object,
  query: URLSearchParams,
  keys: string[],
  revealParam = "show_sensitive",
): Response =>
  ok(maskRecord(value as JsonRecord, query.get(revealParam) === "true", keys));

const handleConfigs = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (path === "/admin/agent/config") {
    if (method === "GET")
      return sensitiveConfigResponse(state.configs.agent, query, ["api_key"]);
    if (method === "PUT") return updateConfig(request, state.configs.agent);
  }
  if (path === "/admin/billing/config") {
    if (method === "GET") return ok(state.configs.billing);
    if (method === "PUT") return updateConfig(request, state.configs.billing);
  }
  if (path === "/admin/system-config") {
    if (method === "GET")
      return sensitiveConfigResponse(state.configs.system, query, [
        "turnstile_secret_key",
      ]);
    if (method === "PUT") return updateConfig(request, state.configs.system);
  }
  if (path === "/admin/email-config") {
    if (method === "GET")
      return sensitiveConfigResponse(
        state.configs.email,
        query,
        ["smtp_password"],
        "show_password",
      );
    if (method === "PUT") return updateConfig(request, state.configs.email);
  }
  if (path === "/admin/email-config/test" && method === "POST") {
    const body = await readBody(request);
    return ok(
      { success: true, to: body.to, latency_ms: 428 },
      "测试邮件已发送",
    );
  }
  if (path === "/admin/sms-config") {
    if (method === "GET")
      return sensitiveConfigResponse(
        state.configs.sms,
        query,
        ["access_secret"],
        "show_secret",
      );
    if (method === "PUT") return updateConfig(request, state.configs.sms);
  }
  if (path === "/admin/sms-config/test" && method === "POST") {
    const body = await readBody(request);
    return ok(
      { success: true, phone: body.phone, request_id: "SMS_MOCK_2026" },
      "测试短信已发送",
    );
  }
  if (path === "/admin/news-webhook/config") {
    if (method === "GET")
      return sensitiveConfigResponse(state.configs.newsWebhook, query, [
        "webhook_secret",
      ]);
    if (method === "PUT")
      return updateConfig(request, state.configs.newsWebhook);
  }
  if (path === "/admin/promo/config") {
    if (method === "GET") return ok(state.configs.promo);
    if (method === "PUT") return updateConfig(request, state.configs.promo);
  }
  if (path === "/admin/wechat-miniprogram/config") {
    if (method === "GET")
      return sensitiveConfigResponse(state.configs.miniProgram, query, [
        "app_secret",
      ]);
    if (method === "PUT")
      return updateConfig(request, state.configs.miniProgram);
  }
  if (path === "/admin/wechat-official/config") {
    if (method === "GET")
      return sensitiveConfigResponse(state.configs.officialWechat, query, [
        "app_secret",
        "token",
        "encoding_aes_key",
      ]);
    if (method === "PUT")
      return updateConfig(request, state.configs.officialWechat);
  }
  if (path === "/admin/support-center/config") {
    if (method === "GET")
      return sensitiveConfigResponse(state.configs.support, query, [
        "imap_password",
        "smtp_password",
        "feishu_webhook_url",
        "feishu_secret",
      ]);
    if (method === "PUT") return updateConfig(request, state.configs.support);
  }
  if (path === "/admin/support-center/feishu/test" && method === "POST") {
    return ok({ success: true, latency_ms: 216 }, "飞书测试通知已发送");
  }
  if (path === "/admin/support-center/smtp/test" && method === "POST") {
    return ok({ success: true, latency_ms: 384 }, "SMTP 连接及发信测试成功");
  }
  if (path === "/admin/support-center/imap/test" && method === "POST") {
    return ok({ mailbox_messages: 1_286 }, "IMAP 连接成功");
  }
  if (path === "/admin/support-center/imap/poll" && method === "POST") {
    return ok({ new_mails: 3 }, "收件完成");
  }
  return undefined;
};

const handleOAuth = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  const match = path.match(
    /^\/admin\/(github|google|apple|orcid|microsoft|discourse)-config$/,
  );
  if (match) {
    const provider = match[1];
    if (method === "GET") {
      const config = state.oauthConfigs[provider] ?? {};
      const sensitive = ["client_secret", "private_key", "sso_secret"];
      return ok(
        maskRecord(config, query.get("show_sensitive") === "true", sensitive),
      );
    }
    if (method === "PUT") {
      Object.assign(
        (state.oauthConfigs[provider] ??= {}),
        await readBody(request),
        { updated_at: new Date().toISOString() },
      );
      return changed(state.oauthConfigs[provider]);
    }
  }
  if (path === "/admin/wechat/config") {
    if (method === "GET")
      return ok(
        maskRecord(
          state.oauthConfigs.wechat ?? {},
          query.get("show_sensitive") === "true",
          ["app_secret"],
        ),
      );
    if (method === "POST") {
      const body = await readBody(request);
      state.oauthConfigs.wechat = {
        ...body,
        id: Number(state.oauthConfigs.wechat?.id ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      return changed(state.oauthConfigs.wechat);
    }
  }
  const wechatMatch = path.match(/^\/admin\/wechat\/config\/(\d+)$/);
  if (wechatMatch && method === "PUT") {
    Object.assign((state.oauthConfigs.wechat ??= {}), await readBody(request), {
      id: Number(wechatMatch[1]),
      updated_at: new Date().toISOString(),
    });
    return changed(state.oauthConfigs.wechat);
  }
  return undefined;
};

const handleSupportInbox = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (path === "/admin/support-center/inbox" && method === "GET") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    const keyword = (query.get("keyword") ?? "").trim();
    const rows = state.inbox.filter((mail) => {
      if (query.get("status") && mail.status !== query.get("status"))
        return false;
      if (
        keyword &&
        ![mail.from_name, mail.from_addr, mail.subject, mail.snippet].some(
          (value) => includes(value, keyword),
        )
      )
        return false;
      return true;
    });
    return ok({
      items: paginate(rows, page, pageSize),
      total: rows.length,
      unread: state.inbox.filter((mail) => mail.status === "unread").length,
    });
  }
  if (path === "/admin/support-center/compose" && method === "POST") {
    const body = await readBody(request);
    return ok(
      { message_id: `mock-compose-${Date.now()}`, to: body.to },
      "邮件已发送",
    );
  }
  const match = path.match(
    /^\/admin\/support-center\/inbox\/(\d+)(?:\/reply)?$/,
  );
  if (!match) return undefined;
  const mail = state.inbox.find((item) => item.id === Number(match[1]));
  if (!mail) return notFound("邮件");
  if (method === "GET") {
    if (mail.status === "unread") {
      mail.status = "read";
      persistAdminMockState();
    }
    return ok(mail);
  }
  if (method === "POST" && path.endsWith("/reply")) {
    mail.status = "replied";
    mail.replied_at = new Date().toISOString();
    return changed({ id: mail.id, message_id: `mock-reply-${Date.now()}` });
  }
  return undefined;
};

const handleTools = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (!path.startsWith("/admin/tools")) return undefined;
  if (path === "/admin/tools/categories" && method === "GET") {
    const counts = new Map<string, number>();
    state.featureTools.forEach((tool) =>
      counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1),
    );
    const labels: Record<string, string> = {
      reference: "文献管理",
      discovery: "文献发现",
      bibliometrics: "文献计量",
      "systematic-review": "系统综述",
      visualization: "数据可视化",
    };
    const categories = Array.from(counts, ([slug, count]) => ({
      slug,
      label: labels[slug] ?? slug,
      count,
    }));
    return ok({ categories, total: categories.length });
  }
  if (path === "/admin/tools/import-jobs" && method === "GET") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    return ok({
      items: paginate(state.importJobs, page, pageSize),
      total: state.importJobs.length,
    });
  }
  const importJobMatch = path.match(/^\/admin\/tools\/import-jobs\/(\d+)$/);
  if (importJobMatch && method === "GET") {
    const job = state.importJobs.find(
      (item) => item.id === Number(importJobMatch[1]),
    );
    return job ? ok(job) : notFound("导入任务");
  }
  if (
    (path === "/admin/tools/import" || path === "/admin/tools/import-zip") &&
    method === "POST"
  ) {
    const now = new Date().toISOString();
    const job: ImportJob = {
      id: nextAdminId(state.importJobs),
      status: "succeeded",
      phase: "done",
      source: path.endsWith("zip") ? "ZIP 文件导入" : "JSON 批量导入",
      filename: path.endsWith("zip")
        ? "uploaded-tools.zip"
        : "inline-payload.json",
      notify: true,
      total: path.endsWith("zip") ? 24 : 8,
      processed: path.endsWith("zip") ? 24 : 8,
      logo_total: path.endsWith("zip") ? 21 : 0,
      logo_done: path.endsWith("zip") ? 21 : 0,
      created_cnt: path.endsWith("zip") ? 18 : 6,
      updated_cnt: path.endsWith("zip") ? 5 : 2,
      skipped_cnt: 1,
      failed_cnt: 0,
      created_at: now,
      updated_at: now,
      finished_at: now,
    };
    state.importJobs.unshift(job);
    return changed(job);
  }
  if (path === "/admin/tools/webhooks" && method === "GET")
    return ok({ items: state.webhooks });
  if (path === "/admin/tools/webhooks" && method === "POST") {
    const body = await readBody(request);
    const now = new Date().toISOString();
    const item = {
      ...body,
      id: nextAdminId(state.webhooks),
      created_at: now,
      updated_at: now,
    } as unknown as Webhook;
    state.webhooks.push(item);
    return changed(item);
  }
  const deliveriesMatch = path.match(
    /^\/admin\/tools\/webhooks\/(\d+)\/deliveries$/,
  );
  if (deliveriesMatch && method === "GET") {
    const id = Number(deliveriesMatch[1]);
    return ok({
      items: state.webhookDeliveries.filter((item) => item.webhook_id === id),
    });
  }
  const webhookMatch = path.match(
    /^\/admin\/tools\/webhooks\/(\d+)(?:\/test)?$/,
  );
  if (webhookMatch) {
    const item = state.webhooks.find(
      (entry) => entry.id === Number(webhookMatch[1]),
    );
    if (!item) return notFound("Webhook");
    if (method === "POST" && path.endsWith("/test")) {
      item.last_status = "success";
      item.last_delivered_at = new Date().toISOString();
      item.last_error = "";
      persistAdminMockState();
      return ok({ http_status: 200, response: '{"ok":true,"source":"mock"}' });
    }
    if (method === "PUT") {
      Object.assign(item, await readBody(request), {
        updated_at: new Date().toISOString(),
      });
      return changed(item);
    }
    if (method === "DELETE") {
      state.webhooks = state.webhooks.filter((entry) => entry.id !== item.id);
      return changed({ id: item.id });
    }
  }
  const itemMatch = path.match(/^\/admin\/tools\/items\/(\d+)$/);
  if (itemMatch) {
    const item = state.featureTools.find(
      (entry) => entry.id === Number(itemMatch[1]),
    );
    if (!item) return notFound("工具");
    if (method === "GET") return ok(item);
    if (method === "PUT") {
      Object.assign(item, await readBody(request), {
        updated_at: new Date().toISOString(),
      });
      return changed(item);
    }
    if (method === "DELETE") {
      state.featureTools = state.featureTools.filter(
        (entry) => entry.id !== item.id,
      );
      return changed({ id: item.id });
    }
  }
  if (path === "/admin/tools" && method === "GET") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    const keyword = (query.get("q") ?? "").trim();
    const rows = state.featureTools.filter((tool) => {
      if (
        keyword &&
        ![tool.name, tool.name_en, tool.slug, tool.tagline].some((value) =>
          includes(value, keyword),
        )
      )
        return false;
      if (query.get("status") && tool.status !== query.get("status"))
        return false;
      if (query.get("category") && tool.category !== query.get("category"))
        return false;
      if (
        query.get("access_type") &&
        tool.access_type !== query.get("access_type")
      )
        return false;
      if (
        query.get("price_type") &&
        tool.price_type !== query.get("price_type")
      )
        return false;
      return true;
    });
    return ok({
      items: paginate(rows, page, pageSize),
      total: rows.length,
      page,
      page_size: pageSize,
    });
  }
  if (path === "/admin/tools" && method === "POST") {
    const body = await readBody(request);
    const now = new Date().toISOString();
    const item = {
      id: nextAdminId(state.featureTools),
      slug: String(body.slug ?? `mock-tool-${Date.now()}`),
      name: String(body.name ?? "未命名工具"),
      category: String(body.category ?? "other"),
      price_type: String(body.price_type ?? "unknown"),
      access_type: String(body.access_type ?? "website"),
      status: String(body.status ?? "draft"),
      ...body,
      created_at: now,
      updated_at: now,
    } as unknown as FeatureTool;
    state.featureTools.unshift(item);
    return changed(item);
  }
  return undefined;
};

const handleSkills = async (
  request: Request,
  method: string,
  path: string,
  query: URLSearchParams,
): Promise<Response | undefined> => {
  if (path === "/admin/skills/reports" && method === "GET") {
    const status = query.get("status");
    return ok({
      list: status
        ? state.skillReports.filter((report) => report.status === status)
        : state.skillReports,
    });
  }
  const reportMatch = path.match(/^\/admin\/skills\/reports\/(\d+)\/resolve$/);
  if (reportMatch && method === "POST") {
    const report = state.skillReports.find(
      (item) => item.id === Number(reportMatch[1]),
    );
    if (!report) return notFound("举报");
    report.status =
      query.get("action") === "dismissed" ? "dismissed" : "actioned";
    report.handledBy = 1;
    report.resolvedAt = new Date().toISOString();
    return changed(report);
  }
  if (path === "/admin/skills" && method === "GET") {
    const status = query.get("status");
    const rows = status
      ? state.skills.filter(
          (skill) =>
            skill.moderationStatus === status || skill.status === status,
        )
      : state.skills;
    return ok({ list: rows });
  }
  const actionMatch = path.match(
    /^\/admin\/skills\/(\d+)\/(approve|reject|takedown)$/,
  );
  if (!actionMatch || method !== "POST") return undefined;
  const skill = state.skills.find((item) => item.id === Number(actionMatch[1]));
  if (!skill) return notFound("Skill");
  const body = await readBody(request);
  const action = actionMatch[2];
  if (action === "approve") {
    skill.moderationStatus = "approved";
    skill.status = "published";
    skill.moderationNote = "";
  } else if (action === "reject") {
    skill.moderationStatus = "rejected";
    skill.moderationNote = String(body.note ?? "未通过审核");
  } else {
    skill.moderationStatus = "flagged";
    skill.status = "takedown";
    skill.moderationNote = String(body.note ?? "管理员下架");
  }
  skill.updatedAt = new Date().toISOString();
  return changed(skill);
};

const sessionRows = Array.from({ length: 24 }, (_, index) => {
  const user = state.users[index % state.users.length];
  const feature = ["smart_search", "claw", "prism"][index % 3];
  return {
    agentSessionId: `mock-${feature}-${String(index + 1).padStart(4, "0")}`,
    featureKey: feature,
    userId: user.id,
    userEmail: user.email ?? "",
    username: user.username ?? "",
    ownerKind: index % 3 === 0 ? "project" : null,
    ownerId: index % 3 === 0 ? 1000 + index : null,
    resetCount: index % 5 === 0 ? 1 : 0,
    createdAt: isoDaysAgo(index % 14, 8 + (index % 9)),
    lastAccessedAt: isoDaysAgo(index % 5, 10 + (index % 8)),
  };
});

const handleSessions = (
  method: string,
  path: string,
  query: URLSearchParams,
): Response | undefined => {
  if (path === "/admin/agent-sessions" && method === "GET") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    const keyword = (query.get("keyword") ?? "").trim();
    const rows = sessionRows.filter((session) => {
      if (query.get("feature") && session.featureKey !== query.get("feature"))
        return false;
      if (query.get("userId") && session.userId !== Number(query.get("userId")))
        return false;
      if (
        keyword &&
        ![session.username, session.userEmail, session.agentSessionId].some(
          (value) => includes(value, keyword),
        )
      )
        return false;
      return true;
    });
    return ok({
      list: paginate(rows, page, pageSize),
      total: rows.length,
      page,
      pageSize,
    });
  }
  const fileMatch = path.match(/^\/admin\/agent-sessions\/([^/]+)\/file$/);
  if (fileMatch && method === "GET") {
    const sessionId = decodeURIComponent(fileMatch[1]);
    const session = sessionRows.find(
      (item) => item.agentSessionId === sessionId,
    );
    if (!session) return notFound("会话");
    const requestedPath = (
      query.get("path") ??
      query.get("filename") ??
      ""
    ).trim();
    const filename =
      requestedPath.split(/[\\/]/).filter(Boolean).at(-1) ??
      "session-preview.md";
    const payload = sessionFilePayload(filename);
    return binaryFile(
      payload.body,
      payload.contentType,
      filename,
      query.get("download") === "1",
    );
  }
  const match = path.match(/^\/admin\/agent-sessions\/([^/]+)\/messages$/);
  if (match && method === "GET") {
    const session = sessionRows.find(
      (item) => item.agentSessionId === decodeURIComponent(match[1]),
    );
    if (!session) return ok({ messages: [] });
    return ok({
      messages: [
        {
          id: `${session.agentSessionId}-1`,
          type: "user",
          content:
            session.featureKey === "claw"
              ? '@"/workspace/uploads/4b23d8c4-7bb2-4e31-9669-0fd9a9ee3815-multimodal-research-map.pdf" @"/workspace/uploads/af8d1e2c-5f62-48b0-8c71-b8375c4db232-key-findings.md" 请帮我梳理近五年关于多模态科研助手的关键进展，并给出检索策略。'
              : "请帮我梳理近五年关于多模态科研助手的关键进展，并给出检索策略。",
          timestamp: isoDaysAgo(1, 10),
        },
        {
          id: `${session.agentSessionId}-2`,
          type: "assistant",
          content:
            "我会先拆分研究主题、时间范围和证据类型，然后组合数据库检索式。",
          timestamp: isoDaysAgo(1, 10),
        },
        {
          id: `${session.agentSessionId}-3`,
          type: "tool_use",
          content: {
            name: "scholarly_search",
            input: {
              query: "multimodal scientific assistant",
              year_from: 2021,
            },
          },
          timestamp: isoDaysAgo(1, 10),
        },
        {
          id: `${session.agentSessionId}-4`,
          type: "assistant",
          content:
            "已找到 48 篇高相关论文。我将它们归纳为通用多模态模型、文献智能体、实验自动化三条主线。",
          timestamp: isoDaysAgo(1, 10),
        },
      ],
    });
  }
  return undefined;
};

const prRows = Array.from({ length: 16 }, (_, index) => {
  const user = state.users[(index + 3) % state.users.length];
  const statuses = ["draft", "submitted", "reviewing", "completed", "failed"];
  return {
    id: index + 1,
    userId: user.id,
    userEmail: user.email ?? "",
    username: user.username ?? "",
    mode: index % 3 === 0 ? "thesis" : "journal",
    status: statuses[index % statuses.length],
    title: [
      "面向开放科学的多智能体文献综述框架",
      "A Multimodal Foundation Model for Scientific Discovery",
      "城市热岛效应的跨尺度时空分析",
      "基于单细胞图谱的肿瘤微环境异质性研究",
    ][index % 4],
    journalName:
      index % 3 === 0
        ? ""
        : ["Nature Machine Intelligence", "计算机学报", "PLOS ONE"][index % 3],
    schoolName:
      index % 3 === 0 ? ["浙江大学", "复旦大学", "中山大学"][index % 3] : "",
    createdAt: isoDaysAgo(index % 18, 8 + (index % 10)),
    updatedAt: isoDaysAgo(index % 6, 10 + (index % 8)),
  };
});

const handlePeerReview = (
  method: string,
  path: string,
  query: URLSearchParams,
): Response | undefined => {
  if (path === "/admin/peer-review/submissions" && method === "GET") {
    const page = asNumber(query.get("page"), 1);
    const pageSize = asNumber(query.get("page_size"), 20);
    const keyword = (query.get("keyword") ?? "").trim();
    const rows = prRows.filter((item) => {
      if (query.get("userId") && item.userId !== Number(query.get("userId")))
        return false;
      if (
        keyword &&
        ![
          item.title,
          item.username,
          item.userEmail,
          item.journalName,
          item.schoolName,
        ].some((value) => includes(value, keyword))
      )
        return false;
      return true;
    });
    return ok({
      list: paginate(rows, page, pageSize),
      total: rows.length,
      page,
      pageSize,
    });
  }
  const assetMatch = path.match(
    /^\/admin\/peer-review\/submissions\/(\d+)\/assets\/(\d+)$/,
  );
  if (assetMatch && method === "GET") {
    const submissionId = Number(assetMatch[1]);
    const assetId = Number(assetMatch[2]);
    const row = prRows.find((item) => item.id === submissionId);
    if (!row) return notFound("投稿");
    const isManuscript = assetId === submissionId * 10 + 1;
    const isSupplement = assetId === submissionId * 10 + 2;
    if (!isManuscript && !isSupplement) return notFound("附件");
    const filename = isManuscript
      ? "manuscript-main.pdf"
      : "supplementary-material.docx";
    const contentType = isManuscript
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const body = isManuscript
      ? makeTinyPdf("Scholay peer review manuscript")
      : binaryEncoder.encode(
          "MOCK DOCX BINARY PACKAGE\nPeer-review supplementary material for design preview and download testing.",
        ).buffer;
    return binaryFile(
      body,
      contentType,
      filename,
      query.get("download") === "1",
    );
  }
  const match = path.match(/^\/admin\/peer-review\/submissions\/(\d+)$/);
  if (!match || method !== "GET") return undefined;
  const row = prRows.find((item) => item.id === Number(match[1]));
  if (!row) return notFound("投稿");
  return ok({
    submission: {
      id: row.id,
      userId: row.userId,
      mode: row.mode,
      status: row.status,
      step: row.status === "completed" ? 5 : 3,
      title: row.title,
      abstract:
        "本研究提出一个面向复杂科研任务的多智能体协同框架，并在跨学科文献集上进行系统验证。结果显示，该方法在证据覆盖率、可解释性与响应稳定性方面均有提升。",
      journalName: row.journalName,
      journalMeta: { quartile: "Q1", impactFactor: 8.7 },
      schoolName: row.schoolName,
      degreeType: row.mode === "thesis" ? "博士" : "",
      disciplineField: "计算机科学与技术",
      advisorName: row.mode === "thesis" ? "李教授" : "",
      letterBody:
        "Dear Editor, please find our manuscript attached for consideration.",
      extraMeta: {
        keywords: ["multi-agent", "scientific discovery", "evidence synthesis"],
      },
      computeState: row.status === "failed" ? "failed" : "done",
      computeError: row.status === "failed" ? "模型端点短暂不可用" : "",
      failedReason: row.status === "failed" ? "agent_timeout" : "",
      agentSessionId: `peer-review-${row.id}`,
      agreedAt: isoDaysAgo(daysBetween(row.createdAt)),
      submittedAt: row.status === "draft" ? null : row.createdAt,
      completedAt: row.status === "completed" ? row.updatedAt : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    assets: [
      {
        id: row.id * 10 + 1,
        role: "manuscript",
        category: "paper",
        filename: "manuscript-main.pdf",
        size: 4_820_420,
        mime: "application/pdf",
        textChars: 62_840,
        textExcerpt: "Abstract—Scientific discovery increasingly relies on...",
        createdAt: row.createdAt,
      },
      {
        id: row.id * 10 + 2,
        role: "supplement",
        category: "appendix",
        filename: "supplementary-material.docx",
        size: 1_264_920,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        textChars: 18_204,
        textExcerpt: "Appendix A. Detailed experimental settings...",
        createdAt: row.createdAt,
      },
    ],
    reports:
      row.status === "draft"
        ? []
        : [
            {
              id: row.id * 100 + 1,
              role: "reviewer",
              decision: "major_revision",
              scores: { novelty: 8, methodology: 6, clarity: 7, impact: 8 },
              contentMd:
                "## 总体评价\n\n选题重要且框架具有潜力，但实验对比与消融分析仍需加强。",
              score: 7.2,
              recommendation: "major_revision",
              expertise: "多智能体系统、信息检索",
              reviewerSkillId: 5,
              dimensions: [
                { key: "methodology", score: 6, note: "需要补充消融实验" },
              ],
              lineComments: [
                { page: 4, line: 126, comment: "请解释基线选择依据。" },
              ],
              macroComments: ["建议增加失败案例分析", "统计显著性报告不完整"],
              finalSummaryMd: "工作有价值，充分修改后可重新评估。",
              rulingSummaryMd: "",
              rulingParagraphMd: "",
              reviewerResponses: [],
              mustFix: ["补充消融实验", "报告置信区间"],
              suggestions: ["开放代码与提示词模板"],
              deadlineDays: 21,
              summaryForAuthor: "重点加强方法验证与可复现性说明。",
              agentDurationSec: 184,
              agentTokensIn: 82_460,
              agentTokensOut: 12_820,
              createdAt: row.updatedAt,
            },
          ],
  });
};

/**
 * Handle a request whose path has already had the `/api/v1` prefix removed.
 * Returning `undefined` deliberately delegates non-admin routes to other mock modules.
 */
export async function handleAdminMock(
  request: Request,
  path: string,
): Promise<Response | undefined> {
  const method = request.method.toUpperCase();
  const normalizedPath =
    `/${path}`.replace(/^\/+/, "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (!normalizedPath.startsWith("/admin/")) return undefined;
  const query = new URL(request.url).searchParams;

  return (
    handleDashboard(method, normalizedPath) ??
    (await handleUsers(request, method, normalizedPath, query)) ??
    handleOrders(method, normalizedPath, query) ??
    handleAnalytics(method, normalizedPath, query) ??
    handleTokenUsage(method, normalizedPath, query) ??
    handleUsageStats(method, normalizedPath, query) ??
    (await handleFeedback(request, method, normalizedPath, query)) ??
    (await handleVipCodes(request, method, normalizedPath, query)) ??
    (await handleContentCrud(request, method, normalizedPath, query)) ??
    (await handleHotContent(request, method, normalizedPath, query)) ??
    (await handleDimensions(request, method, normalizedPath)) ??
    handleEmailLogs(method, normalizedPath, query) ??
    (await handleModels(request, method, normalizedPath)) ??
    (await handleThirdParty(request, method, normalizedPath, query)) ??
    (await handlePayments(request, method, normalizedPath, query)) ??
    (await handleConfigs(request, method, normalizedPath, query)) ??
    (await handleOAuth(request, method, normalizedPath, query)) ??
    (await handleSupportInbox(request, method, normalizedPath, query)) ??
    (await handleTools(request, method, normalizedPath, query)) ??
    (await handleSkills(request, method, normalizedPath, query)) ??
    handleSessions(method, normalizedPath, query) ??
    handlePeerReview(method, normalizedPath, query)
  );
}
