import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import ConstructionList, {
  ConstructionGrandTotalBlock,
} from "./tables/ConstructionList";
import {
  computeGrandTotalRubForConstructions,
  formatKpComputedSum,
  formatRub,
  montageLineProductRub,
  parseKpDecimal,
} from "./tables/MaterialsList";
import {
  deleteOffer,
  fetchOfferPdf,
  getOffer,
  updateOffer,
} from "../services/offersApi";
import {
  buildCalculatorSyncFromKp,
  buildUpdateOfferPayload,
  emptyGrandTotalDiscountAmounts,
  emptyGrandTotalDiscounts,
  enrichConstructionsWithTitles,
  mapGrandTotalDiscountAmountsFromApi,
  mapGrandTotalDiscountsFromApi,
  mapOfferResponseToKpView,
  normalizeGrandTotalDiscountAmounts,
  normalizeGrandTotalDiscounts,
  pickConstrToCalcToSentForSave,
} from "../utils/offerMapper";
import { useAuth } from "../context/AuthContext.jsx";
import {
  REGION_SELECT_OPTIONS,
  filterVisibleRegionOptions,
  findRegionOptionByRegionKey,
  findRegionOptionByValue,
} from "../constants/regionSelectOptions.js";
import { setPriceRegion, usePriceData } from "../services/priceApi";
import {
  useOfferEditSession,
  useOfferEditSessionStore,
} from "../stores/offerEditSessionStore.js";
import { useCalculatorStore } from "../stores/calculatorStore.js";
import { KpNarrowExpandableRow } from "./kp/KpNarrowExpandableRow";
import PdfPrintDialog from "./PdfPrintDialog.jsx";
import { useKpExpandedRow } from "../hooks/useKpExpandedRow";
import { useKpNarrowViewport } from "../hooks/useKpNarrowViewport";
import "./Calculator.css";
import "./KpPage.css";

const initialForm = {
  manager: "",
  phone: "",
  email: "",
  officeAddress: "",
  region: "",
  date: "",
  object: "",
};

/** Все обязательные поля блока «Контактные данные» (.kp-page__contact) заполнены. */
function isKpContactFormComplete(form) {
  if (!form) return false;
  return [
    form.date,
    form.region,
    form.object,
    form.manager,
    form.phone,
    form.email,
    form.officeAddress,
  ].every((v) => String(v ?? "").trim() !== "");
}

const KP_DECIMAL_PLACEHOLDER = "0,00";

const KP_AUTO_RESIZE_TEXTAREA_SELECTOR =
  ".kp-page__services-textarea, .kp-page__contact textarea.kp-page__input";

function syncTextareaHeight(field) {
  if (!field || field.nodeName !== "TEXTAREA") return;
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

function serviceRowSum(priceStr, qtyStr) {
  const p = parseKpDecimal(priceStr);
  const q = parseKpDecimal(qtyStr);
  if (p === null || q === null) return formatKpComputedSum(null);
  return formatKpComputedSum(p * q);
}

/** Сумма монтажа по КП: отдельные цена×кол-во в каждой карточке (key_id). */
function montageGrandTotalRubForKp(constructions, montageByKeyId) {
  let sum = 0;
  for (const c of constructions) {
    const row = montageByKeyId[c.key_id];
    if (!row) continue;
    const p = parseKpDecimal(row.price);
    const q = parseKpDecimal(row.quantity);
    if (p !== null && q !== null) {
      sum += p * q;
    }
  }
  return sum;
}

/** Сумма блока «Услуги» (цена × количество по строкам). */
function additionalServicesGrandTotalRubForKp(serviceRows) {
  if (!Array.isArray(serviceRows)) return 0;
  let sum = 0;
  for (const row of serviceRows) {
    const p = parseKpDecimal(row.price);
    const q = parseKpDecimal(row.quantity);
    if (p !== null && q !== null) sum += p * q;
  }
  return sum;
}

/** Сумма блока «Дополнительные материалы» (цена × количество по строкам). */
function additionalMaterialsGrandTotalRubForKp(materialRows) {
  if (!Array.isArray(materialRows)) return 0;
  let sum = 0;
  for (const row of materialRows) {
    const p = parseKpDecimal(row.price);
    const q = parseKpDecimal(row.quantity);
    if (p !== null && q !== null) sum += p * q;
  }
  return sum;
}

function newCustomServiceRow() {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `svc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    preset: false,
    name: "",
    price: "",
    quantity: "",
    unit: "",
  };
}

function newCustomMaterialRow() {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `mat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    name: "",
    price: "",
    quantity: "",
    unit: "",
  };
}

function KpCollapsibleExtraTable({
  tableId,
  ariaLabel,
  title,
  sectionOpen,
  onToggleSection,
  totalRub,
  colgroup,
  children,
  footerRows,
}) {
  return (
    <div className="kp-table-card">
      <button
        type="button"
        className="kp-section-collapsible-toggle"
        aria-expanded={sectionOpen}
        aria-controls={tableId}
        onClick={onToggleSection}
      >
        <span className="kp-collapsible-title-row">
          <span className="kp-collapsible-title-inner">
            <span
              className={`kp-collapsible-chevron${
                sectionOpen ? " kp-collapsible-chevron--expanded" : ""
              }`}
              aria-hidden
            />
            <span>{title}</span>
          </span>
          <span className="kp-collapsible-title-sum" aria-hidden>
            {formatRub(totalRub ?? 0)}
          </span>
        </span>
      </button>
      <div className="tbl-in">
        <table
          className="data kp-data-table--starts-with-column-headers"
          id={tableId}
          aria-label={ariaLabel}
          data-export-section-title={title}
          data-erp-data-start-row="1"
        >
          {colgroup}
          {sectionOpen && (
            <>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Цена</th>
                  <th>Количество</th>
                  <th>Ед. изм.</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>{children}</tbody>
              <tfoot>
                {footerRows}
                <tr className="kp-page__section-total-row">
                  <td colSpan={5} className="kp-page__section-total-cell">
                    <div className="kp-card-sections-total__inner">
                      <span className="kp-card-sections-total__label">
                        Итого
                      </span>
                      <span className="kp-card-sections-total__amount">
                        {formatRub(totalRub)}
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </>
          )}
        </table>
      </div>
    </div>
  );
}

const MONTAGE_ROW_LABEL = "Монтаж";

const INITIAL_SERVICE_ROWS = [
  {
    id: "delivery",
    preset: true,
    name: "Доставка",
    price: "",
    quantity: "",
    unit: "",
  },
];

const KP_SETTINGS_FIELDS = [
  { key: "floor", label: "Монтаж пола, р/за м2" },
  { key: "ceiling", label: "Монтаж потолка, р/за м2" },
  { key: "cladding", label: "Монтаж облицовки, р/за м2" },
  { key: "partition", label: "Монтаж перегородки, р/за м2" },
];

function parseConstructionNumber(value) {
  if (value == null || value === "") return NaN;
  const normalized = String(value).replace(",", ".").trim();
  const numericMatch = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!numericMatch) return NaN;
  const parsed = Number(numericMatch[0]);
  return Number.isNaN(parsed) ? NaN : parsed;
}

function constructionHeightMm({ lenY, lenZ }) {
  const z = lenZ != null && lenZ !== "" ? Number(lenZ) : NaN;
  if (!Number.isNaN(z) && z > 0) return lenZ;
  return lenY;
}

function constructionAreaM2(item) {
  const widthMm = parseConstructionNumber(item.lenX);
  const heightMm = parseConstructionNumber(constructionHeightMm(item));
  if (Number.isNaN(widthMm) || Number.isNaN(heightMm)) return NaN;
  if (widthMm <= 0 || heightMm <= 0) return NaN;
  return (widthMm * heightMm) / 1000000;
}

function formatMontageQuantity(areaM2) {
  if (Number.isNaN(areaM2)) return "";
  return areaM2.toFixed(1);
}

function kpSettingKeyByConstructionType(type) {
  const upperType = String(type ?? "")
    .trim()
    .toUpperCase();
  if (upperType === "ПОЛ") return "floor";
  if (upperType === "ПОТОЛОК") return "ceiling";
  if (upperType === "ОБЛИЦОВКА") return "cladding";
  if (upperType === "ПЕРЕГОРОДКА") return "partition";
  return null;
}

function snapshotsAreEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeDateForDateInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dottedMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dottedMatch) {
    const [, dd, mm, yyyy] = dottedMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

const KpPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthed, status: authStatus } = useAuth();
  const { regions, selectedRegion, loaded: priceLoaded, loading: priceLoading, error: priceError } =
    usePriceData();
  const {
    isEditingDraft,
    activeOfferId,
    hasUnsavedChanges,
    kpSnapshot,
    startDraft,
    stashKpSnapshot,
    clearKpSnapshot,
    markDraftSaved,
    markDraftDirty,
    clearSession,
    isOfferPdfExportBlocked,
    isNewDraftOffer,
    clearNewDraftOfferFlag,
    setSelectedPriceArticles,
    setActiveConstructionId,
    setSelectedArticlesForConstruction,
    clearSelectedArticlesForConstruction,
    selectedPriceArticlesByKeyId,
    updateKpSnapshotMaterialRowsForConstruction,
  } = useOfferEditSession();

  const isPdfExportBlocked =
    Boolean(id) && isOfferPdfExportBlocked(id);

  const [form, setForm] = useState(initialForm);
  const [kpCode, setKpCode] = useState("");
  const [calcTables, setCalcTables] = useState({
    tableConstrToCalc: null,
    ConstrToCalc: [],
    materialsByConstruction: [],
  });
  /** Монтаж по карточкам: key_id конструкции → { price, quantity, unit } */
  const [montageByKeyId, setMontageByKeyId] = useState(() => ({}));
  /** Раскрыт блок «Монтаж» в карточке (по key_id); по умолчанию свёрнут */
  const [montageSectionOpenByKeyId, setMontageSectionOpenByKeyId] = useState(
    () => ({}),
  );
  /** Доп. материалы по конструкциям: { [key_id]: rows[] } */
  const [materialRowsByKeyId, setMaterialRowsByKeyId] = useState(() => ({}));
  const [serviceRows, setServiceRows] = useState(INITIAL_SERVICE_ROWS);
  // kpSettings — пользовательские ставки монтажа по типам конструкций. Хранятся
  // в Offer.kp_settings (JSONB), приходят в DTO под ключом `kp_settings`.
  // Снимок отдаётся через useOfferEditSession при возврате из калькулятора, чтобы
  // не сбрасывать локальные правки до сохранения.
  const [kpSettings, setKpSettings] = useState({
    floor: "",
    ceiling: "",
    cladding: "",
    partition: "",
  });
  /** Скидки % в сводках итога КП (секции → ключ строки → %). */
  const [grandTotalDiscounts, setGrandTotalDiscounts] = useState(
    emptyGrandTotalDiscounts,
  );
  /** Суммы скидок ₽ по секциям (для PDF / kp_settings). */
  const [grandTotalDiscountAmounts, setGrandTotalDiscountAmounts] = useState(
    emptyGrandTotalDiscountAmounts,
  );
  const [settingsSectionOpen, setSettingsSectionOpen] = useState(false);
  /** Открыт ли блок доп. материалов по конструкциям: { [key_id]: boolean } */
  const [additionalMaterialsSectionOpenByKeyId, setAdditionalMaterialsSectionOpenByKeyId] =
    useState(() => ({}));
  const [servicesSectionOpen, setServicesSectionOpen] = useState(false);
  /** Свёрнутость карточек конструкций: key_id → collapsed (true = свёрнута). */
  const [cardCollapseOverridesByKeyId, setCardCollapseOverridesByKeyId] =
    useState(() => ({}));
  const isKpNarrow = useKpNarrowViewport();
  const { expandedKey, toggleRow } = useKpExpandedRow();
  const [manualMontagePriceByKeyId, setManualMontagePriceByKeyId] = useState(
    () => ({}),
  );
  const constrToCalcToSentForTable = useCalculatorStore(
    (s) => s.ConstrToCalcToSent,
  );
  const visibleRegionOptions = useMemo(
    () => filterVisibleRegionOptions(regions),
    [regions]
  );
  const isPriceRegionsLoading = priceLoading || (!priceLoaded && !priceError);
  const additionalMaterialsRubByKeyId = useMemo(() => {
    const result = {};
    for (const [keyId, rows] of Object.entries(materialRowsByKeyId)) {
      result[keyId] = additionalMaterialsGrandTotalRubForKp(rows);
    }
    return result;
  }, [materialRowsByKeyId]);

  const additionalMaterialsTotalRub = useMemo(
    () => Object.values(additionalMaterialsRubByKeyId).reduce((a, b) => a + b, 0),
    [additionalMaterialsRubByKeyId],
  );
  const dateInputValue = useMemo(
    () => normalizeDateForDateInput(form.date),
    [form.date],
  );
  const servicesTotalRub = useMemo(
    () => additionalServicesGrandTotalRubForKp(serviceRows),
    [serviceRows],
  );

  const [loadStatus, setLoadStatus] = useState("idle"); // 'idle'|'loading'|'loaded'|'error'|'forbidden'
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [pdfDialogError, setPdfDialogError] = useState(null);
  const originalConstructionsRef = useRef([]); // сырой Offer.constructions с calc_params — для PATCH
  /** Не помечать dirty при первой подстановке данных после загрузки / сохранения. */
  const ignoreDirtyTrackingRef = useRef(true);
  /** Базовый payload последнего сохранённого/загруженного состояния КП. */
  const dirtyBaselinePayloadRef = useRef(null);
  /** После загрузки/сохранения заново инициализируем baseline на ближайшем рендере. */
  const shouldResetDirtyBaselineRef = useRef(true);
  /** Снимок черновика из sessionStore применяем на страницу только один раз на загрузку :id. */
  const didApplyDraftSnapshotRef = useRef(false);
  const prevMaterialRowsByKeyIdRef = useRef({});

  const buildCurrentUpdatePayload = useCallback(() => {
    const calcState = useCalculatorStore.getState();
    return buildUpdateOfferPayload({
      form,
      constructions: calcTables.ConstrToCalc,
      materialsByConstruction: calcTables.materialsByConstruction,
      montageByKeyId,
      serviceRows,
      materialRowsByKeyId,
      kpSettings: {
        ...kpSettings,
        grand_total_discounts: grandTotalDiscounts,
        grand_total_discount_amounts: grandTotalDiscountAmounts,
      },
      originalConstructionsFromOffer: originalConstructionsRef.current,
      constrToCalcToSent: pickConstrToCalcToSentForSave({
        constructions: calcTables.ConstrToCalc,
        originalConstructionsFromOffer: originalConstructionsRef.current,
        calculatorSent: calcState.ConstrToCalcToSent,
        snapshotSent: kpSnapshot?.constrToCalcToSent,
      }),
    });
  }, [
    form,
    calcTables.ConstrToCalc,
    calcTables.materialsByConstruction,
    montageByKeyId,
    serviceRows,
    materialRowsByKeyId,
    kpSettings,
    grandTotalDiscounts,
    grandTotalDiscountAmounts,
    kpSnapshot?.constrToCalcToSent,
  ]);

  // Загрузка оффера по :id.
  useEffect(() => {
    if (!id) return undefined;
    if (authStatus === "loading") return undefined;
    if (!isAuthed) {
      // LoginModal не открываем автоматически (иначе всплывает после logout).
      // Просто рисуем экран-подсказку «войдите».
      setLoadStatus("forbidden");
      return undefined;
    }

    let cancelled = false;
    setSettingsSectionOpen(false);
    setServicesSectionOpen(false);
    setLoadStatus("loading");
    setLoadError(null);

    (async () => {
      try {
        const offer = await getOffer(id);
        if (cancelled) return;

        setKpCode(offer.kp_code || "");
        const view = mapOfferResponseToKpView(offer);
        originalConstructionsRef.current = offer.constructions || [];

        const snap = kpSnapshot && activeOfferId === id ? kpSnapshot : null;
        const viewCalcTables = {
          tableConstrToCalc: view.constructions.length > 0 ? {} : null,
          ConstrToCalc: view.constructions,
          materialsByConstruction: view.materialsByConstruction,
        };
        const viewConstrToCalcToSent = (offer.constructions || [])
          .map((c) => c.calc_params)
          .filter(Boolean);
        const viewServiceRows =
          view.serviceRows.length > 0 ? view.serviceRows : INITIAL_SERVICE_ROWS;
        const viewMaterialRowsByKeyId =
          Object.keys(view.materialRowsByKeyId).length > 0
            ? view.materialRowsByKeyId
            : {};
        const viewManualMontagePriceByKeyId = {};
        for (const [keyId, row] of Object.entries(view.montageByKeyId)) {
          if (row && typeof row.price === "string" && row.price.trim() !== "") {
            viewManualMontagePriceByKeyId[keyId] = true;
          }
        }
        const snapshotFromServer = {
          form: view.form,
          calcTables: viewCalcTables,
          constrToCalcToSent: viewConstrToCalcToSent,
          montageByKeyId: view.montageByKeyId,
          serviceRows: viewServiceRows,
          materialRowsByKeyId: viewMaterialRowsByKeyId,
          manualMontagePriceByKeyId: viewManualMontagePriceByKeyId,
          kpSettings: view.kpSettings,
          grandTotalDiscounts: view.grandTotalDiscounts,
          grandTotalDiscountAmounts: view.grandTotalDiscountAmounts,
        };
        const hasOnlyStaleSnapshot = Boolean(
          snap && snapshotsAreEqual(snap, snapshotFromServer),
        );
        const effectiveSnap = hasOnlyStaleSnapshot ? null : snap;
        didApplyDraftSnapshotRef.current = Boolean(effectiveSnap);
        // При входе в КП из списка без локальных правок ничего не меняли:
        // считаем черновик «чистым», чтобы не требовать повторного сохранения.
        if (hasOnlyStaleSnapshot) {
          clearKpSnapshot();
        }
        if (!effectiveSnap) {
          markDraftSaved();
        }

        if (effectiveSnap) {
          setCardCollapseOverridesByKeyId(
            effectiveSnap.cardCollapseOverridesByKeyId ?? {},
          );
          setMontageSectionOpenByKeyId(
            effectiveSnap.montageSectionOpenByKeyId ?? {},
          );
          setAdditionalMaterialsSectionOpenByKeyId(
            effectiveSnap.additionalMaterialsSectionOpenByKeyId ?? {},
          );
        } else {
          setCardCollapseOverridesByKeyId({});
          setMontageSectionOpenByKeyId({});
          setAdditionalMaterialsSectionOpenByKeyId({});
        }

        setForm(effectiveSnap?.form ?? view.form);
        // Сессия калькулятора/КП живёт в kpSnapshot — иначе после удаления
        // в калькуляторе GET снова подставляет старый состав до PATCH.
        const rawCalcTables = effectiveSnap?.calcTables
          ? effectiveSnap.calcTables
          : viewCalcTables;
        const constrToCalcToSent =
          effectiveSnap?.constrToCalcToSent ?? viewConstrToCalcToSent;
        const nextCalcTablesRaw =
          rawCalcTables.ConstrToCalc?.length > 0
            ? {
                ...rawCalcTables,
                tableConstrToCalc: rawCalcTables.tableConstrToCalc ?? {},
              }
            : rawCalcTables;
        const nextCalcTables = {
          ...nextCalcTablesRaw,
          ConstrToCalc: enrichConstructionsWithTitles(
            nextCalcTablesRaw?.ConstrToCalc ?? [],
            null,
            constrToCalcToSent,
          ),
        };

        setCalcTables(nextCalcTables);
        useCalculatorStore
          .getState()
          .loadKpEditState(
            buildCalculatorSyncFromKp({
              calcTables: nextCalcTables,
              constrToCalcToSent,
            }),
          );
        setMontageByKeyId(effectiveSnap?.montageByKeyId ?? view.montageByKeyId);
        setServiceRows(
          effectiveSnap?.serviceRows ?? viewServiceRows,
        );
        setMaterialRowsByKeyId(
          effectiveSnap?.materialRowsByKeyId ?? viewMaterialRowsByKeyId,
        );
        if (effectiveSnap?.kpSettings) {
          setKpSettings(effectiveSnap.kpSettings);
        } else if (view.kpSettings) {
          setKpSettings(view.kpSettings);
        }
        setGrandTotalDiscounts(
          normalizeGrandTotalDiscounts(
            effectiveSnap?.grandTotalDiscounts ?? view.grandTotalDiscounts,
          ),
        );
        setGrandTotalDiscountAmounts(
          normalizeGrandTotalDiscountAmounts(
            effectiveSnap?.grandTotalDiscountAmounts ??
              view.grandTotalDiscountAmounts,
          ),
        );
        if (effectiveSnap?.manualMontagePriceByKeyId) {
          setManualMontagePriceByKeyId(effectiveSnap.manualMontagePriceByKeyId);
        } else {
          // Цена монтажа из БД (c.montage[0].price) приоритетнее ставки из
          // настроек КП: помечаем такие key_id как «ручные», иначе авто-эффект
          // ниже перезатрёт их значением из kpSettings.
          const initialManual = {};
          for (const [keyId, row] of Object.entries(view.montageByKeyId)) {
            if (
              row &&
              typeof row.price === "string" &&
              row.price.trim() !== ""
            ) {
              initialManual[keyId] = true;
            }
          }
          setManualMontagePriceByKeyId(initialManual);
        }
        // Восстановить артикулы по каждой конструкции из materialRowsByKeyId.
        const rowsByKeyId =
          effectiveSnap?.materialRowsByKeyId ?? view.materialRowsByKeyId;
        for (const [keyId, rows] of Object.entries(rowsByKeyId)) {
          const articles = rows
            .map((r) => String(r.sourceArticle ?? "").trim())
            .filter(Boolean);
          if (articles.length) setSelectedArticlesForConstruction(keyId, articles);
        }

        setLoadStatus("loaded");
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 404) {
          clearSession();
          navigate("/kp/list", { replace: true });
          return;
        } else if (err?.status === 401) {
          setLoadStatus("forbidden");
        } else {
          setLoadStatus("error");
          setLoadError(err?.message || "Не удалось загрузить оффер.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    id,
    isAuthed,
    authStatus,
    activeOfferId,
    clearKpSnapshot,
    clearSession,
    navigate,
    markDraftSaved,
    setSelectedArticlesForConstruction,
  ]);

  useEffect(() => {
    ignoreDirtyTrackingRef.current = true;
    dirtyBaselinePayloadRef.current = null;
    shouldResetDirtyBaselineRef.current = true;
    didApplyDraftSnapshotRef.current = false;
    prevMaterialRowsByKeyIdRef.current = {};
  }, [id]);

  // Когда открываем КП из списка после «Выйти», persisted zustand может догрузиться
  // чуть позже первого GET /offers/:id. Подхватываем snapshot один раз после load.
  useEffect(() => {
    if (loadStatus !== "loaded" || !id || didApplyDraftSnapshotRef.current) return;
    const liveState = useOfferEditSessionStore.getState();
    if (String(liveState.activeOfferId ?? "") !== String(id)) return;
    const snap = liveState.kpSnapshot;
    if (!snap) return;

    const nextCalcTables = snap.calcTables
      ? snap.calcTables.ConstrToCalc?.length > 0
        ? {
            ...snap.calcTables,
            tableConstrToCalc: snap.calcTables.tableConstrToCalc ?? {},
          }
        : snap.calcTables
      : null;

    if (snap.form) setForm(snap.form);
    if (nextCalcTables) setCalcTables(nextCalcTables);
    if (snap.montageByKeyId) setMontageByKeyId(snap.montageByKeyId);
    if (snap.serviceRows) setServiceRows(snap.serviceRows);
    if (snap.materialRowsByKeyId) setMaterialRowsByKeyId(snap.materialRowsByKeyId);
    if (snap.kpSettings) setKpSettings(snap.kpSettings);
    if (snap.grandTotalDiscounts) {
      setGrandTotalDiscounts(normalizeGrandTotalDiscounts(snap.grandTotalDiscounts));
    }
    if (snap.grandTotalDiscountAmounts) {
      setGrandTotalDiscountAmounts(
        normalizeGrandTotalDiscountAmounts(snap.grandTotalDiscountAmounts),
      );
    }
    if (snap.manualMontagePriceByKeyId) {
      setManualMontagePriceByKeyId(snap.manualMontagePriceByKeyId);
    }
    if (snap.cardCollapseOverridesByKeyId) {
      setCardCollapseOverridesByKeyId(snap.cardCollapseOverridesByKeyId);
    }
    if (snap.montageSectionOpenByKeyId) {
      setMontageSectionOpenByKeyId(snap.montageSectionOpenByKeyId);
    }
    if (snap.additionalMaterialsSectionOpenByKeyId) {
      setAdditionalMaterialsSectionOpenByKeyId(
        snap.additionalMaterialsSectionOpenByKeyId,
      );
    }

    didApplyDraftSnapshotRef.current = true;
  }, [id, loadStatus, activeOfferId, kpSnapshot]);

  // Черновик включаем до отрисовки, чтобы PDF не мигал доступным до startDraft.
  useLayoutEffect(() => {
    if (id && isAuthed && authStatus !== "loading") {
      startDraft(id);
    }
  }, [id, isAuthed, authStatus, startDraft]);

  useEffect(() => {
    if (loadStatus !== "loaded" || !id) return;
    if (ignoreDirtyTrackingRef.current) {
      ignoreDirtyTrackingRef.current = false;
      const initialPayloadHash = JSON.stringify(buildCurrentUpdatePayload());
      dirtyBaselinePayloadRef.current = initialPayloadHash;
      shouldResetDirtyBaselineRef.current = false;
      markDraftSaved();
      return;
    }
    const currentPayloadHash = JSON.stringify(buildCurrentUpdatePayload());
    if (
      shouldResetDirtyBaselineRef.current ||
      dirtyBaselinePayloadRef.current === null
    ) {
      dirtyBaselinePayloadRef.current = currentPayloadHash;
      shouldResetDirtyBaselineRef.current = false;
      markDraftSaved();
      return;
    }
    if (dirtyBaselinePayloadRef.current === currentPayloadHash) {
      markDraftSaved();
      return;
    }
    markDraftDirty();
  }, [
    buildCurrentUpdatePayload,
    loadStatus,
    id,
    manualMontagePriceByKeyId,
    markDraftSaved,
    markDraftDirty,
  ]);

  // Авто-заполнение montage по kpSettings и площади конструкций (фича из main).
  // После загрузки оффера или ручной правки kpSettings/конструкций пересчитываем
  // строки монтажа. Если пользователь руками поправил цену — manualMontagePriceByKeyId
  // защищает её от перезаписи.
  useEffect(() => {
    const constructions = calcTables.ConstrToCalc;
    if (!Array.isArray(constructions) || constructions.length === 0) {
      return;
    }

    setMontageByKeyId((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const item of constructions) {
        const typeKey = kpSettingKeyByConstructionType(item.type);
        const montageRate = typeKey ? (kpSettings[typeKey] ?? "") : "";
        const areaM2 = constructionAreaM2(item);
        const quantity = formatMontageQuantity(areaM2);
        const prevRow = prev[item.key_id];
        // «Ручная» цена закрепляется за пользователем целиком — в т.ч. пустое
        // значение (пользователь явно очистил поле): подставлять ставку из
        // kpSettings можно только если флаг manualMontagePriceByKeyId не взведён.
        const keepManualPrice =
          manualMontagePriceByKeyId[item.key_id] === true && prevRow;
        const normalizedRow = {
          price: keepManualPrice ? (prevRow.price ?? "") : montageRate,
          quantity,
          unit: "м2",
        };
        next[item.key_id] = normalizedRow;
        if (
          !prevRow ||
          prevRow.price !== normalizedRow.price ||
          prevRow.quantity !== normalizedRow.quantity ||
          prevRow.unit !== normalizedRow.unit
        ) {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [calcTables.ConstrToCalc, kpSettings, manualMontagePriceByKeyId]);

  const updateMontagePriceRow = useCallback(
    (key_id) => (e) => {
      const value = e.target.value;
      // Любое касание поля (в т.ч. полная очистка) «закрепляет» цену за
      // пользователем: после этого авто-эффект не подставит ставку из kpSettings.
      setManualMontagePriceByKeyId((prev) => {
        if (prev[key_id] === true) return prev;
        return { ...prev, [key_id]: true };
      });
      setMontageByKeyId((prev) => ({
        ...prev,
        [key_id]: {
          unit: "м2",
          ...prev[key_id],
          price: value,
        },
      }));
    },
    [],
  );

  const handleDownloadPdf = () => {
    if (!id || isDownloadingPdf) return;
    if (isPdfExportBlocked) {
      setSaveError(
        "Сначала сохраните КП — PDF строится по данным в базе, а не по несохранённым правкам на экране.",
      );
      return;
    }
    // Сначала диалог с данными для печати (адресат + условия); фактическая
    // выгрузка — в handleConfirmPdfDownload. Поля диалога в БД не хранятся.
    setPdfDialogError(null);
    setIsPdfDialogOpen(true);
  };

  const handleClosePdfDialog = useCallback(() => {
    if (isDownloadingPdf) return;
    setIsPdfDialogOpen(false);
    setPdfDialogError(null);
  }, [isDownloadingPdf]);

  const handleConfirmPdfDownload = async (printParams) => {
    if (!id || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    setPdfDialogError(null);
    setSaveError(null);
    try {
      // Поля диалога уходят транзитными query-параметрами в /pdf и в БД не
      // сохраняются (адресат — вступление, остальные — блок условий).
      // Колонтитулы PDF берут название фирмы из формы (company_name), уже
      // сохранённое в базе. Возвращаем blob для предпросмотра в диалоге —
      // скачивание только после кнопки «Скачать PDF».
      const objectPart = form.object?.trim() || id;
      return await fetchOfferPdf(id, `КП ${objectPart}.pdf`, printParams);
    } catch (err) {
      setPdfDialogError(err?.message || "Не удалось сгенерировать PDF.");
      return null;
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleSave = async () => {
    if (!id || isSaving) return;
    if (!isKpContactFormComplete(form)) {
      setSaveError(
        "Заполните все поля в блоке «Контактные данные» (дата, регион, объект, менеджер, телефон, email, адрес офиса).",
      );
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = buildCurrentUpdatePayload();
      const updated = await updateOffer(id, payload);
      if (updated?.constructions) {
        originalConstructionsRef.current = updated.constructions;
        const sent = updated.constructions
          .map((c) => c.calc_params)
          .filter(Boolean);
        useCalculatorStore.getState().setField("ConstrToCalcToSent", sent);
      }
      markDraftSaved();
      clearKpSnapshot();
      clearNewDraftOfferFlag(id);
      ignoreDirtyTrackingRef.current = true;
      shouldResetDirtyBaselineRef.current = true;
    } catch (err) {
      const issues = err?.body?.issues;
      if (Array.isArray(issues) && issues.length > 0) {
        setSaveError(
          issues
            .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
            .join("; "),
        );
      } else {
        setSaveError(err?.message || "Не удалось сохранить.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const onMaterialKpFieldChange = useCallback(
    (key_id, indexInFullMaterialsData, field, value) => {
      setCalcTables((prev) => ({
        ...prev,
        materialsByConstruction: prev.materialsByConstruction.map((entry) => {
          if (entry.key_id !== key_id) return entry;
          const nextData = entry.data.map((row, i) =>
            i === indexInFullMaterialsData ? { ...row, [field]: value } : row,
          );
          return { ...entry, data: nextData };
        }),
      }));
    },
    [],
  );

  const onFieldChange = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const onRegionChange = (e) => {
    const optionValue = e.target.value;
    setForm((prev) => ({ ...prev, region: optionValue }));
    const selectedOption = REGION_SELECT_OPTIONS.find(
      (option) => option.value === optionValue,
    );
    if (!selectedOption) return;
    setPriceRegion(selectedOption.regionKey, { cityValue: optionValue });
  };

  useEffect(() => {
    if (!form.region || loadStatus !== "loaded" || !priceLoaded) return;
    const selectedOption =
      findRegionOptionByValue(form.region) ??
      findRegionOptionByRegionKey(form.region);
    if (!selectedOption) return;
    setPriceRegion(selectedOption.regionKey, { cityValue: selectedOption.value });
  }, [form.region, loadStatus, priceLoaded]);

  useEffect(() => {
    if (!selectedRegion || form.region) return;
    const selectedRegionKey = String(selectedRegion).toLowerCase();
    const matchingOption = visibleRegionOptions.find(
      (option) => option.regionKey === selectedRegionKey,
    );
    if (!matchingOption) return;
    setForm((prev) => ({ ...prev, region: matchingOption.value }));
    setPriceRegion(matchingOption.regionKey, {
      cityValue: matchingOption.value,
    });
  }, [form.region, selectedRegion, visibleRegionOptions]);

  const updateServiceRow = (id, field) => (e) => {
    const value = e.target.value;
    setServiceRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const addServiceRow = () => {
    setServiceRows((rows) => [...rows, newCustomServiceRow()]);
  };

  const removeServiceRow = (id) => {
    setServiceRows((rows) => rows.filter((r) => r.preset || r.id !== id));
  };

  const updateMaterialRow = useCallback(
    (key_id, rowId, field) => (e) => {
      const value = e.target.value;
      setMaterialRowsByKeyId((prev) => {
        const rows = prev[key_id] ?? [];
        const nextRows = rows.map((r) =>
          r.id === rowId ? { ...r, [field]: value } : r,
        );
        return {
          ...prev,
          [key_id]: nextRows,
        };
      });
    },
    [],
  );

  const autoResizeNameField = (e) => {
    syncTextareaHeight(e.target);
  };

  const onContactFieldChange = (key) => (e) => {
    onFieldChange(key)(e);
    autoResizeNameField(e);
  };

  useEffect(() => {
    const syncAll = () => {
      requestAnimationFrame(() => {
        document
          .querySelectorAll(KP_AUTO_RESIZE_TEXTAREA_SELECTOR)
          .forEach(syncTextareaHeight);
      });
    };

    syncAll();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const { target } of entries) {
        syncTextareaHeight(target);
      }
    });

    const fields = document.querySelectorAll(KP_AUTO_RESIZE_TEXTAREA_SELECTOR);
    fields.forEach((field) => resizeObserver.observe(field));

    window.addEventListener("resize", syncAll);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncAll);
    };
  }, [
    materialRowsByKeyId,
    serviceRows,
    loadStatus,
    isKpNarrow,
    expandedKey,
    form.object,
    form.manager,
    form.phone,
    form.email,
    form.officeAddress,
  ]);

  // Синхронизируем snapshot доп. материалов после коммита React-стейта.
  // Важно: не вызывать zustand setState внутри React setState-updater.
  useEffect(() => {
    const prev = prevMaterialRowsByKeyIdRef.current || {};
    const next = materialRowsByKeyId || {};
    for (const [keyId, rows] of Object.entries(next)) {
      if (!snapshotsAreEqual(prev[keyId] ?? [], rows ?? [])) {
        updateKpSnapshotMaterialRowsForConstruction(keyId, rows ?? []);
      }
    }
    for (const keyId of Object.keys(prev)) {
      if (!(keyId in next)) {
        updateKpSnapshotMaterialRowsForConstruction(keyId, []);
      }
    }
    prevMaterialRowsByKeyIdRef.current = next;
  }, [materialRowsByKeyId, updateKpSnapshotMaterialRowsForConstruction]);

  // Скидки итога — в session snapshot, чтобы пережить reload и уход на /calc|/price.
  useEffect(() => {
    if (loadStatus !== "loaded") return;
    const sess = useOfferEditSessionStore.getState();
    const prev = sess.kpSnapshot ?? {};
    const normalizedDiscounts = normalizeGrandTotalDiscounts(grandTotalDiscounts);
    const normalizedAmounts = normalizeGrandTotalDiscountAmounts(
      grandTotalDiscountAmounts,
    );
    if (
      snapshotsAreEqual(
        normalizeGrandTotalDiscounts(prev.grandTotalDiscounts),
        normalizedDiscounts,
      ) &&
      snapshotsAreEqual(
        normalizeGrandTotalDiscountAmounts(prev.grandTotalDiscountAmounts),
        normalizedAmounts,
      )
    ) {
      return;
    }
    sess.stashKpSnapshot({
      ...prev,
      grandTotalDiscounts: normalizedDiscounts,
      grandTotalDiscountAmounts: normalizedAmounts,
    });
  }, [grandTotalDiscounts, grandTotalDiscountAmounts, loadStatus]);

  const handleGrandTotalDiscountChange = useCallback(
    (section, rowKeyOrPatch, value) => {
      setGrandTotalDiscounts((prev) => {
        const sectionMap = { ...(prev[section] ?? {}) };
        const applyOne = (rowKey, raw) => {
          if (raw == null || String(raw).trim() === "") {
            delete sectionMap[rowKey];
          } else {
            sectionMap[rowKey] = String(raw);
          }
        };
        if (
          rowKeyOrPatch &&
          typeof rowKeyOrPatch === "object" &&
          !Array.isArray(rowKeyOrPatch)
        ) {
          for (const [rowKey, raw] of Object.entries(rowKeyOrPatch)) {
            applyOne(rowKey, raw);
          }
        } else if (rowKeyOrPatch != null) {
          applyOne(rowKeyOrPatch, value);
        }
        return {
          ...prev,
          [section]: sectionMap,
        };
      });
    },
    [],
  );

  const handleGrandTotalDiscountAmountsChange = useCallback((amounts) => {
    setGrandTotalDiscountAmounts(normalizeGrandTotalDiscountAmounts(amounts));
  }, []);

  const addMaterialRow = useCallback(
    (key_id) => {
      setMaterialRowsByKeyId((prev) => {
        return {
          ...prev,
          [key_id]: [...(prev[key_id] ?? []), newCustomMaterialRow()],
        };
      });
    },
    [],
  );

  const removeMaterialRow = useCallback(
    (key_id, rowId) => {
      setMaterialRowsByKeyId((prev) => {
        const rows = (prev[key_id] ?? []).filter((r) => r.id !== rowId);
        if (rows.length === 0) {
          const next = { ...prev };
          delete next[key_id];
          return next;
        }
        return { ...prev, [key_id]: rows };
      });
    },
    [],
  );

  const onKpSettingChange = (key) => (e) => {
    setKpSettings((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const toggleSettingsSection = () => {
    setSettingsSectionOpen((prev) => !prev);
  };

  const toggleCardCollapsed = useCallback((key_id) => {
    setCardCollapseOverridesByKeyId((prev) => ({
      ...prev,
      [key_id]: !(prev[key_id] ?? true),
    }));
  }, []);

  const stashAndLeaveKp = useCallback(() => {
    const calcParamsById = new Map(
      (originalConstructionsRef.current || []).map((c) => [
        c.id,
        c.calc_params,
      ]),
    );
    const constrToCalcToSent = (calcTables.ConstrToCalc || [])
      .map((ui) => calcParamsById.get(ui.key_id))
      .filter(Boolean);
    const tablesForSnapshot =
      calcTables.ConstrToCalc?.length > 0
        ? {
            ...calcTables,
            tableConstrToCalc: calcTables.tableConstrToCalc ?? {},
          }
        : calcTables;

    stashKpSnapshot({
      form,
      calcTables: tablesForSnapshot,
      constrToCalcToSent,
      montageByKeyId,
      serviceRows,
      materialRowsByKeyId,
      manualMontagePriceByKeyId,
      kpSettings,
      grandTotalDiscounts,
      grandTotalDiscountAmounts,
      cardCollapseOverridesByKeyId,
      montageSectionOpenByKeyId,
      additionalMaterialsSectionOpenByKeyId,
    });
  }, [
    stashKpSnapshot,
    form,
    calcTables,
    montageByKeyId,
    serviceRows,
    materialRowsByKeyId,
    manualMontagePriceByKeyId,
    kpSettings,
    grandTotalDiscounts,
    grandTotalDiscountAmounts,
    cardCollapseOverridesByKeyId,
    montageSectionOpenByKeyId,
    additionalMaterialsSectionOpenByKeyId,
  ]);

  const handleExit = useCallback(async () => {
    if (!id) return;
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "Есть не сохраненные данные. Выйти без сохранения?",
      );
      if (!confirmed) return;
    }
    if (isNewDraftOffer(id)) {
      try {
        await deleteOffer(id);
        clearNewDraftOfferFlag(id);
      } catch (err) {
        setSaveError(
          err?.message || "Не удалось отменить новое КП. Попробуйте еще раз.",
        );
        return;
      }
    }
    // «Выйти» — только выход из КП: без автосохранения и без сохранения snapshot.
    clearKpSnapshot();
    useOfferEditSessionStore.getState().leaveToOfferList();
    navigate("/kp/list", {
      replace: true,
      state: { kpExit: true },
    });
  }, [
    id,
    hasUnsavedChanges,
    isNewDraftOffer,
    clearNewDraftOfferFlag,
    clearKpSnapshot,
    navigate,
  ]);

  const openPriceForConstruction = useCallback((key_id) => {
    setActiveConstructionId(key_id);
    stashAndLeaveKp();
    navigate("/price");
  }, [setActiveConstructionId, stashAndLeaveKp, navigate]);

  const openCalculatorForConstructions = () => {
    stashAndLeaveKp();
    const snap = useOfferEditSessionStore.getState().kpSnapshot;
    if (snap?.calcTables) {
      useCalculatorStore
        .getState()
        .loadKpEditState(
          buildCalculatorSyncFromKp({
            calcTables: snap.calcTables,
            constrToCalcToSent: snap.constrToCalcToSent,
          }),
        );
    }
    navigate("/calc");
  };

  const updateMontageRow = useCallback(
    (key_id, field) => (e) => {
      const value = e.target.value;
      setMontageByKeyId((prev) => ({
        ...prev,
        [key_id]: {
          price: "",
          quantity: "",
          unit: "",
          ...prev[key_id],
          [field]: value,
        },
      }));
    },
    [],
  );

  const toggleMontageSection = useCallback((key_id) => {
    setMontageSectionOpenByKeyId((prev) => ({
      ...prev,
      [key_id]: !prev[key_id],
    }));
  }, []);

  const removeConstructionFromKp = useCallback((key_id) => {
    const nextConstr = (calcTables.ConstrToCalc || []).filter(
      (item) => item.key_id !== key_id,
    );
    const nextMaterials = (calcTables.materialsByConstruction || []).filter(
      (entry) => entry.key_id !== key_id,
    );
    const nextCalcTables = {
      ...calcTables,
      ConstrToCalc: nextConstr,
      materialsByConstruction: nextMaterials,
      tableConstrToCalc:
        nextConstr.length === 0 ? null : calcTables.tableConstrToCalc,
    };
    const calcParamsById = new Map(
      (originalConstructionsRef.current || []).map((c) => [
        c.id,
        c.calc_params,
      ]),
    );
    const constrToCalcToSent = nextConstr
      .map((ui) => calcParamsById.get(ui.key_id))
      .filter(Boolean);

    setCalcTables(nextCalcTables);

    const { setField } = useCalculatorStore.getState();
    setField("ConstrToCalc", nextConstr);
    setField("materialsByConstruction", nextMaterials);
    setField("ConstrToCalcToSent", constrToCalcToSent);
    if (nextConstr.length === 0) {
      setField("tableConstrToCalc", null);
    }

    const sess = useOfferEditSessionStore.getState();
    if (sess.activeOfferId === id) {
      const prevSnap = sess.kpSnapshot || {};
      const patch = {
        ...prevSnap,
        calcTables: nextCalcTables,
        constrToCalcToSent,
      };
      if (prevSnap.montageByKeyId) {
        const m = { ...prevSnap.montageByKeyId };
        delete m[key_id];
        patch.montageByKeyId = m;
      }
      if (prevSnap.manualMontagePriceByKeyId) {
        const m = { ...prevSnap.manualMontagePriceByKeyId };
        delete m[key_id];
        patch.manualMontagePriceByKeyId = m;
      }
      if (prevSnap.cardCollapseOverridesByKeyId) {
        const m = { ...prevSnap.cardCollapseOverridesByKeyId };
        delete m[key_id];
        patch.cardCollapseOverridesByKeyId = m;
      }
      if (prevSnap.montageSectionOpenByKeyId) {
        const m = { ...prevSnap.montageSectionOpenByKeyId };
        delete m[key_id];
        patch.montageSectionOpenByKeyId = m;
      }
      if (prevSnap.additionalMaterialsSectionOpenByKeyId) {
        const m = { ...prevSnap.additionalMaterialsSectionOpenByKeyId };
        delete m[key_id];
        patch.additionalMaterialsSectionOpenByKeyId = m;
      }
      sess.stashKpSnapshot(patch);
    }

    setCardCollapseOverridesByKeyId((prev) => {
      if (!(key_id in prev)) return prev;
      const next = { ...prev };
      delete next[key_id];
      return next;
    });

    setMontageByKeyId((prev) => {
      if (!(key_id in prev)) return prev;
      const next = { ...prev };
      delete next[key_id];
      return next;
    });

    setMontageSectionOpenByKeyId((prev) => {
      if (!(key_id in prev)) return prev;
      const next = { ...prev };
      delete next[key_id];
      return next;
    });

    setManualMontagePriceByKeyId((prev) => {
      if (!(key_id in prev)) return prev;
      const next = { ...prev };
      delete next[key_id];
      return next;
    });

    setMaterialRowsByKeyId((prev) => {
      if (!(key_id in prev)) return prev;
      const next = { ...prev };
      delete next[key_id];
      return next;
    });

    setAdditionalMaterialsSectionOpenByKeyId((prev) => {
      if (!(key_id in prev)) return prev;
      const next = { ...prev };
      delete next[key_id];
      return next;
    });

    clearSelectedArticlesForConstruction(key_id);
  }, [id, calcTables, clearSelectedArticlesForConstruction]);

  const renderKpMontageSlot = useCallback(
    ({ key_id, cardIndex }) => {
      const row = montageByKeyId[key_id] ?? {
        price: "",
        quantity: "",
        unit: "",
      };
      const montageOpen = montageSectionOpenByKeyId[key_id] === true;
      return (
        <div className="tbl-in kp-page__montage-table-wrap">
          <button
            type="button"
            className="kp-section-collapsible-toggle"
            aria-expanded={montageOpen}
            onClick={() => toggleMontageSection(key_id)}
          >
            <span className="kp-collapsible-title-row">
              <span className="kp-collapsible-title-inner">
                <span
                  className={`kp-collapsible-chevron${
                    montageOpen ? " kp-collapsible-chevron--expanded" : ""
                  }`}
                  aria-hidden
                />
                <span>Монтаж</span>
              </span>
              <span className="kp-collapsible-title-sum" aria-hidden>
                {formatRub(montageLineProductRub(row) ?? 0)}
              </span>
            </span>
          </button>
          <table
            className="data kp-data-table--starts-with-column-headers"
            id={`kp-table-montage-${key_id}`}
            aria-label={`Монтаж, карточка ${cardIndex + 1}`}
            data-export-section-title="Монтаж"
            data-erp-data-start-row="1"
          >
            {montageOpen && (
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Цена</th>
                  <th>Количество</th>
                  <th>Ед. изм.</th>
                  <th>Сумма</th>
                </tr>
              </thead>
            )}
            {montageOpen && (
              <tbody>
                {(() => {
                  const montageRowKey = `montage-${key_id}`;
                  const priceInput = (
                    <input
                      id={`kp-montage-${key_id}-price`}
                      type="text"
                      className="kp-page__services-input"
                      value={row.price}
                      placeholder={KP_DECIMAL_PLACEHOLDER}
                      onChange={updateMontagePriceRow(key_id)}
                      aria-label={`Цена, ${MONTAGE_ROW_LABEL} (карточка ${cardIndex + 1}, из настроек КП)`}
                    />
                  );
                  const quantityInput = (
                    <input
                      id={`kp-montage-${key_id}-quantity`}
                      type="text"
                      readOnly
                      className="kp-page__services-input"
                      value={row.quantity}
                      placeholder={KP_DECIMAL_PLACEHOLDER}
                      aria-label={`Количество, ${MONTAGE_ROW_LABEL} (карточка ${cardIndex + 1}, площадь конструкции)`}
                    />
                  );
                  const unitInput = (
                    <input
                      id={`kp-montage-${key_id}-unit`}
                      type="text"
                      readOnly
                      className="kp-page__services-input"
                      value={row.unit}
                      aria-label={`Единица измерения, ${MONTAGE_ROW_LABEL} (карточка ${cardIndex + 1})`}
                    />
                  );
                  const sumInput = (
                    <input
                      id={`kp-montage-${key_id}-sum`}
                      type="text"
                      readOnly
                      className="kp-page__services-input kp-page__services-input--computed"
                      value={serviceRowSum(row.price, row.quantity)}
                      aria-label={`Сумма, ${MONTAGE_ROW_LABEL} (карточка ${cardIndex + 1}, цена × количество)`}
                    />
                  );
                  const montageDetailFields = [
                    { id: "price", label: "Цена", children: priceInput },
                    {
                      id: "quantity",
                      label: "Количество",
                      children: quantityInput,
                    },
                    { id: "unit", label: "Ед. изм.", children: unitInput },
                    { id: "sum", label: "Сумма", children: sumInput },
                  ];
                  const montageCells = isKpNarrow ? (
                    <>
                      <td className="kp-page__service-name-td--preset">
                        {MONTAGE_ROW_LABEL}
                      </td>
                      <td />
                      <td />
                      <td />
                      <td className="kp-narrow-row-summary-sum">
                        {serviceRowSum(row.price, row.quantity)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="kp-page__service-name-td--preset">
                        {MONTAGE_ROW_LABEL}
                      </td>
                      <td>{priceInput}</td>
                      <td>{quantityInput}</td>
                      <td>{unitInput}</td>
                      <td>{sumInput}</td>
                    </>
                  );
                  if (isKpNarrow) {
                    return (
                      <KpNarrowExpandableRow
                        rowKey={montageRowKey}
                        expandedKey={expandedKey}
                        onToggleRow={toggleRow}
                        narrow
                        colSpan={5}
                        detailTitle={MONTAGE_ROW_LABEL}
                        detailFields={montageDetailFields}
                      >
                        {montageCells}
                      </KpNarrowExpandableRow>
                    );
                  }
                  return <tr>{montageCells}</tr>;
                })()}
              </tbody>
            )}
          </table>
        </div>
      );
    },
    [
      montageByKeyId,
      montageSectionOpenByKeyId,
      toggleMontageSection,
      updateMontagePriceRow,
      updateMontageRow,
      isKpNarrow,
      expandedKey,
      toggleRow,
    ],
  );

  const renderKpAdditionalMaterialsSlot = useCallback(
    ({ key_id, cardIndex }) => {
      const rows = materialRowsByKeyId[key_id] ?? [];
      const sectionOpen = additionalMaterialsSectionOpenByKeyId[key_id] === true;
      const totalRub = additionalMaterialsGrandTotalRubForKp(rows);

      const toggleSection = () => {
        const willClose = sectionOpen;
        setAdditionalMaterialsSectionOpenByKeyId((prev) => ({
          ...prev,
          [key_id]: !prev[key_id],
        }));
        if (willClose) {
          // При закрытии — сбрасываем выбранные артикулы для этой конструкции.
          clearSelectedArticlesForConstruction(key_id);
        }
      };

      return (
        <KpCollapsibleExtraTable
          tableId={`kp-table-additional-materials-${key_id}`}
          ariaLabel={`Дополнительные материалы, карточка ${cardIndex + 1}`}
          title="Дополнительные материалы"
          sectionOpen={sectionOpen}
          onToggleSection={toggleSection}
          totalRub={totalRub}
          colgroup={
            <colgroup>
              <col style={{ width: "50%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
          }
          footerRows={
            <tr className="kp-page__services-add-row">
              <td colSpan={5} className="kp-page__services-add-cell">
                <div className="kp-page__services-add-actions">
                  <button
                    type="button"
                    className="kp-page__services-add kp-page__services-add--secondary"
                    onClick={() => openPriceForConstruction(key_id)}
                  >
                    Выбрать материал из прайса
                  </button>
                  <button
                    type="button"
                    className="kp-page__services-add"
                    onClick={() => addMaterialRow(key_id)}
                  >
                    Добавить строку
                  </button>
                </div>
              </td>
            </tr>
          }
        >
          {rows.map((row) => {
            const rowKey = `mat-${key_id}-${row.id}`;
            const removeRowButton = (
              <button
                type="button"
                className="kp-page__service-row-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMaterialRow(key_id, row.id);
                }}
                aria-label="Удалить строку"
              >
                ×
              </button>
            );
            const nameTextarea = (
              <textarea
                className="kp-page__services-input kp-page__services-textarea"
                value={row.name}
                onChange={(e) => {
                  updateMaterialRow(key_id, row.id, "name")(e);
                  syncTextareaHeight(e.target);
                }}
                onInput={autoResizeNameField}
                aria-label="Название материала"
                rows={1}
              />
            );
            const nameCell = isKpNarrow ? (
              <div className="kp-page__service-name-cell">{nameTextarea}</div>
            ) : (
              <div className="kp-page__service-name-cell">
                {removeRowButton}
                {nameTextarea}
              </div>
            );
            const priceInput = (
              <input
                type="text"
                className="kp-page__services-input"
                value={row.price}
                placeholder={KP_DECIMAL_PLACEHOLDER}
                onChange={updateMaterialRow(key_id, row.id, "price")}
                aria-label={`Цена, ${row.name || "материал"}`}
              />
            );
            const quantityInput = (
              <input
                type="text"
                className="kp-page__services-input"
                value={row.quantity}
                placeholder={KP_DECIMAL_PLACEHOLDER}
                onChange={updateMaterialRow(key_id, row.id, "quantity")}
                aria-label={`Количество, ${row.name || "материал"}`}
              />
            );
            const unitInput = (
              <input
                type="text"
                className="kp-page__services-input"
                value={row.unit}
                onChange={updateMaterialRow(key_id, row.id, "unit")}
                aria-label={`Единица измерения, ${row.name || "материал"}`}
              />
            );
            const sumInput = (
              <input
                type="text"
                readOnly
                className="kp-page__services-input kp-page__services-input--computed"
                value={serviceRowSum(row.price, row.quantity)}
                aria-label={`Сумма, ${row.name || "материал"} (цена × количество)`}
              />
            );
            const detailFields = [
              { id: "name", label: "Название", children: nameCell },
              { id: "price", label: "Цена", children: priceInput },
              { id: "quantity", label: "Количество", children: quantityInput },
              { id: "unit", label: "Ед. изм.", children: unitInput },
              { id: "sum", label: "Сумма", children: sumInput },
            ];
            const rowCells = isKpNarrow ? (
              <>
                <td>
                  <div className="kp-page__service-name-cell kp-narrow-row-summary-cell">
                    {removeRowButton}
                    <span className="kp-narrow-row-summary-name">
                      {row.name?.trim() ? row.name : "—"}
                    </span>
                  </div>
                </td>
                <td />
                <td />
                <td />
                <td className="kp-narrow-row-summary-sum">
                  {serviceRowSum(row.price, row.quantity)}
                </td>
              </>
            ) : (
              <>
                <td>{nameCell}</td>
                <td>{priceInput}</td>
                <td>{quantityInput}</td>
                <td>{unitInput}</td>
                <td>{sumInput}</td>
              </>
            );
            if (isKpNarrow) {
              return (
                <KpNarrowExpandableRow
                  key={row.id}
                  rowKey={rowKey}
                  expandedKey={expandedKey}
                  onToggleRow={toggleRow}
                  narrow
                  colSpan={5}
                  detailFields={detailFields}
                >
                  {rowCells}
                </KpNarrowExpandableRow>
              );
            }
            return <tr key={row.id}>{rowCells}</tr>;
          })}
        </KpCollapsibleExtraTable>
      );
    },
    [
      materialRowsByKeyId,
      additionalMaterialsSectionOpenByKeyId,
      clearSelectedArticlesForConstruction,
      openPriceForConstruction,
      addMaterialRow,
      removeMaterialRow,
      updateMaterialRow,
      autoResizeNameField,
      isKpNarrow,
      expandedKey,
      toggleRow,
    ],
  );

  if (loadStatus === "loading" || authStatus === "loading") {
    return (
      <div className="kp-page">
        <main className="kp-page__main">
          <p className="kp-page__tables-empty">Загрузка оффера...</p>
        </main>
      </div>
    );
  }

  if (loadStatus === "forbidden" || (!isAuthed && loadStatus !== "idle")) {
    return (
      <div className="kp-page">
        <main className="kp-page__main">
          <p className="kp-page__tables-empty">
            Войдите, чтобы открыть этот оффер.
          </p>
        </main>
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div className="kp-page">
        <main className="kp-page__main">
          <p className="kp-page__tables-empty">{loadError}</p>
          {!isEditingDraft && (
            <button
              type="button"
              onClick={() => navigate("/kp/list")}
              className="add_design_button"
            >
              К списку КП
            </button>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="kp-page">
      <main className="kp-page__main">
        <h1 className="kp-page__title">Коммерческое предложение</h1>

        <section className="kp-page__contact" aria-label="Контактные данные">
          <div className="kp-page__field-row">
            <label className="kp-page__label" htmlFor="kp-date">
              Дата:
            </label>
            <div className="kp-page__date-with-code">
              {kpCode ? (
                <span className="kp-page__kp-code" aria-label={`Номер КП ${kpCode}`}>
                  {kpCode}
                </span>
              ) : null}
              <input
                id="kp-date"
                className="kp-page__input"
                type="date"
                value={dateInputValue}
                onChange={onFieldChange("date")}
              />
            </div>
          </div>
          <div className="kp-page__field-row">
            <label className="kp-page__label" htmlFor="kp-region">
              Регион:
            </label>
            <select
              id="kp-region"
              className="kp-page__input kp-page__select"
              value={
                isPriceRegionsLoading || visibleRegionOptions.length === 0
                  ? ""
                  : form.region
              }
              onChange={onRegionChange}
              aria-label="Регион прайса"
              disabled={isPriceRegionsLoading || visibleRegionOptions.length === 0}
            >
              {isPriceRegionsLoading ? (
                <option value="">Загрузка регионов...</option>
              ) : visibleRegionOptions.length === 0 ? (
                <option value="">Регионы не найдены</option>
              ) : (
                visibleRegionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="kp-page__field-row">
            <label className="kp-page__label" htmlFor="kp-object">
              Объект:
            </label>
            <textarea
              id="kp-object"
              className="kp-page__input"
              rows={1}
              value={form.object}
              onChange={onContactFieldChange("object")}
              onInput={autoResizeNameField}
            />
          </div>
          <div className="kp-page__field-row">
            <label className="kp-page__label" htmlFor="kp-manager">
              Менеджер:
            </label>
            <textarea
              id="kp-manager"
              className="kp-page__input"
              rows={1}
              autoComplete="name"
              value={form.manager}
              onChange={onContactFieldChange("manager")}
              onInput={autoResizeNameField}
            />
          </div>
          <div className="kp-page__field-row">
            <label className="kp-page__label" htmlFor="kp-phone">
              Телефон:
            </label>
            <textarea
              id="kp-phone"
              className="kp-page__input"
              rows={1}
              autoComplete="tel"
              inputMode="tel"
              placeholder="+7 (___) ___-__-__"
              value={form.phone}
              onChange={onContactFieldChange("phone")}
              onInput={autoResizeNameField}
            />
          </div>
          <div className="kp-page__field-row">
            <label className="kp-page__label" htmlFor="kp-email">
              Email:
            </label>
            <textarea
              id="kp-email"
              className="kp-page__input kp-page__input--email"
              rows={1}
              autoComplete="email"
              inputMode="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={onContactFieldChange("email")}
              onInput={autoResizeNameField}
            />
          </div>
          <div className="kp-page__field-row kp-page__field-row--last">
            <label className="kp-page__label" htmlFor="kp-address">
              Адрес офиса:
            </label>
            <textarea
              id="kp-address"
              className="kp-page__input"
              rows={1}
              autoComplete="street-address"
              value={form.officeAddress}
              onChange={onContactFieldChange("officeAddress")}
              onInput={autoResizeNameField}
            />
          </div>
        </section>

        <section className="kp-page__settings" aria-label="Настройки КП">
          <button
            type="button"
            className="kp-page__settings-toggle"
            aria-expanded={settingsSectionOpen}
            aria-controls="kp-settings-list"
            onClick={toggleSettingsSection}
          >
            <span className="kp-page__settings-title-row">
              <span className="kp-page__settings-title-inner">
                <span
                  className={`kp-collapsible-chevron${
                    settingsSectionOpen
                      ? " kp-collapsible-chevron--expanded"
                      : ""
                  }`}
                  aria-hidden
                />
                <span className="kp-page__settings-title">Настройки КП</span>
              </span>
            </span>
          </button>
          {settingsSectionOpen && (
            <ul id="kp-settings-list" className="kp-page__settings-list">
              {KP_SETTINGS_FIELDS.map((item) => (
                <li key={item.key} className="kp-page__settings-item">
                  <label
                    className="kp-page__settings-label"
                    htmlFor={`kp-setting-${item.key}`}
                  >
                    {item.label}
                  </label>
                  <input
                    id={`kp-setting-${item.key}`}
                    className="kp-page__settings-input"
                    type="number"
                    inputMode="numeric"
                    value={kpSettings[item.key]}
                    onChange={onKpSettingChange(item.key)}
                  />
                </li>
              ))}
              <li className="kp-page__settings-item">
                <span className="kp-page__settings-note">
                  * Добавить монтажные ставки можно здесь или в карточке конструкции.
                </span>
              </li>
            </ul>
            
          )}
        </section>

        <div
          className="tables-and-buttons-container kp-page__tables"
          aria-label="Данные расчёта из калькулятора"
        >
          {calcTables.tableConstrToCalc != null &&
          calcTables.ConstrToCalc.length > 0 ? (
            <>
              <ConstructionList
                constructions={calcTables.ConstrToCalc}
                constrToCalcToSent={constrToCalcToSentForTable}
                readOnly
                showHeadingDeleteButton
                onDelete={removeConstructionFromKp}
                materialsByConstruction={calcTables.materialsByConstruction}
                defaultCardsCollapsed
                cardCollapseOverrides={cardCollapseOverridesByKeyId}
                onToggleCardCollapsed={toggleCardCollapsed}
                renderKpMontageSlot={renderKpMontageSlot}
                renderKpAdditionalMaterialsSlot={renderKpAdditionalMaterialsSlot}
                additionalMaterialsRubByKeyId={additionalMaterialsRubByKeyId}
                montageByKeyId={montageByKeyId}
                showGrandTotalInline={false}
                onMaterialKpFieldChange={onMaterialKpFieldChange}
              />
            </>
          ) : (
            <p className="kp-page__tables-empty">
              В этом КП пока нет конструкций. Перейдите в{" "}
              <button
                type="button"
                className="kp-page__link-btn"
                onClick={openCalculatorForConstructions}
              >
                калькулятор
              </button>
              , чтобы добавить.
            </p>
          )}
        </div>

        <div className="kp-page__services">
          <KpCollapsibleExtraTable
            tableId="kp-table-services"
            ariaLabel="Дополнительные услуги"
            title="Дополнительные услуги"
            sectionOpen={servicesSectionOpen}
            onToggleSection={() => setServicesSectionOpen((v) => !v)}
            totalRub={servicesTotalRub}
            colgroup={
              <colgroup>
                <col style={{ width: "60%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
            }
            footerRows={
              <tr className="kp-page__services-add-row">
                <td colSpan={5} className="kp-page__services-add-cell">
                  <button
                    type="button"
                    className="kp-page__services-add"
                    onClick={addServiceRow}
                  >
                    Добавить строку
                  </button>
                </td>
              </tr>
            }
          >
            {serviceRows.map((row) => {
              const rowKey = `svc-${row.id}`;
              const removeRowButton = row.preset ? null : (
                <button
                  type="button"
                  className="kp-page__service-row-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeServiceRow(row.id);
                  }}
                  aria-label="Удалить строку"
                >
                  ×
                </button>
              );
              const nameTextarea = row.preset ? null : (
                <textarea
                  className="kp-page__services-input kp-page__services-textarea"
                  value={row.name}
                  onChange={(e) => {
                    updateServiceRow(row.id, "name")(e);
                    syncTextareaHeight(e.target);
                  }}
                  onInput={autoResizeNameField}
                  aria-label="Название услуги"
                  rows={1}
                />
              );
              const nameCell = row.preset ? (
                row.name
              ) : isKpNarrow ? (
                <div className="kp-page__service-name-cell">{nameTextarea}</div>
              ) : (
                <div className="kp-page__service-name-cell">
                  {removeRowButton}
                  {nameTextarea}
                </div>
              );
              const priceInput = (
                <input
                  id={row.preset ? `kp-service-${row.id}-price` : undefined}
                  type="text"
                  className="kp-page__services-input"
                  value={row.price}
                  placeholder={KP_DECIMAL_PLACEHOLDER}
                  onChange={updateServiceRow(row.id, "price")}
                  aria-label={`Цена, ${row.name || "услуга"}`}
                />
              );
              const quantityInput = (
                <input
                  id={
                    row.preset ? `kp-service-${row.id}-quantity` : undefined
                  }
                  type="text"
                  className="kp-page__services-input"
                  value={row.quantity}
                  placeholder={KP_DECIMAL_PLACEHOLDER}
                  onChange={updateServiceRow(row.id, "quantity")}
                  aria-label={`Количество, ${row.name || "услуга"}`}
                />
              );
              const unitInput = (
                <input
                  id={row.preset ? `kp-service-${row.id}-unit` : undefined}
                  type="text"
                  className="kp-page__services-input"
                  value={row.unit}
                  onChange={updateServiceRow(row.id, "unit")}
                  aria-label={`Единица измерения, ${row.name || "услуга"}`}
                />
              );
              const sumInput = (
                <input
                  id={`kp-service-${row.id}-sum`}
                  type="text"
                  readOnly
                  className="kp-page__services-input kp-page__services-input--computed"
                  value={serviceRowSum(row.price, row.quantity)}
                  aria-label={`Сумма, ${row.name || "услуга"} (цена × количество)`}
                />
              );
              const detailFields = [
                { id: "name", label: "Название", children: nameCell },
                { id: "price", label: "Цена", children: priceInput },
                { id: "quantity", label: "Количество", children: quantityInput },
                { id: "unit", label: "Ед. изм.", children: unitInput },
                { id: "sum", label: "Сумма", children: sumInput },
              ];
              const nameTdClass = row.preset
                ? "kp-page__service-name-td--preset"
                : undefined;
              const rowCells = isKpNarrow ? (
                <>
                  <td className={nameTdClass}>
                    {row.preset ? (
                      <span className="kp-narrow-row-summary-name">
                        {row.name?.trim() ? row.name : "—"}
                      </span>
                    ) : (
                      <div className="kp-page__service-name-cell kp-narrow-row-summary-cell">
                        {removeRowButton}
                        <span className="kp-narrow-row-summary-name">
                          {row.name?.trim() ? row.name : "—"}
                        </span>
                      </div>
                    )}
                  </td>
                  <td />
                  <td />
                  <td />
                  <td className="kp-narrow-row-summary-sum">
                    {serviceRowSum(row.price, row.quantity)}
                  </td>
                </>
              ) : (
                <>
                  <td className={nameTdClass}>{nameCell}</td>
                  <td>{priceInput}</td>
                  <td>{quantityInput}</td>
                  <td>{unitInput}</td>
                  <td>{sumInput}</td>
                </>
              );
              if (isKpNarrow) {
                return (
                  <KpNarrowExpandableRow
                    key={row.id}
                    rowKey={rowKey}
                    expandedKey={expandedKey}
                    onToggleRow={toggleRow}
                    narrow
                    colSpan={5}
                    detailTitle={row.name?.trim() ? row.name : undefined}
                    detailFields={detailFields}
                  >
                    {rowCells}
                  </KpNarrowExpandableRow>
                );
              }
              return <tr key={row.id}>{rowCells}</tr>;
            })}
          </KpCollapsibleExtraTable>
        </div>

        {calcTables.tableConstrToCalc != null &&
          calcTables.ConstrToCalc.length > 0 && (
            <ConstructionGrandTotalBlock
              readOnly
              grandTotalRub={computeGrandTotalRubForConstructions(
                calcTables.ConstrToCalc,
                calcTables.materialsByConstruction,
                { forKp: true },
              )}
              montageGrandTotalRub={montageGrandTotalRubForKp(
                calcTables.ConstrToCalc,
                montageByKeyId,
              )}
              additionalServicesGrandTotalRub={additionalServicesGrandTotalRubForKp(
                serviceRows,
              )}
              additionalMaterialsGrandTotalRub={additionalMaterialsTotalRub}
              materialsByConstruction={calcTables.materialsByConstruction}
              constructions={calcTables.ConstrToCalc}
              montageByKeyId={montageByKeyId}
              serviceRows={serviceRows}
              materialRowsByKeyId={materialRowsByKeyId}
              grandTotalDiscounts={grandTotalDiscounts}
              onGrandTotalDiscountChange={handleGrandTotalDiscountChange}
              onGrandTotalDiscountAmountsChange={
                handleGrandTotalDiscountAmountsChange
              }
              wrapClassName="kp-page__construction-grand-total"
            />
          )}

        <div className="kp-page__save-bar">
          {saveError && (
            <div className="kp-page__save-error" role="alert">
              {saveError}
            </div>
          )}
          <div className="kp-page__save-bar-actions">
            <button
              type="button"
              className="add_design_button kp-page__save-btn"
              onClick={handleSave}
              disabled={isSaving || loadStatus !== "loaded"}
            >
              {isSaving ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              type="button"
              className="add_design_button kp-page__save-btn kp-page__exit-btn"
              onClick={handleExit}
              disabled={loadStatus !== "loaded"}
            >
              Выйти
            </button>
            <button
              type="button"
              className="add_design_button kp-page__save-btn kp-page__pdf-btn"
              onClick={handleDownloadPdf}
              disabled={
                isDownloadingPdf || loadStatus !== "loaded" || isPdfExportBlocked
              }
              title={
                isPdfExportBlocked
                  ? "Сначала нажмите «Сохранить» — PDF формируется по сохранённым данным"
                  : undefined
              }
            >
              {isDownloadingPdf ? "Готовим PDF..." : "Скачать PDF"}
            </button>
          </div>
        </div>
      </main>
      <PdfPrintDialog
        open={isPdfDialogOpen}
        isDownloading={isDownloadingPdf}
        error={pdfDialogError}
        onClose={handleClosePdfDialog}
        onConfirm={handleConfirmPdfDownload}
      />
    </div>
  );
};

export default KpPage;
