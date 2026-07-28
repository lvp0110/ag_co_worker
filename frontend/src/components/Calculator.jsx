import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Modal from "./Modal";
import "./Calculator.css";
import SubCategories from "../data/subCategories";
import Items, { getItemsWithApiImages } from "../data/items.js";
import mainSections from "../data/mainSections";
import {
  constRZero,
  constSentZero,
  openingZero,
} from "../constants/defaultValues";
import { getImageUrl } from "../services/api";
import { getResponsiveImageProps } from "../utils/responsiveImages";
import {
  validateInput,
  validateFloorInput,
  validateFloorMaxInput,
  normalizeFacingProfileStep,
  normalizeLagProfileStep,
  isFacingTemplate,
} from "../utils/validation";
import {
  calculateAreaAndPerimeter,
  getConstructionCode,
  resolveDisplayCipher,
} from "../utils/calculations";
import {
  hasCeilingMatChoice,
  hasEcoSWoolChoice,
  hasFloorSealantChoice,
  hasGklaChoice,
  normalizeCeilingMats,
  stripHangerSuffix,
} from "../utils/calcUlTapeFallback";
import {
  getItemsAgIdKeyMap,
  itemsBaseTableName,
  resolveItemsDisplayMeta,
} from "../utils/itemsCatalog.js";
import {
  sectionIdFromCode,
  sectionIdFromSubCategory,
} from "../utils/constructionSection";
import { calculateConstruction } from "../services/constructionApi";
import { createOffer, getOffer } from "../services/offersApi";
import {
  buildCreateOfferPayload,
  mapOfferToCalculatorState,
} from "../utils/offerMapper";
import { useAuth } from "../context/AuthContext.jsx";
import { useCalcField, useCalculatorStore } from "../stores/calculatorStore.js";
import {
  useOfferEditSession,
  useOfferEditSessionStore,
} from "../stores/offerEditSessionStore.js";
import ItemsList from "./ItemsList";
import SelectedItemForms from "./SelectedItemForms";
import ConstructionList from "./tables/ConstructionList";

