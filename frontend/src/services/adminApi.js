/**
 * Admin constructions/materials API (внешний сервис :3005).
 *
 *   GET /admin/materials
 *     → AdminMaterial[] (без prices; prices только в карточке)
 *     type: { id, code, name } | omit
 *   GET /admin/materials/types
 *     → { id, code, name, description }[]  (справочник materials_types)
 *   GET /admin/materials/{code}
 *     → AdminMaterialDetails { ...AdminMaterial, prices: MaterialPrice[] }
 *   GET /admin/commerce/regions
 *     → PriceRegion[] { id, code, name, pricing_mode, base_region, price_coefficient, sort_order, is_active }
 *   POST /admin/commerce/regions
 *     → body: PriceRegionUpsert { code, name, pricing_mode, base_region_id?, price_coefficient, sort_order, is_active }
 *   PUT /admin/commerce/regions/{id}
 *     → body: PriceRegionUpsert
 *   DELETE /admin/commerce/regions/{id}
 *   GET /commerce/price-list/{regionCode}
 *     → MaterialPriceListItem[] { code, product_name, units, price, m2, currency_code }
 *   GET /api/v2/data/unmatched
 *     → UnmatchedMaterial[] { id, code, name, units, prices, created_at }
 *   DELETE /api/v2/data/unmatched/{code}
 *   POST /admin/materials
 *     → body: AdminMaterialUpsert { ..., type_id }
 *   PUT /admin/materials/{code}
 *     → body: AdminMaterialUpsert { ..., type_id }
 *   DELETE /admin/materials/{code}?replacement_code=
 *     → если материал в конструкциях — обязателен replacement_code того же type
 *   POST /admin/commerce/materials/{materialID}/prices
 *     → body: { price_region_id, price, m2, currency_code }
 *   GET /admin/constructions?type=&category=
 *   GET /api/v2/constructions/types
 *     → { id, code, name }[]  (справочник construction_types)
 *   POST /admin/constructions
 *     → body: { code, name, type_id, category_id }
 *   PUT /admin/constructions/{id}
 *     → body: { code, name, type_id, category_id }
 *   DELETE /admin/constructions/{id}
 *   GET /admin/constructions/{id}
 *     → { construction, composition: { default_materials, replacement_groups, optional_materials } }
 *   GET /admin/constructions/calculation-types
 *     → { id, code, name, description }[]
 *   GET /admin/constructions/params
 *     → { id, code, name, description, value_type }[]
 *   GET /admin/constructions/{id}/calculation-params
 *   POST /admin/constructions/{id}/calculation-params
 *     → body: AdminConstructionCalculationParamUpsert { param_id, options[], ... }
 *   PUT /admin/constructions/{id}/calculation-params/{paramConfigID}
 *   GET /admin/constructions/{id}/size-limits
 *   POST /admin/constructions/{id}/size-limits
 *   PUT /admin/constructions/{id}/size-limits/{limitID}
 *   DELETE /admin/constructions/{id}/size-limits/{limitID}
 *   POST /admin/constructions/{id}/materials
 *     → body: { id, weight, sort_order, is_default, replacement_group, replacement_material_type_id, calculation_type_id, calculation_note }
 *   PUT /admin/constructions/{id}/materials/{itemId}
 *     → body: { id, weight, sort_order, is_default, replacement_group, replacement_material_type_id, calculation_type_id, calculation_note }
 *   DELETE /admin/constructions/{id}/materials/{itemId}
 *   POST /admin/constructions/{id}/optional-materials
 *     → body: { id, weight, sort_order, calculation_type_id, calculation_note }
 *   PUT /admin/constructions/{id}/optional-materials/{itemId}
 *     → body: { id, weight, sort_order, calculation_type_id, calculation_note }
 *   DELETE /admin/constructions/{id}/optional-materials/{itemId}
 *   GET /admin/images/types
 *     → { id, code, name, description }[]
 *   POST /admin/images/types  JSON ImageTypeUpsert { code, name, description }
 *   PUT /admin/images/types/{id}
 *   DELETE /admin/images/types/{id}
 *   POST /admin/images/upload  multipart: entity_type, image_type_code, entity_code?, file
 *     → { file_name, url, mime_type, file_size, width, height }
 *   GET /admin/images?entity_type=&entity_id=
 *   POST /admin/images  JSON AdminEntityImageUpsert (привязка уже загруженного файла)
 *   PUT /admin/images/{id}
 *   DELETE /admin/images/{id}  (только привязка, не файл)
 *
 * Same-origin через Vite / frontend server.js proxy → AUTH_SERVICE_URL.
 * Нужна cookie access_token (роль admin на стороне сервиса).
 */

import { request } from "./apiClient.js";
import { getCsrfToken } from "./authApi.js";
import { resolveAdminPublicImageUrl } from "../utils/adminImageSrc.js";

/** Достаёт массив из типичного конверта { code, data }. */
const unwrapList = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.items)) return body.items;
  return [];
};

const unwrapData = (body) => {
  if (body == null) return null;
  if (typeof body === "object" && !Array.isArray(body) && "data" in body) {
    return body.data ?? null;
  }
  return body;
};

const csrfHeaders = async () => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;
  return headers;
};

export const IMAGE_ENTITY_CONSTR = "constr";
export const IMAGE_ENTITY_MATERIAL = "material";

/** Ссылка { id, code, name } → плоские поля с префиксом (для UI/поиска). */
const flattenRef = (prefix, ref, fallback = {}) => {
  const obj = ref && typeof ref === "object" && !Array.isArray(ref) ? ref : null;
  return {
    [`${prefix}_id`]: obj?.id ?? fallback[`${prefix}_id`] ?? null,
    [`${prefix}_code`]: obj?.code ?? fallback[`${prefix}_code`] ?? null,
    [`${prefix}_name`]: obj?.name ?? fallback[`${prefix}_name`] ?? null,
  };
};

/** ID конструкции из строки списка. */
export const getConstructionId = (row) => {
  if (!row || typeof row !== "object") return null;
  const raw =
    row.id ?? row.construction_id ?? row.construction_system_id ?? null;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

/**
 * Нормализует конструкцию: nested type/category → плоские поля + исходные объекты.
 */
export const normalizeConstruction = (row) => {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    ...flattenRef("type", row.type, row),
    ...flattenRef("category", row.category, row),
  };
};

/** ID типа замены из группы или строки состава. */
export const getReplacementMaterialTypeId = (obj) => {
  if (!obj || typeof obj !== "object") return null;
  const nested = obj.replacement_material_type;
  const raw =
    obj.replacement_material_type_id ??
    (nested && typeof nested === "object" ? nested.id : null) ??
    null;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
};

