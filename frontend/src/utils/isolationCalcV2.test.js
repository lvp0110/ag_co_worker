import { describe, expect, it } from "vitest";
import {
  buildIsolationCalcRequestFromStored,
  buildIsolationCalcRequestItem,
  calcItemsFromPublicConstructions,
  mapPublicConstructionToInfoRecord,
  materialsFromPublicComposition,
  defaultCalcApiValues,
  extractCalcProducts,
  hasCalcApiOptions,
  materialOptionLabel,
  normalizeCalcProduct,
  parseCalcApiSpec,
  pickEntityImageUrl,
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
    expect(spec.sizeLimits).toEqual([]);
    const values = defaultCalcApiValues(spec);
    expect(values.paramValues.dframe.value_bool).toBe(false);
    expect(values.paramValues.step.value_int).toBe(600);
    expect(values.selectedReplacements[1]).toBe("1185.1101");
    expect(values.selectedOptionals).toEqual([]);
  });

  it("does not treat replacement groups as form options", () => {
    const spec = parseCalcApiSpec({
      detailBody: {
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
          },
        },
      },
    });
    expect(spec.replacementGroups).toHaveLength(1);
    expect(hasCalcApiOptions(spec)).toBe(false);
  });

  it("parses size_limits and nested warning blocks from calculation-params", () => {
    const spec = parseCalcApiSpec({
      paramsBody: {
        data: {
          construction_code: "AG.L401",
          params: [
            {
              id: 15,
              code: "step",
              name: "Шаг",
              value_type: "int",
              default_value_int: 600,
              options: [{ value_int: 600, label: "600 мм" }],
            },
          ],
          size_limits: [
            {
              dimension: "len_x",
              mode: "common",
              min_value: 100,
              max_value: 50000,
              sort_order: 1,
              warning_text_min: "Минимальная ШИРИНА конструкции 100 мм",
              warning_text_max: "В конструкциях шире 15 м нужны швы",
              warning: {
                title: "Введите правильную ширину",
              },
            },
            {
              dimension: "len_z",
              mode: "parametric",
              max_value: 3000,
              sort_order: 2,
              warning_text_max: "Максимальная ВЫСОТА указана в меню шага профиля",
              conditions: [
                { construction_system_param_id: 15, value_int: 600 },
              ],
            },
          ],
          warnings: [
            {
              id: "warn-z",
              name: "Введите правильную высоту",
              payload: {
                text: "Максимальная ВЫСОТА указана в меню шага профиля",
              },
            },
          ],
        },
      },
    });

    expect(spec.sizeLimits).toHaveLength(2);
    expect(spec.sizeLimits[0]).toMatchObject({
      dimension: "len_x",
      mode: "common",
      min_value: 100,
      max_value: 50000,
      warning_text_min: "Минимальная ШИРИНА конструкции 100 мм",
      warning_text_max: "В конструкциях шире 15 м нужны швы",
      warning: {
        title: "Введите правильную ширину",
        message_min: "Минимальная ШИРИНА конструкции 100 мм",
        message_max: "В конструкциях шире 15 м нужны швы",
      },
    });
    expect(spec.sizeLimits[1]).toMatchObject({
      dimension: "len_z",
      mode: "parametric",
      max_value: 3000,
      warning_text_max: "Максимальная ВЫСОТА указана в меню шага профиля",
      conditions: [{ construction_system_param_id: 15, value_int: 600 }],
      warning: {
        message_max: "Максимальная ВЫСОТА указана в меню шага профиля",
      },
    });
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

  it("extracts priced products from by-construction/{region} response", () => {
    const products = extractCalcProducts({
      code: 200,
      data: {
        region: { id: 1, code: "msk", name: "Москва" },
        total_price: 1200,
        currency_code: "RUB",
        items: [
          {
            index: 0,
            code: "AG.L401",
            products: [
              {
                code: "1088665",
                name: "ГКЛА",
                quantity: 4,
                units: "шт",
                has_price: true,
                unit_price: 300,
                unit_m2_price: 0,
                total_price: 1200,
              },
            ],
          },
        ],
      },
    });
    expect(products).toEqual([
      {
        Code: "1088665",
        Name: "ГКЛА",
        Quantity: 4,
        Units: "шт",
        KpPricePerUnit: 300,
      },
    ]);
  });

  it("maps snake_case priced product onto calculator material fields", () => {
    expect(
      normalizeCalcProduct({
        code: "1185.1101",
        name: "Вибростек",
        quantity: 2,
        units: "м.п.",
        has_price: true,
        unit_price: 85.5,
        unit_m2_price: 12.3,
      })
    ).toEqual({
      Code: "1185.1101",
      Name: "Вибростек",
      Quantity: 2,
      Units: "м.п.",
      KpPricePerM2: 12.3,
      KpPricePerUnit: 85.5,
    });
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
        description: "Облицовка на каркасе 50 мм",
        c_id: "L",
        template: 50,
        ag_id: "AG.L401",
        weight: undefined,
        type_code: "cladding",
        construction_id: 15,
        imageUrl: "",
        cadImageUrl: "",
        images: [],
        thickness: null,
        soundIndex: null,
        impactNoiseIndex: null,
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
        imageUrl: "",
        cadImageUrl: "",
        images: [],
        thickness: null,
        soundIndex: null,
        impactNoiseIndex: null,
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

  it("keeps primary image url from images[]", () => {
    const items = calcItemsFromPublicConstructions(
      [
        {
          id: 15,
          code: "AG.L404",
          name: "AG.L404",
          type: "cladding",
          images: [
            {
              url: "https://example.com/api/v2/public/image/a.jpg",
              sort_order: 20,
              is_primary: false,
            },
            {
              url: "https://example.com/api/v2/public/image/b.jpg",
              sort_order: 10,
              is_primary: true,
            },
          ],
        },
      ],
      []
    );
    expect(items[0].imageUrl).toBe("/api/v2/public/image/b.jpg");
    expect(items[0].images).toHaveLength(2);
  });
});

describe("pickEntityImageUrl", () => {
  it("prefers is_primary, then sort_order", () => {
    expect(pickEntityImageUrl([])).toBe("");
    expect(
      pickEntityImageUrl([
        { url: "/api/v2/public/image/second.jpg", sort_order: 20, is_primary: false },
        { url: "/api/v2/public/image/first.jpg", sort_order: 10, is_primary: false },
        { url: "/api/v2/public/image/primary.jpg", sort_order: 50, is_primary: true },
      ])
    ).toBe("/api/v2/public/image/primary.jpg");
    expect(
      pickEntityImageUrl([
        {
          file_name: "b.jpg",
          url: "https://example.com/api/v2/public/image/b.jpg",
          sort_order: 20,
        },
        {
          file_name: "a.jpg",
          url: "https://example.com/api/v2/public/image/a.jpg",
          sort_order: 10,
        },
      ])
    ).toBe("/api/v2/public/image/a.jpg");
  });

  it("separates preview and cad by image type", () => {
    const images = [
      {
        url: "/api/v2/public/image/preview.jpg",
        sort_order: 20,
        is_primary: true,
        type: { code: "preview" },
      },
      {
        url: "/api/v2/public/image/cad.png",
        sort_order: 10,
        type: { code: "cad", name: "Чертёж" },
      },
    ];
    expect(pickEntityImageUrl(images)).toBe("/api/v2/public/image/preview.jpg");
    expect(pickEntityImageUrl(images, { cad: true })).toBe(
      "/api/v2/public/image/cad.png"
    );
  });
});

describe("mapPublicConstructionToInfoRecord", () => {
  it("maps admin/public detail to info-page fields", () => {
    const record = mapPublicConstructionToInfoRecord({
      construction: {
        code: "AG.L401",
        name: "Облицовка на каркасе 50 мм",
        physical_params: { Thickness: 70, SoundIndex: 65 },
        images: [
          {
            url: "/api/v2/public/image/photo.jpg",
            is_primary: true,
            type: { code: "preview" },
          },
          { url: "/api/v2/public/image/cad.png", type: { code: "cad" } },
        ],
      },
      composition: {
        default_materials: [
          { material: { code: "1111", name: "Профиль" }, is_default: true },
        ],
      },
      text_sections: [{ code: "specification", text: "Описание из админки" }],
    });
    expect(record).toMatchObject({
      Code: "AG.L401",
      Description: "Облицовка на каркасе 50 мм",
      Img: "/api/v2/public/image/photo.jpg",
      CadImg: "/api/v2/public/image/cad.png",
      Thickness: 70,
      SoundIndex: 65,
      Specification: "Описание из админки",
    });
    expect(materialsFromPublicComposition(record.composition)).toEqual([
      { code: "1111", name: "Профиль", Code: "1111", Name: "Профиль" },
    ]);
  });
});
