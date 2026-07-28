import { describe, expect, it } from "vitest";
import {
  itemsBaseTableName,
  resolveConstructionTableTitle,
  resolveItemsDisplayMeta,
  syncConstructionsTitlesFromItems,
} from "./itemsCatalog.js";

describe("itemsCatalog", () => {
  it("uses ItemsBase.description as table name for AG.W101", () => {
    const meta = resolveItemsDisplayMeta({
      calcCode: "AG.W101",
      cipher: "AG.W101",
      sectionId: "W",
      catalogId: 101,
    });
    expect(meta.title).toBe("Перегородка на каркасе 50 мм");
    expect(meta.description).toBe("Перегородка на одинарном каркасе 50 мм");
    expect(itemsBaseTableName(meta)).toBe(
      "Перегородка на одинарном каркасе 50 мм",
    );
  });

  it("resolves table name from description at render time", () => {
    const title = resolveConstructionTableTitle(
      {
        ag_id: "AG.W101",
        section_id: "W",
        type: "ПЕРЕГОРОДКА",
        title: "устаревшее из API",
      },
      { Code: "AG.W101", SectionId: "W" },
    );
    expect(title).toBe("Перегородка на одинарном каркасе 50 мм");
  });

  it("syncs stale session titles from ItemsBase.description", () => {
    const [synced] = syncConstructionsTitlesFromItems(
      [
        {
          key_id: 1,
          ag_id: "AG.W101",
          section_id: "W",
          title: "устаревшее из API",
          description: "",
          type: "ПЕРЕГОРОДКА",
        },
      ],
      [{ Code: "AG.W101", SectionId: "W" }],
    );
    expect(synced.title).toBe("Перегородка на одинарном каркасе 50 мм");
    expect(synced.short_title).toBe("Перегородка на каркасе 50 мм");
  });

  it("resolves ZIPS ceiling description from ItemsBase by catalog_id", () => {
    const title = resolveConstructionTableTitle(
      { catalog_id: 201, ag_id: "AG.Z201", section_id: "C", type: "ПОТОЛОК" },
      { Code: "AG.Z201", SectionId: "C" },
    );
    expect(title).toBe(
      "Звукоизолирующая система ЗИПС-Вектор, смонтированная на потолке",
    );
  });

  it("resolves AG.C501_ul without collapsing to AG.C501", () => {
    const meta = resolveItemsDisplayMeta({
      calcCode: "AG.C501_ul",
      cipher: "AG.C501_ul",
      sectionId: "C",
    });
    expect(meta.ag_id).toBe("AG.C501_ul");
    expect(meta.title).toBe("Потолок на креплениях Ультракустик");
  });

  it("resolves AG.L404_ul without collapsing to AG.L404", () => {
    const meta = resolveItemsDisplayMeta({
      calcCode: "AG.L404_ul_ul_tape",
      sectionId: "L",
    });
    expect(meta.ag_id).toBe("AG.L404_ul");
    expect(meta.title).toBe("Облицовка с применением Ультракустик");
  });
});
