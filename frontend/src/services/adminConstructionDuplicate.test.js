import { describe, expect, it } from "vitest";
import {
  calculationParamCopyPayload,
  collectCompositionCopyRows,
  compositionMaterialCopyPayload,
  mapCalculationParamConfigIds,
  nextConstructionCopyCode,
  optionalMaterialCopyPayload,
  sizeLimitCopyPayload,
} from "./adminApi.js";

describe("construction duplicate payloads", () => {
  it("appends an underscore and keeps appending while the code is taken", () => {
    expect(nextConstructionCopyCode("AG.W101", [])).toBe("AG.W101_");
    expect(nextConstructionCopyCode("AG.W101", ["AG.W101_"])).toBe("AG.W101__");
    expect(nextConstructionCopyCode("  AG.W101  ", ["AG.W101_", "AG.W101__"])).toBe(
      "AG.W101___"
    );
  });

  it("copies each composition row once, including group-only alternatives", () => {
    const rows = collectCompositionCopyRows({
      defaultMaterials: [
        { id: 1, material_id: 10, code: "A", is_default: true },
        {
          id: 2,
          material_id: 11,
          code: "B",
          is_default: true,
          replacement_group: 1,
        },
      ],
      replacementGroups: [
        {
          group: 1,
          materials: [
            { id: 2, material_id: 11, code: "B", is_default: true, replacement_group: 1 },
            { id: 3, material_id: 12, code: "C", is_default: false, replacement_group: 1 },
          ],
        },
      ],
    });
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it("keeps replacement flags and calculation type on a copied material", () => {
    expect(
      compositionMaterialCopyPayload({
        material_id: 12,
        weight: 2,
        sort_order: 4,
        is_default: false,
        replacement_group: 3,
        replacement_material_type_id: 9,
        calculation_type_id: 5,
        calculation_note: "на откос",
      })
    ).toEqual({
      id: 12,
      weight: 2,
      sort_order: 4,
      is_default: false,
      replacement_group: 3,
      replacement_material_type_id: 9,
      calculation_type_id: 5,
      calculation_note: "на откос",
    });
  });

  it("sends a plain default without a replacement group", () => {
    expect(
      compositionMaterialCopyPayload({
        material: { id: 7 },
        weight: 0,
        is_default: true,
      })
    ).toMatchObject({
      id: 7,
      weight: 1,
      is_default: true,
      replacement_group: null,
      replacement_material_type_id: null,
    });
  });

  it("copies an optional material by material id", () => {
    expect(
      optionalMaterialCopyPayload({
        material_id: 4,
        weight: 1.5,
        sort_order: 2,
        calculation_note: "",
      })
    ).toEqual({
      id: 4,
      weight: 1.5,
      sort_order: 2,
      calculation_type_id: null,
      calculation_note: "",
    });
  });

  it("copies calculation param options", () => {
    expect(
      calculationParamCopyPayload({
        param_id: 3,
        value_type: "int",
        is_required: true,
        sort_order: 1,
        default_value_int: 600,
        options: [{ label: "600 мм", value_int: 600, sort_order: 0 }],
      })
    ).toEqual({
      param_id: 3,
      value_type: "int",
      is_required: true,
      sort_order: 1,
      default_value_int: 600,
      options: [{ label: "600 мм", value_int: 600, sort_order: 0 }],
    });
  });

  it("remaps size-limit conditions onto the copied param config", () => {
    const map = mapCalculationParamConfigIds(
      [{ id: 15, param_id: 3 }],
      [{ id: 40, param_id: 3 }]
    );
    expect(map.get(15)).toBe(40);
    expect(
      sizeLimitCopyPayload(
        {
          dimension: "len_z",
          mode: "parametric",
          min_value: null,
          max_value: 4200,
          sort_order: 0,
          warning_text_min: "низ",
          warning_text_max: "верх",
          conditions: [{ construction_system_param_id: 15, value_int: 600 }],
        },
        map
      )
    ).toMatchObject({
      dimension: "len_z",
      mode: "parametric",
      max_value: 4200,
      min_warning_text: "низ",
      max_warning_text: "верх",
      conditions: [{ construction_system_param_id: 40, value_int: 600 }],
    });
  });

  it("skips a parametric limit when its param was not copied", () => {
    expect(
      sizeLimitCopyPayload(
        {
          dimension: "len_z",
          mode: "parametric",
          conditions: [{ construction_system_param_id: 15, value_int: 600 }],
        },
        new Map()
      )
    ).toBeNull();
  });
});
