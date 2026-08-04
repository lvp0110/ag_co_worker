/**
 * Admin constructions/materials API (внешний сервис :3005).
 *
 *   GET /admin/materials
 *   GET /admin/constructions?type=&category=
 *   GET /admin/constructions/{id}/materials
 *     → { default_materials, replacement_groups: [{ materials }] }
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

/** Нормализует строку состава к полям для таблицы. */
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
 * GET /admin/constructions/{id}/materials → плоский список материалов состава.
 * Контракт ConstrTodo: { default_materials, replacement_groups }.
 */
export const unwrapConstructionMaterials = (body) => {
  const data = body?.data ?? body;
  if (Array.isArray(data)) return data.map((row) => normalizeCompositionRow(row));

  if (!data || typeof data !== "object") return [];

  const rows = [];

  const defaults = data.default_materials;
  if (Array.isArray(defaults)) {
    for (const row of defaults) {
      rows.push(normalizeCompositionRow(row));
    }
  }

  const groups = data.replacement_groups;
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (!group || typeof group !== "object") continue;
      const materials = Array.isArray(group.materials) ? group.materials : [];
      for (const row of materials) {
        rows.push(normalizeCompositionRow(row, group));
      }
    }
  }

  if (rows.length) return rows;

  // fallback на другие возможные ключи
  for (const key of ["materials", "items", "composition", "main"]) {
    if (Array.isArray(data[key])) {
      return data[key].map((row) => normalizeCompositionRow(row));
    }
  }

  return [];
};

/** GET /admin/materials → массив материалов. */
export const listAdminMaterials = async () => {
  const body = await request("/admin/materials");
  return unwrapList(body);
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
 * GET /admin/constructions/{id}/materials — состав выбранной конструкции.
 * @param {string|number} id
 */
export const getAdminConstructionMaterials = async (id) => {
  const body = await request(
    `/admin/constructions/${encodeURIComponent(id)}/materials`
  );
  return unwrapConstructionMaterials(body);
};