/** ID типа расчёта материала из строки состава. */
export const getCalculationTypeId = (row) => {
  if (!row || typeof row !== "object") return null;
  const nested =
    row.calculation_type && typeof row.calculation_type === "object"
      ? row.calculation_type
      : null;
  const n = Number(row.calculation_type_id ?? nested?.id);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Нормализует строку состава к полям для таблицы / селекта. */
const normalizeCompositionRow = (row, groupMeta = null) => {
  if (!row || typeof row !== "object") return row;

  const material =
    row.material && typeof row.material === "object" ? row.material : null;
  const materialId = material?.id ?? row.material_id ?? null;
  const code = material?.code ?? row.material_code ?? row.code ?? null;
  const name = material?.name ?? row.material_name ?? row.name ?? null;

  const typeFromRow = row.replacement_material_type;
  const typeFromGroup = groupMeta?.replacement_material_type;
  const typeObj =
    (typeFromRow && typeof typeFromRow === "object" ? typeFromRow : null) ??
    (typeFromGroup && typeof typeFromGroup === "object" ? typeFromGroup : null);

  const typeFlat = flattenRef("replacement_material_type", typeObj, {
    replacement_material_type_id:
      row.replacement_material_type_id ??
      groupMeta?.replacement_material_type_id ??
      null,
    replacement_material_type_code:
      typeof typeFromRow === "string" ? typeFromRow : null,
    replacement_material_type_name:
      row.replacement_material_type_name ??
      groupMeta?.replacement_material_type_name ??
      (typeof typeFromRow === "string" ? typeFromRow : null),
  });

  const calcType =
    row.calculation_type && typeof row.calculation_type === "object"
      ? row.calculation_type
      : null;
  const calcFlat = flattenRef("calculation_type", calcType, row);

  return {
    ...row,
    material_id: materialId,
    code,
    name,
    material_code: code,
    material_name: name,
    units: row.units ?? null,
    weight: row.weight ?? null,
    sort_order: row.sort_order ?? null,
    is_default: row.is_default ?? null,
    replacement_group: row.replacement_group ?? groupMeta?.group ?? null,
    replacement_material_type: typeObj ?? typeFromRow ?? typeFromGroup ?? null,
    ...typeFlat,
    calculation_type: calcType,
    calculation_note:
      row.calculation_note == null ? "" : String(row.calculation_note),
    ...calcFlat,
  };
};

/**
 * Разбирает composition: default_materials + replacement_groups + optional_materials.
 * @returns {{ defaultMaterials: object[], replacementGroups: object[], optionalMaterials: object[] }}
 */
export const unwrapConstructionComposition = (body) => {
  const data = body?.data ?? body;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { defaultMaterials: [], replacementGroups: [], optionalMaterials: [] };
  }

  const composition =
    data.composition && typeof data.composition === "object"
      ? data.composition
      : data;

  const defaultMaterials = Array.isArray(composition.default_materials)
    ? composition.default_materials.map((row) => normalizeCompositionRow(row))
    : [];

  const replacementGroups = [];
  if (Array.isArray(composition.replacement_groups)) {
    for (const group of composition.replacement_groups) {
      if (!group || typeof group !== "object") continue;
      const typeObj =
        group.replacement_material_type &&
        typeof group.replacement_material_type === "object"
          ? group.replacement_material_type
          : null;
      const typeFlat = flattenRef("replacement_material_type", typeObj, group);
      const materials = Array.isArray(group.materials)
        ? group.materials.map((row) =>
            normalizeCompositionRow(row, { ...group, ...typeFlat })
          )
        : [];
      replacementGroups.push({
        group: group.group ?? null,
        replacement_material_type: typeObj ?? group.replacement_material_type ?? null,
        ...typeFlat,
        materials,
      });
    }
  }

  const optionalMaterials = Array.isArray(composition.optional_materials)
    ? composition.optional_materials.map((row) => normalizeCompositionRow(row))
    : [];

  return { defaultMaterials, replacementGroups, optionalMaterials };
};

/**
 * Подставляет name/code из каталога /admin/materials по артикулу
 * (materials.code ↔ composition.material.code). material_id состава не трогает.
 */
export const enrichCompositionFromMaterialsCatalog = (
  composition,
  catalogMaterials
) => {
  const byCode = new Map();
  for (const mat of catalogMaterials || []) {
    const code = String(mat?.code ?? "").trim();
    if (!code) continue;
    byCode.set(code, mat);
  }

  const enrichRow = (row) => {
    if (!row || typeof row !== "object") return row;
    const code = String(row.code || row.material_code || "").trim();
    const catalog = code ? byCode.get(code) : null;
    if (!catalog) return row;
    return {
      ...row,
      code,
      name: catalog.name ?? row.name,
      material_code: code,
      material_name: catalog.name ?? row.material_name,
    };
  };

  return {
    defaultMaterials: (composition?.defaultMaterials || []).map(enrichRow),
    replacementGroups: (composition?.replacementGroups || []).map((group) => ({
      ...group,
      materials: (group.materials || []).map(enrichRow),
    })),
    optionalMaterials: (composition?.optionalMaterials || []).map(enrichRow),
  };
};

/**
 * GET /admin/constructions/{id}/materials → плоский список (legacy).
 * Контракт ConstrTodo: { default_materials, replacement_groups }.
 */
export const unwrapConstructionMaterials = (body) => {
  const { defaultMaterials, replacementGroups } =
    unwrapConstructionComposition(body);
  const fromGroups = replacementGroups.flatMap((g) => g.materials);
  if (defaultMaterials.length || fromGroups.length) {
    return [...defaultMaterials, ...fromGroups];
  }

  const data = body?.data ?? body;
  if (Array.isArray(data)) return data.map((row) => normalizeCompositionRow(row));
  if (!data || typeof data !== "object") return [];

  for (const key of ["materials", "items", "composition", "main"]) {
    if (Array.isArray(data[key])) {
      return data[key].map((row) => normalizeCompositionRow(row));
    }
  }

  return [];
};

/** Код материала из строки списка. */
export const getMaterialCode = (row) => {
  if (!row || typeof row !== "object") return null;
  const nested =
    row.material && typeof row.material === "object" ? row.material : null;
  const raw = nested?.code ?? row.code ?? row.material_code ?? null;
  if (raw == null) return null;
  const code = String(raw).trim();
  return code || null;
};

/** ID типа материала из строки каталога / карточки. */
export const getMaterialTypeId = (obj) => {
  if (!obj || typeof obj !== "object") return null;
  const nested = obj.type && typeof obj.type === "object" ? obj.type : null;
  const raw = obj.type_id ?? nested?.id ?? null;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Нормализует запись справочника GET /admin/materials/types. */
export const normalizeMaterialType = (row) => {
  if (!row || typeof row !== "object") return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    code: row.code == null ? "" : String(row.code).trim(),
    name: row.name == null ? "" : String(row.name).trim(),
    description:
      row.description == null ? "" : String(row.description).trim(),
  };
};

/** Нормализует материал из GET /admin/materials. */
export const normalizeAdminMaterial = (row) => {
  if (!row || typeof row !== "object") return row;
  const code = row.code == null ? "" : String(row.code).trim();
  const typeObj =
    row.type && typeof row.type === "object" && !Array.isArray(row.type)
      ? row.type
      : null;
  return {
    ...row,
    ...flattenRef("type", typeObj, row),
    id: row.id ?? null,
    code,
    name: row.name == null ? "" : String(row.name).trim(),
    product_name:
      row.product_name == null ? "" : String(row.product_name).trim(),
    units: row.units == null ? "" : String(row.units).trim(),
    type: typeObj,
    usage: row.usage == null ? "" : String(row.usage).trim(),
    visible: Boolean(row.visible),
    updated_at: row.updated_at ?? null,
  };
};

/**
 * Нормализует карточку GET /admin/materials/{code}
 * (AdminMaterialDetails: поля материала + prices[]).
 */
export const normalizeAdminMaterialDetails = (row) => {
  if (!row || typeof row !== "object") return null;
  const material = normalizeAdminMaterial(row);
  const prices = Array.isArray(row.prices)
    ? row.prices.map((price) => ({
        id: price?.id ?? null,
        price: Number(price?.price) || 0,
        m2: Number(price?.m2) || 0,
        currency_code:
          price?.currency_code == null
            ? ""
            : String(price.currency_code).trim(),
        region: {
          id: price?.region?.id ?? null,
          code:
            price?.region?.code == null
              ? ""
              : String(price.region.code).trim(),
          name:
            price?.region?.name == null
              ? ""
              : String(price.region.name).trim(),
        },
      }))
    : [];
  return { ...material, prices };
};

/** Нормализует строку GET /commerce/price-list/{regionCode}. */
export const normalizeCommercePriceListItem = (row) => {
  if (!row || typeof row !== "object") return null;
  const code = String(row.code ?? row.article ?? "").trim();
  if (!code) return null;
  return {
    code,
    article: code,
    name:
      row.product_name == null && row.name == null
        ? ""
        : String(row.product_name ?? row.name).trim(),
    product_name:
      row.product_name == null ? "" : String(row.product_name).trim(),
    units: row.units == null ? "" : String(row.units).trim(),
    price: Number(row.price) || 0,
    m2: Number(row.m2) || 0,
    currency_code:
      row.currency_code == null ? "" : String(row.currency_code).trim(),
  };
};

