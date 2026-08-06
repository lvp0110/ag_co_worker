import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  addAdminConstructionMaterial,
  addAdminConstructionOptionalMaterial,
  enrichCompositionFromMaterialsCatalog,
  filterMaterialsByUsageSi,
  getAdminConstructionById,
  getAdminMaterialByCode,
  getConstructionId,
  getMaterialCode,
  getReplacementMaterialTypeId,
  listAdminConstructions,
  listAdminMaterials,
} from "../services/adminApi.js";
import { formatRequestError } from "../services/apiClient.js";
import "./AdminPage.css";

const MATERIAL_COLUMNS = [
  { key: "code", label: "Код" },
  { key: "name", label: "Название" },
  { key: "type", label: "Тип" },
  { key: "units", label: "Ед." },
  {
    key: "visible",
    label: "Видим",
    render: (row) => cell(row.visible),
  },
];

const MATERIAL_DETAIL_FIELDS = [
  { key: "id", label: "ID" },
  { key: "code", label: "Код" },
  { key: "name", label: "Название" },
  { key: "type", label: "Тип" },
  { key: "units", label: "Ед. изм." },
  { key: "length", label: "Длина" },
  { key: "width", label: "Ширина" },
  { key: "height", label: "Высота" },
  { key: "unit_pack", label: "В упаковке" },
  { key: "info_pack", label: "Инфо упак." },
  { key: "ratio_square", label: "Ratio м²" },
  { key: "weight", label: "Вес" },
  { key: "volume", label: "Объём" },
  { key: "load_index", label: "Нагрузка" },
  { key: "order_list", label: "Порядок" },
  { key: "visible", label: "Видим" },
  { key: "usage", label: "Применение" },
  { key: "description", label: "Описание" },
  { key: "specification", label: "Спецификация" },
  { key: "img", label: "Изображение" },
  { key: "scheme", label: "Схема" },
];

const CONSTRUCTION_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "code", label: "Код" },
  { key: "name", label: "Название" },
  {
    key: "type",
    label: "Тип",
    render: (row) =>
      cell(
        row.type_name ??
          row.type_code ??
          row.type?.name ??
          row.type?.code ??
          row.type_id ??
          row.type?.id
      ),
  },
  {
    key: "category",
    label: "Категория",
    render: (row) =>
      cell(
        row.category_name ??
          row.category_code ??
          row.category?.name ??
          row.category?.code ??
          row.category_id ??
          row.category?.id
      ),
  },
];

const CONSTRUCTION_DETAIL_FIELDS = [
  { key: "id", label: "ID" },
  { key: "code", label: "Код" },
  { key: "name", label: "Название" },
  { key: "type_id", label: "ID типа" },
  { key: "type_code", label: "Код типа" },
  { key: "type_name", label: "Тип" },
  { key: "category_id", label: "ID категории" },
  { key: "category_code", label: "Код категории" },
  { key: "category_name", label: "Категория" },
];

const CONSTRUCTION_CATEGORY_FILTERS = [
  { code: "sound", label: "Звукоизоляция" },
  { code: "acoustic", label: "Акустика" },
];

const COMPOSITION_COLUMNS = [
  { key: "sort_order", label: "№" },
  { key: "material_id", label: "ID мат." },
  { key: "code", label: "Код" },
  { key: "name", label: "Название" },
  { key: "weight", label: "Вес" },
];

function pickDefaultMaterialId(materials) {
  if (!Array.isArray(materials) || !materials.length) return "";
  const preferred = materials.find((m) => m.is_default);
  const chosen = preferred ?? materials[0];
  const article = String(chosen.code || chosen.material_code || "").trim();
  return article || String(chosen.material_id ?? chosen.id ?? "");
}

function materialOptionLabel(mat) {
  const code = mat.code || mat.material_code || "";
  const name = mat.name || mat.material_name || "";
  if (code && name) return `${code} — ${name}`;
  return code || name || `ID ${mat.material_id ?? mat.id ?? "?"}`;
}

