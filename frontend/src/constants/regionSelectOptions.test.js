import { describe, expect, it } from "vitest";
import {
  applyDerivedRegionPrices,
  catalogToRegionSelectOptions,
  scalePriceByCoefficient,
} from "./regionSelectOptions.js";

describe("catalogToRegionSelectOptions", () => {
  it("uses admin name and code", () => {
    const options = catalogToRegionSelectOptions([
      { code: "msk", name: "Москва", is_active: true },
      {
        code: "chelyabinsk",
        name: "Челябинск",
        is_active: true,
        price_coefficient: 1.05,
      },
    ]);
    expect(options).toEqual([
      { value: "msk", label: "Москва" },
      { value: "chelyabinsk", label: "Челябинск" },
    ]);
  });

  it("skips inactive and empty codes", () => {
    const options = catalogToRegionSelectOptions([
      { code: "ural", name: "Урал", is_active: false },
      { code: "", name: "Пустой" },
      { code: "kazan", name: "Казань" },
    ]);
    expect(options).toEqual([{ value: "kazan", label: "Казань" }]);
  });

  it("falls back to code when name is empty", () => {
    const options = catalogToRegionSelectOptions([
      { code: "south", name: "  ", is_active: true },
    ]);
    expect(options).toEqual([{ value: "south", label: "south" }]);
  });
});

describe("applyDerivedRegionPrices", () => {
  it("multiplies base prices by child coefficient", () => {
    const rows = applyDerivedRegionPrices(
      [
        {
          article: "1",
          pricePerM2: 100,
          pricePerUnit: 50,
          regionalPrices: { ural: { pricePerM2: 100, pricePerUnit: 50 } },
        },
      ],
      { regionCode: "chelyabinsk", coefficient: 1.05 }
    );
    expect(rows[0].pricePerM2).toBe(105);
    expect(rows[0].pricePerUnit).toBe(52.5);
    expect(rows[0].regionalPrices).toEqual({
      chelyabinsk: { pricePerM2: 105, pricePerUnit: 52.5 },
    });
  });

  it("keeps prices when coefficient is 1", () => {
    expect(scalePriceByCoefficient(80, 1)).toBe(80);
  });
});