/** GET /admin/materials → массив материалов. */
export const listAdminMaterials = async () => {
  const body = await request("/admin/materials");
  return unwrapList(body).map(normalizeAdminMaterial);
};

/** GET /admin/materials/types → справочник типов материалов. */
export const listAdminMaterialTypes = async () => {
  const body = await request("/admin/materials/types");
  return unwrapList(body).map(normalizeMaterialType).filter(Boolean);
};

/**
 * GET /admin/materials/{code} — карточка материала (+ prices).
 * @param {string} code
 */
export const getAdminMaterialByCode = async (code) => {
  const body = await request(
    `/admin/materials/${encodeURIComponent(code)}`
  );
  const data = body?.data ?? body;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return normalizeAdminMaterialDetails(data);
};

/**
 * GET /commerce/price-list/{regionCode} — прайс, синхронизированный с materials.
 * @param {string} [regionCode="msk"]
 */
export const listCommercePriceList = async (regionCode = "msk") => {
  const region = String(regionCode || "msk").trim() || "msk";
  const body = await request(
    `/commerce/price-list/${encodeURIComponent(region)}`
  );
  return unwrapList(body)
    .map(normalizeCommercePriceListItem)
    .filter(Boolean);
};

export const PRICE_REGION_MODE_DIRECT = "direct";
export const PRICE_REGION_MODE_DERIVED = "derived";

/** Нормализует регион из GET /admin/commerce/regions. */
export const normalizePriceRegion = (row) => {
  if (!row || typeof row !== "object") return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const base =
    row.base_region && typeof row.base_region === "object"
      ? row.base_region
      : null;
  const mode = String(row.pricing_mode || PRICE_REGION_MODE_DIRECT).trim();
  return {
    ...row,
    ...flattenRef("base_region", base, row),
    id,
    code: row.code == null ? "" : String(row.code).trim(),
    name: row.name == null ? "" : String(row.name).trim(),
    pricing_mode: mode,
    base_region: base,
    price_coefficient: Number(row.price_coefficient) || 1,
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
  };
};

export const isDirectPriceRegion = (row) =>
  String(row?.pricing_mode || "").trim() !== PRICE_REGION_MODE_DERIVED;

export const getPriceRegionBaseId = (row) => {
  const n = Number(row?.base_region_id ?? row?.base_region?.id);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Базовые регионы, под ними их дочерние. */
export const orderPriceRegions = (rows) => {
  const directs = [];
  const childrenByBase = new Map();
  const orphans = [];
  for (const row of rows || []) {
    if (isDirectPriceRegion(row)) {
      directs.push(row);
      continue;
    }
    const baseId = getPriceRegionBaseId(row);
    if (!baseId) {
      orphans.push(row);
      continue;
    }
    const list = childrenByBase.get(baseId) || [];
    list.push(row);
    childrenByBase.set(baseId, list);
  }
  const ordered = [];
  for (const base of directs) {
    ordered.push(base);
    ordered.push(...(childrenByBase.get(base.id) || []));
    childrenByBase.delete(base.id);
  }
  for (const leftover of childrenByBase.values()) {
    ordered.push(...leftover);
  }
  ordered.push(...orphans);
  return ordered;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Цены материала + дочерние регионы (цена базового × коэффициент),
 * даже если в material_prices ещё нет строк derived.
 * @param {object[]} prices
 * @param {object[]} regions
 */
export const expandMaterialPricesWithDerivedRegions = (prices, regions) => {
  const list = Array.isArray(prices) ? prices : [];
  const regs = Array.isArray(regions) ? regions.filter(Boolean) : [];

  const byRegionId = new Map();
  const byRegionCode = new Map();
  for (const price of list) {
    const id = Number(price?.region?.id);
    const code = String(price?.region?.code || "")
      .trim()
      .toLowerCase();
    if (Number.isFinite(id) && id > 0) byRegionId.set(id, price);
    if (code) byRegionCode.set(code, price);
  }

  const result = [];
  const seen = new Set();
  const mark = (id, code) => {
    if (Number.isFinite(id) && id > 0) seen.add(`id:${id}`);
    const key = String(code || "").trim().toLowerCase();
    if (key) seen.add(`code:${key}`);
  };
  const already = (id, code) => {
    if (Number.isFinite(id) && id > 0 && seen.has(`id:${id}`)) return true;
    const key = String(code || "").trim().toLowerCase();
    return Boolean(key && seen.has(`code:${key}`));
  };

  for (const region of orderPriceRegions(regs)) {
    if (region.is_active === false) continue;
    const id = Number(region.id);
    const code = String(region.code || "").trim();
    const stored = byRegionId.get(id) || byRegionCode.get(code.toLowerCase());
    if (stored) {
      result.push({
        ...stored,
        derived: !isDirectPriceRegion(region),
        computed: false,
        price_coefficient: region.price_coefficient,
        pricing_mode: region.pricing_mode,
      });
      mark(id, code);
      continue;
    }
    if (isDirectPriceRegion(region)) continue;

    const baseId = getPriceRegionBaseId(region);
    const baseCode = String(
      region.base_region_code || region.base_region?.code || ""
    )
      .trim()
      .toLowerCase();
    const basePrice =
      (baseId && byRegionId.get(baseId)) ||
      (baseCode && byRegionCode.get(baseCode)) ||
      null;
    const coef = Number(region.price_coefficient) || 1;
    result.push({
      id: region.id,
      region: { id: region.id, code: region.code, name: region.name },
      price: basePrice ? roundMoney(basePrice.price * coef) : null,
      m2: basePrice ? roundMoney(basePrice.m2 * coef) : null,
      currency_code: basePrice?.currency_code || "",
      derived: true,
      computed: true,
      price_coefficient: coef,
      pricing_mode: region.pricing_mode,
    });
    mark(id, code);
  }

  for (const price of list) {
    const id = Number(price?.region?.id);
    const code = String(price?.region?.code || "").trim();
    if (already(id, code)) continue;
    result.push({ ...price, derived: false, computed: false });
    mark(id, code);
  }

  return result;
};

/** GET /admin/commerce/regions → справочник регионов цен. */
export const listAdminCommerceRegions = async () => {
  const body = await request("/admin/commerce/regions");
  return unwrapList(body).map(normalizePriceRegion).filter(Boolean);
};

const buildPriceRegionUpsertBody = (payload) => {
  const mode =
    String(payload.pricing_mode || PRICE_REGION_MODE_DIRECT).trim() ||
    PRICE_REGION_MODE_DIRECT;
  const body = {
    code: String(payload.code || "").trim(),
    name: String(payload.name || "").trim(),
    pricing_mode: mode,
    price_coefficient: Number(payload.price_coefficient) || 1,
    sort_order: Number(payload.sort_order) || 0,
    is_active: payload.is_active !== false,
  };
  if (mode === PRICE_REGION_MODE_DERIVED) {
    const baseId = Number(payload.base_region_id);
    if (Number.isFinite(baseId) && baseId > 0) {
      body.base_region_id = baseId;
    }
  }
  return body;
};

/**
 * POST /admin/commerce/regions — создать регион (обычно derived).
 * @param {object} payload PriceRegionUpsert
 */
export const createAdminCommerceRegion = async (payload) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request("/admin/commerce/regions", {
    method: "POST",
    headers,
    body: buildPriceRegionUpsertBody(payload),
  });
};

/**
 * PUT /admin/commerce/regions/{id} — обновить регион (коэффициент дочернего).
 * @param {string|number} id
 * @param {object} payload PriceRegionUpsert
 */
export const updateAdminCommerceRegion = async (id, payload) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(`/admin/commerce/regions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers,
    body: buildPriceRegionUpsertBody(payload),
  });
};

/**
 * DELETE /admin/commerce/regions/{id} — удалить регион (для дочерних).
 * @param {string|number} id
 */
export const deleteAdminCommerceRegion = async (id) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(`/admin/commerce/regions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  });
};

/**
 * GET /api/v2/data/unmatched — материалы, по которым не прошла синхронизация.
 */
