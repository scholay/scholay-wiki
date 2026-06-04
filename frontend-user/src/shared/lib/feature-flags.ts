// 临时功能开关(build-time Vite env)。要彻底撤掉某个开关:删掉这里的常量 + 其引用处 +
// build-and-push.sh / Dockerfile 里对应的 --build-arg/ARG 即可,不影响功能本体代码。

/**
 * 智能写作 (Prism) 「即将推出」临时门:
 *   VITE_PRISM_COMING_SOON='true' → 菜单加「即将推出」角标 + /prism 页面盖蒙层(ComingSoonView)。
 *   未设 / 非 'true'(如本地 dev)→ 放行真实 Prism,方便继续迭代开发。
 * 生产构建默认 'true'(见 build-and-push.sh 兜底);Prism 正式上线时把 .env 的 PRISM_COMING_SOON 设为 false 重新构建即可。
 */
export const PRISM_COMING_SOON = import.meta.env.VITE_PRISM_COMING_SOON === 'true';
