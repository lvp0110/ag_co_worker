import { useCallback } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { syncConstructionsTitlesFromItems } from "../utils/itemsCatalog.js";

/**
 * Глобальный стор калькулятора. Сохраняется в sessionStorage — состояние
 * живёт до закрытия вкладки, но переживает переходы между /calc, /kp/:id,
 * /kp/list и т.д. При открытии в новой вкладке — чистый стейт.
 *
 * Хранятся только поля, которые имеет смысл переживать навигацию:
 *   - накопленные конструкции (ConstrToCalc, ConstrToCalcToSent, materialsByConstruction);
 *   - табличное состояние (tableConstrToCalc);
 *   - регион цен (calcRegion);
 *   - выбор пользователя в UI (currentSubCategory/Items, openedSubCategories,
 *     template, currentConstr, unvisible).
 *
 * Эфемерные вещи (текущая форма нового элемента `constR`/`constrSent`/`opening`,
 * лоадеры, модалки) остаются useState в компоненте.
 */

const initialState = {
  unvisible: false,
  tableConstrToCalc: null,
  currentSubCategory: 0,
  currentItems: 0,
  openedSubCategories: { F: null, C: null, L: null, W: null },
  template: null,
  currentConstr: "",
  ConstrToCalcToSent: [],
  ConstrToCalc: [],
  materialsByConstruction: [],
  /** Код региона цен для POST .../by-construction/{regionCode}. */
  calcRegion: "",
  /** Id открытого КП (`/kp/:id`); кнопка «К КП» в калькуляторе. */
  activeKpId: null,
};

export const useCalculatorStore = create(
  persist(
    (set) => ({
      ...initialState,

      /** Раскрыт ли селект региона на /calc. Не в initialState — не пишется в sessionStorage. */
      regionFilterOpen: false,
      toggleRegionFilterOpen: () =>
        set((state) => ({ regionFilterOpen: !state.regionFilterOpen })),
      setRegionFilterOpen: (open) => set({ regionFilterOpen: Boolean(open) }),

      /** Универсальный setter: принимает значение или (prev) => next — как useState. */
      setField: (key, v) =>
        set((state) => ({
          [key]: typeof v === "function" ? v(state[key]) : v,
        })),

      /** Полный сброс (закрытие КП / после создания). Регион цен оставляем. */
      reset: () =>
        set((state) => ({ ...initialState, calcRegion: state.calcRegion })),

      /**
       * Подстановка состава КП в калькулятор.
       * Если есть конструкции — таблица всегда открыта (tableConstrToCalc ≠ null).
       */
      loadKpEditState: ({
        constrToCalc,
        constrToCalcToSent,
        materialsByConstruction,
        tableConstrToCalc,
        activeKpId,
      }) =>
        set((state) => {
          const sent = constrToCalcToSent ?? [];
          const ConstrToCalc = syncConstructionsTitlesFromItems(
            constrToCalc ?? [],
            sent,
          );
          const hasConstr = ConstrToCalc.length > 0;
          let table = tableConstrToCalc;
          if (hasConstr && (table == null || table === undefined)) {
            table = {};
          }
          if (!hasConstr) {
            table = null;
          }
          return {
            ...state,
            ConstrToCalc,
            ConstrToCalcToSent: sent,
            materialsByConstruction: materialsByConstruction ?? [],
            tableConstrToCalc: table,
            ...(activeKpId !== undefined
              ? { activeKpId: activeKpId ? String(activeKpId) : null }
              : {}),
          };
        }),
    }),
    {
      name: "ag_co_worker_calc_store_v1",
      storage: createJSONStorage(() => sessionStorage),
      // не пишем в storage функции и initial-only поля
      partialize: (state) =>
        Object.fromEntries(
          Object.keys(initialState).map((k) => [k, state[k]])
        ),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state?.ConstrToCalc?.length) return;
        const synced = syncConstructionsTitlesFromItems(
          state.ConstrToCalc,
          state.ConstrToCalcToSent ?? [],
        );
        state.ConstrToCalc = synced;
      },
    }
  )
);

/**
 * Хук в стиле useState для поля стора — drop-in замена:
 *   const [unvisible, setUnvisible] = useCalcField("unvisible");
 *
 * Подписка только на одно поле — изменение других ключей не ре-рендерит компонент.
 */
export function useCalcField(key) {
  const value = useCalculatorStore((state) => state[key]);
  const setValue = useCallback(
    (v) => useCalculatorStore.getState().setField(key, v),
    [key]
  );
  return [value, setValue];
}
