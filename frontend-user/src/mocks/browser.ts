import { http, HttpResponse, delay } from "msw";
import { setupWorker } from "msw/browser";
import { getMockLatency, getMockScenario, MOCK_MODE } from "./config";
import { handleCoreMock } from "./core";
import { applyMockPersona, getMockPersona } from "./personas";
import { mockWebSocketHandler } from "./websocket";

const apiCatchAll = http.all(/\/api\/v1(?:\/|$)/, async ({ request }) => {
  await delay(getMockLatency());
  const path = new URL(request.url).pathname.replace(/^\/api\/v1/, "") || "/";
  const scenario = getMockScenario();

  if (
    scenario === "server-error" &&
    !["/config/system", "/config/promo", "/user/profile"].includes(path)
  ) {
    return HttpResponse.json(
      { code: 500, message: "Mock 场景：服务暂时不可用", data: null },
      { status: 503 },
    );
  }
  if (scenario === "auth-expired" && path.startsWith("/user/")) {
    return HttpResponse.json(
      { code: 2031, message: "Mock 场景：登录已过期", data: null },
      { status: 401 },
    );
  }
  if (
    scenario === "quota" &&
    /(?:ws-ticket|analysis\/papers|peer-review\/submissions\/\d+\/(?:advance|submit|retry)|translate\/.*\/stream)/.test(
      path,
    )
  ) {
    return HttpResponse.json(
      { code: 6010, message: "Mock 场景：本周期 AI 额度已用完", data: null },
      { status: 429 },
    );
  }

  const core = await handleCoreMock(request, path);
  if (core) return core;

  // 这些模块按业务域拆开，避免一个 handler 文件继续膨胀。
  const [
    { handlePublicMock },
    { handleWorkspaceMock },
    { handleManuscriptMock },
    { handleAdminMock },
  ] = await Promise.all([
    import("./public"),
    import("./workspaces"),
    import("./manuscripts"),
    import("./admin"),
  ]);

  const publicResponse = await handlePublicMock(request, path);
  if (publicResponse) return publicResponse;
  const workspaceResponse = await handleWorkspaceMock(request, path);
  if (workspaceResponse) return workspaceResponse;
  const manuscriptResponse = await handleManuscriptMock(request, path);
  if (manuscriptResponse) return manuscriptResponse;
  const adminResponse = await handleAdminMock(request, path);
  if (adminResponse) return adminResponse;

  // Fail closed：缺失端点在界面中明确暴露，不会穿透到 5411 的真实后端。
  return HttpResponse.json(
    {
      code: 501,
      message: `Mock 后端尚未覆盖 ${request.method} ${path}`,
      data: null,
    },
    { status: 501 },
  );
});

const crossref = http.get(
  /https:\/\/api\.crossref\.org\/works\/.+/,
  ({ request }) => {
    const encodedDoi = new URL(request.url).pathname.split("/").at(-1) ?? "";
    return HttpResponse.json({
      status: "ok",
      message: {
        DOI: decodeURIComponent(encodedDoi),
        title: ["Designing Trustworthy Research Agents"],
        author: [
          { given: "Yu", family: "Lin" },
          { given: "Fei-Fei", family: "Li" },
        ],
        "container-title": ["Journal of Human-AI Research"],
        volume: "12",
        page: "101-124",
        issued: { "date-parts": [[2026, 7, 18]] },
      },
    });
  },
);

const worker = setupWorker(apiCatchAll, crossref, mockWebSocketHandler);

export async function startMockBackend(): Promise<void> {
  if (!MOCK_MODE) return;

  // 必须先种入身份，再动态加载 App/router；否则 /admin 首次 loader 会读到旧 token。
  applyMockPersona(getMockPersona());

  // Beacon 不经过 axios；Mock 模式下直接确认接收，杜绝错误/曝光埋点访问外网。
  try {
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: () => true,
    });
  } catch {
    // 某些受限浏览器不允许重定义；这些调用本身是 best-effort，不影响主流程。
  }

  await worker.start({
    serviceWorker: { url: "/mockServiceWorker.js" },
    quiet: true,
    onUnhandledRequest(request, print) {
      const url = new URL(request.url);
      if (
        url.origin === window.location.origin &&
        url.pathname.startsWith("/api/")
      ) {
        print.error();
        return;
      }
      // Vite chunks、字体、public 资源等正常交给浏览器。
    },
  });
}
