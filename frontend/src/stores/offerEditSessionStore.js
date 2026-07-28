import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useCalculatorStore } from "./calculatorStore.js";

/**
 * Сессия редактирования черновика КП (только для авторизованных).
 * isDraft + activeOfferId — активное редактирование КП (страница /kp/:id, /calc, /price).
 * После «Выйти» в список isDraft=false, kpSnapshot сохраняется для повторного открытия.
 * hasUnsavedChanges — несохранённые правки (бейдж в шапке, блок PDF).
 * Уход в список: кнопка «Выйти» (requestExitToList). «Сохранить» остаётся на КП.
 * Разрешена навигация на /calc и /price для добавления позиций.
 */
const initialState = {
  activeOfferId: null,
  isDraft: false,
  hasUnsavedChanges: false,
  /** Снимок KpPage при уходе в калькулятор/прайс/список без сохранения. */
  kpSnapshot: null,
  /** Снимки по офферам: { [offerId]: kpSnapshot } */
  kpSnapshotsByOfferId: {},
  /**
   * Артикулы, выбранные в прайсе, разбитые по key_id конструкции.
   * Структура: { [key_id]: string[] }
   * Для обратной совместимости с PricePage используем вычисляемое плоское поле.
   */
  selectedPriceArticlesByKeyId: {},
  /** key_id конструкции, для которой сейчас выбирают материалы в прайсе. */
  activeConstructionId: null,
  /** Одноразовый пропуск OfferDraftGuard для /kp/list (кнопка «Выйти»). */
  allowExitToList: false,
  /** Новые КП, созданные и ещё не подтвержденные сохранением. */
  newDraftOfferIds: {},
};

