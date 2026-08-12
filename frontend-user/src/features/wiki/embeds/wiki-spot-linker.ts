/**
 * 从演示 fixture 自动抽取可点术语，并在同节正文里包一层可 hover 的 mark，
 * 与对应 UI 元素双向高亮。纯 DOM 后处理，不改 markdown 源文。
 */

const SKIP_LABELS = new Set([
  "确定",
  "取消",
  "关闭",
  "重试",
  "更多",
  "登录",
  "注册",
  "搜索",
  "筛选",
  "发送",
]);

const LABEL_RE = /^[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9 +/·\-]{1,24}$/;

export interface WikiSpot {
  id: string;
  label: string;
  el: HTMLElement;
}

function ownText(el: HTMLElement): string {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

function isSpotLabel(label: string): boolean {
  if (label.length < 2 || label.length > 24) return false;
  if (SKIP_LABELS.has(label)) return false;
  if (/^\d+$/.test(label)) return false;
  return LABEL_RE.test(label);
}

/** 「筛选器」→ 也可匹配正文里的「筛选」 */
export function labelVariants(label: string): string[] {
  const variants = [label];
  if (/[器区栏盘]$/.test(label) && label.length > 2) {
    variants.push(label.slice(0, -1));
  }
  return variants;
}

/** 在 fixture 内收集带标签的叶子/近叶元素（或显式 data-wiki-spot）。 */
export function collectFixtureSpots(fixture: Element): WikiSpot[] {
  const found = new Map<string, WikiSpot>();
  const elements = fixture.querySelectorAll<HTMLElement>("*");

  for (const el of elements) {
    if (el.closest("svg")) continue;
    const explicit = el.getAttribute("data-wiki-spot")?.trim();
    const label = explicit || ownText(el);
    if (!isSpotLabel(label)) continue;

    if (!explicit) {
      const childText = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (childText !== label && !childText.startsWith(label)) continue;
      if (el.children.length > 6) continue;
    }

    const prev = found.get(label);
    const prefer =
      !prev ||
      el.childElementCount < prev.el.childElementCount ||
      (el.childElementCount === prev.el.childElementCount &&
        el.outerHTML.length < prev.el.outerHTML.length);
    if (prefer) {
      prev?.el.removeAttribute("data-wiki-spot-id");
      if (!explicit) prev?.el.removeAttribute("data-wiki-spot");
      const id = `spot-${label}`;
      el.setAttribute("data-wiki-spot-id", id);
      el.setAttribute("data-wiki-spot", label);
      found.set(label, { id, label, el });
    }
  }

  return [...found.values()];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface TermLink {
  text: string;
  spotId: string;
}

function buildTermLinks(spots: WikiSpot[]): TermLink[] {
  const byText = new Map<string, string>();
  for (const spot of spots) {
    for (const text of labelVariants(spot.label)) {
      const prev = byText.get(text);
      // 更长的规范名优先占同文案
      if (!prev || spot.label.length >= (prev.length ?? 0)) {
        byText.set(text, spot.id);
      }
    }
  }
  return [...byText.entries()]
    .map(([text, spotId]) => ({ text, spotId }))
    .sort((a, b) => b.text.length - a.text.length);
}

/** 在 prose 根内按最长优先包裹术语。 */
export function linkTermsInProse(proseRoot: Element, spots: WikiSpot[]): void {
  proseRoot.querySelectorAll("mark[data-wiki-term]").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });

  const links = buildTermLinks(spots);
  if (links.length === 0) return;

  const pattern = new RegExp(
    `(${links.map((l) => escapeRegExp(l.text)).join("|")})`,
    "g",
  );
  const idByText = new Map(links.map((l) => [l.text, l.spotId]));

  const walker = document.createTreeWalker(proseRoot, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (
        parent.closest("mark[data-wiki-term], a, code, pre, h1, h2, h3, h4")
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      const text = node.textContent ?? "";
      return text.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      if (match.index > last) {
        frag.appendChild(
          document.createTextNode(text.slice(last, match.index)),
        );
      }
      const hit = match[1];
      const mark = document.createElement("mark");
      mark.dataset.wikiTerm = hit;
      mark.dataset.wikiTermId = idByText.get(hit) ?? "";
      mark.className = "wiki-spot-term";
      mark.textContent = hit;
      frag.appendChild(mark);
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

export function bindSpotHover(sectionRoot: HTMLElement): () => void {
  const setActive = (spotId: string | null) => {
    sectionRoot.querySelectorAll("[data-wiki-spot-id]").forEach((el) => {
      const on =
        spotId != null && el.getAttribute("data-wiki-spot-id") === spotId;
      el.toggleAttribute("data-wiki-spot-active", on);
    });
    sectionRoot.querySelectorAll("mark[data-wiki-term]").forEach((el) => {
      const on =
        spotId != null && el.getAttribute("data-wiki-term-id") === spotId;
      el.toggleAttribute("data-wiki-term-active", on);
    });
  };

  const onOver = (event: Event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const term = t.closest<HTMLElement>("mark[data-wiki-term]");
    if (term?.dataset.wikiTermId) {
      setActive(term.dataset.wikiTermId);
      return;
    }
    const spot = t.closest<HTMLElement>("[data-wiki-spot-id]");
    if (spot?.dataset.wikiSpotId) {
      setActive(spot.dataset.wikiSpotId);
    }
  };

  const onOut = (event: Event) => {
    const e = event as MouseEvent;
    const related = e.relatedTarget;
    if (related instanceof Node && sectionRoot.contains(related)) {
      const still =
        related instanceof Element &&
        (related.closest("mark[data-wiki-term]") ||
          related.closest("[data-wiki-spot-id]"));
      if (still) return;
    }
    setActive(null);
  };

  sectionRoot.addEventListener("mouseover", onOver);
  sectionRoot.addEventListener("mouseout", onOut);
  return () => {
    sectionRoot.removeEventListener("mouseover", onOver);
    sectionRoot.removeEventListener("mouseout", onOut);
    setActive(null);
  };
}

/** 对一节：抽 spot → 链正文 → 绑 hover。返回清理函数。 */
export function linkWikiSectionSpots(sectionRoot: HTMLElement): () => void {
  const fixtures = sectionRoot.querySelectorAll("[data-wiki-fixture]");
  const spots: WikiSpot[] = [];
  fixtures.forEach((fixture) => {
    spots.push(...collectFixtureSpots(fixture));
  });

  const proseRoots = sectionRoot.querySelectorAll("[data-wiki-prose]");
  proseRoots.forEach((prose) => linkTermsInProse(prose, spots));

  return bindSpotHover(sectionRoot);
}
