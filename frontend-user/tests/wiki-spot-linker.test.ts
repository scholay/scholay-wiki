/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  collectFixtureSpots,
  labelVariants,
  linkTermsInProse,
} from "../src/features/wiki/embeds/wiki-spot-linker";

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
    expect(spots.map((s) => s.label).sort()).toEqual(
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
    expect(filterMark?.getAttribute("data-wiki-term-id")).toBe("spot-筛选器");
  });
});
