/**
 * Admin constructions/materials API (внешний сервис :3005).
 *
 *   GET /admin/materials
 *   GET /admin/materials/{code}
 *   GET /admin/constructions?type=&category=
 *   GET /admin/constructions/{id}
 *     → конструкция + composition { default_materials, replacement_groups }
 *   GET /admin/constructions/{id}/materials
 *
 * Same-origin через Vite / frontend server.js proxy → AUTH_SERVICE_URL.
 * Нужна cookie access_token (роль admin на стороне сервиса).
 */

import { request } from "./apiClient.js";

/** Достаёт массив из типичного конверта { code, data }. */
const unwrapList = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.items)) return body.items;
  return [];
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

/** Нормализует строку состава к полям для таблицы / селекта. */
const normalizeCompositionRow = (row, groupMeta = null) => {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    material_id: row.material_id ?? null,
    code: row.material_code ?? row.code ?? null,
    name: row.material_name ?? row.name ?? null,
    units: row.units ?? null,
    weight: row.weight ?? null,
    sort_order: row.sort_order ?? null,
    is_default: row.is_default ?? null,
    replacement_group:
      row.replacement_group ?? groupMeta?.group ?? null,
    replacement_material_type:
      row.replacement_material_type ??
      groupMeta?.replacement_material_type ??
      null,
    replacement_material_type_name:
      row.replacement_material_type_name ??
      groupMeta?.replacement_material_type_name ??
      null,
  };
};

/**
 * Разбирает composition: default_materials + replacement_groups.
 * @returns {{ defaultMaterials: object[], replacementGroups: object[] }}
 */
export const unwrapConstructionComposition = (body) => {
  const data = body?.data ?? body;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { defaultMaterials: [], replacementGroups: [] };
  }

  const defaultMaterials = Array.isArray(data.default_materials)
    ? data.default_materials.map((row) => normalizeCompositionRow(row))
    : [];

  const replacementGroups = [];
  if (Array.isArray(data.replacement_groups)) {
    for (const group of data.replacement_groups) {
      if (!group || typeof group !== "object") continue;
      const materials = Array.isArray(group.materials)
        ? group.materials.map((row) => normalizeCompositionRow(row, group))
        : [];
      replacementGroups.push({
        group: group.group ?? null,
        replacement_material_type_id:
          group.replacement_material_type_id ?? null,
        replacement_material_type: group.replacement_material_type ?? null,
        replacement_material_type_name:
          group.replacement_material_type_name ?? null,
        materials,
      });
    }
  }

  return { defaultMaterials, replacementGroups };
};

/**
 * Подставляет name/code из каталога /admin/materials по артикулу
 * (materials.code ↔ composition.material_code). material_id состава не трогает.
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
  const raw = row.code ?? row.material_code ?? null;
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
  return unwrapList(body);
};

/**
 * GET /admin/constructions/{id} — карточка конструкции + composition.
 * @param {string|number} id
 * @returns {Promise<{ detail: object, defaultMaterials: object[], replacementGroups: object[] }|null>}
 */
export const getAdminConstructionById = async (id) => {
  const body = await request(
    `/admin/constructions/${encodeURIComponent(id)}`
  );
  const data = body?.data ?? body;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const { composition, ...detail } = data;
  const { defaultMaterials, replacementGroups } =
    unwrapConstructionComposition(
      composition != null ? { data: composition } : body
    );

  return { detail, defaultMaterials, replacementGroups };
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
