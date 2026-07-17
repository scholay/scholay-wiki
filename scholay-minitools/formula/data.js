window.FORMULA_DATA = {
  disclaimer: '所见即所得编辑,实时导出 LaTeX。全程离线本地渲染,公式内容不上传。导出的 LaTeX 可直接粘进 Overleaf / Word 公式 / Markdown。',
  groups: [
    { g: '结构', items: [
      { l: '½', t: '\\frac{#?}{#?}' }, { l: 'xⁿ', t: '#?^{#?}' }, { l: 'xᵢ', t: '#?_{#?}' },
      { l: '√', t: '\\sqrt{#?}' }, { l: 'ⁿ√', t: '\\sqrt[#?]{#?}' }, { l: '|x|', t: '\\left|#?\\right|' }
    ] },
    { g: '大算子', items: [
      { l: '∑', t: '\\sum_{#?}^{#?}' }, { l: '∫', t: '\\int_{#?}^{#?}' }, { l: '∏', t: '\\prod_{#?}^{#?}' },
      { l: 'lim', t: '\\lim_{#?}' }, { l: '∂', t: '\\frac{\\partial #?}{\\partial #?}' }
    ] },
    { g: '希腊字母', items: [
      { l: 'α', t: '\\alpha' }, { l: 'β', t: '\\beta' }, { l: 'γ', t: '\\gamma' }, { l: 'θ', t: '\\theta' },
      { l: 'π', t: '\\pi' }, { l: 'μ', t: '\\mu' }, { l: 'σ', t: '\\sigma' }, { l: 'λ', t: '\\lambda' },
      { l: 'Δ', t: '\\Delta' }, { l: 'Σ', t: '\\Sigma' }, { l: 'φ', t: '\\phi' }, { l: 'ω', t: '\\omega' }
    ] },
    { g: '运算 · 关系', items: [
      { l: '≤', t: '\\le' }, { l: '≥', t: '\\ge' }, { l: '≠', t: '\\ne' }, { l: '≈', t: '\\approx' },
      { l: '±', t: '\\pm' }, { l: '×', t: '\\times' }, { l: '÷', t: '\\div' }, { l: '·', t: '\\cdot' },
      { l: '→', t: '\\to' }, { l: '∞', t: '\\infty' }, { l: '∈', t: '\\in' }, { l: '∀', t: '\\forall' }
    ] },
    { g: '标注 · 矩阵', items: [
      { l: 'x̄', t: '\\bar{#?}' }, { l: 'x̂', t: '\\hat{#?}' }, { l: 'vec', t: '\\vec{#?}' },
      { l: '矩阵', t: '\\begin{pmatrix}#? & #? \\\\ #? & #?\\end{pmatrix}' },
      { l: '分段', t: '\\begin{cases}#? \\\\ #?\\end{cases}' }
    ] }
  ],
  examples: [
    { l: '二次求根公式', t: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}' },
    { l: '正态分布密度', t: 'f(x)=\\frac{1}{\\sigma\\sqrt{2\\pi}}\\,e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}' },
    { l: '高斯求和', t: '\\sum_{i=1}^{n} i=\\frac{n(n+1)}{2}' },
    { l: '欧拉恒等式', t: 'e^{i\\pi}+1=0' }
  ],
  facts: [
    { h: '所见即所得', p: '直接点符号、拖动光标编辑,像写在纸上一样;下方实时生成对应的 LaTeX 代码。' },
    { h: '导出即用', p: '生成的 LaTeX 可长按选中复制,粘进 Overleaf、Word 公式编辑器、Markdown、知乎等任何支持 LaTeX 的地方。' },
    { h: '离线 · 隐私', p: '公式在你的设备本地渲染,不联网、不上传;整套渲染引擎与字体已打包在小工具内。' }
  ]
};
