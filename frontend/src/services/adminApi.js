/**
 * Admin constructions/materials API (внешний сервис :3005).
 *
 *   GET /admin/materials
 *   GET /admin/materials/{code}
 *   GET /admin/constructions?type=&category=
 *   GET /admin/constructions/{id}
 *     → { construction, composition: { default_materials, replacement_groups, optional_materials } }
 *   POST /admin/constructions/{id}/materials
 *     → body: { id, weight, sort_order, is_default, replacement_group, replacement_material_type_id }
 *   POST /admin/constructions/{id}/optional-materials
 *     → body: { id, weight, sort_order }  // доп. материал (не база и не замена)
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

/** GET /admin/materials → массив материалов. */
export const listAdminMaterials = async () => {
  const body = await request("/admin/materials");
  return unwrapList(body);
};

/**
 * GET /admin/materials/{code} — карточка материала.
 * @param {string} code
 */
export const getAdminMaterialByCode = async (code) => {
  const body = await request(
    `/admin/materials/${encodeURIComponent(code)}`
  );
  const data = body?.data ?? body;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data;
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
 * POST /admin/constructions/{id}/materials — добавить в группу замены.
 * id = materials.id из GET /admin/materials для выбранного артикула (code).
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

/** Каталог materials с usage === "si" (звукоизоляция). */
export const filterMaterialsByUsageSi = (materials) => {
  if (!Array.isArray(materials)) return [];
  return materials.filter(
    (mat) => String(mat?.usage || "").trim().toLowerCase() === "si"
  );
};
