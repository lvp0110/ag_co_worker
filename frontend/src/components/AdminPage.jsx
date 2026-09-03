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
  addAdminConstructionCalculationParam,
  addAdminConstructionMaterial,
  addAdminConstructionOptionalMaterial,
  collectConstructionCategories,
  collectConstructionTypes,
  collectReplacementMaterialTypes,
  CONSTRUCTION_PARAM_TYPE_BOOL,
  createAdminCommerceRegion,
  createAdminConstruction,
  createAdminMaterialFromUnmatched,
  deleteAdminCommerceRegion,
  deleteAdminConstruction,
  deleteAdminConstructionCalculationParam,
  deleteAdminConstructionMaterial,
  deleteAdminConstructionOptionalMaterial,
  deleteAdminMaterial,
  enrichCompositionFromMaterialsCatalog,
  expandMaterialPricesWithDerivedRegions,
  filterMaterialsByUsage,
  filterMaterialsByUsageSi,
  getAdminConstructionById,
  getAdminMaterialByCode,
  getCalculationTypeId,
  getConstructionId,
  getConstructionPriceRegionIds,
  getMaterialCode,
  getMaterialTypeId,
  getPriceRegionBaseId,
  getReplacementMaterialTypeId,
  isDirectPriceRegion,
  listAdminCommerceRegions,
  listAdminConstructionCalculationParams,
  listAdminConstructionCalculationTypes,
  listAdminConstructionParams,
  listAdminConstructions,
  listAdminMaterials,
  listAdminMaterialTypes,
  listConstructionTypes,
  listUnmatchedMaterials,
  orderPriceRegions,
  PRICE_REGION_MODE_DERIVED,
  pickCategoryIdFromRows,
  sameIdSet,
  uniquePositiveIds,
  updateAdminCommerceRegion,
  updateAdminConstruction,
  updateAdminConstructionCalculationParam,
  updateAdminConstructionMaterial,
  updateAdminConstructionOptionalMaterial,
  updateAdminMaterial,
} from "../services/adminApi.js";
import { formatRequestError } from "../services/apiClient.js";
import AdminCollapsibleSection from "./AdminCollapsibleSection.jsx";
import AdminConstructionImages from "./AdminConstructionImages.jsx";
import AdminConstructionSizeLimits from "./AdminConstructionSizeLimits.jsx";
import "./AdminPage.css";

const MATERIAL_USAGE_FILTERS = [
  { code: "si", label: "Звукоизоляция" },
  { code: "ac", label: "Акустика" },
  { code: "vi", label: "Виброизоляция" },
];

const MATERIALS_COMPARE_MODE = "compare";

const materialTypeOptionLabel = (type) => {
  if (!type) return "";
  const name = String(type.name || "").trim();
  const code = String(type.code || "").trim();
  if (name && code && name !== code) return `${name} (${code})`;
  return name || code || String(type.id || "");
};

const materialTypeDisplay = (obj) => {
  if (!obj) return "";
  if (obj.type && typeof obj.type === "object") {
    return String(obj.type.name || obj.type.code || "").trim();
  }
  return String(
    obj.type_name || obj.type_code || (typeof obj.type === "string" ? obj.type : "")
  ).trim();
};

const withCurrentMaterialType = (catalogTypes, currentId, fallback) => {
  const id = Number(currentId);
  if (!Number.isFinite(id) || id <= 0) return catalogTypes;
  if (catalogTypes.some((item) => Number(item.id) === id)) return catalogTypes;
  return [
    {
      id,
      code: String(fallback?.code || fallback?.type_code || "").trim(),
      name: String(
        fallback?.name || fallback?.type_name || fallback?.code || id
      ).trim(),
    },
    ...catalogTypes,
  ];
};

const MATERIAL_COLUMNS = [
  { key: "code", label: "Код", className: "admin-page__col--code" },
  { key: "name", label: "Название", className: "admin-page__col--grow" },
  {
    key: "product_name",
    label: "Продукт",
    className: "admin-page__col--grow",
  },
  {
    key: "type",
    label: "Тип",
    className: "admin-page__col--compact",
    render: (row) => cell(materialTypeDisplay(row)),
  },
  {
    key: "usage",
    label: "Применение",
    className: "admin-page__col--compact",
    render: (row) => {
      const code = String(row.usage || "").trim().toLowerCase();
      const item = MATERIAL_USAGE_FILTERS.find((f) => f.code === code);
      return item ? `${item.label} (${item.code})` : cell(row.usage);
    },
  },
  { key: "units", label: "Ед.", className: "admin-page__col--compact" },
  {
    key: "updated_at",
    label: "Обновлён",
    className: "admin-page__col--datetime",
    render: (row) => {
      if (!row.updated_at) return "—";
      const d = new Date(row.updated_at);
      return Number.isNaN(d.getTime())
        ? String(row.updated_at)
        : d.toLocaleString("ru-RU");
    },
  },
];

const MATERIAL_PRICE_COLUMNS = [
  {
    key: "region",
    label: "Регион",
    className: "admin-page__col--grow",
    render: (row) =>
      cell(row.region?.name || row.region?.code || row.region?.id),
  },
  {
    key: "source",
    label: "Источник",
    className: "admin-page__col--compact",
    render: (row) => {
      if (row.derived) {
        const coef = Number(row.price_coefficient);
        return Number.isFinite(coef)
          ? `дочерний × ${coef}`
          : "дочерний";
      }
      return "базовый";
    },
  },
  {
    key: "price",
    label: "Цена",
    className: "admin-page__col--compact",
    render: (row) => cell(row.price),
  },
  {
    key: "m2",
    label: "₽/м²",
    className: "admin-page__col--compact",
    render: (row) => cell(row.m2),
  },
  {
    key: "currency_code",
    label: "Валюта",
    className: "admin-page__col--compact",
  },
];

const CONSTRUCTION_COLUMNS = [
  { key: "id", label: "ID", className: "admin-page__col--num" },
  { key: "code", label: "Код", className: "admin-page__col--code" },
  { key: "name", label: "Название", className: "admin-page__col--grow" },
  {
    key: "type",
    label: "Тип",
    className: "admin-page__col--code",
    render: (row) =>
      cell(
        row.type_name ??
          row.type_code ??
          row.type?.name ??
          row.type?.code
      ),
  },
  {
    key: "category",
    label: "Категория",
    className: "admin-page__col--code",
    render: (row) =>
      cell(
        row.category_name ??
          row.category_code ??
          row.category?.name ??
          row.category?.code
      ),
  },
  {
    key: "price_regions",
    label: "Регионы",
    className: "admin-page__col--code",
    render: (row) => {
      const regions = Array.isArray(row.price_regions) ? row.price_regions : [];
      const codes = regions
        .map((item) => String(item?.code || "").trim())
        .filter(Boolean);
      return cell(codes.join(", "));
    },
  },
];

const activePriceRegions = (regions) =>
  orderPriceRegions(regions).filter((row) => row.is_active !== false);

