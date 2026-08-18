import { describe, expect, it } from "vitest";
import { sectionsFromConstructionTypes, sectionIdFromTypeCode } from "./constructionSection.js";

describe("sectionsFromConstructionTypes", () => {
  it("maps API types to calculator sections with titles from the API", () => {
    const sections = sectionsFromConstructionTypes([
      { id: 2, code: "cladding", name: "облицовка" },
      { id: 3, code: "ceiling", name: "облицовка потолка" },
      { id: 1, code: "partition", name: "перегородка" },
      { id: 4, code: "floor", name: "покрытие пола" },
    ]);

    expect(sections.map((s) => s.id)).toEqual(["F", "C", "L", "W"]);
    expect(sections.map((s) => s.title)).toEqual([
      "Покрытие пола",
      "Облицовка потолка",
      "Облицовка",
      "Перегородка",
    ]);
    expect(sections[0].typeCode).toBe("floor");
    expect(sections[0].icon).toBe("icon_floor_white.svg");
  });

  it("skips unknown type codes and empty input", () => {
    expect(sectionsFromConstructionTypes(null)).toEqual([]);
    expect(
      sectionsFromConstructionTypes([{ id: 9, code: "other", name: "прочее" }])
    ).toEqual([]);
  });

  it("maps type codes to calculator section ids", () => {
    expect(sectionIdFromTypeCode("floor")).toBe("F");
    expect(sectionIdFromTypeCode("CEILING")).toBe("C");
    expect(sectionIdFromTypeCode("cladding")).toBe("L");
    expect(sectionIdFromTypeCode("partition")).toBe("W");
    expect(sectionIdFromTypeCode("other")).toBe(null);
  });
});
