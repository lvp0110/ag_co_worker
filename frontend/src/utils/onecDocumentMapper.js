/**
 * calc_params калькулятора → `models.Construction` для
 * POST /integration/onec/isolation/document (тот же маппинг, что backend onecIntegration).
 * Обратно: OneCDocumentConstruction (snake_case из GET detail) → calc_params + UI-ряд.
 */

import {
  getItemsAgIdKeyMap,
  itemsBaseTableName,
  resolveItemsDisplayMeta,
} from "./itemsCatalog.js";
import { resolveDisplayCipher } from "./calculations.js";
import {
  sectionIdFromCode,
  sectionLabelFromSectionId,
} from "./constructionSection.js";

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

/**
 * OneCDocumentConstruction (GET detail) → calc_params + строка ConstrToCalc.
 * @param {object} raw
 * @param {number} index
 */
export const mapOnecDocumentConstructionToCalc = (raw, index = 0) => {
  const row = asRecord(raw);
  const code = String(pick(row, "code", "Code") ?? "").trim();
  const lenX = toInt(pick(row, "len_x", "lenX", "LenX"));
  const lenY = toInt(pick(row, "len_y", "lenY", "LenY"));
  const lenZ = toInt(pick(row, "len_z", "lenZ", "LenZ"));
  const area = toInt(pick(row, "area", "Area"));
  const perimeter = toInt(pick(row, "perimeter", "Perimeter"));
  const step = toInt(pick(row, "step", "Step"));
  const addCeilShift = toInt(
    pick(row, "add_ceil_shift", "addCeilShift", "AddCeilShift")
  );
  const dframe = Boolean(pick(row, "d_frame", "dframe", "dFrame", "Dframe"));
  const openingsRaw = pick(row, "openings", "Openings");
  const openings = Array.isArray(openingsRaw)
    ? openingsRaw.map(mapOpening)
    : [];

  const sectionId = sectionIdFromCode(code) || "";
  const agId = resolveDisplayCipher(code, getItemsAgIdKeyMap()) || code;
  const meta = resolveItemsDisplayMeta({
    calcCode: code,
    cipher: agId,
    sectionId,
  });
  const shortTitle = meta.title || code;
  const displayDescription = meta.description || shortTitle;
  const displayTitle =
    itemsBaseTableName({
      title: shortTitle,
      description: displayDescription,
    }) || code;
  const sectionLabel = sectionLabelFromSectionId(sectionId);

  const key_id = Date.now() + index;
  const params = [];
  if (step) params.push({ code: "step", value_int: step });
  params.push({ code: "dframe", value_bool: dframe });
  if (addCeilShift)
    params.push({ code: "add_ceil_shift", value_int: addCeilShift });

  const calc_params = {
    Code: code,
    LenX: lenX,
    LenY: lenY,
    LenZ: lenZ,
    AddCeilShift: addCeilShift,
    step,
    dframe,
    Area: area,
    Perimeter: perimeter,
    Openings: openings,
    SectionId: sectionId,
    SectionType: sectionLabel,
    params,
    selected_replacement_materials: [],
    selected_optional_materials: [],
    replacementGroups: [],
    selectedReplacements: {},
    DisplayTitle: displayTitle,
    DisplayDescription: displayDescription,
  };

  const ui = {
    key_id,
    title: displayTitle,
    short_title: shortTitle,
    description: displayDescription,
    catalog_id: meta.catalogId ?? null,
    section_id: sectionId,
    ag_id: agId,
    type: sectionLabel,
    lenX,
    lenY,
    lenZ,
  };

  return { calc_params, ui };
};

/** data.constructions из GET documents/{id} → массивы для loadKpEditState */
export const mapOnecDetailToCalcState = (detail) => {
  const list = Array.isArray(detail?.constructions) ? detail.constructions : [];
  const sorted = [...list].sort(
    (a, b) => toInt(a?.sort_order) - toInt(b?.sort_order)
  );
  const constrToCalc = [];
  const constrToCalcToSent = [];
  sorted.forEach((row, index) => {
    const { calc_params, ui } = mapOnecDocumentConstructionToCalc(row, index);
    constrToCalc.push(ui);
    constrToCalcToSent.push(calc_params);
  });
  return { constrToCalc, constrToCalcToSent };
};
