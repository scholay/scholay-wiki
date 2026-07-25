/**
 * 科研绘图产物下载工具 —— 触发浏览器下载 SVG 字符串 / blob URL。
 * (旧的 scene-graph→SVG 导出器 sceneToSvg 随无限画布下线一并移除;现在图是配方渲染的静态 SVG,
 *  直接下载 composeFigure 产出的 SVG 串即可,见 FigureSvgDisplay。)
 */

/** 触发浏览器下载一个 data/blob URL。 */
export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 下载文本(如 SVG 字符串)。 */
export function downloadText(text: string, filename: string, mime = 'image/svg+xml') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
