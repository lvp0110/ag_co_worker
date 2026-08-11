import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  addAdminConstructionMaterial,
  addAdminConstructionOptionalMaterial,
  collectConstructionTypes,
  collectReplacementMaterialTypes,
  createAdminConstruction,
  createAdminMaterialFromUnmatched,
  deleteAdminConstruction,
  deleteAdminConstructionMaterial,
  deleteAdminConstructionOptionalMaterial,
  enrichCompositionFromMaterialsCatalog,
  filterMaterialsByUsage,
  filterMaterialsByUsageSi,
  getAdminConstructionById,
  getAdminMaterialByCode,
  getConstructionId,
  getMaterialCode,
  getReplacementMaterialTypeId,
  listAdminConstructions,
  listAdminMaterials,
  listUnmatchedMaterials,
  pickCategoryIdFromRows,
  updateAdminConstruction,
  updateAdminConstructionMaterial,
  updateAdminMaterial,
} from "../services/adminApi.js";
import { formatRequestError } from "../services/apiClient.js";
import "./AdminPage.css";

const MATERIAL_USAGE_FILTERS = [
  { code: "si", label: "Звукоизоляция" },
  { code: "ac", label: "Акустика" },
  { code: "vi", label: "Виброизоляция" },
];

const MATERIALS_COMPARE_MODE = "compare";

/** Типы материалов, сгруппированные по usage (si/ac/vi). */
const collectTypesByUsage = (materials) => {
  const map = Object.fromEntries(
    MATERIAL_USAGE_FILTERS.map((item) => [item.code, new Map()])
  );
  for (const row of materials || []) {
    const usage = String(row?.usage || "")
      .trim()
      .toLowerCase();
    const type = String(row?.type || "").trim();
    if (!type || !map[usage]) continue;
    map[usage].set(type, (map[usage].get(type) || 0) + 1);
  }
  const result = {};
  for (const [usage, counts] of Object.entries(map)) {
    result[usage] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
      .map(([type]) => type);
  }
  return result;
};

/** Если текущий type не встречается при этом usage — берём самый частый (часто unitMaterial). */
const pickTypeForUsage = (currentType, usage, typesByUsage) => {
  const options = typesByUsage?.[usage] || [];
  const current = String(currentType || "").trim();
  if (current && options.includes(current)) return current;
  if (options.includes("unitMaterial")) return "unitMaterial";
  return options[0] || current;
};

const MATERIAL_COLUMNS = [
  { key: "code", label: "Код" },
  { key: "name", label: "Название" },
  { key: "product_name", label: "Продукт" },
  { key: "type", label: "Тип" },
  {
    key: "usage",
    label: "Применение",
    render: (row) => {
      const code = String(row.usage || "").trim().toLowerCase();
      const item = MATERIAL_USAGE_FILTERS.find((f) => f.code === code);
      return item ? `${item.label} (${item.code})` : cell(row.usage);
    },
  },
  { key: "units", label: "Ед." },
  {
    key: "visible",
    label: "Видим",
    render: (row) => cell(row.visible),
  },
];

