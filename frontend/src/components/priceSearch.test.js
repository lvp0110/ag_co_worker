import { describe, expect, it } from "vitest";
import { filterPriceRows, matchesPriceSearch } from "./priceSearch";

const rows = [
  { article: "02.003.001.00", name: "Sylomer SR 11" },
  { article: "20612", name: "Sylomer SR 42, розовый" },
  { article: "20613", name: "Sylomer SR 11 extra" },
];

describe("matchesPriceSearch", () => {
  it("finds exact article matches", () => {
    expect(matchesPriceSearch(rows[1], "20612")).toBe(true);
  });

  it("finds article regardless of separators", () => {
    expect(matchesPriceSearch(rows[0], "0200300100")).toBe(true);
  });

  it("finds exact name matches", () => {
    expect(matchesPriceSearch(rows[0], "sylomer sr 11")).toBe(true);
  });

  it("does not search article query in name", () => {
    expect(matchesPriceSearch(rows[0], "20612")).toBe(false);
  });

  it("finds text query by normalized name", () => {
    expect(matchesPriceSearch(rows[0], "sylomer-sr-11")).toBe(true);
  });

  it("returns false for unrelated query", () => {
    expect(matchesPriceSearch(rows[1], "non-existing")).toBe(false);
  });
});

describe("filterPriceRows", () => {
  it("returns only exact article row when exact match exists", () => {
    const result = filterPriceRows(rows, "20612");
    expect(result).toHaveLength(1);
    expect(result[0].article).toBe("20612");
  });

  it("returns only exact name row when exact match exists", () => {
    const result = filterPriceRows(rows, "sylomer sr 11");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sylomer SR 11");
  });

  it("falls back to name search for numeric query when article is not found", () => {
    const result = filterPriceRows(rows, "11");
    expect(result).toHaveLength(2);
    expect(result.map((row) => row.article)).toEqual(["02.003.001.00", "20613"]);
  });
});