export const listUnmatchedMaterials = async () => {
  const body = await request("/api/v2/data/unmatched");
  return unwrapList(body).map((row) => {
    if (!row || typeof row !== "object") return row;
    return {
      ...row,
      id: row.id ?? null,
      code: row.code == null ? "" : String(row.code).trim(),
      name: row.name == null ? "" : String(row.name).trim(),
      units: row.units == null ? "" : String(row.units).trim(),
      prices: Array.isArray(row.prices) ? row.prices : [],
      created_at: row.created_at ?? null,
    };
  });
};

/**
 * DELETE /api/v2/data/unmatched/{code} — убрать из списка несовпавших.
 * @param {string} code
 */
export const deleteUnmatchedMaterial = async (code) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(`/api/v2/data/unmatched/${encodeURIComponent(code)}`, {
    method: "DELETE",
    headers,
  });
};

/**
 * POST /admin/materials — создать материал.
 * @param {object} payload AdminMaterialUpsert
 */
export const createAdminMaterial = async (payload) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request("/admin/materials", {
    method: "POST",
    headers,
    body: buildAdminMaterialUpsertBody(payload),
  });
};

/**
 * PUT /admin/materials/{code} — обновить материал.
 * @param {string} code текущий код в path
 * @param {object} payload AdminMaterialUpsert (может содержать новый code)
 */
export const updateAdminMaterial = async (code, payload) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(`/admin/materials/${encodeURIComponent(code)}`, {
    method: "PUT",
    headers,
    body: buildAdminMaterialUpsertBody(payload),
  });
};

/**
 * DELETE /admin/materials/{code} — удалить материал.
 * @param {string} code
 * @param {{ replacementCode?: string }} [options] код замены того же type (нужен, если материал в конструкциях)
 */
export const deleteAdminMaterial = async (code, options = {}) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  const replacementCode = String(options.replacementCode || "").trim();
  const qs = replacementCode
    ? `?replacement_code=${encodeURIComponent(replacementCode)}`
    : "";

  return request(`/admin/materials/${encodeURIComponent(code)}${qs}`, {
    method: "DELETE",
    headers,
  });
};

const parseMaterialTypeId = (payload) => {
  const nested =
    payload?.type && typeof payload.type === "object" ? payload.type : null;
  const n = Number(payload?.type_id ?? nested?.id ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const buildAdminMaterialUpsertBody = (payload) => ({
  code: String(payload.code || "").trim(),
  name: String(payload.name || "").trim(),
  product_name: String(payload.product_name || "").trim(),
  length: Number(payload.length) || 0,
  width: Number(payload.width) || 0,
  height: Number(payload.height) || 0,
  units: String(payload.units || "").trim(),
  type_id: parseMaterialTypeId(payload),
  unit_pack: Number(payload.unit_pack) || 0,
  info_pack: String(payload.info_pack || "").trim(),
  ratio_square: Number(payload.ratio_square) || 0,
  description: String(payload.description || "").trim(),
  specification: String(payload.specification || "").trim(),
  img: String(payload.img || "").trim(),
  scheme: String(payload.scheme || "").trim(),
  weight: String(payload.weight || "").trim(),
  volume: String(payload.volume || "").trim(),
  load_index: String(payload.load_index || "").trim(),
  order_list: Number(payload.order_list) || 0,
  visible: Boolean(payload.visible),
  usage: String(payload.usage || "").trim(),
});

/**
 * POST /admin/commerce/materials/{materialID}/prices.
 * @param {string|number} materialId
 * @param {{ price_region_id: number, price: number, m2: number, currency_code?: string }} payload
 */
export const createAdminMaterialPrice = async (materialId, payload) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(
    `/admin/commerce/materials/${encodeURIComponent(materialId)}/prices`,
    {
      method: "POST",
      headers,
      body: {
        price_region_id: Number(payload.price_region_id),
        price: Number(payload.price) || 0,
        m2: Number(payload.m2) || 0,
        currency_code: String(payload.currency_code || "RUB").trim() || "RUB",
      },
    }
  );
};

/**
 * Создать материал из unmatched: POST material → цены → DELETE unmatched.
 * @param {object} payload AdminMaterialUpsert (+ optional prices from unmatched)
 */
export const createAdminMaterialFromUnmatched = async (payload) => {
  const prices = Array.isArray(payload.prices) ? payload.prices : [];
  const { prices: _omit, ...materialPayload } = payload;
  await createAdminMaterial(materialPayload);

  const created = await getAdminMaterialByCode(materialPayload.code);
  const materialId = Number(created?.id);
  if (Number.isFinite(materialId) && materialId > 0) {
    for (const price of prices) {
      const regionId = Number(price?.region?.id ?? price?.price_region_id);
      if (!Number.isFinite(regionId) || regionId <= 0) continue;
      await createAdminMaterialPrice(materialId, {
        price_region_id: regionId,
        price: price.price,
        m2: price.m2,
        currency_code: price.currency_code,
      });
    }
  }

  await deleteUnmatchedMaterial(materialPayload.code);
  return created;
};

/**
 * GET /admin/constructions
 * @param {{ type?: string, category?: string }} [filters]
 */
export const listAdminConstructions = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.category) params.set("category", filters.category);
  const qs = params.toString();
  const path = qs ? `/admin/constructions?${qs}` : "/admin/constructions";
  const body = await request(path);
  return unwrapList(body).map(normalizeConstruction);
};

/**
 * POST /admin/constructions — создать конструкцию.
 * @param {{ code: string, name: string, type_id: number, category_id: number }} payload
 */
export const createAdminConstruction = async (payload) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request("/admin/constructions", {
    method: "POST",
    headers,
    body: {
      code: String(payload.code || "").trim(),
      name: String(payload.name || "").trim(),
      type_id: Number(payload.type_id),
      category_id: Number(payload.category_id),
    },
  });
};

/**
 * PUT /admin/constructions/{id} — обновить код/название/тип/категорию.
 * @param {string|number} id
 * @param {{ code: string, name: string, type_id: number, category_id: number }} payload
 */
export const updateAdminConstruction = async (id, payload) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(`/admin/constructions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers,
    body: {
      code: String(payload.code || "").trim(),
      name: String(payload.name || "").trim(),
      type_id: Number(payload.type_id),
      category_id: Number(payload.category_id),
    },
  });
};

/**
 * DELETE /admin/constructions/{id} — удалить конструкцию.
 * @param {string|number} id
 */
export const deleteAdminConstruction = async (id) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(`/admin/constructions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  });
};

/**
 * Нормализует запись справочника GET /api/v2/constructions/types.
 */
export const normalizeConstructionType = (row) => {
  if (!row || typeof row !== "object") return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    code: row.code == null ? "" : String(row.code).trim(),
    name: row.name == null ? "" : String(row.name).trim(),
  };
};

/**
 * GET /api/v2/constructions/types — справочник типов конструкций.
 */
export const listConstructionTypes = async () => {
  const body = await request("/api/v2/constructions/types");
  return unwrapList(body).map(normalizeConstructionType).filter(Boolean);
};

/** GET /admin/constructions/calculation-types — справочник формул расхода. */
export const listAdminConstructionCalculationTypes = async () => {
  const body = await request("/admin/constructions/calculation-types");
  return unwrapList(body).map(normalizeConstructionParam).filter(Boolean);
};

export const CONSTRUCTION_PARAM_TYPE_INT = "int";
export const CONSTRUCTION_PARAM_TYPE_BOOL = "bool";

const unwrapNestedList = (body, nestedKeys = []) => {
  const direct = unwrapList(body);
  if (direct.length) return direct;
  const data = body?.data ?? body;
  if (!data || typeof data !== "object") return [];
  for (const key of nestedKeys) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
};

/** Нормализует запись справочника GET /admin/constructions/params. */
export const normalizeConstructionParam = (row) => {
  if (!row || typeof row !== "object") return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    code: row.code == null ? "" : String(row.code).trim(),
    name: row.name == null ? "" : String(row.name).trim(),
    description:
      row.description == null ? "" : String(row.description).trim(),
    value_type:
      String(row.value_type || CONSTRUCTION_PARAM_TYPE_INT).trim() ||
      CONSTRUCTION_PARAM_TYPE_INT,
  };
};