const MATERIAL_PRICE_COLUMNS = [
  {
    key: "region",
    label: "Регион",
    render: (row) =>
      cell(row.region?.name || row.region?.code || row.region?.id),
  },
  {
    key: "price",
    label: "Цена",
    render: (row) => cell(row.price),
  },
  {
    key: "m2",
    label: "₽/м²",
    render: (row) => cell(row.m2),
  },
  { key: "currency_code", label: "Валюта" },
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

const emptyMaterialForm = () => ({
  code: "",
  name: "",
  product_name: "",
  length: "0",
  width: "0",
  height: "0",
  units: "",
  type: "",
  unit_pack: "1",
  info_pack: "",
  ratio_square: "1",
  description: "",
  specification: "",
  img: "",
  scheme: "",
  weight: "",
  volume: "",
  load_index: "",
  order_list: "0",
  visible: true,
  usage: MATERIAL_USAGE_FILTERS[0].code,
});

const materialFormFromDetail = (detail) => ({
  code: String(detail?.code ?? ""),
  name: String(detail?.name ?? ""),
  product_name: String(detail?.product_name ?? ""),
  length: String(detail?.length ?? 0),
  width: String(detail?.width ?? 0),
  height: String(detail?.height ?? 0),
  units: String(detail?.units ?? ""),
  type: String(detail?.type ?? ""),
  unit_pack: String(detail?.unit_pack ?? 1),
  info_pack: String(detail?.info_pack ?? ""),
  ratio_square: String(detail?.ratio_square ?? 1),
  description: String(detail?.description ?? ""),
  specification: String(detail?.specification ?? ""),
  img: String(detail?.img ?? ""),
  scheme: String(detail?.scheme ?? ""),
  weight: String(detail?.weight ?? ""),
  volume: String(detail?.volume ?? ""),
  load_index: String(detail?.load_index ?? ""),
  order_list: String(detail?.order_list ?? 0),
  visible: Boolean(detail?.visible),
  usage: String(detail?.usage || MATERIAL_USAGE_FILTERS[0].code),
});

const formatUnmatchedPrices = (prices) => {
  if (!Array.isArray(prices) || !prices.length) return "—";
  return prices
    .map((price) => {
      const region = price?.region?.code || price?.region?.name || "?";
      const unit = price?.price != null ? String(price.price) : "—";
      const m2 = price?.m2 != null ? String(price.m2) : "—";
      return `${region}: ${unit} / м² ${m2}`;
    })
    .join("; ");
};

const UNMATCHED_BASE_COLUMNS = [
  { key: "code", label: "Код" },
  { key: "name", label: "Название" },
  { key: "units", label: "Ед." },
  {
    key: "prices",
    label: "Цены",
    render: (row) => formatUnmatchedPrices(row.prices),
  },
  {
    key: "created_at",
    label: "Добавлен",
    render: (row) => {
      if (!row.created_at) return "—";
      const d = new Date(row.created_at);
      return Number.isNaN(d.getTime())
        ? String(row.created_at)
        : d.toLocaleString("ru-RU");
    },
  },
];

function UnmatchedAddForm({
  row,
  typeOptions,
  typesByUsage = {},
  onCancel,
  onCreated,
}) {
  const [name, setName] = useState(() => String(row.name || "").trim());
  const [productName, setProductName] = useState(() =>
    String(row.name || "").trim()
  );
  const [units, setUnits] = useState(() => String(row.units || "").trim());
  const [usage, setUsage] = useState(MATERIAL_USAGE_FILTERS[0].code);
  const [type, setType] = useState(() =>
    pickTypeForUsage(
      typeOptions[0] || "",
      MATERIAL_USAGE_FILTERS[0].code,
      typesByUsage
    )
  );
  const [unitPack, setUnitPack] = useState("1");
  const [ratioSquare, setRatioSquare] = useState("1");
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const code = String(row.code || "").trim();
    const pack = Number(unitPack);
    const ratio = Number(ratioSquare);
    if (!code) {
      setFormError("Нет кода материала.");
      return;
    }
    if (!name.trim() || !units.trim() || !type.trim()) {
      setFormError("Заполните название, ед. изм. и тип.");
      return;
    }
    if (!Number.isFinite(pack) || pack <= 0) {
      setFormError("unit_pack должен быть > 0.");
      return;
    }
    if (!Number.isFinite(ratio) || ratio <= 0) {
      setFormError("ratio_square должен быть > 0.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await createAdminMaterialFromUnmatched({
        code,
        name: name.trim(),
        product_name: productName.trim() || name.trim(),
        units: units.trim(),
        type: type.trim(),
        usage,
        unit_pack: pack,
        ratio_square: ratio,
        order_list: 0,
        visible,
        length: 0,
        width: 0,
        height: 0,
        info_pack: "",
        description: "",
        specification: "",
        img: "",
        scheme: "",
        weight: "",
        volume: "",
        load_index: "",
        prices: row.prices,
      });
      onCreated?.(code);
    } catch (err) {
      setFormError(formatRequestError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-page__unmatched-form" onSubmit={handleSubmit}>
      <h3 className="admin-page__composition-title">
        Добавить в /admin/materials: {row.code}
      </h3>
      <p className="admin-page__hint">
        Обязательные поля API: code, name, units, type, unit_pack, ratio_square.
        Цены из unmatched будут перенесены, запись исчезнет из сравнения.
      </p>

      <div className="admin-page__create-fields">
        <label className="admin-page__field">
          <span className="admin-page__field-label">Название</span>
          <input
            className="admin-page__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            required
          />
        </label>
        <label className="admin-page__field">
          <span className="admin-page__field-label">Продукт</span>
          <input
            className="admin-page__input"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="admin-page__field">
          <span className="admin-page__field-label">Ед. изм.</span>
          <input
            className="admin-page__input"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            disabled={saving}
            required
          />
        </label>
        <label className="admin-page__field">
          <span className="admin-page__field-label">Тип</span>
          <input
            className="admin-page__input"
            list="admin-unmatched-type-options"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={saving}
            required
            placeholder="Тип материала"
          />
          <datalist id="admin-unmatched-type-options">
            {(typesByUsage[usage]?.length
              ? typesByUsage[usage]
              : typeOptions
            ).map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </label>
        <label className="admin-page__field">
          <span className="admin-page__field-label">Применение</span>
          <select
            className="admin-page__select admin-page__select--full"
            value={usage}
            onChange={(e) => {
              const nextUsage = e.target.value;
              setUsage(nextUsage);
              setType((prev) =>
                pickTypeForUsage(prev, nextUsage, typesByUsage)
              );
            }}
            disabled={saving}
          >
            {MATERIAL_USAGE_FILTERS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label} ({item.code})
              </option>
            ))}
          </select>
        </label>
        <label className="admin-page__field">
          <span className="admin-page__field-label">В упаковке (unit_pack)</span>
          <input
            className="admin-page__input"
            type="number"
            min="1"
            step="1"
            value={unitPack}
            onChange={(e) => setUnitPack(e.target.value)}
            disabled={saving}
            required
          />
        </label>
        <label className="admin-page__field">
          <span className="admin-page__field-label">Ratio м²</span>
          <input
            className="admin-page__input"
            type="number"
            min="1"
            step="1"
            value={ratioSquare}
            onChange={(e) => setRatioSquare(e.target.value)}
            disabled={saving}
            required
          />
        </label>
        <label className="admin-page__field admin-page__field--checkbox">
          <span className="admin-page__field-label">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
              disabled={saving}
            />{" "}
            Видим в каталоге
          </span>
        </label>
      </div>

      {formError && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Не удалось добавить</p>
          <pre className="admin-page__error-body">{formError}</pre>
        </div>
      )}

      <div className="admin-page__meta-actions">
        <button
          type="submit"
          className="admin-page__btn admin-page__btn--inline"
          disabled={saving}
        >
          {saving ? "Сохранение…" : "Создать материал"}
        </button>
        <button
          type="button"
          className="admin-page__btn admin-page__btn--inline"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            onCancel?.();
          }}
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

const COMPOSITION_COLUMNS = [
  { key: "sort_order", label: "№" },
  { key: "material_id", label: "ID мат." },
  { key: "code", label: "Код" },
  { key: "name", label: "Название" },
  { key: "weight", label: "Вес" },
];

