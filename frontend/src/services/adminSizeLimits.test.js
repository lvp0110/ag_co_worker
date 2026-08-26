import { describe, expect, it } from "vitest";
import {
  buildCalculationParamAttachPayload,
  buildSizeLimitUpsertBody,
  normalizeAdminSizeLimit,
} from "./adminApi.js";

describe("admin size limits", () => {
  it("normalizes nested warning_content and step condition", () => {
    const row = normalizeAdminSizeLimit({
      id: 3,
      construction_system_id: 12,
      dimension: "len_z",
      mode: "parametric",
      min_value: 0,
      max_value: 4200,
      sort_order: 1,
      warning_content: {
        id: "11111111-1111-1111-1111-111111111111",
        code: "W_LENZ_MAX",
        name: "Введите правильную высоту",
        text: "Максимум зависит от шага",
      },
      conditions: [
        {
          construction_system_param_id: 15,
          value_int: 600,
          param: { code: "step" },
        },
      ],
    });

    expect(row).toMatchObject({
      id: 3,
      dimension: "len_z",
      mode: "parametric",
      min_value: null,
      max_value: 4200,
      warning_text_min: "Максимум зависит от шага",
      warning_text_max: "Максимум зависит от шага",
      conditions: [
        {
          construction_system_param_id: 15,
          code: "step",
          value_int: 600,
        },
      ],
    });
  });

  it("normalizes warning_text_min and warning_text_max from API", () => {
    const row = normalizeAdminSizeLimit({
      id: 1,
      dimension: "len_x",
      mode: "common",
      min_value: 100,
      max_value: 50000,
      warning_text_min: "Минимальная ширина 100 мм",
      warning_text_max: "В конструкциях шире 15 м нужны деформационные швы",
    });
    expect(row.warning_text_min).toBe("Минимальная ширина 100 мм");
    expect(row.warning_text_max).toBe(
      "В конструкциях шире 15 м нужны деформационные швы"
    );
  });

  it("builds common upsert with warning_text_min and warning_text_max", () => {
    expect(
      buildSizeLimitUpsertBody({
        dimension: "len_x",
        mode: "common",
        min_value: 100,
        max_value: 50000,
        warning_text_min: "Минимум",
        warning_text_max: "Превышена допустимая ширина",
        sort_order: 0,
        conditions: [{ construction_system_param_id: 15, value_int: 600 }],
      })
    ).toEqual({
      dimension: "len_x",
      mode: "common",
      min_value: 100,
      max_value: 50000,
      warning_text_min: "Минимум",
      warning_text_max: "Превышена допустимая ширина",
      sort_order: 0,
      conditions: [],
    });
  });

  it("keeps parametric step condition on upsert", () => {
    expect(
      buildSizeLimitUpsertBody({
        dimension: "len_z",
        mode: "parametric",
        min_value: 100,
        max_value: 4200,
        warning_text_min: "Мин высота",
        warning_text_max: "Превышена допустимая высота для шага 600 мм",
        conditions: [{ construction_system_param_id: 42, value_int: 600 }],
      })
    ).toMatchObject({
      mode: "parametric",
      warning_text_min: "Мин высота",
      warning_text_max: "Превышена допустимая высота для шага 600 мм",
      conditions: [{ construction_system_param_id: 42, value_int: 600 }],
    });
  });

  it("uses calculation-param config id, not catalog param_id", () => {
    // construction_system_param_id = row.id из GET .../calculation-params
    expect(
      buildSizeLimitUpsertBody({
        dimension: "len_z",
        mode: "parametric",
        max_value: 4200,
        warning_text_max: "макс",
        conditions: [
          {
            // catalog param_id=15, config id=42 — в body должен уйти 42
            construction_system_param_id: 42,
            value_int: 600,
          },
        ],
      }).conditions[0].construction_system_param_id
    ).toBe(42);
  });
});

describe("calculation param attach payload", () => {
  it("builds step options 600/400/300 for POST calculation-params", () => {
    expect(
      buildCalculationParamAttachPayload(
        { id: 15, code: "step", value_type: "int", name: "Шаг" },
        0
      )
    ).toEqual({
      param_id: 15,
      value_type: "int",
      is_required: true,
      sort_order: 0,
      default_value_int: 600,
      options: [
        { label: "600 мм", value_int: 600, sort_order: 0 },
        { label: "400 мм", value_int: 400, sort_order: 1 },
        { label: "300 мм", value_int: 300, sort_order: 2 },
      ],
    });
  });

  it("builds bool options for dframe", () => {
    expect(
      buildCalculationParamAttachPayload({
        id: 3,
        code: "dframe",
        value_type: "bool",
      })
    ).toMatchObject({
      param_id: 3,
      value_type: "bool",
      default_value_bool: false,
      options: [
        { label: "Да", value_bool: true },
        { label: "Нет", value_bool: false },
      ],
    });
  });
});