function AdminConstructionRegionsField({
  regions,
  selectedIds,
  disabled,
  onChange,
}) {
  const ordered = useMemo(() => activePriceRegions(regions), [regions]);
  const allIds = useMemo(
    () => ordered.map((row) => Number(row.id)),
    [ordered]
  );
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
  const someSelected = allIds.some((id) => selectedIds.includes(id));
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [allSelected, someSelected]);

  const toggle = (id) => {
    const has = selectedIds.includes(id);
    onChange(has ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  };

  if (!ordered.length) {
    return (
      <div className="admin-page__field admin-page__field--regions">
        <span className="admin-page__field-label">Регионы продаж</span>
        <p className="admin-page__hint">
          Нет активных регионов. Добавьте их во вкладке «Регионы».
        </p>
      </div>
    );
  }

  return (
    <fieldset className="admin-page__field admin-page__field--regions">
      <legend className="admin-page__field-label">Регионы продаж</legend>
      <p className="admin-page__hint">
        Нужен хотя бы один — иначе конструкция не появится в калькуляторе.
      </p>
      <div className="admin-page__region-checks">
        <label className="admin-page__region-check admin-page__region-check--all">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            disabled={disabled}
            onChange={() => onChange(allSelected ? [] : allIds)}
          />
          <span className="admin-page__region-check-label">Выбрать все</span>
        </label>
        {ordered.map((region) => {
          const id = Number(region.id);
          const checked = selectedIds.includes(id);
          const label = String(region.name || region.code || `ID ${id}`).trim();
          return (
            <label key={id} className="admin-page__region-check">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(id)}
              />
              <span className="admin-page__region-check-label">{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

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
  type_id: "",
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
  type_id: String(getMaterialTypeId(detail) ?? ""),
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
  { key: "code", label: "Код", className: "admin-page__col--code" },
  { key: "name", label: "Название", className: "admin-page__col--grow" },
  { key: "units", label: "Ед.", className: "admin-page__col--compact" },
  {
    key: "prices",
    label: "Цены",
    className: "admin-page__col--grow",
    render: (row) => formatUnmatchedPrices(row.prices),
  },
  {
    key: "created_at",
    label: "Добавлен",
    className: "admin-page__col--compact",
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
  onCancel,
  onCreated,
}) {
  const [name, setName] = useState(() => String(row.name || "").trim());
  const [productName, setProductName] = useState(() =>
    String(row.name || "").trim()
  );
  const [units, setUnits] = useState(() => String(row.units || "").trim());
  const [typeId, setTypeId] = useState(() =>
    typeOptions[0]?.id != null ? String(typeOptions[0].id) : ""
  );
  const [usage, setUsage] = useState(MATERIAL_USAGE_FILTERS[0].code);
  const [unitPack, setUnitPack] = useState("1");
  const [ratioSquare, setRatioSquare] = useState("1");
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (typeId) return;
    if (typeOptions[0]?.id != null) setTypeId(String(typeOptions[0].id));
  }, [typeOptions, typeId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const code = String(row.code || "").trim();
    const pack = Number(unitPack);
    const ratio = Number(ratioSquare);
    const parsedTypeId = Number(typeId);
    if (!code) {
      setFormError("Нет кода материала.");
      return;
    }
    if (!name.trim() || !units.trim() || !Number.isFinite(parsedTypeId) || parsedTypeId <= 0) {
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
        type_id: parsedTypeId,
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
          <select
            className="admin-page__select admin-page__select--full"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            disabled={saving || !typeOptions.length}
            required
          >
            {!typeOptions.length ? (
              <option value="">Нет типов в справочнике</option>
            ) : (
              typeOptions.map((opt) => (
                <option key={opt.id} value={String(opt.id)}>
                  {materialTypeOptionLabel(opt)}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="admin-page__field">
          <span className="admin-page__field-label">Применение</span>
          <select
            className="admin-page__select admin-page__select--full"
            value={usage}
            onChange={(e) => setUsage(e.target.value)}
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
  { key: "sort_order", label: "№", className: "admin-page__col--num" },
  { key: "material_id", label: "ID мат.", className: "admin-page__col--compact" },
  { key: "code", label: "Код", className: "admin-page__col--code" },
  { key: "name", label: "Название", className: "admin-page__col--grow" },
  { key: "weight", label: "Вес", className: "admin-page__col--compact" },
];

function CalculationTypeSelect({
  value,
  options,
  disabled,
  onChange,
  ariaLabel,
}) {
  return (
    <select
      className="admin-page__select admin-page__select--calc"
      value={value || ""}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onChange?.(e.target.value);
      }}
      aria-label={ariaLabel || "Тип расчёта"}
    >
      <option value="">Тип расчёта…</option>
      {options.map((opt) => (
        <option key={opt.id} value={String(opt.id)}>
          {materialTypeOptionLabel(opt)}
        </option>
      ))}
    </select>
  );
}

const calcTypeIdPayload = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

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

/** Кандидаты на замену: тот же type_id, другой code (сначала тот же usage). */
const sameTypeCandidates = (catalog, material) => {
  const code = getMaterialCode(material);
  const typeId = getMaterialTypeId(material);
  const typeCode = String(
    material?.type_code ||
      material?.type?.code ||
      (typeof material?.type === "string" ? material.type : "")
  )
    .trim()
    .toLowerCase();
  const usage = String(material?.usage || "")
    .trim()
    .toLowerCase();
  if (!code || (!typeId && !typeCode)) return [];

  return (catalog || [])
    .filter((row) => {
      const rowCode = getMaterialCode(row);
      if (!rowCode || rowCode === code) return false;
      const rowTypeId = getMaterialTypeId(row);
      if (typeId && rowTypeId) return rowTypeId === typeId;
      const rowTypeCode = String(
        row.type_code ||
          row.type?.code ||
          (typeof row.type === "string" ? row.type : "")
      )
        .trim()
        .toLowerCase();
      return Boolean(typeCode) && rowTypeCode === typeCode;
    })
    .sort((a, b) => {
      const au = String(a.usage || "").trim().toLowerCase() === usage ? 0 : 1;
      const bu = String(b.usage || "").trim().toLowerCase() === usage ? 0 : 1;
      if (au !== bu) return au - bu;
      return materialOptionLabel(a).localeCompare(materialOptionLabel(b), "ru");
    });
};

function MaterialDeleteForm({
  material,
  candidates,
  saving,
  error,
  onConfirm,
  onCancel,
}) {
  const firstCode = getMaterialCode(candidates[0]) || "";
  const [replacementCode, setReplacementCode] = useState(firstCode);
  const code = getMaterialCode(material);
  const label = materialOptionLabel(material);
  const selectedReplacement =
    replacementCode &&
    candidates.some((row) => getMaterialCode(row) === replacementCode)
      ? replacementCode
      : firstCode;

  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!code) return;
    if (candidates.length && !selectedReplacement) return;
    onConfirm?.({
      code,
      replacementCode: candidates.length ? selectedReplacement : "",
    });
  };

  return (
    <form
      className="admin-page__meta-form admin-page__meta-form--wide"
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="admin-page__composition-title">
        Удаление материала: {label}
      </h3>

      {candidates.length ? (
        <>
          <ul className="admin-page__delete-candidates">
            {candidates.map((row) => {
              const rowCode = getMaterialCode(row);
              const usageLabel =
                MATERIAL_USAGE_FILTERS.find(
                  (item) => item.code === String(row.usage || "").trim()
                )?.label || row.usage;
              return (
                <li key={rowCode} className="admin-page__delete-candidate">
                  <label className="admin-page__field admin-page__field--checkbox">
                    <span className="admin-page__field-label">
                      <input
                        type="radio"
                        name={`material-delete-replacement-${code}`}
                        value={rowCode}
                        checked={selectedReplacement === rowCode}
                        onChange={() => setReplacementCode(rowCode)}
                        disabled={saving}
                      />{" "}
                      {materialOptionLabel(row)}
                      {usageLabel ? (
                        <span className="admin-page__count">{usageLabel}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {error && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Не удалось удалить</p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      )}

      <div className="admin-page__meta-actions">
        <button
          type="submit"
          className="admin-page__btn admin-page__btn--inline admin-page__btn--danger"
          disabled={
            saving || (candidates.length > 0 && !selectedReplacement)
          }
        >
          {saving ? "Удаление…" : "Удалить"}
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

const NEW_REPLACEMENT_GROUP = "new";

function replacementGroupOptionLabel(group) {
  const typeLabel = groupTypeLabel(group);
  if (group.group == null || group.group === "") return typeLabel;
  const groupNo = String(group.group);
  if (typeLabel === `Группа ${groupNo}`) return typeLabel;
  return `${typeLabel} (${groupNo})`;
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
    if (v == null) return false;
    if (typeof v === "object") {
      const s = [v.name, v.code, v.id]
        .filter((part) => part != null && part !== "")
        .join(" ")
        .toLowerCase();
      return s.includes(q);
    }
    return String(v).toLowerCase().includes(q);
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
              <th key={col.key} className={col.className}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id ?? row.code ?? row.article ?? row.material_id ?? idx}>
              {columns.map((col) => (
                <td key={col.key} className={col.className}>
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
  const [materialTypes, setMaterialTypes] = useState([]);
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
  const [deletingCode, setDeletingCode] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [pendingDeleteCode, setPendingDeleteCode] = useState(null);
  const isCompare = usage === MATERIALS_COMPARE_MODE;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [data, types] = await Promise.all([
          listAdminMaterials(),
          listAdminMaterialTypes().catch(() => []),
        ]);
        if (!cancelled) {
          setRows(data);
          setMaterialTypes(types);
        }
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setMaterialTypes([]);
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
    setDeleteError(null);
    setPendingDeleteCode(null);
  }, [usage]);

  const catalogTypeOptions = materialTypes;

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
        "type_name",
        "type_code",
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
    setPendingDeleteCode(null);
    setDeleteError(null);
    setSelectedCode((prev) => (prev === code ? null : code));
  };

  const pendingDeleteRow = useMemo(
    () =>
      pendingDeleteCode
        ? rows.find((row) => getMaterialCode(row) === pendingDeleteCode) ??
          null
        : null,
    [rows, pendingDeleteCode]
  );

  const pendingDeleteCandidates = useMemo(
    () => sameTypeCandidates(rows, pendingDeleteRow),
    [rows, pendingDeleteRow]
  );

  const handleDeleteMaterial = async ({ code, replacementCode }) => {
    if (!code) return;
    setDeletingCode(code);
    setDeleteError(null);
    try {
      await deleteAdminMaterial(code, { replacementCode });
      if (selectedCode === code) setSelectedCode(null);
      setPendingDeleteCode(null);
      setUnmatchedReloadToken((t) => t + 1);
    } catch (err) {
      setDeleteError(formatRequestError(err));
    } finally {
      setDeletingCode(null);
    }
  };

  const materialColumns = useMemo(
    () => [
      ...MATERIAL_COLUMNS,
      {
        key: "actions",
        label: "",
        render: (row) => {
          const code = getMaterialCode(row);
          return (
            <DeleteIconButton
              deleting={deletingCode != null && deletingCode === code}
              disabled={!code || deletingCode != null}
              label={code || "материал"}
              onClick={() => {
                setDeleteError(null);
                setSelectedCode(null);
                setPendingDeleteCode(code);
              }}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletingCode]
  );

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

      {isCompare ? null : pendingDeleteRow ? (
        <MaterialDeleteForm
          key={pendingDeleteCode}
          material={pendingDeleteRow}
          candidates={pendingDeleteCandidates}
          saving={deletingCode === pendingDeleteCode}
          error={deleteError}
          onConfirm={handleDeleteMaterial}
          onCancel={() => {
            setPendingDeleteCode(null);
            setDeleteError(null);
          }}
        />
      ) : null}

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
                    <th key={col.key} className={col.className}>
                      {col.label}
                    </th>
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
                          <td key={col.key} className={col.className}>
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
                {materialColumns.map((col) => (
                  <th key={col.key} className={col.className}>
                    {col.label}
                  </th>
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
                    columns={materialColumns}
                    selected={selected}
                    onSelect={handleSelect}
                    colSpan={materialColumns.length}
                    detail={
                      selected ? (
                        <MaterialDetail
                          code={code}
                          label={selectedLabel}
                          typeOptions={catalogTypeOptions}
                          catalogMaterials={rows}
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
                          onDeleted={() => {
                            setSelectedCode(null);
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

function MaterialDetail({
  code,
  label,
  showBackLink = false,
  onCodeChanged,
  onSaved,
  onDeleted,
  typeOptions: typeOptionsProp,
  catalogMaterials: catalogMaterialsProp,
}) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyMaterialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [typeOptionsLocal, setTypeOptionsLocal] = useState([]);
  const [catalogLocal, setCatalogLocal] = useState([]);
  const [priceRegions, setPriceRegions] = useState([]);
  const panelRef = useRef(null);

  const catalogMaterials = catalogMaterialsProp || catalogLocal;
  const catalogTypes = typeOptionsProp || typeOptionsLocal;
  const typeOptions = useMemo(
    () =>
      withCurrentMaterialType(catalogTypes, form.type_id, {
        code: detail?.type_code || detail?.type?.code,
        name: detail?.type_name || detail?.type?.name,
        type_code: detail?.type_code,
        type_name: detail?.type_name,
      }),
    [catalogTypes, form.type_id, detail]
  );

  const deleteCandidates = useMemo(
    () =>
      sameTypeCandidates(catalogMaterials, {
        code,
        type_id: form.type_id || getMaterialTypeId(detail),
        type: detail?.type,
        type_code: detail?.type_code,
        usage: form.usage || detail?.usage,
        name: form.name || detail?.name,
      }),
    [catalogMaterials, code, form.type_id, form.usage, form.name, detail]
  );

  const priceRows = useMemo(
    () => expandMaterialPricesWithDerivedRegions(detail?.prices, priceRegions),
    [detail?.prices, priceRegions]
  );

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(null);
  };

  useEffect(() => {
    if (typeOptionsProp && catalogMaterialsProp) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [data, types] = await Promise.all([
          catalogMaterialsProp ? Promise.resolve(null) : listAdminMaterials(),
          typeOptionsProp ? Promise.resolve(null) : listAdminMaterialTypes(),
        ]);
        if (!cancelled) {
          if (!typeOptionsProp) setTypeOptionsLocal(types || []);
          if (!catalogMaterialsProp) setCatalogLocal(data || []);
        }
      } catch {
        if (!cancelled) {
          if (!typeOptionsProp) setTypeOptionsLocal([]);
          if (!catalogMaterialsProp) setCatalogLocal([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typeOptionsProp, catalogMaterialsProp]);

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSaveError(null);
      setSaveSuccess(null);
      setConfirmDelete(false);
      try {
        const [data, regions] = await Promise.all([
          getAdminMaterialByCode(code),
          listAdminCommerceRegions().catch(() => []),
        ]);
        if (!cancelled) {
          setDetail(data);
          setForm(data ? materialFormFromDetail(data) : emptyMaterialForm());
          setPriceRegions(Array.isArray(regions) ? regions : []);
        }
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setForm(emptyMaterialForm());
          setPriceRegions([]);
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
    const typeId = Number(form.type_id);
    const pack = Number(form.unit_pack);
    const ratio = Number(form.ratio_square);

    if (!nextCode || !name || !units || !Number.isFinite(typeId) || typeId <= 0) {
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
        type_id: typeId,
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

  const handleDelete = async ({ code: deleteCode, replacementCode }) => {
    if (!deleteCode) return;

    setDeleting(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      await deleteAdminMaterial(deleteCode, { replacementCode });
      setConfirmDelete(false);
      onDeleted?.(deleteCode);
    } catch (err) {
      setSaveError(formatRequestError(err));
    } finally {
      setDeleting(false);
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
              <select
                className="admin-page__select admin-page__select--full"
                value={form.type_id}
                onChange={(e) => setField("type_id", e.target.value)}
                disabled={saving || !typeOptions.length}
                required
              >
                {!typeOptions.length ? (
                  <option value="">Нет типов в справочнике</option>
                ) : (
                  <>
                    {!form.type_id ? (
                      <option value="">Выберите тип…</option>
                    ) : null}
                    {typeOptions.map((opt) => (
                      <option key={opt.id} value={String(opt.id)}>
                        {materialTypeOptionLabel(opt)}
                      </option>
                    ))}
                  </>
                )}
              </select>
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
                onChange={(e) => setField("usage", e.target.value)}
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
              disabled={saving || deleting || confirmDelete}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              className="admin-page__btn admin-page__btn--inline admin-page__btn--danger"
              disabled={saving || deleting || confirmDelete}
              onClick={(e) => {
                e.stopPropagation();
                setSaveError(null);
                setConfirmDelete(true);
              }}
            >
              Удалить
            </button>
          </div>

          {confirmDelete ? (
            <MaterialDeleteForm
              key={`delete-${code}`}
              material={{
                code,
                name: form.name || detail?.name,
                type: detail?.type,
                type_id: form.type_id || getMaterialTypeId(detail),
                type_code: detail?.type_code,
                type_name: detail?.type_name,
                usage: form.usage || detail?.usage,
              }}
              candidates={deleteCandidates}
              saving={deleting}
              error={saveError}
              onConfirm={handleDelete}
              onCancel={() => {
                setConfirmDelete(false);
                setSaveError(null);
              }}
            />
          ) : null}

          {saveError && !confirmDelete && (
            <div className="admin-page__error" role="alert">
              <p className="admin-page__error-title">Ошибка сохранения</p>
              <pre className="admin-page__error-body">{saveError}</pre>
            </div>
          )}
          {saveSuccess && !confirmDelete && (
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
                {priceRows.length} рег.
              </span>
            </h3>
          </div>
          <SimpleTable
            columns={MATERIAL_PRICE_COLUMNS}
            rows={priceRows}
            emptyText="Нет цен для этого материала."
          />
        </>
      ) : null}
    </div>
  );
}

function newCalcParamOption(valueType, index, extras = {}) {
  return {
    _key: extras._key || `opt-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    label: extras.label ?? "",
    value_int: extras.value_int ?? 0,
    value_bool: extras.value_bool ?? false,
    sort_order: extras.sort_order ?? index,
    value_type: valueType,
  };
}

const isBoolCalcParam = (param) =>
  String(param?.value_type || "").trim() === CONSTRUCTION_PARAM_TYPE_BOOL ||
  String(param?.code || "").trim() === "dframe";

const boolCalcParamOptions = () => [
  newCalcParamOption(CONSTRUCTION_PARAM_TYPE_BOOL, 0, {
    label: "Да",
    value_bool: true,
  }),
  newCalcParamOption(CONSTRUCTION_PARAM_TYPE_BOOL, 1, {
    label: "Нет",
    value_bool: false,
  }),
];

const defaultCalcParamOptions = (param) => {
  const type = String(param?.value_type || "").trim();
  const code = String(param?.code || "").trim();
  if (isBoolCalcParam(param)) {
    return boolCalcParamOptions();
  }
  if (code === "step") {
    return [600, 400, 300].map((value, i) =>
      newCalcParamOption(type, i, { label: `${value} мм`, value_int: value })
    );
  }
  return [newCalcParamOption(type, 0)];
};

const optionsFromAttached = (row) => {
  const type = String(row?.value_type || "").trim();
  const list = Array.isArray(row?.options) ? row.options : [];
  if (!list.length) return defaultCalcParamOptions(row);
  return list.map((opt, i) =>
    newCalcParamOption(type, i, {
      _key: opt.id != null ? `opt-${opt.id}` : undefined,
      label: opt.label,
      value_int: opt.value_int,
      value_bool: opt.value_bool,
      sort_order: opt.sort_order ?? i,
    })
  );
};

const constructionParamOptionLabel = (param) => {
  const name = String(param?.name || "").trim();
  const code = String(param?.code || "").trim();
  if (name && code && name !== code) return `${name} (${code})`;
  return name || code || `ID ${param?.id ?? "?"}`;
};

function CalcParamOptionRows({ valueType, options, disabled, onChange }) {
  const isBool = valueType === CONSTRUCTION_PARAM_TYPE_BOOL;
  const updateAt = (index, patch) => {
    onChange(
      options.map((opt, i) => (i === index ? { ...opt, ...patch } : opt))
    );
  };

  return (
    <div className="admin-page__param-options">
      {options.map((opt, index) => (
        <div key={opt._key || index} className="admin-page__param-option-row">
          <input
            className="admin-page__input"
            value={opt.label}
            disabled={disabled}
            placeholder="Подпись варианта"
            onChange={(e) => updateAt(index, { label: e.target.value })}
            aria-label={`Подпись варианта ${index + 1}`}
          />
          {isBool ? (
            <select
              className="admin-page__select"
              value={opt.value_bool ? "true" : "false"}
              disabled={disabled}
              onChange={(e) =>
                updateAt(index, { value_bool: e.target.value === "true" })
              }
              aria-label={`Значение варианта ${index + 1}`}
            >
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          ) : (
            <input
              className="admin-page__input admin-page__input--compact"
              type="number"
              value={opt.value_int}
              disabled={disabled}
              onChange={(e) =>
                updateAt(index, { value_int: Number(e.target.value) || 0 })
              }
              aria-label={`Значение варианта ${index + 1}`}
            />
          )}
          <DeleteIconButton
            disabled={disabled || options.length <= 1}
            label={opt.label || `вариант ${index + 1}`}
            onClick={() => onChange(options.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <button
        type="button"
        className="admin-page__btn admin-page__btn--inline"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...options,
            newCalcParamOption(valueType, options.length),
          ])
        }
      >
        Добавить вариант
      </button>
    </div>
  );
}

function ConstructionCalcParamsPanel({ constructionId }) {
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [addParamId, setAddParamId] = useState("");
  const [addRequired, setAddRequired] = useState(true);
  const [addDefaultInt, setAddDefaultInt] = useState(0);
  const [addDefaultBool, setAddDefaultBool] = useState(false);
  const [addOptions, setAddOptions] = useState([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [openParamIds, setOpenParamIds] = useState(() => new Set());

  useEffect(() => {
    if (constructionId == null) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setAddError(null);
      setActionError(null);
      try {
        const [params, attached] = await Promise.all([
          listAdminConstructionParams(),
          listAdminConstructionCalculationParams(constructionId),
        ]);
        if (cancelled) return;
        setCatalog(params);
        setRows(attached);
        setDrafts(
          Object.fromEntries(
            attached.map((row) => [
              row.id,
              {
                is_required: row.is_required,
                default_value_int: row.default_value_int,
                default_value_bool: row.default_value_bool,
                options: optionsFromAttached(row),
              },
            ])
          )
        );
      } catch (err) {
        if (!cancelled) {
          setCatalog([]);
          setRows([]);
          setDrafts({});
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

  const attachedParamIds = useMemo(
    () => new Set(rows.map((row) => Number(row.param_id)).filter(Boolean)),
    [rows]
  );

  const availableCatalog = useMemo(
    () => catalog.filter((param) => !attachedParamIds.has(Number(param.id))),
    [catalog, attachedParamIds]
  );

  const selectedAddParam = useMemo(
    () =>
      availableCatalog.find((param) => String(param.id) === String(addParamId)) ||
      null,
    [availableCatalog, addParamId]
  );

  useEffect(() => {
    if (
      addParamId &&
      availableCatalog.some((param) => String(param.id) === String(addParamId))
    ) {
      return;
    }
    setAddParamId(
      availableCatalog.length ? String(availableCatalog[0].id) : ""
    );
  }, [availableCatalog, addParamId]);

  useEffect(() => {
    if (!selectedAddParam) {
      setAddOptions([]);
      return;
    }
    const next = defaultCalcParamOptions(selectedAddParam);
    setAddOptions(next);
    if (isBoolCalcParam(selectedAddParam)) {
      setAddDefaultBool(false);
    } else if (selectedAddParam.code === "step") {
      setAddDefaultInt(600);
    } else {
      setAddDefaultInt(Number(next[0]?.value_int) || 0);
    }
  }, [selectedAddParam?.id]);

  const handleAdd = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedAddParam) {
      setAddError("Выберите параметр из справочника.");
      return;
    }
    const labeled = isBoolCalcParam(selectedAddParam)
      ? boolCalcParamOptions()
      : addOptions.filter((opt) => String(opt.label || "").trim());
    if (!labeled.length) {
      setAddError("Добавьте хотя бы один вариант с подписью.");
      return;
    }

    setAdding(true);
    setAddError(null);
    setActionError(null);
    try {
      await addAdminConstructionCalculationParam(constructionId, {
        param_id: selectedAddParam.id,
        value_type: isBoolCalcParam(selectedAddParam)
          ? CONSTRUCTION_PARAM_TYPE_BOOL
          : selectedAddParam.value_type,
        is_required: addRequired,
        sort_order: rows.length,
        default_value_int: addDefaultInt,
        default_value_bool: addDefaultBool,
        options: labeled,
      });
      setReloadToken((n) => n + 1);
    } catch (err) {
      setAddError(formatRequestError(err));
    } finally {
      setAdding(false);
    }
  };

  const handleSaveRow = async (row) => {
    const configId = Number(row.id);
    if (!Number.isFinite(configId) || configId <= 0) return;
    const draft = drafts[configId] || {};
    const labeled = isBoolCalcParam(row)
      ? boolCalcParamOptions()
      : (draft.options || []).filter((opt) =>
          String(opt.label || "").trim()
        );
    if (!labeled.length) {
      setActionError("У параметра должен быть хотя бы один вариант.");
      return;
    }

    setSavingId(configId);
    setActionError(null);
    try {
      await updateAdminConstructionCalculationParam(constructionId, configId, {
        param_id: row.param_id,
        value_type: isBoolCalcParam(row)
          ? CONSTRUCTION_PARAM_TYPE_BOOL
          : row.value_type,
        is_required: draft.is_required !== false,
        sort_order: row.sort_order,
        default_value_int: draft.default_value_int,
        default_value_bool: draft.default_value_bool,
        options: labeled,
      });
      setReloadToken((n) => n + 1);
    } catch (err) {
      setActionError(formatRequestError(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteRow = async (row) => {
    const configId = Number(row.id);
    if (!Number.isFinite(configId) || configId <= 0) return;
    const label = constructionParamOptionLabel(row);
    if (!window.confirm(`Удалить параметр «${label}» у конструкции?`)) return;

    setDeletingId(configId);
    setActionError(null);
    try {
      await deleteAdminConstructionCalculationParam(constructionId, configId);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setActionError(formatRequestError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const patchDraft = (configId, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [configId]: { ...(prev[configId] || {}), ...patch },
    }));
  };

  const toggleParamOpen = (configId) => {
    setOpenParamIds((prev) => {
      const next = new Set(prev);
      if (next.has(configId)) next.delete(configId);
      else next.add(configId);
      return next;
    });
  };

  return (
    <AdminCollapsibleSection
      title="Опции расчета"
      count={loading ? "…" : `${rows.length} / ${catalog.length}`}
    >
      {error && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">
            Не удалось загрузить параметры расчета
          </p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      )}

      {actionError && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">Ошибка параметра</p>
          <pre className="admin-page__error-body">{actionError}</pre>
        </div>
      )}

      {loading ? (
        <p className="admin-page__empty admin-page__empty--inline">
          Загрузка параметров…
        </p>
      ) : (
        <>
          {rows.length ? (
            <div className="admin-page__replacements">
              {rows.map((row) => {
                const draft = drafts[row.id] || {
                  is_required: row.is_required,
                  default_value_int: row.default_value_int,
                  default_value_bool: row.default_value_bool,
                  options: optionsFromAttached(row),
                };
                const isBool = isBoolCalcParam(row);
                const busy =
                  savingId === row.id || deletingId === row.id;
                const open = openParamIds.has(row.id);
                const panelId = `calc-param-${row.id}`;
                return (
                  <div
                    key={row.id || row.param_id}
                    className="admin-page__replacement-block admin-page__collapsible"
                  >
                    <div className="admin-page__composition-head">
                      <h4 className="admin-page__composition-title">
                        <button
                          type="button"
                          className="admin-page__collapsible-toggle"
                          aria-expanded={open}
                          aria-controls={panelId}
                          onClick={() => toggleParamOpen(row.id)}
                        >
                          <span
                            className={
                              "admin-page__collapsible-chevron" +
                              (open
                                ? " admin-page__collapsible-chevron--open"
                                : "")
                            }
                            aria-hidden
                          />
                          {constructionParamOptionLabel(row)}
                          <span className="admin-page__count">
                            {row.value_type}
                          </span>
                        </button>
                      </h4>
                    </div>
                    <div
                      id={panelId}
                      className="admin-page__collapsible-body"
                      hidden={!open}
                    >
                      <label className="admin-page__field admin-page__field--checkbox">
                        <span className="admin-page__field-label">
                          <input
                            type="checkbox"
                            checked={draft.is_required !== false}
                            disabled={busy}
                            onChange={(e) =>
                              patchDraft(row.id, {
                                is_required: e.target.checked,
                              })
                            }
                          />
                          Обязательный
                        </span>
                      </label>
                      <label className="admin-page__field">
                        <span className="admin-page__field-label">
                          Значение по умолчанию
                        </span>
                        {isBool ? (
                          <select
                            className="admin-page__select admin-page__select--full"
                            value={draft.default_value_bool ? "true" : "false"}
                            disabled={busy}
                            onChange={(e) =>
                              patchDraft(row.id, {
                                default_value_bool: e.target.value === "true",
                              })
                            }
                          >
                            <option value="true">Да</option>
                            <option value="false">Нет</option>
                          </select>
                        ) : (
                          <input
                            className="admin-page__input"
                            type="number"
                            value={draft.default_value_int}
                            disabled={busy}
                            onChange={(e) =>
                              patchDraft(row.id, {
                                default_value_int: Number(e.target.value) || 0,
                              })
                            }
                          />
                        )}
                      </label>
                      {isBool ? null : (
                        <>
                          <span className="admin-page__field-label">
                            Варианты
                          </span>
                          <CalcParamOptionRows
                            valueType={row.value_type}
                            options={draft.options || []}
                            disabled={busy}
                            onChange={(next) =>
                              patchDraft(row.id, { options: next })
                            }
                          />
                        </>
                      )}
                      <div className="admin-page__meta-actions">
                        <button
                          type="button"
                          className="admin-page__btn admin-page__btn--inline"
                          disabled={busy}
                          onClick={() => handleSaveRow(row)}
                        >
                          {savingId === row.id ? "Сохранение…" : "Сохранить"}
                        </button>
                        <DeleteIconButton
                          deleting={deletingId === row.id}
                          disabled={busy}
                          label={constructionParamOptionLabel(row)}
                          onClick={() => handleDeleteRow(row)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="admin-page__empty admin-page__empty--inline">
              К конструкции ещё не привязан ни один параметр.
            </p>
          )}

          <form
            className="admin-page__create-form"
            onSubmit={handleAdd}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="admin-page__create-title">Добавить параметр</h3>
            <div className="admin-page__create-fields admin-page__create-fields--wide">
              <label className="admin-page__field">
                <span className="admin-page__field-label">Параметр</span>
                <select
                  className="admin-page__select admin-page__select--full"
                  value={addParamId}
                  disabled={adding || !availableCatalog.length}
                  onChange={(e) => setAddParamId(e.target.value)}
                >
                  {!availableCatalog.length ? (
                    <option value="">
                      {catalog.length
                        ? "Все параметры справочника уже добавлены"
                        : "Справочник параметров пуст"}
                    </option>
                  ) : (
                    availableCatalog.map((param) => (
                      <option key={param.id} value={String(param.id)}>
                        {constructionParamOptionLabel(param)}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="admin-page__field admin-page__field--checkbox">
                <span className="admin-page__field-label">
                  <input
                    type="checkbox"
                    checked={addRequired}
                    disabled={adding || !selectedAddParam}
                    onChange={(e) => setAddRequired(e.target.checked)}
                  />
                  Обязательный
                </span>
              </label>
              {selectedAddParam ? (
                <label className="admin-page__field">
                  <span className="admin-page__field-label">
                    Значение по умолчанию
                  </span>
                  {isBoolCalcParam(selectedAddParam) ? (
                    <select
                      className="admin-page__select admin-page__select--full"
                      value={addDefaultBool ? "true" : "false"}
                      disabled={adding}
                      onChange={(e) =>
                        setAddDefaultBool(e.target.value === "true")
                      }
                    >
                      <option value="true">Да</option>
                      <option value="false">Нет</option>
                    </select>
                  ) : (
                    <input
                      className="admin-page__input"
                      type="number"
                      value={addDefaultInt}
                      disabled={adding}
                      onChange={(e) =>
                        setAddDefaultInt(Number(e.target.value) || 0)
                      }
                    />
                  )}
                </label>
              ) : null}
              {selectedAddParam && !isBoolCalcParam(selectedAddParam) ? (
                <>
                  <span className="admin-page__field-label">Варианты</span>
                  <CalcParamOptionRows
                    valueType={selectedAddParam.value_type}
                    options={addOptions}
                    disabled={adding}
                    onChange={setAddOptions}
                  />
                </>
              ) : null}
              <button
                type="submit"
                className="admin-page__btn admin-page__btn--inline admin-page__create-submit"
                disabled={adding || !selectedAddParam}
              >
                {adding ? "Добавление…" : "Добавить параметр"}
              </button>
            </div>
            {addError && (
              <div className="admin-page__error" role="alert">
                <p className="admin-page__error-title">
                  Не удалось добавить параметр
                </p>
                <pre className="admin-page__error-body">{addError}</pre>
              </div>
            )}
          </form>
        </>
      )}
    </AdminCollapsibleSection>
  );
}

function ConstructionDetail({
  constructionId,
  label,
  constructionTypes: constructionTypesProp,
  onUpdated,
  onDeleted,
}) {
  const [detail, setDetail] = useState(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editTypeId, setEditTypeId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editRegionIds, setEditRegionIds] = useState([]);
  const [priceRegions, setPriceRegions] = useState([]);
  const [typeOptionsLocal, setTypeOptionsLocal] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [savingMeta, setSavingMeta] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [metaError, setMetaError] = useState(null);
  const [metaSuccess, setMetaSuccess] = useState(null);
  const [defaultMaterials, setDefaultMaterials] = useState([]);
  const [replacementGroups, setReplacementGroups] = useState([]);
  const [optionalMaterials, setOptionalMaterials] = useState([]);
  const [catalogMaterials, setCatalogMaterials] = useState([]);
  const [materialTypes, setMaterialTypes] = useState([]);
  const [calculationTypes, setCalculationTypes] = useState([]);
  const [addByGroup, setAddByGroup] = useState({});
  const [addQueryByGroup, setAddQueryByGroup] = useState({});
  const [addCalcTypeByGroup, setAddCalcTypeByGroup] = useState({});
  const [optionalAddArticle, setOptionalAddArticle] = useState("");
  const [optionalAddQuery, setOptionalAddQuery] = useState("");
  const [optionalAddCalcTypeId, setOptionalAddCalcTypeId] = useState("");
  const [defaultAddArticle, setDefaultAddArticle] = useState("");
  const [defaultAddQuery, setDefaultAddQuery] = useState("");
  const [defaultAddCalcTypeId, setDefaultAddCalcTypeId] = useState("");
  const [promoteItemId, setPromoteItemId] = useState("");
  const [promoteGroupId, setPromoteGroupId] = useState("");
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
  const [savingCalcTypeKey, setSavingCalcTypeKey] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const panelRef = useRef(null);

  const typeOptions = useMemo(
    () =>
      withCurrentMaterialType(
        constructionTypesProp || typeOptionsLocal,
        editTypeId,
        {
          code: detail?.type_code || detail?.type?.code,
          name: detail?.type_name || detail?.type?.name,
        }
      ),
    [constructionTypesProp, typeOptionsLocal, editTypeId, detail]
  );

  const categorySelectOptions = useMemo(
    () =>
      withCurrentMaterialType(categoryOptions, editCategoryId, {
        code: detail?.category_code || detail?.category?.code,
        name: detail?.category_name || detail?.category?.name,
      }),
    [categoryOptions, editCategoryId, detail]
  );

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
    () => collectReplacementMaterialTypes(materialTypes, replacementGroups),
    [materialTypes, replacementGroups]
  );

  const patchCompositionCalcType = (kind, itemId, typeId, typeObj) => {
    const patchRow = (row) =>
      Number(row.id) !== itemId
        ? row
        : {
            ...row,
            calculation_type_id: typeId,
            calculation_type: typeObj,
            calculation_type_code: typeObj?.code || "",
            calculation_type_name: typeObj?.name || "",
          };
    if (kind === "optional") {
      setOptionalMaterials((prev) => prev.map(patchRow));
      return;
    }
    if (kind === "default") {
      setDefaultMaterials((prev) => prev.map(patchRow));
      return;
    }
    setReplacementGroups((prev) =>
      prev.map((group) => ({
        ...group,
        materials: (group.materials || []).map(patchRow),
      }))
    );
  };

  const constructionMaterialUpsert = (row, overrides = {}) => {
    const replacementGroup =
      row.replacement_group == null || row.replacement_group === ""
        ? null
        : Number(row.replacement_group);
    const replacementTypeId = getReplacementMaterialTypeId(row);
    return {
      id: Number(row.material_id ?? row.material?.id),
      weight: Number(row.weight) > 0 ? Number(row.weight) : 1,
      sort_order: Number(row.sort_order) >= 0 ? Number(row.sort_order) : 0,
      is_default: Boolean(row.is_default),
      replacement_group: Number.isFinite(replacementGroup)
        ? replacementGroup
        : null,
      replacement_material_type_id:
        Number.isFinite(Number(replacementTypeId)) &&
        Number(replacementTypeId) > 0
          ? Number(replacementTypeId)
          : null,
      calculation_type_id: getCalculationTypeId(row),
      calculation_note: String(row.calculation_note || ""),
      ...overrides,
    };
  };

  const handleChangeCalculationType = async (row, kind, nextValue) => {
    const itemId = Number(row.id);
    const materialId = Number(row.material_id ?? row.material?.id);
    if (!Number.isFinite(itemId) || itemId <= 0) return;
    if (!Number.isFinite(materialId) || materialId <= 0) return;

    const typeId = calcTypeIdPayload(nextValue);
    const typeObj =
      calculationTypes.find((item) => Number(item.id) === typeId) || null;
    const prevTypeId = getCalculationTypeId(row);
    const key = `${kind}:${itemId}`;

    patchCompositionCalcType(kind, itemId, typeId, typeObj);
    setSavingCalcTypeKey(key);
    const setErr =
      kind === "optional"
        ? setOptionalAddError
        : kind === "replacement"
          ? setAddError
          : setDefaultAddError;
    setErr(null);
    try {
      if (kind === "optional") {
        await updateAdminConstructionOptionalMaterial(constructionId, itemId, {
          id: materialId,
          weight: Number(row.weight) > 0 ? Number(row.weight) : 1,
          sort_order: Number(row.sort_order) >= 0 ? Number(row.sort_order) : 0,
          calculation_type_id: typeId,
          calculation_note: String(row.calculation_note || ""),
        });
      } else {
        await updateAdminConstructionMaterial(
          constructionId,
          itemId,
          constructionMaterialUpsert(row, { calculation_type_id: typeId })
        );
      }
    } catch (err) {
      const prevObj =
        calculationTypes.find((item) => Number(item.id) === prevTypeId) ||
        row.calculation_type ||
        null;
      patchCompositionCalcType(kind, itemId, prevTypeId, prevObj);
      setErr(formatRequestError(err));
    } finally {
      setSavingCalcTypeKey(null);
    }
  };

  const renderCalcTypeSelect = (row, kind) => {
    const itemId = Number(row.id);
    const options = withCurrentMaterialType(
      calculationTypes,
      getCalculationTypeId(row),
      row.calculation_type || {
        code: row.calculation_type_code,
        name: row.calculation_type_name,
      }
    );
    return (
      <CalculationTypeSelect
        value={
          getCalculationTypeId(row) != null
            ? String(getCalculationTypeId(row))
            : ""
        }
        options={options}
        disabled={
          !Number.isFinite(itemId) ||
          itemId <= 0 ||
          savingCalcTypeKey === `${kind}:${itemId}`
        }
        ariaLabel={`Тип расчёта ${row.code || row.material_code || itemId}`}
        onChange={(next) => handleChangeCalculationType(row, kind, next)}
      />
    );
  };

  const defaultMaterialsColumns = useMemo(
    () => [
      ...COMPOSITION_COLUMNS,
      {
        key: "calculation_type",
        label: "Тип расчёта",
        className: "admin-page__col--calc",
        render: (row) => renderCalcTypeSelect(row, "default"),
      },
      {
        key: "actions",
        label: "",
        className: "admin-page__col--actions",
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
    [deletingMaterialId, calculationTypes, savingCalcTypeKey]
  );

  const optionalMaterialsColumns = useMemo(
    () => [
      ...COMPOSITION_COLUMNS,
      {
        key: "calculation_type",
        label: "Тип расчёта",
        className: "admin-page__col--calc",
        render: (row) => renderCalcTypeSelect(row, "optional"),
      },
      {
        key: "actions",
        label: "",
        className: "admin-page__col--actions",
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
    [deletingOptionalId, calculationTypes, savingCalcTypeKey]
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
        const [data, catalog, types, constrTypes, allConstructions, calcTypes, regions] =
          await Promise.all([
            getAdminConstructionById(constructionId),
            listAdminMaterials().catch(() => []),
            listAdminMaterialTypes().catch(() => []),
            constructionTypesProp != null
              ? Promise.resolve(null)
              : listConstructionTypes().catch(() => []),
            listAdminConstructions().catch(() => []),
            listAdminConstructionCalculationTypes().catch(() => []),
            listAdminCommerceRegions().catch(() => []),
          ]);
        if (cancelled) return;
        setCatalogMaterials(catalog);
        setMaterialTypes(types);
        setCalculationTypes(calcTypes || []);
        if (constructionTypesProp == null) {
          setTypeOptionsLocal(constrTypes || []);
        }
        setCategoryOptions(
          collectConstructionCategories(
            [data?.detail, ...(allConstructions || [])].filter(Boolean)
          )
        );
        setDetail(data?.detail ?? null);
        setEditCode(String(data?.detail?.code ?? ""));
        setEditName(String(data?.detail?.name ?? ""));
        setEditTypeId(
          String(
            data?.detail?.type_id ?? data?.detail?.type?.id ?? ""
          )
        );
        setEditCategoryId(
          String(
            data?.detail?.category_id ?? data?.detail?.category?.id ?? ""
          )
        );
        setPriceRegions(Array.isArray(regions) ? regions : []);
        {
          const assigned = getConstructionPriceRegionIds(data?.detail);
          const activeIds = new Set(
            activePriceRegions(regions).map((row) => Number(row.id))
          );
          setEditRegionIds(
            activeIds.size
              ? assigned.filter((id) => activeIds.has(id))
              : assigned
          );
        }
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
        setAddCalcTypeByGroup({});
        setOptionalAddArticle("");
        setOptionalAddQuery("");
        setOptionalAddCalcTypeId("");
        setDefaultAddArticle("");
        setDefaultAddQuery("");
        setDefaultAddCalcTypeId("");
        setPromoteItemId("");
        setPromoteGroupId("");
        setPromoteTypeId("");
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setEditCode("");
          setEditName("");
          setEditTypeId("");
          setEditCategoryId("");
          setEditRegionIds([]);
          setPriceRegions([]);
          setTypeOptionsLocal([]);
          setCategoryOptions([]);
          setMetaError(null);
          setMetaSuccess(null);
          setDefaultMaterials([]);
          setReplacementGroups([]);
          setOptionalMaterials([]);
          setMaterialTypes([]);
          setCalculationTypes([]);
          setAddByGroup({});
          setAddQueryByGroup({});
          setAddCalcTypeByGroup({});
          setOptionalAddArticle("");
          setOptionalAddQuery("");
          setOptionalAddCalcTypeId("");
          setDefaultAddArticle("");
          setDefaultAddQuery("");
          setDefaultAddCalcTypeId("");
          setPromoteItemId("");
          setPromoteGroupId("");
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
    const typeId = Number(editTypeId);
    const categoryId = Number(editCategoryId);

    if (!code || !name) {
      setMetaError("Код и название не должны быть пустыми.");
      setMetaSuccess(null);
      return;
    }
    if (!Number.isFinite(typeId) || typeId <= 0) {
      setMetaError("Выберите тип конструкции.");
      setMetaSuccess(null);
      return;
    }
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      setMetaError("Выберите категорию конструкции.");
      setMetaSuccess(null);
      return;
    }

    const regionIds = uniquePositiveIds(editRegionIds);
    if (!regionIds.length) {
      setMetaError("Выберите хотя бы один регион продаж.");
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
        price_region_ids: regionIds,
      });
      const selectedType =
        typeOptions.find((item) => Number(item.id) === typeId) ?? null;
      const selectedCategory =
        categorySelectOptions.find((item) => Number(item.id) === categoryId) ??
        null;
      const nextRegions = activePriceRegions(priceRegions)
        .filter((item) => regionIds.includes(Number(item.id)))
        .map((item) => ({
          id: Number(item.id),
          code: item.code,
          name: item.name,
        }));
      const nextDetail = {
        ...(detail || {}),
        code,
        name,
        type_id: typeId,
        category_id: categoryId,
        type: selectedType,
        category: selectedCategory,
        type_code: selectedType?.code ?? "",
        type_name: selectedType?.name ?? "",
        category_code: selectedCategory?.code ?? "",
        category_name: selectedCategory?.name ?? "",
        price_regions: nextRegions,
        price_region_ids: regionIds,
      };
      setDetail(nextDetail);
      setMetaSuccess("Сохранено.");
      onUpdated?.({
        id: constructionId,
        code,
        name,
        type_id: typeId,
        category_id: categoryId,
        type: selectedType,
        category: selectedCategory,
        type_code: selectedType?.code ?? "",
        type_name: selectedType?.name ?? "",
        category_code: selectedCategory?.code ?? "",
        category_name: selectedCategory?.name ?? "",
        price_regions: nextRegions,
        price_region_ids: regionIds,
      });
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
        calculation_type_id:
          calcTypeIdPayload(addCalcTypeByGroup[groupKey]) ||
          getCalculationTypeId(sample),
        calculation_note: String(sample?.calculation_note || ""),
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
        calculation_type_id: calcTypeIdPayload(optionalAddCalcTypeId),
        calculation_note: "",
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
        calculation_type_id: calcTypeIdPayload(defaultAddCalcTypeId),
        calculation_note: "",
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
    if (!Number.isFinite(itemId) || itemId <= 0) {
      setPromoteError("Выберите материал из списка по умолчанию.");
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

    const creatingNewGroup = promoteGroupId === NEW_REPLACEMENT_GROUP;
    let nextGroup;
    let typeId;
    let isDefault;

    if (creatingNewGroup) {
      typeId = Number(promoteTypeId);
      if (!Number.isFinite(typeId) || typeId <= 0) {
        setPromoteError("Выберите тип новой группы замены.");
        return;
      }
      nextGroup =
        replacementGroups.reduce(
          (max, g) => Math.max(max, Number(g.group) || 0),
          0
        ) + 1;
      isDefault = true;
    } else {
      const group = replacementGroups.find(
        (item) => String(item.group) === String(promoteGroupId)
      );
      nextGroup = Number(group?.group);
      typeId = Number(getReplacementMaterialTypeId(group));
      if (!Number.isFinite(nextGroup) || nextGroup <= 0) {
        setPromoteError("Выберите группу замены.");
        return;
      }
      if (!Number.isFinite(typeId) || typeId <= 0) {
        setPromoteError("У выбранной группы нет replacement_material_type_id.");
        return;
      }
      isDefault = false;
    }

    setPromoting(true);
    setPromoteError(null);
    try {
      await updateAdminConstructionMaterial(constructionId, itemId, {
        id: materialId,
        weight: Number(row.weight) > 0 ? Number(row.weight) : 1,
        sort_order: Number(row.sort_order) >= 0 ? Number(row.sort_order) : 0,
        is_default: isDefault,
        replacement_group: nextGroup,
        replacement_material_type_id: typeId,
        calculation_type_id: getCalculationTypeId(row),
        calculation_note: String(row.calculation_note || ""),
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
          <div className="admin-page__construction-top">
          <form
            className="admin-page__meta-form"
            onSubmit={handleSaveConstructionMeta}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="admin-page__composition-title">
              Редактирование конструкции
            </h3>
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
            <label className="admin-page__field">
              <span className="admin-page__field-label">Тип</span>
              <select
                className="admin-page__select admin-page__select--full"
                value={editTypeId}
                disabled={savingMeta || deleting || !typeOptions.length}
                onChange={(e) => {
                  setEditTypeId(e.target.value);
                  setMetaSuccess(null);
                }}
                required
                aria-label="Тип конструкции"
              >
                {!typeOptions.length ? (
                  <option value="">Нет типов в справочнике</option>
                ) : (
                  <>
                    {!editTypeId ? (
                      <option value="">Выберите тип…</option>
                    ) : null}
                    {typeOptions.map((type) => (
                      <option key={type.id} value={String(type.id)}>
                        {materialTypeOptionLabel(type)}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>
            <label className="admin-page__field">
              <span className="admin-page__field-label">Категория</span>
              <select
                className="admin-page__select admin-page__select--full"
                value={editCategoryId}
                disabled={
                  savingMeta || deleting || !categorySelectOptions.length
                }
                onChange={(e) => {
                  setEditCategoryId(e.target.value);
                  setMetaSuccess(null);
                }}
                required
                aria-label="Категория конструкции"
              >
                {!categorySelectOptions.length ? (
                  <option value="">Нет категорий в списке</option>
                ) : (
                  <>
                    {!editCategoryId ? (
                      <option value="">Выберите категорию…</option>
                    ) : null}
                    {categorySelectOptions.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {materialTypeOptionLabel(item)}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>
            <AdminConstructionRegionsField
              regions={priceRegions}
              selectedIds={editRegionIds}
              disabled={savingMeta || deleting}
              onChange={(ids) => {
                setEditRegionIds(ids);
                setMetaSuccess(null);
              }}
            />
            <div className="admin-page__meta-actions">
              <button
                type="submit"
                className="admin-page__btn admin-page__btn--inline"
                disabled={
                  savingMeta ||
                  deleting ||
                  !editCode.trim() ||
                  !editName.trim() ||
                  !editTypeId ||
                  !editCategoryId ||
                  !editRegionIds.length ||
                  (editCode.trim() === String(detail.code ?? "").trim() &&
                    editName.trim() === String(detail.name ?? "").trim() &&
                    String(editTypeId) ===
                      String(detail.type_id ?? detail.type?.id ?? "") &&
                    String(editCategoryId) ===
                      String(detail.category_id ?? detail.category?.id ?? "") &&
                    sameIdSet(
                      editRegionIds,
                      getConstructionPriceRegionIds(detail)
                    ))
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

          <AdminConstructionImages
            constructionId={constructionId}
            constructionCode={detail.code || editCode}
          />
          </div>

          <ConstructionCalcParamsPanel constructionId={constructionId} />

          <AdminConstructionSizeLimits constructionId={constructionId} />

          <AdminCollapsibleSection
            title="Материалы по умолчанию"
            count={`${defaultMaterials.length} мат.`}
          >
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
            <CalculationTypeSelect
              value={defaultAddCalcTypeId}
              options={calculationTypes}
              disabled={addingDefault || !calculationTypes.length}
              ariaLabel="Тип расчёта нового материала по умолчанию"
              onChange={setDefaultAddCalcTypeId}
            />
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
          </AdminCollapsibleSection>

          <AdminCollapsibleSection
            title="Заменяемые материалы"
            count={`${replacementGroups.length} групп`}
          >
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
              value={promoteGroupId}
              disabled={promoting}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                const next = e.target.value;
                setPromoteGroupId(next);
                if (next !== NEW_REPLACEMENT_GROUP) setPromoteTypeId("");
              }}
              aria-label="Тип группы замены"
            >
              <option value="">Группа замены…</option>
              <option value={NEW_REPLACEMENT_GROUP}>Новая группа</option>
              {replacementGroups
                .filter((group) => Number(group.group) > 0)
                .map((group) => (
                  <option key={`rg-${group.group}`} value={String(group.group)}>
                    {replacementGroupOptionLabel(group)}
                  </option>
                ))}
            </select>
            {promoteGroupId === NEW_REPLACEMENT_GROUP ? (
              <select
                className="admin-page__select"
                value={promoteTypeId}
                disabled={promoting || !replacementMaterialTypes.length}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  setPromoteTypeId(e.target.value);
                }}
                aria-label="Тип новой группы замены"
              >
                <option value="">Тип группы…</option>
                {replacementMaterialTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name || type.code}
                    {type.code ? ` (${type.code})` : ""}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="admin-page__btn admin-page__btn--inline"
              disabled={
                promoting ||
                !promoteItemId ||
                !promoteGroupId ||
                (promoteGroupId === NEW_REPLACEMENT_GROUP && !promoteTypeId)
              }
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
                              {renderCalcTypeSelect(mat, "replacement")}
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
                      <CalculationTypeSelect
                        value={
                          addCalcTypeByGroup[groupKey] ??
                          (getCalculationTypeId(group.materials?.[0]) != null
                            ? String(getCalculationTypeId(group.materials[0]))
                            : "")
                        }
                        options={withCurrentMaterialType(
                          calculationTypes,
                          getCalculationTypeId(group.materials?.[0]),
                          group.materials?.[0]?.calculation_type
                        )}
                        disabled={adding || !calculationTypes.length}
                        ariaLabel={`Тип расчёта для группы ${typeLabel}`}
                        onChange={(next) =>
                          setAddCalcTypeByGroup((prev) => ({
                            ...prev,
                            [groupKey]: next,
                          }))
                        }
                      />
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
          </AdminCollapsibleSection>

          <AdminCollapsibleSection
            title="Дополнительные материалы"
            count={`${optionalMaterials.length} мат.`}
          >
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
            <CalculationTypeSelect
              value={optionalAddCalcTypeId}
              options={calculationTypes}
              disabled={addingOptional || !calculationTypes.length}
              ariaLabel="Тип расчёта дополнительного материала"
              onChange={setOptionalAddCalcTypeId}
            />
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
          </AdminCollapsibleSection>
        </>
      )}
    </div>
  );
}

function ConstructionsListPanel() {
  const [rows, setRows] = useState([]);
  const [apiConstructionTypes, setApiConstructionTypes] = useState([]);
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
  const [createRegionIds, setCreateRegionIds] = useState([]);
  const [priceRegions, setPriceRegions] = useState([]);
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
    let cancelled = false;
    (async () => {
      try {
        const types = await listConstructionTypes();
        if (!cancelled) setApiConstructionTypes(types);
      } catch {
        if (!cancelled) setApiConstructionTypes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listAdminCommerceRegions();
        if (cancelled) return;
        setPriceRegions(data);
      } catch {
        if (!cancelled) {
          setPriceRegions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    setCreateCode("");
    setCreateName("");
    setCreateError(null);
    setCreateSuccess(null);
  }, [category]);

  useEffect(() => {
    setCreateRegionIds(
      activePriceRegions(priceRegions).map((row) => Number(row.id))
    );
  }, [category, priceRegions]);

  const constructionTypes = useMemo(
    () => collectConstructionTypes(apiConstructionTypes, rows),
    [apiConstructionTypes, rows]
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
          "type_code",
          "type_name",
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

  const handleConstructionUpdated = (patch) => {
    const id = patch?.id;
    const nextCategoryCode = String(
      patch.category_code ?? patch.category?.code ?? ""
    ).trim();
    if (nextCategoryCode && nextCategoryCode !== category) {
      setRows((prev) =>
        prev.filter((item) => getConstructionId(item) !== id)
      );
      setSelectedId((prev) => (prev === id ? null : prev));
      return;
    }
    setRows((prev) =>
      prev.map((item) =>
        getConstructionId(item) === id
          ? {
              ...item,
              code: patch.code,
              name: patch.name,
              type_id: patch.type_id ?? item.type_id,
              category_id: patch.category_id ?? item.category_id,
              type: patch.type ?? item.type,
              category: patch.category ?? item.category,
              type_code: patch.type_code ?? item.type_code,
              type_name: patch.type_name ?? item.type_name,
              category_code: patch.category_code ?? item.category_code,
              category_name: patch.category_name ?? item.category_name,
              price_regions: patch.price_regions ?? item.price_regions,
              price_region_ids:
                patch.price_region_ids ?? item.price_region_ids,
            }
          : item
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

    const regionIds = uniquePositiveIds(createRegionIds);
    if (!regionIds.length) {
      setCreateError("Выберите хотя бы один регион продаж.");
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
        price_region_ids: regionIds,
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
                  <option value="">Нет типов в справочнике</option>
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
            <AdminConstructionRegionsField
              regions={priceRegions}
              selectedIds={createRegionIds}
              disabled={creating || loading}
              onChange={setCreateRegionIds}
            />
            <button
              type="submit"
              className="admin-page__btn admin-page__btn--inline admin-page__create-submit"
              disabled={
                creating ||
                loading ||
                !createCode.trim() ||
                !createName.trim() ||
                !createTypeId ||
                !soundCategoryId ||
                !createRegionIds.length
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
                  <th key={col.key} className={col.className}>
                    {col.label}
                  </th>
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
                          constructionTypes={constructionTypes}
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
          <td key={col.key} className={col.className}>
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

const priceRegionModeLabel = (mode) =>
  String(mode || "").trim() === PRICE_REGION_MODE_DERIVED
    ? "дочерний"
    : "базовый";

const priceRegionOptionLabel = (row) => {
  const name = String(row?.name || "").trim();
  const code = String(row?.code || "").trim();
  if (name && code && name !== code) return `${name} (${code})`;
  return name || code || `ID ${row?.id ?? "?"}`;
};

function RegionsListPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createBaseId, setCreateBaseId] = useState("");
  const [createCoef, setCreateCoef] = useState("1");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);
  const [coefDrafts, setCoefDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listAdminCommerceRegions();
        if (!cancelled) {
          setRows(data);
          setCoefDrafts({});
        }
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
  }, [reloadToken]);

  const directRegions = useMemo(
    () => rows.filter((row) => isDirectPriceRegion(row)),
    [rows]
  );

  useEffect(() => {
    if (
      createBaseId &&
      directRegions.some((row) => String(row.id) === String(createBaseId))
    ) {
      return;
    }
    setCreateBaseId(
      directRegions.length ? String(directRegions[0].id) : ""
    );
  }, [directRegions, createBaseId]);

  const orderedRows = useMemo(() => orderPriceRegions(rows), [rows]);

  const filtered = useMemo(
    () =>
      orderedRows.filter((row) =>
        matchesQuery(row, query.trim(), [
          "code",
          "name",
          "pricing_mode",
          "base_region_code",
          "base_region_name",
        ])
      ),
    [orderedRows, query]
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    const code = createCode.trim();
    const name = createName.trim();
    const baseId = Number(createBaseId);
    const coef = Number(createCoef);

    if (!code || !name) {
      setCreateError("Укажите код и название региона.");
      setCreateSuccess(null);
      return;
    }
    if (!Number.isFinite(baseId) || baseId <= 0) {
      setCreateError("Выберите базовый регион.");
      setCreateSuccess(null);
      return;
    }
    if (!Number.isFinite(coef) || coef <= 0) {
      setCreateError("Коэффициент должен быть больше 0.");
      setCreateSuccess(null);
      return;
    }

    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await createAdminCommerceRegion({
        code,
        name,
        pricing_mode: PRICE_REGION_MODE_DERIVED,
        base_region_id: baseId,
        price_coefficient: coef,
        sort_order: 0,
        is_active: true,
      });
      setCreateCode("");
      setCreateName("");
      setCreateCoef("1");
      setCreateSuccess(`Дочерний регион «${code}» создан.`);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setCreateError(formatRequestError(err));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveCoefficient = async (row) => {
    const id = Number(row.id);
    const coef = Number(coefDrafts[id] ?? row.price_coefficient);
    const baseId = getPriceRegionBaseId(row);
    if (!Number.isFinite(id) || id <= 0) return;
    if (!Number.isFinite(coef) || coef <= 0) {
      setSaveError("Коэффициент должен быть больше 0.");
      return;
    }
    if (!baseId) {
      setSaveError("У дочернего региона нет базового региона.");
      return;
    }

    setSavingId(id);
    setSaveError(null);
    try {
      await updateAdminCommerceRegion(id, {
        code: row.code,
        name: row.name,
        pricing_mode: PRICE_REGION_MODE_DERIVED,
        base_region_id: baseId,
        price_coefficient: coef,
        sort_order: row.sort_order,
        is_active: row.is_active,
      });
      setRows((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, price_coefficient: coef } : item
        )
      );
      setCoefDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setSaveError(formatRequestError(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteRegion = async (row) => {
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0 || isDirectPriceRegion(row)) return;
    const label = priceRegionOptionLabel(row);
    if (!window.confirm(`Удалить дочерний регион «${label}»?`)) return;

    setDeletingId(id);
    setSaveError(null);
    try {
      await deleteAdminCommerceRegion(id);
      setRows((prev) => prev.filter((item) => item.id !== id));
      setCoefDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setSaveError(formatRequestError(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="admin-page__card">
      <div className="admin-page__card-head">
        <h2 className="admin-page__card-title">
          Регионы цен
          <span className="admin-page__count">
            {loading ? "…" : `${filtered.length} / ${rows.length}`}
          </span>
        </h2>
        <input
          type="search"
          className="admin-page__search"
          placeholder="Поиск по коду, названию, базовому региону…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <form className="admin-page__create-form" onSubmit={handleCreate}>
        <h3 className="admin-page__create-title">Новый дочерний регион</h3>
        <div className="admin-page__create-fields">
          <label className="admin-page__field">
            <span className="admin-page__field-label">Базовый регион</span>
            <select
              className="admin-page__select admin-page__select--full"
              value={createBaseId}
              onChange={(e) => setCreateBaseId(e.target.value)}
              disabled={creating || loading || !directRegions.length}
              required
            >
              {!directRegions.length ? (
                <option value="">Нет базовых регионов</option>
              ) : (
                directRegions.map((row) => (
                  <option key={row.id} value={String(row.id)}>
                    {priceRegionOptionLabel(row)}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="admin-page__field">
            <span className="admin-page__field-label">Код</span>
            <input
              className="admin-page__input"
              value={createCode}
              onChange={(e) => setCreateCode(e.target.value)}
              placeholder="Например chel"
              disabled={creating || loading}
              required
              autoComplete="off"
            />
          </label>
          <label className="admin-page__field">
            <span className="admin-page__field-label">Название</span>
            <input
              className="admin-page__input"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Челябинск"
              disabled={creating || loading}
              required
              autoComplete="off"
            />
          </label>
          <label className="admin-page__field">
            <span className="admin-page__field-label">Коэффициент</span>
            <input
              className="admin-page__input"
              type="number"
              min="0.01"
              step="0.01"
              value={createCoef}
              onChange={(e) => setCreateCoef(e.target.value)}
              disabled={creating || loading}
              required
            />
          </label>
          <button
            type="submit"
            className="admin-page__btn admin-page__btn--inline admin-page__create-submit"
            disabled={
              creating ||
              loading ||
              !createCode.trim() ||
              !createName.trim() ||
              !createBaseId
            }
          >
            {creating ? "Создание…" : "Создать"}
          </button>
        </div>
        {createError && (
          <div className="admin-page__error" role="alert">
            <p className="admin-page__error-title">
              Не удалось создать регион
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

      {error && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">
            Не удалось загрузить регионы
          </p>
          <pre className="admin-page__error-body">{error}</pre>
        </div>
      )}

      {saveError && (
        <div className="admin-page__error" role="alert">
          <p className="admin-page__error-title">
            Не удалось обновить регион
          </p>
          <pre className="admin-page__error-body">{saveError}</pre>
        </div>
      )}

      {loading ? (
        <p className="admin-page__empty">Загрузка регионов…</p>
      ) : !filtered.length ? (
        <p className="admin-page__empty">
          {rows.length
            ? "Ничего не найдено по запросу."
            : "Нет регионов в справочнике."}
        </p>
      ) : (
        <div className="admin-page__table-wrap">
          <table className="admin-page__table">
            <thead>
              <tr>
                <th className="admin-page__col--code">Код</th>
                <th className="admin-page__col--grow">Название</th>
                <th className="admin-page__col--compact">Режим</th>
                <th className="admin-page__col--grow">Базовый регион</th>
                <th className="admin-page__col--compact">Коэффициент</th>
                <th className="admin-page__col--compact">Активен</th>
                <th className="admin-page__col--controls" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const derived = !isDirectPriceRegion(row);
                const draft = coefDrafts[row.id];
                const currentCoef =
                  draft != null ? draft : String(row.price_coefficient ?? 1);
                const unchanged =
                  Number(currentCoef) === Number(row.price_coefficient);
                return (
                  <tr
                    key={row.id}
                    className={
                      derived ? "admin-page__region-row--child" : undefined
                    }
                  >
                    <td className="admin-page__col--code">
                      {cell(row.code)}
                    </td>
                    <td className="admin-page__col--grow">{cell(row.name)}</td>
                    <td className="admin-page__col--compact">
                      {priceRegionModeLabel(row.pricing_mode)}
                    </td>
                    <td className="admin-page__col--grow">
                      {derived
                        ? cell(
                            row.base_region_name ||
                              row.base_region?.name ||
                              row.base_region_code ||
                              row.base_region?.code
                          )
                        : "—"}
                    </td>
                    <td className="admin-page__col--compact">
                      {derived ? (
                        <input
                          className="admin-page__input admin-page__input--compact"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={currentCoef}
                          disabled={savingId === row.id}
                          onChange={(e) =>
                            setCoefDrafts((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                          aria-label={`Коэффициент ${row.code}`}
                        />
                      ) : (
                        cell(row.price_coefficient)
                      )}
                    </td>
                    <td className="admin-page__col--compact">
                      {cell(row.is_active)}
                    </td>
                    <td className="admin-page__col--controls">
                      {derived ? (
                        <div className="admin-page__region-actions">
                          <button
                            type="button"
                            className="admin-page__btn admin-page__btn--inline"
                            disabled={
                              savingId === row.id ||
                              deletingId === row.id ||
                              unchanged ||
                              !Number(currentCoef)
                            }
                            onClick={() => handleSaveCoefficient(row)}
                          >
                            {savingId === row.id ? "…" : "Сохранить"}
                          </button>
                          <DeleteIconButton
                            deleting={deletingId === row.id}
                            disabled={
                              savingId === row.id || deletingId === row.id
                            }
                            label={priceRegionOptionLabel(row)}
                            onClick={() => handleDeleteRegion(row)}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
          onDeleted={() => {
            navigate("/admin?list=materials", { replace: true });
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
    listParam === "constructions" ||
    listParam === "materials" ||
    listParam === "regions"
      ? listParam
      : null;

  if (!listKey) {
    return <Navigate to="/admin?list=constructions" replace />;
  }

  return (
    <AdminGate>
      <div className="admin-page">
        <div className="admin-page__header">
          <h1 className="admin-page__title">Админка</h1>
          <nav className="admin-page__tabs" aria-label="Списки админки">
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
              to="/admin?list=regions"
              className={() =>
                `admin-page__tab${
                  listKey === "regions" ? " admin-page__tab--active" : ""
                }`
              }
            >
              Регионы
            </NavLink>
          </nav>
        </div>

        {listKey === "materials" ? (
          <MaterialsListPanel />
        ) : listKey === "constructions" ? (
          <ConstructionsListPanel />
        ) : (
          <RegionsListPanel />
        )}
      </div>
    </AdminGate>
  );
}
