import { describe, expect, it } from "vitest";
import {
  buildEntityImageUpsertBody,
  calculationTypesForMaterialType,
  defaultCalculationTypeId,
  enrichCompositionFromMaterialsCatalog,
  IMAGE_ENTITY_CONSTR,
  IMAGE_ENTITY_MATERIAL,
  normalizeEntityImage,
  normalizeMaterialTypeCalculationEntry,
} from "./adminApi.js";

describe("material type calculation catalog", () => {
  const catalog = [
    normalizeMaterialTypeCalculationEntry({
      id: 5,
      code: "gkl",
      name: "Гипсокартон",
      calculation_types: [
        {
          id: 9,
          code: "calcRatioPerSquare",
          name: "По коэффициенту на м2",
          is_default: false,
          sort_order: 20,
        },
        {
          id: 2,
          code: "calcPanel",
          name: "Панель",
          is_default: true,
          sort_order: 10,
        },
      ],
    }),
    normalizeMaterialTypeCalculationEntry({
      id: 6,
      code: "profile",
      name: "Профиль",
      calculation_types: null,
    }),
  ];

  it("keeps an empty calculation_types array and sorts defaults first by sort_order", () => {
    expect(catalog[0].calculation_types.map((item) => item.id)).toEqual([2, 9]);
    expect(catalog[0].calculation_types[0].is_default).toBe(true);
    expect(catalog[1].calculation_types).toEqual([]);
  });

  it("returns recommendations for a known type and null when the type is unknown", () => {
    expect(calculationTypesForMaterialType(catalog, 5).map((item) => item.code)).toEqual([
      "calcPanel",
      "calcRatioPerSquare",
    ]);
    expect(calculationTypesForMaterialType(catalog, 6)).toEqual([]);
    expect(calculationTypesForMaterialType(catalog, 99)).toBeNull();
    expect(calculationTypesForMaterialType([], 5)).toBeNull();
  });

  it("picks the default calculation type id", () => {
    expect(defaultCalculationTypeId(catalog[0].calculation_types)).toBe(2);
    expect(defaultCalculationTypeId(catalog[1].calculation_types)).toBeNull();
  });

  it("copies the catalog material type onto a composition row", () => {
    const enriched = enrichCompositionFromMaterialsCatalog(
      { defaultMaterials: [{ id: 1, code: "GKL-12" }], replacementGroups: [], optionalMaterials: [] },
      [{ code: "GKL-12", name: "Лист", type: { id: 5, code: "gkl", name: "Гипсокартон" } }]
    );
    expect(enriched.defaultMaterials[0]).toMatchObject({
      type_id: 5,
      type_code: "gkl",
      name: "Лист",
    });
  });
});

describe("entity image binding", () => {
  it("requires construction_type_id only for constructions", () => {
    expect(
      buildEntityImageUpsertBody({
        entity_type: IMAGE_ENTITY_CONSTR,
        entity_id: 22,
        construction_type_id: 1,
        image_type_id: 3,
        file_name: "constr/icon/a.jpg",
      }).construction_type_id
    ).toBe(1);
    expect(
      buildEntityImageUpsertBody({
        entity_type: IMAGE_ENTITY_MATERIAL,
        entity_id: 4,
        construction_type_id: 1,
        image_type_id: 3,
        file_name: "material/photo/a.jpg",
      })
    ).not.toHaveProperty("construction_type_id");
  });

  it("keeps the mounting type on an admin image row", () => {
    expect(
      normalizeEntityImage({
        id: 74,
        entity_type: "constr",
        entity_id: 22,
        construction_type: { id: 1, code: "wall", name: "Стена" },
        type: { id: 3, code: "preview", name: "Превью" },
        url: "https://files.example.ru/constr/icon/a.jpg",
      })
    ).toMatchObject({
      construction_type_id: 1,
      construction_type: { id: 1, code: "wall", name: "Стена" },
    });
  });
});
