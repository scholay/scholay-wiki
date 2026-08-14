/**
 * mock 窗口左上角的 macOS 红绿灯三点 —— landing 里的「浏览器 / 编辑器窗口」拟物件共用。
 *
 * ⚠️ 这三个 hex 是 **外部指涉**(macOS 系统窗口按钮的 close/minimize/zoom 实色),
 * 不是本站设计语言的一部分 —— 换成品牌朱砂/琥珀/松青会立刻失去「这是一个窗口」的能指。
 * 因此刻意不 token 化(Figma 设计系统里也没有对应色),按「外部品牌资产」豁免保留 arbitrary value,
 * 并收在此处保证两个 mock 只有一份真源。
 */
export function MacTrafficLights() {
  return (
    <>
      <span className="size-2.5 rounded-pill bg-[#FF5F57]" />
      <span className="size-2.5 rounded-pill bg-[#FEBC2E]" />
      <span className="size-2.5 rounded-pill bg-[#28C840]" />
    </>
  );
}
