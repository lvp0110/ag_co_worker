import { describe, expect, it } from "vitest";
import {
  filterMaterialsByUsage,
  filterMaterialsWithTextualCode,
  isTextualMaterialCode,
} from "./adminApi.js";

describe("isTextualMaterialCode / filterMaterialsWithTextualCode", () => {
  const rows = [
    { code: "AG_mn35_tape", usage: "si", name: "tape" },
    { code: "MN35-BASE", usage: "ac", name: "base" },
    { code: "123456", usage: "si", name: "numeric" },
    { code: "10.20", usage: "vi", name: "dots" },
    { code: "si_ul_tape", usage: "si", name: "ul" },
  ];

  it("detects letter-containing codes as textual", () => {
    expect(isTextualMaterialCode(rows[0])).toBe(true);
    expect(isTextualMaterialCode(rows[1])).toBe(true);
    expect(isTextualMaterialCode(rows[2])).toBe(false);
    expect(isTextualMaterialCode(rows[3])).toBe(false);
    expect(isTextualMaterialCode(rows[4])).toBe(true);
  });

  it("filters extras catalog by textual codes", () => {
    expect(filterMaterialsWithTextualCode(rows).map((r) => r.code)).toEqual([
      "AG_mn35_tape",
      "MN35-BASE",
      "si_ul_tape",
    ]);
  });

  it("usage tabs exclude textual codes", () => {
    const si = filterMaterialsByUsage(rows, "si").filter(
      (row) => !isTextualMaterialCode(row)
    );
    expect(si.map((r) => r.code)).toEqual(["123456"]);
  });
});
