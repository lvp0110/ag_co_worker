import { request } from "./apiClient.js";

/** Админ-API (/api/admin/*). Доступно только пользователям с role === 'ADMIN'. */

// ─── Справочники ──────────────────────────────────────────────────────────────

/** GET /api/admin/countries — справочник стран [{ code, name }]. */
export const listCountries = () => request("/api/admin/countries", { method: "GET" });

// ─── Компании ─────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/companies — постраничный список с числом сотрудников.
 * Возвращает { items, total, page, limit, pages }.
 * `all: true` → весь список одной страницей (для дропдаунов).
 */
export const listCompanies = ({ page = 1, limit = 20, all = false } = {}) => {
  const qs = all
    ? new URLSearchParams({ all: "1" })
    : new URLSearchParams({ page: String(page), limit: String(limit) });
  return request(`/api/admin/companies?${qs}`, { method: "GET" });
};

/** POST /api/admin/companies — создать компанию. */
export const createCompany = (body) =>
  request("/api/admin/companies", { method: "POST", body });

/** PATCH /api/admin/companies/:id — обновить реквизиты. */
export const updateCompany = (id, body) =>
  request(`/api/admin/companies/${id}`, { method: "PATCH", body });

/** DELETE /api/admin/companies/:id — удалить (только если нет сотрудников). */
export const deleteCompany = (id) =>
  request(`/api/admin/companies/${id}`, { method: "DELETE" });

// ─── Пользователи ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users — постраничный список пользователей с компанией и ролью.
 * Возвращает { items, total, page, limit, pages }.
 */
export const listUsers = ({ page = 1, limit = 20 } = {}) => {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request(`/api/admin/users?${qs}`, { method: "GET" });
};

/** POST /api/admin/users — создать пользователя. */
export const createUser = (body) =>
  request("/api/admin/users", { method: "POST", body });

/** PATCH /api/admin/users/:id — обновить профиль/роль/компанию. */
export const updateUser = (id, body) =>
  request(`/api/admin/users/${id}`, { method: "PATCH", body });

/** PATCH /api/admin/users/:id/password — задать новый пароль пользователю. */
export const changeUserPassword = (id, password) =>
  request(`/api/admin/users/${id}/password`, { method: "PATCH", body: { password } });

/** PATCH /api/admin/users/:id/block — заблокировать/разблокировать пользователя. */
export const setUserBlocked = (id, isBlocked) =>
  request(`/api/admin/users/${id}/block`, {
    method: "PATCH",
    body: { is_blocked: isBlocked },
  });

/**
 * POST /api/uploads/logo — загрузка логотипа компании (multipart, поле `file`).
 * Возвращает `{ url }` — относительный путь `/uploads/<filename>`, который
 * кладётся в `logo_url` компании и сохраняется через createCompany/updateCompany.
 */
export const uploadLogo = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return request("/api/uploads/logo", { method: "POST", body: fd });
};
