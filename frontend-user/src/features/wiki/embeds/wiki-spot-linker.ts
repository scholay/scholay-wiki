/**
 * 从演示 fixture 自动抽取可点术语，并在同节正文里包一层可 hover 的 mark，
 * 与对应 UI 元素关联：hover / focus 时只保留目标原色，其余演示区域蒙层。
 * 纯 DOM 后处理，不改 markdown 源文。
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
  /** 落到同一区域的其它标签，例如面板标题旁的分组名。 */
  labels: string[];
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

function classOf(el: Element): string {
  const value = (el as HTMLElement).className;
  return typeof value === "string" ? value : "";
}

const PANEL_TAGS = new Set([
  "ASIDE",
  "SECTION",
  "NAV",
  "ARTICLE",
  "FORM",
  "MAIN",
]);

function isTinyControl(el: HTMLElement): boolean {
  if (PANEL_TAGS.has(el.tagName)) return false;
  if (el.childElementCount === 0) return true;
  const cls = classOf(el);
  if (/\bsize-(?:3|3\.5|4|5|6|7|8|9|icon)(?:-inline)?\b/.test(cls)) return true;
  if (/\brounded-pill\b/.test(cls) && el.childElementCount <= 2) return true;
  return false;
}

function isPanel(el: HTMLElement, fixture: Element): boolean {
  if (el === fixture) return false;
  if (PANEL_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute("role");
  if (
    role === "navigation" ||
    role === "search" ||
    role === "dialog" ||
    role === "toolbar"
  ) {
    return true;
  }
  const cls = classOf(el);
  if (/\bshadow-(overlay|raised)\b/.test(cls)) return true;
  if (/\brounded-(?:8|12|16|20)\b/.test(cls) && /\bborder\b/.test(cls)) {
    return true;
  }
  return false;
}

function isListRow(el: HTMLElement): boolean {
  const cls = classOf(el);
  if (!/\bflex\b/.test(cls) || !/\bitems-center\b/.test(cls)) return false;
  if (el.childElementCount < 2) return false;
  return /\bh-(?:7|8|9|10)\b/.test(cls) || /\bpx-/.test(cls);
}

function isTitleBar(el: HTMLElement, fixture: Element): boolean {
  if (el.tagName === "HEADER") return true;
  if (/^H[1-6]$/.test(el.tagName)) return true;
  const parent = el.parentElement;
  if (!parent) return false;
  const cls = classOf(el);
  const headingChrome = /\bflex\b/.test(cls) && /\bitems-center\b/.test(cls);
  if (!headingChrome) return false;
  if (parent === fixture && parent.firstElementChild === el) return true;
  return isPanel(parent, fixture) && parent.firstElementChild === el;
}

/**
 * 把标签所在叶子提升到可高亮的整块区域：侧栏、卡片、列表行，而不是文字本身。
 */
export function nearestSpotRegion(
  el: HTMLElement,
  fixture: Element,
): HTMLElement {
  let current: HTMLElement | null = el;

  while (current && current !== fixture) {
    if (isTitleBar(current, fixture) || isTinyControl(current)) {
      current = current.parentElement;
      continue;
    }
    if (isListRow(current)) return current;
    if (isPanel(current, fixture)) return current;
    current = current.parentElement;
  }

  return fixture instanceof HTMLElement ? fixture : el;
}

function uniqueSpots(found: Map<string, WikiSpot>): WikiSpot[] {
  const seen = new Set<HTMLElement>();
  const spots: WikiSpot[] = [];
  for (const [text, spot] of found) {
    if (!spot.labels.includes(text)) spot.labels.push(text);
    if (seen.has(spot.el)) continue;
    seen.add(spot.el);
    spots.push(spot);
  }
  return spots;
}

function attachSpot(
  found: Map<string, WikiSpot>,
  el: HTMLElement,
  label: string,
  namespace: string,
): WikiSpot {
  const existingOnEl = [...found.values()].find((spot) => spot.el === el);
  if (existingOnEl) {
    if (!existingOnEl.labels.includes(label)) existingOnEl.labels.push(label);
    found.set(label, existingOnEl);
    return existingOnEl;
  }

  const existingByLabel = found.get(label);
  if (existingByLabel) return existingByLabel;

  const id = `spot-${namespace}-${label}`;
  el.setAttribute("data-wiki-spot-id", id);
  if (!el.getAttribute("data-wiki-spot")) {
    el.setAttribute("data-wiki-spot", label);
  }
  const spot: WikiSpot = { id, label, labels: [label], el };
  found.set(label, spot);
  return spot;
}

/** 在 fixture 内收集带标签的区域（显式 data-wiki-spot 优先，自动标签提升到所在面板）。 */
export function collectFixtureSpots(
  fixture: Element,
  namespace = fixture.getAttribute("data-wiki-fixture")?.trim() || "fixture",
): WikiSpot[] {
  const found = new Map<string, WikiSpot>();
  const declared = [
    ...(fixture instanceof HTMLElement && fixture.getAttribute("data-wiki-spot")
      ? [fixture]
      : []),
    ...fixture.querySelectorAll<HTMLElement>("[data-wiki-spot]"),
  ];

  for (const el of declared) {
    if (el.closest("svg")) continue;
    const label = el.getAttribute("data-wiki-spot")?.trim();
    if (!label || !isSpotLabel(label)) continue;
    attachSpot(found, el, label, namespace);
  }

  for (const el of fixture.querySelectorAll<HTMLElement>("*")) {
    if (el.closest("svg")) continue;
    if (el.hasAttribute("data-wiki-spot-id")) continue;
    const label = ownText(el);
    if (!isSpotLabel(label)) continue;

    const childText = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (childText !== label && !childText.startsWith(label)) continue;
    if (el.children.length > 6) continue;

    const region = nearestSpotRegion(el, fixture);
    attachSpot(found, region, label, namespace);
  }

  return uniqueSpots(found);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface TermLink {
  text: string;
  spotId: string;
}

function buildTermLinks(spots: WikiSpot[]): TermLink[] {
  const byText = new Map<
    string,
    { spotId: string; canonicalLabelLength: number }
  >();
  for (const spot of spots) {
    for (const label of spot.labels) {
      for (const text of labelVariants(label)) {
        const prev = byText.get(text);
        if (!prev || label.length > prev.canonicalLabelLength) {
          byText.set(text, {
            spotId: spot.id,
            canonicalLabelLength: label.length,
          });
        }
      }
    }
  }
  return [...byText.entries()]
    .map(([text, { spotId }]) => ({ text, spotId }))
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
      mark.tabIndex = 0;
      mark.setAttribute("aria-label", `在界面示意中定位：${hit}`);
      mark.title = "悬停或聚焦后，在下方界面示意中定位这个元素";
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
  let hoveredSpotId: string | null = null;
  let focusedSpotId: string | null = null;

  const spotIdFromTarget = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element) || !sectionRoot.contains(target)) {
      return null;
    }
    const term = target.closest<HTMLElement>("mark[data-wiki-term]");
    if (term?.dataset.wikiTermId) return term.dataset.wikiTermId;
    const spot = target.closest<HTMLElement>("[data-wiki-spot-id]");
    return spot?.dataset.wikiSpotId ?? null;
  };

  const clearCutout = (fixture: HTMLElement) => {
    fixture.style.removeProperty("--wiki-spot-cutout-left");
    fixture.style.removeProperty("--wiki-spot-cutout-top");
    fixture.style.removeProperty("--wiki-spot-cutout-width");
    fixture.style.removeProperty("--wiki-spot-cutout-height");
  };

  const setCutoutRect = (
    fixture: HTMLElement,
    left: number,
    top: number,
    width: number,
    height: number,
  ) => {
    fixture.style.setProperty("--wiki-spot-cutout-left", `${left}px`);
    fixture.style.setProperty("--wiki-spot-cutout-top", `${top}px`);
    fixture.style.setProperty("--wiki-spot-cutout-width", `${width}px`);
    fixture.style.setProperty("--wiki-spot-cutout-height", `${height}px`);
  };

  const setFullScrim = (fixture: HTMLElement) => {
    setCutoutRect(fixture, 0, 0, 0, 0);
  };

  /**
   * 用四层渐变在蒙层里挖出目标矩形。这样即使目标本身透明，也不会透出蒙层；
   * “高亮”只来自周围被压暗后的对比，不给目标额外染色或描边。
   */
  const setCutout = (fixture: HTMLElement, spot: Element) => {
    const fixtureRect = fixture.getBoundingClientRect();
    const spotRect = spot.getBoundingClientRect();
    const width = fixture.clientWidth;
    const height = fixture.clientHeight;
    const originLeft = fixtureRect.left + fixture.clientLeft;
    const originTop = fixtureRect.top + fixture.clientTop;
    const left = Math.max(0, Math.min(width, spotRect.left - originLeft));
    const top = Math.max(0, Math.min(height, spotRect.top - originTop));
    const right = Math.max(left, Math.min(width, spotRect.right - originLeft));
    const bottom = Math.max(top, Math.min(height, spotRect.bottom - originTop));

    setCutoutRect(fixture, left, top, right - left, bottom - top);
  };

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
    sectionRoot
      .querySelectorAll<HTMLElement>("[data-wiki-fixture]")
      .forEach((fixture) => {
        const activeSpot =
          spotId == null
            ? null
            : fixture.getAttribute("data-wiki-spot-id") === spotId
              ? fixture
              : [...fixture.querySelectorAll("[data-wiki-spot-id]")].find(
                  (el) => el.getAttribute("data-wiki-spot-id") === spotId,
                );

        if (spotId == null) {
          fixture.removeAttribute("data-wiki-spot-tour");
          return;
        }

        if (!activeSpot) setFullScrim(fixture);
        else if (activeSpot === fixture) {
          setCutoutRect(
            fixture,
            0,
            0,
            fixture.clientWidth,
            fixture.clientHeight,
          );
        } else setCutout(fixture, activeSpot);
        fixture.setAttribute("data-wiki-spot-tour", "");
      });
  };

  const renderActive = () => setActive(focusedSpotId ?? hoveredSpotId);

  const onOver = (event: Event) => {
    hoveredSpotId = spotIdFromTarget(event.target);
    renderActive();
  };

  const onOut = (event: Event) => {
    const e = event as MouseEvent;
    hoveredSpotId = spotIdFromTarget(e.relatedTarget);
    renderActive();
  };

  const onFocusIn = (event: FocusEvent) => {
    focusedSpotId = spotIdFromTarget(event.target);
    renderActive();
  };

  const onFocusOut = (event: FocusEvent) => {
    focusedSpotId = spotIdFromTarget(event.relatedTarget);
    renderActive();
  };

  const refreshCutout = () => {
    if (focusedSpotId || hoveredSpotId) renderActive();
  };

  sectionRoot.addEventListener("mouseover", onOver);
  sectionRoot.addEventListener("mouseout", onOut);
  sectionRoot.addEventListener("focusin", onFocusIn);
  sectionRoot.addEventListener("focusout", onFocusOut);
  sectionRoot.addEventListener("scroll", refreshCutout, true);
  window.addEventListener("resize", refreshCutout);
  return () => {
    sectionRoot.removeEventListener("mouseover", onOver);
    sectionRoot.removeEventListener("mouseout", onOut);
    sectionRoot.removeEventListener("focusin", onFocusIn);
    sectionRoot.removeEventListener("focusout", onFocusOut);
    sectionRoot.removeEventListener("scroll", refreshCutout, true);
    window.removeEventListener("resize", refreshCutout);
    setActive(null);
    sectionRoot
      .querySelectorAll<HTMLElement>("[data-wiki-fixture]")
      .forEach(clearCutout);
  };
}

/** 对一节：抽 spot → 链正文 → 绑 hover。返回清理函数。 */
export function linkWikiSectionSpots(sectionRoot: HTMLElement): () => void {
  const fixtures = sectionRoot.querySelectorAll("[data-wiki-fixture]");
  const spots: WikiSpot[] = [];
  fixtures.forEach((fixture, index) => {
    const fixtureName =
      fixture.getAttribute("data-wiki-fixture")?.trim() || "fixture";
    spots.push(...collectFixtureSpots(fixture, `${fixtureName}-${index}`));
  });

  const proseRoots = sectionRoot.querySelectorAll("[data-wiki-prose]");
  proseRoots.forEach((prose) => linkTermsInProse(prose, spots));

  return bindSpotHover(sectionRoot);
}