export const useOfferEditSessionStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      startDraft: (offerId) =>
        set((state) => {
          if (state.isDraft && state.activeOfferId === offerId) {
            return state;
          }
          const prevId = state.activeOfferId;
          const sameOffer =
            prevId != null && String(prevId) === String(offerId);
          if (prevId != null && !sameOffer) {
            useCalculatorStore.getState().reset();
          }
          const snapshotForOffer = sameOffer
            ? state.kpSnapshot
            : state.kpSnapshotsByOfferId[String(offerId)] ?? null;
          return {
            activeOfferId: offerId,
            isDraft: true,
            hasUnsavedChanges: sameOffer
              ? state.hasUnsavedChanges
              : Boolean(snapshotForOffer),
            kpSnapshot: snapshotForOffer,
            selectedPriceArticlesByKeyId: sameOffer
              ? state.selectedPriceArticlesByKeyId
              : {},
            activeConstructionId: sameOffer ? state.activeConstructionId : null,
          };
        }),

      clearKpSnapshot: () =>
        set((state) => {
          const activeKey = state.activeOfferId != null ? String(state.activeOfferId) : null;
          if (!activeKey) return { kpSnapshot: null };
          const nextMap = { ...state.kpSnapshotsByOfferId };
          delete nextMap[activeKey];
          return { kpSnapshot: null, kpSnapshotsByOfferId: nextMap };
        }),

      stashKpSnapshot: (snapshot) =>
        set((state) => ({
          ...state,
          kpSnapshot: snapshot,
          kpSnapshotsByOfferId:
            state.activeOfferId != null
              ? {
                  ...state.kpSnapshotsByOfferId,
                  [String(state.activeOfferId)]: snapshot,
                }
              : state.kpSnapshotsByOfferId,
        })),

      /** Установить активную конструкцию для выбора в прайсе. */
      setActiveConstructionId: (keyId) =>
        set({ activeConstructionId: keyId ?? null }),

      /** Получить плоский список артикулов для конкретной конструкции. */
      getSelectedArticlesForConstruction: (keyId) => {
        const state = get();
        return state.selectedPriceArticlesByKeyId[keyId] ?? [];
      },

      /** Установить список артикулов для конкретной конструкции (для восстановления из materialRows). */
      setSelectedArticlesForConstruction: (keyId, articles) => {
        if (!keyId) return;
        set((state) => ({
          selectedPriceArticlesByKeyId: {
            ...state.selectedPriceArticlesByKeyId,
            [keyId]: Array.isArray(articles) ? articles : [],
          },
        }));
      },

      /** Сбросить артикулы для конкретной конструкции (при закрытии блока). */
      clearSelectedArticlesForConstruction: (keyId) => {
        if (!keyId) return;
        set((state) => {
          const next = { ...state.selectedPriceArticlesByKeyId };
          delete next[keyId];
          return { selectedPriceArticlesByKeyId: next };
        });
      },

      togglePriceArticleForConstruction: (keyId, article) => {
        const key = String(article ?? "").trim();
        if (!key || !keyId) return;
        set((state) => {
          const arr = state.selectedPriceArticlesByKeyId[keyId] ?? [];
          const setArticles = new Set(arr);
          if (setArticles.has(key)) setArticles.delete(key);
          else setArticles.add(key);
          return {
            selectedPriceArticlesByKeyId: {
              ...state.selectedPriceArticlesByKeyId,
              [keyId]: [...setArticles],
            },
          };
        });
      },

      /** Обратная совместимость: плоский список артикулов активной конструкции. */
      setSelectedPriceArticles: (articles) => {
        const keyId = get().activeConstructionId;
        if (!keyId) return;
        set((state) => ({
          selectedPriceArticlesByKeyId: {
            ...state.selectedPriceArticlesByKeyId,
            [keyId]: Array.isArray(articles) ? articles : [],
          },
        }));
      },

      /** Обратная совместимость: toggle для активной конструкции. */
      togglePriceArticle: (article) => {
        const key = String(article ?? "").trim();
        if (!key) return;
        const keyId = get().activeConstructionId;
        if (!keyId) return;
        set((state) => {
          const arr = state.selectedPriceArticlesByKeyId[keyId] ?? [];
          const setArticles = new Set(arr);
          if (setArticles.has(key)) setArticles.delete(key);
          else setArticles.add(key);
          return {
            selectedPriceArticlesByKeyId: {
              ...state.selectedPriceArticlesByKeyId,
              [keyId]: [...setArticles],
            },
          };
        });
      },

      updateKpSnapshotMaterialRowsForConstruction: (keyId, rows) =>
        set((state) => {
          const prev = state.kpSnapshot ?? {};
          const prevByKeyId = prev.materialRowsByKeyId ?? {};
          const nextSnapshot = {
            ...prev,
            materialRowsByKeyId: {
              ...prevByKeyId,
              [keyId]: rows,
            },
          };
          const activeKey = state.activeOfferId != null ? String(state.activeOfferId) : null;
          return {
            kpSnapshot: nextSnapshot,
            kpSnapshotsByOfferId:
              activeKey != null
                ? {
                    ...state.kpSnapshotsByOfferId,
                    [activeKey]: nextSnapshot,
                  }
                : state.kpSnapshotsByOfferId,
          };
        }),

      /** Обратная совместимость — обновить materialRows как единый список (не используется в новом коде). */
      updateKpSnapshotMaterialRows: (materialRows) =>
        set((state) => {
          const nextSnapshot = state.kpSnapshot
            ? { ...state.kpSnapshot, materialRows }
            : { materialRows };
          const activeKey = state.activeOfferId != null ? String(state.activeOfferId) : null;
          return {
            kpSnapshot: nextSnapshot,
            kpSnapshotsByOfferId:
              activeKey != null
                ? {
                    ...state.kpSnapshotsByOfferId,
                    [activeKey]: nextSnapshot,
                  }
                : state.kpSnapshotsByOfferId,
          };
        }),

      clearSession: () => set(initialState),

      markDraftSaved: () => set({ hasUnsavedChanges: false }),

      markDraftDirty: () =>
        set((state) =>
          state.hasUnsavedChanges ? state : { hasUnsavedChanges: true }
        ),

      /** Кнопка «Выйти» на KpPage — разрешить переход в список без PATCH. */
      requestExitToList: () => set({ allowExitToList: true }),

      markNewDraftOffer: (offerId) => {
        if (offerId == null) return;
        set((state) => ({
          newDraftOfferIds: {
            ...state.newDraftOfferIds,
            [String(offerId)]: true,
          },
        }));
      },

      clearNewDraftOfferFlag: (offerId) => {
        if (offerId == null) return;
        set((state) => {
          const next = { ...state.newDraftOfferIds };
          delete next[String(offerId)];
          return { newDraftOfferIds: next };
        });
      },

      isNewDraftOffer: (offerId) => {
        if (offerId == null) return false;
        return Boolean(get().newDraftOfferIds[String(offerId)]);
      },

      /**
       * «Выйти» в список: сбросить калькулятор, завершить режим черновика.
       * kpSnapshot и activeOfferId сохраняются — при повторном открытии КП подтянутся.
       */
      leaveToOfferList: () => {
        useCalculatorStore.getState().reset();
        set((state) => ({
          ...state,
          isDraft: false,
          hasUnsavedChanges: false,
          allowExitToList: true,
          selectedPriceArticlesByKeyId: {},
          activeConstructionId: null,
        }));
      },

      consumeExitToList: () =>
        set((state) =>
          state.allowExitToList ? { allowExitToList: false } : state
        ),

      /** PDF только если нет несохранённых правок этого оффера. */
      isOfferPdfExportBlocked: (offerId) => {
        const { hasUnsavedChanges, activeOfferId } = get();
        if (!hasUnsavedChanges || activeOfferId == null || offerId == null) {
          return false;
        }
        return String(activeOfferId) === String(offerId);
      },

      isPathAllowedDuringDraft: (pathname) => {
        const { activeOfferId, isDraft } = get();
        if (!isDraft || !activeOfferId) return true;
        const base = (pathname || "").split("?")[0];
        if (base === "/calc" || base.startsWith("/calc/")) return true;
        if (base === "/price") return true;
        if (base === "/info" || base.startsWith("/info/")) return true;
        if (base === "/profile") return true;
        if (base === "/admin" || base.startsWith("/admin/")) return true;
        if (base === `/kp/${activeOfferId}`) return true;
        return false;
      },
    }),
    {
      name: "ag_offer_edit_session_v1",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        activeOfferId: state.activeOfferId,
        isDraft: state.isDraft,
        hasUnsavedChanges: state.hasUnsavedChanges,
        kpSnapshot: state.kpSnapshot,
        kpSnapshotsByOfferId: state.kpSnapshotsByOfferId,
        selectedPriceArticlesByKeyId: state.selectedPriceArticlesByKeyId,
        activeConstructionId: state.activeConstructionId,
        newDraftOfferIds: state.newDraftOfferIds,
      }),
    }
  )
);

