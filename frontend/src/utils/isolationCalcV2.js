import {
  sectionIdFromCode,
  sectionIdFromTypeCode,
} from "./constructionSection.js";

export const SOUND_CONSTRUCTION_CATEGORY = "sound";

export const unwrapApiData = (body) => {
  if (body == null) return null;
  if (typeof body === "object" && !Array.isArray(body) && "data" in body) {
    return body.data;
  }
  return body;
};

export const normalizeCalcParam = (row) => {
  if (!row || typeof row !== "object") return null;
  const code = String(row.code ?? "").trim();
  if (!code) return null;
  const valueType = String(row.value_type || "int").trim() || "int";
  const options = Array.isArray(row.options) ? row.options : [];
  const id = Number(row.id ?? row.param_id);
  return {
    id: Number.isFinite(id) && id > 0 ? id : null,
    code,
    name: String(row.name || code).trim(),
    description: String(row.description || "").trim(),
    value_type: valueType,
    is_required: row.is_required !== false,
    default_value_int:
      row.default_value_int == null ? null : Number(row.default_value_int),
    default_value_bool:
      row.default_value_bool == null ? null : Boolean(row.default_value_bool),
    sort_order: Number(row.sort_order) || 0,
    options,
  };
};

const pickText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const warningFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const title = pickText(
    payload.title,
    payload.name,
    payload.heading,
    payload.header
  );
  const message = pickText(
    payload.html,
    payload.text,
    payload.message,
    payload.content,
    payload.body,
    payload.description
  );
  if (!title && !message) return null;
  return { title, message };
};

export const normalizeSizeLimitWarning = (raw) => {
  if (!raw) return null;
  if (typeof raw === "string") {
    const message = raw.trim();
    return message ? { title: "", message } : null;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const warning = normalizeSizeLimitWarning(item);
      if (warning) return warning;
    }
    return null;
  }
  if (typeof raw !== "object") return null;
  const fromPayload = warningFromPayload(raw.payload);
  const fromSelf = warningFromPayload({
    ...raw,
    payload: undefined,
    content: undefined,
    warning: undefined,
  });
  const nested =
    normalizeSizeLimitWarning(raw.content) ||
    (raw.warning && raw.warning !== raw
      ? normalizeSizeLimitWarning(raw.warning)
      : null);
  const title = pickText(
    fromSelf?.title,
    raw.name,
    fromPayload?.title,
    nested?.title
  );
  const message = pickText(
    fromPayload?.message,
    fromSelf?.message,
    nested?.message
  );
  if (!title && !message) return null;
  return { title, message };
};

export const normalizeSizeLimitCondition = (row) => {
  if (!row || typeof row !== "object") return null;
  const paramId = Number(
    row.construction_system_param_id ?? row.param_id ?? row.id
  );
  const code = String(
    row.code ?? row.param_code ?? row.param?.code ?? ""
  ).trim();
  const hasInt = row.value_int != null;
  const hasBool = row.value_bool != null;
  if (!code && !(Number.isFinite(paramId) && paramId > 0) && !hasInt && !hasBool) {
    return null;
  }
  return {
    construction_system_param_id:
      Number.isFinite(paramId) && paramId > 0 ? paramId : null,
    code,
    value_int: hasInt ? Number(row.value_int) : null,
    value_bool: hasBool ? Boolean(row.value_bool) : null,
  };
};

export const normalizeSizeLimit = (row, warningsById = new Map()) => {
  if (!row || typeof row !== "object") return null;
  const dimension = String(row.dimension || "").trim();
  if (dimension !== "len_x" && dimension !== "len_z" && dimension !== "len_y") {
    return null;
  }
  const mode = String(row.mode || "common").trim() || "common";
  const warningId = String(row.warning_content_id ?? row.warning_id ?? "").trim();
  const warning =
    normalizeSizeLimitWarning(row.warning) ||
    normalizeSizeLimitWarning(row.warning_content) ||
    normalizeSizeLimitWarning(row.warning_block) ||
    normalizeSizeLimitWarning(row.warning_blocks) ||
    (warningId ? warningsById.get(warningId) : null) ||
    null;
  const minRaw = Number(row.min_value);
  const maxRaw = Number(row.max_value);
  return {
    id: Number(row.id) || null,
    dimension,
    mode: mode === "parametric" ? "parametric" : "common",
    min_value: Number.isFinite(minRaw) && minRaw > 0 ? minRaw : null,
    max_value: Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : null,
    sort_order: Number(row.sort_order) || 0,
    warning_content_id: warningId || "",
    warning,
    conditions: (Array.isArray(row.conditions) ? row.conditions : [])
      .map(normalizeSizeLimitCondition)
      .filter(Boolean),
  };
};