const normalizeCalcParamOption = (row, index = 0, valueType = "") => {
  if (!row || typeof row !== "object") return null;
  const type =
    String(valueType || "").trim() || CONSTRUCTION_PARAM_TYPE_INT;
  return {
    id: Number(row.id) || null,
    label: row.label == null ? "" : String(row.label).trim(),
    value_int: Number(row.value_int) || 0,
    value_bool: Boolean(row.value_bool),
    sort_order: Number(row.sort_order) || index,
    value_type: type,
  };
};

/** Нормализует параметр, уже привязанный к конструкции. */
export const normalizeConstructionCalculationParam = (row) => {
  if (!row || typeof row !== "object") return null;
  const paramObj =
    row.param && typeof row.param === "object" && !Array.isArray(row.param)
      ? normalizeConstructionParam(row.param)
      : null;
  const paramId = Number(row.param_id ?? paramObj?.id ?? row.id);
  if (!Number.isFinite(paramId) || paramId <= 0) return null;
  const configId = Number(row.id);
  const valueType =
    String(
      row.value_type || paramObj?.value_type || CONSTRUCTION_PARAM_TYPE_INT
    ).trim() || CONSTRUCTION_PARAM_TYPE_INT;
  const options = Array.isArray(row.options)
    ? row.options
        .map((opt, i) => normalizeCalcParamOption(opt, i, valueType))
        .filter(Boolean)
    : [];
  return {
    id: Number.isFinite(configId) && configId > 0 ? configId : null,
    param_id: paramId,
    param: paramObj,
    code: String(row.code || paramObj?.code || "").trim(),
    name: String(row.name || paramObj?.name || "").trim(),
    description: String(row.description || paramObj?.description || "").trim(),
    value_type: valueType,
    is_required: row.is_required !== false,
    sort_order: Number(row.sort_order) || 0,
    default_value_int: Number(row.default_value_int) || 0,
    default_value_bool: Boolean(row.default_value_bool),
    options,
  };
};

const buildCalcParamUpsertBody = (payload) => {
  const valueType =
    String(payload.value_type || CONSTRUCTION_PARAM_TYPE_INT).trim() ||
    CONSTRUCTION_PARAM_TYPE_INT;
  const isBool = valueType === CONSTRUCTION_PARAM_TYPE_BOOL;
  const options = (Array.isArray(payload.options) ? payload.options : [])
    .map((opt, i) => {
      const label = String(opt?.label || "").trim();
      if (!label) return null;
      const row = {
        label,
        sort_order: Number(opt.sort_order) || i,
      };
      if (isBool) {
        row.value_bool = Boolean(opt.value_bool);
      } else {
        row.value_int = Number(opt.value_int) || 0;
      }
      return row;
    })
    .filter(Boolean);

  const body = {
    param_id: Number(payload.param_id),
    is_required: payload.is_required !== false,
    sort_order: Number(payload.sort_order) || 0,
    options,
  };
  if (isBool) {
    body.default_value_bool = Boolean(payload.default_value_bool);
  } else {
    body.default_value_int = Number(payload.default_value_int) || 0;
  }
  return body;
};

const isBoolConstructionParam = (param) =>
  String(param?.value_type || "").trim() === CONSTRUCTION_PARAM_TYPE_BOOL ||
  String(param?.code || "").trim() === "dframe";

/**
 * Тело POST /admin/constructions/{id}/calculation-params
 * для привязки типа из справочника (step / dframe / …).
 */
export const buildCalculationParamAttachPayload = (param, sortOrder = 0) => {
  const paramId = Number(param?.id ?? param?.param_id);
  const code = String(param?.code || "").trim();
  if (isBoolConstructionParam(param)) {
    return {
      param_id: paramId,
      value_type: CONSTRUCTION_PARAM_TYPE_BOOL,
      is_required: true,
      sort_order: Number(sortOrder) || 0,
      default_value_bool: false,
      options: [
        { label: "Да", value_bool: true, sort_order: 0 },
        { label: "Нет", value_bool: false, sort_order: 1 },
      ],
    };
  }
  const options =
    code === "step"
      ? [600, 400, 300].map((value, i) => ({
          label: `${value} мм`,
          value_int: value,
          sort_order: i,
        }))
      : [
          {
            label: String(param?.name || code || "вариант"),
            value_int: Number(param?.default_value_int) || 0,
            sort_order: 0,
          },
        ];
  return {
    param_id: paramId,
    value_type:
      String(param?.value_type || CONSTRUCTION_PARAM_TYPE_INT).trim() ||
      CONSTRUCTION_PARAM_TYPE_INT,
    is_required: true,
    sort_order: Number(sortOrder) || 0,
    default_value_int:
      code === "step" ? 600 : Number(options[0]?.value_int) || 0,
    options,
  };
};

/** GET /admin/constructions/params — справочник параметров расчета. */
export const listAdminConstructionParams = async () => {
  const body = await request("/admin/constructions/params");
  return unwrapList(body).map(normalizeConstructionParam).filter(Boolean);
};

/** GET /admin/constructions/{id}/calculation-params */
export const listAdminConstructionCalculationParams = async (id) => {
  const body = await request(
    `/admin/constructions/${encodeURIComponent(id)}/calculation-params`
  );
  return unwrapNestedList(body, [
    "params",
    "calculation_params",
    "items",
  ])
    .map(normalizeConstructionCalculationParam)
    .filter(Boolean)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
};

/**
 * POST /admin/constructions/{id}/calculation-params
 * @param {string|number} constructionId
 * @param {object} payload AdminConstructionCalculationParamUpsert + value_type
 */
export const addAdminConstructionCalculationParam = async (
  constructionId,
  payload
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/calculation-params`,
    {
      method: "POST",
      headers,
      body: buildCalcParamUpsertBody(payload),
    }
  );
};

/**
 * PUT /admin/constructions/{id}/calculation-params/{paramConfigID}
 * @param {string|number} constructionId
 * @param {string|number} paramConfigId
 * @param {object} payload AdminConstructionCalculationParamUpsert + value_type
 */
export const updateAdminConstructionCalculationParam = async (
  constructionId,
  paramConfigId,
  payload
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/calculation-params/${encodeURIComponent(paramConfigId)}`,
    {
      method: "PUT",
      headers,
      body: buildCalcParamUpsertBody(payload),
    }
  );
};

/**
 * DELETE /admin/constructions/{id}/calculation-params/{paramConfigID}
 */