function DeleteIconButton({ deleting, disabled, label, onClick }) {
  return (
    <button
      type="button"
      className="admin-page__btn admin-page__btn--icon admin-page__btn--danger"
      disabled={disabled || deleting}
      aria-label={deleting ? `Удаление ${label}` : `Удалить ${label}`}
      title="Удалить"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      {deleting ? "…" : "×"}
    </button>
  );
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
            <tr key={row.id ?? row.code ?? row.article ?? row.material_id ?? idx}>
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
  const [usage, setUsage] = useState(MATERIAL_USAGE_FILTERS[0].code);
  const [unmatchedRows, setUnmatchedRows] = useState([]);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);
  const [unmatchedError, setUnmatchedError] = useState(null);
  const [unmatchedReloadToken, setUnmatchedReloadToken] = useState(0);
  const [addingUnmatchedCode, setAddingUnmatchedCode] = useState(null);
  const isCompare = usage === MATERIALS_COMPARE_MODE;

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
  }, [unmatchedReloadToken]);

  useEffect(() => {
    if (!isCompare) return undefined;
    let cancelled = false;
    (async () => {
      setUnmatchedLoading(true);
      setUnmatchedError(null);
      try {
        const data = await listUnmatchedMaterials();
        if (!cancelled) setUnmatchedRows(data);
      } catch (err) {
        if (!cancelled) {
          setUnmatchedRows([]);
          setUnmatchedError(formatRequestError(err));
        }
      } finally {
        if (!cancelled) setUnmatchedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCompare, unmatchedReloadToken]);

  useEffect(() => {
    setSelectedCode(null);
    setQuery("");
    setAddingUnmatchedCode(null);
  }, [usage]);

  const catalogTypeOptions = useMemo(() => {
    const set = new Set();
    for (const row of rows) {
      const t = String(row.type || "").trim();
      if (t) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [rows]);

  const typesByUsage = useMemo(() => collectTypesByUsage(rows), [rows]);

  const unmatchedColumns = useMemo(
    () => [
      ...UNMATCHED_BASE_COLUMNS,
      {
        key: "actions",
        label: "",
        render: (row) => {
          const code = String(row.code || "").trim();
          const open = addingUnmatchedCode === code;
          return (
            <button
              type="button"
              className="admin-page__btn admin-page__btn--inline"
              disabled={!code}
              onClick={(e) => {
                e.stopPropagation();
                setAddingUnmatchedCode((prev) =>
                  prev === code ? null : code
                );
              }}
            >
              {open ? "Скрыть" : "Добавить"}
            </button>
          );
        },
      },
    ],
    [addingUnmatchedCode]
  );

  const usageRows = useMemo(
    () => (isCompare ? [] : filterMaterialsByUsage(rows, usage)),
    [rows, usage, isCompare]
  );

  const filtered = useMemo(() => {
    if (isCompare) {
      return unmatchedRows.filter((row) =>
        matchesQuery(row, query.trim(), ["code", "name", "units"])
      );
    }
    return usageRows.filter((row) =>
      matchesQuery(row, query.trim(), [
        "code",
        "name",
        "product_name",
        "type",
        "units",
      ])
    );
  }, [isCompare, unmatchedRows, usageRows, query]);

  const selectedRow = useMemo(
    () =>
      isCompare
        ? null
        : filtered.find((row) => getMaterialCode(row) === selectedCode) ??
          null,
    [filtered, selectedCode, isCompare]
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

  const listLoading = isCompare ? unmatchedLoading : loading;

  return (
    <section className="admin-page__card">
      <div className="admin-page__card-head">
        <h2 className="admin-page__card-title">
          {isCompare ? "Несовпадения импорта" : "Материалы"}
          <span className="admin-page__count">
            {listLoading
              ? "…"
              : isCompare
                ? `${filtered.length} / ${unmatchedRows.length}`
                : `${filtered.length} / ${usageRows.length}`}
          </span>
        </h2>
        <input
          type="search"
          className="admin-page__search"
          placeholder={
            isCompare
              ? "Поиск по коду, названию…"
              : "Поиск по коду, названию, типу…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={listLoading}
          aria-label={
            isCompare ? "Поиск несовпадений" : "Поиск материалов"
          }
        />
      </div>

      <div
        className="admin-page__category-toggle"
        role="group"
        aria-label="Раздел материалов"
      >
        {MATERIAL_USAGE_FILTERS.map((item) => {
          const active = usage === item.code;
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
              onClick={() => setUsage(item.code)}
            >
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          className={
            isCompare
              ? "admin-page__category-btn admin-page__category-btn--active"
              : "admin-page__category-btn"
          }
          aria-pressed={isCompare}
          onClick={() => setUsage(MATERIALS_COMPARE_MODE)}
        >
          Сравнение
        </button>
      </div>

      {isCompare ? (
        <p className="admin-page__hint">
          Материалы без синхронизации из{" "}
          <code className="admin-page__code">/api/v2/data/unmatched</code>.
          Кнопка «Добавить» создаёт запись в{" "}
          <code className="admin-page__code">/admin/materials</code> и переносит
          цены.
        </p>
      ) : (
        <p className="admin-page__hint">
          Нажмите на строку, чтобы раскрыть карточку материала.
        </p>
      )}

      {!isCompare && error && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Не удалось загрузить список</p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      )}

      {isCompare && unmatchedError && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">
            Не удалось загрузить несовпадения
          </p>
          <pre className="admin-page__error-body">{unmatchedError}</pre>
        </div>
      )}

      {listLoading ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Загрузка…
        </p>
      ) : isCompare ? (
        !filtered.length ? (
          <p className="admin-page__empty admin-page__empty--inline">
            {unmatchedRows.length
              ? "Ничего не найдено по запросу."
              : "Нет несовпавших материалов."}
          </p>
        ) : (
          <div className="admin-page__table-wrap">
            <table className="admin-page__table">
              <thead>
                <tr>
                  {unmatchedColumns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const code = String(row.code || "").trim();
                  const open = Boolean(code) && addingUnmatchedCode === code;
                  return (
                    <Fragment key={code || idx}>
                      <tr>
                        {unmatchedColumns.map((col) => (
                          <td key={col.key}>
                            {col.render ? col.render(row) : cell(row[col.key])}
                          </td>
                        ))}
                      </tr>
                      {open ? (
                        <tr className="admin-page__detail-row">
                          <td colSpan={unmatchedColumns.length}>
                            <UnmatchedAddForm
                              row={row}
                              typeOptions={catalogTypeOptions}
                              typesByUsage={typesByUsage}
                              onCancel={() => setAddingUnmatchedCode(null)}
                              onCreated={() => {
                                setAddingUnmatchedCode(null);
                                setUnmatchedReloadToken((n) => n + 1);
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : !filtered.length ? (
        <p className="admin-page__empty admin-page__empty--inline">
          {usageRows.length
            ? "Ничего не найдено по запросу."
            : "В этом разделе нет материалов."}
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
                          typesByUsage={typesByUsage}
                          onCodeChanged={(nextCode) => {
                            setSelectedCode(nextCode);
                          }}
                          onSaved={(nextCode, meta) => {
                            const nextUsage = String(meta?.usage || "").trim();
                            if (
                              nextUsage &&
                              MATERIAL_USAGE_FILTERS.some(
                                (item) => item.code === nextUsage
                              ) &&
                              nextUsage !== usage
                            ) {
                              setUsage(nextUsage);
                            }
                            setUnmatchedReloadToken((t) => t + 1);
                          }}
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

function MaterialDetail({
  code,
  label,
  showBackLink = false,
  onCodeChanged,
  onSaved,
  typesByUsage: typesByUsageProp,
}) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyMaterialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [typesByUsageLocal, setTypesByUsageLocal] = useState({});
  const panelRef = useRef(null);

  const typesByUsage = typesByUsageProp || typesByUsageLocal;
  const typeOptions = typesByUsage[form.usage] || [];
  const typeListId = `admin-material-type-options-${code || "new"}`;

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(null);
  };

  const handleUsageChange = (nextUsage) => {
    setForm((prev) => ({
      ...prev,
      usage: nextUsage,
      type: pickTypeForUsage(prev.type, nextUsage, typesByUsage),
    }));
    setSaveSuccess(null);
  };

  useEffect(() => {
    if (typesByUsageProp) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await listAdminMaterials();
        if (!cancelled) setTypesByUsageLocal(collectTypesByUsage(data));
      } catch {
        if (!cancelled) setTypesByUsageLocal({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typesByUsageProp]);

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSaveError(null);
      setSaveSuccess(null);
      try {
        const data = await getAdminMaterialByCode(code);
        if (!cancelled) {
          setDetail(data);
          setForm(data ? materialFormFromDetail(data) : emptyMaterialForm());
        }
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setForm(emptyMaterialForm());
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
    if (!showBackLink) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [code, showBackLink]);

  const handleSave = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!code) return;

    const nextCode = String(form.code || "").trim();
    const name = String(form.name || "").trim();
    const units = String(form.units || "").trim();
    const type = String(form.type || "").trim();
    const pack = Number(form.unit_pack);
    const ratio = Number(form.ratio_square);

    if (!nextCode || !name || !units || !type) {
      setSaveError("Заполните код, название, ед. изм. и тип.");
      return;
    }
    if (!Number.isFinite(pack) || pack <= 0) {
      setSaveError("unit_pack должен быть > 0.");
      return;
    }
    if (!Number.isFinite(ratio) || ratio <= 0) {
      setSaveError("ratio_square должен быть > 0.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      await updateAdminMaterial(code, {
        ...form,
        code: nextCode,
        name,
        product_name: String(form.product_name || "").trim() || name,
        units,
        type,
        unit_pack: pack,
        ratio_square: ratio,
        length: Number(form.length) || 0,
        width: Number(form.width) || 0,
        height: Number(form.height) || 0,
        order_list: Number(form.order_list) || 0,
        visible: Boolean(form.visible),
        usage: String(form.usage || "").trim(),
      });
      const refreshed = await getAdminMaterialByCode(nextCode);
      setDetail(refreshed);
      setForm(refreshed ? materialFormFromDetail(refreshed) : form);
      setSaveSuccess("Сохранено.");
      onSaved?.(nextCode, {
        usage: String(form.usage || "").trim(),
      });
      if (nextCode !== String(code)) {
        onCodeChanged?.(nextCode);
      }
    } catch (err) {
      setSaveError(formatRequestError(err));
    } finally {
      setSaving(false);
    }
  };

  const titleLabel = label || code || "—";

  return (
    <div className="admin-page__composition" ref={panelRef}>
      <div className="admin-page__composition-head">
        <h3 className="admin-page__composition-title">
          Материал: {titleLabel}
          {detail?.id != null ? (
            <span className="admin-page__count">id {detail.id}</span>
          ) : null}
        </h3>
        {showBackLink ? (
          <Link to="/admin?list=materials" className="admin-page__back-link">
            ← К списку материалов
          </Link>
        ) : code ? (
          <Link
            to={`/admin/materials/${encodeURIComponent(code)}`}
            className="admin-page__back-link"
          >
            Открыть карточку
          </Link>
        ) : null}
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
        <form
          className="admin-page__meta-form admin-page__meta-form--wide"
          onSubmit={handleSave}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="admin-page__composition-title">Редактирование</h3>
          <p className="admin-page__hint">
            Обязательные поля API: code, name, units, type, unit_pack &gt; 0,
            ratio_square &gt; 0.
          </p>

          <div className="admin-page__create-fields">
            <label className="admin-page__field">
              <span className="admin-page__field-label">Код</span>
              <input
                className="admin-page__input"
                value={form.code}
                onChange={(e) => setField("code", e.target.value)}
                disabled={saving}
                required
                autoComplete="off"
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Название</span>
              <input
                className="admin-page__input"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                disabled={saving}
                required
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Продукт</span>
              <input
                className="admin-page__input"
                value={form.product_name}
                onChange={(e) => setField("product_name", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Тип</span>
              <input
                className="admin-page__input"
                list={typeListId}
                value={form.type}
                onChange={(e) => setField("type", e.target.value)}
                disabled={saving}
                required
                placeholder="Тип материала"
              />
              <datalist id={typeListId}>
                {typeOptions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Ед. изм.</span>
              <input
                className="admin-page__input"
                value={form.units}
                onChange={(e) => setField("units", e.target.value)}
                disabled={saving}
                required
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Применение</span>
              <select
                className="admin-page__select admin-page__select--full"
                value={form.usage}
                onChange={(e) => handleUsageChange(e.target.value)}
                disabled={saving}
              >
                {MATERIAL_USAGE_FILTERS.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label} ({item.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Длина</span>
              <input
                className="admin-page__input"
                type="number"
                step="any"
                value={form.length}
                onChange={(e) => setField("length", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Ширина</span>
              <input
                className="admin-page__input"
                type="number"
                step="any"
                value={form.width}
                onChange={(e) => setField("width", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Высота</span>
              <input
                className="admin-page__input"
                type="number"
                step="any"
                value={form.height}
                onChange={(e) => setField("height", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">В упаковке</span>
              <input
                className="admin-page__input"
                type="number"
                min="1"
                step="any"
                value={form.unit_pack}
                onChange={(e) => setField("unit_pack", e.target.value)}
                disabled={saving}
                required
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Ratio м²</span>
              <input
                className="admin-page__input"
                type="number"
                min="0"
                step="any"
                value={form.ratio_square}
                onChange={(e) => setField("ratio_square", e.target.value)}
                disabled={saving}
                required
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Порядок</span>
              <input
                className="admin-page__input"
                type="number"
                step="1"
                value={form.order_list}
                onChange={(e) => setField("order_list", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Инфо упак.</span>
              <input
                className="admin-page__input"
                value={form.info_pack}
                onChange={(e) => setField("info_pack", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Вес</span>
              <input
                className="admin-page__input"
                value={form.weight}
                onChange={(e) => setField("weight", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Объём</span>
              <input
                className="admin-page__input"
                value={form.volume}
                onChange={(e) => setField("volume", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Нагрузка</span>
              <input
                className="admin-page__input"
                value={form.load_index}
                onChange={(e) => setField("load_index", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Изображение</span>
              <input
                className="admin-page__input"
                value={form.img}
                onChange={(e) => setField("img", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Схема</span>
              <input
                className="admin-page__input"
                value={form.scheme}
                onChange={(e) => setField("scheme", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field admin-page__field--wide">
              <span className="admin-page__field-label">Описание</span>
              <textarea
                className="admin-page__textarea"
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field admin-page__field--wide">
              <span className="admin-page__field-label">Спецификация</span>
              <textarea
                className="admin-page__textarea"
                rows={3}
                value={form.specification}
                onChange={(e) => setField("specification", e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="admin-page__field admin-page__field--checkbox">
              <span className="admin-page__field-label">
                <input
                  type="checkbox"
                  checked={form.visible}
                  onChange={(e) => setField("visible", e.target.checked)}
                  disabled={saving}
                />{" "}
                Видим в каталоге
              </span>
            </label>
          </div>

          <div className="admin-page__meta-actions">
            <button
              type="submit"
              className="admin-page__btn admin-page__btn--inline"
              disabled={saving}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>

          {saveError && (
            <div className="admin-page__error" role="alert">
              <p className="admin-page__error-title">Ошибка сохранения</p>
              <pre className="admin-page__error-body">{saveError}</pre>
            </div>
          )}
          {saveSuccess && (
            <p className="admin-page__success" role="status">
              {saveSuccess}
            </p>
          )}
        </form>
      )}

      {!loading && !error && detail ? (
        <>
          <div className="admin-page__composition-head admin-page__composition-head--spaced">
            <h3 className="admin-page__composition-title">
              Цены
              <span className="admin-page__count">
                {Array.isArray(detail.prices) ? detail.prices.length : 0} рег.
              </span>
            </h3>
          </div>
          <SimpleTable
            columns={MATERIAL_PRICE_COLUMNS}
            rows={Array.isArray(detail.prices) ? detail.prices : []}
            emptyText="Нет цен для этого материала."
          />
        </>
      ) : null}
    </div>
  );
}

function ConstructionDetail({
  constructionId,
  label,
  categoryCode,
  onUpdated,
  onDeleted,
}) {
  const [detail, setDetail] = useState(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [metaError, setMetaError] = useState(null);
  const [metaSuccess, setMetaSuccess] = useState(null);
  const [defaultMaterials, setDefaultMaterials] = useState([]);
  const [replacementGroups, setReplacementGroups] = useState([]);
  const [optionalMaterials, setOptionalMaterials] = useState([]);
  const [catalogMaterials, setCatalogMaterials] = useState([]);
  const [addByGroup, setAddByGroup] = useState({});
  const [addQueryByGroup, setAddQueryByGroup] = useState({});
  const [optionalAddArticle, setOptionalAddArticle] = useState("");
  const [optionalAddQuery, setOptionalAddQuery] = useState("");
  const [defaultAddArticle, setDefaultAddArticle] = useState("");
  const [defaultAddQuery, setDefaultAddQuery] = useState("");
  const [promoteItemId, setPromoteItemId] = useState("");
  const [promoteTypeId, setPromoteTypeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addError, setAddError] = useState(null);
  const [optionalAddError, setOptionalAddError] = useState(null);
  const [defaultAddError, setDefaultAddError] = useState(null);
  const [deletingMaterialId, setDeletingMaterialId] = useState(null);
  const [deletingOptionalId, setDeletingOptionalId] = useState(null);
  const [promoteError, setPromoteError] = useState(null);
  const [addingGroupKey, setAddingGroupKey] = useState(null);
  const [addingOptional, setAddingOptional] = useState(false);
  const [addingDefault, setAddingDefault] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const panelRef = useRef(null);

  const siCatalog = useMemo(
    () => filterMaterialsByUsageSi(catalogMaterials),
    [catalogMaterials]
  );

  const defaultArticles = useMemo(() => {
    const set = new Set();
    for (const row of defaultMaterials) {
      const article = String(row.code || row.material_code || "").trim();
      if (article) set.add(article);
    }
    return set;
  }, [defaultMaterials]);

  const defaultCandidates = useMemo(() => {
    return siCatalog
      .filter((mat) => {
        const article = String(mat.code || "").trim();
        if (!article) return false;
        return !defaultArticles.has(article);
      })
      .filter((mat) =>
        matchesQuery(mat, defaultAddQuery.trim(), ["code", "name", "type"])
      );
  }, [siCatalog, defaultArticles, defaultAddQuery]);

  /** Материалы по умолчанию без группы — кандидаты в заменяемые позиции. */
  const promotableDefaults = useMemo(
    () =>
      defaultMaterials.filter(
        (row) => row.replacement_group == null || row.replacement_group === ""
      ),
    [defaultMaterials]
  );

  const replacementMaterialTypes = useMemo(
    () => collectReplacementMaterialTypes(replacementGroups),
    [replacementGroups]
  );

  const defaultMaterialsColumns = useMemo(
    () => [
      ...COMPOSITION_COLUMNS,
      {
        key: "actions",
        label: "",
        render: (row) => {
          const itemId = Number(row.id);
          const article = String(
            row.code || row.material_code || itemId || ""
          ).trim();
          return (
            <DeleteIconButton
              deleting={deletingMaterialId === itemId}
              disabled={!Number.isFinite(itemId) || itemId <= 0}
              label={article}
              onClick={() => handleDeleteCompositionMaterial(row, "default")}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletingMaterialId]
  );

  const optionalMaterialsColumns = useMemo(
    () => [
      ...COMPOSITION_COLUMNS,
      {
        key: "actions",
        label: "",
        render: (row) => {
          const itemId = Number(row.id);
          const article = String(
            row.code || row.material_code || itemId || ""
          ).trim();
          return (
            <DeleteIconButton
              deleting={deletingOptionalId === itemId}
              disabled={!Number.isFinite(itemId) || itemId <= 0}
              label={article}
              onClick={() => handleDeleteOptionalMaterial(row)}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletingOptionalId]
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
      setDefaultAddError(null);
      setPromoteError(null);
      try {
        const [data, catalog] = await Promise.all([
          getAdminConstructionById(constructionId),
          listAdminMaterials().catch(() => []),
        ]);
        if (cancelled) return;
        setCatalogMaterials(catalog);
        setDetail(data?.detail ?? null);
        setEditCode(String(data?.detail?.code ?? ""));
        setEditName(String(data?.detail?.name ?? ""));
        setMetaError(null);
        setMetaSuccess(null);
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
        setAddByGroup({});
        setAddQueryByGroup({});
        setOptionalAddArticle("");
        setOptionalAddQuery("");
        setDefaultAddArticle("");
        setDefaultAddQuery("");
        setPromoteItemId("");
        setPromoteTypeId("");
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setEditCode("");
          setEditName("");
          setMetaError(null);
          setMetaSuccess(null);
          setDefaultMaterials([]);
          setReplacementGroups([]);
          setOptionalMaterials([]);
          setAddByGroup({});
          setAddQueryByGroup({});
          setOptionalAddArticle("");
          setOptionalAddQuery("");
          setDefaultAddArticle("");
          setDefaultAddQuery("");
          setPromoteItemId("");
          setPromoteTypeId("");
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

  const handleAddChange = (groupKey, value) => {
    setAddByGroup((prev) => ({ ...prev, [groupKey]: value }));
  };

  const handleAddQueryChange = (groupKey, value) => {
    setAddQueryByGroup((prev) => ({ ...prev, [groupKey]: value }));
    setAddByGroup((prev) => ({ ...prev, [groupKey]: "" }));
  };

  const handleSaveConstructionMeta = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!detail) return;

    const code = editCode.trim();
    const name = editName.trim();
    const typeId = Number(detail.type_id ?? detail.type?.id);
    const categoryId = Number(detail.category_id ?? detail.category?.id);

    if (!code || !name) {
      setMetaError("Код и название не должны быть пустыми.");
      setMetaSuccess(null);
      return;
    }
    if (!Number.isFinite(typeId) || typeId <= 0) {
      setMetaError("У конструкции нет type_id — сохранить нельзя.");
      setMetaSuccess(null);
      return;
    }
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      setMetaError("У конструкции нет category_id — сохранить нельзя.");
      setMetaSuccess(null);
      return;
    }

    setSavingMeta(true);
    setMetaError(null);
    setMetaSuccess(null);
    try {
      await updateAdminConstruction(constructionId, {
        code,
        name,
        type_id: typeId,
        category_id: categoryId,
      });
      setDetail((prev) => (prev ? { ...prev, code, name } : prev));
      setMetaSuccess("Код и название сохранены.");
      onUpdated?.({ id: constructionId, code, name });
    } catch (err) {
      setMetaError(formatRequestError(err));
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDeleteConstruction = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!detail || deleting) return;

    const code = String(detail.code || editCode || constructionId).trim();
    const ok = window.confirm(
      `Удалить конструкцию «${code}»? Это действие нельзя отменить.`
    );
    if (!ok) return;

    setDeleting(true);
    setMetaError(null);
    setMetaSuccess(null);
    try {
      await deleteAdminConstruction(constructionId);
      onDeleted?.({ id: constructionId });
    } catch (err) {
      setMetaError(formatRequestError(err));
      setDeleting(false);
    }
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

  const handleAddDefaultMaterial = async () => {
    const article = String(defaultAddArticle || "").trim();
    if (!article) {
      setDefaultAddError("Выберите материал из каталога по артикулу.");
      return;
    }

    const catalogItem = siCatalog.find(
      (m) => String(m.code || "").trim() === article
    );
    const materialId = Number(catalogItem?.id);
    if (!catalogItem || !Number.isFinite(materialId) || materialId <= 0) {
      setDefaultAddError(
        `Артикул «${article}» не найден в /admin/materials (usage=si).`
      );
      return;
    }

    const maxSort = defaultMaterials.reduce(
      (max, m) => Math.max(max, Number(m.sort_order) || 0),
      0
    );

    setAddingDefault(true);
    setDefaultAddError(null);
    try {
      await addAdminConstructionMaterial(constructionId, {
        id: materialId,
        weight: 1,
        sort_order: maxSort + 1,
        is_default: true,
        replacement_group: null,
        replacement_material_type_id: null,
      });
      setReloadToken((n) => n + 1);
    } catch (err) {
      setDefaultAddError(formatRequestError(err));
    } finally {
      setAddingDefault(false);
    }
  };

  const handleDeleteCompositionMaterial = async (row, source = "default") => {
    const itemId = Number(row.id);
    const setErr =
      source === "replacement" ? setAddError : setDefaultAddError;
    if (!Number.isFinite(itemId) || itemId <= 0) {
      setErr("У записи состава нет id — удалить нельзя.");
      return;
    }

    const article = String(row.code || row.material_code || itemId).trim();
    const isDefault = Boolean(row.is_default);
    let message = `Удалить материал «${article}» из материалов по умолчанию?`;
    if (source === "replacement") {
      message = isDefault
        ? `Удалить «${article}» из группы замены? Это default-вариант группы.`
        : `Удалить «${article}» из группы замены?`;
    } else if (
      row.replacement_group != null &&
      row.replacement_group !== ""
    ) {
      message = `Удалить «${article}» из состава? Он также является default в группе замены ${row.replacement_group}.`;
    }
    if (!window.confirm(message)) return;

    setDeletingMaterialId(itemId);
    setErr(null);
    try {
      await deleteAdminConstructionMaterial(constructionId, itemId);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setErr(formatRequestError(err));
    } finally {
      setDeletingMaterialId(null);
    }
  };

  const handleDeleteOptionalMaterial = async (row) => {
    const itemId = Number(row.id);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      setOptionalAddError("У записи доп. материала нет id — удалить нельзя.");
      return;
    }

    const article = String(row.code || row.material_code || itemId).trim();
    if (
      !window.confirm(
        `Удалить «${article}» из дополнительных материалов?`
      )
    ) {
      return;
    }

    setDeletingOptionalId(itemId);
    setOptionalAddError(null);
    try {
      await deleteAdminConstructionOptionalMaterial(constructionId, itemId);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setOptionalAddError(formatRequestError(err));
    } finally {
      setDeletingOptionalId(null);
    }
  };

  const handlePromoteDefaultToReplacement = async () => {
    const itemId = Number(promoteItemId);
    const typeId = Number(promoteTypeId);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      setPromoteError("Выберите материал из списка по умолчанию.");
      return;
    }
    if (!Number.isFinite(typeId) || typeId <= 0) {
      setPromoteError("Выберите тип группы замены.");
      return;
    }

    const row = promotableDefaults.find((m) => Number(m.id) === itemId);
    if (!row) {
      setPromoteError("Выбранный материал уже в группе замены или не найден.");
      return;
    }

    const materialId = Number(row.material_id ?? row.material?.id);
    if (!Number.isFinite(materialId) || materialId <= 0) {
      setPromoteError("У записи состава нет material.id.");
      return;
    }

    const nextGroup =
      replacementGroups.reduce(
        (max, g) => Math.max(max, Number(g.group) || 0),
        0
      ) + 1;

    setPromoting(true);
    setPromoteError(null);
    try {
      await updateAdminConstructionMaterial(constructionId, itemId, {
        id: materialId,
        weight: Number(row.weight) > 0 ? Number(row.weight) : 1,
        sort_order: Number(row.sort_order) >= 0 ? Number(row.sort_order) : 0,
        is_default: true,
        replacement_group: nextGroup,
        replacement_material_type_id: typeId,
      });
      setReloadToken((n) => n + 1);
    } catch (err) {
      setPromoteError(formatRequestError(err));
    } finally {
      setPromoting(false);
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
          <form
            className="admin-page__meta-form"
            onSubmit={handleSaveConstructionMeta}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="admin-page__composition-title">
              Редактирование конструкции
            </h3>
            <p className="admin-page__hint">
              Код и название можно менять только в открытой карточке. Удаление
              тоже только отсюда.
            </p>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Код</span>
              <input
                type="text"
                className="admin-page__input"
                value={editCode}
                disabled={savingMeta || deleting}
                onChange={(e) => {
                  setEditCode(e.target.value);
                  setMetaSuccess(null);
                }}
                required
                autoComplete="off"
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Название</span>
              <input
                type="text"
                className="admin-page__input"
                value={editName}
                disabled={savingMeta || deleting}
                onChange={(e) => {
                  setEditName(e.target.value);
                  setMetaSuccess(null);
                }}
                required
                autoComplete="off"
              />
            </label>
            <div className="admin-page__meta-actions">
              <button
                type="submit"
                className="admin-page__btn admin-page__btn--inline"
                disabled={
                  savingMeta ||
                  deleting ||
                  !editCode.trim() ||
                  !editName.trim() ||
                  (editCode.trim() === String(detail.code ?? "").trim() &&
                    editName.trim() === String(detail.name ?? "").trim())
                }
              >
                {savingMeta ? "Сохранение…" : "Сохранить"}
              </button>
              <button
                type="button"
                className="admin-page__btn admin-page__btn--inline admin-page__btn--danger"
                disabled={savingMeta || deleting}
                onClick={handleDeleteConstruction}
              >
                {deleting ? "Удаление…" : "Удалить"}
              </button>
            </div>
            {metaError && (
              <div className="admin-page__error" role="alert">
                <p className="admin-page__error-title">Ошибка</p>
                <pre className="admin-page__error-body">{metaError}</pre>
              </div>
            )}
            {metaSuccess && (
              <p className="admin-page__success" role="status">
                {metaSuccess}
              </p>
            )}
          </form>

          <KeyValueTable fields={CONSTRUCTION_DETAIL_FIELDS} data={detail} />

          <div className="admin-page__composition-head admin-page__composition-head--spaced">
            <h3 className="admin-page__composition-title">
              Материалы по умолчанию
              <span className="admin-page__count">
                {defaultMaterials.length} мат.
              </span>
            </h3>
          </div>

          {defaultAddError && (
            <div className="admin-page__error" role="alert">
              <p className="admin-page__error-title">
                Ошибка материалов по умолчанию
              </p>
              <pre className="admin-page__error-body">{defaultAddError}</pre>
            </div>
          )}

          <SimpleTable
            columns={defaultMaterialsColumns}
            rows={defaultMaterials}
            emptyText="Нет материалов по умолчанию."
          />

          <div className="admin-page__optional-add">
            <input
              type="search"
              className="admin-page__search admin-page__search--inline"
              placeholder="Поиск по артикулу, названию…"
              value={defaultAddQuery}
              disabled={addingDefault || !siCatalog.length}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                setDefaultAddQuery(e.target.value);
                setDefaultAddArticle("");
              }}
              aria-label="Поиск материала по умолчанию usage=si"
            />
            <select
              className="admin-page__select"
              value={defaultAddArticle}
              disabled={addingDefault || !defaultCandidates.length}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                setDefaultAddArticle(e.target.value);
              }}
              aria-label="Добавить материал по умолчанию usage=si"
            >
              <option value="">
                {!siCatalog.length
                  ? "Нет материалов с usage=si"
                  : defaultCandidates.length
                    ? `Добавить из каталога… (${defaultCandidates.length})`
                    : defaultAddQuery.trim()
                      ? "Ничего не найдено по запросу"
                      : "Все подходящие уже в составе"}
              </option>
              {defaultCandidates.map((mat) => {
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
              disabled={addingDefault || !defaultAddArticle}
              onClick={(e) => {
                e.stopPropagation();
                handleAddDefaultMaterial();
              }}
            >
              {addingDefault ? "Добавление…" : "Добавить"}
            </button>
          </div>

          <div className="admin-page__composition-head admin-page__composition-head--spaced">
            <h3 className="admin-page__composition-title">
              Заменяемые материалы
              <span className="admin-page__count">
                {replacementGroups.length} групп
              </span>
            </h3>
          </div>
          <p className="admin-page__hint">
            Выберите материал из списка по умолчанию и тип группы — он станет
            заменяемой позицией (default в новой группе).
          </p>

          {promoteError && (
            <div className="admin-page__error" role="alert">
              <p className="admin-page__error-title">
                Не удалось добавить в заменяемые
              </p>
              <pre className="admin-page__error-body">{promoteError}</pre>
            </div>
          )}

          <div className="admin-page__optional-add">
            <select
              className="admin-page__select"
              value={promoteItemId}
              disabled={promoting || !promotableDefaults.length}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                setPromoteItemId(e.target.value);
              }}
              aria-label="Материал по умолчанию для заменяемой позиции"
            >
              <option value="">
                {!promotableDefaults.length
                  ? "Нет материалов по умолчанию без группы"
                  : `Из материалов по умолчанию… (${promotableDefaults.length})`}
              </option>
              {promotableDefaults.map((row) => (
                <option key={row.id} value={row.id}>
                  {materialOptionLabel(row)}
                </option>
              ))}
            </select>
            <select
              className="admin-page__select"
              value={promoteTypeId}
              disabled={promoting || !replacementMaterialTypes.length}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                setPromoteTypeId(e.target.value);
              }}
              aria-label="Тип группы замены"
            >
              <option value="">Тип группы…</option>
              {replacementMaterialTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name || type.code}
                  {type.code ? ` (${type.code})` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="admin-page__btn admin-page__btn--inline"
              disabled={promoting || !promoteItemId || !promoteTypeId}
              onClick={(e) => {
                e.stopPropagation();
                handlePromoteDefaultToReplacement();
              }}
            >
              {promoting ? "Добавление…" : "В заменяемые"}
            </button>
          </div>

          {addError && (
            <div className="admin-page__error" role="alert">
              <p className="admin-page__error-title">
                Ошибка заменяемых материалов
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
                    <div className="admin-page__replacement-type">
                      {typeLabel}
                    </div>

                    {group.materials?.length ? (
                      <ul className="admin-page__replacement-list">
                        {group.materials.map((mat, matIdx) => {
                          const itemId = Number(mat.id);
                          const article = String(
                            mat.code || mat.material_code || itemId || matIdx
                          ).trim();
                          return (
                            <li
                              key={
                                Number.isFinite(itemId) && itemId > 0
                                  ? itemId
                                  : `${groupKey}-${article}-${matIdx}`
                              }
                              className="admin-page__replacement-list-item"
                            >
                              <span className="admin-page__replacement-list-label">
                                {materialOptionLabel(mat)}
                                {mat.is_default ? (
                                  <span className="admin-page__pill">
                                    default
                                  </span>
                                ) : null}
                              </span>
                              <DeleteIconButton
                                deleting={deletingMaterialId === itemId}
                                disabled={
                                  !Number.isFinite(itemId) || itemId <= 0
                                }
                                label={article}
                                onClick={() =>
                                  handleDeleteCompositionMaterial(
                                    mat,
                                    "replacement"
                                  )
                                }
                              />
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="admin-page__empty admin-page__empty--inline">
                        Нет вариантов в группе.
                      </p>
                    )}

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
                Ошибка дополнительных материалов
              </p>
              <pre className="admin-page__error-body">{optionalAddError}</pre>
            </div>
          )}

          <SimpleTable
            columns={optionalMaterialsColumns}
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
  const [reloadToken, setReloadToken] = useState(0);
  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createTypeId, setCreateTypeId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  const isSoundCategory = category === "sound";

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
  }, [category, reloadToken]);

  useEffect(() => {
    setCreateCode("");
    setCreateName("");
    setCreateError(null);
    setCreateSuccess(null);
  }, [category]);

  const constructionTypes = useMemo(
    () => collectConstructionTypes(rows),
    [rows]
  );

  const soundCategoryId = useMemo(
    () => pickCategoryIdFromRows(rows, "sound"),
    [rows]
  );

  useEffect(() => {
    if (!isSoundCategory) return;
    if (
      createTypeId &&
      constructionTypes.some((t) => String(t.id) === String(createTypeId))
    ) {
      return;
    }
    setCreateTypeId(
      constructionTypes.length ? String(constructionTypes[0].id) : ""
    );
  }, [isSoundCategory, constructionTypes, createTypeId]);

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

  const handleConstructionUpdated = ({ id, code, name }) => {
    setRows((prev) =>
      prev.map((item) =>
        getConstructionId(item) === id ? { ...item, code, name } : item
      )
    );
  };

  const handleConstructionDeleted = ({ id }) => {
    setRows((prev) => prev.filter((item) => getConstructionId(item) !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const handleCreateConstruction = async (e) => {
    e.preventDefault();
    if (!isSoundCategory) return;

    const code = createCode.trim();
    const name = createName.trim();
    const typeId = Number(createTypeId);
    const categoryId = soundCategoryId;

    if (!code || !name) {
      setCreateError("Укажите код и название конструкции.");
      setCreateSuccess(null);
      return;
    }
    if (!Number.isFinite(typeId) || typeId <= 0) {
      setCreateError("Выберите тип конструкции.");
      setCreateSuccess(null);
      return;
    }
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      setCreateError(
        "Не удалось определить category_id звукоизоляции из списка."
      );
      setCreateSuccess(null);
      return;
    }

    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await createAdminConstruction({
        code,
        name,
        type_id: typeId,
        category_id: categoryId,
      });
      setCreateCode("");
      setCreateName("");
      setCreateSuccess(`Конструкция «${code}» создана.`);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setCreateError(formatRequestError(err));
    } finally {
      setCreating(false);
    }
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

      {isSoundCategory && (
        <form
          className="admin-page__create-form"
          onSubmit={handleCreateConstruction}
        >
          <h3 className="admin-page__create-title">
            Новая конструкция звукоизоляции
          </h3>
          <p className="admin-page__hint">
            Создаёт запись через POST /admin/constructions. Материалы можно
            добавить после открытия карточки.
          </p>
          <div className="admin-page__create-fields">
            <label className="admin-page__field">
              <span className="admin-page__field-label">Код</span>
              <input
                type="text"
                className="admin-page__input"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                placeholder="Например AG.W199"
                disabled={creating || loading}
                required
                autoComplete="off"
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Название</span>
              <input
                type="text"
                className="admin-page__input"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Название конструкции"
                disabled={creating || loading}
                required
                autoComplete="off"
              />
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Тип</span>
              <select
                className="admin-page__select admin-page__select--full"
                value={createTypeId}
                onChange={(e) => setCreateTypeId(e.target.value)}
                disabled={creating || loading || !constructionTypes.length}
                required
                aria-label="Тип конструкции"
              >
                {!constructionTypes.length ? (
                  <option value="">Нет типов в списке</option>
                ) : (
                  constructionTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name || type.code || `ID ${type.id}`}
                      {type.code ? ` (${type.code})` : ""}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="submit"
              className="admin-page__btn admin-page__btn--inline admin-page__create-submit"
              disabled={
                creating ||
                loading ||
                !createCode.trim() ||
                !createName.trim() ||
                !createTypeId ||
                !soundCategoryId
              }
            >
              {creating ? "Создание…" : "Создать"}
            </button>
          </div>
          {createError && (
            <div className="admin-page__error" role="alert">
              <p className="admin-page__error-title">
                Не удалось создать конструкцию
              </p>
              <pre className="admin-page__error-body">{createError}</pre>
            </div>
          )}
          {createSuccess && (
            <p className="admin-page__success" role="status">
              {createSuccess}
            </p>
          )}
        </form>
      )}

      <p className="admin-page__hint">
        Нажмите на строку, чтобы раскрыть карточку конструкции. Код и название
        редактируются внутри карточки.
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
                          onUpdated={handleConstructionUpdated}
                          onDeleted={handleConstructionDeleted}
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

export function AdminMaterialPage() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const code = decodeURIComponent(String(routeCode || "").trim());

  if (!code) {
    return <Navigate to="/admin?list=materials" replace />;
  }

  return (
    <AdminGate>
      <div className="admin-page">
        <div className="admin-page__header">
          <h1 className="admin-page__title">Материал</h1>
        </div>
        <MaterialDetail
          code={code}
          label={code}
          showBackLink
          onCodeChanged={(nextCode) => {
            navigate(`/admin/materials/${encodeURIComponent(nextCode)}`, {
              replace: true,
            });
          }}
        />
      </div>
    </AdminGate>
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