const warningsMapFromParamsData = (paramsData) => {
  const map = new Map();
  const rows = [
    ...(Array.isArray(paramsData?.warnings) ? paramsData.warnings : []),
    ...(Array.isArray(paramsData?.warning_blocks)
      ? paramsData.warning_blocks
      : []),
  ];
  for (const row of rows) {
    const id = String(row?.id ?? row?.content_id ?? "").trim();
    const warning = normalizeSizeLimitWarning(row);
    if (id && warning) map.set(id, warning);
  }
  return map;
};

export const normalizeReplacementGroup = (row) => {
  if (!row || typeof row !== "object") return null;
  const group = Number(row.group);
  const type = row.replacement_material_type;
  const materials = (Array.isArray(row.materials) ? row.materials : [])
    .map((item) => {
      const mat =
        item?.material && typeof item.material === "object" ? item.material : {};
      const code = String(mat.code ?? item.code ?? "").trim();
      if (!code) return null;
      return {
        code,
        name: String(mat.name ?? item.name ?? code).trim(),
        is_default: Boolean(item.is_default),
      };
    })
    .filter(Boolean);
  if (!Number.isFinite(group) || materials.length === 0) return null;
  const defaultMat = materials.find((item) => item.is_default) || materials[0];
  return {
    group,
    typeCode: String(type?.code ?? "").trim(),
    typeName: String(type?.name ?? type?.code ?? `группа ${group}`).trim(),
    materials,
    defaultCode: defaultMat.code,
  };
};

export const normalizeOptionalMaterial = (row) => {
  if (!row || typeof row !== "object") return null;
  const mat =
    row.material && typeof row.material === "object" ? row.material : {};
  const code = String(mat.code ?? row.code ?? "").trim();
  if (!code) return null;
  return {
    code,
    name: String(mat.name ?? row.name ?? code).trim(),
  };
};

export const parseCalcApiSpec = ({ paramsBody, detailBody } = {}) => {
  const paramsData = unwrapApiData(paramsBody) || {};
  const detail = unwrapApiData(detailBody) || {};
  const composition = detail.composition || {};
  const params = (Array.isArray(paramsData.params) ? paramsData.params : [])
    .map(normalizeCalcParam)
    .filter(Boolean)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const warningsById = warningsMapFromParamsData(paramsData);
  const sizeLimits = (
    Array.isArray(paramsData.size_limits)
      ? paramsData.size_limits
      : Array.isArray(paramsData.sizeLimits)
        ? paramsData.sizeLimits
        : []
  )
    .map((row) => normalizeSizeLimit(row, warningsById))
    .filter(Boolean)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const replacementGroups = (
    Array.isArray(composition.replacement_groups)
      ? composition.replacement_groups
      : []
  )
    .map(normalizeReplacementGroup)
    .filter(Boolean)
    .sort((a, b) => a.group - b.group);
  const optionalMaterials = (
    Array.isArray(composition.optional_materials)
      ? composition.optional_materials
      : []
  )
    .map(normalizeOptionalMaterial)
    .filter(Boolean);
  return { params, replacementGroups, optionalMaterials, sizeLimits };
};

export const hasCalcApiOptions = (spec) =>
  Boolean(spec?.params?.length || spec?.optionalMaterials?.length);

export const ADD_CEIL_SHIFT_PARAM = "add_ceil_shift";
export const ADD_CEIL_SHIFT_DEFAULT_MM = 200;

export const isAddCeilShiftParam = (param) =>
  String(param?.code ?? "").trim() === ADD_CEIL_SHIFT_PARAM;

export const addCeilShiftDefaultMm = (param) => {
  const n = Number(param?.default_value_int);
  return Number.isFinite(n) && n > 0 ? n : ADD_CEIL_SHIFT_DEFAULT_MM;
};

export const isAddCeilShiftEnabled = (value) => value?.enabled === true;

export const clampAddCeilShiftMm = (value, param) => {
  const min = addCeilShiftDefaultMm(param);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) return min;
  return n;
};

