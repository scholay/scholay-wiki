/**
 * 运行时 polyfill —— 必须是 main.tsx 的**第一个 import**,先于一切业务模块求值。
 * 只放「旧浏览器缺静态方法」级别的小补丁,大型 shim 不进这里。纯 TS 叶子,零依赖。
 */

// URL.parse(2026-07 线上审计,clientlog 实证):Safari < 18 等旧内核没有该静态方法,
// pdfjs-dist 的 TextLayer 运行时调用 URL.parse → TypeError → PDF 预览整页白屏。
// 语义对齐标准:可解析返回 URL 实例,不可解析返回 null(不抛异常)。
if (typeof URL.parse !== 'function') {
  URL.parse = (url: string | URL, base?: string | URL): URL | null => {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

export {};
