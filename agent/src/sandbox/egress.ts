// 出网控制(bwrap sandbox 的 net:open 进程 env)。
//
// 架构(egress 合并后):egress-proxy 容器已删,agent 容器经 egress-net(NAT)直连公网。
// 默认无 HTTPS_PROXY → net:open 的 bash sandbox 直接出网(bwrap --share-net)。
// 凭据安全靠 C4 bash env 白名单兜底(MINICOD/provider key 绝不进 bash 子进程),不再依赖 egress 替换。
// 若仍想经代理收口出网,设 HTTPS_PROXY env 即会注入 jail(本函数 graceful:无 proxy 则返回空)。

export function egressEnv(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const https = process.env.HTTPS_PROXY || process.env.https_proxy || "";
  const http = process.env.HTTP_PROXY || process.env.http_proxy || "";
  const no = process.env.NO_PROXY || process.env.no_proxy || "";
  if (https) out.push(["HTTPS_PROXY", https], ["https_proxy", https]);
  if (http) out.push(["HTTP_PROXY", http], ["http_proxy", http]);
  if (no) out.push(["NO_PROXY", no], ["no_proxy", no]);
  return out;
}