export const deleteAdminConstructionCalculationParam = async (
  constructionId,
  paramConfigId
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/calculation-params/${encodeURIComponent(paramConfigId)}`,
    {
      method: "DELETE",
      headers,
    }
  );
};

export const SIZE_LIMIT_DIMENSIONS = [
  { code: "len_x", label: "Ширина (len_x)" },
  { code: "len_z", label: "Высота (len_z)" },
];

export const SIZE_LIMIT_MODES = [
  { code: "common", label: "Всегда" },
  { code: "parametric", label: "При шаге профиля" },
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const isUuid = (value) => UUID_RE.test(String(value || "").trim());

export const isUsableWarningId = (value) => {
  const id = String(value || "").trim();
  return isUuid(id) && id.toLowerCase() !== NIL_UUID;
};

export const sizeLimitDimensionLabel = (code) =>
  SIZE_LIMIT_DIMENSIONS.find((item) => item.code === code)?.label ||
  String(code || "");

export const sizeLimitModeLabel = (code) =>
  SIZE_LIMIT_MODES.find((item) => item.code === code)?.label ||
  String(code || "");

const optionalMm = (raw) => {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const normalizeWarningContent = (row) => {
  if (!row || typeof row !== "object") return null;
  const id = String(row.id ?? row.warning_content_id ?? "").trim();
  const name = String(row.name ?? row.title ?? "").trim();
  const text = String(row.text ?? row.message ?? "").trim();
  const code = String(row.code ?? "").trim();
  if (!id && !name && !text && !code) return null;
  return { id, code, name, text };
};

export const normalizeAdminSizeLimitCondition = (row) => {
  if (!row || typeof row !== "object") return null;
  const paramId = Number(
    row.construction_system_param_id ?? row.param_id ?? row.id
  );
  const valueInt =
    row.value_int != null && Number.isFinite(Number(row.value_int))
      ? Number(row.value_int)
      : null;
  const hasBool = row.value_bool != null;
  if (!(Number.isFinite(paramId) && paramId > 0) && valueInt == null && !hasBool) {
    return null;
  }
  const param = row.param && typeof row.param === "object" ? row.param : null;
  return {
    id: Number(row.id) || null,
    construction_system_param_id:
      Number.isFinite(paramId) && paramId > 0 ? paramId : null,
    code: String(param?.code ?? row.code ?? "").trim(),
    value_int: valueInt,
    value_bool: hasBool ? Boolean(row.value_bool) : null,
  };
};

export const normalizeAdminSizeLimit = (row) => {
  if (!row || typeof row !== "object") return null;
  const dimension = String(row.dimension || "").trim();
  if (dimension !== "len_x" && dimension !== "len_z") return null;
  const warning =
    normalizeWarningContent(row.warning_content) ||
    normalizeWarningContent(row.warning) ||
    null;
  const legacyText = String(
    row.warning_text ?? warning?.text ?? warning?.message ?? ""
  ).trim();
  const warningTextMin = String(
    row.warning_text_min ?? row.min_warning_text ?? ""
  ).trim() || legacyText;
  const warningTextMax = String(
    row.warning_text_max ?? row.max_warning_text ?? ""
  ).trim() || legacyText;
  return {
    id: Number(row.id) || null,
    construction_system_id: Number(row.construction_system_id) || null,
    dimension,
    mode: String(row.mode || "common").trim() === "parametric"
      ? "parametric"
      : "common",
    min_value: optionalMm(row.min_value),
    max_value: optionalMm(row.max_value),
    sort_order: Number(row.sort_order) || 0,
    warning_text_min: warningTextMin,
    warning_text_max: warningTextMax,
    conditions: (Array.isArray(row.conditions) ? row.conditions : [])
      .map(normalizeAdminSizeLimitCondition)
      .filter(Boolean),
  };
};

export const buildSizeLimitUpsertBody = (payload) => {
  const mode =
    String(payload?.mode || "common").trim() === "parametric"
      ? "parametric"
      : "common";
  const conditions =
    mode === "parametric"
      ? (Array.isArray(payload?.conditions) ? payload.conditions : [])
          .map((row) => {
            const paramId = Number(row?.construction_system_param_id);
            if (!Number.isFinite(paramId) || paramId <= 0) return null;
            const body = { construction_system_param_id: paramId };
            if (row?.value_int != null) {
              body.value_int = Number(row.value_int) || 0;
            }
            if (row?.value_bool != null) {
              body.value_bool = Boolean(row.value_bool);
            }
            return body;
          })
          .filter(Boolean)
      : [];
  return {
    dimension: String(payload?.dimension || "len_x").trim(),
    mode,
    min_value: optionalMm(payload?.min_value),
    max_value: optionalMm(payload?.max_value),
    sort_order: Number(payload?.sort_order) || 0,
    conditions,
    warning_text_min: String(payload?.warning_text_min || "").trim(),
    warning_text_max: String(payload?.warning_text_max || "").trim(),
  };
};

/** GET /admin/constructions/{id}/size-limits */
export const listAdminConstructionSizeLimits = async (id) => {
  const body = await request(
    `/admin/constructions/${encodeURIComponent(id)}/size-limits`
  );
  const data = body?.data ?? body;
  const limits = unwrapNestedList(body, ["size_limits", "items"])
    .map(normalizeAdminSizeLimit)
    .filter(Boolean)
    .sort(
      (a, b) =>
        (a.sort_order || 0) - (b.sort_order || 0) || (a.id || 0) - (b.id || 0)
    );
  const extraWarningRows = [
    ...(Array.isArray(data?.warnings) ? data.warnings : []),
    ...(Array.isArray(data?.warning_blocks) ? data.warning_blocks : []),
    ...(Array.isArray(data?.warning_contents) ? data.warning_contents : []),
  ];
  const warnings = extraWarningRows
    .map(normalizeWarningContent)
    .filter((row) => isUsableWarningId(row?.id));
  return { limits, warnings };
};

/**
 * POST /admin/constructions/{id}/size-limits
 * @param {string|number} constructionId
 * @param {object} payload AdminConstructionSizeLimitUpsert
 */
export const createAdminConstructionSizeLimit = async (
  constructionId,
  payload
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/size-limits`,
    {
      method: "POST",
      headers,
      body: buildSizeLimitUpsertBody(payload),
    }
  );
};

/**
 * PUT /admin/constructions/{id}/size-limits/{limitID}
 */
export const updateAdminConstructionSizeLimit = async (
  constructionId,
  limitId,
  payload
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/size-limits/${encodeURIComponent(limitId)}`,
    {
      method: "PUT",
      headers,
      body: buildSizeLimitUpsertBody(payload),
    }
  );
};

/** DELETE /admin/constructions/{id}/size-limits/{limitID} */
export const deleteAdminConstructionSizeLimit = async (
  constructionId,
  limitId
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/size-limits/${encodeURIComponent(limitId)}`,
    {
      method: "DELETE",
      headers,
    }
  );
};

const flattenContentTypes = (rows) => {
  const out = [];
  const walk = (row) => {
    if (!row || typeof row !== "object") return;
    out.push(row);
    const nested = row.subTypes || row.subtypes || row.children || [];
    if (Array.isArray(nested)) nested.forEach(walk);
  };
  (Array.isArray(rows) ? rows : []).forEach(walk);
  return out;
};

const looksLikeWarningContentType = (row) => {
  const hay = `${row?.code || ""} ${row?.name || ""} ${row?.description || ""}`;
  return /warn|size.?limit|limit|alert|предупрежд|огранич|info.?block|блок/i.test(
    hay
  );
};

const listContentByType = async (code) => {
  const items = [];
  const paths = [
    `/content/list/${encodeURIComponent(code)}?status=approved`,
    `/content/list/${encodeURIComponent(code)}`,
  ];
  for (const path of paths) {
    try {
      const body = await request(path, {}, { silent401: true, allowNotFound: true });
      const rows = unwrapNestedList(body, ["contents", "items", "documents"]);
      for (const row of rows) {
        const item = normalizeWarningContent(row);
        if (isUsableWarningId(item?.id)) items.push(item);
      }
      if (items.length) return items;
    } catch {
      /* тип недоступен */
    }
  }
  return items;
};

/**
 * GET /content/types + /content/list/{type} — warning-блоки CMS (роль manager).
 * @returns {{ items: object[], error: string|null }}
 */
export const listAdminWarningContents = async () => {
  let types = [];
  try {
    const body = await request("/content/types", {}, { silent401: true });
    types = flattenContentTypes(unwrapList(body));
  } catch (err) {
    const status = err?.status;
    if (status === 403) {
      return {
        items: [],
        error:
          "Нет роли manager: список warning из CMS недоступен. Нужен UUID уже существующего блока.",
      };
    }
    if (status === 401) {
      return {
        items: [],
        error: "Нет сессии для CMS. Войдите снова и повторите.",
      };
    }
    return {
      items: [],
      error:
        err?.message ||
        "Не удалось загрузить типы контента CMS для warning-блоков.",
    };
  }

  const preferred = types.filter(looksLikeWarningContentType);
  const toFetch = (preferred.length ? preferred : types)
    .map((row) => String(row?.code || "").trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!toFetch.length) {
    return {
      items: [],
      error: "В CMS нет типов контента, из которых можно выбрать warning.",
    };
  }

  const byId = new Map();
  for (const code of toFetch) {
    const rows = await listContentByType(code);
    for (const item of rows) byId.set(item.id, item);
  }

  const items = [...byId.values()].sort((a, b) =>
    (a.name || a.code || a.id).localeCompare(b.name || b.code || b.id, "ru")
  );
  return {
    items,
    error: items.length
      ? null
      : "В CMS нет warning-блоков. Создайте блок в CMS и вставьте его UUID.",
  };
};

