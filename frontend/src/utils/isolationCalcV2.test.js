import { describe, expect, it } from "vitest";
import {
  buildIsolationCalcRequestFromStored,
  buildIsolationCalcRequestItem,
  calcItemsFromPublicConstructions,
  defaultCalcApiValues,
  extractCalcProducts,
  hasCalcApiOptions,
  materialOptionLabel,
  parseCalcApiSpec,
  replacementGroupForProductCode,
} from "./isolationCalcV2.js";

describe("isolationCalcV2", () => {
  it("parses live AG.L401-shaped params and composition", () => {
    const spec = parseCalcApiSpec({
      paramsBody: {
        code: 200,
        data: {
          construction_code: "AG.L401",
          params: [
            {
              code: "dframe",
              name: "Сдвоенный каркас",
              value_type: "bool",
              is_required: true,
              default_value_bool: false,
              sort_order: 0,
              options: [
                { value_bool: true, label: "Да" },
                { value_bool: false, label: "Нет" },
              ],
            },
            {
              code: "step",
              name: "Шаг стоечного профиля",
              value_type: "int",
              is_required: true,
              default_value_int: 600,
              sort_order: 1,
              options: [
                { value_int: 600, label: "600 мм" },
                { value_int: 400, label: "400 мм" },
              ],
            },
          ],
        },
      },
      detailBody: {
        code: 200,
        data: {
          composition: {
            replacement_groups: [
              {
                group: 1,
                replacement_material_type: { code: "tape", name: "лента" },
                materials: [
                  {
                    is_default: true,
                    material: { code: "1185.1101", name: "Вибростек-М100" },
                  },
                  {
                    is_default: false,
                    material: {
                      code: "1405.1101",
                      name: "Ультракустик-лента F100",
                    },
                  },
                ],
              },
            ],
            optional_materials: [
              { material: { code: "10300009", name: "Шуманет-Термо ЭКО" } },
            ],
          },
        },
      },
    });

    expect(hasCalcApiOptions(spec)).toBe(true);
    expect(spec.params.map((p) => p.code)).toEqual(["dframe", "step"]);
    const values = defaultCalcApiValues(spec);
    expect(values.paramValues.dframe.value_bool).toBe(false);
    expect(values.paramValues.step.value_int).toBe(600);
    expect(values.selectedReplacements[1]).toBe("1185.1101");
    expect(values.selectedOptionals).toEqual([]);
  });

  it("builds request without options when spec is empty", () => {
    const spec = parseCalcApiSpec({ paramsBody: { data: { params: [] } } });
    expect(hasCalcApiOptions(spec)).toBe(false);
    const item = buildIsolationCalcRequestItem({
      code: "AG.C503",
      lenX: 4000,
      lenY: 4000,
      ...defaultCalcApiValues(spec),
    });
    expect(item.params).toEqual([]);
    expect(item.selected_replacement_materials).toEqual([]);
    expect(item.selected_optional_materials).toEqual([]);
  });

  it("extracts products from by-construction response", () => {
    const products = extractCalcProducts({
      code: 200,
      data: [
        {
          index: 0,
          code: "AG.L401",
          products: [{ Code: "1088665", Name: "ГКЛА", Quantity: 4 }],
        },
      ],
    });
    expect(products).toEqual([{ Code: "1088665", Name: "ГКЛА", Quantity: 4 }]);
  });

  it("keeps add_ceil_shift at 200 when the option is off and clamps values below 200", () => {
    const spec = parseCalcApiSpec({
      paramsBody: {
        data: {
          construction_code: "AG.C503",
          params: [
            {
              code: "add_ceil_shift",
              name: "Дополнительное опускание потолка",
              value_type: "int",
              is_required: true,
              default_value_int: 200,
              options: [{ value_int: 0, label: "Отступ от потолка" }],
            },
          ],
        },
      },
    });
    expect(hasCalcApiOptions(spec)).toBe(true);
    const values = defaultCalcApiValues(spec);
    expect(values.paramValues.add_ceil_shift).toEqual({
      value_int: 200,
      enabled: false,
    });
    expect(
      buildIsolationCalcRequestItem({
        code: "AG.C503",
        paramValues: values.paramValues,
      }).params
    ).toEqual([{ code: "add_ceil_shift", value_int: 200 }]);
    expect(
      buildIsolationCalcRequestItem({
        code: "AG.C503",
        paramValues: { add_ceil_shift: { value_int: 350, enabled: true } },
      }).params
    ).toEqual([{ code: "add_ceil_shift", value_int: 350 }]);
    expect(
      buildIsolationCalcRequestItem({
        code: "AG.C503",
        paramValues: { add_ceil_shift: { value_int: 150, enabled: true } },
      }).params
    ).toEqual([{ code: "add_ceil_shift", value_int: 200 }]);
  });

  it("adds article when replacement names collide", () => {
    const siblings = [
      { code: "1088665", name: "AKU-line ГКЛА Vetonit" },
      { code: "1088663", name: "AKU-line ГКЛА Vetonit" },
    ];
    expect(materialOptionLabel(siblings[0], siblings)).toBe(
      "AKU-line ГКЛА Vetonit (1088665)"
    );
  });

  it("rebuilds calc request from stored construction and matches replaceable product rows", () => {
    const groups = [
      {
        group: 1,
        defaultCode: "1185.1101",
        materials: [
          { code: "1185.1101", name: "Вибростек-М100" },
          { code: "1405.1101", name: "Ультракустик-лента F100" },
        ],
      },
    ];
    expect(replacementGroupForProductCode(groups, "1405.1101")?.group).toBe(1);
    expect(replacementGroupForProductCode(groups, "nope")).toBe(null);

    const item = buildIsolationCalcRequestFromStored(
      {
        Code: "AG.L401",
        LenX: 4000,
        LenY: 0,
        LenZ: 2700,
        Area: 10.8,
        Perimeter: 13.4,
        Openings: [],
        params: [
          { code: "dframe", value_bool: false },
          { code: "step", value_int: 600 },
        ],
        replacementGroups: groups,
        selectedReplacements: { 1: "1185.1101" },
        selected_replacement_materials: ["1185.1101"],
        selected_optional_materials: [],
      },
      { selectedReplacements: { 1: "1405.1101" } }
    );
    expect(item.code).toBe("AG.L401");
    expect(item.selected_replacement_materials).toEqual(["1405.1101"]);
    expect(item.params).toEqual(
      expect.arrayContaining([
        { code: "dframe", value_bool: false },
        { code: "step", value_int: 600 },
      ])
    );
  });
});

