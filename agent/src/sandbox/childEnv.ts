// 子进程环境变量白名单 —— **执行器 spawn 的任何子进程都只能看到这里列出的变量**。
//
// ## 为什么必须是一个共享叶子模块,而不是某个文件里的私有函数
//
// 这条规则本来只以 `tools/registry.ts` 里一个模块私有的 `bashEnv()` 存在,注释写得很清楚:
//   「bash 子进程只继承白名单 env —— **绝不** {...process.env}(C4:否则模型
//     echo $MINICOD_API_KEY / $EXECUTOR_AUTH_TOKEN 即窃取账户级密钥与内部 bearer)」
//
// 然后第二个调用点出现了。`turn/deliveryGate.ts` 的交付闸探针要 spawn python,
// 它够不到那个私有函数,于是**自己发明了一套**:`env: { ...process.env }` ——
// 全仓唯一一处破例,而且理由(「显式传 env,否则 STATKIT_NUMCHECK_ENFORCE 传不进子进程」)
// 在事实层面也站不住:那个变量从未在任何 compose/.env 里设过。
// **为一个从未启用的开关,付出了全量 env 泄漏的代价。**
//
// 这不是那个人不小心。规则住在私有作用域里,第二个调用点就**看不见它** ——
// 唯一能让它不再复发的形态,是让它成为一个所有人都 import 得到的东西。
//
// ⚠️ 往 PASS 里加变量前先问:模型能不能让子进程把它打印出来?能 ⇒ 它就等于对模型公开。
//    密钥类(MINICOD_API_KEY / EXECUTOR_AUTH_TOKEN / ANTHROPIC_*)永远不进这个清单。

/** 允许透传给子进程的非密变量。只放「跑命令必需」的:locale、临时目录、时区、出网代理。 */
const PASS = [
  "PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TERM", "TZ",
  "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy",
] as const;

/**
 * 构造子进程 env(白名单)。
 *
 * @param extra 额外注入的键值对 —— 用于**执行器自己决定**的、与密钥无关的开关。
 *              注意:这里只该放执行器计算出来的值,不该用来「补一个 process.env 里的变量」;
 *              需要那样做时,正确动作是把它加进 PASS 并说明为什么它不敏感。
 */
export function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PASS) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  if (!out.PATH) out.PATH = "/usr/local/bin:/usr/bin:/bin";
  return { ...out, ...extra };
}