/**
 * Список типов для UI создания: GET /api/v2/constructions/types
 * плюс типы, уже встречающиеся в загруженном списке конструкций.
 * @param {object[]} apiTypes
 * @param {object[]} rows
 * @returns {{ id: number, code: string, name: string }[]}
 */
export const collectConstructionTypes = (apiTypes, rows) => {
  const byId = new Map();
  for (const item of apiTypes || []) {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    byId.set(id, {
      id,
      code: String(item.code ?? "").trim(),
      name: String(item.name ?? "").trim(),
    });
  }
  for (const row of rows || []) {
    const id = Number(row?.type_id ?? row?.type?.id);
    if (!Number.isFinite(id) || id <= 0 || byId.has(id)) continue;
    byId.set(id, {
      id,
      code: String(row.type_code ?? row.type?.code ?? "").trim(),
      name: String(row.type_name ?? row.type?.name ?? "").trim(),
    });
  }
  return [...byId.values()].sort((a, b) =>
    (a.name || a.code).localeCompare(b.name || b.code, "ru")
  );
};

/**
 * Уникальные категории конструкций из списка (для селекта при редактировании).
 * @param {object[]} rows
 * @returns {{ id: number, code: string, name: string }[]}
 */
export const collectConstructionCategories = (rows) => {
  const byId = new Map();
  for (const row of rows || []) {
    const id = Number(row?.category_id ?? row?.category?.id);
    if (!Number.isFinite(id) || id <= 0 || byId.has(id)) continue;
    byId.set(id, {
      id,
      code: String(row.category_code ?? row.category?.code ?? "").trim(),
      name: String(row.category_name ?? row.category?.name ?? "").trim(),
    });
  }
  return [...byId.values()].sort((a, b) =>
    (a.name || a.code).localeCompare(b.name || b.code, "ru")
  );
};

/**
 * category_id из строк списка для кода категории (sound / acoustic).
 * @param {object[]} rows
 * @param {string} categoryCode
 * @returns {number|null}
 */
export const pickCategoryIdFromRows = (rows, categoryCode) => {
  const code = String(categoryCode || "").trim();
  if (!code) return null;
  for (const row of rows || []) {
    const rowCode = String(row?.category_code ?? row?.category?.code ?? "").trim();
    if (rowCode !== code) continue;
    const id = Number(row.category_id ?? row.category?.id);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
};

/**
 * GET /admin/constructions/{id} — карточка конструкции + composition.
 * @param {string|number} id
 * @returns {Promise<{ detail: object, defaultMaterials: object[], replacementGroups: object[], optionalMaterials: object[] }|null>}
 */
export const getAdminConstructionById = async (id) => {
  const body = await request(
    `/admin/constructions/${encodeURIComponent(id)}`
  );
  const data = body?.data ?? body;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const constructionRaw =
    data.construction && typeof data.construction === "object"
      ? data.construction
      : (() => {
          const { composition: _c, ...rest } = data;
          return rest;
        })();

  const detail = normalizeConstruction(constructionRaw);
  const { defaultMaterials, replacementGroups, optionalMaterials } =
    unwrapConstructionComposition(data);

  return { detail, defaultMaterials, replacementGroups, optionalMaterials };
};

/**
 * GET /admin/constructions/{id}/materials — состав выбранной конструкции.
 * @param {string|number} id
 */
export const getAdminConstructionMaterials = async (id) => {
  const body = await request(
    `/admin/constructions/${encodeURIComponent(id)}/materials`
  );
  return unwrapConstructionComposition(body);
};

/**
 * POST /admin/constructions/{id}/materials — в группу замены или в default_materials.
 * id = materials.id из GET /admin/materials для выбранного артикула (code).
 * Для материалов по умолчанию: is_default=true, replacement_group=null.
 */
export const addAdminConstructionMaterial = async (constructionId, payload) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  const body = { ...payload };
  if (body.id == null && body.material_id != null) {
    body.id = body.material_id;
  }
  delete body.material_id;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/materials`,
    {
      method: "POST",
      headers,
      body,
    }
  );
};

/**
 * PUT /admin/constructions/{id}/materials/{itemId} — обновить запись состава.
 * itemId = id строки composition (construction_materials.id).
 * body.id = materials.id.
 * Чтобы сделать default заменяемой позицией: is_default=true + replacement_group + type_id.
 */
export const updateAdminConstructionMaterial = async (
  constructionId,
  itemId,
  payload
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  const body = { ...payload };
  if (body.id == null && body.material_id != null) {
    body.id = body.material_id;
  }
  delete body.material_id;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/materials/${encodeURIComponent(itemId)}`,
    {
      method: "PUT",
      headers,
      body,
    }
  );
};

/**
 * DELETE /admin/constructions/{id}/materials/{itemId} — удалить запись состава.
 * itemId = id строки composition (construction_materials.id).
 */
export const deleteAdminConstructionMaterial = async (
  constructionId,
  itemId
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/materials/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
      headers,
    }
  );
};

/**
 * Список типов для UI групп замены: GET /admin/materials/types
 * плюс типы, уже встречающиеся в загруженных группах.
 * @param {object[]} apiTypes
 * @param {object[]} replacementGroups
 * @returns {{ id: number, code: string, name: string }[]}
 */
export const collectReplacementMaterialTypes = (
  apiTypes,
  replacementGroups
) => {
  const byId = new Map();
  for (const item of apiTypes || []) {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    byId.set(id, {
      id,
      code: String(item.code ?? "").trim(),
      name: String(item.name ?? "").trim(),
    });
  }
  for (const group of replacementGroups || []) {
    const id = Number(getReplacementMaterialTypeId(group));
    if (!Number.isFinite(id) || id <= 0 || byId.has(id)) continue;
    const code = String(
      group.replacement_material_type_code ??
        group.replacement_material_type?.code ??
        ""
    ).trim();
    const name = String(
      group.replacement_material_type_name ??
        group.replacement_material_type?.name ??
        ""
    ).trim();
    byId.set(id, { id, code, name: name || code || String(id) });
  }
  return [...byId.values()].sort((a, b) =>
    (a.name || a.code).localeCompare(b.name || b.code, "ru")
  );
};

/**
 * POST /admin/constructions/{id}/optional-materials — доп. материал конструкции.
 * id = materials.id из GET /admin/materials для выбранного артикула (code).
 * @param {string|number} constructionId
 * @param {{ id: number, weight: number, sort_order: number }} payload
 */
export const addAdminConstructionOptionalMaterial = async (
  constructionId,
  payload
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  const body = { ...payload };
  if (body.id == null && body.material_id != null) {
    body.id = body.material_id;
  }
  delete body.material_id;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/optional-materials`,
    {
      method: "POST",
      headers,
      body,
    }
  );
};

/**
 * PUT /admin/constructions/{id}/optional-materials/{itemId}.
 * itemId = id записи construction_optional_materials.
 */
export const updateAdminConstructionOptionalMaterial = async (
  constructionId,
  itemId,
  payload
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  const body = { ...payload };
  if (body.id == null && body.material_id != null) {
    body.id = body.material_id;
  }
  delete body.material_id;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/optional-materials/${encodeURIComponent(itemId)}`,
    {
      method: "PUT",
      headers,
      body,
    }
  );
};

/**
 * DELETE /admin/constructions/{id}/optional-materials/{itemId}.
 * itemId = id записи construction_optional_materials.
 */