describe("calcItemsFromPublicConstructions", () => {
  it("maps public catalog to calculator items and keeps sizeLimits id from ItemsBase", () => {
    const items = calcItemsFromPublicConstructions(
      [
        {
          id: 15,
          code: "AG.L401",
          name: "Облицовка на каркасе 50 мм",
          type: "cladding",
        },
        {
          id: 3,
          code: "AG.C503",
          name: "Потолок на каркасе",
          type: { code: "ceiling" },
        },
      ],
      [
        {
          id: 401,
          ag_id: "AG.L401",
          c_id: "L",
          template: 50,
          title: "legacy title",
          description: "Облицовка на каркасе 50 мм (описание)",
        },
      ]
    );

    expect(items).toEqual([
      {
        id: 15,
        size_limit_id: 401,
        title: "Облицовка на каркасе 50 мм",
        description: "Облицовка на каркасе 50 мм (описание)",
        c_id: "L",
        template: 50,
        ag_id: "AG.L401",
        weight: undefined,
        type_code: "cladding",
        construction_id: 15,
      },
      {
        id: 3,
        size_limit_id: null,
        title: "Потолок на каркасе",
        description: "Потолок на каркасе",
        c_id: "C",
        template: null,
        ag_id: "AG.C503",
        weight: undefined,
        type_code: "ceiling",
        construction_id: 3,
      },
    ]);
  });

  it("places AG.Z by ItemsBase section when API type is missing", () => {
    const items = calcItemsFromPublicConstructions(
      [{ id: 20, code: "AG.Z201", name: "ЗИПС-Вектор" }],
      [
        {
          id: 201,
          ag_id: "AG.Z201",
          c_id: "C",
          template: 4,
          description: "потолок",
        },
      ]
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      c_id: "C",
      template: 4,
      size_limit_id: 201,
    });
  });
});
