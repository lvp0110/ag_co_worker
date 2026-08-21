import { describe, expect, it } from "vitest";
import {
  buildSizeLimitUpsertBody,
  isUuid,
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
      warning_content_id: "11111111-1111-1111-1111-111111111111",
      conditions: [
        {
          construction_system_param_id: 15,
          code: "step",
          value_int: 600,
        },
      ],
    });
  });

  it("builds common upsert without conditions and empty min as null", () => {
    expect(
      buildSizeLimitUpsertBody({
        dimension: "len_x",
        mode: "common",
        min_value: "",
        max_value: 50000,
        warning_content_id: "11111111-1111-1111-1111-111111111111",
        sort_order: 0,
        conditions: [{ construction_system_param_id: 15, value_int: 600 }],
      })
    ).toEqual({
      dimension: "len_x",
      mode: "common",
      min_value: null,
      max_value: 50000,
      warning_content_id: "11111111-1111-1111-1111-111111111111",
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
        warning_content_id: "11111111-1111-1111-1111-111111111111",
        conditions: [{ construction_system_param_id: 15, value_int: 600 }],
      })
    ).toMatchObject({
      mode: "parametric",
      conditions: [{ construction_system_param_id: 15, value_int: 600 }],
    });
  });

  it("accepts uuid warning ids", () => {
    expect(isUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
