import { describe, expect, it } from "vitest";
import { parseCalcApiSpec } from "./isolationCalcV2";
import {
  getMaxLenZFromSizeLimits,
  hasApiSizeLimits,
  validateConstructionSizeLimits,
} from "./validation";

const specFromLimits = (size_limits, params = []) =>
  parseCalcApiSpec({
    paramsBody: {
      data: { params, size_limits },
    },
  });

describe("validateConstructionSizeLimits", () => {
  it("returns null when size_limits are empty (absolute-bounds fallback)", () => {
    expect(
      validateConstructionSizeLimits({ lenX: 10 }, [], { step: { value_int: 600 } })
    ).toBeNull();
    expect(hasApiSizeLimits([])).toBe(false);
  });

  it("blocks width below min and uses warning html", () => {
    const { sizeLimits, params } = specFromLimits(
      [
        {
          dimension: "len_x",
          mode: "common",
          min_value: 100,
          warning: { title: "Ширина", text: "минимум 100 мм" },
        },
      ],
      [{ code: "step", value_type: "int", default_value_int: 600 }]
    );
    const html = validateConstructionSizeLimits(
      { lenX: 50, lenZ: 2000 },
      sizeLimits,
      { step: { value_int: 600 } },
      params
    );
    expect(html).toContain("Ширина");
    expect(html).toContain("минимум 100 мм");
  });

  it("applies parametric max height only for matching step", () => {
    const { sizeLimits, params } = specFromLimits(
      [
        {
          dimension: "len_z",
          mode: "parametric",
          max_value: 3000,
          warning: { title: "Высота", text: "макс 3 м при шаге 600" },
          conditions: [{ code: "step", value_int: 600 }],
        },
      ],
      [
        {
          id: 15,
          code: "step",
          value_type: "int",
          default_value_int: 600,
        },
      ]
    );

    expect(
      validateConstructionSizeLimits(
        { lenX: 1000, lenZ: 3500 },
        sizeLimits,
        { step: { value_int: 400 } },
        params
      )
    ).toBeNull();

    const html = validateConstructionSizeLimits(
      { lenX: 1000, lenZ: 3500 },
      sizeLimits,
      { step: { value_int: 600 } },
      params
    );
    expect(html).toContain("макс 3 м при шаге 600");
  });

  it("maps len_z limit to lenY when height is not used", () => {
    const { sizeLimits } = specFromLimits([
      {
        dimension: "len_z",
        mode: "common",
        max_value: 18000,
        warning: { title: "Внимание!", text: "не более 18 м" },
      },
    ]);
    expect(
      validateConstructionSizeLimits(
        { lenX: 1000, lenY: 20000 },
        sizeLimits,
        {}
      )
    ).toContain("не более 18 м");
  });

  it("returns max height in meters for a profile step", () => {
    const { sizeLimits, params } = specFromLimits(
      [
        {
          dimension: "len_z",
          mode: "parametric",
          max_value: 4200,
          conditions: [{ value_int: 600 }],
        },
      ],
      [{ code: "step", value_type: "int", default_value_int: 600 }]
    );
    expect(getMaxLenZFromSizeLimits(sizeLimits, 600, params)).toBe("4.2");
    expect(getMaxLenZFromSizeLimits(sizeLimits, 400, params)).toBeNull();
  });
});