export const deleteAdminConstructionOptionalMaterial = async (
  constructionId,
  itemId
) => {
  const csrf = await getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return request(
    `/admin/constructions/${encodeURIComponent(constructionId)}/optional-materials/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
      headers,
    }
  );
};

/** Каталог materials с заданным usage (si / ac / vi). */
export const filterMaterialsByUsage = (materials, usage) => {
  if (!Array.isArray(materials)) return [];
  const target = String(usage || "").trim().toLowerCase();
  if (!target) return materials;
  return materials.filter(
    (mat) => String(mat?.usage || "").trim().toLowerCase() === target
  );
};

/** Каталог materials с usage === "si" (звукоизоляция). */
export const filterMaterialsByUsageSi = (materials) =>
  filterMaterialsByUsage(materials, "si");

/** Нормализует запись справочника GET /admin/images/types. */
export const normalizeImageType = (row) => {
  if (!row || typeof row !== "object") return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    ...row,
    id,
    code: row.code == null ? "" : String(row.code).trim(),
    name: row.name == null ? "" : String(row.name).trim(),
    description: row.description == null ? "" : String(row.description).trim(),
  };
};

/** Ответ POST /admin/images/upload. */
export const normalizeImageUpload = (row) => {
  if (!row || typeof row !== "object") return null;
  const fileName = row.file_name == null ? "" : String(row.file_name).trim();
  const url = row.url == null ? "" : String(row.url).trim();
  return {
    file_name: fileName,
    // Nested key → /api/v2/public/image/constr%2Fpreview%2F….jpg (не basename).
    url:
      resolveAdminPublicImageUrl({ file_name: fileName, url }) || url,
    mime_type: row.mime_type == null ? "" : String(row.mime_type).trim(),
    file_size: Number(row.file_size) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
  };
};

const fileNameFromImageUrl = (url) => {
  const s = String(url || "").trim();
  const marker = "/api/v2/public/image/";
  const index = s.indexOf(marker);
  if (index < 0) return "";
  let key = s.slice(index + marker.length).split("?")[0];
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(key);
      if (next === key) break;
      key = next;
    } catch {
      break;
    }
  }
  return key.replace(/^\/+/, "");
};

/** Элемент GET /admin/images и images[] публичных конструкций. */
export const normalizeEntityImage = (row) => {
  if (!row || typeof row !== "object") return null;
  const typeObj =
    row.type && typeof row.type === "object" && !Array.isArray(row.type)
      ? normalizeImageType(row.type)
      : null;
  const id = Number(row.id);
  const rawUrl = row.url == null ? "" : String(row.url).trim();
  const fileName =
    (row.file_name == null ? "" : String(row.file_name).trim()) ||
    fileNameFromImageUrl(rawUrl);
  const url =
    resolveAdminPublicImageUrl({ file_name: fileName, url: rawUrl }) || rawUrl;
  return {
    ...row,
    id: Number.isFinite(id) && id > 0 ? id : null,
    entity_type: row.entity_type == null ? "" : String(row.entity_type).trim(),
    entity_id: Number(row.entity_id) || 0,
    type: typeObj,
    image_type_id: Number(row.image_type_id ?? typeObj?.id) || 0,
    file_name: fileName,
    url,
    mime_type: row.mime_type == null ? "" : String(row.mime_type).trim(),
    file_size: Number(row.file_size) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    title: row.title == null ? "" : String(row.title).trim(),
    alt: row.alt == null ? "" : String(row.alt).trim(),
    sort_order: Number(row.sort_order) || 0,
    is_primary: Boolean(row.is_primary),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
};

const buildEntityImageUpsertBody = (payload) => ({
  entity_type: String(payload.entity_type || "").trim(),
  entity_id: Number(payload.entity_id) || 0,
  image_type_id: Number(payload.image_type_id) || 0,
  file_name: String(payload.file_name || "").trim(),
  mime_type: String(payload.mime_type || "").trim(),
  file_size: Number(payload.file_size) || 0,
  width: Number(payload.width) || 0,
  height: Number(payload.height) || 0,
  title: String(payload.title || "").trim(),
  alt: String(payload.alt || "").trim(),
  sort_order: Number(payload.sort_order) || 0,
  is_primary: Boolean(payload.is_primary),
});

export const IMAGE_TYPE_PREVIEW = "preview";
export const IMAGE_TYPE_CAD = "cad";

const CONSTRUCTION_IMAGE_TYPES = [
  { code: IMAGE_TYPE_PREVIEW, name: "Превью" },
  { code: IMAGE_TYPE_CAD, name: "Чертёж" },
];

/** GET /admin/images/types — справочник типов изображений. */
export const listAdminImageTypes = async () => {
  const body = await request("/admin/images/types");
  return unwrapList(body).map(normalizeImageType).filter(Boolean);
};

/** Создаёт preview/cad, если их ещё нет в справочнике. */
export const ensureConstructionImageTypes = async () => {
  let types = await listAdminImageTypes();
  for (const needed of CONSTRUCTION_IMAGE_TYPES) {
    if (types.some((row) => row.code === needed.code)) continue;
    try {
      await createAdminImageType({
        code: needed.code,
        name: needed.name,
        description: "",
      });
    } catch {
      // уже создан параллельно или нет прав — перечитаем список
    }
  }
  types = await listAdminImageTypes();
  return types.filter((row) =>
    CONSTRUCTION_IMAGE_TYPES.some((needed) => needed.code === row.code)
  );
};

const buildImageTypeUpsertBody = (payload) => ({
  code: String(payload.code || "").trim(),
  name: String(payload.name || "").trim(),
  description: String(payload.description || "").trim(),
});

/** POST /admin/images/types — создать тип. */
export const createAdminImageType = async (payload) => {
  const headers = await csrfHeaders();
  return request("/admin/images/types", {
    method: "POST",
    headers,
    body: buildImageTypeUpsertBody(payload),
  });
};

/** PUT /admin/images/types/{id} — обновить тип. */
export const updateAdminImageType = async (id, payload) => {
  const headers = await csrfHeaders();
  return request(`/admin/images/types/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers,
    body: buildImageTypeUpsertBody(payload),
  });
};

/** DELETE /admin/images/types/{id} — удалить тип. */
export const deleteAdminImageType = async (id) => {
  const headers = await csrfHeaders();
  return request(`/admin/images/types/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  });
};

/**
 * POST /admin/images/upload — бинарный файл в хранилище (без привязки к сущности).
 * @param {{ entity_type: string, image_type_code: string, entity_code?: string, file: File }} payload
 */
export const uploadAdminImage = async (payload) => {
  const headers = await csrfHeaders();
  const form = new FormData();
  form.append("entity_type", String(payload.entity_type || "").trim());
  form.append("image_type_code", String(payload.image_type_code || "").trim());
  const entityCode = String(payload.entity_code || "").trim();
  if (entityCode) form.append("entity_code", entityCode);
  form.append("file", payload.file);

  const body = await request("/admin/images/upload", {
    method: "POST",
    headers,
    body: form,
  });
  return normalizeImageUpload(unwrapData(body) ?? body);
};

/**
 * GET /admin/images?entity_type=&entity_id=
 * @param {string} entityType constr | material
 * @param {string|number} entityId
 */
export const listAdminEntityImages = async (entityType, entityId) => {
  const params = new URLSearchParams({
    entity_type: String(entityType || "").trim(),
    entity_id: String(entityId),
  });
  const body = await request(`/admin/images?${params}`);
  return unwrapList(body).map(normalizeEntityImage).filter(Boolean);
};

/**
 * POST /admin/images — привязать уже загруженный файл к сущности.
 * @param {object} payload AdminEntityImageUpsert
 */
export const createAdminEntityImage = async (payload) => {
  const headers = await csrfHeaders();
  const body = await request("/admin/images", {
    method: "POST",
    headers,
    body: buildEntityImageUpsertBody(payload),
  });
  return normalizeEntityImage(unwrapData(body) ?? body);
};

/**
 * PUT /admin/images/{id} — метаданные и привязка.
 * @param {string|number} id
 * @param {object} payload AdminEntityImageUpsert
 */
export const updateAdminEntityImage = async (id, payload) => {
  const headers = await csrfHeaders();
  const body = await request(`/admin/images/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers,
    body: buildEntityImageUpsertBody(payload),
  });
  return normalizeEntityImage(unwrapData(body) ?? body);
};

/**
 * DELETE /admin/images/{id} — снять привязку (файл в хранилище не трогает).
 * @param {string|number} id
 */
export const deleteAdminEntityImage = async (id) => {
  const headers = await csrfHeaders();
  return request(`/admin/images/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  });
};
