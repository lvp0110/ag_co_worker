import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  enrichCompositionFromMaterialsCatalog,
  getAdminConstructionById,
  getAdminMaterialByCode,
  getConstructionId,
  getMaterialCode,
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
    render: (row) => cell(row.type_name ?? row.type_code ?? row.type_id),
  },
  {
    key: "category",
    label: "Категория",
    render: (row) =>
      cell(row.category_name ?? row.category_code ?? row.category_id),
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
  return String(chosen.material_id ?? chosen.id ?? chosen.code ?? "");
}

function materialOptionLabel(mat) {
  const code = mat.code || mat.material_code || "";
  const name = mat.name || mat.material_name || "";
  if (code && name) return `${code} — ${name}`;
  return code || name || `ID ${mat.material_id ?? mat.id ?? "?"}`;
}

function groupTypeLabel(group) {
  return (
    group.replacement_material_type_name ||
    group.replacement_material_type ||
    (group.group != null ? `Группа ${group.group}` : "Замена")
  );
}

function cell(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
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

function ConstructionDetail({ constructionId, label }) {
  const [detail, setDetail] = useState(null);
  const [defaultMaterials, setDefaultMaterials] = useState([]);
  const [replacementGroups, setReplacementGroups] = useState([]);
  const [selectedByGroup, setSelectedByGroup] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (constructionId == null) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [data, catalog] = await Promise.all([
          getAdminConstructionById(constructionId),
          listAdminMaterials().catch(() => []),
        ]);
        if (cancelled) return;
        setDetail(data?.detail ?? null);
        const enriched = enrichCompositionFromMaterialsCatalog(
          {
            defaultMaterials: data?.defaultMaterials ?? [],
            replacementGroups: data?.replacementGroups ?? [],
          },
          catalog
        );
        const defaults = enriched.defaultMaterials;
        const groups = enriched.replacementGroups;
        setDefaultMaterials(defaults);
        setReplacementGroups(groups);
        const initial = {};
        for (const group of groups) {
          const key = String(group.group ?? group.replacement_material_type_id ?? "");
          initial[key] = pickDefaultMaterialId(group.materials);
        }
        setSelectedByGroup(initial);
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setDefaultMaterials([]);
          setReplacementGroups([]);
          setSelectedByGroup({});
          setError(formatRequestError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [constructionId]);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [constructionId]);

  const handleGroupChange = (groupKey, value) => {
    setSelectedByGroup((prev) => ({ ...prev, [groupKey]: value }));
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

          {!replacementGroups.length ? (
            <p className="admin-page__empty admin-page__empty--inline">
              Нет групп замены.
            </p>
          ) : (
            <div className="admin-page__replacements">
              {replacementGroups.map((group, idx) => {
                const groupKey = String(
                  group.group ?? group.replacement_material_type_id ?? idx
                );
                const typeLabel = groupTypeLabel(group);
                const value = selectedByGroup[groupKey] ?? "";
                return (
                  <label
                    key={groupKey}
                    className="admin-page__replacement"
                  >
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
                          const optValue = String(
                            mat.material_id ?? mat.id ?? mat.code ?? matIdx
                          );
                          return (
                            <option key={optValue} value={optValue}>
                              {materialOptionLabel(mat)}
                            </option>
                          );
                        })
                      )}
                    </select>
                  </label>
                );
              })}
            </div>
          )}
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
