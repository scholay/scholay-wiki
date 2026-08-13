/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  collectFixtureSpots,
  labelVariants,
  linkTermsInProse,
  linkWikiSectionSpots,
  nearestSpotRegion,
} from "../src/features/wiki/embeds/wiki-spot-linker";

function domRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function setElementBox(element: Element, rect: DOMRect, borderWidth = 0): void {
  element.getBoundingClientRect = () => rect;
  Object.defineProperties(element, {
    clientLeft: { configurable: true, value: borderWidth },
    clientTop: { configurable: true, value: borderWidth },
    clientWidth: {
      configurable: true,
      value: rect.width - borderWidth * 2,
    },
    clientHeight: {
      configurable: true,
      value: rect.height - borderWidth * 2,
    },
  });
}

describe("wiki-spot-linker", () => {
  it("从 fixture 抽出标签，并在正文中包成可关联术语", () => {
    const fixture = document.createElement("div");
    fixture.setAttribute("data-wiki-fixture", "classic-search-filters");
    fixture.innerHTML = `
      <span>筛选器</span>
      <span>数据源</span>
      <span>开放获取</span>
    `;
    const spots = collectFixtureSpots(fixture);
    expect(spots).toHaveLength(1);
    expect(spots[0]?.el).toBe(fixture);
    expect(spots[0]?.labels.sort()).toEqual(
      ["开放获取", "数据源", "筛选器"].sort(),
    );
    expect(labelVariants("筛选器")).toEqual(["筛选器", "筛选"]);

    const prose = document.createElement("div");
    prose.innerHTML = "<p>修改任一筛选条件都会重新查询；可打开开放获取。</p>";
    linkTermsInProse(prose, spots);
    const marks = [...prose.querySelectorAll("mark[data-wiki-term]")];
    const terms = marks.map((el) => el.getAttribute("data-wiki-term"));
    expect(terms).toContain("筛选");
    expect(terms).toContain("开放获取");
    const filterMark = marks.find(
      (el) => el.getAttribute("data-wiki-term") === "筛选",
    );
    expect(filterMark?.getAttribute("data-wiki-term-id")).toBe(
      "spot-classic-search-filters-筛选器",
    );
    expect((filterMark as HTMLElement | undefined)?.tabIndex).toBe(0);
    expect(filterMark?.getAttribute("aria-label")).toBe(
      "在界面示意中定位：筛选",
    );
  });

  it("把文字标签提升到所在面板或列表行，而不是高亮叶子", () => {
    const fixture = document.createElement("div");
    fixture.setAttribute("data-wiki-fixture", "claw-workspace");
    fixture.innerHTML = `
      <aside>
        <div class="flex h-12 items-center px-4">
          <p>工作区</p>
        </div>
        <div class="flex h-8 items-center gap-2 px-4">
          <span></span>
          <span>暂存区</span>
          <span>3</span>
        </div>
      </aside>
      <section>对话</section>
    `;
    const title = fixture.querySelector("p") as HTMLElement;
    const itemLabel = [...fixture.querySelectorAll("span")].find(
      (el) => el.textContent === "暂存区",
    ) as HTMLElement;
    const row = itemLabel.parentElement as HTMLElement;
    const sidebar = fixture.querySelector("aside") as HTMLElement;

    expect(nearestSpotRegion(title, fixture)).toBe(sidebar);
    expect(nearestSpotRegion(itemLabel, fixture)).toBe(row);

    const spots = collectFixtureSpots(fixture);
    const workspace = spots.find((spot) => spot.label === "工作区");
    const staging = spots.find((spot) => spot.labels.includes("暂存区"));
    expect(workspace?.el).toBe(sidebar);
    expect(staging?.el).toBe(row);
  });

  it("显式区域优先于同名叶子，hover 时只挖空目标并蒙住本节其它 fixture", () => {
    const section = document.createElement("div");
    section.innerHTML = `
      <div data-wiki-prose><p>打开工作区后可以继续补充输入框。</p></div>
      <div data-wiki-fixture="claw-workspace">
        <aside data-wiki-spot="工作区"><span>工作区</span></aside>
        <div class="rounded-16 border border-border shadow-raised" data-wiki-spot="输入框">
          <span>GPT-5</span>
        </div>
      </div>
      <div data-wiki-fixture="claw-workspace-secondary">
        <aside data-wiki-spot="工作区"><span>工作区</span></aside>
      </div>
    `;
    const cleanup = linkWikiSectionSpots(section);
    const mark = [...section.querySelectorAll("mark[data-wiki-term]")].find(
      (el) => el.getAttribute("data-wiki-term") === "工作区",
    );
    const fixtures = [
      ...section.querySelectorAll<HTMLElement>("[data-wiki-fixture]"),
    ];
    const fixture = fixtures[0];
    const otherFixture = fixtures[1];
    const sidebars = [...section.querySelectorAll<HTMLElement>("aside")];
    const sidebar = sidebars[0];
    const otherSidebar = sidebars[1];
    const leaf = sidebar?.querySelector("span");
    setElementBox(fixture!, domRect(100, 200, 400, 300), 1);
    setElementBox(sidebar!, domRect(141, 231, 160, 80));
    setElementBox(otherFixture!, domRect(520, 200, 240, 180));
    setElementBox(otherSidebar!, domRect(540, 220, 120, 60));

    expect(mark).not.toBeNull();
    expect(sidebar?.hasAttribute("data-wiki-spot-id")).toBe(true);
    expect(leaf?.hasAttribute("data-wiki-spot-id")).toBe(false);
    expect(sidebar?.getAttribute("data-wiki-spot-id")).not.toBe(
      otherSidebar?.getAttribute("data-wiki-spot-id"),
    );

    mark?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(sidebar?.hasAttribute("data-wiki-spot-active")).toBe(true);
    expect(otherSidebar?.hasAttribute("data-wiki-spot-active")).toBe(false);
    expect(mark?.hasAttribute("data-wiki-term-active")).toBe(true);
    expect(fixture?.hasAttribute("data-wiki-spot-tour")).toBe(true);
    expect(otherFixture?.hasAttribute("data-wiki-spot-tour")).toBe(true);
    expect(fixture?.style.getPropertyValue("--wiki-spot-cutout-left")).toBe(
      "40px",
    );
    expect(fixture?.style.getPropertyValue("--wiki-spot-cutout-top")).toBe(
      "30px",
    );
    expect(fixture?.style.getPropertyValue("--wiki-spot-cutout-width")).toBe(
      "160px",
    );
    expect(fixture?.style.getPropertyValue("--wiki-spot-cutout-height")).toBe(
      "80px",
    );
    expect(
      otherFixture?.style.getPropertyValue("--wiki-spot-cutout-width"),
    ).toBe("0px");
    expect(
      otherFixture?.style.getPropertyValue("--wiki-spot-cutout-height"),
    ).toBe("0px");

    mark?.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: section }),
    );
    expect(sidebar?.hasAttribute("data-wiki-spot-active")).toBe(false);
    expect(fixture?.hasAttribute("data-wiki-spot-tour")).toBe(false);

    mark?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    mark?.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: section }),
    );
    expect(sidebar?.hasAttribute("data-wiki-spot-active")).toBe(true);
    expect(fixture?.hasAttribute("data-wiki-spot-tour")).toBe(true);
    mark?.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: section }),
    );
    expect(sidebar?.hasAttribute("data-wiki-spot-active")).toBe(false);

    cleanup();
    expect(fixture?.style.getPropertyValue("--wiki-spot-cutout-width")).toBe(
      "",
    );
  });

  it("目标就是 fixture 根节点时保留整张原色，只蒙住同节其它演示", () => {
    const section = document.createElement("div");
    section.innerHTML = `
      <div data-wiki-prose><p>筛选器用于收窄结果。</p></div>
      <div data-wiki-fixture="classic-search-filters" data-wiki-spot="筛选器">
        <span>筛选器</span>
      </div>
      <div data-wiki-fixture="search-results" data-wiki-spot="结果列表">
        <span>结果列表</span>
      </div>
    `;
    const cleanup = linkWikiSectionSpots(section);
    const fixtures = [
      ...section.querySelectorAll<HTMLElement>("[data-wiki-fixture]"),
    ];
    const mark = section.querySelector<HTMLElement>(
      'mark[data-wiki-term="筛选器"]',
    );
    setElementBox(fixtures[0]!, domRect(0, 0, 200, 120));
    setElementBox(fixtures[1]!, domRect(220, 0, 200, 120));

    mark?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    expect(fixtures[0]?.hasAttribute("data-wiki-spot-active")).toBe(true);
    expect(
      fixtures[0]?.style.getPropertyValue("--wiki-spot-cutout-width"),
    ).toBe("200px");
    expect(
      fixtures[0]?.style.getPropertyValue("--wiki-spot-cutout-height"),
    ).toBe("120px");
    expect(
      fixtures[1]?.style.getPropertyValue("--wiki-spot-cutout-width"),
    ).toBe("0px");
    expect(fixtures[1]?.hasAttribute("data-wiki-spot-tour")).toBe(true);

    cleanup();
  });
});
