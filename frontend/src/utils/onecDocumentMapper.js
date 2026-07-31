/**
 * calc_params калькулятора → `models.Construction` для
 * POST /integration/onec/isolation/document (тот же маппинг, что backend onecIntegration).
 */

const asRecord = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const pick = (source, ...keys) => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
};

const toInt = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const mapOpening = (raw) => {
  const opening = asRecord(raw);
  const lenX = toInt(pick(opening, "lenX", "LenX"));
  const lenZ = toInt(pick(opening, "lenZ", "LenZ"));
  const area = pick(opening, "Area", "area");
  return {
    Area: area !== undefined ? toInt(area) : lenX * lenZ,
    Type: String(pick(opening, "Type", "type") ?? ""),
    lenX,
    lenZ,
  };
};

export const mapCalcParamsToOnecConstruction = (calcParams) => {
  const params = asRecord(calcParams);
  const openings = pick(params, "Openings", "openings");
  return {
    addCeilShift: toInt(pick(params, "AddCeilShift", "addCeilShift")),
    area: toInt(pick(params, "Area", "area")),
    code: String(pick(params, "Code", "code") ?? ""),
    dframe: Boolean(pick(params, "dframe", "dFrame", "Dframe")),
    lenX: toInt(pick(params, "LenX", "lenX")),
    lenY: toInt(pick(params, "LenY", "lenY")),
    lenZ: toInt(pick(params, "LenZ", "lenZ")),
    openings: Array.isArray(openings) ? openings.map(mapOpening) : [],
    perimeter: toInt(pick(params, "Perimeter", "perimeter")),
    step: toInt(pick(params, "step", "Step")),
  };
};

/** [{ calc_params }] → body для POST /integration/onec/isolation/document */
export const buildOnecDocumentBody = (constructions) => ({
  constructions: (Array.isArray(constructions) ? constructions : []).map((c) =>
    mapCalcParamsToOnecConstruction(c?.calc_params || c)
  ),
});
