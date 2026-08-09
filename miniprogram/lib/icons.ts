// 线性图标(对标 Web 端 lucide-react):24x24 stroke path → data URI 供 <image src> 用。
// <image> 里 stroke 无法用 currentColor 生效,故按用途固定颜色各生成一份(与 custom-tab-bar 同法)。
//
// ⚠️ data URI 里的 SVG 拿不到 wxss 变量,只能写死 —— 这是 app.wxss token 的手工镜像
//    (app.wxss 自己又是 frontend-user/src/styles/globals.css 的镜像)。
//    改 globals → 改 app.wxss → 也要改这里,三处必须一起动。
const C = {
  text: '#1F1F23', // foreground
  weak: '#686873', // muted-foreground
  faint: '#6E6E78', // faint
  red: '#882828', // brand-red
  green: '#2F4D29', // brand-green
  amberInk: '#805E00', // --amber-ink 琥珀软底上的可读色（裸琥珀 #B4880E 不承载小字）
  white: '#ffffff', // 深底按钮内图标(发送键等)
}

function svg(inner: string, stroke: string, fill: string = 'none'): string {
  const s =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="' +
    fill +
    '" stroke="' +
    stroke +
    '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    inner +
    '</svg>'
  return 'data:image/svg+xml,' + encodeURIComponent(s)
}

// lucide-react 官方 path(与移动端一致)
const P = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sliders:
    '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  heart:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  paperclip:
    '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  sparkles:
    '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287z"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  panelLeft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  squarePen:
    '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  circleSlash: '<circle cx="12" cy="12" r="10"/><line x1="9" x2="15" y1="15" y2="9"/>',
  alertCircle:
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  bookOpen:
    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  newspaper:
    '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  fileText:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  moreVertical: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
}

// 按「用途_颜色」导出,WXML 直接 src="{{ic.searchWeak}}"
export const ICONS = {
  searchWeak: svg(P.search, C.weak),
  slidersWeak: svg(P.sliders, C.weak),
  heartOff: svg(P.heart, C.faint),
  heartOn: svg(P.heart, C.red, C.red),
  plusText: svg(P.plus, C.text),
  plusRed: svg(P.plus, C.red),
  menuText: svg(P.menu, C.text),
  chevronWeak: svg(P.chevronDown, C.weak),
  paperclipWeak: svg(P.paperclip, C.weak),
  bookWeak: svg(P.book, C.weak),
  bookFaint: svg(P.book, C.faint),
  fileWeak: svg(P.file, C.weak),
  folderWeak: svg(P.folder, C.weak),
  wrenchWeak: svg(P.wrench, C.weak),
  checkGreen: svg(P.check, C.green),
  sparkGreen: svg(P.sparkles, C.green),
  sparkFaint: svg(P.sparkles, C.faint),
  loaderGreen: svg(P.loader, C.green),
  loaderWeak: svg(P.loader, C.weak),
  loaderWhite: svg(P.loader, C.white),
  // claw 对齐移动端 Web 增补:悬浮控制条 / 发送键 / 工具状态 / 空白态建议卡 / chip
  panelLeftText: svg(P.panelLeft, C.text),
  squarePenText: svg(P.squarePen, C.text),
  arrowUpWhite: svg(P.arrowUp, C.white),
  arrowUpFaint: svg(P.arrowUp, C.faint),
  circleSlashFaint: svg(P.circleSlash, C.faint),
  alertCircleRed: svg(P.alertCircle, C.red),
  alertCircleAmber: svg(P.alertCircle, C.amberInk), // 额度「尚未发送」琥珀卡
  checkCircleGreen: svg(P.checkCircle, C.green),
  terminalWeak: svg(P.terminal, C.weak),
  bookOpenGreen: svg(P.bookOpen, C.green),
  newspaperGreen: svg(P.newspaper, C.green),
  imageGreen: svg(P.image, C.green),
  fileTextGreen: svg(P.fileText, C.green),
  fileTextRed: svg(P.fileText, C.red),
  bookGreen: svg(P.book, C.green),
  folderGreen: svg(P.folder, C.green),
  moreVerticalFaint: svg(P.moreVertical, C.faint),
}

export type IconMap = typeof ICONS