function groupTypeLabel(group) {
  const nested = group.replacement_material_type;
  if (nested && typeof nested === "object") {
    return (
      nested.name ||
      nested.code ||
      (group.group != null ? `Группа ${group.group}` : "Замена")
    );
  }
  return (
    group.replacement_material_type_name ||
    (typeof nested === "string" ? nested : null) ||
    (group.group != null ? `Группа ${group.group}` : "Замена")
  );
}

function cell(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "object") {
    return cell(value.name ?? value.code ?? value.id ?? null);
  }
  return String(value);
}

function matchesQuery(row, query, fields) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((key) => {
    const v = row?.[key];
    return v != null && String(v).toLowerCase().includes(q);
  });
}

function SimpleTable({ columns, rows, emptyText }) {
  if (!rows.length) {
    return (
      <p className="admin-page__empty admin-page__empty--inline">{emptyText}</p>
    );
  }

  return (
    <div className="admin-page__table-wrap">
      <table className="admin-page__table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id ?? row.code ?? row.material_id ?? idx}>
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(row) : cell(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminGate({ children }) {
  const { user, status, openLoginModal } = useAuth();

  if (status === "loading") {
    return (
      <div className="admin-page">
        <p className="admin-page__empty">Загрузка…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="admin-page">
        <p className="admin-page__empty">
          Войдите под учётной записью администратора, чтобы открыть админку.
        </p>
        <button
          type="button"
          className="admin-page__btn"
          onClick={openLoginModal}
        >
          Войти
        </button>
      </div>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <div className="admin-page">
        <p className="admin-page__empty">
          Недостаточно прав. Раздел доступен только администраторам.
        </p>
      </div>
    );
  }

  return children;
}

function MaterialsListPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listAdminMaterials();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setError(formatRequestError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesQuery(row, query.trim(), ["code", "name", "type", "units"])
      ),
    [rows, query]
  );

  const selectedRow = useMemo(
    () =>
      filtered.find((row) => getMaterialCode(row) === selectedCode) ?? null,
    [filtered, selectedCode]
  );

  const handleSelect = (row) => {
    const code = getMaterialCode(row);
    if (!code) {
      console.warn("[admin] material row without code", row);
      return;
    }
    setSelectedCode((prev) => (prev === code ? null : code));
  };

  const selectedLabel = selectedRow
    ? [selectedRow.code, selectedRow.name].filter(Boolean).join(" — ") ||
      selectedCode
    : selectedCode;

  return (
    <section className="admin-page__card">
      <div className="admin-page__card-head">
        <h2 className="admin-page__card-title">
          Материалы
          <span className="admin-page__count">
            {loading ? "…" : `${filtered.length} / ${rows.length}`}
          </span>
        </h2>
        <input
          type="search"
          className="admin-page__search"
          placeholder="Поиск по коду, названию, типу…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          aria-label="Поиск материалов"
        />
      </div>

      <p className="admin-page__hint">
        Нажмите на строку, чтобы раскрыть карточку материала.
      </p>

      {error && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Не удалось загрузить список</p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      )}

      {loading ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Загрузка…
        </p>
      ) : !filtered.length ? (
        <p className="admin-page__empty admin-page__empty--inline">
          {rows.length
            ? "Ничего не найдено по запросу."
            : "Список материалов пуст."}
        </p>
      ) : (
        <div className="admin-page__table-wrap">
          <table className="admin-page__table admin-page__table--selectable">
            <thead>
              <tr>
                {MATERIAL_COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const code = getMaterialCode(row);
                const selected = code != null && code === selectedCode;
                return (
                  <FragmentRow
                    key={code ?? idx}
                    row={row}
                    columns={MATERIAL_COLUMNS}
                    selected={selected}
                    onSelect={handleSelect}
                    colSpan={MATERIAL_COLUMNS.length}
                    detail={
                      selected ? (
                        <MaterialDetail
                          code={code}
                          label={selectedLabel}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function KeyValueTable({ fields, data }) {
  return (
    <div className="admin-page__table-wrap">
      <table className="admin-page__table">
        <thead>
          <tr>
            <th>Поле</th>
            <th>Значение</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.key}>
              <td>{field.label}</td>
              <td>{cell(data?.[field.key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialDetail({ code, label }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAdminMaterialByCode(code);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setError(formatRequestError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [code]);

  return (
    <div className="admin-page__composition" ref={panelRef}>
      <div className="admin-page__composition-head">
        <h3 className="admin-page__composition-title">Материал: {label}</h3>
      </div>

      {error && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">
            Не удалось загрузить материал
          </p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      )}

      {loading ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Загрузка карточки…
        </p>
      ) : !detail ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Материал не найден.
        </p>
      ) : (
        <KeyValueTable fields={MATERIAL_DETAIL_FIELDS} data={detail} />
      )}
    </div>
  );
}

function ConstructionDetail({ constructionId, label, categoryCode }) {
  const [detail, setDetail] = useState(null);
  const [defaultMaterials, setDefaultMaterials] = useState([]);
  const [replacementGroups, setReplacementGroups] = useState([]);
  const [optionalMaterials, setOptionalMaterials] = useState([]);
  const [selectedByGroup, setSelectedByGroup] = useState({});
  const [catalogMaterials, setCatalogMaterials] = useState([]);
  const [addByGroup, setAddByGroup] = useState({});
  const [addQueryByGroup, setAddQueryByGroup] = useState({});
  const [optionalAddArticle, setOptionalAddArticle] = useState("");
  const [optionalAddQuery, setOptionalAddQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addError, setAddError] = useState(null);
  const [optionalAddError, setOptionalAddError] = useState(null);
  const [addingGroupKey, setAddingGroupKey] = useState(null);
  const [addingOptional, setAddingOptional] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const panelRef = useRef(null);

  const siCatalog = useMemo(
    () => filterMaterialsByUsageSi(catalogMaterials),
    [catalogMaterials]
  );

  const optionalArticles = useMemo(() => {
    const set = new Set();
    for (const row of optionalMaterials) {
      const article = String(row.code || row.material_code || "").trim();
      if (article) set.add(article);
    }
    return set;
  }, [optionalMaterials]);

  const optionalCandidates = useMemo(() => {
    return siCatalog
      .filter((mat) => {
        const article = String(mat.code || "").trim();
        if (!article) return false;
        return !optionalArticles.has(article);
      })
      .filter((mat) =>
        matchesQuery(mat, optionalAddQuery.trim(), ["code", "name", "type"])
      );
  }, [siCatalog, optionalArticles, optionalAddQuery]);

  useEffect(() => {
    if (constructionId == null) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setAddError(null);
      setOptionalAddError(null);
      try {
        const [data, catalog] = await Promise.all([
          getAdminConstructionById(constructionId),
          listAdminMaterials().catch(() => []),
        ]);
        if (cancelled) return;
        setCatalogMaterials(catalog);
        setDetail(data?.detail ?? null);
        const enriched = enrichCompositionFromMaterialsCatalog(
          {
            defaultMaterials: data?.defaultMaterials ?? [],
            replacementGroups: data?.replacementGroups ?? [],
            optionalMaterials: data?.optionalMaterials ?? [],
          },
          catalog
        );
        const defaults = enriched.defaultMaterials;
        const groups = enriched.replacementGroups;
        setDefaultMaterials(defaults);
        setReplacementGroups(groups);
        setOptionalMaterials(enriched.optionalMaterials);
        const initial = {};
        for (const group of groups) {
          const key = String(
            group.group ?? getReplacementMaterialTypeId(group) ?? ""
          );
          initial[key] = pickDefaultMaterialId(group.materials);
        }
        setSelectedByGroup(initial);
        setAddByGroup({});
        setAddQueryByGroup({});
        setOptionalAddArticle("");
        setOptionalAddQuery("");
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setDefaultMaterials([]);
          setReplacementGroups([]);
          setOptionalMaterials([]);
          setSelectedByGroup({});
          setAddByGroup({});
          setAddQueryByGroup({});
          setOptionalAddArticle("");
          setOptionalAddQuery("");
          setError(formatRequestError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [constructionId, reloadToken]);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [constructionId]);

  const handleGroupChange = (groupKey, value) => {
    setSelectedByGroup((prev) => ({ ...prev, [groupKey]: value }));
  };

  const handleAddChange = (groupKey, value) => {
    setAddByGroup((prev) => ({ ...prev, [groupKey]: value }));
  };

  const handleAddQueryChange = (groupKey, value) => {
    setAddQueryByGroup((prev) => ({ ...prev, [groupKey]: value }));
    setAddByGroup((prev) => ({ ...prev, [groupKey]: "" }));
  };

  const handleAddMaterial = async (group, groupKey) => {
    // value селекта = артикул (materials.code)
    const article = String(addByGroup[groupKey] || "").trim();
    if (!article) {
      setAddError("Выберите материал из каталога по артикулу.");
      return;
    }
    const typeId = getReplacementMaterialTypeId(group);
    if (group.group == null || typeId == null) {
      setAddError("У группы замены нет type/group — добавить нельзя.");
      return;
    }

    const catalogItem = siCatalog.find(
      (m) => String(m.code || "").trim() === article
    );
    const materialId = Number(catalogItem?.id);
    if (!catalogItem || !Number.isFinite(materialId) || materialId <= 0) {
      setAddError(
        `Артикул «${article}» не найден в /admin/materials (usage=si).`
      );
      return;
    }

    const sample = group.materials?.[0];
    const maxSort = (group.materials || []).reduce(
      (max, m) => Math.max(max, Number(m.sort_order) || 0),
      0
    );

    setAddingGroupKey(groupKey);
    setAddError(null);
    try {
      // POST: id = materials.id для выбранного артикула
      await addAdminConstructionMaterial(constructionId, {
        id: materialId,
        weight: Number(sample?.weight) > 0 ? Number(sample.weight) : 1,
        sort_order: maxSort + 1,
        is_default: false,
        replacement_group: Number(group.group),
        replacement_material_type_id: Number(typeId),
      });
      setReloadToken((n) => n + 1);
    } catch (err) {
      setAddError(formatRequestError(err));
    } finally {
      setAddingGroupKey(null);
    }
  };

  const handleAddOptionalMaterial = async () => {
    const article = String(optionalAddArticle || "").trim();
    if (!article) {
      setOptionalAddError("Выберите материал из каталога по артикулу.");
      return;
    }

    const catalogItem = siCatalog.find(
      (m) => String(m.code || "").trim() === article
    );
    const materialId = Number(catalogItem?.id);
    if (!catalogItem || !Number.isFinite(materialId) || materialId <= 0) {
      setOptionalAddError(
        `Артикул «${article}» не найден в /admin/materials (usage=si).`
      );
      return;
    }

    const maxSort = optionalMaterials.reduce(
      (max, m) => Math.max(max, Number(m.sort_order) || 0),
      0
    );

    setAddingOptional(true);
    setOptionalAddError(null);
    try {
      await addAdminConstructionOptionalMaterial(constructionId, {
        id: materialId,
        weight: 1,
        sort_order: maxSort + 1,
      });
      setReloadToken((n) => n + 1);
    } catch (err) {
      setOptionalAddError(formatRequestError(err));
    } finally {
      setAddingOptional(false);
    }
  };

  return (
    <div className="admin-page__composition" ref={panelRef}>
      <div className="admin-page__composition-head">
        <h3 className="admin-page__composition-title">
          Конструкция: {label}
        </h3>
      </div>

      {error && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">
            Не удалось загрузить конструкцию
          </p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      )}

      {loading ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Загрузка карточки…
        </p>
      ) : !detail ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Конструкция не найдена.
        </p>
      ) : (
        <>
          <KeyValueTable fields={CONSTRUCTION_DETAIL_FIELDS} data={detail} />

          <div className="admin-page__composition-head admin-page__composition-head--spaced">
            <h3 className="admin-page__composition-title">
              Материалы по умолчанию
              <span className="admin-page__count">
                {defaultMaterials.length} мат.
              </span>
            </h3>
          </div>
          <SimpleTable
            columns={COMPOSITION_COLUMNS}
            rows={defaultMaterials}
            emptyText="Нет материалов по умолчанию."
          />

          <div className="admin-page__composition-head admin-page__composition-head--spaced">
            <h3 className="admin-page__composition-title">
              Заменяемые материалы
              <span className="admin-page__count">
                {replacementGroups.length} групп
              </span>
            </h3>
          </div>

          {addError && (
            <div className="admin-page__error" role="alert">
              <p className="admin-page__error-title">
                Не удалось добавить материал
              </p>
              <pre className="admin-page__error-body">{addError}</pre>
            </div>
          )}

          {!replacementGroups.length ? (
            <p className="admin-page__empty admin-page__empty--inline">
              Нет групп замены.
            </p>
          ) : (
            <div className="admin-page__replacements">
              {replacementGroups.map((group, idx) => {
                const groupKey = String(
                  group.group ?? getReplacementMaterialTypeId(group) ?? idx
                );
                const typeLabel = groupTypeLabel(group);
                const value = selectedByGroup[groupKey] ?? "";
                const inGroupArticles = new Set(
                  (group.materials || [])
                    .map((m) =>
                      String(m.code || m.material_code || "").trim()
                    )
                    .filter(Boolean)
                );
                const addQuery = addQueryByGroup[groupKey] ?? "";
                const candidates = siCatalog
                  .filter((mat) => {
                    const article = String(mat.code || "").trim();
                    if (!article) return false;
                    return !inGroupArticles.has(article);
                  })
                  .filter((mat) =>
                    matchesQuery(mat, addQuery.trim(), ["code", "name", "type"])
                  );
                const addValue = addByGroup[groupKey] ?? "";
                const adding = addingGroupKey === groupKey;

                return (
                  <div key={groupKey} className="admin-page__replacement-block">
                    <label className="admin-page__replacement">
                      <span className="admin-page__replacement-type">
                        {typeLabel}
                      </span>
                      <select
                        className="admin-page__select"
                        value={value}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleGroupChange(groupKey, e.target.value);
                        }}
                        aria-label={`Замена: ${typeLabel}`}
                      >
                        {!group.materials?.length ? (
                          <option value="">Нет вариантов</option>
                        ) : (
                          group.materials.map((mat, matIdx) => {
                            const article = String(
                              mat.code || mat.material_code || ""
                            ).trim();
                            const optValue =
                              article ||
                              String(mat.material_id ?? mat.id ?? matIdx);
                            return (
                              <option key={optValue} value={optValue}>
                                {materialOptionLabel(mat)}
                              </option>
                            );
                          })
                        )}
                      </select>
                    </label>

                    <div className="admin-page__replacement-add">
                      <input
                        type="search"
                        className="admin-page__search admin-page__search--inline"
                        placeholder="Поиск по артикулу, названию…"
                        value={addQuery}
                        disabled={adding || !siCatalog.length}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleAddQueryChange(groupKey, e.target.value);
                        }}
                        aria-label="Поиск материала usage=si для добавления"
                      />
                      <select
                        className="admin-page__select"
                        value={addValue}
                        disabled={adding || !candidates.length}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleAddChange(groupKey, e.target.value);
                        }}
                        aria-label="Добавить материал usage=si"
                      >
                        <option value="">
                          {!siCatalog.length
                            ? "Нет материалов с usage=si"
                            : candidates.length
                              ? `Добавить из каталога… (${candidates.length})`
                              : addQuery.trim()
                                ? "Ничего не найдено по запросу"
                                : "Все подходящие уже в группе"}
                        </option>
                        {candidates.map((mat) => {
                          const article = String(mat.code || "").trim();
                          return (
                            <option key={article} value={article}>
                              {materialOptionLabel(mat)}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        type="button"
                        className="admin-page__btn admin-page__btn--inline"
                        disabled={adding || !addValue}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddMaterial(group, groupKey);
                        }}
                      >
                        {adding ? "Добавление…" : "Добавить"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="admin-page__composition-head admin-page__composition-head--spaced">
            <h3 className="admin-page__composition-title">
              Дополнительные материалы
              <span className="admin-page__count">
                {optionalMaterials.length} мат.
              </span>
            </h3>
          </div>
          <p className="admin-page__hint">
            Не входят в базовый состав и не являются заменой — могут быть
            включены дополнительно.
          </p>

          {optionalAddError && (
            <div className="admin-page__error" role="alert">
              <p className="admin-page__error-title">
                Не удалось добавить доп. материал
              </p>
              <pre className="admin-page__error-body">{optionalAddError}</pre>
            </div>
          )}

          <SimpleTable
            columns={COMPOSITION_COLUMNS}
            rows={optionalMaterials}
            emptyText="Нет дополнительных материалов."
          />

          <div className="admin-page__optional-add">
            <input
              type="search"
              className="admin-page__search admin-page__search--inline"
              placeholder="Поиск по артикулу, названию…"
              value={optionalAddQuery}
              disabled={addingOptional || !siCatalog.length}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                setOptionalAddQuery(e.target.value);
                setOptionalAddArticle("");
              }}
              aria-label="Поиск доп. материала usage=si"
            />
            <select
              className="admin-page__select"
              value={optionalAddArticle}
              disabled={addingOptional || !optionalCandidates.length}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                setOptionalAddArticle(e.target.value);
              }}
              aria-label="Добавить доп. материал usage=si"
            >
              <option value="">
                {!siCatalog.length
                  ? "Нет материалов с usage=si"
                  : optionalCandidates.length
                    ? `Добавить из каталога… (${optionalCandidates.length})`
                    : optionalAddQuery.trim()
                      ? "Ничего не найдено по запросу"
                      : "Все подходящие уже в списке допов"}
              </option>
              {optionalCandidates.map((mat) => {
                const article = String(mat.code || "").trim();
                return (
                  <option key={article} value={article}>
                    {materialOptionLabel(mat)}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="admin-page__btn admin-page__btn--inline"
              disabled={addingOptional || !optionalAddArticle}
              onClick={(e) => {
                e.stopPropagation();
                handleAddOptionalMaterial();
              }}
            >
              {addingOptional ? "Добавление…" : "Добавить"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ConstructionsListPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [category, setCategory] = useState(
    CONSTRUCTION_CATEGORY_FILTERS[0].code
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSelectedId(null);
      try {
        const data = await listAdminConstructions({ category });
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setError(formatRequestError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesQuery(row, query.trim(), [
          "id",
          "code",
          "name",
          "type_id",
          "type_code",
          "type_name",
          "category_id",
          "category_code",
          "category_name",
        ])
      ),
    [rows, query]
  );

  const selectedRow = useMemo(
    () => filtered.find((row) => getConstructionId(row) === selectedId) ?? null,
    [filtered, selectedId]
  );

  const handleSelect = (row) => {
    const id = getConstructionId(row);
    if (id == null) {
      console.warn("[admin] construction row without id", row);
      return;
    }
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const selectedLabel = selectedRow
    ? [selectedRow.code, selectedRow.name].filter(Boolean).join(" — ") ||
      `ID ${selectedId}`
    : `ID ${selectedId}`;

  return (
    <section className="admin-page__card">
      <div className="admin-page__card-head">
        <h2 className="admin-page__card-title">
          Конструкции
          <span className="admin-page__count">
            {loading ? "…" : `${filtered.length} / ${rows.length}`}
          </span>
        </h2>
        <input
          type="search"
          className="admin-page__search"
          placeholder="Поиск по коду, названию, типу…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          aria-label="Поиск конструкций"
        />
      </div>

      <div
        className="admin-page__category-toggle"
        role="group"
        aria-label="Категория конструкций"
      >
        {CONSTRUCTION_CATEGORY_FILTERS.map((item) => {
          const active = category === item.code;
          return (
            <button
              key={item.code}
              type="button"
              className={
                active
                  ? "admin-page__category-btn admin-page__category-btn--active"
                  : "admin-page__category-btn"
              }
              aria-pressed={active}
              onClick={() => setCategory(item.code)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <p className="admin-page__hint">
        Нажмите на строку, чтобы раскрыть карточку конструкции.
      </p>

      {error && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Не удалось загрузить список</p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      )}

      {loading ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Загрузка…
        </p>
      ) : !filtered.length ? (
        <p className="admin-page__empty admin-page__empty--inline">
          {rows.length
            ? "Ничего не найдено по запросу."
            : "Список конструкций пуст."}
        </p>
      ) : (
        <div className="admin-page__table-wrap">
          <table className="admin-page__table admin-page__table--selectable">
            <thead>
              <tr>
                {CONSTRUCTION_COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const id = getConstructionId(row);
                const selected = id != null && id === selectedId;
                return (
                  <FragmentRow
                    key={id ?? idx}
                    row={row}
                    columns={CONSTRUCTION_COLUMNS}
                    selected={selected}
                    onSelect={handleSelect}
                    colSpan={CONSTRUCTION_COLUMNS.length}
                    detail={
                      selected ? (
                        <ConstructionDetail
                          constructionId={id}
                          label={selectedLabel}
                          categoryCode={category}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FragmentRow({ row, columns, selected, onSelect, colSpan, detail }) {
  return (
    <>
      <tr
        className={
          selected
            ? "admin-page__row admin-page__row--selected admin-page__row--clickable"
            : "admin-page__row admin-page__row--clickable"
        }
        onClick={() => onSelect(row)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(row);
          }
        }}
        tabIndex={0}
        aria-expanded={selected}
        aria-selected={selected}
      >
        {columns.map((col) => (
          <td key={col.key}>
            {col.render ? col.render(row) : cell(row[col.key])}
          </td>
        ))}
      </tr>
      {detail ? (
        <tr className="admin-page__detail-row">
          <td colSpan={colSpan}>{detail}</td>
        </tr>
      ) : null}
    </>
  );
}

export default function AdminPage() {
  const [searchParams] = useSearchParams();
  const listParam = searchParams.get("list");
  const listKey =
    listParam === "constructions" || listParam === "materials"
      ? listParam
      : null;

  if (!listKey) {
    return <Navigate to="/admin?list=materials" replace />;
  }

  return (
    <AdminGate>
      <div className="admin-page">
        <div className="admin-page__header">
          <h1 className="admin-page__title">Админка</h1>
          <nav className="admin-page__tabs" aria-label="Списки админки">
            <NavLink
              to="/admin?list=materials"
              className={() =>
                `admin-page__tab${
                  listKey === "materials" ? " admin-page__tab--active" : ""
                }`
              }
            >
              Материалы
            </NavLink>
            <NavLink
              to="/admin?list=constructions"
              className={() =>
                `admin-page__tab${
                  listKey === "constructions" ? " admin-page__tab--active" : ""
                }`
              }
            >
              Конструкции
            </NavLink>
          </nav>
        </div>

        {listKey === "materials" ? (
          <MaterialsListPanel />
        ) : (
          <ConstructionsListPanel />
        )}
      </div>
    </AdminGate>
  );
}
