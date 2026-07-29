import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import PdfPrintDialog from "./PdfPrintDialog.jsx";
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

const KP_AUTO_RESIZE_TEXTAREA_SELECTOR =
  ".kp-page__services-textarea, .kp-page__contact textarea.kp-page__input";

function syncTextareaHeight(field) {
  if (!field || field.nodeName !== "TEXTAREA") return;
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

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
    clearKpSnapshot,
    markDraftSaved,
    markDraftDirty,
    clearSession,
    isOfferPdfExportBlocked,
    isNewDraftOffer,
    clearNewDraftOfferFlag,
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
  const [manualMontagePriceByKeyId, setManualMontagePriceByKeyId] = useState(
    () => ({}),
  );
  const visibleRegionOptions = useMemo(
    () => filterVisibleRegionOptions(regions),
    [regions]
  );
  const isPriceRegionsLoading = priceLoading || (!priceLoaded && !priceError);
  const dateInputValue = useMemo(
    () => normalizeDateForDateInput(form.date),
    [form.date],
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
  ]);

  useEffect(() => {
    ignoreDirtyTrackingRef.current = true;
    dirtyBaselinePayloadRef.current = null;
    shouldResetDirtyBaselineRef.current = true;
    didApplyDraftSnapshotRef.current = false;
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
    loadStatus,
    form.object,
    form.manager,
    form.phone,
    form.email,
    form.officeAddress,
  ]);

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
                <span className="kp-page__kp-code" title={kpCode} aria-label={`Номер КП ${kpCode}`}>
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