export const defaultCalcApiValues = (spec) => {
  const paramValues = {};
  for (const param of spec?.params || []) {
    if (isAddCeilShiftParam(param)) {
      paramValues[param.code] = {
        value_int: addCeilShiftDefaultMm(param),
        enabled: false,
      };
      continue;
    }
    if (param.value_type === "bool") {
      const fromDefault = param.default_value_bool;
      const fromOption = param.options.find((opt) => opt.value_bool != null);
      paramValues[param.code] = {
        value_bool:
          fromDefault != null
            ? Boolean(fromDefault)
            : Boolean(fromOption?.value_bool),
      };
    } else {
      const fromDefault = param.default_value_int;
      const fromOption = param.options.find((opt) => opt.value_int != null);
      paramValues[param.code] = {
        value_int:
          fromDefault != null
            ? Number(fromDefault)
            : Number(fromOption?.value_int) || 0,
      };
    }
  }
  const selectedReplacements = {};
  for (const group of spec?.replacementGroups || []) {
    selectedReplacements[group.group] = group.defaultCode;
  }
  return {
    paramValues,
    selectedReplacements,
    selectedOptionals: [],
  };
};

export const materialOptionLabel = (item, siblings) => {
  const name = String(item?.name || item?.code || "").trim();
  const code = String(item?.code || "").trim();
  const sameName =
    Array.isArray(siblings) &&
    siblings.filter((other) => other.name === name).length > 1;
  if (sameName && code) return `${name} (${code})`;
  return name || code;
};

