import { useEffect, useMemo, useState } from "react";
import {
  createAdminImageType,
  deleteAdminImageType,
  getConstructionId,
  IMAGE_ENTITY_CONSTR,
  listAdminConstructions,
  listAdminImageTypes,
  updateAdminImageType,
} from "../services/adminApi.js";
import { formatRequestError } from "../services/apiClient.js";
import AdminEntityImages from "./AdminEntityImages.jsx";

const constructionLabel = (row) => {
  const name = String(row?.name || "").trim();
  const code = String(row?.code || "").trim();
  if (name && code && name !== code) return `${name} (${code})`;
  return name || code || `ID ${getConstructionId(row) ?? "?"}`;
};

const imageTypeLabel = (row) => {
  const name = String(row?.name || "").trim();
  const code = String(row?.code || "").trim();
  if (name && code && name !== code) return `${name} (${code})`;
  return name || code || `ID ${row?.id ?? "?"}`;
};

const emptyTypeDraft = () => ({ code: "", name: "", description: "" });

export default function AdminImagesPanel() {
  const [types, setTypes] = useState([]);
  const [constructions, setConstructions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [createDraft, setCreateDraft] = useState(emptyTypeDraft);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyTypeDraft);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [typeActionError, setTypeActionError] = useState(null);

  const [constructionQuery, setConstructionQuery] = useState("");
  const [selectedConstructionId, setSelectedConstructionId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [typeRows, constructionRows] = await Promise.all([
          listAdminImageTypes(),
          listAdminConstructions(),
        ]);
        if (cancelled) return;
        setTypes(typeRows);
        setConstructions(constructionRows);
      } catch (err) {
        if (!cancelled) {
          setTypes([]);
          setConstructions([]);
          setError(formatRequestError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const filteredConstructions = useMemo(() => {
    const q = constructionQuery.trim().toLowerCase();
    if (!q) return constructions;
    return constructions.filter((row) => {
      const hay = [
        row.code,
        row.name,
        String(getConstructionId(row) ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [constructions, constructionQuery]);

  useEffect(() => {
    if (
      selectedConstructionId &&
      filteredConstructions.some(
        (row) => String(getConstructionId(row)) === selectedConstructionId
      )
    ) {
      return;
    }
    const first = filteredConstructions[0];
    const id = getConstructionId(first);
    setSelectedConstructionId(id != null ? String(id) : "");
  }, [filteredConstructions, selectedConstructionId]);

  const selectedConstruction = useMemo(
    () =>
      constructions.find(
        (row) => String(getConstructionId(row)) === selectedConstructionId
      ) ?? null,
    [constructions, selectedConstructionId]
  );

  const handleCreateType = async (e) => {
    e.preventDefault();
    const code = createDraft.code.trim();
    const name = createDraft.name.trim();
    if (!code || !name) {
      setCreateError("Укажите код и название типа.");
      setCreateSuccess(null);
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    setTypeActionError(null);
    try {
      await createAdminImageType({
        code,
        name,
        description: createDraft.description.trim(),
      });
      setCreateDraft(emptyTypeDraft());
      setCreateSuccess(`Тип «${code}» создан.`);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setCreateError(formatRequestError(err));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditDraft({
      code: row.code || "",
      name: row.name || "",
      description: row.description || "",
    });
    setTypeActionError(null);
  };

  const handleSaveType = async (row) => {
    const id = Number(row.id);
    const code = editDraft.code.trim();
    const name = editDraft.name.trim();
    if (!Number.isFinite(id) || id <= 0) return;
    if (!code || !name) {
      setTypeActionError("Укажите код и название типа.");
      return;
    }
    setSavingId(id);
    setTypeActionError(null);
    try {
      await updateAdminImageType(id, {
        code,
        name,
        description: editDraft.description.trim(),
      });
      setEditingId(null);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setTypeActionError(formatRequestError(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteType = async (row) => {
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) return;
    const label = imageTypeLabel(row);
    if (!window.confirm(`Удалить тип «${label}»?`)) return;
    setDeletingId(id);
    setTypeActionError(null);
    try {
      await deleteAdminImageType(id);
      if (editingId === id) setEditingId(null);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setTypeActionError(formatRequestError(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <section className="admin-page__card">
        <div className="admin-page__card-head">
          <h2 className="admin-page__card-title">
            Типы изображений
            <span className="admin-page__count">
              {loading ? "…" : types.length}
            </span>
          </h2>
        </div>

        <form className="admin-page__create-form" onSubmit={handleCreateType}>
          <h3 className="admin-page__create-title">Новый тип</h3>
          <div className="admin-page__create-fields">
            <label className="admin-page__field">
              <span className="admin-page__field-label">Код</span>
              <input
                className="admin-page__input"
                value={createDraft.code}
                onChange={(e) =>
                  setCreateDraft((prev) => ({ ...prev, code: e.target.value }))
                }
                placeholder="Например icon"
                disabled={creating || loading}
                required
                autoComplete="off"
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Название</span>
              <input
                className="admin-page__input"
                value={createDraft.name}
                onChange={(e) =>
                  setCreateDraft((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Иконка"
                disabled={creating || loading}
                required
                autoComplete="off"
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Описание</span>
              <input
                className="admin-page__input"
                value={createDraft.description}
                onChange={(e) =>
                  setCreateDraft((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Необязательно"
                disabled={creating || loading}
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              className="admin-page__btn admin-page__btn--inline admin-page__create-submit"
              disabled={creating || loading}
            >
              {creating ? "Создание…" : "Создать тип"}
            </button>
          </div>
          {createError ? (
            <div className="admin-page__error" role="alert">
              <p className="admin-page__error-title">
                Не удалось создать тип
              </p>
              <pre className="admin-page__error-body">{createError}</pre>
            </div>
          ) : null}
          {createSuccess ? (
            <p className="admin-page__success" role="status">
              {createSuccess}
            </p>
          ) : null}
        </form>

        {error ? (
          <div className="admin-page__error" role="alert">
            <p className="admin-page__error-title">
              Не удалось загрузить справочник
            </p>
            <pre className="admin-page__error-body">{error}</pre>
          </div>
        ) : null}

        {typeActionError ? (
          <div className="admin-page__error" role="alert">
            <p className="admin-page__error-title">Ошибка типа</p>
            <pre className="admin-page__error-body">{typeActionError}</pre>
          </div>
        ) : null}

        {loading ? (
          <p className="admin-page__empty">Загрузка типов…</p>
        ) : !types.length ? (
          <p className="admin-page__empty">
            Типов пока нет. Создайте первый тип — без него загрузить картинку
            нельзя.
          </p>
        ) : (
          <div className="admin-page__table-wrap">
            <table className="admin-page__table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Название</th>
                  <th>Описание</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {types.map((row) => {
                  const isEditing = editingId === row.id;
                  const busy =
                    savingId === row.id || deletingId === row.id;
                  return (
                    <tr key={row.id}>
                      <td>
                        {isEditing ? (
                          <input
                            className="admin-page__input"
                            value={editDraft.code}
                            onChange={(e) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                code: e.target.value,
                              }))
                            }
                            disabled={busy}
                            autoComplete="off"
                          />
                        ) : (
                          row.code
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="admin-page__input"
                            value={editDraft.name}
                            onChange={(e) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            disabled={busy}
                            autoComplete="off"
                          />
                        ) : (
                          row.name
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="admin-page__input"
                            value={editDraft.description}
                            onChange={(e) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                description: e.target.value,
                              }))
                            }
                            disabled={busy}
                            autoComplete="off"
                          />
                        ) : (
                          row.description || "—"
                        )}
                      </td>
                      <td>
                        <div className="admin-page__region-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="admin-page__btn admin-page__btn--inline"
                                disabled={busy}
                                onClick={() => handleSaveType(row)}
                              >
                                {savingId === row.id ? "…" : "Сохранить"}
                              </button>
                              <button
                                type="button"
                                className="admin-page__btn admin-page__btn--inline"
                                disabled={busy}
                                onClick={() => setEditingId(null)}
                              >
                                Отмена
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="admin-page__btn admin-page__btn--inline"
                                disabled={busy}
                                onClick={() => startEdit(row)}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="admin-page__btn admin-page__btn--inline admin-page__btn--danger"
                                disabled={busy}
                                onClick={() => handleDeleteType(row)}
                              >
                                {deletingId === row.id ? "…" : "Удалить"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-page__card">
        <div className="admin-page__card-head">
          <h2 className="admin-page__card-title">Привязка к конструкции</h2>
        </div>

        <div className="admin-page__create-fields admin-page__create-fields--wide">
          <label className="admin-page__field">
            <span className="admin-page__field-label">Поиск конструкции</span>
            <input
              type="search"
              className="admin-page__input"
              placeholder="Код или название…"
              value={constructionQuery}
              onChange={(e) => setConstructionQuery(e.target.value)}
              disabled={loading}
            />
          </label>
          <label className="admin-page__field">
            <span className="admin-page__field-label">Конструкция</span>
            <select
              className="admin-page__select admin-page__select--full"
              value={selectedConstructionId}
              onChange={(e) => setSelectedConstructionId(e.target.value)}
              disabled={loading || !filteredConstructions.length}
            >
              {!filteredConstructions.length ? (
                <option value="">Нет конструкций</option>
              ) : (
                filteredConstructions.map((row) => {
                  const id = getConstructionId(row);
                  return (
                    <option key={String(id)} value={String(id)}>
                      {constructionLabel(row)}
                    </option>
                  );
                })
              )}
            </select>
          </label>
        </div>

        {selectedConstruction ? (
          <AdminEntityImages
            entityType={IMAGE_ENTITY_CONSTR}
            entityId={getConstructionId(selectedConstruction)}
            entityCode={selectedConstruction.code || ""}
            imageTypes={types}
            heading="Загрузка и привязка"
          />
        ) : (
          <p className="admin-page__empty admin-page__empty--inline">
            Выберите конструкцию, чтобы загрузить файл и привязать его.
          </p>
        )}
      </section>
    </>
  );
}
