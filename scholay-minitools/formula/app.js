/* 可视化公式编辑器 · mathlive(离线) */
import { MathfieldElement } from './mathlive.min.mjs';

// 关键:显式指定本地字体目录(短路 mathlive 的 HEAD 探测 fetch)、关掉音效(短路音效 fetch)
MathfieldElement.fontsDirectory = './fonts';
MathfieldElement.soundsDirectory = null;

var D = window.FORMULA_DATA, S = window.Scholay, esc = S.esc;

var mf = new MathfieldElement();
mf.setAttribute('id', 'mf');
mf.style.width = '100%';
document.getElementById('mfhost').appendChild(mf);
mf.value = 'e^{i\\pi}+1=0';

var latex = document.getElementById('latex');
function sync() { latex.value = mf.value; }
mf.addEventListener('input', sync);

function insert(t) {
  mf.focus();
  try { mf.insert(t, { focus: true }); } catch (e) { mf.value = (mf.value || '') + t; }
  sync();
}
function setAll(t) { mf.value = t; mf.focus(); sync(); }

// 符号面板
var pal = document.getElementById('palette');
D.groups.forEach(function (g) {
  pal.appendChild(S.el('div', 'pal-g', esc(g.g)));
  var row = S.el('div', 'pal-row');
  g.items.forEach(function (it) {
    var b = S.el('button', 'pkey', esc(it.l));
    b.addEventListener('click', function () { insert(it.t); });
    row.appendChild(b);
  });
  pal.appendChild(row);
});

// 示例模板
var ex = document.getElementById('examples');
D.examples.forEach(function (e) {
  var b = S.el('button', 'chip', esc(e.l));
  b.addEventListener('click', function () { setAll(e.t); });
  ex.appendChild(b);
});

// facts / disclaimer
var facts = document.getElementById('facts');
facts.className = 'facts stagger';
D.facts.forEach(function (f) { facts.appendChild(S.el('div', 'fact', '<h4>' + esc(f.h) + '</h4><p>' + esc(f.p) + '</p>')); });
document.getElementById('disclaimer').innerHTML = '🔒 ' + esc(D.disclaimer);

sync();