export const buildIsolationCalcRequestItem = ({
  code,
  lenX = 0,
  lenY = 0,
  lenZ = 0,
  area = 0,
  perimeter = 0,
  openings = [],
  paramValues = {},
  selectedReplacements = {},
  selectedOptionals = [],
} = {}) => {
  const params = [];
  for (const [paramCode, value] of Object.entries(paramValues || {})) {
    if (!paramCode) continue;
    if (paramCode === ADD_CEIL_SHIFT_PARAM) {
      params.push({
        code: paramCode,
        value_int: clampAddCeilShiftMm(value?.value_int),
      });
      continue;
    }
    if (value?.value_bool != null && value?.value_int == null) {
      params.push({ code: paramCode, value_bool: Boolean(value.value_bool) });
    } else if (value?.value_int != null) {
      params.push({ code: paramCode, value_int: Number(value.value_int) });
    }
  }
  return {
    code: String(code || "").trim(),
    len_x: Number(lenX) || 0,
    len_y: Number(lenY) || 0,
    len_z: Number(lenZ) || 0,
    area: Number(area) || 0,
    perimeter: Number(perimeter) || 0,
    openings: Array.isArray(openings) ? openings : [],
    params,
    selected_replacement_materials: Object.values(selectedReplacements || {})
      .map((item) => String(item || "").trim())
      .filter(Boolean),
    selected_optional_materials: (selectedOptionals || [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  };
};

export const paramValuesFromStoredParams = (params) => {
  const paramValues = {};
  for (const row of Array.isArray(params) ? params : []) {
    const code = String(row?.code ?? "").trim();
    if (!code) continue;
    if (row.value_bool != null && row.value_int == null) {
      paramValues[code] = { value_bool: Boolean(row.value_bool) };
    } else if (row.value_int != null) {
      paramValues[code] = { value_int: Number(row.value_int) };
    }
  }
  return paramValues;
};

export const selectedReplacementsMap = (
  groups,
  selectedCodes = [],
  storedMap
) => {
  const next = {};
  const codes = new Set(
    (Array.isArray(selectedCodes) ? selectedCodes : []).map((item) =>
      String(item || "").trim()
    )
  );
  for (const group of Array.isArray(groups) ? groups : []) {
    const selected = group.materials.find((item) => codes.has(item.code));
    next[group.group] = selected?.code || group.defaultCode;
  }
  if (storedMap && typeof storedMap === "object" && !Array.isArray(storedMap)) {
    Object.assign(next, storedMap);
  }
  return next;
};

export const replaceableCalcGroups = (groups) =>
  (Array.isArray(groups) ? groups : []).filter(
    (group) => (group.materials || []).length > 1
  );

export const replacementGroupForProductCode = (groups, code) => {
  const c = String(code ?? "").trim();
  if (!c) return null;
  return (
    replaceableCalcGroups(groups).find((group) =>
      group.materials.some((item) => item.code === c)
    ) || null
  );
};

export const buildIsolationCalcRequestFromStored = (sent, overrides = {}) => {
  const groups = sent?.replacementGroups || [];
  const selectedReplacements = selectedReplacementsMap(
    groups,
    sent?.selected_replacement_materials,
    overrides.selectedReplacements ?? sent?.selectedReplacements
  );
  return buildIsolationCalcRequestItem({
    code: sent?.Code,
    lenX: sent?.LenX,
    lenY: sent?.LenY,
    lenZ: sent?.LenZ,
    area: sent?.Area,
    perimeter: sent?.Perimeter,
    openings: sent?.Openings,
    paramValues: paramValuesFromStoredParams(sent?.params),
    selectedReplacements,
    selectedOptionals:
      overrides.selectedOptionals ?? sent?.selected_optional_materials ?? [],
  });
};

export const extractCalcProducts = (body) => {
  const data = unwrapApiData(body);
  if (!Array.isArray(data) || data.length === 0) return [];
  if (data[0] && Array.isArray(data[0].products)) {
    return data.flatMap((item) =>
      Array.isArray(item.products) ? item.products : []
    );
  }
  return data;
};

export const paramIntValue = (paramValues, code, fallback = 0) => {
  const value = paramValues?.[code];
  if (value?.value_int == null) return fallback;
  const n = Number(value.value_int);
  return Number.isFinite(n) ? n : fallback;
};

export const paramBoolValue = (paramValues, code, fallback = false) => {
  const value = paramValues?.[code];
  if (value?.value_bool == null) return fallback;
  return Boolean(value.value_bool);
};

const pickItemsBaseMatch = (itemsBase, agId, sectionId) => {
  const code = String(agId ?? "").trim();
  if (!code || !Array.isArray(itemsBase)) return null;
  const matches = itemsBase.filter((item) => String(item?.ag_id ?? "").trim() === code);
  if (matches.length === 0) return null;
  if (sectionId) {
    const bySection = matches.find((item) => item.c_id === sectionId);
    if (bySection) return bySection;
  }
  return matches[0];
};

export const publicConstructionTypeCode = (row) => {
  if (!row || typeof row !== "object") return "";
  if (row.type_code) return String(row.type_code).trim().toLowerCase();
  if (typeof row.type === "string") return row.type.trim().toLowerCase();
  if (row.type && typeof row.type === "object" && row.type.code) {
    return String(row.type.code).trim().toLowerCase();
  }
  return "";
};

export const imageTypeCode = (image) =>
  String(image?.type?.code ?? image?.type_code ?? "").trim().toLowerCase();

export const isCadEntityImage = (image) => {
  const code = imageTypeCode(image);
  const name = String(image?.type?.name ?? "").trim().toLowerCase();
  return /cad|drawing|scheme|чертёж|чертеж/.test(`${code} ${name}`);
};

const rankEntityImages = (images) =>
  [...images].sort((a, b) => {
    const pa = a?.is_primary ? 1 : 0;
    const pb = b?.is_primary ? 1 : 0;
    if (pb !== pa) return pb - pa;
    const sa = Number(a?.sort_order) || 0;
    const sb = Number(b?.sort_order) || 0;
    if (sa !== sb) return sa - sb;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });

/** url картинки из images[] админки (is_primary, иначе меньший sort_order). */
export const pickEntityImageUrl = (images, { cad = false } = {}) => {
  if (!Array.isArray(images) || images.length === 0) return "";
  const filtered = images.filter((img) =>
    cad ? isCadEntityImage(img) : !isCadEntityImage(img)
  );
  const pool = filtered.length > 0 ? filtered : cad ? [] : images;
  if (pool.length === 0) return "";
  return String(rankEntityImages(pool)[0]?.url || "").trim();
};

const numericPhysical = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

export const physicalParamsFromConstruction = (row) => {
  const p =
    row?.physical_params && typeof row.physical_params === "object"
      ? row.physical_params
      : {};
  return {
    thickness: numericPhysical(p.Thickness ?? p.thickness),
    soundIndex: numericPhysical(p.SoundIndex ?? p.sound_index),
    soundIndexRight: numericPhysical(p.SoundIndexRight ?? p.sound_index_right),
    impactNoiseIndex: numericPhysical(
      p.ImpactNoiseIndex ?? p.impact_noise_index ?? p.ImpactNoseIndex
    ),
  };
};

export const textSectionText = (sections, codes = []) => {
  const list = Array.isArray(sections) ? sections : [];
  const wanted = new Set(codes.map((code) => String(code).trim().toLowerCase()));
  const found = list.find((row) =>
    wanted.has(String(row?.code ?? "").trim().toLowerCase())
  );
  return String(found?.text ?? "").trim();
};

export const unwrapPublicConstructionDetail = (body) => {
  const data = unwrapApiData(body);
  if (!data || typeof data !== "object") return null;
  if (data.construction && typeof data.construction === "object") {
    return {
      construction: data.construction,
      composition: data.composition || {},
      text_sections: Array.isArray(data.text_sections) ? data.text_sections : [],
    };
  }
  return {
    construction: data,
    composition: data.composition || {},
    text_sections: Array.isArray(data.text_sections) ? data.text_sections : [],
  };
};

const materialRowFromCompositionItem = (row) => {
  const mat =
    row?.material && typeof row.material === "object" ? row.material : row;
  const code = String(mat?.code ?? row?.code ?? "").trim();
  const name = String(mat?.name ?? row?.name ?? "").trim();
  if (!code && !name) return null;
  return { code, name, Code: code, Name: name };
};

/** Плоский список материалов из composition публичной карточки. */
export const materialsFromPublicComposition = (composition) => {
  const defaults = Array.isArray(composition?.default_materials)
    ? composition.default_materials
    : [];
  const optionals = Array.isArray(composition?.optional_materials)
    ? composition.optional_materials
    : [];
  const fromGroups = (Array.isArray(composition?.replacement_groups)
    ? composition.replacement_groups
    : []
  ).flatMap((group) =>
    (Array.isArray(group?.materials) ? group.materials : []).filter(
      (item) => item?.is_default
    )
  );
  return [...defaults, ...fromGroups, ...optionals]
    .map(materialRowFromCompositionItem)
    .filter(Boolean);
};

/**
 * Публичная карточка / список админки → запись для инфо-страницы.
 */
export const mapPublicConstructionToInfoRecord = (detail) => {
  const unwrapped = unwrapPublicConstructionDetail(detail);
  if (!unwrapped) return null;
  const construction = unwrapped.construction;
  const code = String(construction?.code ?? "").trim();
  if (!code) return null;
  const name = String(construction?.name ?? "").trim();
  const images = Array.isArray(construction.images) ? construction.images : [];
  const physical = physicalParamsFromConstruction(construction);
  return {
    Code: code,
    Name: name || code,
    Description: name || code,
    Img: pickEntityImageUrl(images),
    CadImg: pickEntityImageUrl(images, { cad: true }),
    Thickness: physical.thickness,
    SoundIndex: physical.soundIndex,
    ImpactNoseIndex: physical.impactNoiseIndex,
    Specification: textSectionText(unwrapped.text_sections, [
      "specification",
      "description",
      "opisanie",
    ]),
    images,
    text_sections: unwrapped.text_sections,
    composition: unwrapped.composition,
  };
};

/**
 * Публичный каталог GET /api/v2/constructions/{category}
 * (те же конструкции, что в админке). title/description/картинки — из API.
 * ItemsBase только для template/size_limit_id, пока лимиты не заведены в админке.
 */
export const calcItemsFromPublicConstructions = (rows, itemsBase = []) => {
  if (!Array.isArray(rows)) return [];
  const items = [];
  for (const row of rows) {
    const agId = String(row?.code ?? "").trim();
    const typeCode = publicConstructionTypeCode(row);
    let c_id = sectionIdFromTypeCode(typeCode) || sectionIdFromCode(agId);
    const base = pickItemsBaseMatch(itemsBase, agId, c_id);
    if (!c_id) c_id = base?.c_id ?? null;
    if (!agId || !c_id) continue;
    const name = String(row?.name ?? "").trim() || agId;
    const images = Array.isArray(row.images) ? row.images : [];
    const physical = physicalParamsFromConstruction(row);
    items.push({
      id: row.id,
      size_limit_id: base?.id ?? null,
      title: name,
      description: name,
      c_id,
      template: base?.template ?? null,
      ag_id: agId,
      weight: base?.weight,
      type_code: typeCode,
      construction_id: row.id,
      imageUrl: pickEntityImageUrl(images),
      cadImageUrl: pickEntityImageUrl(images, { cad: true }),
      images,
      thickness: physical.thickness,
      soundIndex: physical.soundIndex,
      impactNoiseIndex: physical.impactNoiseIndex,
    });
  }
  return items;
};
