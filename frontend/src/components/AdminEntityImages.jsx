import { useEffect, useMemo, useState } from "react";
import {
  IMAGE_ENTITY_CONSTR,
  createAdminEntityImage,
  deleteAdminEntityImage,
  listAdminEntityImages,
  listAdminImageTypes,
  updateAdminEntityImage,
  uploadAdminImage,
} from "../services/adminApi.js";
import { formatRequestError } from "../services/apiClient.js";

const imageTypeLabel = (type) => {
  if (!type) return "";
  const name = String(type.name || "").trim();
  const code = String(type.code || "").trim();
  if (name && code && name !== code) return `${name} (${code})`;
  return name || code || String(type.id || "");
};

const nextSortOrder = (images) => {
  const max = (images || []).reduce((acc, row) => {
    const n = Number(row.sort_order);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return max + 10;
};

const sortImages = (images) =>
  [...(images || [])].sort((a, b) => {
    if (Boolean(b.is_primary) !== Boolean(a.is_primary)) {
      return b.is_primary ? 1 : -1;
    }
    const sa = Number(a.sort_order) || 0;
    const sb = Number(b.sort_order) || 0;
    if (sa !== sb) return sa - sb;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });

const displayUrl = (url) => {
  const s = String(url || "").trim();
  if (!s) return "";
  const path = s.split("?")[0];
  if (/\/api\/v2\/public\/image\/?$/i.test(path)) return "";
  return s;
};

export default function AdminEntityImages({
  entityType,
  entityId,
  entityCode = "",
  imageTypes = null,
  heading = "Изображения",
}) {
  const [typesLocal, setTypesLocal] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeCode, setTypeCode] = useState("");
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(null);
  const [binding, setBinding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const numericId = Number(entityId);
  const hasEntity = Number.isFinite(numericId) && numericId > 0;

  const types = Array.isArray(imageTypes) ? imageTypes : typesLocal;

  const selectedType = useMemo(
    () => types.find((item) => item.code === typeCode) || types[0] || null,
    [types, typeCode]
  );

  const reload = async () => {
    if (!hasEntity) {
      setImages([]);
      return;
    }
    const rows = await listAdminEntityImages(entityType, numericId);
    setImages(sortImages(rows));
  };

  useEffect(() => {
    if (selectedType?.code && selectedType.code !== typeCode) {
      setTypeCode(selectedType.code);
    }
  }, [selectedType, typeCode]);

  useEffect(() => {
    if (Array.isArray(imageTypes)) {
      setTypesLocal([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const typeRows = await listAdminImageTypes();
        if (!cancelled) setTypesLocal(typeRows);
      } catch (err) {
        if (!cancelled) setError(formatRequestError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageTypes]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setActionError(null);
      setPending(null);
      setEditingId(null);
      try {
        if (hasEntity) {
          const rows = await listAdminEntityImages(entityType, numericId);
          if (cancelled) return;
          setImages(sortImages(rows));
        } else {
          setImages([]);
        }
      } catch (err) {
        if (!cancelled) setError(formatRequestError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType, numericId, hasEntity]);

  const resetFile = () => {
    setFile(null);
    setFileKey((n) => n + 1);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasEntity || !file || !selectedType) return;
    setUploading(true);
    setActionError(null);
    try {
      const uploaded = await uploadAdminImage({
        entity_type: entityType,
        image_type_code: selectedType.code,
        entity_code: entityCode,
        file,
      });
      if (!uploaded?.file_name) {
        throw new Error("Upload не вернул file_name.");
      }
      const typeName = selectedType.name || selectedType.code;
      const codeLabel = String(entityCode || "").trim();
      setPending({
        ...uploaded,
        image_type_id: selectedType.id,
        image_type_code: selectedType.code,
        title: codeLabel ? `${codeLabel} ${typeName}` : typeName,
        alt: codeLabel ? `${typeName} ${codeLabel}` : typeName,
        sort_order: nextSortOrder(images),
        is_primary: images.length === 0,
      });
      resetFile();
    } catch (err) {
      setActionError(formatRequestError(err));
    } finally {
      setUploading(false);
    }
  };

  const handleBind = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pending || !hasEntity) return;
    setBinding(true);
    setActionError(null);
    try {
      await createAdminEntityImage({
        entity_type: entityType,
        entity_id: numericId,
        image_type_id: pending.image_type_id,
        file_name: pending.file_name,
        mime_type: pending.mime_type,
        file_size: pending.file_size,
        width: pending.width,
        height: pending.height,
        title: pending.title,
        alt: pending.alt,
        sort_order: pending.sort_order,
        is_primary: pending.is_primary,
      });
      setPending(null);
      await reload();
    } catch (err) {
      setActionError(formatRequestError(err));
    } finally {
      setBinding(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditForm({
      image_type_id: String(row.image_type_id || row.type?.id || ""),
      title: row.title || "",
      alt: row.alt || "",
      sort_order: String(row.sort_order ?? 0),
      is_primary: Boolean(row.is_primary),
      file_name: row.file_name || "",
      mime_type: row.mime_type || "",
      file_size: row.file_size || 0,
      width: row.width || 0,
      height: row.height || 0,
    });
    setActionError(null);
  };

  const handleSaveEdit = async (e, row) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editForm || !row?.id) return;
    setSavingId(row.id);
    setActionError(null);
    try {
      await updateAdminEntityImage(row.id, {
        entity_type: entityType,
        entity_id: numericId,
        image_type_id: Number(editForm.image_type_id),
        file_name: editForm.file_name || row.file_name,
        mime_type: editForm.mime_type,
        file_size: editForm.file_size,
        width: editForm.width,
        height: editForm.height,
        title: editForm.title,
        alt: editForm.alt,
        sort_order: Number(editForm.sort_order) || 0,
        is_primary: Boolean(editForm.is_primary),
      });
      setEditingId(null);
      setEditForm(null);
      await reload();
    } catch (err) {
      setActionError(formatRequestError(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row) => {
    if (!row?.id) return;
    setDeletingId(row.id);
    setActionError(null);
    try {
      await deleteAdminEntityImage(row.id);
      if (editingId === row.id) {
        setEditingId(null);
        setEditForm(null);
      }
      await reload();
    } catch (err) {
      setActionError(formatRequestError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const entityKind =
    entityType === IMAGE_ENTITY_CONSTR ? "конструкции" : "материала";

  return (
    <section className="admin-page__images" onClick={(e) => e.stopPropagation()}>
      <div className="admin-page__composition-head admin-page__composition-head--spaced">
        <h3 className="admin-page__composition-title">
          {heading}
          <span className="admin-page__count">{images.length}</span>
        </h3>
      </div>

      {!hasEntity ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Сначала сохраните {entityKind}, затем можно загрузить картинки.
        </p>
      ) : null}

      {error ? (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">
            Не удалось загрузить изображения
          </p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      ) : null}

      {actionError ? (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Ошибка</p>
          <pre className="admin-page__error-body">{actionError}</pre>
        </div>
      ) : null}

      {hasEntity && !loading && !types.length ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Нет типов изображений. Создайте тип в разделе «Изображения», затем
          загрузите файл.
        </p>
      ) : null}

      {loading ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Загрузка изображений…
        </p>
      ) : (
        <>
          <form className="admin-page__images-upload" onSubmit={handleUpload}>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Тип картинки</span>
              <select
                className="admin-page__select admin-page__select--full"
                value={selectedType?.code || ""}
                disabled={uploading || binding || !types.length}
                onChange={(e) => {
                  setTypeCode(e.target.value);
                  setPending(null);
                }}
                required
              >
                {!types.length ? (
                  <option value="">Нет типов в справочнике</option>
                ) : (
                  types.map((item) => (
                    <option key={item.id} value={item.code}>
                      {imageTypeLabel(item)}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Файл</span>
              <input
                key={fileKey}
                className="admin-page__input"
                type="file"
                accept="image/*"
                disabled={uploading || binding || !hasEntity || !types.length}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setPending(null);
                }}
                required={!pending}
              />
            </label>
            <div className="admin-page__field admin-page__field--action">
              <button
                type="submit"
                className="admin-page__btn admin-page__btn--inline"
                disabled={
                  uploading || binding || !file || !selectedType || !hasEntity
                }
              >
                {uploading ? "Загрузка…" : "Загрузить файл"}
              </button>
            </div>
          </form>

          {pending ? (
            <form className="admin-page__images-pending" onSubmit={handleBind}>
              <p className="admin-page__images-pending-title">
                Файл загружен — проверьте превью и привяжите к {entityKind}
              </p>
              {displayUrl(pending.url) ? (
                <img
                  className="admin-page__images-preview"
                  src={displayUrl(pending.url)}
                  alt={pending.alt || pending.title || "Превью"}
                />
              ) : null}
              <p className="admin-page__images-meta">
                {pending.width}×{pending.height}
                {pending.mime_type ? ` · ${pending.mime_type}` : ""}
                {pending.file_size
                  ? ` · ${Math.round(pending.file_size / 1024)} КБ`
                  : ""}
              </p>
              <div className="admin-page__create-fields">
                <label className="admin-page__field">
                  <span className="admin-page__field-label">Заголовок</span>
                  <input
                    className="admin-page__input"
                    value={pending.title}
                    disabled={binding}
                    onChange={(e) =>
                      setPending((prev) =>
                        prev ? { ...prev, title: e.target.value } : prev
                      )
                    }
                  />
                </label>
                <label className="admin-page__field">
                  <span className="admin-page__field-label">Alt</span>
                  <input
                    className="admin-page__input"
                    value={pending.alt}
                    disabled={binding}
                    onChange={(e) =>
                      setPending((prev) =>
                        prev ? { ...prev, alt: e.target.value } : prev
                      )
                    }
                  />
                </label>
                <label className="admin-page__field">
                  <span className="admin-page__field-label">Порядок</span>
                  <input
                    className="admin-page__input"
                    type="number"
                    step="1"
                    value={pending.sort_order}
                    disabled={binding}
                    onChange={(e) =>
                      setPending((prev) =>
                        prev
                          ? { ...prev, sort_order: Number(e.target.value) || 0 }
                          : prev
                      )
                    }
                  />
                </label>
                <label className="admin-page__field admin-page__field--checkbox">
                  <span className="admin-page__field-label">
                    <input
                      type="checkbox"
                      checked={pending.is_primary}
                      disabled={binding}
                      onChange={(e) =>
                        setPending((prev) =>
                          prev
                            ? { ...prev, is_primary: e.target.checked }
                            : prev
                        )
                      }
                    />{" "}
                    Основная картинка
                  </span>
                </label>
              </div>
              <div className="admin-page__meta-actions">
                <button
                  type="submit"
                  className="admin-page__btn admin-page__btn--inline"
                  disabled={binding}
                >
                  {binding ? "Привязка…" : "Привязать"}
                </button>
                <button
                  type="button"
                  className="admin-page__btn admin-page__btn--inline"
                  disabled={binding}
                  onClick={() => setPending(null)}
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : null}

          {images.length ? (
            <ul className="admin-page__images-list">
              {images.map((row) => {
                const preview = displayUrl(row.url);
                const editing = editingId === row.id;
                return (
                  <li key={row.id} className="admin-page__images-item">
                    {preview ? (
                      <img
                        className="admin-page__images-thumb"
                        src={preview}
                        alt={row.alt || row.title || ""}
                      />
                    ) : (
                      <div className="admin-page__images-thumb admin-page__images-thumb--empty">
                        нет url
                      </div>
                    )}
                    <div className="admin-page__images-item-body">
                      <div className="admin-page__images-item-head">
                        <strong>{imageTypeLabel(row.type) || "тип?"}</strong>
                        {row.is_primary ? (
                          <span className="admin-page__images-badge">
                            основная
                          </span>
                        ) : null}
                      </div>
                      <p className="admin-page__images-item-title">
                        {row.title || "без заголовка"}
                      </p>
                      <p className="admin-page__images-meta">
                        {row.width}×{row.height}
                        {row.sort_order != null
                          ? ` · порядок ${row.sort_order}`
                          : ""}
                      </p>

                      {editing && editForm ? (
                        <form
                          className="admin-page__images-edit"
                          onSubmit={(e) => handleSaveEdit(e, row)}
                        >
                          <label className="admin-page__field">
                            <span className="admin-page__field-label">Тип</span>
                            <select
                              className="admin-page__select admin-page__select--full"
                              value={editForm.image_type_id}
                              disabled={savingId === row.id}
                              onChange={(e) =>
                                setEditForm((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        image_type_id: e.target.value,
                                      }
                                    : prev
                                )
                              }
                            >
                              {types.map((item) => (
                                <option key={item.id} value={String(item.id)}>
                                  {imageTypeLabel(item)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="admin-page__field">
                            <span className="admin-page__field-label">
                              Заголовок
                            </span>
                            <input
                              className="admin-page__input"
                              value={editForm.title}
                              disabled={savingId === row.id}
                              onChange={(e) =>
                                setEditForm((prev) =>
                                  prev
                                    ? { ...prev, title: e.target.value }
                                    : prev
                                )
                              }
                            />
                          </label>
                          <label className="admin-page__field">
                            <span className="admin-page__field-label">Alt</span>
                            <input
                              className="admin-page__input"
                              value={editForm.alt}
                              disabled={savingId === row.id}
                              onChange={(e) =>
                                setEditForm((prev) =>
                                  prev
                                    ? { ...prev, alt: e.target.value }
                                    : prev
                                )
                              }
                            />
                          </label>
                          <label className="admin-page__field">
                            <span className="admin-page__field-label">
                              Порядок
                            </span>
                            <input
                              className="admin-page__input"
                              type="number"
                              step="1"
                              value={editForm.sort_order}
                              disabled={savingId === row.id}
                              onChange={(e) =>
                                setEditForm((prev) =>
                                  prev
                                    ? { ...prev, sort_order: e.target.value }
                                    : prev
                                )
                              }
                            />
                          </label>
                          <label className="admin-page__field admin-page__field--checkbox">
                            <span className="admin-page__field-label">
                              <input
                                type="checkbox"
                                checked={editForm.is_primary}
                                disabled={savingId === row.id}
                                onChange={(e) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          is_primary: e.target.checked,
                                        }
                                      : prev
                                  )
                                }
                              />{" "}
                              Основная
                            </span>
                          </label>
                          <div className="admin-page__meta-actions">
                            <button
                              type="submit"
                              className="admin-page__btn admin-page__btn--inline"
                              disabled={savingId === row.id}
                            >
                              {savingId === row.id ? "Сохранение…" : "Сохранить"}
                            </button>
                            <button
                              type="button"
                              className="admin-page__btn admin-page__btn--inline"
                              disabled={savingId === row.id}
                              onClick={() => {
                                setEditingId(null);
                                setEditForm(null);
                              }}
                            >
                              Отмена
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="admin-page__meta-actions">
                          <button
                            type="button"
                            className="admin-page__btn admin-page__btn--inline"
                            disabled={deletingId != null}
                            onClick={() => startEdit(row)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="admin-page__btn admin-page__btn--inline admin-page__btn--danger"
                            disabled={deletingId != null}
                            onClick={() => handleDelete(row)}
                          >
                            {deletingId === row.id ? "Удаление…" : "Удалить"}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="admin-page__empty admin-page__empty--inline">
              Нет привязанных изображений.
            </p>
          )}
        </>
      )}
    </section>
  );
}