export function useOfferEditSession() {
  const activeOfferId = useOfferEditSessionStore((s) => s.activeOfferId);
  const isDraft = useOfferEditSessionStore((s) => s.isDraft);
  const hasUnsavedChanges = useOfferEditSessionStore((s) => s.hasUnsavedChanges);
  const kpSnapshot = useOfferEditSessionStore((s) => s.kpSnapshot);
  const kpSnapshotsByOfferId = useOfferEditSessionStore(
    (s) => s.kpSnapshotsByOfferId
  );
  const selectedPriceArticlesByKeyId = useOfferEditSessionStore(
    (s) => s.selectedPriceArticlesByKeyId
  );
  const activeConstructionId = useOfferEditSessionStore((s) => s.activeConstructionId);
  const startDraft = useOfferEditSessionStore((s) => s.startDraft);
  const stashKpSnapshot = useOfferEditSessionStore((s) => s.stashKpSnapshot);
  const clearKpSnapshot = useOfferEditSessionStore((s) => s.clearKpSnapshot);
  const clearSession = useOfferEditSessionStore((s) => s.clearSession);
  const markDraftSaved = useOfferEditSessionStore((s) => s.markDraftSaved);
  const markDraftDirty = useOfferEditSessionStore((s) => s.markDraftDirty);
  const requestExitToList = useOfferEditSessionStore((s) => s.requestExitToList);
  const consumeExitToList = useOfferEditSessionStore((s) => s.consumeExitToList);
  const togglePriceArticle = useOfferEditSessionStore((s) => s.togglePriceArticle);
  const setSelectedPriceArticles = useOfferEditSessionStore(
    (s) => s.setSelectedPriceArticles
  );
  const setActiveConstructionId = useOfferEditSessionStore((s) => s.setActiveConstructionId);
  const setSelectedArticlesForConstruction = useOfferEditSessionStore(
    (s) => s.setSelectedArticlesForConstruction
  );
  const clearSelectedArticlesForConstruction = useOfferEditSessionStore(
    (s) => s.clearSelectedArticlesForConstruction
  );
  const togglePriceArticleForConstruction = useOfferEditSessionStore(
    (s) => s.togglePriceArticleForConstruction
  );
  const updateKpSnapshotMaterialRows = useOfferEditSessionStore(
    (s) => s.updateKpSnapshotMaterialRows
  );
  const updateKpSnapshotMaterialRowsForConstruction = useOfferEditSessionStore(
    (s) => s.updateKpSnapshotMaterialRowsForConstruction
  );
  const isPathAllowedDuringDraft = useOfferEditSessionStore(
    (s) => s.isPathAllowedDuringDraft
  );
  const isOfferPdfExportBlocked = useOfferEditSessionStore(
    (s) => s.isOfferPdfExportBlocked
  );
  const markNewDraftOffer = useOfferEditSessionStore((s) => s.markNewDraftOffer);
  const clearNewDraftOfferFlag = useOfferEditSessionStore(
    (s) => s.clearNewDraftOfferFlag
  );
  const isNewDraftOffer = useOfferEditSessionStore((s) => s.isNewDraftOffer);

  const isEditingDraft = isDraft && Boolean(activeOfferId);
  const hasSnapshotForActiveOffer =
    Boolean(activeOfferId) && Boolean(kpSnapshotsByOfferId[String(activeOfferId)]);
  const hasUnsavedKpEdits =
    isEditingDraft && (hasUnsavedChanges || Boolean(kpSnapshot) || hasSnapshotForActiveOffer);

  /** Плоский список артикулов активной конструкции (для PricePage). */
  const selectedPriceArticles = activeConstructionId
    ? (selectedPriceArticlesByKeyId[activeConstructionId] ?? [])
    : [];

  return {
    activeOfferId,
    isDraft,
    hasUnsavedChanges,
    hasUnsavedKpEdits,
    isEditingDraft,
    kpSnapshot,
    selectedPriceArticles,
    selectedPriceArticlesByKeyId,
    activeConstructionId,
    startDraft,
    stashKpSnapshot,
    clearKpSnapshot,
    clearSession,
    markDraftSaved,
    markDraftDirty,
    requestExitToList,
    consumeExitToList,
    togglePriceArticle,
    setSelectedPriceArticles,
    setActiveConstructionId,
    setSelectedArticlesForConstruction,
    clearSelectedArticlesForConstruction,
    togglePriceArticleForConstruction,
    updateKpSnapshotMaterialRows,
    updateKpSnapshotMaterialRowsForConstruction,
    isPathAllowedDuringDraft,
    isOfferPdfExportBlocked,
    markNewDraftOffer,
    clearNewDraftOfferFlag,
    isNewDraftOffer,
  };
}
