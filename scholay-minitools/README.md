# Scholay 科研小工具 · 小红书离线小工具(批次一)

把 Scholay 的科研能力做成**小红书「小工具」**(离线 H5 zip):纯本地、不联网、单页、所有资源内嵌。
核心目标除了「好用」,还有两件事:**① 高游戏性视觉 + 动效;② 把用户引流到 [www.scholay.com](https://www.scholay.com)**。

---

## 六个工具

| 目录 | 小工具 | 一句话 | 游戏化亮点 |
|---|---|---|---|
| `checkrate/` | **查重红线速查** | 4 大类 30+ 场景查合格区间 + AIGC 率 + 检测系统对比 + 降重 + FAQ | 红线**仪表盘**扫弧 + 数字滚动 + 松紧配色 |
| `status/` | **投稿状态词典** | 13 状态节点 + 9 大系统对照 + 决议 + 催稿判断 + 话术 + FAQ | 投稿**流水线**进度动画 + EM↔ScholarOne 对照 |
| `predatory/` | **投稿避坑体检** | 17 红旗分类 + 5 级风险 + 11 核查渠道 + 劫持识别 + FAQ | **风险计**实时变色 + 低危撒彩带 / 高危抖动 |
| `stats/` | **科研统计工具箱** | h/g/i10 · t 检验 · 相关 · 样本量 · 描述统计,纯本地算 | 渐变**数据瓦片** + Canvas 图表 + 数字滚动 |
| `diff/` | **文本痕迹对比** | 两版文本词级高亮增/删/改,纯本地不上传 | **改动强度计** + 词级 diff 高亮 |
| `formula/` | **可视化公式编辑器** | 点符号编辑公式 → 实时导出 LaTeX | mathlive 所见即所得 + 代码模式降级 |

前三个工具数据蒸馏自 `backend/internal/content/data/qa/` 的学术百科并经联网研究扩充;stats 的公式与临界值表经 `stats/core.js` 单测核对(18/18 通过);全部离线内嵌,无需联网。

### ⚠️ formula 工具的特别说明(务必先单独测这个)

公式编辑器用 **mathlive**(ES 模块)做所见即所得渲染。**ES 模块在 `file://` 下会被浏览器 CORS 拦**(真实容器若用类 file 的 origin 也可能拦)。为此加了 `formula/guard.js`:mathlive 加载失败时**自动降级为「代码模式」**(可编辑 LaTeX 文本框 + 符号面板插入),保证工具在任何环境都能用。
- 已验证:HTTP origin → mathlive WYSIWYG 正常渲染、零外部请求;`file://` → 自动切代码模式、面板可用。
- **上传小红书后请优先测这一个**:若可视化编辑正常 = 容器支持模块;若显示「代码模式」= 容器拦了模块(仍可用,只是无实时渲染)。若你更想要「保证有渲染」,我可换成 KaTeX 预览版(无模块、纯 classic,100% 兼容,但为「输入 LaTeX→预览」而非拖拽编辑)。

> mathlive 用的是 `mathlive.min.mjs`(已核实 eval/Function/WASM = 0);两处内部 fetch(字体探测 + 音效)已用 `fontsDirectory='./fonts'` + `soundsDirectory=null` 短路,CDP 实测运行时零外部请求。字体经 `mathlive-fonts.css` 的 `@font-face` 打包加载。

---

## 转化怎么做的(重要)

⚠️ 小工具容器**禁止一切站外跳转**(`target=_blank` / `window.open` / 点击外链全被 CSP 拦)。所以「点一下跳到官网」做不到。本批用三条**合规**转化路径(全在 `_shared/convert.js` 注入的底部转化卡里):

1. **本地二维码**(`_shared/scholay-qr.svg`,已内联进 `convert.js`)—— 指向 `www.scholay.com`,微信/相机扫码进站,是唯一能真正「跳转」的路径,截图也能扫;
2. **CTA 文案钩子** —— 每个工具的结果页 + 底部卡都有「完整版在 Scholay」的引导,并滚动展示卖点;
3. **可长按选中的域名文本** —— 剪贴板 API 也被禁,域名做成 `user-select:text` 供手动复制。

> 换官网地址 / 二维码内容:改 `_shared/convert.js` 里的 `SITE` 与 `QR_SVG`(可用 `node qr` 重新生成,见下)。

---

## 构建与打包

```bash
cd scholay-minitools

bash build.sh check     # 只跑打包前合规自检(禁 fetch/内联脚本/onclick/eval/外链/iframe…)
bash build.sh           # 自检通过后 → 打包出 dist/checkrate.zip 等三个可上传 zip
```

`build.sh` 会把 `_shared/{brand.css,convert.js}` 同步进每个工具的 `./shared/`,再 `cd 工具目录 && zip`——
保证 **`index.html` 在 zip 根目录**、不多套一层(小红书规范硬要求)。产物在 `dist/`,各约 16KB(远低于 2MB 上限)。

### 本地预览

先跑一次 `bash build.sh`(生成各工具的 `shared/`),再用浏览器打开 `checkrate/index.html` 即可。
真机窄屏效果请用手机 DevTools 设备模拟(容器实际是 375–430px WebView)。

### 重新生成二维码(换域名时)

```bash
npm i qrcode --no-save --prefix /tmp/qr
node -e "require('/tmp/qr/node_modules/qrcode').toString('https://www.scholay.com',{type:'svg',margin:0,errorCorrectionLevel:'M',color:{dark:'#0B1220',light:'#00000000'}},(e,s)=>console.log(s))"
```
把输出的 `<path .../>` 覆盖 `convert.js` 里的 `QR_SVG` 与 `_shared/scholay-qr.svg`。

---

## 目录结构

```
scholay-minitools/
├── build.sh              # 打包 + 合规自检
├── _shared/              # 跨工具共享源(打包时同步进各工具 shared/)
│   ├── brand.css         # 设计系统:极光背景 / 玻璃卡片 / 动效库 / 转化卡样式
│   ├── convert.js        # 运行时:注入转化卡 + 彩带 / 数字滚动 / 环形量规
│   └── scholay-qr.svg    # scholay.com 二维码(canonical;convert.js 已内联同款)
├── checkrate/  status/  predatory/     # 三个工具(各含 index.html + app.js + data.js + style.css)
└── dist/                 # bash build.sh 产物(可上传 zip)
```

每个 `工具/shared/` 与 `dist/` 都是 `build.sh` 生成物,已在 `.gitignore` 忽略。

---

## 合规基线(对照小工具容器约束)

- ✅ `index.html` 在 zip 根;仅含 `.html/.css/.js`(二维码 SVG 内联,无外链)
- ✅ 脚本全外置 `<script src>`,事件全 `addEventListener`;无内联 `<script>` / `onclick=` / `eval` / `new Function`
- ✅ 零联网:无 `fetch`/`XHR`/`WebSocket`;数据写死在各 `data.js`
- ✅ 无 `<iframe>` / `window.open` / `target=_blank` / 文件下载 / 剪贴板 API
- ✅ 只用到允许能力:Canvas2D(彩带动效)、`user-select:text`(可选中文本);未触碰任何受限 API
- ✅ viewport 含 `viewport-fit=cover`;安全区用 `env()`;总包 < 2MB

---

## 下一批(batch 2)候选(已探明可行)

- **可视化公式编辑器 → LaTeX**:`mathlive` 已在 `frontend-user/node_modules/mathlive/`(库 + 字体 296KB,可整包内嵌 < 0.6MB),复用 `MathEditorDialog` 思路,是唯一「可晒可交互出片」的生产工具。
- **两段文本痕迹 Diff**:复用 `frontend-user/src/features/prism/lib/struct-diff.ts` 的分词 + 词级对齐,蹭「AI 改稿看不清改了哪」痛点。
- **统计小工具系列**:h-index / 样本量·检验效能 / t 检验 · 相关系数 —— 纯手动录入 + Canvas 图,全离线。
