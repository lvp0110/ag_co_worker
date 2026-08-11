/**
 * Admin constructions/materials API (внешний сервис :3005).
 *
 *   GET /admin/materials
 *     → AdminMaterial[] (без prices; prices только в карточке)
 *   GET /admin/materials/{code}
 *     → AdminMaterialDetails { ...AdminMaterial, prices: MaterialPrice[] }
 *   GET /commerce/price-list/{regionCode}
 *     → MaterialPriceListItem[] { code, product_name, units, price, m2, currency_code }
 *   GET /api/v2/data/unmatched
 *     → UnmatchedMaterial[] { id, code, name, units, prices, created_at }
 *   DELETE /api/v2/data/unmatched/{code}
 *   POST /admin/materials
 *     → body: AdminMaterialUpsert
 *   PUT /admin/materials/{code}
 *     → body: AdminMaterialUpsert
 *   DELETE /admin/materials/{code}?replacement_code=
 *     → если материал в конструкциях — обязателен replacement_code того же type
 *   POST /admin/commerce/materials/{materialID}/prices
 *     → body: { price_region_id, price, m2, currency_code }
 *   GET /admin/constructions?type=&category=
 *   POST /admin/constructions
 *     → body: { code, name, type_id, category_id }
 *   PUT /admin/constructions/{id}
 *     → body: { code, name, type_id, category_id }
 *   DELETE /admin/constructions/{id}
 *   GET /admin/constructions/{id}
 *     → { construction, composition: { default_materials, replacement_groups, optional_materials } }
 *   POST /admin/constructions/{id}/materials
 *     → body: { id, weight, sort_order, is_default, replacement_group, replacement_material_type_id }
 *   PUT /admin/constructions/{id}/materials/{itemId}
 *     → body: { id, weight, sort_order, is_default, replacement_group, replacement_material_type_id }
 *   DELETE /admin/constructions/{id}/materials/{itemId}
 *   POST /admin/constructions/{id}/optional-materials
 *     → body: { id, weight, sort_order }  // доп. материал (не база и не замена)
 *   DELETE /admin/constructions/{id}/optional-materials/{itemId}
 *
 * Same-origin через Vite / frontend server.js proxy → AUTH_SERVICE_URL.
 * Нужна cookie access_token (роль admin на стороне сервиса).
 */

import { request } from "./apiClient.js";
import { getCsrfToken } from "./authApi.js";

/** Достаёт массив из типичного конверта { code, data }. */
const unwrapList = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.items)) return body.items;
  return [];
};

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

/** Нормализует материал из GET /admin/materials. */
export const normalizeAdminMaterial = (row) => {
  if (!row || typeof row !== "object") return row;
  const code = row.code == null ? "" : String(row.code).trim();
  return {
    ...row,
    id: row.id ?? null,
    code,
    name: row.name == null ? "" : String(row.name).trim(),
    product_name:
      row.product_name == null ? "" : String(row.product_name).trim(),
    units: row.units == null ? "" : String(row.units).trim(),
    type: row.type == null ? "" : String(row.type).trim(),
    usage: row.usage == null ? "" : String(row.usage).trim(),
    visible: Boolean(row.visible),
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

const buildAdminMaterialUpsertBody = (payload) => ({
  code: String(payload.code || "").trim(),
  name: String(payload.name || "").trim(),
  product_name: String(payload.product_name || "").trim(),
  length: Number(payload.length) || 0,
  width: Number(payload.width) || 0,
  height: Number(payload.height) || 0,
  units: String(payload.units || "").trim(),
  type: String(payload.type || "").trim(),
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
 * Уникальные типы конструкций из списка (для селекта при создании).
 * @param {object[]} rows
 * @returns {{ id: number, code: string, name: string }[]}
 */
export const collectConstructionTypes = (rows) => {
  const byId = new Map();
  for (const row of rows || []) {
    const id = Number(row?.type_id ?? row?.type?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (byId.has(id)) continue;
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
 * Типы материалов для групп замены (materials_types из seed ConstrTodo).
 * id из живых групп перекрывает seed при совпадении code.
 */
export const KNOWN_REPLACEMENT_MATERIAL_TYPES = [
  { id: 1, code: "tape", name: "лента" },
  { id: 2, code: "roll", name: "рулон" },
  { id: 3, code: "stud", name: "стойка" },
  { id: 4, code: "runner", name: "направляющий" },
  { id: 5, code: "panel", name: "панель" },
  { id: 6, code: "filling", name: "заполнение" },
  { id: 7, code: "screw", name: "крепеж" },
  { id: 8, code: "hunger", name: "подвес" },
  { id: 9, code: "thing", name: "штучный" },
];

/**
 * Список типов для UI: seed + типы из уже загруженных групп замены.
 * @param {object[]} replacementGroups
 * @returns {{ id: number, code: string, name: string }[]}
 */
export const collectReplacementMaterialTypes = (replacementGroups) => {
  const byCode = new Map(
    KNOWN_REPLACEMENT_MATERIAL_TYPES.map((t) => [t.code, { ...t }])
  );
  for (const group of replacementGroups || []) {
    const id = Number(getReplacementMaterialTypeId(group));
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
    if (!code || !Number.isFinite(id) || id <= 0) continue;
    byCode.set(code, { id, code, name: name || code });
  }
  return [...byCode.values()].sort((a, b) =>
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