const Calculator = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isAuthed, openLoginModal } = useAuth();
  const {
    activeOfferId,
    isEditingDraft,
    kpSnapshot,
    startDraft,
    markNewDraftOffer,
    stashKpSnapshot,
    clearKpSnapshot,
  } = useOfferEditSession();

  const hydratedOfferIdRef = useRef(null);
  const initializedItemIdRef = useRef(null);

  // Persistent-поля: живут в zustand-сторе (sessionStorage), переживают
  // переходы по страницам в рамках сессии. См. stores/calculatorStore.js.
  const [currentGkla, setCurrentGkla] = useCalcField("currentGkla");
  const [currentWool, setCurrentWool] = useCalcField("currentWool");
  const [unvisible, setUnvisible] = useCalcField("unvisible");
  const [tableConstrToCalc, setTableConstrToCalc] = useCalcField("tableConstrToCalc");
  const [currentSubCategory, setCurrentSubCategory] = useCalcField("currentSubCategory");
  const [currentItems, setCurrentItems] = useCalcField("currentItems");
  const [openedSubCategories, setOpenedSubCategories] = useCalcField("openedSubCategories");
  const [template, setTemplate] = useCalcField("template");
  const [profileStep, setProfileStep] = useCalcField("profileStep");
  const [facingProfileStep, setFacingProfileStep] = useCalcField("facingProfileStep");
  const [dFrame, setDFrame] = useCalcField("dFrame");
  const [currentConstr, setCurrentConstr] = useCalcField("currentConstr");
  const [currentFloorSealant, setCurrentFloorSealant] =
    useCalcField("currentFloorSealant");
  const [currentCeilingMats, setCurrentCeilingMats] =
    useCalcField("currentCeilingMats");
  const [ConstrToCalcToSent, setConstrToCalcToSent] = useCalcField("ConstrToCalcToSent");
  const [ConstrToCalc, setConstrToCalc] = useCalcField("ConstrToCalc");
  const [materialsByConstruction, setMaterialsByConstruction] = useCalcField(
    "materialsByConstruction"
  );
  const [itemsWithImages, setItemsWithImages] = useState(Items); // Начальное значение - базовые items
  const [isSubmittingKp, setIsSubmittingKp] = useState(false);
  // Если юзер нажал «Сделать КП» будучи анонимом — запоминаем намерение и
  // продолжаем автоматически после успешного логина.
  const [pendingCreateKp, setPendingCreateKp] = useState(false);

  const [modal, setModal] = useState({
    isOpen: false,
    title: null,
    html: null,
    icon: null,
    imageUrl: null,
    confirmButtonText: "OK",
    confirmButtonColor: "#6cabc8",
  });

  useEffect(() => {
    const loadItemsWithImages = async () => {
      try {
        const enrichedItems = await getItemsWithApiImages();
        setItemsWithImages(enrichedItems);
      } catch {
        setItemsWithImages(Items);
      }
    };

    loadItemsWithImages();
  }, []);

  // Получить items для конкретной секции и подкатегории
  const getItemsForSection = useCallback(
    (subCategoryId) => {
      if (!subCategoryId) return [];
      return itemsWithImages.filter((el) => el.c_id == subCategoryId);
    },
    [itemsWithImages]
  );

  useEffect(() => {
    const sectionIcons = mainSections.map(section => getImageUrl(section.icon));
    
    if (sectionIcons.length > 0) {
      const img = new Image();
      img.fetchPriority = 'high';
      if (!import.meta.env.DEV) {
        img.crossOrigin = 'anonymous';
      }
      img.src = sectionIcons[0];
    }
    
    sectionIcons.slice(1).forEach((url) => {
      const img = new Image();
      if (!import.meta.env.DEV) {
        img.crossOrigin = 'anonymous';
      }
      img.src = url;
    });
  }, []);

  useEffect(() => {
    if (itemsWithImages.length === 0) return;
    
    const firstOpenedSection = mainSections.find(section => {
      const openedSubCategory = openedSubCategories[section.id];
      if (!openedSubCategory) return false;
      const sectionItems = getItemsForSection(openedSubCategory);
      return sectionItems.length > 0;
    });

    if (firstOpenedSection) {
      const openedSubCategory = openedSubCategories[firstOpenedSection.id];
      const sectionItems = getItemsForSection(openedSubCategory);
      
      if (sectionItems.length > 0) {
        const firstItem = sectionItems[0];
        const firstImageSrc = firstItem.Img || firstItem.img;
        
        if (firstImageSrc) {
          const firstImageUrl = getImageUrl(firstImageSrc);
          
          const existingLink = document.querySelector('link[rel="preload"][as="image"][data-lcp-candidate="true"]');
          if (existingLink) {
            existingLink.remove();
          }
          
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = firstImageUrl;
          link.setAttribute('fetchpriority', 'high');
          link.setAttribute('data-lcp-candidate', 'true');
          document.head.appendChild(link);
          
          const img = new Image();
          img.fetchPriority = 'high';
          img.src = firstImageUrl;
        }
      }
    }
  }, [openedSubCategories, itemsWithImages, getItemsForSection]);

  // После «В калькулятор» снимок КП обновляется — перегидратируем калькулятор.
  useEffect(() => {
    if (!isEditingDraft) return;
    hydratedOfferIdRef.current = null;
  }, [kpSnapshot, activeOfferId, isEditingDraft]);

  // При редактировании КП подтягиваем конструкции из снимка КП или с сервера.
  useEffect(() => {
    if (!isEditingDraft || !activeOfferId) {
      hydratedOfferIdRef.current = null;
      return undefined;
    }
    if (hydratedOfferIdRef.current === activeOfferId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const snap = kpSnapshot;
        if (
          snap?.calcTables?.ConstrToCalc?.length > 0 &&
          snap?.constrToCalcToSent?.length > 0
        ) {
          if (cancelled) return;
          const { ConstrToCalc, materialsByConstruction } = snap.calcTables;
          setConstrToCalc(ConstrToCalc);
          setConstrToCalcToSent(snap.constrToCalcToSent);
          setMaterialsByConstruction(materialsByConstruction ?? []);
          setTableConstrToCalc(ConstrToCalc.length > 0 ? {} : null);
          hydratedOfferIdRef.current = activeOfferId;
          return;
        }

        // Пустой состав из снимка КП («В калькулятор») — без ожидания GET.
        // Иначе поздний пустой ответ getOffer затирает результат расчёта.
        if (snap?.calcTables) {
          const cc = snap.calcTables.ConstrToCalc ?? [];
          const sent = snap.constrToCalcToSent;
          const sentLen = Array.isArray(sent) ? sent.length : 0;
          if (cc.length === 0 && sentLen === 0) {
            if (cancelled) return;
            setConstrToCalc([]);
            setConstrToCalcToSent([]);
            setMaterialsByConstruction([]);
            setTableConstrToCalc(null);
            hydratedOfferIdRef.current = activeOfferId;
            return;
          }
        }

        const offer = await getOffer(activeOfferId);
        if (cancelled) return;

        const state = mapOfferToCalculatorState(offer);
        const storeNow = useCalculatorStore.getState();
        const incomingEmpty = !state.constrToCalcToSent?.length;
        if (incomingEmpty && storeNow.ConstrToCalcToSent.length > 0) {
          hydratedOfferIdRef.current = activeOfferId;
          return;
        }

        setConstrToCalc(state.constrToCalc);
        setConstrToCalcToSent(state.constrToCalcToSent);
        setMaterialsByConstruction(state.materialsByConstruction);
        setTableConstrToCalc(
          state.constrToCalc?.length > 0
            ? (state.tableConstrToCalc ?? {})
            : null,
        );
        hydratedOfferIdRef.current = activeOfferId;
      } catch {
        // пустой калькулятор — пользователь может добавить конструкции вручную
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isEditingDraft,
    activeOfferId,
    kpSnapshot,
    setConstrToCalc,
    setConstrToCalcToSent,
    setMaterialsByConstruction,
    setTableConstrToCalc,
  ]);

  const [constR, setConstR] = useState({
    title: "",
    type: "",
    lenX: null,
    lenY: null,
    lenZ: null,
    description: "",
    step: null,
    ag_id: "",
    key_id: null,
    AddCeilShift: 0,
  });

  const [constrSent, setConstrSent] = useState({
    Code: "",
    LenX: 0,
    LenY: 0,
    LenZ: 0,
    dframe: false,
    Area: 0,
    Perimeter: 0,
    step: 0,
    AddCeilShift: 0,
    Openings: [],
  });

  const [opening, setOpening] = useState({
    lenX: null,
    lenZ: null,
    Type: "OST_Doors",
  });

  const getSubCategoriesForSection = useCallback((sectionId) => {
    if (sectionId === "F") {
      return SubCategories.filter((el) => el.id === "F");
    } else if (sectionId === "C") {
      return SubCategories.filter((el) => el.id === "C");
    } else if (sectionId === "L") {
      return SubCategories.filter((el) => el.id === "L");
    } else if (sectionId === "W") {
      return SubCategories.filter((el) => el.id === "W");
    }
    return [];
  }, []);

  const handleSectionClick = useCallback((sectionId, subCategories) => {
    setOpenedSubCategories((prev) => {
      const currentOpened = prev[sectionId];

      if (currentOpened) {
        return { F: null, C: null, L: null, W: null, [sectionId]: null };
      }

      if (subCategories && subCategories.length > 0) {
        const firstSubCategory = subCategories[0];
        setCurrentSubCategory(firstSubCategory.id);
        return {
          F: null,
          C: null,
          L: null,
          W: null,
          [sectionId]: firstSubCategory.id,
        };
      }

      return prev;
    });
  }, []);

  const handleItemSelect = useCallback(
    (item) => {
      if (currentItems === item.id) {
        setCurrentItems(0);
        setTemplate(null);
        setCurrentConstr("");
        setCurrentFloorSealant("vibrosil");
        setCurrentCeilingMats([]);
      } else {
        setCurrentItems(item.id);
        setTemplate(item.template);
        setTableConstrToCalc(1);
        setCurrentConstr(item.ag_id);
        setCurrentFloorSealant("vibrosil");
        setCurrentCeilingMats([]);
        if (!hasGklaChoice(item.ag_id)) {
          setCurrentGkla("default");
        }
        if (!hasEcoSWoolChoice(item.ag_id)) {
          setCurrentWool("default");
        }
        if (isFacingTemplate(item.template)) {
          setFacingProfileStep(600);
        }
        if (item.c_id) {
          setCurrentSubCategory(item.c_id);
        }
      }
    },
    [
      currentItems,
      setCurrentWool,
      setFacingProfileStep,
      setCurrentGkla,
      setCurrentCeilingMats,
    ]
  );

  useEffect(() => {
    if (currentItems != 0) {
      const selectedItem = itemsWithImages.find((el) => el.id == currentItems);
      if (selectedItem) {
        setTemplate(selectedItem.template);
        setTableConstrToCalc(1);
        // Инициализируем шифр только при фактической смене выбранной конструкции.
        // Иначе обновление itemsWithImages может затирать выбранный suffix-вариант.
        if (initializedItemIdRef.current !== currentItems) {
          setCurrentConstr(selectedItem.ag_id);
          setCurrentCeilingMats([]);
          initializedItemIdRef.current = currentItems;
        }
      }
    } else {
      setTemplate(null);
      setCurrentConstr("");
      setCurrentFloorSealant("vibrosil");
      setCurrentCeilingMats([]);
      initializedItemIdRef.current = null;
    }
  }, [
    currentItems,
    itemsWithImages,
    setCurrentConstr,
    setCurrentFloorSealant,
    setCurrentCeilingMats,
    setTableConstrToCalc,
    setTemplate,
  ]);

  useEffect(() => {
    if (currentItems != 0) {
      requestAnimationFrame(() => {
        const container = document.querySelector(".selected-item-container");
        if (container) {
          container.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });
    }
  }, [currentItems]);

  const delFromOpenings = (index) => {
    const newOpenings = [...constrSent.Openings];
    newOpenings.splice(index, 1);
    setConstrSent({ ...constrSent, Openings: newOpenings });
  };

  const addOpening = () => {
    setConstrSent({
      ...constrSent,
      Openings: [...constrSent.Openings, { ...opening }],
    });
    setOpening({ ...openingZero });
  };

  const delConstrFromList = useCallback(
    (idConstr) => {
      const indexToDel = ConstrToCalc.findIndex((el) => el.key_id == idConstr);
      if (indexToDel < 0) return;
      const newConstrToCalc = [...ConstrToCalc];
      const newConstrToCalcToSent = [...ConstrToCalcToSent];
      newConstrToCalc.splice(indexToDel, 1);
      newConstrToCalcToSent.splice(indexToDel, 1);
      const newMaterials = materialsByConstruction.filter(
        (_, i) => i !== indexToDel,
      );

      setConstrToCalc(newConstrToCalc);
      setConstrToCalcToSent(newConstrToCalcToSent);
      setMaterialsByConstruction(newMaterials);

      if (newConstrToCalc.length === 0) {
        setTableConstrToCalc(null);
      }

      if (isEditingDraft && activeOfferId) {
        const sess = useOfferEditSessionStore.getState();
        if (sess.activeOfferId !== activeOfferId) return;
        const prevSnap = sess.kpSnapshot || {};
        const nextCalcTables = {
          tableConstrToCalc:
            newConstrToCalc.length > 0 ? (tableConstrToCalc ?? {}) : null,
          ConstrToCalc: newConstrToCalc,
          materialsByConstruction: newMaterials,
        };
        const patch = {
          ...prevSnap,
          calcTables: nextCalcTables,
          constrToCalcToSent: newConstrToCalcToSent,
        };
        if (prevSnap.montageByKeyId) {
          const m = { ...prevSnap.montageByKeyId };
          delete m[idConstr];
          patch.montageByKeyId = m;
        }
        if (prevSnap.manualMontagePriceByKeyId) {
          const m = { ...prevSnap.manualMontagePriceByKeyId };
          delete m[idConstr];
          patch.manualMontagePriceByKeyId = m;
        }
        sess.stashKpSnapshot(patch);
      }
    },
    [
      activeOfferId,
      ConstrToCalc,
      ConstrToCalcToSent,
      isEditingDraft,
      materialsByConstruction,
      setConstrToCalc,
      setConstrToCalcToSent,
      setMaterialsByConstruction,
      setTableConstrToCalc,
      tableConstrToCalc,
    ],
  );

  /**
   * Сам запрос POST /api/offers и редирект на /kp/:id.
   * Вынесен отдельно, чтобы одинаково вызываться и из handleMakeKP, и из
   * useEffect'а «продолжение после логина».
   */
  const submitKp = useCallback(async () => {
    if (ConstrToCalcToSent.length === 0) return;
    setIsSubmittingKp(true);
    try {
      const payload = buildCreateOfferPayload({
        constrToCalcToSent: ConstrToCalcToSent,
        constrToCalc: ConstrToCalc,
      });
      const offer = await createOffer(payload);
      startDraft(offer.id);
      markNewDraftOffer(offer.id);
      navigate("/kp/list", { state: { autoOpenOfferId: offer.id } });
    } catch (err) {
      setModal({
        isOpen: true,
        title: "Ошибка",
        html: `Не удалось создать КП.<br><br>${err?.message || ""}`,
        icon: "error",
        imageUrl: null,
        confirmButtonText: "OK",
        confirmButtonColor: "#6cabc8",
      });
    } finally {
      setIsSubmittingKp(false);
    }
  }, [ConstrToCalcToSent, ConstrToCalc, navigate, startDraft, markNewDraftOffer]);

  /**
   * «Сделать КП»: либо сразу создаёт оффер (если авторизован), либо открывает
   * LoginModal и ставит флаг pendingCreateKp — после успешного логина useEffect
   * ниже автоматически доведёт до конца (POST + переход на /kp/:id).
   */
  const handleMakeKP = async () => {
    if (ConstrToCalcToSent.length === 0) {
      setModal({
        isOpen: true,
        title: null,
        html: "Сначала добавьте хотя бы одну конструкцию в калькулятор.",
        icon: "warning",
        imageUrl: null,
        confirmButtonText: "OK",
        confirmButtonColor: "#6cabc8",
      });
      return;
    }
    if (!isAuthed) {
      setPendingCreateKp(true);
      openLoginModal();
      return;
    }
    await submitKp();
  };

  // Продолжение после логина: когда статус стал authed и флаг pendingCreateKp
  // взведён — создаём оффер и уходим на /kp/:id.
  useEffect(() => {
    if (!pendingCreateKp) return;
    if (!isAuthed) return;
    setPendingCreateKp(false);
    submitKp();
  }, [pendingCreateKp, isAuthed, submitKp]);

  const handleReturnToKp = useCallback(async () => {
    if (!activeOfferId || ConstrToCalcToSent.length === 0) {
      navigate(`/kp/${activeOfferId}`);
      return;
    }
    setIsSubmittingKp(true);
    try {
      const tablesForSnapshot =
        ConstrToCalc.length > 0
          ? {
              tableConstrToCalc: tableConstrToCalc ?? {},
              ConstrToCalc,
              materialsByConstruction,
            }
          : {
              tableConstrToCalc: null,
              ConstrToCalc,
              materialsByConstruction,
            };
      stashKpSnapshot({
        ...(kpSnapshot ?? {}),
        calcTables: tablesForSnapshot,
        constrToCalcToSent: ConstrToCalcToSent,
      });
      hydratedOfferIdRef.current = null;
      navigate(`/kp/${activeOfferId}`);
    } catch (err) {
      setModal({
        isOpen: true,
        title: "Ошибка",
        html: `Не удалось вернуть изменения в черновик КП.<br><br>${err?.message || ""}`,
        icon: "error",
        imageUrl: null,
        confirmButtonText: "OK",
        confirmButtonColor: "#6cabc8",
      });
    } finally {
      setIsSubmittingKp(false);
    }
  }, [
    activeOfferId,
    ConstrToCalc,
    ConstrToCalcToSent,
    materialsByConstruction,
    tableConstrToCalc,
    kpSnapshot,
    navigate,
    stashKpSnapshot,
  ]);

  const showMakeKpButton =
    !isEditingDraft && ConstrToCalcToSent.length > 0;
  const showReturnToKpButton = isAuthed && isEditingDraft;

  const addConstrToCalc = useCallback(async () => {
    let calcProfileStep = Number(profileStep) || 600;
    if (template === 3) {
      calcProfileStep = normalizeLagProfileStep(profileStep);
    } else if (
      isFacingTemplate(template) ||
      currentSubCategory === "W" ||
      currentSubCategory === "L"
    ) {
      calcProfileStep = normalizeFacingProfileStep(facingProfileStep);
    }

    const inputError = validateInput(
      constR,
      currentSubCategory,
      currentItems,
      template,
      calcProfileStep,
      itemsWithImages
    );

    if (inputError) {
      setModal({
        isOpen: true,
        title: null,
        html: inputError,
        icon: null,
        imageUrl: `${import.meta.env.BASE_URL}logo1.png`,
        confirmButtonText: "OK",
        confirmButtonColor: "#6cabc8",
      });
      return;
    }

    const floorError = validateFloorInput(constR, currentSubCategory, template);
    if (floorError) {
      setModal({
        isOpen: true,
        title: null,
        html: floorError,
        icon: null,
        imageUrl: `${import.meta.env.BASE_URL}logo1.png`,
        confirmButtonText: "Ok",
        confirmButtonColor: "#6cabc8",
      });
      return;
    }

    const floorMaxError = validateFloorMaxInput(constR, currentSubCategory, template);
    if (floorMaxError) {
      setModal({
        isOpen: true,
        title: null,
        html: floorMaxError,
        icon: null,
        imageUrl: `${import.meta.env.BASE_URL}logo1.png`,
        confirmButtonText: "Принять",
        confirmButtonColor: "#6cabc8",
      });
      return;
    }

    const IconType = SubCategories.find((el) => el.id == currentSubCategory);
    const Constr = itemsWithImages.find((el) => el.id == currentItems);
    const code = getConstructionCode(currentConstr, currentGkla, currentWool);
    const sectionId =
      sectionIdFromSubCategory(currentSubCategory) || sectionIdFromCode(code);
    const agId = resolveDisplayCipher(code, getItemsAgIdKeyMap());

    const { title: shortTitle, description: displayDescription } =
      resolveItemsDisplayMeta({
        calcCode: code,
        cipher: agId,
        sectionId,
        catalogId: Constr?.id,
      });

    const displayTitle = itemsBaseTableName({
      title: shortTitle,
      description: displayDescription,
    });

    const newConstR = {
      ...constR,
      imgBlack: IconType?.imgBlack ? getImageUrl(IconType.imgBlack) : undefined,
      description: displayDescription,
      key_id: Date.now(),
      title: displayTitle,
      short_title: shortTitle,
      catalog_id: Constr?.id,
      type: IconType?.title,
      section_id: sectionId,
      // Для UI показываем базовый шифр без суффиксов (AG.F...),
      // а полный код остаётся в newConstrSent.Code для расчёта/API.
      ag_id: agId,
      step: Constr?.step,
      weight: Constr?.weight,
    };

    const lenX = +constR.lenX || 0;
    const lenY = +constR.lenY || 0;
    const lenZ = +constR.lenZ || 0;
    const { area, perimeter } = calculateAreaAndPerimeter(
      lenX,
      lenY,
      lenZ,
      currentSubCategory
    );

    const openingsWithNumbers = constrSent.Openings.map((opening) => ({
      ...opening,
      lenX: +opening.lenX || 0,
      lenZ: +opening.lenZ || 0,
    }));

    const newConstrSent = {
      Code: code,
      LenX: lenX,
      LenY: lenY,
      LenZ: lenZ,
      AddCeilShift: +constR.AddCeilShift || 0,
      step: calcProfileStep,
      dframe: dFrame,
      Area: area,
      Perimeter: perimeter,
      Openings: openingsWithNumbers,
      SectionId: sectionId,
      SectionType: IconType?.title ?? "",
      ...(displayTitle ? { DisplayTitle: displayTitle } : {}),
      ...(displayDescription ? { DisplayDescription: displayDescription } : {}),
    };

    if (code == "AG.L401" || code == "AG.W101" || code == "AG.W105") {
      newConstrSent.dframe = true;
    }
    if (
      (code == "AG.F615" || code == "AG.F615_vibroflex_LD") &&
      calcProfileStep === 600
    ) {
      newConstrSent.step = 400;
    }
    const sendSealantChoice =
      hasFloorSealantChoice({ code }) ||
      [607.1, 608.1, 609.1, 610.1, 2.1].includes(template) ||
      isFacingTemplate(template) ||
      template === 4 ||
      template === 5;
    if (sendSealantChoice) {
      newConstrSent.FloorSealant = currentFloorSealant;
    }
    const ceilingMats = normalizeCeilingMats(currentCeilingMats);
    if (
      hasCeilingMatChoice(Constr?.ag_id || agId) &&
      ceilingMats.length > 0
    ) {
      newConstrSent.CeilingMats = ceilingMats;
    }

    const deep = JSON.parse(JSON.stringify(newConstrSent));

    try {
      const result = await calculateConstruction([deep]);
      const data = result?.data ?? [];

      if (data.length === 0) {
        throw new Error(
          "Расчёт не вернул материалы для выбранного варианта конструкции."
        );
      }

      setConstrToCalcToSent((prev) => [...prev, deep]);
      setConstrToCalc((prev) => [...prev, newConstR]);
      setMaterialsByConstruction((prev) => [
        ...prev,
        { key_id: newConstR.key_id, data },
      ]);
      // После удаления всех конструкций флаг может быть null.
      // Поднимаем его при успешном расчёте, чтобы таблица отрисовалась сразу.
      setTableConstrToCalc((prev) => prev ?? {});
      setConstrSent({ ...constSentZero });
      setOpening({ ...openingZero });
      setConstR({ ...constRZero });
      setDFrame(false);
      setUnvisible(false);
      setFacingProfileStep(600);
      setCurrentGkla("default");
      setCurrentWool("default");
      setCurrentFloorSealant("vibrosil");
      setCurrentCeilingMats([]);
    } catch (error) {
      let errorMessage = error.message;
      if (error.message.includes("invalid construction size")) {
        errorMessage =
          "Неверный размер конструкции. Пожалуйста, проверьте введенные размеры. Для ЗИПС потолка минимальный размер составляет 200 мм.";
      } else if (error.message.includes("404")) {
        errorMessage =
          "Сервер API недоступен. Проверьте подключение к интернету или обратитесь к администратору.";
      }

      setModal({
        isOpen: true,
        title: "Ошибка",
        html: `Не удалось рассчитать материалы.<br><br>${errorMessage}<br><br>Проверьте консоль для деталей.`,
        icon: "error",
        imageUrl: null,
        confirmButtonText: "OK",
        confirmButtonColor: "#6cabc8",
      });
    }
  }, [
    constR,
    currentConstr,
    currentSubCategory,
    currentItems,
    itemsWithImages,
    profileStep,
    facingProfileStep,
    dFrame,
    constrSent,
    currentGkla,
    currentWool,
    currentFloorSealant,
    currentCeilingMats,
    template,
  ]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Enter" || event.keyCode === 13) {
        if (template != null) {
          if (!modal.isOpen) {
            const activeElement = document.activeElement;
            const isInputField =
              activeElement &&
              (activeElement.tagName === "INPUT" ||
                activeElement.tagName === "TEXTAREA");

            if (!isInputField || activeElement.tagName === "INPUT") {
              event.preventDefault();
              addConstrToCalc();
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [template, modal.isOpen, addConstrToCalc]);

  useEffect(() => {
    if (id != null && itemsWithImages.length > 0) {
      const routeCode = String(id).trim();
      const { base: routeBaseId } = stripHangerSuffix(routeCode);
      const item = itemsWithImages.find(
        (entry) => entry.ag_id === routeCode || entry.ag_id === routeBaseId
      );
      if (item) {
        const subCategory = SubCategories.find(
          (subCategory) => subCategory.id === item.c_id
        );
        if (subCategory) {
          setCurrentItems(item.id);
          setCurrentSubCategory(subCategory.id);

          const sectionId =
            item.c_id === "F"
              ? "F"
              : item.c_id === "C" || item.c_id === 6
              ? "C"
              : item.c_id === "L" || item.c_id === 5
              ? "L"
              : item.c_id === "W"
              ? "W"
              : null;

          if (sectionId) {
            setOpenedSubCategories({
              F: null,
              C: null,
              L: null,
              W: null,
              [sectionId]: subCategory.id,
            });
          }
        }
      }
    }
  }, [id, itemsWithImages]);

  return (
    <div className="calculator-page">
      <div className="content-calc">
        <div className="main-content">
          {mainSections.map((section) => {
            const subCategories = getSubCategoriesForSection(section.id);
            const openedSubCategory = openedSubCategories[section.id];
            const items = openedSubCategory
              ? getItemsForSection(openedSubCategory)
              : [];

            return (
              <div
                key={section.id}
                className="section-container"
                onClick={() => handleSectionClick(section.id, subCategories)}
                style={{ cursor: "pointer" }}
              >
                <div className="section-header">
                  <h2 className="section-title">
                    <img
                      {...getResponsiveImageProps(section.icon, 'section')}
                      alt=""
                      className="section-icon"
                      loading="eager"
                      decoding="async"
                      fetchPriority={section.id === "F" ? "high" : "auto"}
                      width="80"
                      height="80"
                      crossOrigin={import.meta.env.DEV ? undefined : "anonymous"}
                      onError={(e) => {
                        if (!e.target.dataset.fallbackTried) {
                          e.target.dataset.fallbackTried = 'true';
                          const fallbackUrl = getImageUrl(section.icon);
                          const img = new Image();
                          img.onload = () => {
                            e.target.src = fallbackUrl;
                          };
                          img.onerror = () => {
                            e.target.style.display = 'none';
                          };
                          img.src = fallbackUrl;
                        } else {
                          e.target.style.display = 'none';
                        }
                      }}
                    />
                    {section.title}
                  </h2>
                </div>

                {openedSubCategory && (
                  <div
                    className="items content-item"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {items.length > 0 ? (
                      items.map((elem, index) => {
                        const imageSrc = elem.Img || elem.img;
                        const imageProps = imageSrc
                          ? getResponsiveImageProps(imageSrc, 'item')
                          : null;

                        const isSelected = currentItems == elem.id;
                        const buttonClassName = [
                          "const_page",
                          isSelected ? "const_page--selected" : null,
                        ]
                          .filter(Boolean)
                          .join(" ");

                        const isAboveTheFold = index < 4;
                        const isLCPCandidate = index === 0;
                        const loadingStrategy = isAboveTheFold ? "eager" : "lazy";
                        const fetchPriority = isLCPCandidate ? "high" : isAboveTheFold ? "auto" : undefined;
                        const decodingStrategy = isLCPCandidate ? "sync" : "async";

                        return (
                          <div
                            key={`${elem.id}-${elem.c_id}`}
                            className="const-item-container"
                          >
                            <button
                              value={elem.id}
                              className={buttonClassName}
                              onClick={() => handleItemSelect(elem)}
                            >
                              <p>{elem.title}</p>
                              {imageProps && imageProps.src && (
                                <img 
                                  {...imageProps}
                                  alt="" 
                                  className="img-icon"
                                  loading={loadingStrategy}
                                  decoding={decodingStrategy}
                                  fetchPriority={fetchPriority}
                                  width="200"
                                  height="200"
                                  onError={(e) => {
                                    if (
                                      imageSrc &&
                                      imageSrc.includes("zips_ceiling/") &&
                                      !e.target.dataset.retried
                                    ) {
                                      const fileName = imageSrc.split("zips_ceiling/").pop();
                                      if (fileName) {
                                        e.target.dataset.retried = "true";
                                        const fallbackProps = getResponsiveImageProps(fileName, 'item');
                                        e.target.src = fallbackProps.src;
                                        if (fallbackProps.srcSet) e.target.srcSet = fallbackProps.srcSet;
                                        if (fallbackProps.sizes) e.target.sizes = fallbackProps.sizes;
                                        return;
                                      }
                                    }
                                    if (imageSrc) {
                                      const fallbackUrl = getImageUrl(imageSrc);
                                      const img = new Image();
                                      img.onload = () => {
                                        e.target.src = fallbackUrl;
                                      };
                                      img.onerror = () => {
                                        e.target.style.display = 'none';
                                      };
                                      img.src = fallbackUrl;
                                    } else {
                                      e.target.style.display = 'none';
                                    }
                                  }}
                                />
                              )}
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div
                        style={{
                          padding: "20px",
                          textAlign: "center",
                          color: "#878181",
                        }}
                      >
                        Нет элементов в этой подкатегории
                      </div>
                    )}
                  </div>
                )}

                {currentItems != 0 &&
                  (() => {
                    const selectedItem = items.find(
                      (el) => el.id == currentItems
                    );
                    if (
                      !selectedItem ||
                      selectedItem.c_id !== openedSubCategory
                    )
                      return null;

                    return (
                      <div
                        className="selected-item-container"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="selected-item-panel">
                          <SelectedItemForms
                            selectedItem={selectedItem}
                            constR={constR}
                            setConstR={setConstR}
                            currentSubCategory={currentSubCategory}
                            currentConstr={currentConstr}
                            setCurrentConstr={setCurrentConstr}
                            currentFloorSealant={currentFloorSealant}
                            setCurrentFloorSealant={setCurrentFloorSealant}
                            currentCeilingMats={currentCeilingMats}
                            setCurrentCeilingMats={setCurrentCeilingMats}
                            unvisible={unvisible}
                            setUnvisible={setUnvisible}
                            currentGkla={currentGkla}
                            setCurrentGkla={setCurrentGkla}
                            currentWool={currentWool}
                            setCurrentWool={setCurrentWool}
                            profileStep={profileStep}
                            setProfileStep={setProfileStep}
                            facingProfileStep={facingProfileStep}
                            setFacingProfileStep={setFacingProfileStep}
                            dFrame={dFrame}
                            setDFrame={setDFrame}
                            opening={opening}
                            setOpening={setOpening}
                            constrSent={constrSent}
                            onAddOpening={addOpening}
                            onDeleteOpening={delFromOpenings}
                          />

                          {selectedItem.template != null && (
                            <div className="selected-item-calc-action">
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={addConstrToCalc}
                                className="counter__button_plus counter__button_plus--shadow"
                              >
                                расчет конструкции
                              </button>
                            </div>
                          )}

                          <div className="tables-and-buttons-container">
                            {template != null && (
                              <div className="tables-and-buttons-header">
                                <h3 className="tables-and-buttons-title">
                                  Список конструкций
                                </h3>
                              </div>
                            )}
                            {tableConstrToCalc != null &&
                              ConstrToCalc.length > 0 && (
                                <ConstructionList
                                  constructions={ConstrToCalc}
                                  constrToCalcToSent={ConstrToCalcToSent}
                                  onDelete={delConstrFromList}
                                  materialsByConstruction={
                                    materialsByConstruction
                                  }
                                  legacyTableWithMaterials
                                />
                              )}
                            {(showReturnToKpButton ||
                              (template != null && showMakeKpButton)) && (
                              <div className="tables-and-buttons-footer">
                                {showReturnToKpButton ? (
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={handleReturnToKp}
                                    className="counter__button_plus counter__button_plus--shadow"
                                    disabled={isSubmittingKp}
                                  >
                                    {isSubmittingKp
                                      ? "Обновление КП..."
                                      : "Вернуться в КП"}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={handleMakeKP}
                                    className="counter__button_plus"
                                    disabled={isSubmittingKp}
                                  >
                                    {isSubmittingKp
                                      ? "Создание КП..."
                                      : "Сделать КП"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            );
          })}
        </div>
      </div>
      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        html={modal.html}
        icon={modal.icon}
        imageUrl={modal.imageUrl}
        confirmButtonText={modal.confirmButtonText}
        confirmButtonColor={modal.confirmButtonColor}
      />
    </div>
  );
};

export default Calculator;
